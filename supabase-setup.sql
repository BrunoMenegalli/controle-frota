-- BM Sistemas — Controle de Frota (Setup do Supabase)
-- Já aplicado no projeto bm-sistemas (qpusgufqswkdlscmwsyl).
-- Recriar só em um projeto novo; não contém senhas nem service_role.

-- 1. Tabelas (JSONB + updated_at para sync last-write-wins)
create table if not exists public.frota_maquinas (
  id text primary key,
  dados jsonb not null,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  deleted_at bigint
);

create table if not exists public.frota_revisoes (
  id text primary key,
  maquina_id text not null,
  dados jsonb not null,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  deleted_at bigint
);

create index if not exists idx_frota_rev_maq on public.frota_revisoes (maquina_id);
create index if not exists idx_frota_rev_upd on public.frota_revisoes (updated_at);
create index if not exists idx_frota_maq_upd on public.frota_maquinas (updated_at);

create table if not exists public.frota_meta (
  k text primary key,
  v jsonb not null,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create sequence if not exists public.os_numero_seq start 1;
grant usage, select, update on sequence public.os_numero_seq to authenticated;

-- 2. Lista de quem pode ver/editar a frota (e-mails com login no Auth)
create table if not exists public.frota_membros (
  email text primary key,
  created_at timestamptz not null default now()
);
alter table public.frota_membros enable row level security;
drop policy if exists "membros select self" on public.frota_membros;
create policy "membros select self" on public.frota_membros
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt()->>'email','')));

insert into public.frota_membros (email)
values ('bruno_menegalli@hotmail.com')
on conflict (email) do nothing;

create or replace function public.is_frota_membro()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.frota_membros
    where lower(email) = lower(coalesce(auth.jwt()->>'email',''))
  );
$$;
revoke all on function public.is_frota_membro() from public, anon;
grant execute on function public.is_frota_membro() to authenticated;

create or replace function public.next_os_numero(min_val integer default 0)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  cur bigint;
  lv bigint;
  called boolean;
  nxt bigint;
begin
  if auth.role() <> 'authenticated' or not public.is_frota_membro() then
    raise exception 'not authorized';
  end if;
  select coalesce((v #>> '{}')::bigint, 0) into cur from public.frota_meta where k = 'osSeq';
  cur := greatest(coalesce(cur, 0), coalesce(min_val, 0));
  select last_value, is_called into lv, called from public.os_numero_seq;
  if cur > 0 and (not called or cur > lv) then
    perform setval('public.os_numero_seq', cur, true);
  end if;
  nxt := nextval('public.os_numero_seq');
  insert into public.frota_meta (k, v, updated_at)
  values ('osSeq', to_jsonb(nxt), (extract(epoch from now()) * 1000)::bigint)
  on conflict (k) do update
    set v = to_jsonb(greatest(((public.frota_meta.v) #>> '{}')::bigint, nxt)),
        updated_at = excluded.updated_at;
  return nxt::integer;
end;
$$;
revoke all on function public.next_os_numero(integer) from public, anon;
grant execute on function public.next_os_numero(integer) to authenticated;

-- 3. RLS: só membros autenticados da equipe
alter table public.frota_maquinas enable row level security;
alter table public.frota_revisoes enable row level security;
alter table public.frota_meta enable row level security;

drop policy if exists "auth all maquinas" on public.frota_maquinas;
create policy "auth all maquinas" on public.frota_maquinas
  for all to authenticated using (public.is_frota_membro()) with check (public.is_frota_membro());

drop policy if exists "auth all revisoes" on public.frota_revisoes;
create policy "auth all revisoes" on public.frota_revisoes
  for all to authenticated using (public.is_frota_membro()) with check (public.is_frota_membro());

drop policy if exists "auth all meta" on public.frota_meta;
create policy "auth all meta" on public.frota_meta
  for all to authenticated using (public.is_frota_membro()) with check (public.is_frota_membro());

-- 4. Realtime
do $$
begin
  alter publication supabase_realtime add table public.frota_maquinas;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.frota_revisoes;
exception when duplicate_object then null;
end $$;

-- 5. Storage privado
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('frota-media', 'frota-media', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "frota media select" on storage.objects;
create policy "frota media select" on storage.objects
  for select to authenticated using (bucket_id = 'frota-media' and public.is_frota_membro());

drop policy if exists "frota media insert" on storage.objects;
create policy "frota media insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'frota-media' and public.is_frota_membro());

drop policy if exists "frota media update" on storage.objects;
create policy "frota media update" on storage.objects
  for update to authenticated using (bucket_id = 'frota-media' and public.is_frota_membro())
  with check (bucket_id = 'frota-media' and public.is_frota_membro());

drop policy if exists "frota media delete" on storage.objects;
create policy "frota media delete" on storage.objects
  for delete to authenticated using (bucket_id = 'frota-media' and public.is_frota_membro());

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


-- 6. Aparelhos conectados (lista no app; last_seen atualizado ao abrir/sincronizar)
create table if not exists public.frota_dispositivos (
  device_id text primary key,
  email text not null,
  nome text not null,
  apelido text,
  user_agent text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists idx_frota_disp_seen on public.frota_dispositivos (last_seen desc);
create index if not exists idx_frota_disp_email on public.frota_dispositivos (email);
alter table public.frota_dispositivos enable row level security;
drop policy if exists "membros all dispositivos" on public.frota_dispositivos;
create policy "membros all dispositivos" on public.frota_dispositivos
  for all to authenticated using (public.is_frota_membro()) with check (public.is_frota_membro());
grant select, insert, update, delete on table public.frota_dispositivos to authenticated;


-- =============================================================================
-- 7. Papéis, acessos, valores e PIN (v2.2)
-- Documentação do que já está aplicado no projeto. Não contém senhas nem o PIN.
-- =============================================================================

-- frota_membros: email (pk), nome, role ('admin'|'membro'), ativo
-- Bruno (bruno_menegalli@hotmail.com) é o administrador ativo.
-- is_frota_membro() exige ativo=true. is_frota_admin() exige role=admin e ativo=true.
-- Apenas administradores ativos selecionam todos os membros.

-- frota_financeiro: revisao_id (pk), custo, mao_obra, total_pecas, pecas, notas, updated_at
-- RLS ligado, sem políticas; grants revogados de anon/authenticated.
-- Leitura só via frota_financeiro_lido(token) depois do PIN. Valores NÃO ficam em frota_revisoes.dados.
-- Trigger BEFORE INSERT/UPDATE frota_revisoes_split_financeiro (SECURITY DEFINER):
--   sempre remove custo/maoObra/totalPecas/notas e preços de peças de dados;
--   marca temNotas se havia nota fiscal;
--   grava em frota_financeiro só se o autor é admin e a carga tem valores de fato
--   (frota_fin_tem_valores), para um salvamento "travado" não apagar custos.
-- Trigger AFTER DELETE frota_financeiro_cascade_del remove a linha financeira.

-- Bucket frota-media: caminhos nf/ e financeiro/ são somente admin (SELECT/INSERT/UPDATE/DELETE).
-- Demais caminhos: membros ativos leem; upload conforme políticas de membro.

-- PIN do administrador (somente Bruno):
--   frota_pin (id=1, pin_hash bcrypt, fail_count, locked_until) e frota_pin_unlock
--   (token, email, expires_at ~10 min). RLS ligado, SEM políticas: acesso só via RPC.
--   O PIN inicial foi gravado só como hash (nunca em texto neste repositório).
--   RPCs (SECURITY DEFINER, execute só para authenticated, chamador precisa ser admin ativo):
--     frota_pin_status()
--     frota_pin_definir(pin_atual, pin_novo) -- 4 a 6 dígitos; exige PIN atual
--     frota_desbloquear_valores(pin) -- 5 erros = bloqueio de 5 min; devolve token de 10 min
--     frota_financeiro_lido(unlock_token) -- devolve custos só com token válido
--   Extensão pgcrypto (schema extensions).

-- Edge Function gerenciar-acesso (verify_jwt=true). service_role só no servidor.
-- Ações: listar, liberar (convite por e-mail se o usuário ainda não existir;
-- redirect_to do app), bloquear, desbloquear. Não deixa bloquear o último admin.
-- Ao bloquear: ativo=false (RLS barra na hora) e ban/signOut se o usuário Auth existir.

-- Cadastro público e Site URL do Auth não podem ser alterados pelas ferramentas
-- disponíveis; ajustar no painel do Supabase se ainda estiver pendente.

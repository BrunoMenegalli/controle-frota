import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL = "https://brunomenegalli.github.io/controle-frota/";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const authHeader = req.headers.get("Authorization") || "";
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user?.email) return json({ ok: false, error: "not_authenticated" }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = userData.user.email.toLowerCase();
  const { data: me } = await admin.from("frota_membros").select("email,role,ativo,nome").ilike("email", email).maybeSingle();
  if (!me || me.role !== "admin" || me.ativo !== true) return json({ ok: false, error: "not_admin" }, 403);

  let body: { acao?: string; email?: string; nome?: string; role?: string } = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }); }
  const acao = body.acao;
  const alvo = String(body.email || "").trim().toLowerCase();

  if (acao === "listar") {
    const { data: membros, error } = await admin.from("frota_membros").select("email,nome,role,ativo").order("nome", { ascending: true });
    if (error) return json({ ok: false, error: error.message }, 500);
    const { data: devices } = await admin.from("frota_dispositivos").select("email,last_seen");
    const last: Record<string, string> = {};
    for (const d of devices || []) {
      const k = String(d.email || "").toLowerCase();
      if (!k) continue;
      if (!last[k] || d.last_seen > last[k]) last[k] = d.last_seen;
    }
    return json({ ok: true, membros: (membros || []).map((m) => ({ ...m, last_seen: last[String(m.email).toLowerCase()] || null })) });
  }

  if (acao === "liberar") {
    if (!alvo || !alvo.includes("@")) return json({ ok: false, error: "email_invalido" });
    const nome = String(body.nome || "").trim() || alvo;
    const role = body.role === "admin" ? "admin" : "membro";
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const found = (existing?.users || []).find((u) => (u.email || "").toLowerCase() === alvo);
    let convite = false;
    if (!found) {
      const { error: invErr } = await admin.auth.admin.inviteUserByEmail(alvo, {
        data: { nome },
        redirectTo: APP_URL,
      });
      if (invErr) return json({ ok: false, error: invErr.message });
      convite = true;
    }
    const { error: upErr } = await admin.from("frota_membros").upsert({ email: alvo, nome, role, ativo: true });
    if (upErr) return json({ ok: false, error: upErr.message }, 500);
    return json({ ok: true, convite });
  }

  if (acao === "bloquear" || acao === "desbloquear") {
    if (!alvo) return json({ ok: false, error: "email_invalido" });
    const { data: alvoRow } = await admin.from("frota_membros").select("email,role,ativo").ilike("email", alvo).maybeSingle();
    if (!alvoRow) return json({ ok: false, error: "nao_encontrado" });
    if (acao === "bloquear" && alvoRow.role === "admin") {
      const { data: admins } = await admin.from("frota_membros").select("email").eq("role", "admin").eq("ativo", true);
      if ((admins || []).length <= 1) return json({ ok: false, error: "ultimo_admin" });
    }
    const ativo = acao === "desbloquear";
    const { error: upErr } = await admin.from("frota_membros").update({ ativo }).ilike("email", alvo);
    if (upErr) return json({ ok: false, error: upErr.message }, 500);
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const user = (users?.users || []).find((u) => (u.email || "").toLowerCase() === alvo);
    if (user) {
      if (acao === "bloquear") {
        await admin.auth.admin.updateUserById(user.id, { ban_duration: "876000h" });
        try { await admin.auth.admin.signOut(user.id, "global"); } catch (_) { /* older API */ }
      } else {
        await admin.auth.admin.updateUserById(user.id, { ban_duration: "none" });
      }
    }
    return json({ ok: true, ativo });
  }

  return json({ ok: false, error: "acao_invalida" });
});

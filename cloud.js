'use strict';
/* BM Sistemas — Sincronização em nuvem (Supabase Auth + Postgres + Storage + Realtime)
 * Ativada apenas quando window.CLOUD_CONFIG.enabled === true e url/anonKey estão preenchidos.
 * IndexedDB continua sendo o cache offline principal. */
window.Cloud = (() => {
  const cfg = () => window.CLOUD_CONFIG || {};
  const isEnabled = () => !!(cfg().enabled && cfg().url && cfg().anonKey && window.supabase);

  let sb = null, session = null, api = null;
  let status = { state: 'off', text: '', lastAt: 0 };
  let syncLock = null, syncTimer = null, rtChannel = null;
  const mediaUrls = new Map();
  const mediaPending = new Map();

  function setStatus(state, text) {
    status = { ...status, state, text };
    api?.onStatus?.(status);
  }

  function mediaPathFromRef(ref) {
    return typeof ref === 'string' && ref.startsWith('storage:') ? ref.slice(8) : null;
  }

  function placeholderSvg() {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="100%" height="100%" fill="#e5e7eb"/></svg>');
  }

  function mediaUrl(ref) {
    if (!ref) return '';
    if (typeof ref !== 'string') {
      if (!mediaUrls.has(ref)) mediaUrls.set(ref, URL.createObjectURL(ref));
      return mediaUrls.get(ref);
    }
    if (!ref.startsWith('storage:')) return ref;
    if (mediaUrls.has(ref)) return mediaUrls.get(ref);
    loadMedia(ref);
    return placeholderSvg();
  }

  async function ensureMediaBlob(ref) {
    if (!ref) return null;
    if (typeof ref !== 'string') return ref;
    if (!ref.startsWith('storage:')) return null;
    if (!api) return null;
    try {
      const cached = await api.getOne('media', ref);
      if (cached && cached.blob) {
        if (!mediaUrls.has(ref)) mediaUrls.set(ref, URL.createObjectURL(cached.blob));
        return cached.blob;
      }
    } catch (_) {}
    if (!sb || !session || !navigator.onLine) return null;
    if (mediaPending.has(ref)) return mediaPending.get(ref);
    const p = (async () => {
      try {
        const path = mediaPathFromRef(ref);
        const { data, error } = await sb.storage.from(cfg().bucket || 'frota-media').download(path);
        if (error || !data) return null;
        await api.put('media', { path: ref, blob: data, updatedAt: Date.now() });
        const url = URL.createObjectURL(data);
        mediaUrls.set(ref, url);
        document.querySelectorAll('img[data-media]').forEach((img) => {
          if (img.dataset.media === ref) img.src = url;
        });
        return data;
      } catch (_) {
        return null;
      } finally {
        mediaPending.delete(ref);
      }
    })();
    mediaPending.set(ref, p);
    return p;
  }

  function loadMedia(ref) {
    ensureMediaBlob(ref).then((b) => {
      if (!b) return;
      const url = mediaUrls.get(ref);
      if (!url) return;
      document.querySelectorAll('img[data-media]').forEach((img) => {
        if (img.dataset.media === ref) img.src = url;
      });
    });
  }

  async function cacheMediaBlob(ref, blob) {
    if (!ref || !blob || !api) return;
    await api.put('media', { path: ref, blob, updatedAt: Date.now() });
    if (!mediaUrls.has(ref)) mediaUrls.set(ref, URL.createObjectURL(blob));
  }

  async function uploadBlob(blob, path) {
    const { error } = await sb.storage.from(cfg().bucket || 'frota-media').upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: true,
    });
    if (error) throw error;
    const ref = 'storage:' + path;
    await cacheMediaBlob(ref, blob);
    return ref;
  }

  async function uploadRecordMedia(store, rec) {
    const out = { ...rec };
    let changed = false;
    const stamp = Date.now().toString(36);
    if (store === 'maquinas') {
      if (out.foto && typeof out.foto !== 'string') {
        const ext = (out.foto.type || '').includes('png') ? 'png' : 'jpg';
        out.foto = await uploadBlob(out.foto, `maq/${out.id}-${stamp}.${ext}`);
        changed = true;
      }
    } else if (store === 'revisoes') {
      if (out.fotoMedidor && typeof out.fotoMedidor !== 'string') {
        out.fotoMedidor = await uploadBlob(out.fotoMedidor, `rev/${out.id}/med-${stamp}.jpg`);
        changed = true;
      }
      if (Array.isArray(out.fotosMaquina)) {
        const arr = [];
        for (let i = 0; i < out.fotosMaquina.length; i++) {
          const v = out.fotosMaquina[i];
          if (v && typeof v !== 'string') {
            arr.push(await uploadBlob(v, `rev/${out.id}/maq-${i}-${stamp}.jpg`));
            changed = true;
          } else if (v) arr.push(v);
        }
        out.fotosMaquina = arr;
      }
      for (const [k, nm] of [['assinaturaMec', 'sig-mec'], ['assinaturaResp', 'sig-resp']]) {
        if (out[k] && typeof out[k] !== 'string') {
          const ext = (out[k].type || '').includes('jpeg') ? 'jpg' : 'png';
          out[k] = await uploadBlob(out[k], `rev/${out.id}/${nm}-${stamp}.${ext}`);
          changed = true;
        }
      }
      if (Array.isArray(out.notasFiscais)) {
        const arr = [];
        for (let i = 0; i < out.notasFiscais.length; i++) {
          const v = out.notasFiscais[i];
          if (v && typeof v !== 'string') {
            arr.push(await uploadBlob(v, `nf/${out.id}/nf-${i}-${stamp}.jpg`));
            changed = true;
          } else if (v) arr.push(v);
        }
        out.notasFiscais = arr;
      }
    }
    return { rec: out, changed };
  }

  function extractFinance(rec) {
    if (!rec) return null;
    const pecas = Array.isArray(rec.pecas) ? rec.pecas : null;
    const has = rec.custo != null || rec.maoObra != null || rec.totalPecas != null
      || (Array.isArray(rec.notasFiscais) && rec.notasFiscais.length)
      || (pecas && pecas.some((p) => p && (p.unit != null || p.valor != null || p.preco != null)));
    if (!has) return null;
    return { custo: rec.custo, maoObra: rec.maoObra, totalPecas: rec.totalPecas, pecas: rec.pecas, notasFiscais: rec.notasFiscais };
  }
  function stripFinanceObj(rec) {
    if (!rec) return rec;
    const o = { ...rec };
    delete o.custo; delete o.maoObra; delete o.totalPecas; delete o.notasFiscais; delete o.notas;
    if (Array.isArray(o.pecas)) {
      o.pecas = o.pecas.map((p) => {
        if (!p || typeof p !== 'object') return p;
        const y = { ...p };
        delete y.unit; delete y.valor; delete y.preco; delete y.total; delete y.custo;
        return y;
      });
    }
    return o;
  }
  async function enqueue(store, id, op, at, extra) {
    if (!isEnabled() || !api) return;
    const row = { key: `${store}:${id}`, store, id, op, at: at || Date.now() };
    const prev = await api.getOne('pending', row.key);
    if (extra && extra.finance) row.finance = extra.finance;
    else if (prev && prev.finance) row.finance = prev.finance;
    await api.put('pending', row);
    scheduleSync(350);
  }
  async function stripLocalFinance() {
    if (!api) return;
    const revs = await api.getAll('revisoes');
    for (const r of revs) {
      const fin = extractFinance(r);
      if (!fin) continue;
      const key = `revisoes:${r.id}`;
      const pending = await api.getOne('pending', key);
      const row = pending || { key, store: 'revisoes', id: r.id, op: 'put', at: r.atualizadoEm || r.criadoEm || Date.now() };
      if (isAdmin()) row.finance = fin;
      await api.put('pending', row);
      await api.put('revisoes', stripFinanceObj(r));
    }
  }

  function scheduleSync(ms = 800) {
    if (!isEnabled() || !session) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(), ms);
  }

  function hasCustomizedMachine(m) {
    if (!m) return false;
    if ((m.atualizadoEm || 0) > 0) return true;
    if (!m.padrao) return true;
    if (m.foto && typeof m.foto !== 'string') return true;
    if (typeof m.foto === 'string' && m.foto.startsWith('storage:')) return true;
    const def = (typeof DEFAULT_MACHINES !== 'undefined' ? DEFAULT_MACHINES : []).find((x) => x.id === m.id);
    if (def) {
      if ((m.ano || '') !== (def.ano || '')) return true;
      if ((m.serie || '') || (m.placa || '') || (m.chassi || '') || m.leituraAtual != null) return true;
    } else if (m.ano || m.serie || m.placa || m.chassi || m.leituraAtual != null) return true;
    return (m.docs || []).some((d) => d.vence || d.prox != null || d.override);
  }

  async function prepareFirstMigration() {
    const done = await api.getOne('meta', 'cloudMigrated');
    if (done?.v) return;
    const [maqs, revs, osSeqMeta] = await Promise.all([
      api.getAll('maquinas'),
      api.getAll('revisoes'),
      api.getOne('meta', 'osSeq'),
    ]);
    for (const r of revs) {
      const k = `revisoes:${r.id}`;
      if (!(await api.getOne('pending', k))) {
        await api.put('pending', { key: k, store: 'revisoes', id: r.id, op: 'put', at: r.atualizadoEm || r.criadoEm || Date.now() });
      }
    }
    for (const m of maqs) {
      if (!hasCustomizedMachine(m)) continue;
      const k = `maquinas:${m.id}`;
      if (!(await api.getOne('pending', k))) {
        await api.put('pending', { key: k, store: 'maquinas', id: m.id, op: 'put', at: m.atualizadoEm || Date.now() });
      }
    }
    if ((osSeqMeta?.v || 0) > 0) {
      await api.put('pending', { key: 'meta:osSeq', store: 'meta', id: 'osSeq', op: 'put', at: Date.now() });
    }
  }

  async function syncNow() {
    if (!isEnabled() || !api) return;
    if (!session) { setStatus('auth', 'Entrar'); return; }
    if (!navigator.onLine) { setStatus('offline', 'Offline'); return; }
    if (syncLock) return syncLock;

    syncLock = (async () => {
      setStatus('syncing', 'Sincronizando…');
      try {
        await prepareFirstMigration();
        await stripLocalFinance();

        // 1. Push local pending ops
        const pend = (await api.getAll('pending')).sort((a, b) => (a.at || 0) - (b.at || 0));
        for (const op of pend) {
          if (op.store === 'meta' && op.id === 'osSeq') {
            const lm = (await api.getOne('meta', 'osSeq'))?.v || 0;
            const { data: rm } = await sb.from('frota_meta').select('v').eq('k', 'osSeq').maybeSingle();
            const mx = Math.max(Number(lm) || 0, Number(rm?.v) || 0);
            const { error } = await sb.from('frota_meta').upsert({ k: 'osSeq', v: mx, updated_at: Date.now() });
            if (error) throw error;
            await api.del('pending', op.key);
            continue;
          }
          const table = op.store === 'maquinas' ? 'frota_maquinas' : 'frota_revisoes';
          if (op.op === 'del') {
            const { error } = await sb.from(table).update({ deleted_at: op.at, updated_at: op.at }).eq('id', op.id);
            if (error) throw error;
            await api.del('pending', op.key);
          } else {
            const cur = await api.getOne(op.store, op.id);
            if (!cur) { await api.del('pending', op.key); continue; }
            let merged = cur;
            if (op.store === 'revisoes' && op.finance && isAdmin()) {
              merged = {
                ...cur,
                custo: op.finance.custo,
                maoObra: op.finance.maoObra,
                totalPecas: op.finance.totalPecas,
                pecas: op.finance.pecas || cur.pecas,
                notasFiscais: op.finance.notasFiscais || cur.notasFiscais,
              };
            }
            const { rec, changed } = await uploadRecordMedia(op.store, merged);
            rec.atualizadoEm = rec.atualizadoEm || op.at || Date.now();
            if (changed) await api.put(op.store, op.store === 'revisoes' ? stripFinanceObj(rec) : rec);
            const row = op.store === 'maquinas'
              ? { id: rec.id, dados: rec, updated_at: rec.atualizadoEm, deleted_at: null }
              : { id: rec.id, maquina_id: rec.maquinaId || '', dados: rec, updated_at: rec.atualizadoEm, deleted_at: null };
            const { error } = await sb.from(table).upsert(row);
            if (error) throw error;
            await api.del('pending', op.key);
          }
        }

        // 2. Pull remote changes
        const lastSync = (await api.getOne('meta', 'lastSyncAt'))?.v || 0;
        let qMaq = sb.from('frota_maquinas').select('id,dados,updated_at,deleted_at');
        let qRev = sb.from('frota_revisoes').select('id,maquina_id,dados,updated_at,deleted_at');
        if (lastSync) {
          qMaq = qMaq.gt('updated_at', lastSync);
          qRev = qRev.gt('updated_at', lastSync);
        }
        const [rMaq, rRev, rMeta] = await Promise.all([
          qMaq,
          qRev,
          sb.from('frota_meta').select('k,v,updated_at').eq('k', 'osSeq').maybeSingle(),
        ]);
        if (rMaq.error) throw rMaq.error;
        if (rRev.error) throw rRev.error;

        let changedAny = false;
        let maxTs = lastSync;

        if (rMeta.data && rMeta.data.v != null) {
          const rv = Number(rMeta.data.v) || 0;
          const lv = (await api.getOne('meta', 'osSeq'))?.v || 0;
          if (rv > lv) { await api.put('meta', { k: 'osSeq', v: rv }); changedAny = true; }
        }

        for (const [store, rows] of [['maquinas', rMaq.data || []], ['revisoes', rRev.data || []]]) {
          for (const row of rows) {
            if ((row.updated_at || 0) > maxTs) maxTs = row.updated_at;
            const p = await api.getOne('pending', `${store}:${row.id}`);
            if (p && (p.at || 0) >= (row.updated_at || 0)) continue;
            const local = await api.getOne(store, row.id);
            const localTs = local?.atualizadoEm || 0;
            if (row.deleted_at) {
              if (local && row.deleted_at >= localTs) { await api.del(store, row.id); changedAny = true; }
            } else if (!local || (row.updated_at || 0) > localTs) {
              await api.put(store, { ...(row.dados || {}), id: row.id, atualizadoEm: row.updated_at || Date.now() });
              changedAny = true;
            }
          }
        }

        await api.put('meta', { k: 'cloudMigrated', v: true });
        await api.put('meta', { k: 'lastSyncAt', v: maxTs || Date.now() });
        status.lastAt = Date.now();
        setStatus('ok', 'Sincronizado');
        heartbeat();
        if (valoresLiberados()) { try { await loadFinance(); } catch (_) {} }
        if (changedAny) await api.onSyncApplied?.();
      } catch (err) {
        console.warn('Cloud sync error:', err);
        setStatus('err', 'Erro ao sincronizar');
      } finally {
        syncLock = null;
      }
    })();
    return syncLock;
  }

  function startRealtime() {
    if (!sb || rtChannel) return;
    rtChannel = sb.channel('frota-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'frota_maquinas' }, () => scheduleSync(400))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'frota_revisoes' }, () => scheduleSync(400))
      .subscribe();
  }

  function stopRealtime() {
    if (rtChannel && sb) {
      sb.removeChannel(rtChannel);
      rtChannel = null;
    }
  }

  const APP_URL = 'https://brunomenegalli.github.io/controle-frota/';
  let recovering = false;

  function authUrlParams() {
    const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const query = new URLSearchParams(location.search || '');
    const get = (k) => hash.get(k) || query.get(k) || '';
    return {
      type: get('type'),
      access_token: get('access_token'),
      refresh_token: get('refresh_token'),
      token_hash: get('token_hash'),
      code: query.get('code') || '',
      error: get('error'),
      error_description: get('error_description') || get('error_code'),
    };
  }
  function looksLikeRecovery(p) {
    if (!p) p = authUrlParams();
    return p.type === 'recovery' || p.type === 'passwordrecovery' || !!(p.token_hash && p.type === 'recovery');
  }
  function cleanAuthUrl() {
    try {
      const u = new URL(location.href);
      ['code','token_hash','type','error','error_description','error_code'].forEach((k) => u.searchParams.delete(k));
      const dropHash = /access_token=|refresh_token=|type=recovery|type=passwordrecovery/.test(location.hash || '');
      history.replaceState({}, document.title, u.pathname + u.search + (dropHash ? '' : (u.hash || '')));
    } catch (_) {}
  }
  function decodeParam(v) {
    try { return decodeURIComponent(String(v || '').replace(/\+/g, ' ')); }
    catch (_) { return String(v || '').replace(/\+/g, ' '); }
  }
  async function consumeAuthRedirect(p) {
    if (!p) p = authUrlParams();
    if (p.error) {
      const msg = decodeParam(p.error_description || p.error);
      return { recovery: looksLikeRecovery(p) || /recover|otp/i.test(p.error + ' ' + (p.error_description || '')), error: msg, session: null };
    }
    if (p.token_hash && (p.type === 'recovery' || p.type === 'email' || p.type === 'magiclink')) {
      const typ = p.type === 'recovery' ? 'recovery' : 'email';
      const { data, error } = await sb.auth.verifyOtp({ token_hash: p.token_hash, type: typ });
      if (error) return { recovery: typ === 'recovery', error: error.message, session: null };
      session = data.session;
      recovering = typ === 'recovery';
      cleanAuthUrl();
      return { recovery: recovering, session, error: null };
    }
    if (p.access_token && p.refresh_token) {
      const { data, error } = await sb.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token });
      if (error) return { recovery: looksLikeRecovery(p), error: error.message, session: null };
      session = data.session;
      recovering = looksLikeRecovery(p);
      cleanAuthUrl();
      return { recovery: recovering, session, error: null };
    }
    return { recovery: looksLikeRecovery(p), session: null, error: null };
  }

  function deviceId() {
    let id = localStorage.getItem('frota.deviceId');
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || (Date.now().toString(16) + Math.random().toString(16).slice(2));
      localStorage.setItem('frota.deviceId', id);
    }
    return id;
  }
  function defaultDeviceName() {
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isWin = /Windows/i.test(ua);
    const isMac = /Mac OS X|Macintosh/i.test(ua) && !isIOS;
    const isMobile = isAndroid || /iPhone|Mobile/i.test(ua);
    const device = isAndroid ? 'Android celular' : /iPad/i.test(ua) ? 'iPad' : /iPhone/i.test(ua) ? 'iPhone' : isWin ? 'Windows PC' : isMac ? 'Mac' : isMobile ? 'Celular' : 'Computador';
    const browser = /Edg\//.test(ua) ? 'Edge' : (/Chrome\//.test(ua) && !/Edg\//.test(ua)) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari/i.test(ua) ? 'Safari' : 'navegador';
    return device + ' · ' + browser;
  }
  async function heartbeat(force) {
    if (!sb || !session || !navigator.onLine) return;
    const now = Date.now();
    const last = Number(sessionStorage.getItem('frota.deviceBeat') || 0);
    if (!force && last && now - last < 5 * 60 * 1000) return;
    const id = deviceId();
    const email = (session.user && session.user.email) || '';
    const nome = defaultDeviceName();
    try {
      const { data: cur } = await sb.from('frota_dispositivos').select('apelido,nome,first_seen').eq('device_id', id).maybeSingle();
      const row = {
        device_id: id,
        email,
        nome: (cur && cur.nome) || nome,
        apelido: cur ? cur.apelido : null,
        user_agent: (navigator.userAgent || '').slice(0, 400),
        first_seen: (cur && cur.first_seen) || new Date().toISOString(),
        last_seen: new Date().toISOString(),
      };
      const { error } = await sb.from('frota_dispositivos').upsert(row);
      if (!error) sessionStorage.setItem('frota.deviceBeat', String(now));
    } catch (_) {}
  }
  async function listDevices() {
    if (!sb || !session) return [];
    const { data, error } = await sb.from('frota_dispositivos').select('*').order('last_seen', { ascending: false });
    if (error) throw error;
    return data || [];
  }
  async function renameDevice(id, apelido) {
    const { error } = await sb.from('frota_dispositivos').update({ apelido: (apelido || '').trim() || null }).eq('device_id', id);
    if (error) throw error;
  }
  async function removeDevice(id) {
    const { error } = await sb.from('frota_dispositivos').delete().eq('device_id', id);
    if (error) throw error;
    if (id === deviceId()) sessionStorage.removeItem('frota.deviceBeat');
  }

  async function init(hostApi) {
    api = hostApi;
    if (!isEnabled()) {
      setStatus('off', '');
      return { enabled: false, session: null };
    }
    const urlAuth = authUrlParams();
    sb = window.supabase.createClient(cfg().url, cfg().anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !urlAuth.error },
    });
    sb.auth.onAuthStateChange((ev, s) => {
      if (ev === 'PASSWORD_RECOVERY') {
        recovering = true;
        session = s || session;
        cleanAuthUrl();
        api.onPasswordRecovery?.(session);
        return;
      }
      const prev = !!session;
      session = s || null;
      if (session) {
        startRealtime();
        if (!recovering) { heartbeat(); scheduleSync(100); }
      } else {
        stopRealtime();
        if (ev !== 'INITIAL_SESSION') recovering = false;
        profile = null;
        lockValores();
        setStatus('auth', 'Entrar');
      }
      Promise.resolve().then(async () => {
        if (session && !recovering) await loadProfile();
        if (!recovering && prev !== !!session) api.onAuthChanged?.(session);
        else if (!recovering) { try { api.onStatus?.(); } catch (_) {} }
      });
    });
    const consumed = await consumeAuthRedirect(urlAuth);
    if (consumed.recovery) recovering = true;
    if (consumed.session) session = consumed.session;
    if (!session) {
      const { data } = await sb.auth.getSession();
      session = data?.session || null;
    }
    window.addEventListener('online', () => { if (!recovering) { heartbeat(); scheduleSync(300); } });
    window.addEventListener('offline', () => setStatus('offline', 'Offline'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && session && !recovering) { heartbeat(); scheduleSync(300); }
    });
    window.addEventListener('pagehide', () => lockValores());
    if (recovering) {
      setStatus('auth', 'Nova senha');
      return { enabled: true, session, recovery: true, recoveryError: consumed.error || null };
    }
    if (session) {
      await loadProfile();
      startRealtime();
      setStatus(navigator.onLine ? 'syncing' : 'offline', navigator.onLine ? 'Sincronizando…' : 'Offline');
      heartbeat(true);
    } else {
      setStatus('auth', 'Entrar');
    }
    return { enabled: true, session, recovery: false, recoveryError: consumed.error || null };
  }

  let profile = null; // {email,nome,role,ativo}
  let unlockToken = null, unlockTimer = null, unlockExp = 0;
  const financeMap = new Map();

  async function loadProfile() {
    profile = null;
    if (!sb || !session || !session.user) return;
    const em = session.user.email || '';
    const { data } = await sb.from('frota_membros').select('email,nome,role,ativo').ilike('email', em).maybeSingle();
    profile = data || null;
  }
  function isAdmin() { return !!(profile && profile.role === 'admin' && profile.ativo); }
  function valoresLiberados() { return isAdmin() && !!unlockToken && Date.now() < unlockExp; }

  function lockValores() {
    unlockToken = null; unlockExp = 0; financeMap.clear();
    if (unlockTimer) { clearTimeout(unlockTimer); unlockTimer = null; }
    api && api.onValoresLocked && api.onValoresLocked();
  }
  async function pinStatus() {
    const { data, error } = await sb.rpc('frota_pin_status');
    if (error) throw error;
    return data || { is_admin: false, has_pin: false };
  }
  async function definirPin(atual, novo) {
    const { data, error } = await sb.rpc('frota_pin_definir', { pin_atual: atual || null, pin_novo: novo });
    if (error) throw error;
    if (!data || !data.ok) {
      const e = (data && data.error) || 'erro';
      const map = { not_admin: 'Só o administrador pode alterar o PIN.', pin_invalido: 'O PIN deve ter 4 a 6 dígitos.', pin_atual_incorreto: 'PIN atual incorreto.' };
      throw new Error(map[e] || e);
    }
    return data;
  }
  async function unlockValores(pin) {
    if (!isAdmin()) throw new Error('Apenas o administrador pode liberar os valores.');
    const { data, error } = await sb.rpc('frota_desbloquear_valores', { pin: String(pin || '') });
    if (error) throw error;
    if (!data || !data.ok) {
      const e = (data && data.error) || 'erro';
      if (e === 'locked') throw new Error('Muitas tentativas. Tente de novo em 5 minutos.');
      if (e === 'pin_incorreto') throw new Error('PIN incorreto. Restam ' + (data.restantes != null ? data.restantes : '?') + ' tentativas.');
      if (e === 'sem_pin') throw new Error('Nenhum PIN cadastrado. Use Alterar PIN.');
      if (e === 'not_admin') throw new Error('Apenas o administrador pode liberar os valores.');
      throw new Error(e);
    }
    unlockToken = data.token;
    const sec = Number(data.expires_in) || 600;
    unlockExp = Date.now() + sec * 1000;
    if (unlockTimer) clearTimeout(unlockTimer);
    unlockTimer = setTimeout(() => lockValores(), sec * 1000);
    await loadFinance();
    return true;
  }
  async function loadFinance() {
    financeMap.clear();
    if (!unlockToken || !isAdmin()) return;
    const { data, error } = await sb.rpc('frota_financeiro_lido', { unlock_token: unlockToken });
    if (error) { lockValores(); throw error; }
    for (const row of data || []) financeMap.set(row.revisao_id, row);
  }
  function comValores(rec) {
    if (!rec) return rec;
    if (!valoresLiberados()) {
      const o = { ...rec, custo: null, maoObra: null, totalPecas: null, notasFiscais: null };
      if (Array.isArray(o.pecas)) o.pecas = o.pecas.map((p) => (p && typeof p === 'object' ? { ...p, unit: null } : p));
      return o;
    }
    const f = financeMap.get(rec.id);
    if (!f) return rec;
    return {
      ...rec,
      custo: f.custo != null ? Number(f.custo) : rec.custo,
      maoObra: f.mao_obra != null ? Number(f.mao_obra) : rec.maoObra,
      totalPecas: f.total_pecas != null ? Number(f.total_pecas) : rec.totalPecas,
      pecas: f.pecas || rec.pecas,
      notasFiscais: f.notas || rec.notasFiscais,
    };
  }
  async function adminAcesso(acao, payload) {
    const { data, error } = await sb.functions.invoke('gerenciar-acesso', { body: { acao, ...(payload || {}) } });
    const body = (data && typeof data === 'object') ? data : null;
    const map = { not_admin: 'Apenas o administrador pode gerenciar acessos.', ultimo_admin: 'Não é possível bloquear o último administrador.', email_invalido: 'E-mail inválido.', nao_encontrado: 'Pessoa não encontrada.' };
    if (body && body.ok === false) throw new Error(map[body.error] || body.error || 'Erro');
    if (error) throw new Error((body && (map[body.error] || body.error)) || error.message || 'Falha na função de acesso');
    return body;
  }

  async function login(email, password) {
    if (!sb) throw new Error('Nuvem não configurada');
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    session = data.session;
    recovering = false;
    await loadProfile();
    startRealtime();
    heartbeat(true);
    await syncNow();
    return session;
  }
  async function requestRecovery(email) {
    if (!sb) throw new Error('Nuvem não configurada');
    const { error } = await sb.auth.resetPasswordForEmail(String(email || '').trim(), { redirectTo: APP_URL });
    if (error) throw error;
  }
  function finishRecovery() {
    recovering = false;
    cleanAuthUrl();
  }

  async function logout() {
    stopRealtime();
    if (sb) await sb.auth.signOut();
    session = null;
    profile = null;
    lockValores();
    setStatus('auth', 'Entrar');
  }
  async function changePassword(newPassword) {
    if (!sb || !session) throw new Error('Faça login primeiro');
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  async function nextOsNumero(localMin) {
    if (!isEnabled() || !session || !navigator.onLine) return (Number(localMin) || 0) + 1;
    try {
      const { data, error } = await sb.rpc('next_os_numero', { min_val: Number(localMin) || 0 });
      if (!error && data != null) return Number(data);
    } catch (_) {}
    return (Number(localMin) || 0) + 1;
  }

  return {
    isEnabled,
    init,
    login,
    logout,
    changePassword,
    requestRecovery,
    finishRecovery,
    isRecovery: () => recovering,
    getUser: () => session?.user || null,
    getStatus: () => status,
    syncNow,
    scheduleSync,
    enqueue,
    mediaUrl,
    ensureMediaBlob,
    nextOsNumero,
    deviceId,
    defaultDeviceName,
    heartbeat,
    listDevices,
    renameDevice,
    removeDevice,
    appUrl: APP_URL,
    isAdmin,
    getProfile: () => profile,
    valoresLiberados,
    pinStatus,
    definirPin,
    unlockValores,
    lockValores,
    loadFinance,
    comValores,
    adminAcesso,
  };
})();

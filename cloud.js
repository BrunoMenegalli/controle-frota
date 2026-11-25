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
    }
    return { rec: out, changed };
  }

  async function enqueue(store, id, op, at) {
    if (!isEnabled() || !api) return;
    await api.put('pending', { key: `${store}:${id}`, store, id, op, at: at || Date.now() });
    scheduleSync(350);
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
            const { rec, changed } = await uploadRecordMedia(op.store, cur);
            rec.atualizadoEm = rec.atualizadoEm || op.at || Date.now();
            if (changed) await api.put(op.store, rec);
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

  async function init(hostApi) {
    api = hostApi;
    if (!isEnabled()) {
      setStatus('off', '');
      return { enabled: false, session: null };
    }
    sb = window.supabase.createClient(cfg().url, cfg().anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    const { data } = await sb.auth.getSession();
    session = data?.session || null;
    sb.auth.onAuthStateChange((_ev, s) => {
      const prev = !!session;
      session = s || null;
      if (session) {
        startRealtime();
        scheduleSync(100);
      } else {
        stopRealtime();
        setStatus('auth', 'Entrar');
      }
      if (prev !== !!session) api.onAuthChanged?.(session);
    });
    window.addEventListener('online', () => scheduleSync(300));
    window.addEventListener('offline', () => setStatus('offline', 'Offline'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && session) scheduleSync(300);
    });
    if (session) {
      startRealtime();
      setStatus(navigator.onLine ? 'syncing' : 'offline', navigator.onLine ? 'Sincronizando…' : 'Offline');
    } else {
      setStatus('auth', 'Entrar');
    }
    return { enabled: true, session };
  }

  async function login(email, password) {
    if (!sb) throw new Error('Nuvem não configurada');
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    session = data.session;
    startRealtime();
    await syncNow();
    return session;
  }

  async function logout() {
    stopRealtime();
    if (sb) await sb.auth.signOut();
    session = null;
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
    getUser: () => session?.user || null,
    getStatus: () => status,
    syncNow,
    scheduleSync,
    enqueue,
    mediaUrl,
    ensureMediaBlob,
    nextOsNumero,
  };
})();

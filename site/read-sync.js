/* 已读同步 (read sync) — shared by 📖 Läsning, 🗣️ Tala and 🎧 Lyssna.
 *
 * "标为已读" is Ruibo's activity signal: the scheduled routines only keep
 * generating while he has marked something read in the last 48 h
 * (tools/activity-gate.js, CLAUDE.md §4.9). A static page can't reach the
 * routines, so the marks are pushed to read-log.json on the repo's `read-log`
 * branch through the GitHub Contents API; the routines read it from there.
 *
 *   read-log.json  { version, created, lastMarkedAt, reads: { <id>: <iso time | null> } }
 *
 * Marks apply locally first (instant, offline-safe) and wait in a queue until
 * they are pushed. Pushing needs a fine-grained token (this repo only,
 * Contents: read & write), pasted once per device via the ☁️ button. Without a
 * token, marks still work on this device and other devices' marks are pulled
 * read-only (the repo is public).
 *
 * localStorage is the source of truth: every mutation and sync re-reads it, so
 * a page restored from bfcache or a second tab never overwrites newer marks.
 *
 * Ids: Läsning/Tala use the article slug, Lyssna uses "lyssna:<episode id>".
 */
(function () {
  'use strict';

  const REPO = 'TURuibo/svenska_agent';
  const BRANCH = 'read-log';
  const FILE = 'read-log.json';
  const API = `https://api.github.com/repos/${REPO}/contents/${FILE}`;
  const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${FILE}`;

  const LS_REMOTE = 'readsync.remote.v1';   // last fetched reads map
  const LS_QUEUE = 'readsync.queue.v1';     // pending ops [{ k, id, read, at }]
  const LS_TOKEN = 'readsync.token.v1';
  const LS_NAGGED = 'readsync.nagged.v1';   // day we last asked a token-less device for a token
  const LS_LEGACY = 'lasning.read.v1';      // pre-sync Läsning/Tala marks (slugs, no times)

  const load = (key, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; }
    catch (_e) { return fallback; }
  };
  const save = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch (_e) {} };
  const token = () => { try { return localStorage.getItem(LS_TOKEN) || ''; } catch (_e) { return ''; } };

  let opSeq = 0;
  const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${opSeq++}`;
  const opKey = (o) => o.k || `${o.id}|${o.at}|${o.read}`;

  let remote = {};
  let queue = [];
  function reload() {
    remote = load(LS_REMOTE, {});
    queue = load(LS_QUEUE, []);
  }
  reload();

  // Fold the old local-only marks in once. They carry no time (null), so they
  // show as read but never count as fresh activity for the gate.
  {
    const legacy = load(LS_LEGACY, null);
    if (Array.isArray(legacy) && legacy.length) {
      for (const id of legacy) if (!(id in remote)) queue.push({ k: newKey(), id, read: true, at: null });
      save(LS_QUEUE, queue);
      try { localStorage.removeItem(LS_LEGACY); } catch (_e) {}
    }
  }

  function applyOps(reads, ops) {
    const out = Object.assign({}, reads);
    for (const op of ops) {
      if (op.read) { if (!(op.id in out) || (out[op.id] == null && op.at)) out[op.id] = op.at; }
      else delete out[op.id];
    }
    return out;
  }
  let view = applyOps(remote, queue);

  const listeners = [];
  function changed() {
    view = applyOps(remote, queue);
    listeners.forEach((fn) => { try { fn(); } catch (_e) {} });
    paintButtons();
  }

  // ---------- status + ☁️ buttons ----------
  // state: local (no token) · pending · syncing · synced · error
  let state = token() ? 'pending' : 'local';
  let errorMsg = '';
  let errorAuth = false;   // last error was 401/403 → the token itself needs replacing
  let syncedAt = null;

  function label() {
    const n = queue.length;
    switch (state) {
      case 'syncing': return { text: '☁️ 同步中…', title: '正在把已读记录推到 GitHub' };
      case 'synced': return { text: '☁️ 已同步', title: `已读记录已同步（${syncedAt ? syncedAt.toLocaleTimeString() : ''}）· 点一下立即重新同步` };
      case 'error': return {
        text: '⚠️ 同步失败',
        title: errorAuth ? `${errorMsg} · 点一下重新粘贴 token` : `${errorMsg} · 点一下重试`,
      };
      case 'pending': return { text: n ? `☁️ ${n} 条待同步` : '☁️ 同步', title: '点一下立即同步' };
      default: return {
        text: n ? `📱 ${n} 条未同步` : '📱 仅本机',
        title: '已读只存在这台设备上，定时任务看不到。点一下粘贴 GitHub token 开启同步',
      };
    }
  }
  function paintButtons() {
    const { text, title } = label();
    document.querySelectorAll('[data-readsync]').forEach((b) => {
      b.textContent = text;
      b.title = title;
      b.classList.toggle('readSyncWarn', state === 'error' || state === 'local');
    });
  }
  function setState(s, err) {
    state = s;
    errorMsg = err ? err.message || String(err) : '';
    errorAuth = !!(err && err.auth);
    paintButtons();
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-readsync]');
    if (!b) return;
    if (!token() || (state === 'error' && errorAuth)) configure(); else sync();
  });

  function configure() {
    const had = !!token();
    const v = window.prompt(
      (state === 'error' && errorMsg ? `⚠️ ${errorMsg}\n\n` : '') +
      '☁️ 已读同步\n\n' +
      '粘贴一个 GitHub fine-grained token：只选 svenska_agent 这个仓库，权限 Contents = Read and write，' +
      'Expiration 选最长（过期后标记推不上去，定时任务会以为你没在读而暂停）。\n' +
      '每台设备粘一次即可（只存在这台设备的浏览器里）。' +
      (had ? '\n\n已设置过 token：留空点确定 = 保留原 token；输入「删除」= 删除 token。' : ''),
      ''
    );
    const t = v == null ? '' : v.trim();
    if (t === '删除' || t.toLowerCase() === 'delete') {
      try { localStorage.removeItem(LS_TOKEN); } catch (_e) {}
      setState('local');
    } else if (t) {
      try { localStorage.setItem(LS_TOKEN, t); } catch (_e) {}
      setState('pending');
    }
    sync();
  }

  // A mark on a token-less device never reaches the routines. Ask (at most once a
  // day) — iOS Safari also wipes site storage after ~7 days without a visit.
  function nagForToken() {
    const today = new Date().toISOString().slice(0, 10);
    if (load(LS_NAGGED, '') === today) return;
    save(LS_NAGGED, today);
    if (window.confirm('这次「已读」只存在这台设备上：没有同步 token，定时任务看不到，会以为你没在读而暂停生成。\n\n现在粘贴 GitHub token 开启同步吗？')) configure();
  }

  // ---------- GitHub I/O ----------
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  const headers = () => ({ Accept: 'application/vnd.github+json', Authorization: `Bearer ${token()}` });
  function httpError(msg, status) {
    const e = new Error(msg);
    e.auth = status === 401 || status === 403;
    return e;
  }

  async function fetchLog() {
    const res = await fetch(`${API}?ref=${BRANCH}`, { headers: headers(), cache: 'no-store' });
    if (res.status === 404) return { log: null, sha: undefined };
    if (!res.ok) throw httpError(res.status === 401 ? 'token 无效或已过期 (401)' : `读取失败 (${res.status})`, res.status);
    const j = await res.json();
    return { log: JSON.parse(b64decode(j.content)), sha: j.sha };
  }

  async function pushLog(log, sha, ops) {
    const ids = ops.filter((o) => o.read && o.at).map((o) => o.id);
    const res = await fetch(API, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
      body: JSON.stringify({
        message: ids.length ? `read: ${ids.slice(0, 3).join(', ')}${ids.length > 3 ? ' …' : ''}` : `read-log: ${ops.length} 条更新`,
        content: b64encode(JSON.stringify(log, null, 2) + '\n'),
        sha,
        branch: BRANCH,
      }),
    });
    if (res.status === 409 || res.status === 422) return false;   // someone else wrote first → retry
    if (!res.ok) {
      throw httpError(res.status === 401 || res.status === 403 ? `token 无效或没有写权限 (${res.status})` : `写入失败 (${res.status})`, res.status);
    }
    return true;
  }

  let running = null;
  function sync() {
    if (running) return running;
    running = (async () => {
      try {
        if (!token()) {
          // Read-only: pick up marks made on other devices.
          const res = await fetch(RAW, { cache: 'no-store' });
          if (res.ok) { remote = (await res.json()).reads || {}; save(LS_REMOTE, remote); }
          reload();
          changed();
          setState(token() ? 'pending' : 'local');
          if (token()) setTimeout(sync, 0);   // a token was pasted while this pull was in flight
          return;
        }
        setState('syncing');
        for (let attempt = 0; ; attempt++) {
          const { log, sha } = await fetchLog();
          const base = log || { version: 1, created: new Date().toISOString(), lastMarkedAt: null, reads: {} };
          reload();
          const ops = queue.slice();
          if (!ops.length) { remote = base.reads || {}; save(LS_REMOTE, remote); break; }
          const next = Object.assign({}, base, { reads: applyOps(base.reads || {}, ops) });
          for (const o of ops) if (o.read && o.at && (!next.lastMarkedAt || o.at > next.lastMarkedAt)) next.lastMarkedAt = o.at;
          if (await pushLog(next, sha, ops)) {
            // Drop exactly the ops we pushed; anything queued meanwhile (this tab or another) stays.
            const pushed = new Set(ops.map(opKey));
            save(LS_REMOTE, next.reads);
            save(LS_QUEUE, load(LS_QUEUE, []).filter((o) => !pushed.has(opKey(o))));
            break;
          }
          if (attempt === 2) throw new Error('多台设备同时写入，稍后再试');
        }
        reload();
        syncedAt = new Date();
        changed();
        setState(queue.length ? 'pending' : 'synced');
        if (queue.length) setTimeout(sync, 500);
      } catch (e) {
        reload();
        changed();
        setState(token() ? 'error' : 'local', e);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  // ---------- public API ----------
  const isRead = (id) => id in view;
  function setRead(id, read) {
    reload();
    view = applyOps(remote, queue);
    if (isRead(id) === read) { changed(); return; }
    queue.push({ k: newKey(), id, read, at: read ? new Date().toISOString() : null });
    save(LS_QUEUE, queue);
    if (token()) state = 'pending';
    changed();
    sync();
    if (read && !token()) nagForToken();
  }
  const toggle = (id) => setRead(id, !isRead(id));
  const onChange = (fn) => { listeners.push(fn); };

  window.ReadSync = { isRead, setRead, toggle, onChange, sync, configure };

  // Pull other devices' marks (and flush anything queued) on load, whenever the
  // tab comes back to the foreground, and when a page is restored from bfcache.
  // Another tab changing the queue or token repaints this one.
  const start = () => { paintButtons(); sync(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) { reload(); changed(); sync(); } });
  window.addEventListener('storage', (e) => {
    if (e.key !== LS_QUEUE && e.key !== LS_REMOTE && e.key !== LS_TOKEN) return;
    reload();
    if (state !== 'syncing') state = token() ? (state === 'local' ? 'pending' : state) : 'local';
    changed();
  });
})();

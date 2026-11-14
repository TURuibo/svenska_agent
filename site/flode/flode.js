/* Flöde — endless vertical card feed (see SPEC.md).
 * One card = one screen. Scheduler: 12-slot rhythm × 4 content lanes (🌙 fresh · 🔁 due ·
 * 🆕 new · 🎲 random). Objective answers go into Öva's `ova.state.v1` (same Leitner rules);
 * everything else lives in `flode.state.v1`. Only the light flode-data.js is loaded. */
(function () {
  'use strict';

  const D = window.FLODE_DATA || null;
  const feed = document.getElementById('flFeed');
  const $ = (id) => document.getElementById(id);

  // ---------- helpers ----------
  const arr = (x) => (Array.isArray(x) ? x : []);
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const str = (x) => (x == null ? '' : String(x));
  const esc = (s) => str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const uniq = (a) => [...new Set(a)];
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i -= 1) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dateStr(new Date());
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return dateStr(d); };
  const shiftDate = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return dateStr(d); };
  const trunc = (s, n) => { s = str(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const zhShort = (z) => { let o = str(z).split(/[；;]/).map((s) => s.trim()).filter(Boolean)[0] || ''; return o.length > 16 ? o.slice(0, 16) + '…' : o; };
  const glosses = (z) => new Set(str(z).split(/[；;、，,/（）()]/).map((s) => s.replace(/[的地得]$/, '').trim()).filter(Boolean));
  const overlaps = (a, b) => { for (const g of a) if (b.has(g)) return true; return false; };
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- storage ----------
  const LS = 'flode.state.v1';
  const OVA = 'ova.state.v1';
  const INTERVALS = [0, 1, 2, 4, 7, 14, 30];
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (_e) { return false; } };
  const parse = (raw) => { try { return JSON.parse(raw || 'null'); } catch (_e) { return undefined; } };

  const cleanTonight = (t) => arr(t).filter((e) => isObj(e) && typeof e.id === 'string' && typeof e.href === 'string').slice(-200);
  function loadState() {
    const st = { v: 1, seen: {}, unsure: {}, mute: {}, tonight: [], days: {}, goal: 30, prefs: { autoSpeak: false, rate: 0.85, vibrate: true } };
    const o = parse(lsGet(LS));
    if (!isObj(o)) return st;
    if (isObj(o.seen)) for (const [k, v] of Object.entries(o.seen)) if (Array.isArray(v) && Number(v[0]) > 0) st.seen[k] = [Number(v[0]), str(v[1])];
    if (isObj(o.unsure)) for (const [k, v] of Object.entries(o.unsure)) if (typeof v === 'string') st.unsure[k] = v;
    if (isObj(o.mute)) for (const k of Object.keys(o.mute)) if (o.mute[k]) st.mute[k] = 1;
    st.tonight = cleanTonight(o.tonight);
    if (isObj(o.days)) {
      const keep = addDays(-90);
      for (const [k, v] of Object.entries(o.days)) {
        if (/^\d{4}-\d\d-\d\d$/.test(k) && k >= keep && isObj(v)) st.days[k] = { cards: +v.cards || 0, right: +v.right || 0, wrong: +v.wrong || 0, newWords: +v.newWords || 0 };
      }
    }
    if (Number(o.goal) > 0) st.goal = Math.round(Number(o.goal));
    if (isObj(o.prefs)) {
      if (typeof o.prefs.autoSpeak === 'boolean') st.prefs.autoSpeak = o.prefs.autoSpeak;
      if (Number(o.prefs.rate) >= 0.5 && Number(o.prefs.rate) <= 1.5) st.prefs.rate = Number(o.prefs.rate);
      if (typeof o.prefs.vibrate === 'boolean') st.prefs.vibrate = o.prefs.vibrate;
    }
    const keys = Object.keys(st.seen);
    if (keys.length > 3000) {
      keys.sort((a, b) => st.seen[b][1].localeCompare(st.seen[a][1]));
      for (const k of keys.slice(3000)) delete st.seen[k];
    }
    return st;
  }
  const st = loadState();

  // Dagbok edits `tonight` too: the stored copy is the authority for that one field.
  function syncTonight() { const o = parse(lsGet(LS)); if (isObj(o) && Array.isArray(o.tonight)) st.tonight = cleanTonight(o.tonight); }
  function writeNow() { lsSet(LS, JSON.stringify(st)); }
  let saveT = 0;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => { syncTonight(); writeNow(); }, 300); }
  function flush() { if (saveT) { clearTimeout(saveT); saveT = 0; syncTonight(); writeNow(); } }
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); else { syncTonight(); refreshTonightBtns(); } });
  window.addEventListener('storage', (e) => { if (e.key === LS) { syncTonight(); refreshTonightBtns(); } });

  let ova = { cards: {} };
  function readOva() { const o = parse(lsGet(OVA)); if (isObj(o) && isObj(o.cards)) ova = o; return o; }
  readOva();
  const ovaBox = (slug) => { const c = ova.cards[slug]; return c && c.b > 0 ? c.b : 0; };
  // Same rules as site/ova/ova.js answer(); re-read first so an open Öva tab isn't clobbered.
  function ovaRecord(slug, ok) {
    const o = parse(lsGet(OVA));
    if (o === undefined) return;                       // corrupt: leave Öva's data alone
    const s = isObj(o) ? o : { cards: {}, lastCopy: '' };
    if (!isObj(s.cards)) s.cards = {};
    const t = today();
    const c = isObj(s.cards[slug]) ? s.cards[slug] : { b: 0, d: t, r: 0, w: 0, t };
    c.b = Number(c.b) || 0; c.r = Number(c.r) || 0; c.w = Number(c.w) || 0;
    if (ok) { c.b = Math.min(c.b + 1, INTERVALS.length - 1); c.r += 1; } else { c.b = 0; c.w += 1; }
    c.d = addDays(INTERVALS[c.b]);
    c.t = t;
    s.cards[slug] = c;
    lsSet(OVA, JSON.stringify(s));
    ova = s;
    dueCache = null;
  }

  // ---------- data ----------
  const W = arr(D && D.words).filter((w) => isObj(w) && w.s && w.l && w.zh).map((w) => ({ ...w, p: str(w.p).toLowerCase(), f: arr(w.f) }));
  const WBy = new Map(W.map((w) => [w.s, w]));
  const SN = arr(D && D.sentences).filter((s) => isObj(s) && s.s && s.sv && s.zh);
  const SBy = new Map(SN.map((s) => [s.s, s]));
  const PH = arr(D && D.phrases).filter((p) => isObj(p) && p.s && p.sv && p.zh);
  const GR = arr(D && D.grammar).filter((g) => isObj(g) && g.s && g.name && (g.tip || g.zh));
  const BI = arr(D && D.bites).filter((b) => isObj(b) && b.id && b.a && (
    b.kind === 'dialog' ? arr(b.turns).filter((t) => t && t.sv).length >= 2 : (b.kind === 'news' || b.kind === 'teaser') && b.sv));
  const FR = arr(D && D.fresh).filter(isObj);
  const RC = arr(D && D.recent).filter(isObj);
  const TOP = isObj(D && D.topics) ? D.topics : {};
  const LATEST = /^\d{4}-\d\d-\d\d$/.test(str(D && D.latest)) ? D.latest : today();
  const SINCE30 = shiftDate(LATEST, -30);

  const sentByWord = new Map();
  for (const s of SN) for (const w of arr(s.w)) if (WBy.has(w)) { const l = sentByWord.get(w) || []; l.push(s); sentByWord.set(w, l); }
  const byPos = new Map(); const byTopic = new Map();
  for (const w of W) {
    (byPos.get(w.p) || byPos.set(w.p, []).get(w.p)).push(w);
    if (w.tp) (byTopic.get(w.tp) || byTopic.set(w.tp, []).get(w.tp)).push(w);
  }
  const glCache = new Map();
  const glossOf = (w) => { let g = glCache.get(w.s); if (!g) { g = glosses(w.zh); glCache.set(w.s, g); } return g; };
  const toW = (slugs) => uniq(slugs).map((s) => WBy.get(s)).filter(Boolean);
  const sentsOf = (ws) => uniq(ws.flatMap((w) => sentByWord.get(w.s) || []));

  const freshArt = new Set(FR.map((f) => f.a)); const recentArt = new Set(RC.map((r) => r.a));
  const freshW = toW(FR.flatMap((f) => arr(f.words)));
  const recentW = toW(RC.flatMap((r) => arr(r.words)));
  const freshS = uniq(FR.flatMap((f) => arr(f.sentences)).map((s) => SBy.get(s)).filter(Boolean).concat(sentsOf(freshW)));
  const recentS = sentsOf(recentW);
  const freshB = BI.filter((b) => freshArt.has(b.a));
  const recentB = BI.filter((b) => recentArt.has(b.a));
  const newW = [W.filter((w) => w.gap && !w.k), W.filter((w) => !w.k && str(w.d) >= SINCE30 && /^(A2|B1)/.test(str(w.c))),
    W.filter((w) => !w.k && str(w.d) >= SINCE30), W.filter((w) => !w.k)];
  const newS = [SN.filter((s) => str(s.d) >= SINCE30), SN];
  const newP = [PH.filter((p) => str(p.d) >= SINCE30), PH];
  const newB = [BI.slice(0, 40), BI];

  let dueCache = null;
  function dueLists() {
    if (dueCache) return dueCache;
    const t = today();
    const slugs = Object.keys(ova.cards).filter((s) => isObj(ova.cards[s]) && str(ova.cards[s].d) <= t)
      .concat(Object.keys(st.unsure).filter((s) => st.unsure[s] < t));
    const w = toW(slugs);
    dueCache = { w: [w, recentW], s: [sentsOf(w), recentS] };
    return dueCache;
  }

  // ---------- lanes ----------
  const LANES = [['fresh', 35], ['due', 35], ['new', 20], ['rand', 10]];
  function laneOrder() {
    let r = Math.random() * 100; let i = 0;
    while (i < LANES.length - 1 && r >= LANES[i][1]) { r -= LANES[i][1]; i += 1; }
    return LANES.slice(i).concat(LANES.slice(0, i)).map((l) => l[0]);
  }
  function sample(list, ok) {
    const n = list.length;
    if (!n) return null;
    if (n <= 80) { for (const x of shuffle(list)) if (ok(x)) return x; return null; }
    for (let i = 0; i < 60; i += 1) { const x = list[(Math.random() * n) | 0]; if (ok(x)) return x; }
    return null;
  }
  const recent = [];                           // item keys of the last 40 cards
  let ignoreRecent = false;
  const isRecent = (k) => !ignoreRecent && recent.includes(k);
  const pushRecent = (keys) => { for (const k of keys) recent.push(k); while (recent.length > 40) recent.shift(); };
  const unseen = (k) => !st.seen[k];

  // tiers per lane → first acceptable item; returns [item, lane]
  function pickFrom(tiersByLane, key, ok) {
    for (const lane of laneOrder()) {
      for (const tier of tiersByLane[lane] || []) {
        const x = sample(tier, (y) => !isRecent(key(y)) && (lane !== 'new' || unseen(key(y))) && ok(y, lane));
        if (x) return [x, lane];
      }
    }
    return [null, ''];
  }
  const wKey = (w) => 'w:' + w.s;
  function pickWord(ok) {
    return pickFrom({ fresh: [freshW], due: dueLists().w, new: newW, rand: [W] }, wKey,
      (w, lane) => (lane === 'due' || lane === 'fresh' || !st.mute[w.s]) && ok(w, lane));
  }
  const pickSent = (ok) => pickFrom({ fresh: [freshS], due: dueLists().s, new: newS, rand: [SN] }, (s) => 's:' + s.s, ok);

  // ---------- distractors (Öva's rules: same POS, prefer topic/CEFR, no overlapping gloss) ----------
  function distract(w, field, n, also) {
    const mine = glossOf(w);
    const keyOf = (x) => (field === 'zh' ? zhShort(x.zh) : x.l.toLowerCase());
    const taken = new Set([keyOf(w)].concat(arr(also).map(keyOf)));
    const pos = byPos.get(w.p) || [];
    const pool = uniq((byTopic.get(w.tp) || []).filter((x) => x.p === w.p).concat(pos.length > 300 ? shuffle(pos).slice(0, 300) : pos));
    const scored = pool.filter((x) => x.s !== w.s && !overlaps(mine, glossOf(x)))
      .map((x) => ({ x, sc: (w.tp && x.tp === w.tp ? 3 : 0) + (w.c && x.c === w.c ? 1 : 0) + Math.random() * 1.5 }))
      .sort((a, b) => b.sc - a.sc).map((o) => o.x);
    const out = [];
    for (const x of scored.concat(shuffle(W).slice(0, 200))) {
      if (out.length >= n) break;
      const k = keyOf(x);
      if (!k || taken.has(k) || x.s === w.s || overlaps(mine, glossOf(x))) continue;
      taken.add(k); out.push(x);
    }
    return out.length >= n ? out : null;
  }

  function makeCloze(w) {
    const forms = uniq(w.f.concat([w.l])).filter(Boolean).sort((a, b) => b.length - a.length);
    for (const s of shuffle(sentByWord.get(w.s) || [])) {
      for (const f of forms) {
        const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\p{L}\\p{N}])`, 'iu');
        const m = s.sv.match(re);
        if (m) { const at = m.index + m[1].length; return { s, before: s.sv.slice(0, at), ans: m[2], after: s.sv.slice(at + m[2].length) }; }
      }
    }
    return null;
  }

  // ---------- card builders ----------
  const TYPES = {
    word: ['🔤', '词卡'], quiz: ['🎯', '选择题'], cloze: ['✍️', '填空'], enett: ['⚖️', 'en / ett'], sentence: ['💬', '一句话'],
    listen: ['🎧', '盲听'], phrase: ['🧩', '词组'], grammar: ['📐', '语法一口'], news: ['📰', '新闻一口'], dialog: ['🗨️', '对话一口'],
    teaser: ['📖', '文章预告'], pairs: ['🔗', '配对'], stat: ['📊', '小结'],
  };
  const LANE_LABEL = { fresh: '🌙 今晚预习', due: '🔁 复习', new: '🆕 新内容', rand: '🎲 随便看看', retry: '↩️ 再来一次' };
  const INTERACTIVE = new Set(['quiz', 'cloze', 'enett', 'pairs']);
  const BITE_KINDS = ['news', 'dialog', 'teaser'];
  let biteTurn = -1;

  function build(t, slug, prev) {
    const fixed = slug ? WBy.get(slug) : null;
    const one = (ok) => (slug ? (fixed && ok(fixed) ? [fixed, 'retry'] : [null, '']) : pickWord(ok));
    if (t === 'word') { const [w, lane] = one((x) => !x.k && !st.mute[x.s]); return w && { t, w, lane, keys: [wKey(w)] }; }
    if (t === 'quiz') {
      let opts = null; let dir = 'sv2zh';
      const [w, lane] = one((x) => { dir = ovaBox(x.s) >= 2 ? 'zh2sv' : 'sv2zh'; opts = distract(x, dir === 'sv2zh' ? 'zh' : 'l', 3); return !!opts; });
      return w && { t, w, lane, dir, opts: shuffle([w].concat(opts)), keys: [wKey(w)] };
    }
    if (t === 'cloze') {
      let cz = null; let opts = null;
      const [w, lane] = one((x) => sentByWord.has(x.s) && !!(cz = makeCloze(x)) && !!(opts = distract(x, 'l', 2)));
      return w && { t, w, lane, cz, opts: shuffle([w].concat(opts)), keys: [wKey(w), 's:' + cz.s.s] };
    }
    if (t === 'enett') { const [w, lane] = one((x) => x.p === 'substantiv' && (x.g === 'en' || x.g === 'ett')); return w && { t, w, lane, keys: [wKey(w)] }; }
    if (t === 'pairs') {
      const [a, lane] = pickWord(() => true);
      if (!a) return null;
      const ws = [a];
      for (let i = 0; i < 12 && ws.length < 4; i += 1) {
        const [b] = pickWord((x) => !ws.some((y) => y.s === x.s || y.l.toLowerCase() === x.l.toLowerCase() || zhShort(y.zh) === zhShort(x.zh) || overlaps(glossOf(y), glossOf(x))));
        if (b) ws.push(b);
      }
      if (ws.length < 4) return null;
      return { t, ws, lane, zhOrder: shuffle([0, 1, 2, 3]), svOrder: shuffle([0, 1, 2, 3]), keys: ws.map(wKey) };
    }
    if (t === 'sentence' || t === 'listen') {
      const [s, lane] = pickSent((x) => t === 'sentence' || x.sv.length <= 95);
      return s && { t, s, lane, keys: ['s:' + s.s] };
    }
    if (t === 'phrase') { const [p, lane] = pickFrom({ new: newP, rand: [PH] }, (x) => 'p:' + x.s, () => true); return p && { t, p, lane, keys: ['p:' + p.s] }; }
    if (t === 'grammar') { const [g, lane] = pickFrom({ new: [GR], rand: [GR] }, (x) => 'g:' + x.s, () => true); return g && { t, g, lane, keys: ['g:' + g.s] }; }
    if (t === 'bite') {                 // rotate news → dialog → teaser so all three show up
      biteTurn += 1;
      for (let j = 0; j < 3; j += 1) {
        const kind = BITE_KINDS[(biteTurn + j) % 3];
        if (kind === prev) continue;
        const [b, lane] = pickFrom({ fresh: [freshB], due: [recentB], new: newB, rand: [BI] }, (x) => 'b:' + x.id, (x) => x.kind === kind);
        if (b) return { t: b.kind, b, lane, keys: ['b:' + b.id] };
      }
    }
    return null;
  }

  // ---------- scheduler ----------
  const TEMPLATE = ['word', 'quiz', 'sentence', 'bite', 'enett', 'phrase', 'cloze', 'listen', 'word', 'grammar', 'pairs', 'bite'];
  const models = [];
  let slots = [];
  const retries = [];               // { t, slug, dueAt }
  let sinceStat = 0;
  function refill() {
    const c = TEMPLATE.slice();
    for (let k = 0; k < 5; k += 1) { const i = rnd(0, c.length - 2); [c[i], c[i + 1]] = [c[i + 1], c[i]]; }
    slots = slots.concat(c);
  }
  function nextModel() {
    const i = models.length;
    const content = models.filter((m) => m.t !== 'stat');
    if (sinceStat >= 10) { sinceStat = 0; return { t: 'stat', lane: '', keys: [] }; }
    const prevT = content.length ? content[content.length - 1].t : '';
    const lastTwo = content.slice(-2);
    const needInter = lastTwo.length === 2 && lastTwo.every((m) => !INTERACTIVE.has(m.t));
    if (slots.length < 12) refill();
    for (const relax of [0, 1, 2, 3]) {            // 3 = also ignore the 40-card window
      ignoreRecent = relax === 3;
      try {
        for (let r = 0; r < retries.length; r += 1) {          // 1) due retries first
          const q = retries[r];
          if (q.dueAt > i || (relax < 2 && q.t === prevT) || (relax < 1 && needInter && !INTERACTIVE.has(q.t))) continue;
          const m = build(q.t, q.slug, prevT);
          retries.splice(r, 1); r -= 1;
          if (m) return m;
        }
        const tried = new Set();                                // 2) the rhythm queue
        for (let k = 0; k < slots.length; k += 1) {
          const t = slots[k];
          if (tried.has(t) || (relax < 2 && t === prevT) || (relax < 1 && needInter && !INTERACTIVE.has(t))) continue;
          tried.add(t);
          const m = build(t, null, relax < 2 ? prevT : '');
          if (m) { slots.splice(k, 1); return m; }
          if (relax === 3) { slots = slots.filter((x) => x !== t); k = -1; }   // no data for this type at all
        }
        if (slots.length < 12) refill();
      } finally { ignoreRecent = false; }
    }
    return null;
  }
  function genModel() {
    const m = nextModel();
    if (!m) return null;
    m.i = models.length;
    m.rev = 0;
    if (m.t !== 'stat') { sinceStat += 1; pushRecent(m.keys); }
    models.push(m);
    return m;
  }

  // ---------- state helpers ----------
  const dayRec = () => { const t = today(); if (!st.days[t]) st.days[t] = { cards: 0, right: 0, wrong: 0, newWords: 0 }; return st.days[t]; };
  const sess = { cards: 0, right: 0, wrong: 0, newWords: 0 };
  function streak() {
    let d = today(); let n = 0;
    if (!((st.days[d] || {}).cards >= 10)) d = shiftDate(d, -1);
    while ((st.days[d] || {}).cards >= 10) { n += 1; d = shiftDate(d, -1); }
    return n;
  }
  function renderTop() {
    const c = (st.days[today()] || {}).cards || 0;
    $('flGoalFill').style.width = Math.min(100, Math.round((100 * c) / st.goal)) + '%';
    $('flGoal').classList.toggle('done', c >= st.goal);
    $('flGoalTxt').textContent = `${c}/${st.goal}`;
    const s = streak();
    $('flStreak').textContent = `🔥 ${s}`;
    $('flStreak').classList.toggle('off', !s);
  }
  function score(ok) {
    const d = dayRec();
    if (ok) { d.right += 1; sess.right += 1; } else { d.wrong += 1; sess.wrong += 1; }
    save();
    if (st.prefs.vibrate && navigator.vibrate) { try { navigator.vibrate(ok ? 18 : [40, 50, 40]); } catch (_e) {} }
  }

  // ---------- 🌙 tonight ----------
  const noteHref = (slug) => '../sok/#note=' + encodeURIComponent(slug);
  const artHref = (b) => `../${b.site === 'tala' ? 'tala' : 'reading'}/#article=${encodeURIComponent(b.a)}`;
  function tonightEntries(m) {
    const w = (x) => ({ id: 'w:' + x.s, t: m.t, slug: x.s, title: `${x.l} · ${zhShort(x.zh)}`, href: noteHref(x.s) });
    switch (m.t) {
      case 'word': case 'quiz': case 'cloze': case 'enett': return [w(m.w)];
      case 'pairs': return m.ws.map(w);
      case 'sentence': case 'listen': return [{ id: 's:' + m.s.s, t: m.t, slug: m.s.s, title: trunc(m.s.sv, 70), href: noteHref(m.s.s) }];
      case 'phrase': return [{ id: 'p:' + m.p.s, t: m.t, slug: m.p.s, title: `${m.p.sv} · ${zhShort(m.p.zh)}`, href: noteHref(m.p.s) }];
      case 'grammar': return [{ id: 'g:' + m.g.s, t: m.t, slug: m.g.s, title: `${m.g.name}${m.g.zh ? ' · ' + m.g.zh : ''}`, href: noteHref(m.g.s) }];
      case 'news': case 'dialog': case 'teaser': return [{ id: 'a:' + m.b.a, t: m.t, slug: m.b.a, title: str(m.b.title) || m.b.a, href: artHref(m.b) }];
      default: return [];
    }
  }
  const inTonight = (m) => { const e = tonightEntries(m); return e.length > 0 && e.every((x) => st.tonight.some((y) => y.id === x.id)); };
  function toggleTonight(m) {
    syncTonight();
    const es = tonightEntries(m);
    if (!es.length) return;
    const on = inTonight(m);
    if (on) st.tonight = st.tonight.filter((y) => !es.some((x) => x.id === y.id));
    else { const at = new Date().toISOString(); for (const e of es) if (!st.tonight.some((y) => y.id === e.id)) st.tonight.push({ ...e, at }); }
    clearTimeout(saveT); saveT = 0; writeNow();
    refreshTonightBtns();
    toast(on ? '已从「今晚细看」移除' : `🌙 已加入今晚细看 · ${st.tonight.length} 条`);
  }
  function refreshTonightBtns() {
    feed.querySelectorAll('.flCard').forEach((el) => {
      const m = models[+el.dataset.i];
      if (!m) return;
      const on = inTonight(m);
      el.querySelectorAll('[data-act="tonight"]').forEach((b) => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    });
  }

  // ---------- speech ----------
  const SP = window.SvSpeak;
  const canSpeak = () => !!(SP && SP.supported);
  function say(parts, quiet) {
    if (!canSpeak()) { if (!quiet) toast('这个浏览器不支持朗读'); return false; }
    if (quiet && SP.hasSwedishVoice && !SP.hasSwedishVoice()) return false;
    return SP.speakSequence(arr(parts).filter(Boolean), { rate: st.prefs.rate }) !== false;
  }
  function speechOf(m, auto) {
    switch (m.t) {
      case 'word': case 'enett': return [m.w.l];
      case 'quiz': return m.dir === 'sv2zh' || m.ans ? [m.w.l] : null;
      case 'cloze': return m.ans ? [m.cz.s.sv] : null;
      case 'pairs': return m.ws.map((w) => w.l);
      case 'sentence': case 'listen': return [m.s.sv];
      case 'phrase': return [m.p.sv];
      case 'grammar': return auto ? null : arr(m.g.ex).map((e) => arr(e)[0]);
      case 'news': case 'teaser': return auto ? null : [m.b.sv];
      case 'dialog': return auto ? null : [...feedQ(m, '.flBub [lang]')].map((e) => e.textContent);
      default: return null;
    }
  }

  const feedQ = (m, sel) => { const el = cardEl(m.i); return el ? el.querySelectorAll(sel) : []; };
  // ---------- rendering ----------
  const sv = (s, cls) => `<span class="${cls || ''}" lang="sv">${esc(s)}</span>`;
  const head = (m) => {
    const [e, n] = TYPES[m.t];
    return `<div class="flHead"><span class="flBadge">${e} ${n}</span>${m.lane ? `<span class="flLane">${LANE_LABEL[m.lane] || ''}</span>` : ''}` +
      `${m.b && m.b.d ? `<span class="flLane">${esc(m.b.d.slice(5))}</span>` : ''}</div>`;
  };
  function rail(m) {
    if (m.t === 'stat') return '';
    let note = '';
    if (m.b) note = `<a class="flRb" href="${esc(artHref(m.b))}" aria-label="打开全文"><i>📖</i><b>全文</b></a>`;
    else { const e = tonightEntries(m)[0]; if (e) note = `<a class="flRb" href="${esc(e.href)}" aria-label="完整笔记"><i>📖</i><b>笔记</b></a>`; }
    const on = inTonight(m);
    const muteSp = speechOf(m, false) ? '' : ' dim';
    return `<nav class="flRail" aria-label="操作">` +
      `<button type="button" class="flRb${muteSp}" data-act="speak" aria-label="朗读"><i>🔊</i><b>朗读</b></button>` +
      `<button type="button" class="flRb${on ? ' on' : ''}" data-act="tonight" aria-pressed="${on}" aria-label="今晚细看"><i>🌙</i><b>今晚</b></button>` +
      note + '</nav>';
  }
  const meta = (w) => [w.p, w.g, w.c].filter(Boolean).map((x) => `<span class="flTag">${esc(x)}</span>`).join('') +
    (w.tp && TOP[w.tp] ? `<span class="flTag flTopic">#${esc(TOP[w.tp])}</span>` : '');
  const exHtml = (ex) => (Array.isArray(ex) && ex[0] ? `<p class="flEx">${sv(ex[0])}${ex[1] ? `<span class="flZh">${esc(ex[1])}</span>` : ''}</p>` : '');
  const gloss = (w) => `<b lang="sv">${esc(w.l)}</b> — ${esc(w.zh)}${w.en ? ` <i class="flEn">${esc(w.en)}</i>` : ''}`;
  function verdict(m) {
    if (!m.ans) return '<p class="flVerdict"></p>';
    const ok = m.ans.ok;
    let extra = '';
    if (m.t === 'cloze') extra = `<span class="flVsub"><span lang="sv">${esc(m.cz.before)}<u>${esc(m.cz.ans)}</u>${esc(m.cz.after)}</span><br>${esc(m.cz.s.zh)}</span>`;
    return `<p class="flVerdict show ${ok ? 'ok' : 'no'}">${ok ? '✓ 对了' : '✗ 正确答案'}：${gloss(m.w)}${extra}</p>`;
  }

  function body(m) {
    switch (m.t) {
      case 'word': {
        const w = m.w;
        return {
          main: `<div class="flC"><p class="flBig" lang="sv">${esc(w.l)}</p>${w.ipa ? `<p class="flIpa">${esc(w.ipa)}</p>` : ''}<p class="flTags">${meta(w)}</p>` +
            `<div class="flR"><p class="flZhBig">${esc(w.zh)}</p>${w.en ? `<p class="flEn">${esc(w.en)}</p>` : ''}` +
            `${w.def ? `<p class="flDef">🇸🇪 ${sv(w.def)}</p>` : ''}${exHtml(w.ex)}</div></div>`,
          act: `<div class="flSelf"><button type="button" class="flBtn${m.self === 'mute' ? ' sel' : ''}" data-act="mute">😎 会了</button>` +
            `<button type="button" class="flBtn${m.self === 'unsure' ? ' sel' : ''}" data-act="unsure">🤔 再看看</button></div>`,
          hint: m.self ? '上滑继续 ↑' : '点卡片看中文',
        };
      }
      case 'quiz': {
        const w = m.w;
        const prompt = m.dir === 'sv2zh'
          ? `<p class="flBig" lang="sv">${esc(w.l)}</p><p class="flTags">${meta(w)}</p><p class="flAsk">选出中文意思</p>`
          : `<p class="flBig flBigZh">${esc(zhShort(w.zh))}</p><p class="flTags">${meta({ ...w, tp: '' })}</p><p class="flAsk">用瑞典语怎么说？</p>`;
        return {
          main: `<div class="flC">${prompt}${verdict(m)}</div>`,
          act: `<div class="flOpts q4">${m.opts.map((o, i) => opt(m, o, i, m.dir === 'sv2zh' ? zhShort(o.zh) : o.l, m.dir !== 'sv2zh')).join('')}</div>`,
          hint: m.ans ? '上滑继续 ↑' : '选一个答案',
        };
      }
      case 'cloze': {
        const c = m.cz;
        return {
          main: `<div class="flC"><p class="flSent" lang="sv">${esc(c.before)}<span class="flBlank">${m.ans ? esc(c.ans) : '＿＿＿'}</span>${esc(c.after)}</p>` +
            `<p class="flAsk">填哪个词？（选项是原形）</p>${verdict(m)}</div>`,
          act: `<div class="flOpts q3">${m.opts.map((o, i) => opt(m, o, i, o.l, true)).join('')}</div>`,
          hint: m.ans ? '上滑继续 ↑' : '选一个答案',
        };
      }
      case 'enett': {
        const w = m.w;
        const f = w.f.length >= 4 ? w.f.slice(0, 4) : null;
        const forms = f ? `<div class="flForms" lang="sv">${['单数', '单数定式', '复数', '复数定式'].map((l, i) => `<span><small>${l}</small>${esc(f[i])}</span>`).join('')}</div>` : '';
        return {
          main: `<div class="flC"><p class="flBig" lang="sv"><span class="flArt">${m.ans ? esc(w.g) : '＿＿'}</span> ${esc(w.l)}</p>` +
            `<p class="flAsk">en 还是 ett？</p><div class="flAfter${m.ans ? ' show' : ''}">${verdict(m).replace('flVerdict show', 'flVerdict show flVsmall')}${forms}</div></div>`,
          act: `<div class="flOpts q2">${['en', 'ett'].map((g, i) => {
            const cls = m.ans ? (g === w.g ? ' right' : g === m.ans.pick ? ' wrong' : '') : '';
            return `<button type="button" class="flOpt flBigOpt${cls}" data-act="g" data-v="${g}"${m.ans ? ' disabled' : ''} lang="sv"><kbd>${i + 1}</kbd>${g}</button>`;
          }).join('')}</div>`,
          hint: m.ans ? '上滑继续 ↑' : '选一个',
        };
      }
      case 'sentence': {
        const s = m.s;
        const chips = toW(arr(s.w)).slice(0, 6).map((w) => `<span class="flChip"><b lang="sv">${esc(w.l)}</b><em>${esc(zhShort(w.zh))}</em></span>`).join('');
        return {
          main: `<div class="flC"><p class="flSent flSentBig" lang="sv">${esc(s.sv)}</p><div class="flR"><p class="flZhMid">${esc(s.zh)}</p></div>` +
            (chips ? `<p class="flChips">${chips}</p>` : '') + '</div>',
          hint: '点卡片看中文',
        };
      }
      case 'listen': {
        const s = m.s;
        return {
          main: `<div class="flC"><button type="button" class="flPlay" data-act="play" aria-label="播放">▶</button>` +
            `<p class="flSent flBlur${m.rev >= 1 ? ' clear' : ''}" lang="sv">${esc(s.sv)}</p><div class="flR${m.rev >= 2 ? ' on' : ''}"><p class="flZhMid">${esc(s.zh)}</p></div>` +
            `${canSpeak() ? '' : '<p class="flAsk">这台设备不能朗读——直接点卡片看原文</p>'}</div>`,
          hint: m.rev >= 2 ? '上滑继续 ↑' : m.rev ? '再点一下看中文' : '先听，再点卡片看原文',
        };
      }
      case 'phrase': {
        const p = m.p;
        return {
          main: `<div class="flC"><p class="flBig flBigPh" lang="sv">${esc(p.sv)}</p>${p.cat ? `<p class="flTags"><span class="flTag">${esc(p.cat)}</span></p>` : ''}` +
            `<div class="flR"><p class="flZhBig">${esc(p.zh)}</p>${p.en ? `<p class="flEn">${esc(p.en)}</p>` : ''}${exHtml(p.ex)}</div></div>`,
          hint: '点卡片看中文',
        };
      }
      case 'grammar': {
        const g = m.g;
        const ex = arr(g.ex).slice(0, 2).filter((e) => arr(e)[0]).map((e) => `<li>${sv(e[0])}${e[1] ? `<span class="flZh flRz">${esc(e[1])}</span>` : ''}</li>`).join('');
        return {
          main: `<div class="flC"><p class="flGName" lang="sv">${esc(g.name)}</p>${g.zh ? `<p class="flGZh">${esc(g.zh)}${g.lvl ? ` <span class="flTag">${esc(g.lvl)}</span>` : ''}</p>` : ''}` +
            `${g.tip ? `<p class="flTip">💡 ${esc(g.tip)}</p>` : ''}${ex ? `<ul class="flGEx">${ex}</ul>` : ''}</div>`,
          hint: ex ? '点卡片看例句中文' : '上滑继续',
        };
      }
      case 'news': case 'teaser': {
        const b = m.b;
        const words = toW(arr(b.words)).slice(0, m.t === 'teaser' ? 5 : 4);
        const chips = words.map((w) => `<span class="flChip"><b lang="sv">${esc(w.l)}</b><em>${esc(zhShort(w.zh))}</em></span>`).join('');
        return {
          main: `<div class="flC"><p class="flBTitle"${m.t === 'news' ? ' lang="sv"' : ''}>${esc(b.title)}</p>` +
            `<div class="flFlip"><p class="flBText flSv" lang="sv">${esc(b.sv)}</p>${b.zh ? `<p class="flBText flZhL">${esc(b.zh)}</p>` : ''}</div>` +
            (chips ? `<p class="flChips">${chips}</p>` : '') + '</div>',
          act: m.t === 'teaser' ? `<div class="flSelf"><button type="button" class="flBtn flRead${inTonight(m) ? ' sel' : ''}" data-act="tonight">🌙 今晚读全文</button></div>` : '',
          hint: !b.zh ? '这条暂无中文 · 📖 全文里有翻译' : m.rev ? '再点切回瑞典语' : '点卡片看中文',
        };
      }
      case 'dialog': {
        const b = m.b;
        const who = uniq(arr(b.turns).map((t) => t.who));
        let tl = arr(b.turns).filter((t) => t && t.sv).slice(0, 4);
        if (tl.length > 3 && tl.reduce((n, t) => n + t.sv.length, 0) > 250) tl = tl.slice(0, 3);   // keep it one screen, readable
        const turns = tl.map((t, j) => {
          const side = who.indexOf(t.who) % 2 ? 'r' : 'l';
          const open = m.rev || (m.open && m.open[j]);
          return `<div class="flBub ${side}${open ? ' on' : ''}" data-act="bub" data-j="${j}"><small>${esc(t.who || '')}</small>${sv(t.sv)}` +
            `<span class="flZh">${esc(t.zh || '—')}</span></div>`;
        }).join('');
        return {
          main: `<div class="flC"><p class="flBTitle">${esc(trunc(b.title, 60))}</p><div class="flChat">${turns}</div></div>`,
          hint: '点气泡看这句中文',
        };
      }
      case 'pairs': {
        const done = m.done || {};
        const tile = (side, i, label, isSv) => {
          const sel = m.sel && m.sel.side === side && m.sel.i === i;
          return `<button type="button" class="flTile${done[i] ? ' gone' : ''}${sel ? ' sel' : ''}" data-act="pair" data-side="${side}" data-i="${i}"${done[i] ? ' disabled' : ''}${isSv ? ' lang="sv"' : ''}>${esc(label)}</button>`;
        };
        const fin = Object.keys(done).length === 4;
        const miss = Object.keys(m.miss || {}).length;
        return {
          main: `<div class="flC"><p class="flBig flBigZh">配对 ×4</p><p class="flAsk">点一个瑞典语词，再点它的中文</p>` +
            `<p class="flVerdict${fin ? ' show ' + (miss ? 'no' : 'ok') : ''}">${fin ? (miss ? `✓ 完成 · 配错 ${miss} 个词` : '✓ 全对！') : ''}</p></div>`,
          act: `<div class="flPairs"><div>${m.svOrder.map((i) => tile('sv', i, m.ws[i].l, true)).join('')}</div>` +
            `<div>${(fin ? m.svOrder : m.zhOrder).map((i) => tile('zh', i, zhShort(m.ws[i].zh), false)).join('')}</div></div>`,
          hint: fin ? '上滑继续 ↑' : '配对',
        };
      }
      case 'stat': {
        const d = st.days[today()] || { cards: 0, right: 0, wrong: 0, newWords: 0 };
        const tot = sess.right + sess.wrong;
        const s = streak();
        const left = Math.max(0, st.goal - d.cards);
        return {
          main: `<div class="flC"><p class="flBig flBigZh">${left ? '继续刷 💪' : '今日目标达成 🎉'}</p><div class="flStats">` +
            `<div><b>${sess.cards}</b><span>✅ 这次刷了</span></div><div><b>${sess.newWords}</b><span>🆕 新见的词</span></div>` +
            `<div><b>${tot ? `${sess.right}/${tot}` : '–'}</b><span>🎯 答对</span></div><div><b>${s}</b><span>🔥 连续天数</span></div></div>` +
            `<p class="flAsk">今天 ${d.cards} 张 · 目标 ${st.goal}${left ? ` · 还差 ${left} 张` : ''}${st.tonight.length ? ` · 🌙 今晚细看 ${st.tonight.length} 条` : ''}</p>` +
            (st.tonight.length ? '<p class="flAsk"><a href="../">📅 去 Dagbok 看今晚清单 →</a></p>' : '') + '</div>',
          hint: '上滑继续 ↑',
        };
      }
      default: return { main: '' };
    }
  }
  function opt(m, o, i, label, isSv) {
    let cls = '';
    if (m.ans) cls = o.s === m.w.s ? ' right' : o.s === m.ans.pick ? ' wrong' : ' fade';
    return `<button type="button" class="flOpt${cls}" data-act="opt" data-v="${esc(o.s)}"${m.ans ? ' disabled' : ''}${isSv ? ' lang="sv"' : ''}><kbd>${i + 1}</kbd><span>${esc(label)}</span></button>`;
  }

  function cardHtml(m) {
    const b = body(m);
    return `<div class="flIn">${head(m)}<div class="flMid"><div class="flMain" data-act="rev">${b.main}</div>${rail(m)}</div>` +
      `${b.act ? `<div class="flAct">${b.act}</div>` : ''}<p class="flHint${m.ans || m.self || (m.t === 'pairs' && m.done && Object.keys(m.done).length === 4) ? ' go' : ''}">${b.hint || '上滑继续'}</p>` +
      `<span class="flDeco" aria-hidden="true">${TYPES[m.t][0]}</span></div>`;
  }
  function makeCard(m) {
    const el = document.createElement('section');
    el.className = `flCard t-${m.t}${m.rev ? ' rev' : ''}`;
    el.dataset.i = m.i;
    el.dataset.t = m.t;
    el.setAttribute('aria-roledescription', 'card');
    el.innerHTML = cardHtml(m);
    return el;
  }
  function rerender(m, anim) {
    const el = cardEl(m.i);
    if (!el) return;
    el.className = `flCard t-${m.t}${m.rev ? ' rev' : ''}`;
    if (anim) el.dataset.anim = anim;
    el.innerHTML = cardHtml(m);
    fit(el);
  }
  // Shrink type until the card's content fits its screen — never scroll inside a card.
  function fit(el) {
    const main = el.querySelector('.flMain');
    if (!main || !main.clientHeight) return;
    let k = 1;
    main.style.setProperty('--k', k);
    while (k > 0.5 && (main.scrollHeight > main.clientHeight + 1 || main.scrollWidth > main.clientWidth + 1)) {
      k = Math.round((k - 0.06) * 100) / 100;
      main.style.setProperty('--k', k);
    }
  }

  // ---------- DOM window (recycling) ----------
  const AHEAD = 3, BEHIND = 4;
  const spacer = document.createElement('div');
  spacer.className = 'flSpacer';
  feed.appendChild(spacer);
  let lo = 0;                        // index of the first card in the DOM
  let cur = -1;
  const cardEl = (i) => feed.querySelector(`.flCard[data-i="${i}"]`);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting && e.intersectionRatio >= 0.6) setCurrent(+e.target.dataset.i);
  }, { root: feed, threshold: [0.6] }) : null;

  function mount(m, before) {
    const el = makeCard(m);
    if (before) feed.insertBefore(el, before); else feed.appendChild(el);
    if (io) io.observe(el);
    fit(el);
    return el;
  }
  function unmount(el) { if (io) io.unobserve(el); el.remove(); }
  function ensureWindow() {
    const want = Math.max(cur, 0) + AHEAD;
    while (models.length <= want) if (!genModel()) break;
    const hi = Math.min(models.length - 1, want);
    const newLo = Math.max(0, cur - BEHIND);
    // drop old cards above, keep scroll position via the spacer
    while (lo < newLo) { const el = cardEl(lo); if (el) unmount(el); lo += 1; }
    // restore cards when scrolling back
    while (lo > newLo) { lo -= 1; const first = feed.querySelector('.flCard'); mount(models[lo], first); }
    spacer.style.setProperty('--n', lo);
    let last = feed.lastElementChild;
    let lastI = last && last.classList.contains('flCard') ? +last.dataset.i : lo - 1;
    while (lastI > hi + 2) { unmount(last); last = feed.lastElementChild; lastI = last && last.classList.contains('flCard') ? +last.dataset.i : lo - 1; }
    for (let i = lastI + 1; i <= hi; i += 1) mount(models[i]);
  }

  function setCurrent(i) {
    if (i === cur || !models[i]) return;
    cur = i;
    const m = models[i];
    if (SP && SP.cancel) SP.cancel();
    if (!m.viewed) {
      m.viewed = true;
      if (m.t !== 'stat') {
        const d = dayRec();
        d.cards += 1; sess.cards += 1;
        const t = today();
        for (const k of m.keys) {
          if (k.startsWith('w:') && !st.seen[k]) { d.newWords += 1; sess.newWords += 1; }
          const s = st.seen[k];
          st.seen[k] = [(s ? s[0] : 0) + 1, t];
        }
        save();
        renderTop();
      }
    }
    if (m.t === 'stat') rerender(m);
    ensureWindow();
    if (m.t === 'listen') setTimeout(() => { if (cur === i) say([m.s.sv], true); }, 350);
    else if (st.prefs.autoSpeak && ['word', 'phrase', 'sentence'].includes(m.t)) setTimeout(() => { if (cur === i) say(speechOf(m, true), true); }, 250);
  }

  function go(i) {
    if (i < 0) return;
    if (i >= models.length) ensureWindow();
    const el = cardEl(i);
    if (el) feed.scrollTo({ top: el.offsetTop, behavior: reduced() ? 'auto' : 'smooth' });
  }

  // ---------- interactions ----------
  // quiz / cloze: v = chosen slug; enett: v = 'en' | 'ett'
  function answer(m, v) {
    if (m.ans) return;
    const ok = m.t === 'enett' ? v === m.w.g : v === m.w.s;
    m.ans = { ok, pick: v };
    ovaRecord(m.w.s, ok);
    score(ok);
    if (!ok) retries.push({ t: m.t, slug: m.w.s, dueAt: m.i + rnd(4, 7) });
    rerender(m, ok ? 'ok' : 'no');
  }
  function tapPair(m, side, i, el) {
    m.done = m.done || {}; m.miss = m.miss || {};
    if (m.done[i] !== undefined || Object.keys(m.done).length === 4) return;
    if (!m.sel || m.sel.side === side) { m.sel = { side, i }; rerender(m); return; }
    const svI = side === 'sv' ? i : m.sel.i;
    const zhI = side === 'zh' ? i : m.sel.i;
    m.sel = null;
    if (svI === zhI) {
      m.done[svI] = 1;
      if (!m.miss[svI]) ovaRecord(m.ws[svI].s, true);
      if (Object.keys(m.done).length === 4) {
        const missed = Object.keys(m.miss);
        score(!missed.length);
        if (missed.length) retries.push({ t: 'quiz', slug: m.ws[+missed[0]].s, dueAt: m.i + rnd(4, 7) });
        rerender(m, missed.length ? 'no' : 'ok');
      } else rerender(m, 'pair');
    } else {
      if (!m.miss[svI]) { m.miss[svI] = 1; ovaRecord(m.ws[svI].s, false); }
      rerender(m);
      const card = cardEl(m.i);
      card && card.querySelectorAll(`.flTile[data-side="sv"][data-i="${svI}"], .flTile[data-side="zh"][data-i="${zhI}"]`).forEach((t) => t.classList.add('bad'));
      if (st.prefs.vibrate && navigator.vibrate) { try { navigator.vibrate(30); } catch (_e) {} }
    }
  }
  function reveal(m, el) {
    if (['quiz', 'cloze', 'enett', 'pairs', 'stat'].includes(m.t) || (m.b && m.t !== 'dialog' && !m.b.zh)) return;
    if (m.t === 'listen') { m.rev = (m.rev + 1) % 3; rerender(m); return; }
    m.rev = m.rev ? 0 : 1;
    if (m.t === 'dialog') { m.open = {}; rerender(m); return; }
    el.classList.toggle('rev', !!m.rev);
    const h = el.querySelector('.flHint');
    if (h && (m.t === 'news' || m.t === 'teaser')) h.textContent = m.rev ? '再点切回瑞典语' : '点卡片看中文';
  }
  function setSelf(m, kind) {
    const s = m.w.s;
    if (kind === 'mute') { st.mute[s] = 1; delete st.unsure[s]; toast('😎 好！这个词不再出词卡'); }
    else {
      st.unsure[s] = today();
      if (m.self !== 'unsure') retries.push({ t: 'word', slug: s, dueAt: m.i + rnd(5, 8) });
      toast('🤔 过几张再见，明天再复习');
    }
    m.self = kind;
    m.rev = 1;
    dueCache = null;
    save();
    rerender(m, 'self');
  }

  feed.addEventListener('click', (e) => {
    const card = e.target.closest('.flCard');
    if (!card) return;
    const m = models[+card.dataset.i];
    if (!m) return;
    const a = e.target.closest('[data-act]');
    if (!a || e.target.closest('a')) return;
    const act = a.dataset.act;
    if (act === 'opt' || act === 'g') answer(m, a.dataset.v);
    else if (act === 'pair') tapPair(m, a.dataset.side, +a.dataset.i, a);
    else if (act === 'mute' || act === 'unsure') setSelf(m, act);
    else if (act === 'tonight') toggleTonight(m);
    else if (act === 'speak') { const p = speechOf(m, false); if (p) say(p); else toast('答完再听 🙂'); }
    else if (act === 'play') say([m.s.sv]);
    else if (act === 'bub') {
      const j = +a.dataset.j;
      m.open = m.open || {};
      m.open[j] = !(m.rev || m.open[j]);
      if (m.rev) { m.rev = 0; arr(m.b.turns).forEach((_, k) => { if (k !== j) m.open[k] = 1; }); }
      a.classList.toggle('on', !!m.open[j]);
    } else if (act === 'rev') reveal(m, card);
  });

  // ---------- header / toast / settings ----------
  const topEl = $('flTop');
  let moveT = 0;
  feed.addEventListener('scroll', () => {
    topEl.classList.add('moving');
    clearTimeout(moveT);
    moveT = setTimeout(() => topEl.classList.remove('moving'), 450);
  }, { passive: true });

  let toastT = 0;
  function toast(msg) {
    const t = $('flToast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 1800);
  }

  const sheet = $('flSheetWrap');
  function syncSheet() {
    document.querySelectorAll('#flGoalSeg button').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.goal === st.goal)));
    $('flAuto').checked = st.prefs.autoSpeak;
    $('flVib').checked = st.prefs.vibrate;
    $('flRate').value = st.prefs.rate;
    $('flRateVal').textContent = `${st.prefs.rate.toFixed(2)}×`;
    $('flMuteN').textContent = Object.keys(st.mute).length;
    $('flInfo').textContent = D ? `数据 ${str(D.latest || '')} · 词 ${W.length} · 句 ${SN.length} · 词组 ${PH.length} · 语法 ${GR.length} · 素材 ${BI.length}` +
      (lsSet('flode.probe', '1') ? '' : ' · ⚠️ 浏览器不允许保存，进度不会保留') : '';
  }
  function openSheet() { syncSheet(); sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('open')); }
  function closeSheet() { sheet.classList.remove('open'); setTimeout(() => { sheet.hidden = true; }, reduced() ? 0 : 200); }
  $('flGear').addEventListener('click', openSheet);
  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return closeSheet();
    const g = e.target.closest('[data-goal]');
    if (g) { st.goal = +g.dataset.goal; save(); syncSheet(); renderTop(); }
  });
  $('flAuto').addEventListener('change', (e) => { st.prefs.autoSpeak = e.target.checked; save(); });
  $('flVib').addEventListener('change', (e) => { st.prefs.vibrate = e.target.checked; save(); });
  $('flRate').addEventListener('input', (e) => { st.prefs.rate = Math.round(Number(e.target.value) * 100) / 100; $('flRateVal').textContent = `${st.prefs.rate.toFixed(2)}×`; save(); });
  $('flRateTry').addEventListener('click', () => say(['Hej! Det här är min röst.']));
  $('flUnmute').addEventListener('click', () => { const n = Object.keys(st.mute).length; st.mute = {}; save(); syncSheet(); toast(n ? `已恢复 ${n} 个词` : '没有静音的词'); });

  // ---------- keyboard (desktop) ----------
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (!sheet.hidden) { if (e.key === 'Escape') closeSheet(); return; }
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    const m = models[cur];
    const card = m && cardEl(cur);
    const k = e.key;
    if (k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'j') { e.preventDefault(); go(cur + 1); }
    else if (k === 'ArrowUp' || k === 'PageUp' || k === 'k') { e.preventDefault(); go(cur - 1); }
    else if (!m || !card) return;
    else if (k === 'Enter') { e.preventDefault(); if (!e.target.closest('button, a')) reveal(m, card); else e.target.click(); }
    else if (/^[1-4]$/.test(k)) {
      const n = +k - 1;
      if (m.t === 'quiz' || m.t === 'cloze') { if (m.opts[n]) answer(m, m.opts[n].s); }
      else if (m.t === 'enett') { if (n < 2) answer(m, ['en', 'ett'][n]); }
      else if (m.t === 'word') { if (n < 2) setSelf(m, n ? 'unsure' : 'mute'); }
    }
  });

  let rT = 0;
  window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => feed.querySelectorAll('.flCard').forEach(fit), 120); });

  // ---------- start ----------
  renderTop();
  if (!D || !W.length) {
    feed.innerHTML = `<section class="flCard flEmpty"><div class="flIn"><div class="flMain"><div class="flC"><p class="flBig flBigZh">🌊</p>` +
      `<p class="flAsk">${D ? '数据里还没有单词。' : '找不到 <code>flode-data.js</code> —— 请先运行 <code>node tools/build-flode-data.js</code>。'}</p></div></div></div></section>`;
    return;
  }
  ensureWindow();
  if (!io) feed.addEventListener('scroll', () => { const i = lo + Math.round((feed.scrollTop - spacer.offsetHeight) / feed.clientHeight); setCurrent(i); }, { passive: true });
  setCurrent(0);
  window.__flode = { models, st, get cur() { return cur; }, go };   // test hook
})();

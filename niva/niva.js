/* 🪜 Nivå — 按级别集中学 (see SPEC.md, the design authority).
 *   #                       the ladder: A1 → A2 → B1 → B2+, one card per level with its progress
 *   #lv=A2&sec=read&i=<id>  one level: 7 sections (语法 · 单词 · 词组 · 阅读 · 情景 · 听力 · 课文), each in a
 *                           fixed order (SPEC §4); every row links to the page where the material lives.
 * Data: niva-data.js (window.NIVA_DATA, SPEC §10). Own state: niva.state.v1 (grammar ✓, last place, filters).
 * Read-only: ova.state.v1 (Öva boxes), flode.state.v1 (mute), kurs.state.v1 (lessons), ReadSync (已读). */
(function () {
  'use strict';

  const D = window.NIVA_DATA;
  const main = document.getElementById('nvMain');

  // ---------- helpers ----------
  const str = (x) => (x == null ? '' : String(x));
  const esc = (s) => str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const enc = encodeURIComponent;
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const arr = (x) => (Array.isArray(x) ? x : []);
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const num = (n) => Number(n || 0).toLocaleString('sv-SE');
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (_e) { return false; } };
  const parse = (raw) => { try { return JSON.parse(raw || 'null'); } catch (_e) { return null; } };
  const fmtDur = (s) => { s = Math.round(Number(s) || 0); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };

  let toastT = 0;
  function toast(msg) {
    const t = document.getElementById('nvToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 1800);
  }

  if (!D || !Array.isArray(D.levels)) {
    main.innerHTML = '<header class="nvHead"><h1>🪜 Nivå</h1></header>' +
      '<p class="nvEmpty">⚠️ 找不到 <code>niva-data.js</code>。请先运行 <code>node tools/build-reading-site.js &amp;&amp; node tools/build-niva-data.js</code>' +
      '（GitHub Action 发布网站时会自动生成）。</p>';
    return;
  }

  // ---------- levels & sections ----------
  const LEVELS = D.levels;
  const LEVEL_IDS = LEVELS.map((l) => l.id);
  const lvLabel = (id) => (id === 'B2' ? 'B2+' : id);
  const nextLevel = (id) => LEVEL_IDS[LEVEL_IDS.indexOf(id) + 1] || '';
  const SECTIONS = [
    { id: 'grammar', icon: '📗', name: '语法', done: '学过', todo: '只看没学的' },
    { id: 'words', icon: '🔤', name: '单词', done: '会', todo: '只看没会的' },
    { id: 'phrases', icon: '🧩', name: '词组', done: '会', todo: '只看没会的' },
    { id: 'read', icon: '📖', name: '阅读', done: '已读', todo: '只看没读的' },
    { id: 'tala', icon: '🗣️', name: '情景', done: '已读', todo: '只看没读的' },
    { id: 'listen', icon: '🎧', name: '听力', done: '听过', todo: '只看没听的' },
    { id: 'kurs', icon: '📘', name: '课文', done: '学完', todo: '只看没学完的' },
  ];
  const SEC = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
  const SEC_IDS = SECTIONS.map((s) => s.id);

  const BY = {};
  for (const id of LEVEL_IDS) BY[id] = { grammar: [], words: [], phrases: [], read: [], tala: [], listen: [], kurs: [] };
  const put = (sec, it) => { if (BY[it.lv]) BY[it.lv][sec].push(it); };
  arr(D.grammar).forEach((g) => put('grammar', g));
  arr(D.words).forEach((w) => put('words', w));
  arr(D.phrases).forEach((p) => put('phrases', p));
  arr(D.texts).forEach((t) => put(t.page === 'tala' ? 'tala' : 'read', t));
  arr(D.listen).forEach((e) => put('listen', e));
  arr(D.kurs).forEach((k) => put('kurs', k));
  const topicZh = isObj(D.topics) ? D.topics : {};

  // ---------- state ----------
  const LS = 'niva.state.v1';
  function loadState() {
    const o = parse(lsGet(LS));
    const s = isObj(o) ? o : {};
    s.v = 1;
    if (!isObj(s.grammar)) s.grammar = {};
    if (!isObj(s.only)) s.only = {};
    if (!isObj(s.lastSec)) s.lastSec = {};
    if (!isObj(s.last) || !BY[s.last.lv]) s.last = null;
    return s;
  }
  let st = loadState();
  // Re-read before every write so a second tab's changes survive; unknown keys are kept.
  function mutate(fn) {
    st = loadState();
    fn(st);
    lsSet(LS, JSON.stringify(st));
  }

  // Other pages' progress, read fresh on every render.
  function others() {
    const ova = parse(lsGet('ova.state.v1'));
    const fl = parse(lsGet('flode.state.v1'));
    const ku = parse(lsGet('kurs.state.v1'));
    return {
      boxes: isObj(ova) && isObj(ova.cards) ? ova.cards : {},
      mute: isObj(fl) && isObj(fl.mute) ? fl.mute : {},
      lessons: isObj(ku) && isObj(ku.lessons) ? ku.lessons : {},
    };
  }
  const isRead = (id) => { try { return !!(window.ReadSync && window.ReadSync.isRead(id)); } catch (_e) { return false; } };

  // 2 = 会 · 1 = 复习中 · 0 = 还没学 (SPEC §5.1)
  function wordStatus(w, X) {
    if (w.k || X.mute[w.s]) return 2;
    const c = X.boxes[w.s];
    if (isObj(c)) return Number(c.b) >= 4 ? 2 : 1;
    return 0;
  }
  const phraseStatus = (p, X) => (p.k || X.mute[p.s] ? 2 : 0);
  // Paragraphs finished in 📘 Kurs (its own rule: 读 + 拆 + 词 + 练 all reached).
  function kursParas(k, X) {
    const l = X.lessons[k.s];
    if (!isObj(l) || !isObj(l.paras)) return 0;
    let n = 0;
    for (const [key, q] of Object.entries(l.paras)) {
      if (Number(key) >= 100 || !isObj(q)) continue;
      if (q.read && arr(q.sents).length && q.words && q.quiz) n += 1;
    }
    return k.paras ? Math.min(n, k.paras) : n;
  }
  function isDone(sec, it, X) {
    switch (sec) {
      case 'grammar': return !!st.grammar[it.s];
      case 'words': return wordStatus(it, X) === 2;
      case 'phrases': return phraseStatus(it, X) === 2;
      case 'read': case 'tala': return isRead(it.s);
      case 'listen': return isRead('lyssna:' + it.id);
      case 'kurs': return isRead(it.s) || (it.paras > 0 && kursParas(it, X) >= it.paras);
      default: return false;
    }
  }
  // Level progress = mean completion of the sections that have material at this level.
  function progress(lv, X) {
    const secs = SECTIONS.map((s) => {
      const items = BY[lv][s.id];
      let done = 0;
      for (const it of items) if (isDone(s.id, it, X)) done += 1;
      return { id: s.id, n: items.length, done };
    });
    const have = secs.filter((s) => s.n);
    const frac = have.length ? have.reduce((a, s) => a + s.done / s.n, 0) / have.length : 0;
    return { secs, pct: Math.round(frac * 100), sec: Object.fromEntries(secs.map((s) => [s.id, s])) };
  }

  function ring(pct, cls) {
    const r = 18; const c = 2 * Math.PI * r; const f = Math.max(0, Math.min(100, pct)) / 100;
    return `<svg class="nvRing ${cls || ''}" viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="${r}" class="nvRingBg"/>` +
      (f > 0 ? `<circle cx="23" cy="23" r="${r}" class="nvRingFg" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 23 23)"/>` : '') +
      `<text x="23" y="27" text-anchor="middle">${pct}%</text></svg>`;
  }

  // ---------- routing ----------
  // Pages that link back here pass the whole hash as one encoded value (…/niva/#lv%3DA2%26sec%3Dread),
  // so decode before parsing.
  function readHash() {
    let raw = (location.hash || '').replace(/^#/, '');
    try { raw = decodeURIComponent(raw); } catch (_e) { /* keep as is */ }
    const h = new URLSearchParams(raw);
    return {
      lv: LEVEL_IDS.includes(h.get('lv')) ? h.get('lv') : '',
      sec: SEC_IDS.includes(h.get('sec')) ? h.get('sec') : '',
      item: h.get('i') || '',
    };
  }
  const hashFor = (lv, sec, item) => `#lv=${lv}${sec ? `&sec=${sec}` : ''}${item ? `&i=${enc(item)}` : ''}`;
  let view = null;   // { lv, sec } currently on screen

  function route(opts) {
    const h = readHash();
    if (h.lv) renderLevel(h.lv, h.sec, h.item, opts);
    else renderLadder();
  }
  function goLevel(lv, sec) {
    try { history.pushState({ nv: 1 }, '', hashFor(lv, sec)); } catch (_e) { location.hash = hashFor(lv, sec); return; }
    route({ top: true });
  }
  function goLadder() {
    if (history.state && history.state.nv) { history.back(); return; }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_e) { /* ignore */ }
    route({ top: true });
  }
  window.addEventListener('popstate', () => route({ top: true }));
  window.addEventListener('hashchange', () => {
    const h = readHash();
    if (!view || h.lv !== view.lv || (h.sec && h.sec !== view.sec)) route({ top: true });
  });

  // ---------- ladder ----------
  function renderLadder() {
    view = null;
    document.title = 'Nivå — 按级别学 · svensk_agent';
    const X = others();
    let h = '<header class="nvHead"><h1>🪜 Nivå <small>按级别学</small></h1>' +
      '<p>一级一级来：每一级的语法、单词、词组、阅读、情景、听力和课文都在一页里，由易到难排好。学完一级，再进下一级。</p></header>';
    const last = st.last;
    if (last && SEC[last.sec]) {
      h += `<a class="nvResume" href="${hashFor(last.lv, last.sec)}" data-go="${last.lv}" data-sec="${last.sec}">` +
        '<span class="nvResumeK">▶ 继续上次</span>' +
        `<span class="nvResumeT"><span class="nvLvBadge lv-${last.lv}">${lvLabel(last.lv)}</span> ${SEC[last.sec].icon} ${SEC[last.sec].name}</span></a>`;
    }
    h += '<ol class="nvLadder">';
    for (const L of LEVELS) {
      const p = progress(L.id, X);
      const counts = p.secs.map((s) => `<span class="${s.n ? '' : 'zero'}" title="${SEC[s.id].name}">${SEC[s.id].icon} ${num(s.n)}</span>`).join('');
      h += `<li><a class="nvLevel" href="${hashFor(L.id)}" data-go="${L.id}">` +
        `<span class="nvLvBadge big lv-${L.id}">${lvLabel(L.id)}</span>` +
        `<span class="nvLvTxt"><span class="nvLvName">${esc(L.name)} <span class="nvSfi">≈ ${esc(L.sfi)}</span></span>` +
        `<span class="nvCan">${esc(L.can)}</span><span class="nvCounts">${counts}</span></span>` +
        `${ring(p.pct, p.pct >= 100 ? 'full' : '')}</a></li>`;
    }
    h += '</ol>';
    h += '<p class="nvFoot">级别取自笔记和文章自己标的 CEFR。标区间的（如 A2–B1）放在低一级末尾的「🌉 过渡」；' +
      '没标级别的按用词推断，显示「≈」。进度 = 本级各分区完成比例的平均。</p>';
    main.innerHTML = h;
  }

  // ---------- level page ----------
  const openState = new Map();   // `${lv}|${sec}|${group}` → open?  (this tab only)
  const isOpenG = (key, dflt) => (openState.has(key) ? openState.get(key) : dflt);

  // Remember where he was — only on his own navigation. Re-renders triggered by another tab or by
  // ReadSync are `passive` and never write, so two open tabs cannot ping-pong storage events.
  function remember(lv, sec) {
    if (st.last && st.last.lv === lv && st.last.sec === sec && st.lastSec[lv] === sec) return;
    mutate((s) => { s.last = { lv, sec }; s.lastSec[lv] = sec; });
  }

  function renderLevel(lv, sec, item, opts) {
    opts = opts || {};
    const L = LEVELS.find((x) => x.id === lv);
    const X = others();
    const p = progress(lv, X);
    if (!sec) {
      const first = SECTIONS.find((s) => p.sec[s.id].n);
      sec = SEC[st.lastSec[lv]] ? st.lastSec[lv] : (first ? first.id : 'grammar');
    }
    const same = view && view.lv === lv;
    view = { lv, sec };
    if (!opts.passive) remember(lv, sec);
    document.title = `Nivå ${lvLabel(lv)} · ${SEC[sec].name} — svensk_agent`;

    const i = LEVEL_IDS.indexOf(lv);
    const prev = LEVEL_IDS[i - 1];
    const next = LEVEL_IDS[i + 1];
    let h = '<header class="nvTop">' +
      '<button type="button" class="nvIcon" data-act="ladder" aria-label="返回阶梯" title="返回阶梯">←</button>' +
      `<div class="nvTopMid"><h1><span class="nvLvBadge lv-${lv}">${lvLabel(lv)}</span> ${esc(L.name)}</h1>` +
      `<span class="nvSfi">≈ ${esc(L.sfi)}</span></div>` +
      '<span class="nvStep">' +
      (prev ? `<a class="nvMini" href="${hashFor(prev)}" data-go="${prev}" aria-label="上一级 ${lvLabel(prev)}">‹ ${lvLabel(prev)}</a>` : '') +
      (next ? `<a class="nvMini" href="${hashFor(next)}" data-go="${next}" aria-label="下一级 ${lvLabel(next)}">${lvLabel(next)} ›</a>` : '') +
      '</span></header>';
    const sentences = (D.sentences && D.sentences[lv]) || 0;
    h += '<section class="nvSummary">' +
      `<p class="nvCan">${esc(L.can)}</p>` +
      `<div class="nvProg"><div class="nvBar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}" aria-label="本级进度">` +
      `<span style="width:${p.pct}%"></span></div><b>${p.pct}%</b></div>` +
      (sentences ? `<p class="nvSmall">💬 本级还有 ${num(sentences)} 个例句，分散在这一级的语法笔记和文章里。</p>` : '') +
      '</section>';
    h += '<div class="nvTabs" role="tablist" aria-label="分区">' + SECTIONS.map((s) => {
      const c = p.sec[s.id];
      return `<button type="button" role="tab" class="nvTab${s.id === sec ? ' on' : ''}${c.n ? '' : ' zero'}" data-sec="${s.id}" ` +
        `aria-selected="${s.id === sec}"><span class="nvTabI" aria-hidden="true">${s.icon}</span><span class="nvTabN">${s.name}</span>` +
        `<span class="nvTabC">${c.n ? `${num(c.done)}/${num(c.n)}` : '0'}</span></button>`;
    }).join('') + '</div>';
    h += `<section class="nvSec" id="nvSec" role="tabpanel" aria-label="${SEC[sec].name}">${sectionHtml(lv, sec, X, p.sec[sec], item)}</section>`;

    const keepY = window.scrollY;
    main.innerHTML = h;
    const tabsEl = main.querySelector('.nvTabs');
    const tab = main.querySelector('.nvTab.on');
    if (tabsEl && tab) tabsEl.scrollLeft = Math.max(0, tab.offsetLeft - (tabsEl.clientWidth - tab.offsetWidth) / 2);
    if (item) {
      focusItem(item);
      // Landed back on the row he left from: drop the marker so later re-renders don't jump again.
      try { history.replaceState(history.state, '', hashFor(lv, sec)); } catch (_e) { /* ignore */ }
    } else if (opts.top && !same) window.scrollTo(0, 0);
    else if (opts.tab) { if (tabsEl && tabsEl.getBoundingClientRect().top < 0) tabsEl.scrollIntoView({ block: 'start' }); }
    else { window.scrollTo(0, keepY); reflash(); }
  }

  // The highlight outlives re-renders (ReadSync usually repaints right after he lands back here).
  let flash = { id: '', until: 0 };
  const rowById = (id) => {
    const sel = window.CSS && window.CSS.escape ? window.CSS.escape(id) : id.replace(/["\\]/g, '\\$&');
    return main.querySelector(`[data-id="${sel}"]`);
  };
  function focusItem(id) {
    const row = rowById(id);
    if (!row) return;
    const det = row.closest('details');
    if (det && !det.open) det.open = true;
    row.scrollIntoView({ block: 'center' });
    flash = { id, until: Date.now() + 1600 };
    row.classList.add('flash');
  }
  function reflash() {
    if (!flash.id || Date.now() > flash.until) return;
    const row = rowById(flash.id);
    if (!row) return;
    row.style.animationDelay = `-${1600 - (flash.until - Date.now())}ms`;
    row.classList.add('flash');
  }

  // ---------- sections ----------
  function backParam(lv, sec, id) { return `from=${enc(`lv=${lv}&sec=${sec}&i=${id}`)}&frompage=niva`; }
  function hrefOf(lv, sec, it) {
    switch (sec) {
      case 'read': return `../reading/#article=${enc(it.s)}&${backParam(lv, sec, it.s)}`;
      case 'tala': return `../tala/#article=${enc(it.s)}&${backParam(lv, sec, it.s)}`;
      case 'listen': return `../listening/#ep=${enc(it.id)}&${backParam(lv, sec, it.id)}`;
      case 'kurs': return `../kurs/#l=${enc(it.s)}&${backParam(lv, sec, it.s)}`;
      default: return `../sok/#note=${enc(it.s)}`;
    }
  }

  function sectionHtml(lv, sec, X, count, item) {
    const S = SEC[sec];
    const only = !!st.only[sec];
    let h = `<div class="nvSecHead"><h2>${S.icon} ${S.name} <span class="nvSecCount">${S.done} ${num(count.done)} / ${num(count.n)}</span></h2>` +
      (count.n ? `<button type="button" class="nvMini${only ? ' on' : ''}" data-act="only" aria-pressed="${only}">${only ? '☑' : '☐'} ${S.todo}</button>` : '') +
      '</div>';
    if (!count.n) return h + emptyHtml(lv, sec);
    switch (sec) {
      case 'grammar': return h + grammarHtml(lv, X, only, item);
      case 'words': return h + wordsHtml(lv, X, only, item);
      case 'phrases': return h + phrasesHtml(lv, X, only, item);
      case 'read': case 'tala': return h + textsHtml(lv, sec, only);
      case 'listen': return h + listenHtml(lv, only);
      case 'kurs': return h + kursHtml(lv, X, only);
      default: return h;
    }
  }

  function emptyHtml(lv, sec) {
    const S = SEC[sec];
    const tips = {
      listen: '可以先在 🗣️ 情景 里用「🎧 只听全文 / 🗣️ 跟读」练听力——瑞典语语音会把对话读出来。',
      kurs: '课文 = 带「🔍 逐段精读」的教材文章；拍课本照片录入后会出现在这里。',
      read: '这一级的阅读文章还很少，可以先读 🗣️ 情景。',
      tala: '',
    };
    return `<p class="nvEmpty">本级还没有${S.name}材料。${tips[sec] ? `<br>${esc(tips[sec])}` : ''}</p>`;
  }

  // A collapsible group. `rows` is either an HTML string or a function that builds it on first open
  // (the word lists run to 1 500 rows, so closed groups stay empty until opened).
  function group(lv, sec, key, title, meta, rows, dflt, note, force) {
    const k = `${lv}|${sec}|${key}`;
    const open = force || isOpenG(k, dflt);
    const lazy = typeof rows === 'function';
    const body = open ? (lazy ? rows() : rows) : (lazy ? '' : rows);
    if (lazy) lazyRows.set(k, rows);
    return `<details class="nvGroup" data-g="${esc(k)}"${open ? ' open' : ''}${lazy && !open ? ' data-lazy="1"' : ''}>` +
      `<summary><span class="nvGT">${title}</span>${meta ? `<span class="nvGM">${meta}</span>` : ''}</summary>` +
      (note ? `<p class="nvGNote">${note}</p>` : '') +
      `<ul class="nvRows">${body}</ul></details>`;
  }
  const lazyRows = new Map();

  // 📗 语法 — 核心 / 常用 / 细节 by how often the point is linked (SPEC §4.4); ranges → 🌉.
  function grammarHtml(lv, X, only, item) {
    const all = BY[lv].grammar;
    const row = (g) => {
      const done = !!st.grammar[g.s];
      return `<li class="nvRow nvGram${done ? ' done' : ''}" data-id="${esc(g.s)}">` +
        `<button type="button" class="nvCheck" data-act="gram" data-s="${esc(g.s)}" aria-pressed="${done}" ` +
        `aria-label="${done ? '取消「学过」' : '标记为学过'}" title="${done ? '取消「学过」' : '标记为学过'}">${done ? '✓' : ''}</button>` +
        `<a class="nvRowMain" href="${hrefOf(lv, 'grammar', g)}" data-keep="${esc(g.s)}">` +
        `<span class="nvRowT"><span lang="sv">${esc(g.n)}</span> <span class="nvZh">${esc(g.zh)}</span></span>` +
        (g.one ? `<span class="nvRowSub">${esc(g.one)}</span>` : '') + '</a></li>';
    };
    const pick = (f) => all.filter(f).filter((g) => !only || !st.grammar[g.s]);
    const tiers = [
      ['t1', '核心', '被引用最多、最常见，先学这些', (g) => !g.br && g.tier === 1, true],
      ['t2', '常用', '', (g) => !g.br && g.tier === 2, true],
      ['t3', '细节', '多是具体用法和固定句型', (g) => !g.br && g.tier === 3, false],
      ['br', `🌉 过渡 → ${lvLabel(nextLevel(lv)) || '更高'}`, '标着区间（如 A2–B1）的语法点：学完本级再看', (g) => g.br, false],
    ];
    let h = '<p class="nvHint">点左边的 ○ 标记「学过」；点名字打开完整笔记（例句、变形、对比）。</p>';
    for (const [key, title, note, f, dflt] of tiers) {
      const list = pick(f);
      const total = all.filter(f);
      if (!total.length) continue;
      const done = total.filter((g) => st.grammar[g.s]).length;
      const hasItem = !!item && list.some((g) => g.s === item);
      h += group(lv, 'grammar', key, title, `${done}/${total.length}`, list.length ? list.map(row).join('') : allDoneRow(), dflt, note, hasItem);
    }
    return h;
  }
  const allDoneRow = () => '<li class="nvAllDone">这一组都完成了 ✓</li>';

  // 🔤 单词 — by topic (biggest first), words without a topic by word class; common words first.
  const POS_ZH = { substantiv: '名词', verb: '动词', adjektiv: '形容词', adverb: '副词' };
  function wordsHtml(lv, X, only, item) {
    const all = BY[lv].words;
    const groups = new Map();
    for (const w of all) {
      const key = w.tp && topicZh[w.tp] ? w.tp : `pos:${POS_ZH[w.p] ? w.p : 'other'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(w);
    }
    const titleOf = (key) => (key.startsWith('pos:') ? `${POS_ZH[key.slice(4)] || '其他词'}（未分主题）` : topicZh[key]);
    const keys = [...groups.keys()].sort((a, b) => (a.startsWith('pos:') ? 1 : 0) - (b.startsWith('pos:') ? 1 : 0) ||
      groups.get(b).length - groups.get(a).length || str(titleOf(a)).localeCompare(str(titleOf(b)), 'zh'));
    const order = (a, b) => (a.fq ? 0 : 1) - (b.fq ? 0 : 1) || a.fq - b.fq || a.l.localeCompare(b.l, 'sv');
    const row = (w) => {
      const s = wordStatus(w, X);
      return `<li><a class="nvRow nvWord s${s}" href="${hrefOf(lv, 'words', w)}" data-id="${esc(w.s)}" data-keep="${esc(w.s)}">` +
        `<span class="nvMark" aria-label="${['还没学', '复习中', '会'][s]}">${['○', '◐', '✓'][s]}</span>` +
        `<span class="nvRowT"><span lang="sv" class="nvSv">${esc(w.l)}</span>${w.g ? ` <span class="nvG">${esc(w.g)}</span>` : ''}` +
        ` <span class="nvZh">${esc(w.zh)}</span></span></a></li>`;
    };
    const known = all.filter((w) => wordStatus(w, X) === 2).length;
    let h = `<p class="nvHint">✓ 会 · ◐ 复习中 · ○ 还没学。「会」= 知识库标了 known、Öva 复习到第 4 箱以上，或在 Flöde 里点过「😎 会了」。` +
      `<a class="nvLinkBtn" href="../ova/#deck=all&level=${lv}">🔁 在 Öva 里复习${lvLabel(lv)}单词 →</a></p>`;
    if (only && known === all.length) return h + `<ul class="nvRows">${allDoneRow()}</ul>`;
    for (const key of keys) {
      const list = groups.get(key).slice().sort(order);
      const done = list.filter((w) => wordStatus(w, X) === 2).length;
      const shown = only ? list.filter((w) => wordStatus(w, X) !== 2) : list;
      if (!shown.length) continue;
      const hasItem = !!item && shown.some((w) => w.s === item);
      h += group(lv, 'words', key, esc(titleOf(key)), `${done}/${list.length}`, () => shown.map(row).join(''), false, '', hasItem);
    }
    return h;
  }

  // 🧩 词组 — by kind; levels marked ≈ were inferred from their words (SPEC §4.2).
  const PHRASE_GROUPS = [
    ['fras', '💬 日常与情景用语'], ['partikel', '🔗 小品词动词 partikelverb'], ['verb', '🧲 动词搭配'],
    ['prep', '📍 介词短语'], ['tid', '🕒 时间表达'], ['fast', '📌 固定表达'], ['diskurs', '🧵 连接与论述'],
    ['idiom', '🎭 习语'], ['ovrigt', '其他'],
  ];
  function phrasesHtml(lv, X, only, item) {
    const all = BY[lv].phrases;
    const row = (p) => {
      const s = phraseStatus(p, X);
      return `<li><a class="nvRow nvWord s${s}" href="${hrefOf(lv, 'phrases', p)}" data-id="${esc(p.s)}" data-keep="${esc(p.s)}">` +
        `<span class="nvMark" aria-label="${s ? '会' : '还没学'}">${s ? '✓' : '○'}</span>` +
        `<span class="nvRowT"><span lang="sv" class="nvSv">${esc(p.sv)}</span> <span class="nvZh">${esc(p.zh)}</span>` +
        `${p.inf ? ' <span class="nvChip" title="级别是按词组里最难的词推断的">≈</span>' : ''}</span></a></li>`;
    };
    let h = '<p class="nvHint">带「≈」的词组没有标级别，按其中最难的词推断。「会」= 知识库标了 known，或在 Flöde 里点过「😎 会了」。</p>';
    let any = false;
    for (const [key, title] of PHRASE_GROUPS) {
      const list = all.filter((p) => p.cat === key && !p.br).sort((a, b) => a.sv.localeCompare(b.sv, 'sv'));
      if (!list.length) continue;
      const done = list.filter((p) => phraseStatus(p, X) === 2).length;
      const shown = only ? list.filter((p) => phraseStatus(p, X) !== 2) : list;
      if (!shown.length) continue;
      any = true;
      const hasItem = !!item && shown.some((p) => p.s === item);
      h += group(lv, 'phrases', key, title, `${done}/${list.length}`, () => shown.map(row).join(''), false, '', hasItem);
    }
    const br = all.filter((p) => p.br);
    if (br.length) {
      const shown = only ? br.filter((p) => phraseStatus(p, X) !== 2) : br;
      const hasItem = !!item && shown.some((p) => p.s === item);
      if (shown.length) { any = true; h += group(lv, 'phrases', 'br', `🌉 过渡 → ${lvLabel(nextLevel(lv))}`, `${br.length}`, () => shown.map(row).join(''), false, '', hasItem); }
    }
    return any ? h : h + `<ul class="nvRows">${allDoneRow()}</ul>`;
  }

  // 📖 阅读 / 🗣️ 情景 — easiest first (SPEC §4.3); drill pages and 🌉 ranges in their own groups.
  const dots = (d) => (d ? `<span class="nvDots" aria-label="难度 ${d}/5" title="难度 ${d}/5（本级内比较）">${'●'.repeat(d)}${'○'.repeat(5 - d)}</span>` : '');
  function textsHtml(lv, sec, only) {
    const all = BY[lv][sec];
    const row = (t) => {
      const done = isRead(t.s);
      const meta = [
        t.tag ? `<span>${esc(t.tag)}</span>` : '',
        dots(t.d),
        t.lix ? `<span title="LIX 可读性指数：< 25 很易 · 25–30 易 · 30–40 中等 · 40–50 难">LIX ${t.lix}</span>` : '',
        t.dialog ? '<span title="可以角色扮演">🎭</span>' : '',
        t.up ? '<span class="nvUp" title="超过 10% 的词超出标注的级别">⬆ 偏难</span>' : '',
        t.inf ? '<span class="nvChip" title="文件没有标级别，按用词推断">≈</span>' : '',
        t.date ? `<span>${esc(t.date)}</span>` : '',
      ].filter(Boolean).join('');
      return `<li><a class="nvRow nvText${done ? ' done' : ''}" href="${hrefOf(lv, sec, t)}" data-id="${esc(t.s)}">` +
        `<span class="nvMark" aria-label="${done ? '已读' : '没读'}">${done ? '✓' : '○'}</span>` +
        `<span class="nvRowMainTxt"><span class="nvRowT" lang="sv">${esc(t.t)}</span><span class="nvMeta">${meta}</span></span></a></li>`;
    };
    const parts = [
      ['main', sec === 'tala' ? '由易到难' : '文章与新闻 · 由易到难', (t) => !t.br && t.kind !== 'adjsubst', true, ''],
      ['drill', '📐 词形练习', (t) => !t.br && t.kind === 'adjsubst', false, '形容词 + 名词四种变形的练习页，级别按其中的词推断'],
      ['br', `🌉 过渡 → ${lvLabel(nextLevel(lv)) || '更高'}`, (t) => t.br, true, `标着区间（如 ${lv}–${nextLevel(lv) || '…'}）的${SEC[sec].name}：比本级其它的难一点，适合学完本级时读`],
    ];
    let h = sec === 'tala'
      ? '<p class="nvHint">点开在 🗣️ Tala 里练：🎭 = 可以角色扮演，所有情景都能逐句跟读。读完在那边「标为已读」。</p>'
      : '<p class="nvHint">点开在 📖 Läsning 里读，读完在那边「标为已读」，回到这里自动打 ✓。难度 ●○○○○ 是和本级其它文章比。</p>';
    for (const [key, title, f, dflt, note] of parts) {
      const list = all.filter(f);
      if (!list.length) continue;
      const done = list.filter((t) => isRead(t.s)).length;
      const shown = only ? list.filter((t) => !isRead(t.s)) : list;
      h += group(lv, sec, key, title, `${done}/${list.length}`, shown.length ? shown.map(row).join('') : allDoneRow(), dflt, note ? esc(note) : '');
    }
    return h;
  }

  // 🎧 听力 — episodes with subtitles first; 📖 jumps to the article version when there is one.
  function listenHtml(lv, only) {
    const all = BY[lv].listen;
    const row = (e) => {
      const done = isRead('lyssna:' + e.id);
      const meta = [e.src ? `<span>${esc(e.src)}</span>` : '', e.dur ? `<span>${fmtDur(e.dur)}</span>` : '',
        `<span>${e.cues ? `字幕 ${e.cues} 句` : '只有音频'}</span>`, e.date ? `<span>${esc(e.date)}</span>` : ''].filter(Boolean).join('');
      return `<li class="nvRowPair" data-id="${esc(e.id)}"><a class="nvRow nvText${done ? ' done' : ''}" href="${hrefOf(lv, 'listen', e)}">` +
        `<span class="nvMark" aria-label="${done ? '听过' : '没听'}">${done ? '✓' : '○'}</span>` +
        `<span class="nvRowMainTxt"><span class="nvRowT" lang="sv">${esc(e.t)}</span><span class="nvMeta">${meta}</span></span></a>` +
        (e.reading ? `<a class="nvSide" href="../reading/#article=${enc(e.reading)}&${backParam(lv, 'listen', e.id)}" title="读文字版" aria-label="读文字版">📖</a>` : '') +
        '</li>';
    };
    let h = '<p class="nvHint">点开在 🎧 Lyssna 里听；📖 = 有文字版。听完在那边「标为已读」。</p>';
    for (const [key, title, f] of [['main', '节目', (e) => !e.br], ['br', `🌉 过渡 → ${lvLabel(nextLevel(lv))}`, (e) => e.br]]) {
      const list = all.filter(f);
      if (!list.length) continue;
      const done = list.filter((e) => isRead('lyssna:' + e.id)).length;
      const shown = only ? list.filter((e) => !isRead('lyssna:' + e.id)) : list;
      h += group(lv, 'listen', key, title, `${done}/${list.length}`, shown.length ? shown.map(row).join('') : allDoneRow(), true, '');
    }
    return h;
  }

  // 📘 课文 — textbook lessons with a 逐段精读 guide, studied in Kurs.
  function kursHtml(lv, X, only) {
    const all = BY[lv].kurs;
    const row = (k) => {
      const paras = kursParas(k, X);
      const read = isRead(k.s);
      const done = isDone('kurs', k, X);
      const pct = k.paras ? Math.round((paras / k.paras) * 100) : 0;
      return `<li><a class="nvRow nvText${done ? ' done' : ''}" href="${hrefOf(lv, 'kurs', k)}" data-id="${esc(k.s)}">` +
        ring(read ? 100 : pct, 'sm') +
        `<span class="nvRowMainTxt"><span class="nvRowT" lang="sv">${esc(k.t)}</span>` +
        `<span class="nvMeta"><span>${k.paras} 段</span><span>学完 ${paras}/${k.paras}</span>${read ? '<span class="nvOk">✓ 已读</span>' : ''}` +
        `${k.date ? `<span>${esc(k.date)}</span>` : ''}</span></span></a></li>`;
    };
    let h = '<p class="nvHint">点开在 📘 Kurs 里一段一段学（读 → 拆 → 词 → 练）。所有段学完，或在那边标为已读，就算学完。</p>';
    for (const [key, title, f] of [['main', '课文', (k) => !k.br], ['br', `🌉 过渡 → ${lvLabel(nextLevel(lv))}`, (k) => k.br]]) {
      const list = all.filter(f);
      if (!list.length) continue;
      const done = list.filter((k) => isDone('kurs', k, X)).length;
      const shown = only ? list.filter((k) => !isDone('kurs', k, X)) : list;
      h += group(lv, 'kurs', key, title, `${done}/${list.length}`, shown.length ? shown.map(row).join('') : allDoneRow(), true, '');
    }
    return h;
  }

  // ---------- events ----------
  main.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) {
      e.preventDefault();
      goLevel(go.getAttribute('data-go'), go.getAttribute('data-sec') || '');
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.getAttribute('data-act');
      if (a === 'ladder') { goLadder(); return; }
      if (a === 'only' && view) {
        mutate((s) => { s.only[view.sec] = !s.only[view.sec]; });
        renderLevel(view.lv, view.sec, '', {});
        return;
      }
      if (a === 'gram' && view) {
        const slug = act.getAttribute('data-s');
        let on = false;
        mutate((s) => { if (s.grammar[slug]) delete s.grammar[slug]; else { s.grammar[slug] = today(); on = true; } });
        toast(on ? '✓ 标为学过' : '已取消「学过」');
        renderLevel(view.lv, view.sec, '', {});
        return;
      }
    }
    const tab = e.target.closest('.nvTab');
    if (tab && view) {
      const sec = tab.getAttribute('data-sec');
      try { history.replaceState(history.state, '', hashFor(view.lv, sec)); } catch (_e) { /* ignore */ }
      renderLevel(view.lv, sec, '', { tab: true });
      return;
    }
    // Leaving for another page: remember the row so Back lands on it again.
    const keep = e.target.closest('a[data-keep], a[data-id], .nvRowPair a');
    if (keep && view) {
      const holder = keep.closest('[data-id]') || keep;
      const id = holder.getAttribute('data-id') || keep.getAttribute('data-keep');
      if (id) { try { history.replaceState(history.state, '', hashFor(view.lv, view.sec, id)); } catch (_e) { /* ignore */ } }
    }
  });
  // Lazily fill a group's rows the first time it is opened; remember open / closed for this tab.
  main.addEventListener('toggle', (e) => {
    const det = e.target;
    if (!det || !det.matches || !det.matches('details.nvGroup')) return;
    const k = det.getAttribute('data-g');
    openState.set(k, det.open);
    if (det.open && det.getAttribute('data-lazy')) {
      const fill = lazyRows.get(k);
      const ul = det.querySelector('.nvRows');
      if (fill && ul) ul.innerHTML = fill();
      det.removeAttribute('data-lazy');
    }
  }, true);

  // Read marks arrive from other devices after load, and change when he comes back from Läsning;
  // another tab may tick a grammar point or answer in Öva. These re-renders are passive (no writes).
  if (window.ReadSync && window.ReadSync.onChange) window.ReadSync.onChange(() => route({ passive: true }));
  window.addEventListener('pageshow', (e) => { if (e.persisted) { st = loadState(); route({ passive: true }); } });
  window.addEventListener('storage', (e) => {
    if (e.key === LS || e.key === 'ova.state.v1' || e.key === 'flode.state.v1' || e.key === 'kurs.state.v1') {
      st = loadState();
      route({ passive: true });
    }
  });

  // ---------- boot ----------
  // Landing straight on a level (e.g. "← 返回 Nivå" from Läsning): put the ladder underneath so ← / Back goes there.
  (function boot() {
    const h = readHash();
    if (h.lv) {
      const target = hashFor(h.lv, h.sec, h.item);
      try {
        history.replaceState(null, '', location.pathname + location.search);
        history.pushState({ nv: 1 }, '', target);
      } catch (_e) { /* ignore */ }
    }
    route({ top: true });
  })();
})();

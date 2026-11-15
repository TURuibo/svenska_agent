/* Kurs — 手机上认真学课文 (see SPEC.md, the design authority).
 * Home (lesson list + 继续上次) → lesson: per paragraph four steps 读 / 拆 / 词 / 练,
 * one universal bottom sheet for word / phrase / grammar notes, whole-lesson views in ⋯.
 * Data: kurs-index.js (window.KURS_INDEX) + data/<slug>.js loaded on demand (SPEC §6).
 * State: kurs.state.v1 (own); objective word-level answers → ova.state.v1 (shared with Öva / Flöde). */
(function () {
  'use strict';

  const MD = window.KBMarkdown;
  const SP = window.SvSpeak || null;
  const $ = (id) => document.getElementById(id);
  const homeEl = $('kuHome');
  const lessonEl = $('kuLesson');
  const mainEl = $('kuMain');
  const tabsEl = $('kuTabs');
  const viewEl = $('kuView');
  const viewBody = $('kuViewBody');
  const sheetWrap = $('kuSheetWrap');
  const sheetEl = $('kuSheet');
  const sheetBody = $('kuSheetBody');

  // ---------- helpers ----------
  const arr = (x) => (Array.isArray(x) ? x : []);
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const str = (x) => (x == null ? '' : String(x));
  const esc = (s) => str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const uniq = (a) => [...new Set(a)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i -= 1) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dateStr(new Date());
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return dateStr(d); };
  const zhShort = (z) => { let o = str(z).split(/[；;]/).map((s) => s.trim()).filter(Boolean)[0] || ''; return o.length > 18 ? o.slice(0, 18) + '…' : o; };
  const glosses = (z) => new Set(str(z).split(/[；;、，,/（）()]/).map((s) => s.replace(/[的地得]$/, '').trim()).filter(Boolean));
  const overlaps = (a, b) => { for (const g of a) if (b.has(g)) return true; return false; };
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const posHead = (p) => {
    const h = str(p).trim().toLowerCase().split(/[\s.(/,]/)[0];
    if (/^sub/.test(h)) return 'subst';
    if (/^adj/.test(h)) return 'adj';
    if (/^adv/.test(h)) return 'adv';
    if (/^verb|^v$/.test(h)) return 'verb';
    if (/^pron/.test(h)) return 'pron';
    if (/^prep/.test(h)) return 'prep';
    if (/^konj|^subj/.test(h)) return 'konj';
    if (/^(ordningstal|räkneord|num)/.test(h)) return 'num';
    return h;
  };
  const WORD_RE = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[-'’][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;
  const STEPS = ['r', 'a', 'w', 'q'];
  const STEP_ZH = ['读', '拆', '词', '练'];

  // ---------- storage ----------
  const LS = 'kurs.state.v1';
  const OVA = 'ova.state.v1';
  const INTERVALS = [0, 1, 2, 4, 7, 14, 30];
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (_e) { return false; } };
  const parse = (raw) => { try { return JSON.parse(raw || 'null'); } catch (_e) { return undefined; } };

  function cleanPos(p) {
    if (!isObj(p) || !p.slug) return null;
    return { slug: str(p.slug), para: Number(p.para) || 1, step: STEPS.includes(p.step) ? p.step : 'r', sent: Math.max(1, Number(p.sent) || 1),
      at: str(p.at), title: str(p.title), of: Number(p.of) || 0 };
  }
  function loadState() {
    const st = { v: 1, last: null, lessons: {}, starWords: {}, knownWords: {}, prefs: { showZh: false, rate: 0.85 } };
    const o = parse(lsGet(LS));
    if (!isObj(o)) return st;
    st.last = cleanPos(o.last);
    if (isObj(o.lessons)) {
      for (const [slug, l] of Object.entries(o.lessons)) {
        if (!isObj(l)) continue;
        const L = { paras: {}, starSents: {} };
        if (isObj(l.paras)) {
          for (const [n, p] of Object.entries(l.paras)) {
            if (!isObj(p)) continue;
            const q = {};
            if (p.read) q.read = 1;
            if (Array.isArray(p.sents)) q.sents = uniq(p.sents.map(Number).filter((x) => x > 0));
            if (p.words) q.words = 1;
            if (p.quiz === 'skipped') q.quiz = 'skipped';
            else if (isObj(p.quiz)) q.quiz = { right: Number(p.quiz.right) || 0, total: Number(p.quiz.total) || 0, at: str(p.quiz.at) };
            L.paras[n] = q;
          }
        }
        if (isObj(l.starSents)) for (const k of Object.keys(l.starSents)) if (l.starSents[k]) L.starSents[k] = 1;
        const pos = cleanPos(l.pos);
        if (pos) L.pos = pos;
        st.lessons[slug] = L;
      }
    }
    for (const k of ['starWords', 'knownWords']) if (isObj(o[k])) for (const s of Object.keys(o[k])) if (o[k][s]) st[k][s] = 1;
    if (isObj(o.prefs)) {
      if (typeof o.prefs.showZh === 'boolean') st.prefs.showZh = o.prefs.showZh;
      if (Number(o.prefs.rate) >= 0.5 && Number(o.prefs.rate) <= 1.5) st.prefs.rate = Number(o.prefs.rate);
    }
    return st;
  }
  const st = loadState();
  const save = () => lsSet(LS, JSON.stringify(st));
  const lessonSt = (slug) => (st.lessons[slug] = st.lessons[slug] || { paras: {}, starSents: {} });
  const paraSt = (slug, n) => { const l = lessonSt(slug); return (l.paras[n] = l.paras[n] || {}); };
  const paraDone = (q) => !!(q && q.read && arr(q.sents).length && q.words && q.quiz);

  // Session memory: which collapsibles / translations he left open (sessionStorage, this tab only).
  const SS = 'kurs.open.v1';
  let openMem = {};
  try { const o = JSON.parse(sessionStorage.getItem(SS) || '{}'); if (isObj(o)) openMem = o; } catch (_e) { /* ignore */ }
  const isOpen = (k, dflt) => (k in openMem ? !!openMem[k] : !!dflt);
  const setOpen = (k, v) => { openMem[k] = v ? 1 : 0; try { sessionStorage.setItem(SS, JSON.stringify(openMem)); } catch (_e) { /* ignore */ } };

  // ---------- Öva (ova.state.v1) — same rules as site/ova/ova.js answer() ----------
  function ovaRecord(slug, ok) {
    if (!slug) return;
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
  }

  // ---------- speech ----------
  function say(text) {
    if (!SP || !SP.supported) { toast('这个浏览器不支持朗读'); return; }
    const parts = Array.isArray(text) ? text : [text];
    SP.speakSequence(parts, { rate: st.prefs.rate });
  }
  const sayBtn = (text, label) => `<button type="button" class="kuSay" data-say="${esc(text)}" aria-label="${esc(label || '朗读')}" title="${esc(label || '朗读')}">🔊</button>`;

  let toastT = 0;
  function toast(msg) {
    const t = $('kuToast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // ---------- data ----------
  const IDX = isObj(window.KURS_INDEX) ? window.KURS_INDEX : null;
  const LESSONS = IDX ? arr(IDX.lessons).filter((l) => isObj(l) && l.slug) : [];
  const metaOf = (slug) => LESSONS.find((l) => l.slug === slug) || null;
  const loading = new Map();
  function loadLesson(slug) {
    const have = window.KURS_LESSONS && window.KURS_LESSONS[slug];
    if (have) return Promise.resolve(have);
    if (loading.has(slug)) return loading.get(slug);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'data/' + encodeURIComponent(slug) + '.js';
      s.onload = () => { const L = window.KURS_LESSONS && window.KURS_LESSONS[slug]; if (L) resolve(L); else reject(new Error('empty')); };
      s.onerror = () => { s.remove(); reject(new Error('load')); };
      document.head.appendChild(s);
    });
    loading.set(slug, p);
    p.catch(() => loading.delete(slug));
    return p;
  }
  // Normalise one lesson once: tolerate every optional field being missing.
  function prep(L) {
    if (L.__kurs) return L;
    L.paras = arr(L.paras).filter(isObj).map((p, k) => ({
      n: Number(p.n) || k + 1, kind: p.kind === 'extra' ? 'extra' : 'para', title: str(p.title), sv: str(p.sv), zh: str(p.zh),
      sents: arr(p.sents).filter(isObj).map((s, j) => ({
        i: Number(s.i) || j + 1, sv: str(s.sv), chunks: Array.isArray(s.chunks) && s.chunks.length ? s.chunks.filter(isObj).map((c) => ({ t: str(c.t), r: str(c.r) })) : null,
        struct: str(s.struct), points: arr(s.points).map(str).filter(Boolean), zh: str(s.zh), key: s.key ? 1 : 0, extra: arr(s.extra).map(str).filter(Boolean),
      })),
      phrases: arr(p.phrases).filter(isObj).map((x) => ({ sv: str(x.sv), slug: str(x.slug), zh: str(x.zh), use: str(x.use) })),
      vocab: arr(p.vocab).filter(isObj).map((x) => ({ form: str(x.form), lemma: str(x.lemma), slug: str(x.slug), pos: str(x.pos), zh: str(x.zh), note: str(x.note) })),
      extraMd: str(p.extraMd),
    }));
    L.meta = arr(L.meta).filter(isObj);
    L.notes = arr(L.notes).filter(isObj);
    L.notesMd = str(L.notesMd);
    L.items = isObj(L.items) ? L.items : {};
    for (const k of ['words', 'phrases', 'grammar']) L.items[k] = arr(L.items[k]).filter(isObj);
    L.forms = isObj(L.forms) ? L.forms : {};
    L.kb = isObj(L.kb) ? L.kb : {};
    L.title = str(L.title);
    L.__kurs = 1;
    return L;
  }

  // ---------- rendering primitives ----------
  let L = null;            // current lesson data
  const hasSlug = (s) => !!(L && L.kb[s]);
  // Inline md; [[links]] to notes not in this lesson's kb become plain text.
  function inl(md) {
    if (!md) return '';
    return MD.inlineMarkdown(md, { hasSlug }).replace(/<button class="wikiLink missingLink" type="button" data-wikilink="[^"]*">([\s\S]*?)<\/button>/g, '<span class="kuNoLink">$1</span>');
  }
  function blk(md) {
    if (!md) return '';
    return MD.mdToHtml(md, { hasSlug })
      .replace(/<button class="wikiLink missingLink" type="button" data-wikilink="[^"]*">([\s\S]*?)<\/button>/g, '<span class="kuNoLink">$1</span>')
      .replace(/<table>/g, '<div class="kuTbl"><table>').replace(/<\/table>/g, '</table></div>');
  }
  // Swedish text → tappable tokens for words that have a note in this lesson.
  function toks(text, p) {
    const s = str(text);
    let out = '';
    let last = 0;
    s.replace(WORD_RE, (m, at) => {
      out += esc(s.slice(last, at));
      last = at + m.length;
      const low = m.toLowerCase();
      let slug = L && L.forms[low];
      if (!slug && L && L.kb[low] && L.kb[low].t === 'word') slug = low;
      if (slug && L.kb[slug]) out += `<span class="kuW" role="button" tabindex="0" data-w="${esc(slug)}" data-f="${esc(m)}"${p != null ? ` data-p="${p}"` : ''}>${esc(m)}</span>`;
      else out += esc(m);
      return m;
    });
    return out + esc(s.slice(last));
  }
  const paraByN = (n) => (L ? L.paras.find((p) => p.n === Number(n)) : null) || null;
  const realParas = () => (L ? L.paras.filter((p) => p.kind === 'para') : []);

  // ---------- layers (view / sheet) + history ----------
  const layers = [];
  let afterPop = null;
  function pushLayer(kind) {
    layers.push(kind);
    try { history.pushState({ kuLayer: layers.length }, '', location.href); } catch (_e) { /* ignore */ }
  }
  function closeTop(then) {
    if (!layers.length) { if (then) then(); return; }
    afterPop = then || null;
    history.back();
  }
  function hideLayer(kind) {
    if (kind === 'sheet') hideSheet();
    else if (kind === 'view') { viewEl.hidden = true; viewBody.innerHTML = ''; document.body.classList.remove('kuViewOpen'); }
  }
  window.addEventListener('popstate', () => {
    if (layers.length) {
      hideLayer(layers.pop());
      const fn = afterPop; afterPop = null;
      if (fn) fn(); else if (cur && !layers.length) syncHash();
      return;
    }
    route();
  });
  document.addEventListener('click', (e) => {
    const c = e.target.closest('[data-close="layer"]');
    if (c) { e.preventDefault(); closeTop(); }
  });

  // ---------- routing ----------
  // #            home
  // #l=<slug>    lesson at its saved position
  // #l=<slug>&p=<¶n>&s=<r|a|w|q>&i=<sentence>
  function parseHash() {
    const h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    const slug = h.get('l');
    if (!slug) return null;
    const o = { slug };
    if (h.has('p')) o.para = Number(h.get('p')) || 1;
    if (STEPS.includes(h.get('s'))) o.step = h.get('s');
    if (h.has('i')) o.sent = Math.max(1, Number(h.get('i')) || 1);
    return o;
  }
  const hashFor = (c) => `#l=${encodeURIComponent(c.slug)}&p=${c.para}&s=${c.step}&i=${c.sent}`;
  let cur = null;          // { slug, para, step, sent }
  function syncHash() {
    if (!cur) return;
    const h = hashFor(cur);
    if (location.hash !== h) { try { history.replaceState(history.state, '', h); } catch (_e) { /* ignore */ } }
  }
  function route() {
    const h = parseHash();
    if (h) openLesson(h.slug, h); else showHome();
  }

  // ---------- home ----------
  function lessonProgress(m) {
    const l = st.lessons[m.slug];
    let done = 0; let touched = 0;
    if (l) for (const [n, q] of Object.entries(l.paras)) { if (Number(n) >= 100) continue; if (paraDone(q)) done += 1; else if (q.read || arr(q.sents).length) touched += 1; }
    const total = Math.max(1, Number(m.paras) || 1);
    return { done: Math.min(done, total), total, touched };
  }
  function ring(done, total) {
    const r = 17; const c = 2 * Math.PI * r; const f = total ? done / total : 0;
    return `<svg class="kuRing" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="${r}" class="kuRingBg"/>` +
      `<circle cx="22" cy="22" r="${r}" class="kuRingFg" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 22 22)"/>` +
      `<text x="22" y="26" text-anchor="middle">${done}/${total}</text></svg>`;
  }
  const isRead = (slug) => { try { return !!(window.ReadSync && window.ReadSync.isRead(slug)); } catch (_e) { return false; } };
  function stepLabel(pos) {
    if (!pos) return '';
    const k = STEPS.indexOf(pos.step);
    return pos.step === 'a' && pos.of ? `拆 ${pos.sent}/${pos.of}` : STEP_ZH[k < 0 ? 0 : k];
  }
  function showHome() {
    cur = null; L = null;
    if (SP) SP.cancel();
    while (layers.length) hideLayer(layers.pop());
    lessonEl.hidden = true;
    homeEl.hidden = false;
    document.body.classList.remove('kuInLesson');
    document.title = 'Kurs — 精读课文 · svensk_agent';
    if (!IDX) {
      homeEl.innerHTML = `<header class="kuHomeHead"><h1>📘 Kurs</h1></header><p class="kuEmpty">⚠️ 找不到 <code>kurs-index.js</code>。请先运行 <code>node tools/build-kurs-data.js</code>（GitHub Action 发布时会自动生成）。</p>`;
      return;
    }
    const last = st.last && metaOf(st.last.slug) ? st.last : null;
    let h = `<header class="kuHomeHead"><h1>📘 Kurs <small>手机上精读课文</small></h1>` +
      `<p>读 → 拆 → 词 → 练，一句一页；随时中断，回来原地继续。</p></header>`;
    if (last) {
      const m = metaOf(last.slug);
      h += `<button type="button" class="kuResume" data-open="${esc(last.slug)}" data-resume="1">` +
        `<span class="kuResumeK">▶ 继续上次</span><span class="kuResumeT" lang="sv">${esc(m.title)}</span>` +
        `<span class="kuResumeP">${last.para < 100 ? '¶' + last.para : '附加段'}${last.title ? ' · ' + esc(last.title) : ''} · ${esc(stepLabel(last))}</span></button>`;
    }
    if (!LESSONS.length) h += '<p class="kuEmpty">还没有带「🔍 逐段精读」的课文。</p>';
    h += '<ol class="kuList">';
    for (const m of LESSONS) {
      const pr = lessonProgress(m);
      const read = isRead(m.slug);
      h += `<li><button type="button" class="kuCard${pr.done >= pr.total ? ' done' : ''}" data-open="${esc(m.slug)}">` +
        `<span class="kuCardTxt"><span class="kuCardT" lang="sv">${esc(m.title)}</span>` +
        `<span class="kuCardSub">${[m.sub, m.cefr, m.date].filter(Boolean).map(esc).join(' · ')}</span>` +
        (m.book ? `<span class="kuCardBook">${inlNoLinks(m.book)}</span>` : '') +
        `<span class="kuCardTags"><span>${Number(m.paras) || 0} 段</span><span>${Number(m.sents) || 0} 句</span><span>${Number(m.words) || 0} 词</span>` +
        (m.listen ? '<span>🎧 有原声</span>' : '') + (read ? '<span class="kuTagRead">✓ 已读</span>' : '') + '</span></span>' +
        ring(pr.done, pr.total) + '</button></li>';
    }
    h += '</ol>';
    homeEl.innerHTML = h;
    window.scrollTo(0, 0);
  }
  const inlNoLinks = (md) => MD.inlineMarkdown(str(md).replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_m, a, b) => b || a));
  homeEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (!b) return;
    const slug = b.getAttribute('data-open');
    const pos = b.hasAttribute('data-resume') && st.last && st.last.slug === slug ? st.last : (lessonSt(slug).pos || null);
    const c = pos ? { slug, para: pos.para, step: pos.step, sent: pos.sent } : { slug, para: 0, step: 'r', sent: 1 };
    try { history.pushState({ kuLesson: 1 }, '', c.para ? hashFor(c) : `#l=${encodeURIComponent(slug)}`); } catch (_e) { /* ignore */ }
    openLesson(slug, c.para ? c : { slug });
  });
  if (window.ReadSync && window.ReadSync.onChange) window.ReadSync.onChange(() => { if (!cur && !homeEl.hidden) showHome(); else if (cur) paintMenuRead(); });

  // ---------- lesson ----------
  let openToken = 0;
  function openLesson(slug, want) {
    const tok = ++openToken;
    homeEl.hidden = true;
    lessonEl.hidden = false;
    document.body.classList.add('kuInLesson');
    const m = metaOf(slug);
    $('kuTitle').textContent = m ? m.title : slug;
    $('kuBar').innerHTML = '';
    tabsEl.hidden = true;
    mainEl.className = 'kuMain';
    mainEl.innerHTML = '<p class="kuEmpty">正在加载课文…</p>';
    loadLesson(slug).then((data) => {
      if (tok !== openToken) return;
      L = prep(data);
      const ls = lessonSt(slug);
      let pos = want && want.para ? want : (st.last && st.last.slug === slug ? st.last : ls.pos);
      let para = pos && paraByN(pos.para) ? pos.para : (L.paras[0] ? L.paras[0].n : 1);
      const P = paraByN(para);
      let step = pos && pos.step ? pos.step : 'r';
      let sent = pos && pos.sent ? pos.sent : 1;
      if (P && sent > P.sents.length) sent = Math.max(1, P.sents.length);
      cur = { slug, para, step, sent };
      document.title = `${L.title || slug} · Kurs`;
      $('kuTitle').textContent = L.title || slug;
      render(true);
    }).catch(() => {
      if (tok !== openToken) return;
      mainEl.innerHTML = `<div class="kuEmpty"><p>⚠️ 课文数据加载失败（<code>data/${esc(slug)}.js</code>）。离线时只能打开以前打开过的课。</p>` +
        `<p><button type="button" class="kuBtn" id="kuRetry">重试</button> <button type="button" class="kuBtn ghost" id="kuHomeBtn">← 课程列表</button></p></div>`;
      $('kuRetry').onclick = () => openLesson(slug, want);
      $('kuHomeBtn').onclick = goHome;
    });
  }
  function goHome() {
    if (history.state && history.state.kuLesson) { history.back(); return; }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_e) { /* ignore */ }
    showHome();
  }
  $('kuBack').addEventListener('click', goHome);

  function saveLast() {
    if (!cur || !L) return;
    const P = paraByN(cur.para);
    const pos = { slug: cur.slug, para: cur.para, step: cur.step, sent: cur.sent, at: new Date().toISOString(), title: P ? P.title : '', of: P ? P.sents.length : 0 };
    st.last = pos;
    lessonSt(cur.slug).pos = Object.assign({}, pos);
    save();
    syncHash();
  }

  // Header: paragraph progress segments (tap → paragraph list).
  function paintBar() {
    const ls = lessonSt(cur.slug);
    $('kuBar').innerHTML = L.paras.map((p) => {
      const q = ls.paras[p.n] || {};
      const cls = ['kuSeg', p.kind === 'extra' ? 'x' : '', paraDone(q) ? 'done' : (q.read || arr(q.sents).length ? 'part' : ''), p.n === cur.para ? 'cur' : ''].filter(Boolean).join(' ');
      return `<i class="${cls}"></i>`;
    }).join('') + `<span class="kuBarTxt">${cur.para < 100 ? '¶' + cur.para : '附加'} / ${realParas().length}</span>`;
    $('kuBar').setAttribute('aria-label', `段落列表（当前 ${cur.para < 100 ? '¶' + cur.para : '附加段'}，共 ${realParas().length} 段）`);
  }
  function paintTabs() {
    const P = paraByN(cur.para);
    const ex = !P || P.kind === 'extra';
    tabsEl.hidden = ex;
    lessonEl.classList.toggle('noTabs', ex);
    const q = lessonSt(cur.slug).paras[cur.para] || {};
    const did = [q.read, arr(q.sents).length, q.words, q.quiz];
    tabsEl.querySelectorAll('button').forEach((b, k) => {
      const on = STEPS[k] === cur.step;
      b.classList.toggle('on', on);
      b.classList.toggle('did', !!did[k]);
      if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
  }
  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b || !cur) return;
    goStep(STEPS[Number(b.getAttribute('data-step'))]);
  });
  function goStep(step, sent) {
    if (!cur) return;
    cur.step = step;
    if (sent) cur.sent = sent;
    render(true);
  }
  function goPara(n, step) {
    if (!cur || !paraByN(n)) return;
    cur.para = n; cur.step = step || 'r'; cur.sent = 1;
    quiz = null;
    render(true);
  }
  function nextPara() {
    const k = L.paras.findIndex((p) => p.n === cur.para);
    return L.paras[k + 1] || null;
  }

  function render(resetScroll) {
    if (!cur || !L) return;
    if (SP) SP.cancel();
    const P = paraByN(cur.para);
    paintBar();
    paintTabs();
    mainEl.className = 'kuMain';
    if (!P) { mainEl.innerHTML = '<p class="kuEmpty">这一课没有段落。</p>'; return; }
    if (P.kind === 'extra') renderExtra(P);
    else if (cur.step === 'a') renderAnalyse(P);
    else if (cur.step === 'w') renderWords(P);
    else if (cur.step === 'q') renderQuiz(P);
    else renderRead(P);
    if (resetScroll) mainEl.scrollTop = 0;
    paintTabs();
    paintBar();
    saveLast();
  }

  const paraHead = (P, extra) => `<header class="kuParaHead"><span class="kuParaN">${P.kind === 'extra' ? '附加段' : '¶' + P.n}</span>` +
    `<h2>${esc(P.title)}</h2>${extra || ''}</header>`;
  const svLines = (text, p) => str(text).split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => `<p>${toks(l, p)}</p>`).join('');
  function zhBlock(key, zh, label) {
    if (!zh) return '';
    const open = isOpen(key, st.prefs.showZh);
    return `<div class="kuZh${open ? ' open' : ''}" data-zh="${esc(key)}"><button type="button" class="kuZhBtn" aria-expanded="${open}">` +
      `<span class="kuZhOn">🇨🇳 ${esc(label || '显示译文')}</span><span class="kuZhOff">🇨🇳 收起译文</span></button>` +
      `<div class="kuZhTxt">${inl(zh)}</div></div>`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.kuZhBtn');
    if (!b) return;
    const box = b.parentElement;
    const open = !box.classList.contains('open');
    box.classList.toggle('open', open);
    b.setAttribute('aria-expanded', String(open));
    setOpen(box.getAttribute('data-zh'), open);
  });

  // ① 读
  function renderRead(P) {
    const q = paraSt(cur.slug, P.n);
    q.read = 1;
    const sents = P.sents.map((s) => s.sv).filter(Boolean);
    let h = paraHead(P, sents.length ? `<button type="button" class="kuSayAll" data-sayall="1" aria-label="朗读整段">🔊 朗读</button>` : '');
    if (P.n === (L.paras[0] && L.paras[0].n) && L.meta.length) {
      h += `<details class="kuMeta"${isOpen('meta', false) ? ' open' : ''} data-mem="meta"><summary>ℹ️ 关于本课${L.cefr ? ' · ' + esc(L.cefr) : ''}</summary>` +
        `<dl>${L.meta.map((m) => `<dt>${esc(m.k)}</dt><dd>${inl(m.v)}</dd>`).join('')}</dl></details>`;
    }
    h += `<div class="kuRead" lang="sv">${svLines(P.sv || sents.join(' '), P.n)}</div>`;
    h += zhBlock(`pz:${cur.slug}:${P.n}`, P.zh, '显示段译');
    if (P.extraMd) h += `<section class="kuExtra"><h3>📎 本段补充</h3>${blk(P.extraMd)}</section>`;
    h += `<p class="kuHintLine">虚线词可点开看原形、变形和例句。</p>`;
    h += `<div class="kuNext"><button type="button" class="kuBtn" data-go="a">② 逐句拆 →</button></div>`;
    mainEl.innerHTML = `<div class="kuPage">${h}</div>`;
  }
  mainEl.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { goStep(g.getAttribute('data-go'), g.hasAttribute('data-i') ? Number(g.getAttribute('data-i')) : 0); return; }
    if (e.target.closest('[data-sayall]')) { const P = paraByN(cur.para); say(P.sents.map((s) => s.sv).filter(Boolean)); return; }
    const np = e.target.closest('[data-nextpara]');
    if (np) { const n = nextPara(); if (n) goPara(n.n); else goHome(); }
  });
  document.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d && d.matches && d.matches('details[data-mem]')) setOpen(d.getAttribute('data-mem'), d.open);
  }, true);

  // extra paragraph (非 ¶ 小节): just its markdown
  function renderExtra(P) {
    const q = paraSt(cur.slug, P.n);
    q.read = 1;
    const nx = nextPara();
    mainEl.innerHTML = `<div class="kuPage">${paraHead(P)}<div class="kuMd">${blk(P.extraMd) || (P.sv ? `<div class="kuRead" lang="sv">${svLines(P.sv, P.n)}</div>` : '<p class="kuEmpty">（空）</p>')}</div>` +
      (P.zh ? zhBlock(`pz:${cur.slug}:${P.n}`, P.zh) : '') +
      `<div class="kuNext">${nx ? `<button type="button" class="kuBtn" data-nextpara="1">下一段 →</button>` : `<button type="button" class="kuBtn" data-nextpara="1">回课程列表</button>`}</div></div>`;
  }

  // ② 拆 — one sentence per page, horizontal scroll-snap pager; each page scrolls vertically.
  function roleKey(r) {
    const s = str(r).trim();
    if (/^S(?![a-zåäö])/.test(s) || /^主语/.test(s)) return 'S';
    if (/^V(?![a-zåäö])/.test(s) || /^(谓语|动词)/.test(s)) return 'V';
    if (/^O(?![a-zåäö])/.test(s) || /^宾语/.test(s)) return 'O';
    if (/^A(?![a-zåäö])/.test(s) || /^状语/.test(s)) return 'A';
    return 'n';
  }
  const clauseMark = (t) => esc(t).replace(/⟨([^⟩]*)⟩/g, '<span class="kuCl">⟨$1⟩</span>');
  function structHtml(s) {
    if (s.chunks) {
      return `<div class="kuChunks" lang="sv">${s.chunks.map((c) => `<span class="kuCh r${roleKey(c.r)}"><span class="kuChT">${clauseMark(c.t)}</span><span class="kuChR" lang="zh">${esc(c.r)}</span></span>`).join('')}</div>`;
    }
    return s.struct ? `<div class="kuStructRaw">${inl(s.struct)}</div>` : '<p class="kuMuted">（本句没有结构分析）</p>';
  }
  const LEGEND = '<div class="kuLegend"><span class="kuCh rS"><span class="kuChR">S</span></span>主语' +
    '<span class="kuCh rV"><span class="kuChR">V</span></span>限定动词' +
    '<span class="kuCh rO"><span class="kuChR">O</span></span>宾语' +
    '<span class="kuCh rA"><span class="kuChR">A</span></span>状语' +
    '<span class="kuCh rn"><span class="kuChR">…</span></span>其它（表语、不定式…）' +
    '<span class="kuLegCl"><span class="kuCl">⟨从句⟩</span></span>从句</div>';
  function sentPage(P, s) {
    const k = `${P.n}.${s.i}`;
    const star = !!lessonSt(cur.slug).starSents[k];
    let h = `<article class="kuSent" data-i="${s.i}" aria-label="句 ${s.i}">`;
    h += `<div class="kuSentSv" lang="sv">${toks(s.sv, P.n)}${sayBtn(s.sv, '朗读这句')}</div>`;
    if (s.key || star) h += `<div class="kuSentTags">${s.key ? '<span class="kuTagKey">★ 重点句</span>' : ''}${star ? '<span class="kuTagStar">☆ 已标难句</span>' : ''}</div>`;
    h += `<section class="kuStruct"><h3>📐 结构 <details class="kuLegWrap" data-mem="legend"${isOpen('legend', false) ? ' open' : ''}><summary>图例</summary>${LEGEND}</details></h3>${structHtml(s)}</section>`;
    if (s.points.length) h += `<section class="kuPoints"><h3>⚠️ 要点 <small>${s.points.length}</small></h3>${s.points.map((p) => `<div class="kuPoint">${inl(p)}</div>`).join('')}</section>`;
    if (s.extra.length) h += `<section class="kuPoints kuSentExtra"><h3>📎 补充</h3>${s.extra.map((p) => `<div class="kuPoint">${inl(p)}</div>`).join('')}</section>`;
    h += zhBlock(`sz:${cur.slug}:${k}`, s.zh);
    return h + '</article>';
  }
  let pager = null;
  function renderAnalyse(P) {
    if (!P.sents.length) {
      mainEl.innerHTML = `<div class="kuPage">${paraHead(P)}<p class="kuEmpty">这一段没有逐句拆解。</p><div class="kuNext"><button type="button" class="kuBtn" data-go="w">③ 词 →</button></div></div>`;
      paraSt(cur.slug, P.n).sents = [1];
      return;
    }
    if (cur.sent > P.sents.length) cur.sent = P.sents.length;
    mainEl.className = 'kuMain kuMainPager';
    mainEl.innerHTML = `<div class="kuAnHead"><span class="kuParaN">¶${P.n}</span><span class="kuAnTitle">${esc(P.title)}</span>` +
      `<span class="kuDots" aria-hidden="true">${P.sents.map((s) => `<i data-d="${s.i}"></i>`).join('')}</span><span class="kuAnCount" id="kuAnCount"></span></div>` +
      `<div class="kuPager" id="kuPager" tabindex="-1">${P.sents.map((s) => `<div class="kuPg">${sentPage(P, s)}</div>`).join('')}</div>` +
      `<div class="kuPgFoot"><button type="button" class="kuFootBtn" id="kuStar" aria-pressed="false">☆ 难句</button>` +
      `<button type="button" class="kuFootBtn" id="kuPrev" aria-label="上一句">← 上一句</button>` +
      `<button type="button" class="kuFootBtn kuFootMain" id="kuNextS" aria-label="下一句">下一句 →</button></div>`;
    pager = $('kuPager');
    const idx = cur.sent - 1;
    pager.scrollLeft = idx * pager.clientWidth;
    requestAnimationFrame(() => { if (pager) pager.scrollLeft = (cur.sent - 1) * pager.clientWidth; });
    markSent(P, cur.sent);
    paintPager(P);
    pager.addEventListener('scroll', onPagerScroll, { passive: true });
    $('kuPrev').onclick = () => pageTo(cur.sent - 1);
    $('kuNextS').onclick = () => { if (cur.sent >= P.sents.length) goStep('w'); else pageTo(cur.sent + 1); };
    $('kuStar').onclick = () => {
      const ls = lessonSt(cur.slug); const k = `${P.n}.${cur.sent}`;
      if (ls.starSents[k]) delete ls.starSents[k]; else ls.starSents[k] = 1;
      save(); paintPager(P);
      const pg = pager.children[cur.sent - 1];
      if (pg) { const top = pg.scrollTop; pg.innerHTML = sentPage(P, P.sents[cur.sent - 1]); pg.scrollTop = top; }
      toast(ls.starSents[k] ? '☆ 已标为难句（⋯ → 我的标记）' : '已取消难句标记');
    };
  }
  function markSent(P, i) {
    const q = paraSt(cur.slug, P.n);
    q.sents = uniq(arr(q.sents).concat(i)).sort((a, b) => a - b);
  }
  function paintPager(P) {
    const c = $('kuAnCount'); if (!c) return;
    c.textContent = `句 ${cur.sent} / ${P.sents.length}`;
    const q = paraSt(cur.slug, P.n);
    mainEl.querySelectorAll('.kuDots i').forEach((d) => {
      const i = Number(d.getAttribute('data-d'));
      d.className = (i === cur.sent ? 'cur ' : '') + (arr(q.sents).includes(i) ? 'seen' : '');
    });
    const star = !!lessonSt(cur.slug).starSents[`${P.n}.${cur.sent}`];
    const sb = $('kuStar'); sb.textContent = star ? '★ 难句' : '☆ 难句'; sb.setAttribute('aria-pressed', String(star)); sb.classList.toggle('on', star);
    $('kuPrev').disabled = cur.sent <= 1;
    $('kuNextS').textContent = cur.sent >= P.sents.length ? '③ 词 →' : '下一句 →';
  }
  let scrollT = 0;
  function onPagerScroll() {
    clearTimeout(scrollT);
    scrollT = setTimeout(settlePager, 90);
  }
  function settlePager() {
    if (!pager || !cur || cur.step !== 'a') return;
    const P = paraByN(cur.para);
    const w = pager.clientWidth || 1;
    const i = Math.min(P.sents.length, Math.max(1, Math.round(pager.scrollLeft / w) + 1));
    if (i !== cur.sent) {
      cur.sent = i;
      markSent(P, i);
      paintPager(P);
      paintTabs();
      paintBar();
      saveLast();
    }
  }
  function pageTo(i) {
    const P = paraByN(cur.para);
    if (!pager || i < 1 || i > P.sents.length) return;
    pager.scrollTo({ left: (i - 1) * pager.clientWidth, behavior: reduced() ? 'auto' : 'smooth' });
    if (reduced()) settlePager();
  }
  window.addEventListener('resize', () => { if (pager && cur && cur.step === 'a' && pager.isConnected) pager.scrollLeft = (cur.sent - 1) * pager.clientWidth; });

  // ③ 词 — phrases + vocab, one row each, full text (nothing truncated)
  function renderWords(P) {
    paraSt(cur.slug, P.n).words = 1;
    let h = paraHead(P);
    if (P.phrases.length) {
      h += `<section class="kuWl"><h3>🧩 词组 <small>${P.phrases.length}</small></h3><ul class="kuRows">` + P.phrases.map((x, k) => {
        const tap = x.slug && L.kb[x.slug];
        return `<li><div${tap ? ` role="button" tabindex="0" data-ph="${k}"` : ''} class="kuRow${tap ? ' tap' : ''}">` +
          `<span class="kuRowMain"><span class="kuRowSv" lang="sv">${inl(x.sv)}</span><span class="kuRowZh">${inl(x.zh)}</span></span>` +
          (x.use ? `<span class="kuRowUse" lang="sv">${inl(x.use)}</span>` : '') + (tap ? '<span class="kuChev" aria-hidden="true">›</span>' : '') +
          '</div></li>';
      }).join('') + '</ul></section>';
    }
    if (P.vocab.length) {
      h += `<section class="kuWl"><h3>📚 生词 <small>${P.vocab.length}</small></h3><ul class="kuRows">` + P.vocab.map((v, k) => {
        const n = v.slug && L.kb[v.slug];
        const starred = v.slug && st.starWords[v.slug];
        const known = v.slug && st.knownWords[v.slug];
        const same = v.form.toLowerCase() === v.lemma.toLowerCase();
        return `<li><div role="button" tabindex="0" class="kuRow tap" data-vo="${k}">` +
          `<span class="kuRowMain"><span class="kuRowSv" lang="sv">${same ? '' : `<span class="kuForm">${esc(v.form)}</span><span class="kuArrow">→</span>`}<b>${esc(v.lemma || v.form)}</b>` +
          `${starred ? ' <span class="kuStarMini" title="要记">★</span>' : ''}${known ? ' <span class="kuKnownMini" title="已会">✓</span>' : ''}</span>` +
          `<span class="kuRowPos">${esc(v.pos)}${n && n.cefr ? ' · ' + esc(n.cefr) : ''}</span></span>` +
          `<span class="kuRowZh">${inl(v.zh)}</span>` +
          (v.note ? `<span class="kuRowNote">${inl(v.note)}</span>` : '') +
          '<span class="kuChev" aria-hidden="true">›</span></div></li>';
      }).join('') + '</ul></section>';
    }
    if (!P.phrases.length && !P.vocab.length) h += '<p class="kuEmpty">这一段没有单独列出的词组或生词。正文里的虚线词仍可点开。</p>';
    else if (!P.phrases.length) h += '<p class="kuMuted kuSmall">（本段没有列出词组）</p>';
    h += `<div class="kuNext"><button type="button" class="kuBtn" data-go="q">④ 练 →</button></div>`;
    mainEl.innerHTML = `<div class="kuPage">${h}</div>`;
  }
  mainEl.addEventListener('click', (e) => {
    const ph = e.target.closest('[data-ph]');
    if (ph && !e.target.closest('.wikiLink')) { const x = paraByN(cur.para).phrases[Number(ph.getAttribute('data-ph'))]; if (x) openSheet({ type: 'note', slug: x.slug }); return; }
    const vo = e.target.closest('[data-vo]');
    if (vo && !e.target.closest('.wikiLink')) {
      const P = paraByN(cur.para); const v = P.vocab[Number(vo.getAttribute('data-vo'))];
      if (!v) return;
      if (v.slug && L.kb[v.slug]) openSheet({ type: 'note', slug: v.slug, form: v.form, vocab: v });
      else openSheet({ type: 'vocab', vocab: v });
    }
  });

  // ---------- bottom sheet (word / phrase / grammar / sentence notes, lists) ----------
  let sheetStack = [];
  function openSheet(entry) {
    if (sheetWrap.hidden) {
      sheetStack = [entry];
      sheetWrap.hidden = false;
      document.body.classList.add('kuSheetOpen');
      pushLayer('sheet');
      requestAnimationFrame(() => sheetWrap.classList.add('open'));
    } else sheetStack.push(entry);
    renderSheet();
  }
  function sheetGo(entry) { if (sheetWrap.hidden) openSheet(entry); else { sheetStack.push(entry); renderSheet(); } }
  function hideSheet() {
    sheetWrap.classList.remove('open');
    sheetWrap.hidden = true;
    sheetEl.style.transform = '';
    sheetBody.innerHTML = '';
    sheetStack = [];
    document.body.classList.remove('kuSheetOpen');
  }
  $('kuSheetPrev').addEventListener('click', () => { if (sheetStack.length > 1) { sheetStack.pop(); renderSheet(); } });
  const TYPE_ZH = { word: '词', phrase: '词组', grammar: '语法', sentence: '句子', topic: '主题', source: '来源' };
  function renderSheet() {
    const e = sheetStack[sheetStack.length - 1];
    if (!e) return;
    $('kuSheetPrev').hidden = sheetStack.length < 2;
    let title = ''; let body = '';
    if (e.type === 'note') { const r = noteHtml(e); title = r.title; body = r.html; }
    else if (e.type === 'vocab') { title = '生词'; body = vocabOnlyHtml(e.vocab); }
    else if (e.type === 'paras') { title = '段落'; body = parasHtml(); }
    else if (e.type === 'menu') { title = '整课'; body = menuHtml(); }
    $('kuSheetTitle').textContent = title;
    sheetBody.innerHTML = body;
    sheetBody.scrollTop = 0;
    if (e.type === 'menu') paintMenuRead();
  }

  const FORM_ZH = [
    [/^infinitiv/, '不定式'], [/^presens particip/, '现在分词'], [/^presens/, '现在时'], [/^preteritum/, '过去时'], [/^supinum/, '完成分词 supinum'],
    [/^imperativ/, '命令式'], [/^perfekt particip|^particip/, '过去分词'], [/^s-passiv|^passiv/, 's-被动'], [/^perfekt/, '现在完成'], [/^pluskvamperfekt/, '过去完成'], [/^futurum/, '将来时'],
    [/^obest(ämd)?\.?\s*(form\s*)?sing|^sing.*obest|^en-form|^obestämd singular/, '不定单数'], [/^best(ämd)?\.?\s*(form\s*)?sing|^sing.*best/, '定指单数'],
    [/^obest(ämd)?\.?\s*(form\s*)?plur|^plur.*obest/, '不定复数'], [/^best(ämd)?\.?\s*(form\s*)?plur|^plur.*best/, '定指复数'],
    [/^positiv/, '原级'], [/^komparativ/, '比较级'], [/^superlativ/, '最高级'], [/^utrum|^en-/, 'en 词形'], [/^neutrum|^ett-/, 'ett 词形'], [/^plural/, '复数'],
    [/^genitiv/, '属格'], [/^subjekt/, '主格'], [/^objekt/, '宾格'], [/^possessiv/, '物主'],
  ];
  const formZh = (label) => { const l = str(label).toLowerCase().trim(); for (const [re, zh] of FORM_ZH) if (re.test(l)) return zh; return ''; };
  // A table cell may hold several forms ("läser / läs", "(en) bok", "*böcker*").
  const cellForms = (v) => str(v).replace(/[*`_]/g, '').split(/\s*(?:[\/,;]|\beller\b|\bel\.\s)\s*/).map((x) => x.replace(/\([^)]*\)/g, '').replace(/[—–]/g, '').trim().toLowerCase()).filter(Boolean);
  const cleanCell = (v) => str(v).replace(/[*`_]/g, '').trim();
  function matchRows(table, form) {
    const f = str(form).toLowerCase().trim();
    if (!f) return new Set();
    const hit = new Set();
    table.forEach((row, k) => {
      const v = row[row.length - 1];
      const fs = cellForms(v);
      if (fs.includes(f) || fs.some((x) => x.split(/\s+/).includes(f))) hit.add(k);
    });
    return hit;
  }
  function secsHtml(n, type) {
    return arr(n.secs).filter((s) => isObj(s) && str(s.md).trim()).map((s, k) => {
      const key = `sec:${type}:${str(s.h)}`;
      const open = isOpen(key, type !== 'word' && k === 0);
      return `<details class="kuSec" data-mem="${esc(key)}"${open ? ' open' : ''}><summary>${esc(s.h || '更多')}</summary><div class="kuMd">${blk(s.md)}</div></details>`;
    }).join('');
  }
  function noteHtml(e) {
    const n = L && L.kb[e.slug];
    if (!n) return { title: '笔记', html: `<p class="kuEmpty">这条笔记不在本课的数据里：<code>${esc(e.slug)}</code></p>` };
    const t = n.t || 'word';
    let h = '';
    if (t === 'word') {
      const form = e.form && e.form.toLowerCase() !== str(n.title).toLowerCase() ? e.form : '';
      const tags = [n.pos, n.genus, n.cefr].filter(Boolean).map(esc).join(' · ');
      h += `<div class="kuNHead"><div class="kuNTitle" lang="sv">${form ? `<span class="kuForm">${esc(form)}</span><span class="kuArrow">→</span>` : ''}<b>${esc(n.title)}</b>${sayBtn(n.title)}</div>` +
        (tags ? `<div class="kuNTags">${tags}${n.known || st.knownWords[e.slug] ? ' · <span class="kuKnownMini">✓ 已会</span>' : ''}</div>` : '') + '</div>';
      h += `<p class="kuNZh">${inl(n.zh)}${n.en ? ` <span class="kuEn">· ${esc(n.en)}</span>` : ''}</p>`;
      const v = e.vocab || null;
      if (v && (v.note || v.zh)) h += `<div class="kuNNote"><span>本段说明</span>${v.zh && v.zh !== n.zh ? `<b>${inl(v.zh)}</b> ` : ''}${inl(v.note)}</div>`;
      const table = arr(n.table).filter((r) => Array.isArray(r) && r.length >= 2);
      if (table.length) {
        const hit = matchRows(table, e.form || '');
        h += `<div class="kuForms"><div class="kuFormsH">变形</div>${table.map((r, k) => {
          const zh = formZh(r[0]);
          return `<div class="kuFR${hit.has(k) ? ' hit' : ''}"><span class="kuFL">${esc(r[0])}${zh ? `<small>${esc(zh)}</small>` : ''}</span>` +
            `<span class="kuFV" lang="sv">${inl(r.slice(1).join(' · '))}</span>${hit.has(k) ? '<span class="kuFHere">◀ 文中</span>' : ''}</div>`;
        }).join('')}</div>`;
      }
      if (n.ipa || n.def) h += `<p class="kuNDef">${n.ipa ? `<span class="kuIpa">${esc(n.ipa)}</span>` : ''}${n.ipa && n.def ? ' · ' : ''}${n.def ? `🇸🇪 <span lang="sv">${inl(n.def)}</span>` : ''}</p>`;
      if (n.pron && n.pron.replace(n.ipa || '', '').replace(/^[^:：]*[:：]?\s*/, '').trim()) h += `<p class="kuNPron">🗣 ${inl(n.pron)}</p>`;
      const ex = arr(n.ex).filter((x) => Array.isArray(x) && x[0]);
      if (ex.length) h += `<div class="kuEx">${ex.map((x) => `<p><span lang="sv">${toks(x[0])}</span>${sayBtn(x[0])}${x[1] ? `<small>${inl(x[1])}</small>` : ''}</p>`).join('')}</div>`;
      h += secsHtml(n, 'word');
      const sw = !!st.starWords[e.slug]; const kw = !!(st.knownWords[e.slug]);
      h += `<div class="kuNAct"><button type="button" class="kuMini${sw ? ' on' : ''}" data-starw="${esc(e.slug)}" aria-pressed="${sw}">${sw ? '★ 要记' : '☆ 要记'}</button>` +
        `<button type="button" class="kuMini${kw ? ' on' : ''}" data-knoww="${esc(e.slug)}" aria-pressed="${kw}">${kw ? '✓ 已会' : '○ 已会'}</button>` +
        `<a class="kuMini" href="../sok/#note=${encodeURIComponent(e.slug)}">完整笔记 →</a></div>`;
      return { title: '词', html: h };
    }
    if (t === 'phrase') {
      h += `<div class="kuNHead"><div class="kuNTitle" lang="sv"><b>${esc(n.title)}</b>${sayBtn(n.title)}</div>${n.cat ? `<div class="kuNTags">${esc(n.cat)}</div>` : ''}</div>`;
      h += `<p class="kuNZh">${inl(n.zh)}${n.en ? ` <span class="kuEn">· ${esc(n.en)}</span>` : ''}</p>`;
    } else if (t === 'grammar') {
      h += `<div class="kuNHead"><div class="kuNTitle kuNTitleG">📗 ${esc(n.title)}</div></div>`;
      if (n.zh) h += `<p class="kuNZh">${inl(n.zh)}${n.en ? ` <span class="kuEn">· ${esc(n.en)}</span>` : ''}</p>`;
      if (n.tip) h += `<div class="kuNNote"><span>一句话</span>${inl(n.tip)}</div>`;
    } else {
      h += `<div class="kuNHead"><div class="kuNTitle"${t === 'sentence' ? ' lang="sv"' : ''}><b>${esc(n.title)}</b>${t === 'sentence' ? sayBtn(n.title) : ''}</div><div class="kuNTags">${esc(TYPE_ZH[t] || t)}</div></div>`;
      if (n.zh) h += `<p class="kuNZh">${inl(n.zh)}</p>`;
    }
    h += secsHtml(n, t);
    h += `<div class="kuNAct"><a class="kuMini" href="../sok/#note=${encodeURIComponent(e.slug)}">完整笔记 →</a></div>`;
    return { title: TYPE_ZH[t] || '笔记', html: h };
  }
  function vocabOnlyHtml(v) {
    return `<div class="kuNHead"><div class="kuNTitle" lang="sv">${v.form && v.form.toLowerCase() !== v.lemma.toLowerCase() ? `<span class="kuForm">${esc(v.form)}</span><span class="kuArrow">→</span>` : ''}<b>${esc(v.lemma || v.form)}</b>${sayBtn(v.lemma || v.form)}</div>` +
      `<div class="kuNTags">${esc(v.pos)}</div></div><p class="kuNZh">${inl(v.zh)}</p>` +
      (v.note ? `<div class="kuNNote"><span>本段说明</span>${inl(v.note)}</div>` : '') + '<p class="kuMuted kuSmall">知识库里还没有这个词的完整笔记。</p>';
  }
  sheetBody.addEventListener('click', (e) => {
    const sw = e.target.closest('[data-starw]');
    if (sw) {
      const s = sw.getAttribute('data-starw');
      if (st.starWords[s]) delete st.starWords[s]; else st.starWords[s] = 1;
      save(); renderSheetKeep(); toast(st.starWords[s] ? '★ 已加入「要记」' : '已取消「要记」'); refreshUnder();
      return;
    }
    const kw = e.target.closest('[data-knoww]');
    if (kw) {
      const s = kw.getAttribute('data-knoww');
      if (st.knownWords[s]) delete st.knownWords[s]; else st.knownWords[s] = 1;
      save(); renderSheetKeep(); toast(st.knownWords[s] ? '✓ 标为已会' : '已取消「已会」'); refreshUnder();
    }
  });
  function renderSheetKeep() { const top = sheetBody.scrollTop; renderSheet(); sheetBody.scrollTop = top; }
  // Re-paint the 词 list underneath so ★ / ✓ marks stay in step.
  function refreshUnder() { if (cur && cur.step === 'w' && layers.length === 1) { const top = mainEl.scrollTop; render(false); mainEl.scrollTop = top; } }

  // Global taps: words, wikilinks, speak buttons.
  function wordEntry(el) {
    const slug = el.getAttribute('data-w');
    const form = el.getAttribute('data-f') || '';
    const p = el.getAttribute('data-p');
    let vocab = null;
    const P = p != null ? paraByN(p) : null;
    if (P) {
      const f = form.toLowerCase();
      vocab = P.vocab.find((v) => v.form.toLowerCase() === f) ||
        P.vocab.find((v) => v.slug === slug && v.form.toLowerCase().split(/\s+/).includes(f)) || null;
    }
    return { type: 'note', slug, form, vocab };
  }
  document.addEventListener('click', (e) => {
    const sb = e.target.closest('.kuSay');
    if (sb) { e.preventDefault(); e.stopPropagation(); say(sb.getAttribute('data-say')); return; }
    const inSheet = !!e.target.closest('#kuSheet');
    const w = e.target.closest('.kuW');
    if (w) { e.preventDefault(); const en = wordEntry(w); if (inSheet) sheetGo(en); else openSheet(en); return; }
    const wl = e.target.closest('.wikiLink[data-wikilink]');
    if (wl && !wl.classList.contains('missingLink')) {
      e.preventDefault(); e.stopPropagation();
      const en = { type: 'note', slug: wl.getAttribute('data-wikilink') };
      if (inSheet) sheetGo(en); else openSheet(en);
    }
  }, false);
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"]:not(.speakBtn)')) { e.preventDefault(); e.target.click(); }
  });

  // Pull-down to close (handle, header, or the body when it is scrolled to the top).
  (function () {
    let y0 = 0; let x0 = 0; let dy = 0; let drag = false; let armed = false;
    sheetEl.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const inBody = !!e.target.closest('#kuSheetBody');
      armed = !inBody || sheetBody.scrollTop <= 0;
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; drag = false;
    }, { passive: true });
    sheetEl.addEventListener('touchmove', (e) => {
      if (!armed) return;
      const d = e.touches[0].clientY - y0; const dx = Math.abs(e.touches[0].clientX - x0);
      if (!drag) { if (d > 8 && d > dx) drag = true; else if (d < -4 || dx > 8) { armed = false; return; } else return; }
      dy = Math.max(0, d);
      sheetEl.style.transition = 'none';
      sheetEl.style.transform = `translateY(${dy}px)`;
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    const end = () => {
      if (!drag) { armed = false; return; }
      sheetEl.style.transition = '';
      if (dy > 90) closeTop(); else sheetEl.style.transform = '';
      drag = false; armed = false;
    };
    sheetEl.addEventListener('touchend', end);
    sheetEl.addEventListener('touchcancel', end);
  })();

  // ---------- paragraph list (tap the progress bar) ----------
  function parasHtml() {
    const ls = lessonSt(cur.slug);
    return `<ol class="kuParaList">${L.paras.map((p) => {
      const q = ls.paras[p.n] || {};
      const done = paraDone(q);
      const qz = isObj(q.quiz) ? ` · 练 ${q.quiz.right}/${q.quiz.total}` : q.quiz === 'skipped' ? ' · 练 跳过' : '';
      const steps = p.kind === 'extra' ? '附加段' : `${p.sents.length} 句 · ${['读', '拆', '词', '练'].map((z, k) => ([q.read, arr(q.sents).length, q.words, q.quiz][k] ? '✓' : '·') + z).join(' ')}${qz}`;
      return `<li><button type="button" class="kuPl${p.n === cur.para ? ' cur' : ''}${done ? ' done' : ''}" data-jump="${p.n}">` +
        `<span class="kuPlN">${p.kind === 'extra' ? '＋' : '¶' + p.n}</span><span class="kuPlT"><b>${esc(p.title)}</b><small>${esc(steps)}</small></span>` +
        `<span class="kuPlS">${done ? '✓' : ''}</span></button></li>`;
    }).join('')}</ol>`;
  }
  $('kuBar').addEventListener('click', () => { if (cur && L) openSheet({ type: 'paras' }); });
  sheetBody.addEventListener('click', (e) => {
    const j = e.target.closest('[data-jump]');
    if (!j) return;
    const n = Number(j.getAttribute('data-jump'));
    closeTop(() => { if (n !== cur.para) goPara(n); else syncHash(); });
  });

  // ---------- ⋯ menu ----------
  function menuHtml() {
    const m = metaOf(cur.slug);
    const ls = lessonSt(cur.slug);
    const done = realParas().filter((p) => paraDone(ls.paras[p.n])).length;
    const nStar = Object.keys(ls.starSents).length + Object.keys(L.kb).filter((s) => st.starWords[s]).length;
    let h = `<p class="kuMenuProg">已学完 <b>${done}</b> / ${realParas().length} 段${done >= realParas().length && realParas().length ? ' 🎉' : ''}</p><div class="kuMenu">`;
    h += `<button type="button" data-view="full"><i>📜</i><span><b>全文</b><small>连读全文，词可点，逐段可开译文</small></span></button>`;
    h += `<button type="button" data-view="notes"><i>📌</i><span><b>语法要点</b><small>教学备注 ${L.notes.length} 条 · 本课语法 ${L.items.grammar.length}</small></span></button>`;
    h += `<button type="button" data-view="words"><i>📚</i><span><b>本课词表</b><small>全部生词合并去重，可只看 ⭐</small></span></button>`;
    h += `<button type="button" data-view="marks"><i>⭐</i><span><b>我的标记</b><small>${nStar ? nStar + ' 个难句 / 要记的词 · ' : ''}重点句</small></span></button>`;
    h += `<button type="button" id="kuReadBtn" data-markread="1"><i>✓</i><span><b>标为已读</b><small>与 Läsning 同一个已读标记（算活跃）</small></span></button>`;
    h += '</div><div class="kuMenuLinks">';
    h += `<a class="kuMini" href="../reading/#article=${encodeURIComponent(cur.slug)}">📖 在 Läsning 打开</a>`;
    if (m && m.listen) h += `<a class="kuMini" href="../listening/#ep=${encodeURIComponent(m.listen)}">🎧 听这篇</a>`;
    h += '<button type="button" class="kuMini" data-readsync="1">☁️ 同步</button></div>';
    h += `<div class="kuSet"><label class="kuSetRow"><span>译文默认展开<small>关 = 先自己想，点一下才出</small></span><input type="checkbox" id="kuPrefZh"${st.prefs.showZh ? ' checked' : ''}></label>` +
      `<label class="kuSetRow"><span>朗读语速 <b id="kuRateV">${st.prefs.rate.toFixed(2)}×</b></span><input type="range" id="kuPrefRate" min="0.6" max="1.1" step="0.05" value="${st.prefs.rate}" aria-label="朗读语速"></label></div>`;
    return h;
  }
  function paintMenuRead() {
    const b = $('kuReadBtn');
    if (!b || !cur) return;
    const r = isRead(cur.slug);
    b.classList.toggle('on', r);
    b.querySelector('b').textContent = r ? '已读 ✓（点一下取消）' : '标为已读';
    b.querySelector('i').textContent = r ? '✅' : '✓';
  }
  $('kuMenuBtn').addEventListener('click', () => { if (cur && L) openSheet({ type: 'menu' }); });
  sheetBody.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (v) { openView(v.getAttribute('data-view')); return; }
    if (e.target.closest('[data-markread]')) {
      if (!window.ReadSync) { toast('已读同步模块没有加载'); return; }
      const r = !isRead(cur.slug);
      window.ReadSync.setRead(cur.slug, r);
      paintMenuRead();
      toast(r ? '✓ 已标为已读' : '已取消已读');
    }
  });
  sheetBody.addEventListener('change', (e) => {
    if (e.target.id === 'kuPrefZh') { st.prefs.showZh = e.target.checked; save(); }
  });
  sheetBody.addEventListener('input', (e) => {
    if (e.target.id === 'kuPrefRate') { st.prefs.rate = Number(e.target.value) || 0.85; $('kuRateV').textContent = st.prefs.rate.toFixed(2) + '×'; save(); }
  });

  // ---------- whole-lesson views (replace the menu sheet in the same history entry) ----------
  function openView(kind) {
    hideSheet();
    if (layers[layers.length - 1] === 'sheet') layers[layers.length - 1] = 'view'; else pushLayer('view');
    viewEl.hidden = false;
    document.body.classList.add('kuViewOpen');
    const T = { full: '📜 全文', notes: '📌 语法要点', words: '📚 本课词表', marks: '⭐ 我的标记' };
    $('kuViewTitle').textContent = T[kind] || '';
    viewEl.setAttribute('data-kind', kind);
    paintView(kind);
    viewBody.scrollTop = 0;
  }
  function paintView(kind) {
    if (kind === 'full') viewBody.innerHTML = fullHtml();
    else if (kind === 'notes') viewBody.innerHTML = notesHtml();
    else if (kind === 'words') viewBody.innerHTML = wordsHtml();
    else if (kind === 'marks') viewBody.innerHTML = marksHtml();
  }
  function fullHtml() {
    let h = `<header class="kuFullHead"><h1 lang="sv">${esc(L.title)}</h1>${L.sub || L.cefr ? `<p>${[L.sub, L.cefr, L.date].filter(Boolean).map(esc).join(' · ')}</p>` : ''}` +
      (L.meta.length ? `<dl class="kuMetaDl">${L.meta.map((m) => `<dt>${esc(m.k)}</dt><dd>${inl(m.v)}</dd>`).join('')}</dl>` : '') +
      `<button type="button" class="kuBtn ghost" data-sayfull="1">🔊 朗读全文</button></header>`;
    for (const p of L.paras) {
      h += `<section class="kuFullP" id="kuFull-${p.n}"><h2><span class="kuParaN">${p.kind === 'extra' ? '附加段' : '¶' + p.n}</span> ${esc(p.title)}` +
        `<button type="button" class="kuMini" data-jumpview="${p.n}">学这段 →</button></h2>`;
      if (p.kind === 'extra') h += `<div class="kuMd">${blk(p.extraMd)}</div>${p.sv ? `<div class="kuRead" lang="sv">${svLines(p.sv, p.n)}</div>` : ''}`;
      else h += `<div class="kuRead" lang="sv">${svLines(p.sv || p.sents.map((s) => s.sv).join(' '), p.n)}</div>`;
      if (p.zh) h += zhBlock(`pz:${cur.slug}:${p.n}`, p.zh, '显示段译');
      h += '</section>';
    }
    return h;
  }
  function notesHtml() {
    let h = '';
    if (L.notes.length) {
      h += `<div class="kuNotes">${L.notes.map((n) => `<article class="kuNoteCard"><h3>${inl(n.point)}</h3>` +
        (n.sv ? `<p class="kuNoteSv" lang="sv">${inl(n.sv)}</p>` : '') + (n.zh ? `<p class="kuNoteZh">${inl(n.zh)}</p>` : '') + '</article>').join('')}</div>`;
    }
    if (L.notesMd) h += `<section class="kuExtra"><h3>📎 备注补充</h3>${blk(L.notesMd)}</section>`;
    if (L.items.grammar.length) {
      h += `<section class="kuWl"><h3>📗 本课语法 <small>${L.items.grammar.length}</small></h3><ul class="kuRows">${L.items.grammar.map((g) => {
        const tap = g.slug && L.kb[g.slug];
        return `<li><div class="kuRow${tap ? ' tap' : ''}"${tap ? ` role="button" tabindex="0" data-note="${esc(g.slug)}"` : ''}><span class="kuRowMain"><span class="kuRowSv" lang="sv"><b>${esc(g.name)}</b></span></span>` +
          `<span class="kuRowZh">${inl(g.zh)}${g.en ? ` <span class="kuEn">· ${esc(g.en)}</span>` : ''}</span>${tap ? '<span class="kuChev" aria-hidden="true">›</span>' : ''}</div></li>`;
      }).join('')}</ul></section>`;
    }
    return h || '<p class="kuEmpty">这一课没有教学备注。</p>';
  }
  // All vocab of the lesson, merged & deduped (para vocab + export words), phrases likewise.
  function lessonWordList() {
    const map = new Map();
    const keyOf = (slug, lemma) => slug || 'l:' + str(lemma).toLowerCase();
    for (const p of L.paras) for (const v of p.vocab) {
      const k = keyOf(v.slug, v.lemma || v.form);
      const e = map.get(k) || { slug: v.slug, lemma: v.lemma || v.form, pos: v.pos, zh: v.zh, en: '', forms: [], notes: [], paras: [] };
      if (v.form && !e.forms.includes(v.form)) e.forms.push(v.form);
      if (v.note && !e.notes.includes(v.note)) e.notes.push(v.note);
      if (v.zh && e.zh !== v.zh && !e.zh.includes(v.zh)) e.zh = e.zh ? e.zh + '；' + v.zh : v.zh;
      if (!e.paras.includes(p.n)) e.paras.push(p.n);
      map.set(k, e);
    }
    for (const w of L.items.words) {
      let k = keyOf(w.slug, w.sv);
      if (!map.has(k)) { const alt = [...map.values()].find((e) => e.lemma.toLowerCase() === str(w.sv).toLowerCase()); if (alt) k = keyOf(alt.slug, alt.lemma); }
      const e = map.get(k) || { slug: w.slug, lemma: w.sv, pos: w.pos, zh: w.zh, en: '', forms: [], notes: [], paras: [] };
      if (!e.pos) e.pos = w.pos;
      if (w.zh && !e.zh.includes(w.zh)) e.zh = e.zh ? e.zh + '；' + w.zh : w.zh;
      if (w.en) e.en = w.en;
      map.set(k, e);
    }
    return [...map.values()].sort((a, b) => a.lemma.localeCompare(b.lemma, 'sv'));
  }
  function lessonPhraseList() {
    const map = new Map();
    for (const p of L.paras) for (const x of p.phrases) {
      const k = x.slug || 'l:' + x.sv.toLowerCase();
      const e = map.get(k) || { slug: x.slug, sv: x.sv, zh: x.zh, en: '', pos: '', uses: [] };
      if (x.use && !e.uses.includes(x.use)) e.uses.push(x.use);
      map.set(k, e);
    }
    for (const x of L.items.phrases) {
      let k = x.slug || 'l:' + str(x.sv).toLowerCase();
      if (!map.has(k)) { const alt = [...map.values()].find((e) => e.sv.toLowerCase() === str(x.sv).toLowerCase()); if (alt) k = alt.slug || 'l:' + alt.sv.toLowerCase(); }
      const e = map.get(k) || { slug: x.slug, sv: x.sv, zh: x.zh, en: '', pos: x.pos, uses: [] };
      if (x.zh && !e.zh.includes(x.zh)) e.zh = e.zh ? e.zh + '；' + x.zh : x.zh;
      e.en = x.en || e.en; e.pos = e.pos || x.pos;
      map.set(k, e);
    }
    return [...map.values()];
  }
  let wordsOnlyStar = false;
  function wordsHtml() {
    const all = lessonWordList();
    const list = wordsOnlyStar ? all.filter((w) => w.slug && st.starWords[w.slug]) : all;
    let h = `<div class="kuFilter"><button type="button" class="kuMini${wordsOnlyStar ? '' : ' on'}" data-wf="all" aria-pressed="${!wordsOnlyStar}">全部 ${all.length}</button>` +
      `<button type="button" class="kuMini${wordsOnlyStar ? ' on' : ''}" data-wf="star" aria-pressed="${wordsOnlyStar}">只看 ⭐ ${all.filter((w) => w.slug && st.starWords[w.slug]).length}</button></div>`;
    if (!list.length) h += `<p class="kuEmpty">${wordsOnlyStar ? '还没有标「要记」的词。点开任何一个词，按 ☆ 要记。' : '这一课没有生词表。'}</p>`;
    h += `<ul class="kuRows">${list.map((w) => {
      const tap = w.slug && L.kb[w.slug];
      const n = tap ? L.kb[w.slug] : null;
      const forms = w.forms.filter((f) => f.toLowerCase() !== w.lemma.toLowerCase());
      return `<li><div class="kuRow${tap ? ' tap' : ''}"${tap ? ` role="button" tabindex="0" data-note="${esc(w.slug)}" data-form="${esc(w.forms[0] || '')}"` : ''}>` +
        `<span class="kuRowMain"><span class="kuRowSv" lang="sv"><b>${esc(w.lemma)}</b>${w.slug && st.starWords[w.slug] ? ' <span class="kuStarMini">★</span>' : ''}${w.slug && st.knownWords[w.slug] ? ' <span class="kuKnownMini">✓</span>' : ''}</span>` +
        `<span class="kuRowPos">${esc(w.pos)}${n && n.cefr ? ' · ' + esc(n.cefr) : ''}${w.paras.length ? ' · ¶' + w.paras.join(' ¶') : ''}</span></span>` +
        `<span class="kuRowZh">${inl(w.zh)}${w.en ? ` <span class="kuEn">· ${esc(w.en)}</span>` : ''}</span>` +
        (forms.length ? `<span class="kuRowUse" lang="sv">文中：${forms.map(esc).join(' · ')}</span>` : '') +
        w.notes.map((x) => `<span class="kuRowNote">${inl(x)}</span>`).join('') +
        (tap ? '<span class="kuChev" aria-hidden="true">›</span>' : '') + '</div></li>';
    }).join('')}</ul>`;
    if (!wordsOnlyStar) {
      const ph = lessonPhraseList();
      if (ph.length) {
        h += `<section class="kuWl"><h3>🧩 本课词组 <small>${ph.length}</small></h3><ul class="kuRows">${ph.map((x) => {
          const tap = x.slug && L.kb[x.slug];
          return `<li><div class="kuRow${tap ? ' tap' : ''}"${tap ? ` role="button" tabindex="0" data-note="${esc(x.slug)}"` : ''}><span class="kuRowMain"><span class="kuRowSv" lang="sv"><b>${inl(x.sv)}</b></span>` +
            `<span class="kuRowPos">${esc(x.pos)}</span></span><span class="kuRowZh">${inl(x.zh)}${x.en ? ` <span class="kuEn">· ${esc(x.en)}</span>` : ''}</span>` +
            x.uses.map((u) => `<span class="kuRowUse" lang="sv">${inl(u)}</span>`).join('') + (tap ? '<span class="kuChev" aria-hidden="true">›</span>' : '') + '</div></li>';
        }).join('')}</ul></section>`;
      }
    }
    return h;
  }
  let marksOnlyKey = false;
  function marksHtml() {
    const ls = lessonSt(cur.slug);
    const sents = [];
    for (const p of L.paras) for (const s of p.sents) {
      const star = !!ls.starSents[`${p.n}.${s.i}`];
      if (star || s.key) sents.push({ p, s, star });
    }
    const list = marksOnlyKey ? sents.filter((x) => x.s.key) : sents.filter((x) => x.star);
    let h = `<div class="kuFilter"><button type="button" class="kuMini${marksOnlyKey ? '' : ' on'}" data-mf="star" aria-pressed="${!marksOnlyKey}">☆ 我标的难句 ${sents.filter((x) => x.star).length}</button>` +
      `<button type="button" class="kuMini${marksOnlyKey ? ' on' : ''}" data-mf="key" aria-pressed="${marksOnlyKey}">★ 重点句 ${sents.filter((x) => x.s.key).length}</button></div>`;
    h += list.length ? `<ul class="kuRows">${list.map(({ p, s, star }) => `<li><div class="kuRow tap" role="button" tabindex="0" data-jumpsent="${p.n}.${s.i}">` +
      `<span class="kuRowSv" lang="sv">${esc(s.sv)}</span><span class="kuRowZh">${inl(s.zh)}</span>` +
      `<span class="kuRowPos">¶${p.n} · 句 ${s.i}${s.key ? ' · ★ 重点句' : ''}${star ? ' · ☆ 难句' : ''}</span><span class="kuChev" aria-hidden="true">›</span></div></li>`).join('')}</ul>`
      : `<p class="kuEmpty">${marksOnlyKey ? '这一课没有标出重点句。' : '还没有标难句。在「拆」里按 ☆ 难句。'}</p>`;
    const words = Object.keys(L.kb).filter((s) => st.starWords[s]);
    h += `<section class="kuWl"><h3>★ 要记的词 <small>${words.length}</small></h3>`;
    h += words.length ? `<ul class="kuRows">${words.map((s) => { const n = L.kb[s]; return `<li><div class="kuRow tap" role="button" tabindex="0" data-note="${esc(s)}"><span class="kuRowMain"><span class="kuRowSv" lang="sv"><b>${esc(n.title)}</b></span><span class="kuRowPos">${esc(n.pos || TYPE_ZH[n.t] || '')}</span></span><span class="kuRowZh">${inl(n.zh)}</span><span class="kuChev" aria-hidden="true">›</span></div></li>`; }).join('')}</ul>`
      : '<p class="kuMuted kuSmall">点开任何一个词，按 ☆ 要记。</p>';
    return h + '</section>';
  }
  viewBody.addEventListener('click', (e) => {
    const wf = e.target.closest('[data-wf]');
    if (wf) { wordsOnlyStar = wf.getAttribute('data-wf') === 'star'; paintView('words'); return; }
    const mf = e.target.closest('[data-mf]');
    if (mf) { marksOnlyKey = mf.getAttribute('data-mf') === 'key'; paintView('marks'); return; }
    if (e.target.closest('.wikiLink, .kuW, .kuSay')) return;
    const nt = e.target.closest('[data-note]');
    if (nt) { openSheet({ type: 'note', slug: nt.getAttribute('data-note'), form: nt.getAttribute('data-form') || '' }); return; }
    const jv = e.target.closest('[data-jumpview]');
    if (jv) { const n = Number(jv.getAttribute('data-jumpview')); closeTop(() => goPara(n)); return; }
    const js = e.target.closest('[data-jumpsent]');
    if (js) { const [n, i] = js.getAttribute('data-jumpsent').split('.').map(Number); closeTop(() => { cur.para = n; cur.step = 'a'; cur.sent = i; quiz = null; render(true); }); return; }
    if (e.target.closest('[data-sayfull]')) say(L.paras.flatMap((p) => (p.sents.length ? p.sents.map((s) => s.sv) : [])).filter(Boolean));
  });

  // ---------- ④ 练 ----------
  let quiz = null;   // { para, qs:[], k, answered, right, log:[] }
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wordRe = (f) => new RegExp(`(^|[^A-Za-zÀ-ÖØ-öø-ÿ])(${escRe(f)})(?![A-Za-zÀ-ÖØ-öø-ÿ])`, 'i');
  function findIn(sv, form) { const m = form ? wordRe(form).exec(sv) : null; return m ? { at: m.index + m[1].length, len: m[2].length, text: m[2] } : null; }
  // Distractor pool: every word of this lesson with a Chinese gloss.
  function lessonPool() {
    const out = []; const seen = new Set();
    const add = (o) => { const k = (o.slug || '') + '|' + o.lemma.toLowerCase(); if (!o.lemma || !o.zh || seen.has(k)) return; seen.add(k); out.push(o); };
    for (const p of L.paras) for (const v of p.vocab) add({ slug: v.slug, lemma: v.lemma || v.form, form: v.form, zh: v.zh, pos: posHead(v.pos) });
    for (const w of L.items.words) add({ slug: w.slug, lemma: w.sv, form: w.sv, zh: w.zh, pos: posHead(w.pos) });
    for (const [s, n] of Object.entries(L.kb)) if (n && n.t === 'word' && n.lvl === 'full') add({ slug: s, lemma: str(n.title), form: str(n.title), zh: str(n.zh), pos: posHead(n.pos) });
    return out;
  }
  function pickDistract(ans, pool, field, n) {
    const mine = glosses(ans.zh);
    const seen = new Set([field === 'zh' ? zhShort(ans.zh) : str(ans[field]).toLowerCase()]);
    const ok = (x) => {
      if ((x.slug && x.slug === ans.slug) || x.lemma.toLowerCase() === ans.lemma.toLowerCase() || overlaps(mine, glosses(x.zh))) return false;
      const key = field === 'zh' ? zhShort(x.zh) : str(x[field]).toLowerCase();
      return key && !seen.has(key);
    };
    const out = [];
    for (const pass of [true, false]) {
      for (const x of shuffle(pool)) {
        if (out.length >= n) break;
        if (pass && x.pos !== ans.pos) continue;
        if (!ok(x)) continue;
        seen.add(field === 'zh' ? zhShort(x.zh) : str(x[field]).toLowerCase());
        out.push(x);
      }
    }
    return out;
  }
  // Distinct single-form cells of a word's table: [{label, form}]
  function tableForms(n) {
    const rows = arr(n && n.table).filter((r) => Array.isArray(r) && r.length >= 2).map((r) => ({ label: str(r[0]), raw: cleanCell(r.slice(1).join(' ')), forms: cellForms(r.slice(1).join(' ')) }));
    const distinct = uniq(rows.flatMap((r) => r.forms));
    const count = new Map(); for (const r of rows) for (const f of r.forms) count.set(f, (count.get(f) || 0) + 1);
    const single = rows.filter((r) => r.forms.length === 1 && count.get(r.forms[0]) === 1 && !/\s/.test(r.forms[0]) && /^[a-zåäöéü-]+$/.test(r.forms[0]));
    return { rows, distinct, single };
  }
  function sentWith(P, form) {
    for (const s of P.sents) { const m = findIn(s.sv, form); if (m) return { s, m }; }
    return null;
  }
  function buildQuiz(P) {
    const pool = lessonPool();
    const C = { meaning: [], form: [], cloze: [], order: [] };
    // 词义: a vocab word highlighted in its sentence → pick the Chinese
    for (const v of P.vocab) {
      if (!v.zh) continue;
      const hit = sentWith(P, v.form) || (v.lemma ? sentWith(P, v.lemma) : null);
      if (!hit) continue;
      const ans = { slug: v.slug, lemma: v.lemma || v.form, zh: v.zh, pos: posHead(v.pos) };
      const ds = pickDistract(ans, pool, 'zh', 3);
      if (ds.length < 3) continue;
      C.meaning.push({ type: 'meaning', slug: v.slug, key: v.slug || ans.lemma, s: hit.s, m: hit.m, v,
        opts: shuffle([{ t: zhShort(v.zh), ok: 1 }].concat(ds.map((d) => ({ t: zhShort(d.zh) })))) });
    }
    // 变形: a word with ≥ 3 distinct forms → pick the requested form from its own forms
    const seenW = new Set();
    const cands = P.vocab.filter((v) => v.slug && L.kb[v.slug]).map((v) => v.slug);
    for (const s of P.sents) for (const t of s.sv.match(WORD_RE) || []) { const sl = L.forms[t.toLowerCase()]; if (sl && L.kb[sl]) cands.push(sl); }
    for (const slug of uniq(cands)) {
      const n = L.kb[slug];
      if (!n || n.t !== 'word' || seenW.has(slug)) continue;
      const tf = tableForms(n);
      if (tf.distinct.length < 3 || tf.single.length < 2) continue;
      seenW.add(slug);
      // prefer asking for the form that is NOT the lemma; and preferably the one used in this paragraph
      const inPara = tf.single.filter((r) => P.sents.some((s) => findIn(s.sv, r.forms[0])));
      const choices = shuffle(inPara.length ? inPara : tf.single).filter((r) => r.forms[0] !== str(n.title).toLowerCase());
      const ask = choices[0] || tf.single[0];
      const others = shuffle(tf.distinct.filter((f) => f !== ask.forms[0] && !/\s/.test(f))).slice(0, 3);
      if (others.length < 2) continue;
      const hit = sentWith(P, ask.forms[0]) || tf.distinct.map((f) => sentWith(P, f)).find(Boolean) || null;
      C.form.push({ type: 'form', slug, key: slug, n, label: ask.label, ans: ask.forms[0], s: hit && hit.s, m: hit && hit.m,
        opts: shuffle([{ t: ask.forms[0], ok: 1 }].concat(others.map((f) => ({ t: f })))) });
    }
    // 填空: blank a vocab form in its sentence → pick the (inflected) word
    for (const v of P.vocab) {
      if (!v.slug || !L.kb[v.slug] || /\s/.test(v.form.trim())) continue;
      const hit = sentWith(P, v.form);
      if (!hit) continue;
      const n = L.kb[v.slug];
      const ansT = hit.m.text;
      const low = ansT.toLowerCase();
      const own = n && n.t === 'word' ? shuffle(tableForms(n).distinct.filter((f) => f !== low && !/\s/.test(f))).slice(0, 2) : [];
      const ans = { slug: v.slug, lemma: v.lemma || v.form, zh: v.zh, pos: posHead(v.pos), form: v.form };
      const need = 3 - own.length;
      const oth = pickDistract(ans, pool.filter((x) => x.form && !/\s/.test(x.form)), 'form', need).map((d) => d.form.toLowerCase())
        .filter((f) => f !== low && !own.includes(f));
      const opts = uniq(own.concat(oth)).slice(0, 3);
      if (opts.length < 2) continue;
      const cap = (f) => (/^[A-ZÅÄÖ]/.test(ansT) ? f.charAt(0).toUpperCase() + f.slice(1) : f);
      C.cloze.push({ type: 'cloze', slug: v.slug, key: v.slug, s: hit.s, m: hit.m, v, ans: ansT,
        opts: shuffle([{ t: ansT, ok: 1 }].concat(opts.map((f) => ({ t: cap(f) })))) });
    }
    // 排语序: 3–7 chunks
    for (const s of P.sents) {
      if (!s.chunks || s.chunks.length < 3 || s.chunks.length > 7) continue;
      const order = s.chunks.map((c, k) => k);
      let sh = shuffle(order); let guard = 0;
      while (sh.join() === order.join() && guard++ < 10) sh = shuffle(order);
      C.order.push({ type: 'order', key: 's' + s.i, s, sh });
    }
    for (const k of Object.keys(C)) C[k] = shuffle(C[k]);
    const target = Math.min(8, Math.max(5, P.sents.length + 2));
    const qs = []; const used = new Set();
    const types = ['meaning', 'form', 'order', 'cloze'];
    let progress = true;
    while (qs.length < target && progress) {
      progress = false;
      for (const t of types) {
        if (qs.length >= target) break;
        let k = C[t].findIndex((q) => !used.has(q.key));
        if (k < 0 && t !== 'order') k = C[t].findIndex((q) => !qs.includes(q) && !qs.some((x) => x.type === t && x.key === q.key));
        if (k < 0) continue;
        const q = C[t].splice(k, 1)[0];
        used.add(q.key); qs.push(q); progress = true;
      }
    }
    return shuffle(qs);
  }
  const TYPE_Q = { meaning: '词义', form: '变形', order: '排语序', cloze: '填空' };
  function renderQuiz(P) {
    if (!quiz || quiz.para !== P.n) quiz = { para: P.n, qs: buildQuiz(P), k: 0, answered: false, right: 0, log: [], picked: [] };
    const top = `<div class="kuQTop"><span class="kuParaN">¶${P.n}</span><span class="kuQProg">${quiz.qs.length ? `${Math.min(quiz.k + 1, quiz.qs.length)} / ${quiz.qs.length}` : ''}</span>` +
      (quiz.k < quiz.qs.length ? '<button type="button" class="kuLink" data-qskip="1">跳过练习</button>' : '') + '</div>';
    if (!quiz.qs.length) {
      mainEl.innerHTML = `<div class="kuPage">${paraHead(P)}<p class="kuEmpty">这一段的数据不够出题（没有可用的生词、变形表或 3–7 块的结构）。本段算学完、标为「未测」。</p>` +
        `<div class="kuNext">${nextBtn()}</div></div>`;
      finishQuiz(P, true);
      return;
    }
    if (quiz.skipped) { mainEl.innerHTML = skippedHtml(P); return; }
    if (quiz.k >= quiz.qs.length) { mainEl.innerHTML = `<div class="kuPage">${top}${resultHtml(P)}</div>`; return; }
    const q = quiz.qs[quiz.k];
    let h = `<div class="kuQ" data-type="${q.type}"><span class="kuQType">${TYPE_Q[q.type]}</span>`;
    if (q.type === 'meaning') {
      h += `<p class="kuQAsk">句中高亮的词是什么意思？</p><p class="kuQSv" lang="sv">${hlSent(q.s.sv, q.m, 'mark')}</p>`;
    } else if (q.type === 'form') {
      const zh = formZh(q.label);
      h += `<p class="kuQAsk">选出这个形式：</p><p class="kuQForm" lang="sv"><b>${esc(q.n.title)}</b> <span class="kuQLabel">${esc(q.label)}${zh ? ` <small>${esc(zh)}</small>` : ''}</span></p>` +
        `<p class="kuQHint">${esc(q.n.pos || '')}${q.n.zh ? ' · ' + inl(zhShort(q.n.zh)) : ''}</p>`;
    } else if (q.type === 'cloze') {
      h += `<p class="kuQAsk">填空：选合适的词形</p><p class="kuQSv" lang="sv">${hlSent(q.s.sv, q.m, 'blank')}</p><p class="kuQHint">${inl(q.v.zh)}${q.v.lemma ? ` · 原形 <span lang="sv">${esc(q.v.lemma)}</span>` : ''}</p>`;
    } else if (q.type === 'order') {
      h += `<p class="kuQAsk">按原句顺序点选成分：</p>${q.s.zh ? `<p class="kuQHint">${inl(q.s.zh)}</p>` : ''}` +
        `<div class="kuOrdTarget" id="kuOrdT" lang="sv" aria-label="已选">${quiz.picked.map((ix) => `<button type="button" class="kuOrdC put" data-put="${ix}">${clauseMark(q.s.chunks[ix].t)}</button>`).join('') || '<span class="kuOrdPh">点下面的块…</span>'}</div>` +
        `<div class="kuOrdPool" lang="sv">${q.sh.map((ix) => `<button type="button" class="kuOrdC" data-take="${ix}"${quiz.picked.includes(ix) || quiz.answered ? ' disabled' : ''}>${clauseMark(q.s.chunks[ix].t)}</button>`).join('')}</div>`;
    }
    if (q.type !== 'order') {
      h += `<div class="kuOpts${q.type === 'meaning' ? ' zh' : ''}"${q.type === 'meaning' ? '' : ' lang="sv"'}>${q.opts.map((o, k) => {
        let cls = 'kuOpt';
        if (quiz.answered) cls += o.ok ? ' right' : (quiz.choice === k ? ' wrong' : ' fade');
        return `<button type="button" class="${cls}" data-opt="${k}"${quiz.answered ? ' disabled' : ''}><kbd>${k + 1}</kbd><span>${esc(o.t)}</span></button>`;
      }).join('')}</div>`;
    }
    if (quiz.answered) h += feedbackHtml(q);
    h += '</div>';
    mainEl.innerHTML = `<div class="kuPage">${top}${h}</div>`;
    if (quiz.answered) { const f = mainEl.querySelector('.kuFb'); if (f && quiz.justAnswered) { quiz.justAnswered = false; f.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' }); } }
  }
  function hlSent(sv, m, kind) {
    if (!m) return esc(sv);
    const a = esc(sv.slice(0, m.at)); const b = esc(sv.slice(m.at + m.len));
    if (kind === 'blank') return `${a}<span class="kuBlank">${quiz && quiz.answered ? esc(m.text) : '＿＿＿'}</span>${b}`;
    if (kind === 'bold') return `${a}<b>${esc(m.text)}</b>${b}`;
    return `${a}<mark>${esc(m.text)}</mark>${b}`;
  }
  function feedbackHtml(q) {
    const ok = quiz.lastOk;
    let h = `<div class="kuFb ${ok ? 'ok' : 'no'}" role="status"><p class="kuFbV">${ok ? '✓ 答对了' : '✗ 不对'}`;
    if (q.type === 'meaning') h += ` — <b lang="sv">${esc(q.m.text)}</b> = ${inl(q.v.zh)}${q.v.lemma && q.v.lemma.toLowerCase() !== q.m.text.toLowerCase() ? `（原形 <span lang="sv">${esc(q.v.lemma)}</span>）` : ''}`;
    else if (q.type === 'form') h += ` — <span lang="sv">${esc(q.n.title)}</span> 的 ${esc(q.label)} 是 <b lang="sv">${esc(q.ans)}</b>`;
    else if (q.type === 'cloze') h += ` — <b lang="sv">${esc(q.ans)}</b>${q.v.note ? `：${inl(q.v.note)}` : ''}`;
    h += '</p>';
    if (q.type === 'form') {
      const tf = tableForms(q.n);
      h += `<div class="kuFbForms" lang="sv">${tf.rows.map((r) => `<span${r.forms.includes(q.ans) ? ' class="hit"' : ''}><small>${esc(r.label)}</small>${esc(r.raw)}</span>`).join('')}</div>`;
    }
    if (q.s) {
      h += `<p class="kuFbSent" lang="sv">${q.type === 'order' ? esc(q.s.sv) : hlSent(q.s.sv, q.m, 'bold')}</p>`;
      if (q.s.zh) h += `<p class="kuFbZh">${inl(q.s.zh)}</p>`;
      if (q.s.points.length) h += `<div class="kuFbPts">${q.s.points.map((p) => `<div class="kuPoint">${inl(p)}</div>`).join('')}</div>`;
    }
    h += `<div class="kuNext"><button type="button" class="kuBtn" data-qnext="1">${quiz.k + 1 >= quiz.qs.length ? '看结果 →' : '下一题 →'}</button></div></div>`;
    return h;
  }
  function answer(ok, q) {
    quiz.answered = true; quiz.lastOk = ok; quiz.justAnswered = true;
    if (ok) quiz.right += 1;
    quiz.log.push({ type: q.type, ok, label: q.type === 'order' ? q.s.sv : q.type === 'form' ? `${q.n.title} · ${q.label}` : (q.m ? q.m.text : '') });
    if (q.type !== 'order' && q.slug) ovaRecord(q.slug, ok);
    renderQuiz(paraByN(cur.para));
  }
  function nextBtn() {
    const n = nextPara();
    return n ? `<button type="button" class="kuBtn" data-nextpara="1">下一段：${n.kind === 'extra' ? '附加段' : '¶' + n.n} ${esc(n.title)} →</button>` : '<button type="button" class="kuBtn" data-nextpara="1">✓ 全课学完 · 回课程列表</button>';
  }
  function finishQuiz(P, skipped) {
    const q = paraSt(cur.slug, P.n);
    q.quiz = skipped ? 'skipped' : { right: quiz.right, total: quiz.qs.length, at: new Date().toISOString() };
    save(); paintTabs(); paintBar();
  }
  const skippedHtml = (P) => `<div class="kuPage">${paraHead(P)}<p class="kuEmpty">已跳过练习：本段算学完，标为「未测」。</p><div class="kuNext kuNextCol">${nextBtn()}<button type="button" class="kuBtn ghost" data-qagain="1">还是练一下</button></div></div>`;
  function resultHtml(P) {
    const ls = lessonSt(cur.slug);
    const allDone = realParas().every((p) => paraDone(ls.paras[p.n]));
    const pct = quiz.qs.length ? Math.round((quiz.right / quiz.qs.length) * 100) : 0;
    let h = `<div class="kuRes"><p class="kuResBig"><b>${quiz.right}</b> / ${quiz.qs.length}</p><p class="kuResSub">${pct >= 80 ? '很好！这一段学完了。' : pct >= 50 ? '不错。错的词已进 Öva 复习队列。' : '这段再看一遍「拆」会更稳。错的词已进 Öva 复习队列。'}</p>`;
    h += `<ul class="kuResList">${quiz.log.map((x) => `<li class="${x.ok ? 'ok' : 'no'}"><span>${x.ok ? '✓' : '✗'}</span><em>${TYPE_Q[x.type]}</em><span lang="sv">${esc(x.label)}</span></li>`).join('')}</ul>`;
    h += `<div class="kuNext kuNextCol">${nextBtn()}<button type="button" class="kuBtn ghost" data-qagain="1">再练一次</button>`;
    if (allDone) h += `<button type="button" class="kuBtn ghost" data-markread2="1">${isRead(cur.slug) ? '✅ 本课已标为已读' : '🎉 整课学完 · ✓ 标为已读'}</button>`;
    return h + '</div></div>';
  }
  mainEl.addEventListener('click', (e) => {
    if (!cur || cur.step !== 'q' || !quiz) return;
    const P = paraByN(cur.para);
    const q = quiz.qs[quiz.k];
    const o = e.target.closest('[data-opt]');
    if (o && q && !quiz.answered) { const k = Number(o.getAttribute('data-opt')); quiz.choice = k; answer(!!q.opts[k].ok, q); return; }
    const tk = e.target.closest('[data-take]');
    if (tk && q && !quiz.answered) {
      quiz.picked.push(Number(tk.getAttribute('data-take')));
      if (quiz.picked.length === q.s.chunks.length) { const ok = quiz.picked.every((v, k) => q.s.chunks[v].t === q.s.chunks[k].t); answer(ok, q); }
      else renderQuiz(P);
      return;
    }
    const pt = e.target.closest('[data-put]');
    if (pt && q && !quiz.answered) { const ix = Number(pt.getAttribute('data-put')); quiz.picked = quiz.picked.filter((v) => v !== ix); renderQuiz(P); return; }
    if (e.target.closest('[data-qnext]')) {
      quiz.k += 1; quiz.answered = false; quiz.picked = []; quiz.choice = -1;
      if (quiz.k >= quiz.qs.length) finishQuiz(P, false);
      renderQuiz(P); mainEl.scrollTop = 0; return;
    }
    if (e.target.closest('[data-qskip]')) { finishQuiz(P, true); quiz.k = quiz.qs.length; quiz.skipped = true; mainEl.innerHTML = skippedHtml(P); return; }
    if (e.target.closest('[data-qagain]')) { quiz = null; renderQuiz(P); mainEl.scrollTop = 0; return; }
    if (e.target.closest('[data-markread2]')) { if (window.ReadSync && !isRead(cur.slug)) window.ReadSync.setRead(cur.slug, true); toast('✓ 已标为已读'); renderQuiz(P); }
  });

  // ---------- desktop keys ----------
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (e.key === 'Escape') { if (layers.length) { e.preventDefault(); closeTop(); } return; }
    if (layers.length || !cur || !L) return;
    if (cur.step === 'a' && pager) {
      if (e.key === 'ArrowRight') { e.preventDefault(); const P = paraByN(cur.para); if (cur.sent < P.sents.length) pageTo(cur.sent + 1); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); pageTo(cur.sent - 1); return; }
    }
    if (cur.step === 'q' && quiz) {
      const q = quiz.qs[quiz.k];
      if (q && !quiz.answered && q.opts && /^[1-4]$/.test(e.key)) { const b = mainEl.querySelector(`[data-opt="${Number(e.key) - 1}"]`); if (b) { e.preventDefault(); b.click(); } return; }
      if (quiz.answered && (e.key === 'Enter' || e.key === 'ArrowRight')) { const b = mainEl.querySelector('[data-qnext]'); if (b) { e.preventDefault(); b.click(); } }
    }
  });

  // ---------- boot ----------
  // Landing straight on a lesson link: put the home list underneath so Back goes home, not off-site.
  (function boot() {
    const h = parseHash();
    if (h) {
      const target = location.hash;
      try {
        history.replaceState(null, '', location.pathname + location.search);
        history.pushState({ kuLesson: 1 }, '', target);
      } catch (_e) { /* ignore */ }
    }
    route();
  })();
  window.addEventListener('pagehide', save);
})();

/* 🪜 Nivå — 按级别集中学 (see SPEC.md, the design authority).
 *   #                          ladder: 📌 current level + ▶ 下一步, A1 → A2 → B1 → B2+ (progress, ✅), 🧭 定级, 📋 结果
 *   #lv=A2&sec=read&i=<id>     one level: ▶ 下一步, 🏁 通关条件, 7 sections in a fixed order (SPEC §4)
 *   #lv=A2&run=words&g=<key>   过一遍 — flip cards for one group (g=* = everything not seen yet at this level)
 *   #lv=A2&test=1              🏁 自测, 20 questions          #place=A1   🧭 定级 — the same test, level after level
 * Data: niva-data.js (window.NIVA_DATA) + data/<LV>.js (window.NIVA_DETAIL, loaded on demand) — SPEC §10.
 * State: niva.state.v1 (own). Writes ova.state.v1 (不会 + test answers, Öva's rules) and flode.state.v1 `mute` (会);
 * reads kurs.state.v1 and ReadSync. Results reach the KB through 📋 复制结果给 CC → /ova (SPEC §8). */
(function () {
  'use strict';

  const D = window.NIVA_DATA;
  const main = document.getElementById('nvMain');
  const layer = document.getElementById('nvLayer');
  const SP = window.SvSpeak || null;

  // ---------- helpers ----------
  const str = (x) => (x == null ? '' : String(x));
  const esc = (s) => str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const enc = encodeURIComponent;
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const arr = (x) => (Array.isArray(x) ? x : []);
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dateStr(new Date());
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return dateStr(d); };
  const num = (n) => Number(n || 0).toLocaleString('sv-SE');
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (_e) { return false; } };
  const parse = (raw) => { try { return JSON.parse(raw || 'null'); } catch (_e) { return null; } };
  // Another page's store: {} when absent, null when unreadable (then it is left alone).
  function readStore(key) {
    const raw = lsGet(key);
    if (raw == null) return {};
    try { const o = JSON.parse(raw); return isObj(o) ? o : null; } catch (_e) { return null; }
  }
  const fmtDur = (s) => { s = Math.round(Number(s) || 0); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i -= 1) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const zhShort = (z) => { const o = str(z).split(/[；;]/).map((s) => s.trim()).filter(Boolean)[0] || str(z); return o.length > 18 ? o.slice(0, 18) + '…' : o; };
  const glosses = (z) => new Set(str(z).split(/[；;、，,/（）()]/).map((s) => s.replace(/[的地得]$/, '').trim()).filter(Boolean));
  const overlaps = (a, b) => { for (const g of a) if (b.has(g)) return true; return false; };
  const say = (text) => { if (SP && SP.supported) SP.speak(text); else toast('这个浏览器不支持朗读'); };
  const sayBtn = (text) => (SP && SP.supported
    ? `<button type="button" class="nvSay" data-act="say" data-say="${esc(text)}" aria-label="朗读" title="朗读">🔊</button>` : '');

  let toastT = 0;
  function toast(msg) {
    const t = document.getElementById('nvToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2200);
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
  const levelMeta = (id) => LEVELS.find((l) => l.id === id);
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
  const POS_ZH = { substantiv: '名词', verb: '动词', adjektiv: '形容词', adverb: '副词' };

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
  const ALL_WORDS = arr(D.words);
  const wordBySlug = new Map(ALL_WORDS.map((w) => [w.s, w]));
  const phraseBySlug = new Map(arr(D.phrases).map((p) => [p.s, p]));

  // Per-level details (en / IPA / forms / example, cloze sentences) — only needed by 过一遍 and 自测.
  const detailLoads = {};
  function loadDetail(lv) {
    const have = window.NIVA_DETAIL && window.NIVA_DETAIL[lv];
    if (have) return Promise.resolve(have);
    if (detailLoads[lv]) return detailLoads[lv];
    detailLoads[lv] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `data/${lv}.js`;
      s.onload = () => { const d = window.NIVA_DETAIL && window.NIVA_DETAIL[lv]; if (d) resolve(d); else reject(new Error('empty')); };
      s.onerror = () => { delete detailLoads[lv]; s.remove(); reject(new Error('load failed')); };
      document.head.appendChild(s);
    });
    return detailLoads[lv];
  }
  const detailOf = (lv) => (window.NIVA_DETAIL && window.NIVA_DETAIL[lv]) || null;

  // ---------- state ----------
  // niva.state.v1 = { v, focus, grammar{slug:date}, words{slug:[1|0,date]}, phrases{…}, tests{lv:[{at,right,total}]},
  //                   passed{lv:{at,how:'full'|'place'}}, run{lv,sec,g}, last{lv,sec}, lastSec{lv:sec}, only{sec:bool},
  //                   lastCopy, summary{…} for Dagbok }. Unknown keys are kept.
  const LS = 'niva.state.v1';
  function loadState() {
    const o = parse(lsGet(LS));
    const s = isObj(o) ? o : {};
    s.v = 1;
    for (const k of ['grammar', 'only', 'lastSec', 'words', 'phrases', 'tests', 'passed']) if (!isObj(s[k])) s[k] = {};
    if (!isObj(s.last) || !BY[s.last.lv]) s.last = null;
    if (!isObj(s.run) || !BY[s.run.lv] || !['words', 'phrases'].includes(s.run.sec)) s.run = null;
    if (!LEVEL_IDS.includes(s.focus)) s.focus = '';
    return s;
  }
  let st = loadState();
  // Re-read before every write so another tab's changes survive.
  function mutate(fn) {
    st = loadState();
    fn(st);
    lsSet(LS, JSON.stringify(st));
  }

  // Other pages' progress, read fresh on every render.
  function others() {
    const ova = readStore('ova.state.v1') || {};
    const fl = readStore('flode.state.v1') || {};
    const ku = readStore('kurs.state.v1') || {};
    return {
      boxes: isObj(ova.cards) ? ova.cards : {},
      mute: isObj(fl.mute) ? fl.mute : {},
      lessons: isObj(ku.lessons) ? ku.lessons : {},
    };
  }
  const isRead = (id) => { try { return !!(window.ReadSync && window.ReadSync.isRead(id)); } catch (_e) { return false; } };

  // ---------- writing into Öva / Flöde (their own rules) ----------
  const INTERVALS = [0, 1, 2, 4, 7, 14, 30];
  // Returns the card as it was before (null = there was none), for 撤销.
  function ovaUpdate(slug, fn) {
    const s = readStore('ova.state.v1');
    if (!s) return undefined;
    if (!isObj(s.cards)) s.cards = {};
    const before = isObj(s.cards[slug]) ? Object.assign({}, s.cards[slug]) : null;
    const t = today();
    const c = before ? Object.assign({}, before) : { b: 0, d: t, r: 0, w: 0, t };
    fn(c, t);
    s.cards[slug] = c;
    lsSet('ova.state.v1', JSON.stringify(s));
    return before;
  }
  function ovaRestore(slug, before) {
    if (before === undefined) return;
    const s = readStore('ova.state.v1');
    if (!s) return;
    if (!isObj(s.cards)) s.cards = {};
    if (before) s.cards[slug] = before; else delete s.cards[slug];
    lsSet('ova.state.v1', JSON.stringify(s));
  }
  // A test answer: right → next box, wrong → box 0 (same as Öva / Kurs / Flöde).
  const ovaAnswer = (slug, ok) => ovaUpdate(slug, (c, t) => {
    c.b = Number(c.b) || 0; c.r = Number(c.r) || 0; c.w = Number(c.w) || 0;
    if (ok) { c.b = Math.min(c.b + 1, INTERVALS.length - 1); c.r += 1; } else { c.b = 0; c.w += 1; }
    c.d = addDays(INTERVALS[c.b]);
    c.t = t;
  });
  // 🤔 不会 in 过一遍: due today in box 0, without counting it as a wrong answer.
  const ovaDue = (slug) => ovaUpdate(slug, (c, t) => { c.b = 0; c.d = t; c.t = t; });
  // 😎 会 also mutes the word in Flöde (no more word cards for it). Returns the old value for 撤销.
  function flodeMute(slug, on) {
    const s = readStore('flode.state.v1');
    if (!s) return undefined;
    if (!isObj(s.mute)) s.mute = {};
    const before = !!s.mute[slug];
    if (on) s.mute[slug] = 1; else delete s.mute[slug];
    if (!s.v) s.v = 1;
    lsSet('flode.state.v1', JSON.stringify(s));
    return before;
  }

  // ---------- status & progress (SPEC §5.1) ----------
  const markOf = (sec, slug) => { const m = (sec === 'phrases' ? st.phrases : st.words)[slug]; return Array.isArray(m) ? Number(m[0]) : undefined; };
  // 2 = 会 · 1 = 复习中 / 不会 · 0 = 还没看过
  function wordStatus(w, X) {
    if (w.k) return 2;
    const m = markOf('words', w.s);
    if (m === 1 || X.mute[w.s]) return 2;
    const c = X.boxes[w.s];
    if (isObj(c) && Number(c.b) >= 4) return 2;
    if (m === 0 || isObj(c)) return 1;
    return 0;
  }
  function phraseStatus(p, X) {
    if (p.k || X.mute[p.s]) return 2;
    const m = markOf('phrases', p.s);
    return m === 1 ? 2 : m === 0 ? 1 : 0;
  }
  const statusOf = (sec, it, X) => (sec === 'phrases' ? phraseStatus(it, X) : wordStatus(it, X));
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

  // ---------- 通关 (SPEC §5.2) ----------
  function bestTest(lv) {
    let best = null;
    for (const t of arr(st.tests[lv])) {
      if (!isObj(t) || !t.total) continue;
      if (!best || t.right / t.total > best.right / best.total) best = t;
    }
    return best;
  }
  function passCheck(lv, X, p) {
    const items = [];
    const w = p.sec.words;
    if (w.n) items.push({ ok: w.done >= Math.ceil(w.n * 0.8), label: '🔤 单词「会」', have: `${num(w.done)} / ${num(w.n)}（${pct(w.done, w.n)}%）`, need: '需 80%' });
    const gram = BY[lv].grammar.filter((g) => !g.br);
    if (gram.length) {
      const core = gram.filter((g) => g.tier === 1);
      const coreDone = core.filter((g) => st.grammar[g.s]).length;
      const allDone = gram.filter((g) => st.grammar[g.s]).length;
      items.push({ ok: coreDone === core.length && allDone >= Math.ceil(gram.length * 0.7), label: '📗 语法学过',
        have: `核心 ${coreDone}/${core.length} · 全部 ${allDone}/${gram.length}（${pct(allDone, gram.length)}%）`, need: '核心全部 + 全部 70%' });
    }
    const texts = [...BY[lv].read, ...BY[lv].tala].filter((t) => !t.br);
    if (texts.length) {
      const read = texts.filter((t) => isRead(t.s)).length;
      const need = texts.length >= 10 ? Math.ceil(texts.length * 0.5) : texts.length;
      items.push({ ok: read >= need, label: '📖 阅读 + 情景', have: `已读 ${read} / ${texts.length}`, need: texts.length >= 10 ? `需 ${need}（一半）` : '需全部' });
    }
    const t = bestTest(lv);
    items.push({ ok: !!t && t.right / t.total >= 0.8, label: '🏁 自测', have: t ? `最好 ${t.right}/${t.total}（${pct(t.right, t.total)}%）` : '还没测过', need: '需 80%' });
    return { items, all: items.every((x) => x.ok), done: items.filter((x) => x.ok).length };
  }
  const passedOf = (lv) => (isObj(st.passed[lv]) ? st.passed[lv] : null);
  function passedChip(lv) {
    const ps = passedOf(lv);
    if (!ps) return '';
    return `<span class="nvPassed" title="${esc(ps.at || '')}">${ps.how === 'place' ? '✅ 定级通过' : '✅ 已通关'}</span>`;
  }
  // Mark the level passed once every condition holds (only on his own navigation — never on passive re-renders).
  function settlePass(lv, X, p) {
    const pc = passCheck(lv, X, p || progress(lv, X));
    const ps = passedOf(lv);
    if (pc.all && !(ps && ps.how === 'full')) {
      mutate((s) => { s.passed[lv] = { at: today(), how: 'full' }; });
      return true;
    }
    return false;
  }

  // ---------- groups (list order = 过一遍 order) ----------
  const groupCache = {};
  function wordGroups(lv) {
    const key = `w:${lv}`;
    if (groupCache[key]) return groupCache[key];
    const groups = new Map();
    for (const w of BY[lv].words) {
      const k = w.tp && topicZh[w.tp] ? w.tp : `pos:${POS_ZH[w.p] ? w.p : 'other'}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(w);
    }
    const titleOf = (k) => (k.startsWith('pos:') ? `${POS_ZH[k.slice(4)] || '其他词'}（未分主题）` : topicZh[k]);
    const order = (a, b) => (a.fq ? 0 : 1) - (b.fq ? 0 : 1) || a.fq - b.fq || a.l.localeCompare(b.l, 'sv');
    const keys = [...groups.keys()].sort((a, b) => (a.startsWith('pos:') ? 1 : 0) - (b.startsWith('pos:') ? 1 : 0) ||
      groups.get(b).length - groups.get(a).length || str(titleOf(a)).localeCompare(str(titleOf(b)), 'zh'));
    return (groupCache[key] = keys.map((k) => ({ key: k, title: titleOf(k), items: groups.get(k).slice().sort(order) })));
  }
  const PHRASE_GROUPS = [
    ['fras', '💬 日常与情景用语'], ['partikel', '🔗 小品词动词 partikelverb'], ['verb', '🧲 动词搭配'],
    ['prep', '📍 介词短语'], ['tid', '🕒 时间表达'], ['fast', '📌 固定表达'], ['diskurs', '🧵 连接与论述'],
    ['idiom', '🎭 习语'], ['ovrigt', '其他'],
  ];
  function phraseGroups(lv) {
    const key = `p:${lv}`;
    if (groupCache[key]) return groupCache[key];
    const out = [];
    for (const [k, title] of PHRASE_GROUPS) {
      const items = BY[lv].phrases.filter((p) => p.cat === k && !p.br).sort((a, b) => a.sv.localeCompare(b.sv, 'sv'));
      if (items.length) out.push({ key: k, title, items });
    }
    const br = BY[lv].phrases.filter((p) => p.br).sort((a, b) => a.sv.localeCompare(b.sv, 'sv'));
    if (br.length) out.push({ key: 'br', title: `🌉 过渡 → ${lvLabel(nextLevel(lv))}`, items: br });
    return (groupCache[key] = out);
  }
  const groupsOf = (lv, sec) => (sec === 'phrases' ? phraseGroups(lv) : wordGroups(lv));
  function groupTitle(lv, sec, g) {
    if (g === '*') return `${lvLabel(lv)} 全部${sec === 'phrases' ? '词组' : '单词'}`;
    const gr = groupsOf(lv, sec).find((x) => x.key === g);
    return gr ? gr.title : '';
  }
  // 过一遍 queue: words never marked and not known; once a group has none left, the ones still marked 不会.
  function runQueue(lv, sec, g, X) {
    const groups = g === '*' ? groupsOf(lv, sec) : groupsOf(lv, sec).filter((x) => x.key === g);
    const items = [].concat(...groups.map((x) => x.items));
    const fresh = items.filter((it) => markOf(sec, it.s) === undefined && statusOf(sec, it, X) !== 2);
    if (fresh.length) return { queue: fresh, again: false, total: items.length };
    return { queue: items.filter((it) => statusOf(sec, it, X) === 1), again: true, total: items.length };
  }

  // ---------- ▶ 下一步 (SPEC §6) ----------
  // The unfinished run first; then whichever 通关 condition lags furthest behind (grammar / words / texts);
  // then listening, lessons and phrases; finally the self-test.
  function nextStep(lv, X) {
    if (st.run && st.run.lv === lv) {
      const q = runQueue(lv, st.run.sec, st.run.g, X);
      if (q.queue.length && !q.again) {
        return { icon: SEC[st.run.sec].icon, t: `继续过一遍：${groupTitle(lv, st.run.sec, st.run.g)}`, sub: `还剩 ${q.queue.length} 个`, act: { k: 'run', sec: st.run.sec, g: st.run.g } };
      }
    }
    const p = progress(lv, X);
    const cands = [];
    const gram = BY[lv].grammar.filter((g) => !g.br);
    if (gram.length) {
      const core = gram.filter((g) => g.tier === 1);
      const coreTodo = core.find((g) => !st.grammar[g.s]);
      const allDone = gram.filter((g) => st.grammar[g.s]).length;
      const todo = coreTodo || (allDone < Math.ceil(gram.length * 0.7) ? gram.find((g) => !st.grammar[g.s]) : null);
      if (todo) {
        const ratio = coreTodo ? core.filter((g) => st.grammar[g.s]).length / core.length : allDone / Math.ceil(gram.length * 0.7);
        cands.push({ ratio, s: { icon: '📗', t: `学语法：${todo.n}`, sub: `${todo.zh}${coreTodo ? ' · 核心' : ''}`, act: { k: 'sec', sec: 'grammar', i: todo.s } } });
      }
    }
    const w = p.sec.words;
    if (w.n && w.done < Math.ceil(w.n * 0.8)) {
      const gr = wordGroups(lv).find((x) => x.items.some((it) => markOf('words', it.s) === undefined && wordStatus(it, X) !== 2));
      if (gr) {
        const left = gr.items.filter((it) => markOf('words', it.s) === undefined && wordStatus(it, X) !== 2).length;
        cands.push({ ratio: w.done / (w.n * 0.8), s: { icon: '🔤', t: `过一遍：${gr.title}`, sub: `${left} 个词还没看过 · 单词「会」${pct(w.done, w.n)}%`, act: { k: 'run', sec: 'words', g: gr.key } } });
      }
    }
    const texts = [...BY[lv].read, ...BY[lv].tala].filter((t) => !t.br);
    if (texts.length) {
      const readN = texts.filter((t) => isRead(t.s)).length;
      const need = texts.length >= 10 ? Math.ceil(texts.length * 0.5) : texts.length;
      if (readN < need) {
        const r = BY[lv].read.filter((t) => !t.br && isRead(t.s)).length;
        const tl = BY[lv].tala.filter((t) => !t.br && isRead(t.s)).length;
        for (const sec of r <= tl ? ['read', 'tala'] : ['tala', 'read']) {
          const t = BY[lv][sec].find((x) => !x.br && !isRead(x.s));
          if (!t) continue;
          cands.push({ ratio: readN / need, s: { icon: SEC[sec].icon, t: `${SEC[sec].name}：${t.t}`, sub: [t.tag, t.d ? `难度 ${t.d}/5` : ''].filter(Boolean).join(' · '), act: { k: 'href', href: hrefOf(lv, sec, t) } } });
          break;
        }
      }
    }
    if (cands.length) {
      cands.sort((a, b) => a.ratio - b.ratio);
      return cands[0].s;
    }
    const t = bestTest(lv);
    if (!t || t.right / t.total < 0.8) return { icon: '🏁', t: `${lvLabel(lv)} 自测`, sub: `20 题 · 约 4 分钟${t ? ` · 最好 ${t.right}/${t.total}` : ''}`, act: { k: 'test' } };
    const e = BY[lv].listen.find((x) => !isRead('lyssna:' + x.id));
    if (e) return { icon: '🎧', t: `听力：${e.t}`, sub: e.src || '', act: { k: 'href', href: hrefOf(lv, 'listen', e) } };
    const k = BY[lv].kurs.find((x) => !isDone('kurs', x, X));
    if (k) return { icon: '📘', t: `课文：${k.t}`, sub: `${k.paras} 段`, act: { k: 'href', href: hrefOf(lv, 'kurs', k) } };
    const pg = phraseGroups(lv).find((x) => x.items.some((it) => markOf('phrases', it.s) === undefined && phraseStatus(it, X) !== 2));
    if (pg) return { icon: '🧩', t: `过一遍：${pg.title}`, sub: '词组', act: { k: 'run', sec: 'phrases', g: pg.key } };
    const nx = nextLevel(lv);
    return nx ? { icon: '🎉', t: `${lvLabel(lv)} 学完了`, sub: `进入 ${lvLabel(nx)} →`, act: { k: 'level', lv: nx } } : null;
  }
  function nextHtml(lv, nx) {
    return `<button type="button" class="nvNext" data-act="next" data-lv="${lv}">` +
      `<span class="nvNextI" aria-hidden="true">${nx.icon}</span>` +
      `<span class="nvNextTxt"><span class="nvNextK">▶ 下一步</span><span class="nvNextT">${esc(nx.t)}</span>` +
      (nx.sub ? `<span class="nvNextS">${esc(nx.sub)}</span>` : '') + '</span><span class="nvNextGo" aria-hidden="true">→</span></button>';
  }
  function doStep(lv, nx) {
    if (!nx || !nx.act) return;
    const a = nx.act;
    if (a.k === 'run') openLayer(runHash(lv, a.sec, a.g));
    else if (a.k === 'test') openLayer(`#lv=${lv}&test=1`);
    else if (a.k === 'href') location.href = a.href;
    else if (a.k === 'level') goLevel(a.lv, '');
    else if (a.k === 'sec') {
      try { history.replaceState(history.state, '', hashFor(lv, a.sec, a.i)); } catch (_e) { /* ignore */ }
      if (view && view.lv === lv) renderLevel(lv, a.sec, a.i, { tab: true });
      else goLevel(lv, a.sec, a.i);
    }
  }
  // Dagbok's one-line card reads this (it never loads niva-data.js).
  function stepHref(lv, nx) {
    const a = nx && nx.act;
    if (!a) return `niva/${hashFor(lv)}`;
    if (a.k === 'run') return `niva/${runHash(lv, a.sec, a.g)}`;
    if (a.k === 'test') return `niva/#lv=${lv}&test=1`;
    if (a.k === 'sec') return `niva/${hashFor(lv, a.sec, a.i)}`;
    if (a.k === 'level') return `niva/${hashFor(a.lv)}`;
    return a.href.replace(/^\.\.\//, '');
  }
  function writeSummary(X) {
    const lv = st.focus || (st.last && st.last.lv) || '';
    if (!lv) return;
    const nx = nextStep(lv, X);
    const s = { lv, focus: st.focus === lv ? 1 : 0, pct: progress(lv, X).pct, passed: passedOf(lv) ? 1 : 0,
      next: nx ? { t: `${nx.icon} ${nx.t}`, href: stepHref(lv, nx) } : null, at: today() };
    if (JSON.stringify(st.summary) !== JSON.stringify(s)) mutate((x) => { x.summary = s; });
  }

  function ring(p, cls) {
    const r = 18; const c = 2 * Math.PI * r; const f = Math.max(0, Math.min(100, p)) / 100;
    return `<svg class="nvRing ${cls || ''}" viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="${r}" class="nvRingBg"/>` +
      (f > 0 ? `<circle cx="23" cy="23" r="${r}" class="nvRingFg" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 23 23)"/>` : '') +
      `<text x="23" y="27" text-anchor="middle">${p}%</text></svg>`;
  }

  // ---------- routing ----------
  // Pages that link back here pass the whole hash as one encoded value (…/niva/#lv%3DA2%26sec%3Dread).
  function readHash() {
    let raw = (location.hash || '').replace(/^#/, '');
    try { raw = decodeURIComponent(raw); } catch (_e) { /* keep as is */ }
    const h = new URLSearchParams(raw);
    const lv = LEVEL_IDS.includes(h.get('lv')) ? h.get('lv') : '';
    return {
      lv,
      sec: SEC_IDS.includes(h.get('sec')) ? h.get('sec') : '',
      item: h.get('i') || '',
      run: lv && ['words', 'phrases'].includes(h.get('run')) ? h.get('run') : '',
      g: h.get('g') || '*',
      test: lv && h.get('test') === '1',
      place: LEVEL_IDS.includes(h.get('place')) ? h.get('place') : '',
    };
  }
  const hashFor = (lv, sec, item) => `#lv=${lv}${sec ? `&sec=${sec}` : ''}${item ? `&i=${enc(item)}` : ''}`;
  const runHash = (lv, sec, g) => `#lv=${lv}&run=${sec}&g=${enc(g || '*')}`;
  let view = null;   // { lv, sec } on screen under any layer
  let layerKey = '';
  let routed = '';

  function route(opts) {
    opts = opts || {};
    const h = readHash();
    const key = h.place ? `place:${h.place}` : h.test ? `test:${h.lv}` : h.run ? `run:${h.lv}:${h.run}:${h.g}` : '';
    if (h.lv) renderLevel(h.lv, h.sec || (view && view.lv === h.lv ? view.sec : ''), key ? '' : h.item, opts);
    else renderLadder(opts);
    if (!key) hideLayer();
    else if (key !== layerKey) {
      layerKey = key;
      if (h.place) startTest(h.place, true);
      else if (h.test) startTest(h.lv, false);
      else startRun(h.lv, h.run, h.g);
    }
    routed = location.hash;
  }
  function goLevel(lv, sec, item) {
    try { history.pushState({ nv: 1 }, '', hashFor(lv, sec, item)); } catch (_e) { location.hash = hashFor(lv, sec, item); return; }
    route({ top: !item });
  }
  function goLadder() {
    if (history.state && history.state.nv && !history.state.layer) { history.back(); return; }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (_e) { /* ignore */ }
    route({ top: true });
  }
  window.addEventListener('popstate', () => route({ top: true }));
  window.addEventListener('hashchange', () => { if (location.hash !== routed) route({ top: true }); });

  // ---------- layer (过一遍 / 自测 / 定级) ----------
  function openLayer(hash) {
    try { history.pushState({ nv: 1, layer: 1 }, '', hash); } catch (_e) { location.hash = hash; return; }
    route({});
  }
  function closeLayer() {
    if (history.state && history.state.layer) { history.back(); return; }
    const h = readHash();
    try { history.replaceState(null, '', h.lv ? hashFor(h.lv, view && view.lv === h.lv ? view.sec : '') : location.pathname + location.search); } catch (_e) { /* ignore */ }
    route({});
  }
  function showLayer(html) {
    layer.innerHTML = html;
    if (layer.hidden) {
      layer.hidden = false;
      document.body.classList.add('nvLayerOpen');
    }
    const f = layer.querySelector('[data-autofocus]');
    if (f) { try { f.focus({ preventScroll: true }); } catch (_e) { f.focus(); } }
  }
  function hideLayer() {
    if (!layer.hidden) {
      layer.hidden = true;
      layer.innerHTML = '';
      document.body.classList.remove('nvLayerOpen');
    }
    layerKey = '';
    R = null;
    if (T && T.timer) clearTimeout(T.timer);
    T = null;
    if (SP && SP.cancel) SP.cancel();
  }
  const layerTop = (title, count) => '<header class="nvLyTop">' +
    '<button type="button" class="nvIcon" data-act="close" aria-label="关闭" title="关闭">✕</button>' +
    `<h2 class="nvLyTitle">${title}</h2><span class="nvLyCount">${count || ''}</span></header>`;
  const layerBar = (p) => `<div class="nvLyBar" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, p))}%"></span></div>`;

  // ---------- 过一遍 (flip cards) ----------
  let R = null;   // { lv, sec, g, queue, i, yes, no, again, undo: [], flipped }
  function startRun(lv, sec, g) {
    const X = others();
    const q = runQueue(lv, sec, g, X);
    R = { lv, sec, g, queue: q.queue, again: q.again, total: q.total, i: 0, yes: 0, no: 0, undo: [], flipped: false };
    if (q.queue.length) mutate((s) => { s.run = { lv, sec, g }; });
    renderRun();
    loadDetail(lv).then(() => { if (R && R.lv === lv && !R.flipped) renderRun(); }).catch(() => { /* cards work without details */ });
  }
  function renderRun() {
    if (!R) return;
    const S = SEC[R.sec];
    const title = `${S.icon} ${lvLabel(R.lv)} · ${esc(groupTitle(R.lv, R.sec, R.g))}`;
    if (R.i >= R.queue.length) return renderRunDone(title);
    const it = R.queue[R.i];
    const det = detailOf(R.lv);
    const d = det ? (R.sec === 'phrases' ? det.phrases[it.s] : det.words[it.s]) || {} : {};
    const sv = R.sec === 'phrases' ? it.sv : it.l;
    const meta = R.sec === 'phrases'
      ? '词组'
      : [d.ipa ? `<span class="nvIpa">${esc(d.ipa)}</span>` : '', it.g ? `<b>${esc(it.g)}</b>` : '', esc(POS_ZH[it.p] || it.p || '')].filter(Boolean).join(' · ');
    let back = '';
    if (R.flipped) {
      back = `<div class="nvFlipZh">${esc(it.zh)}</div>` +
        (d.en ? `<div class="nvFlipEn">${esc(d.en)}</div>` : '') +
        (d.f && d.f.length ? `<div class="nvFlipForms" lang="sv">${d.f.map(esc).join(' · ')}</div>` : '') +
        (d.ex ? `<div class="nvFlipEx"><span lang="sv">${esc(d.ex[0])}</span>${sayBtn(d.ex[0])}<span class="nvFlipExZh">${esc(d.ex[1])}</span></div>` : '');
    }
    showLayer(layerTop(title, `${R.i + 1} / ${R.queue.length}`) + layerBar(pct(R.i, R.queue.length)) +
      '<div class="nvLyBody">' +
      (R.again && R.i === 0 ? '<p class="nvLyNote">这一组都看过了 —— 这次只过一遍还标着「不会」的。</p>' : '') +
      `<div class="nvFlip${R.flipped ? ' back' : ''}" data-act="flip" role="button" tabindex="0" data-autofocus aria-label="${R.flipped ? '卡片背面' : '点一下翻面'}">` +
      `<div class="nvFlipFront"><span class="nvFlipSv" lang="sv">${esc(sv)}</span>${sayBtn(sv)}</div>` +
      `<div class="nvFlipMeta">${meta}</div>` +
      (R.flipped ? `<div class="nvFlipBack">${back}</div>` : '<div class="nvFlipHint">先在心里说出意思，再点卡片翻面</div>') +
      '</div>' +
      '<div class="nvLyBtns">' +
      `<button type="button" class="nvBtn no" data-act="no"${R.flipped ? '' : ' disabled'}>🤔 不会</button>` +
      `<button type="button" class="nvBtn yes" data-act="yes"${R.flipped ? '' : ' disabled'}>😎 会</button>` +
      '</div>' +
      '<div class="nvLyFoot">' +
      `<button type="button" class="nvLink" data-act="undo"${R.undo.length ? '' : ' disabled'}>↩ 撤销</button>` +
      `<a class="nvLink" href="../sok/#note=${enc(it.s)}" target="_blank" rel="noopener">完整笔记 ↗</a>` +
      '</div><p class="nvLyKeys">键盘：空格 翻面 · ← 不会 · → 会 · Backspace 撤销</p></div>');
  }
  function runMark(yes) {
    if (!R || !R.flipped || R.i >= R.queue.length) return;
    const it = R.queue[R.i];
    const sec = R.sec;
    const prevMark = (sec === 'phrases' ? st.phrases : st.words)[it.s];
    const u = { s: it.s, prevMark: Array.isArray(prevMark) ? prevMark.slice() : undefined, yes };
    mutate((s) => { (sec === 'phrases' ? s.phrases : s.words)[it.s] = [yes ? 1 : 0, today()]; });
    if (yes) u.mute = flodeMute(it.s, true);
    else if (sec === 'words') u.ova = ovaDue(it.s);
    R.undo.push(u);
    if (yes) R.yes += 1; else R.no += 1;
    R.i += 1;
    R.flipped = false;
    renderRun();
  }
  function runUndo() {
    if (!R || !R.undo.length) return;
    const u = R.undo.pop();
    const sec = R.sec;
    mutate((s) => {
      const m = sec === 'phrases' ? s.phrases : s.words;
      if (u.prevMark) m[u.s] = u.prevMark; else delete m[u.s];
    });
    if (u.yes && u.mute !== undefined) flodeMute(u.s, u.mute);
    if (!u.yes && u.ova !== undefined) ovaRestore(u.s, u.ova);
    if (u.yes) R.yes -= 1; else R.no -= 1;
    R.i = Math.max(0, R.i - 1);
    R.flipped = true;
    renderRun();
  }
  function renderRunDone(title) {
    const X = others();
    if (st.run && st.run.lv === R.lv && st.run.sec === R.sec && st.run.g === R.g) mutate((s) => { s.run = null; });
    const unit = R.sec === 'phrases' ? '词组' : '词';
    const nextGr = R.g === '*' ? null : groupsOf(R.lv, R.sec).find((x) => x.key !== R.g &&
      x.items.some((it) => markOf(R.sec, it.s) === undefined && statusOf(R.sec, it, X) !== 2));
    const nextLeft = nextGr ? nextGr.items.filter((it) => markOf(R.sec, it.s) === undefined && statusOf(R.sec, it, X) !== 2).length : 0;
    const head = R.queue.length
      ? `<p class="nvDoneBig">✓ 这一组过完了</p><p class="nvDoneLine">😎 会 <b>${R.yes}</b> · 🤔 不会 <b>${R.no}</b></p>` +
        (R.no && R.sec === 'words' ? '<p class="nvSmall">「不会」的词已放进 🔁 Öva 的复习队列（今天到期），Flöde 也会再出它们。</p>' : '') +
        (R.yes ? '<p class="nvSmall">「会」的词：在这里马上算「会」，Flöde 不再出它们的词卡；点下面的 📋 复制结果给 CC，跑 /ova 写回知识库（known: true）。</p>' : '')
      : `<p class="nvDoneBig">这一组没有要过的${unit}了 ✓</p>`;
    showLayer(layerTop(title, '') + layerBar(100) + '<div class="nvLyBody nvDone">' + head +
      '<div class="nvDoneBtns">' +
      (nextGr ? `<button type="button" class="nvBtn" data-act="rungo" data-g="${esc(nextGr.key)}" data-autofocus>▶ 下一组：${esc(nextGr.title)}（${nextLeft}）</button>` : '') +
      (R.no && R.sec === 'words' ? `<a class="nvBtn ghost" href="../ova/#deck=all&level=${R.lv}">🔁 去 Öva 复习「不会」的词</a>` : '') +
      `<button type="button" class="nvBtn ghost" data-act="copy">📋 复制结果给 CC</button>` +
      `<button type="button" class="nvBtn ghost" data-act="close"${nextGr ? '' : ' data-autofocus'}>返回列表</button>` +
      '</div></div>');
  }

  // ---------- 🏁 自测 / 🧭 定级 (SPEC §5.3) ----------
  let T = null;   // { lv, place, qs, i, right, wrong, answered, timer, saved }
  const CONTENT = new Set(['substantiv', 'verb', 'adjektiv', 'adverb']);
  // Three wrong options: same word class, same level first, same topic preferred, no shared Chinese gloss.
  function distractors(w, n, field) {
    const gw = glosses(w.zh);
    const seen = new Set([field === 'zh' ? zhShort(w.zh) : w.l.toLowerCase()]);
    const out = [];
    for (const pool of [BY[w.lv] ? BY[w.lv].words : [], ALL_WORDS]) {
      const cands = shuffle(pool.filter((x) => x.s !== w.s && x.p === w.p && x.zh));
      cands.sort((a, b) => (b.tp && b.tp === w.tp ? 1 : 0) - (a.tp && a.tp === w.tp ? 1 : 0));
      for (const x of cands) {
        if (out.length >= n) break;
        const t = field === 'zh' ? zhShort(x.zh) : x.l.toLowerCase();
        if (seen.has(t) || overlaps(gw, glosses(x.zh))) continue;
        seen.add(t);
        out.push(x);
      }
      if (out.length >= n) break;
    }
    return out;
  }
  const mkSv2Zh = (w) => ({ type: 'sv2zh', w, options: shuffle([{ t: zhShort(w.zh), ok: 1 }, ...distractors(w, 3, 'zh').map((x) => ({ t: zhShort(x.zh) }))]) });
  const mkZh2Sv = (w) => ({ type: 'zh2sv', w, options: shuffle([{ t: w.l, ok: 1, sv: 1 }, ...distractors(w, 3, 'l').map((x) => ({ t: x.l, sv: 1 }))]) });
  const mkEnEtt = (w) => ({ type: 'enett', w, options: [{ t: 'en', ok: w.g === 'en' ? 1 : 0, sv: 1 }, { t: 'ett', ok: w.g === 'ett' ? 1 : 0, sv: 1 }] });
  function mkCloze(w, c) {
    const ds = distractors(w, 3, 'l');
    if (ds.length < 2) return null;
    return { type: 'cloze', w, c, options: shuffle([{ t: w.l, ok: 1, sv: 1 }, ...ds.map((x) => ({ t: x.l, sv: 1 }))]) };
  }
  // 8 看瑞典语选中文 (half from words not marked yet) · 4 看中文选瑞典语 · 3 en/ett · 5 句子填空; topped up to 20.
  function buildTest(lv, det) {
    const X = others();
    const words = BY[lv].words.filter((w) => w.zh && CONTENT.has(w.p));
    const pool = words.length >= 12 ? words : BY[lv].words.filter((w) => w.zh);
    const used = new Set();
    const take = (list, n) => {
      const out = [];
      for (const w of shuffle(list)) {
        if (out.length >= n) break;
        if (used.has(w.s)) continue;
        used.add(w.s);
        out.push(w);
      }
      return out;
    };
    const qs = [];
    const fresh = take(pool.filter((w) => wordStatus(w, X) !== 2), 4);
    for (const w of [...fresh, ...take(pool, 8 - fresh.length)]) qs.push(mkSv2Zh(w));
    for (const w of take(pool, 4)) qs.push(mkZh2Sv(w));
    for (const w of take(BY[lv].words.filter((w) => w.g === 'en' || w.g === 'ett'), 3)) qs.push(mkEnEtt(w));
    let cloze = 0;
    for (const c of shuffle(det && Array.isArray(det.cloze) ? det.cloze : [])) {
      if (cloze >= 5) break;
      const w = wordBySlug.get(c.w);
      if (!w || used.has(w.s)) continue;
      const q = mkCloze(w, c);
      if (!q) continue;
      used.add(w.s);
      qs.push(q);
      cloze += 1;
    }
    while (qs.length < 20) {
      const [w] = take(pool, 1);
      if (!w) break;
      qs.push(mkSv2Zh(w));
    }
    return shuffle(qs.filter((q) => q.options.length >= 2 && q.options.some((o) => o.ok)));
  }
  const QTYPE = { sv2zh: '看瑞典语，选中文意思', zh2sv: '看中文，选瑞典语', enett: 'en 还是 ett？', cloze: '句子填空 —— 选空里的词（给的是原形）' };
  function startTest(lv, place) {
    const key = place ? `place:${lv}` : `test:${lv}`;
    showLayer(layerTop(place ? `🧭 定级 · ${lvLabel(lv)}` : `🏁 ${lvLabel(lv)} 自测`, '') + '<div class="nvLyBody"><p class="nvEmpty">正在出题…</p></div>');
    loadDetail(lv).catch(() => null).then((det) => {
      if (layerKey !== key) return;
      T = { lv, place, qs: buildTest(lv, det), i: 0, right: 0, wrong: [], answered: false, timer: 0, saved: false };
      if (!T.qs.length) {
        showLayer(layerTop(`🏁 ${lvLabel(lv)}`, '') + '<div class="nvLyBody"><p class="nvEmpty">这一级的词太少，出不了题。</p></div>');
        return;
      }
      renderTest();
    });
  }
  function answerText(q) {
    const o = q.options.find((x) => x.ok);
    return o ? o.t : '';
  }
  function renderTest() {
    if (!T) return;
    if (T.i >= T.qs.length) return renderTestDone();
    const q = T.qs[T.i];
    const w = q.w;
    let prompt;
    if (q.type === 'sv2zh') prompt = `<div class="nvQSv"><span lang="sv">${esc(w.l)}</span>${sayBtn(w.l)}</div><div class="nvQMeta">${esc([w.g, POS_ZH[w.p]].filter(Boolean).join(' · '))}</div>`;
    else if (q.type === 'zh2sv') prompt = `<div class="nvQZh">${esc(w.zh)}</div><div class="nvQMeta">${esc(POS_ZH[w.p] || '')}</div>`;
    else if (q.type === 'enett') prompt = `<div class="nvQSv"><span class="nvBlank">${T.answered ? esc(w.g) : '___'}</span> <span lang="sv">${esc(w.l)}</span></div><div class="nvQMeta">${esc(zhShort(w.zh))}</div>`;
    else {
      const c = q.c;
      prompt = `<div class="nvQSent" lang="sv">${esc(c.sv.slice(0, c.at))}<span class="nvBlank">${T.answered ? esc(c.sv.substr(c.at, c.len)) : '_____'}</span>${esc(c.sv.slice(c.at + c.len))}</div>` +
        `<div class="nvQMeta">${esc(c.zh)}</div>`;
    }
    const opts = q.options.map((o, i) => {
      let cls = 'nvOpt';
      if (T.answered) { if (o.ok) cls += ' right'; else if (i === q.picked) cls += ' wrong'; }
      return `<button type="button" class="${cls}" data-act="opt" data-i="${i}"${T.answered ? ' disabled' : ''}>` +
        `<span class="nvOptK">${i + 1}</span><span${o.sv ? ' lang="sv" class="sv"' : ''}>${esc(o.t)}</span></button>`;
    }).join('');
    const fb = T.answered
      ? `<div class="nvFb ${q.ok ? 'ok' : 'bad'}">${q.ok ? '✓ 对了' : `✗ 正确答案：<b${q.type === 'sv2zh' ? '' : ' lang="sv"'}>${esc(answerText(q))}</b>`}` +
        `<button type="button" class="nvBtn" data-act="qnext"${q.ok ? '' : ' data-autofocus'}>${T.i + 1 < T.qs.length ? '下一题 →' : '看结果 →'}</button></div>`
      : '';
    showLayer(layerTop(T.place ? `🧭 定级 · ${lvLabel(T.lv)}` : `🏁 ${lvLabel(T.lv)} 自测`, `${T.i + 1} / ${T.qs.length}`) + layerBar(pct(T.i, T.qs.length)) +
      `<div class="nvLyBody"><p class="nvQType">${QTYPE[q.type]}</p>${prompt}<div class="nvOpts${q.options.length === 2 ? ' two' : ''}">${opts}</div>${fb}</div>`);
  }
  function testAnswer(i) {
    if (!T || T.answered) return;
    const q = T.qs[T.i];
    if (!q || !q.options[i]) return;
    T.answered = true;
    q.picked = i;
    q.ok = !!q.options[i].ok;
    if (q.ok) T.right += 1; else T.wrong.push(q);
    ovaAnswer(q.w.s, q.ok);
    renderTest();
    if (q.ok) T.timer = setTimeout(testNext, 700);
  }
  function testNext() {
    if (!T) return;
    clearTimeout(T.timer);
    T.i += 1;
    T.answered = false;
    renderTest();
  }
  function renderTestDone() {
    const total = T.qs.length;
    const right = T.right;
    const p = pct(right, total);
    const lv = T.lv;
    const nx = nextLevel(lv);
    let passedNow = false;
    if (!T.saved) {
      T.saved = true;
      mutate((s) => { s.tests[lv] = arr(s.tests[lv]).concat([{ at: today(), right, total }]).slice(-10); });
      if (T.place) {
        if (p >= 90) mutate((s) => { if (!isObj(s.passed[lv])) s.passed[lv] = { at: today(), how: 'place' }; });
        else mutate((s) => { s.focus = lv; });
      } else {
        passedNow = settlePass(lv, others());
      }
    }
    const wrongList = T.wrong.length
      ? '<details class="nvWrong"><summary>答错的 ' + T.wrong.length + ' 个（已加入 Öva 复习）</summary><ul>' +
        T.wrong.map((q) => `<li><a href="../sok/#note=${enc(q.w.s)}" target="_blank" rel="noopener"><span lang="sv">${esc(q.w.l)}</span></a> ${esc(zhShort(q.w.zh))}</li>`).join('') + '</ul></details>'
      : '';
    let msg;
    let btns = '';
    if (T.place) {
      if (p >= 90) {
        msg = `<p class="nvDoneBig">✅ ${lvLabel(lv)} 测试通过</p><p class="nvSmall">${lvLabel(lv)} 在阶梯上标为「定级通过」。</p>`;
        btns = nx
          ? `<button type="button" class="nvBtn" data-act="placenext" data-lv="${nx}" data-autofocus>继续测 ${lvLabel(nx)} →</button>` +
            `<button type="button" class="nvBtn ghost" data-act="placestart" data-lv="${nx}">就从 ${lvLabel(nx)} 开始</button>`
          : `<button type="button" class="nvBtn" data-act="placestart" data-lv="${lv}" data-autofocus>全部通过 —— 设 ${lvLabel(lv)} 为当前级别</button>`;
      } else {
        msg = `<p class="nvDoneBig">建议从 ${lvLabel(lv)} 开始</p><p class="nvSmall">已经把 ${lvLabel(lv)} 设为当前级别（📌）。答错的词进了 Öva 复习。</p>`;
        btns = `<button type="button" class="nvBtn" data-act="golevel" data-lv="${lv}" data-autofocus>进入 ${lvLabel(lv)} →</button>`;
      }
    } else {
      const X = others();
      const pc = passCheck(lv, X, progress(lv, X));
      if (passedNow || (pc.all && passedOf(lv) && passedOf(lv).how === 'full')) {
        msg = `<p class="nvDoneBig">🎉 ${lvLabel(lv)} 通关！</p>`;
        btns = nx ? `<button type="button" class="nvBtn" data-act="advance" data-lv="${nx}" data-autofocus>进入 ${lvLabel(nx)}（设为当前级别）→</button>` : '';
      } else {
        msg = `<p class="nvDoneBig">${p >= 80 ? '✓ 自测及格' : '还差一点'}</p>` +
          '<ul class="nvPassList">' + pc.items.map((x) => `<li class="${x.ok ? 'ok' : ''}"><span class="nvPassMark">${x.ok ? '✓' : '○'}</span>` +
            `<span class="nvPassL">${x.label}</span><span class="nvPassH">${esc(x.have)} · ${esc(x.need)}</span></li>`).join('') + '</ul>';
      }
      btns += `<button type="button" class="nvBtn ghost" data-act="retest">再测一次</button>`;
    }
    showLayer(layerTop(T.place ? `🧭 定级 · ${lvLabel(lv)}` : `🏁 ${lvLabel(lv)} 自测`, '') + layerBar(100) +
      `<div class="nvLyBody nvDone"><p class="nvScore"><b>${right}</b> / ${total}<span>${p}%</span></p>${msg}${wrongList}` +
      `<div class="nvDoneBtns">${btns}<button type="button" class="nvBtn ghost" data-act="copy">📋 复制结果给 CC</button>` +
      `<button type="button" class="nvBtn ghost" data-act="close">${T.place ? '关闭' : `返回 ${lvLabel(lv)}`}</button></div></div>`);
  }

  // ---------- 📋 结果 → /ova (SPEC §8) ----------
  function exportLines() {
    const lines = [];
    const ova = readStore('ova.state.v1') || {};
    if (isObj(ova.cards)) {
      for (const [slug, c] of Object.entries(ova.cards)) {
        if (!isObj(c) || (ova.lastCopy && str(c.t) < ova.lastCopy)) continue;
        const w = wordBySlug.get(slug);
        lines.push(`- ${w ? w.l : slug} | slug ${slug} | box ${Number(c.b) || 0} | ✓${Number(c.r) || 0} ✗${Number(c.w) || 0} | ${c.t || today()}`);
      }
    }
    for (const [map, by, name] of [[st.words, wordBySlug, 'l'], [st.phrases, phraseBySlug, 'sv']]) {
      for (const [slug, m] of Object.entries(map)) {
        if (!Array.isArray(m) || Number(m[0]) !== 1 || (st.lastCopy && str(m[1]) < st.lastCopy)) continue;
        const it = by.get(slug);
        lines.push(`- ${it ? it[name] : slug} | slug ${slug} | known | ${m[1] || today()}`);
      }
    }
    for (const lv of LEVEL_IDS) {
      const t = bestTest(lv);
      const ps = passedOf(lv);
      if (!t && !ps) continue;
      lines.push(`level: ${lv} | test ${t ? `${t.right}/${t.total}` : '-'} | ${ps ? (ps.how === 'place' ? 'placed' : 'passed') : '-'} | ${ps ? ps.at : t.at}`);
    }
    return lines;
  }
  function copyResults(btn) {
    const lines = exportLines();
    const text = '```ova-results v1\ndate: ' + today() + '\n' + lines.join('\n') + '\n```';
    const done = () => {
      mutate((s) => { s.lastCopy = today(); });
      const o = readStore('ova.state.v1');
      if (o && isObj(o.cards)) { o.lastCopy = today(); lsSet('ova.state.v1', JSON.stringify(o)); }
      if (btn) btn.textContent = '✓ 已复制 —— 粘贴到 CC 运行 /ova';
      toast('✓ 已复制。回 Claude Code 粘贴，运行 /ova 写回知识库');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => { window.prompt('复制这段：', text); done(); });
    else { window.prompt('复制这段：', text); done(); }
  }

  // ---------- ladder ----------
  function renderLadder(opts) {
    view = null;
    document.title = 'Nivå — 按级别学 · svensk_agent';
    const X = others();
    let h = '<header class="nvHead"><h1>🪜 Nivå <small>按级别学</small></h1>' +
      '<p>一级一级来：每一级的语法、单词、词组、阅读、情景、听力和课文都在一页里，由易到难排好。学完一级，再进下一级。</p></header>';
    const focus = st.focus;
    if (focus) {
      const L = levelMeta(focus);
      const p = progress(focus, X);
      const pc = passCheck(focus, X, p);
      const nx = nextStep(focus, X);
      h += '<section class="nvCurrent">' +
        `<div class="nvCurK">📌 当前级别${passedChip(focus)}</div>` +
        `<a class="nvCurLv" href="${hashFor(focus)}" data-go="${focus}"><span class="nvLvBadge big lv-${focus}">${lvLabel(focus)}</span>` +
        `<span class="nvLvTxt"><span class="nvLvName">${esc(L.name)} <span class="nvSfi">≈ ${esc(L.sfi)}</span></span>` +
        `<span class="nvCan">通关条件 ${pc.done} / ${pc.items.length} · 进入这一级 →</span></span>${ring(p.pct)}</a>` +
        (nx ? nextHtml(focus, nx) : '') + '</section>';
    } else {
      h += '<section class="nvCurrent empty"><p><b>还没设当前级别。</b>不确定从哪一级开始，就先做一次定级：从 A1 起每级 20 题，答对 90% 就接着测下一级。</p>' +
        '<button type="button" class="nvBtn" data-act="place">🧭 开始定级测试</button>' +
        '<p class="nvSmall">也可以在下面直接点一级，进去后点「📌 设为当前级别」。</p></section>';
    }
    const last = st.last;
    if (last && SEC[last.sec] && last.lv !== focus) {
      h += `<a class="nvResume" href="${hashFor(last.lv, last.sec)}" data-go="${last.lv}" data-sec="${last.sec}">` +
        '<span class="nvResumeK">▶ 继续上次</span>' +
        `<span class="nvResumeT"><span class="nvLvBadge lv-${last.lv}">${lvLabel(last.lv)}</span> ${SEC[last.sec].icon} ${SEC[last.sec].name}</span></a>`;
    }
    h += '<ol class="nvLadder">';
    for (const L of LEVELS) {
      const p = progress(L.id, X);
      const counts = p.secs.map((s) => `<span class="${s.n ? '' : 'zero'}" title="${SEC[s.id].name}">${SEC[s.id].icon} ${num(s.n)}</span>`).join('');
      h += `<li><a class="nvLevel${L.id === focus ? ' focus' : ''}" href="${hashFor(L.id)}" data-go="${L.id}">` +
        `<span class="nvLvBadge big lv-${L.id}">${lvLabel(L.id)}</span>` +
        `<span class="nvLvTxt"><span class="nvLvName">${esc(L.name)} <span class="nvSfi">≈ ${esc(L.sfi)}</span>${L.id === focus ? ' <span class="nvPin" title="当前级别">📌</span>' : ''}${passedChip(L.id)}</span>` +
        `<span class="nvCan">${esc(L.can)}</span><span class="nvCounts">${counts}</span></span>` +
        `${ring(p.pct, passedOf(L.id) ? 'full' : '')}</a></li>`;
    }
    h += '</ol>';
    const n = exportLines().length;
    h += '<div class="nvLadderBtns">' +
      (focus ? '<button type="button" class="nvMini" data-act="place">🧭 定级测试</button>' : '') +
      `<button type="button" class="nvMini" data-act="copy"${n ? '' : ' disabled'} title="把「会」的词、自测和通关结果复制成一段，回 Claude Code 运行 /ova 写回知识库">` +
      `📋 复制结果给 CC${n ? `（${n} 条）` : '（暂无新结果）'}</button></div>`;
    h += '<p class="nvFoot">级别取自笔记和文章自己标的 CEFR。标区间的（如 A2–B1）放在低一级末尾的「🌉 过渡」；' +
      '没标级别的按用词推断，显示「≈」。进度 = 本级各分区完成比例的平均；通关 = 单词会 80% + 语法 + 读一半 + 自测 80%。</p>';
    main.innerHTML = h;
    if (!opts.passive) writeSummary(X);
  }

  // ---------- level page ----------
  const openState = new Map();   // `${lv}|${sec}|${group}` → open?  (this tab only)
  const isOpenG = (key, dflt) => (openState.has(key) ? openState.get(key) : dflt);
  function remember(lv, sec) {
    if (st.last && st.last.lv === lv && st.last.sec === sec && st.lastSec[lv] === sec) return;
    mutate((s) => { s.last = { lv, sec }; s.lastSec[lv] = sec; });
  }

  function renderLevel(lv, sec, item, opts) {
    opts = opts || {};
    const L = levelMeta(lv);
    let X = others();
    let p = progress(lv, X);
    if (!sec) {
      const first = SECTIONS.find((s) => p.sec[s.id].n);
      sec = SEC[st.lastSec[lv]] ? st.lastSec[lv] : (first ? first.id : 'grammar');
    }
    const same = view && view.lv === lv;
    view = { lv, sec };
    if (!opts.passive) {
      remember(lv, sec);
      if (settlePass(lv, X, p)) toast(`🎉 ${lvLabel(lv)} 通关！`);
    }
    document.title = `Nivå ${lvLabel(lv)} · ${SEC[sec].name} — svensk_agent`;
    const pc = passCheck(lv, X, p);
    const nx = nextStep(lv, X);
    const isFocus = st.focus === lv;

    const i = LEVEL_IDS.indexOf(lv);
    const prev = LEVEL_IDS[i - 1];
    const next = LEVEL_IDS[i + 1];
    let h = '<header class="nvTop">' +
      '<button type="button" class="nvIcon" data-act="ladder" aria-label="返回阶梯" title="返回阶梯">←</button>' +
      `<div class="nvTopMid"><h1><span class="nvLvBadge lv-${lv}">${lvLabel(lv)}</span> ${esc(L.name)}</h1>` +
      `<span class="nvSfi">≈ ${esc(L.sfi)}</span>${passedChip(lv)}</div>` +
      '<span class="nvStep">' +
      (prev ? `<a class="nvMini" href="${hashFor(prev)}" data-go="${prev}" aria-label="上一级 ${lvLabel(prev)}">‹ ${lvLabel(prev)}</a>` : '') +
      (next ? `<a class="nvMini" href="${hashFor(next)}" data-go="${next}" aria-label="下一级 ${lvLabel(next)}">${lvLabel(next)} ›</a>` : '') +
      '</span></header>';
    const sentences = (D.sentences && D.sentences[lv]) || 0;
    const t = bestTest(lv);
    h += '<section class="nvSummary">' +
      `<p class="nvCan">${esc(L.can)}</p>` +
      `<div class="nvProg"><div class="nvBar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}" aria-label="本级进度">` +
      `<span style="width:${p.pct}%"></span></div><b>${p.pct}%</b></div>` +
      '<div class="nvActions">' +
      `<button type="button" class="nvMini${isFocus ? ' on' : ''}" data-act="focus" aria-pressed="${isFocus}" title="${isFocus ? '这是当前级别' : 'Läsning / Tala / Lyssna / Öva / Kurs 会默认只看这一级'}">📌 ${isFocus ? '当前级别' : '设为当前级别'}</button>` +
      `<button type="button" class="nvMini" data-act="test">🏁 自测${t ? `（最好 ${t.right}/${t.total}）` : ''}</button>` +
      '</div>' +
      (nx ? nextHtml(lv, nx) : '') +
      `<details class="nvPassBox" data-pass="${lv}"${isOpenG(`${lv}|pass`, false) ? ' open' : ''}><summary>🏁 通关条件 <span class="nvGM">${pc.done} / ${pc.items.length}</span></summary>` +
      '<ul class="nvPassList">' + pc.items.map((x) => `<li class="${x.ok ? 'ok' : ''}"><span class="nvPassMark">${x.ok ? '✓' : '○'}</span>` +
        `<span class="nvPassL">${x.label}</span><span class="nvPassH">${esc(x.have)} · ${esc(x.need)}</span></li>`).join('') + '</ul>' +
      '<p class="nvSmall">全部满足就自动打 ✅。不上锁：没通关也可以看任何一级。</p></details>' +
      (sentences ? `<p class="nvSmall">💬 本级还有 ${num(sentences)} 个例句，分散在这一级的语法笔记和文章里；🏁 自测的填空题从这里出。</p>` : '') +
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
      try { history.replaceState(history.state, '', hashFor(lv, sec)); } catch (_e) { /* ignore */ }
    } else if (opts.top && !same) window.scrollTo(0, 0);
    else if (opts.tab) { if (tabsEl && tabsEl.getBoundingClientRect().top < 0) tabsEl.scrollIntoView({ block: 'start' }); }
    else { window.scrollTo(0, keepY); reflash(); }
    if (!opts.passive) writeSummary(X);
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
    if (!count.n) return h + emptyHtml(sec);
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

  function emptyHtml(sec) {
    const S = SEC[sec];
    const tips = {
      listen: '可以先在 🗣️ 情景 里用「🎧 只听全文 / 🗣️ 跟读」练听力——瑞典语语音会把对话读出来。',
      kurs: '课文 = 带「🔍 逐段精读」的教材文章；拍课本照片录入后会出现在这里。',
      read: '这一级的阅读文章还很少，可以先读 🗣️ 情景。',
    };
    return `<p class="nvEmpty">本级还没有${S.name}材料。${tips[sec] ? `<br>${esc(tips[sec])}` : ''}</p>`;
  }

  // A collapsible group. `rows` is an HTML string or a function that builds it on first open
  // (the word lists run to 1 500 rows, so closed groups stay empty until opened). `extra` sits in the summary.
  const lazyRows = new Map();
  function group(lv, sec, key, title, meta, rows, dflt, note, force, extra) {
    const k = `${lv}|${sec}|${key}`;
    const open = force || isOpenG(k, dflt);
    const lazy = typeof rows === 'function';
    const body = open ? (lazy ? rows() : rows) : (lazy ? '' : rows);
    if (lazy) lazyRows.set(k, rows);
    return `<details class="nvGroup" data-g="${esc(k)}"${open ? ' open' : ''}${lazy && !open ? ' data-lazy="1"' : ''}>` +
      `<summary><span class="nvGT">${title}</span>${meta ? `<span class="nvGM">${meta}</span>` : ''}${extra || ''}</summary>` +
      (note ? `<p class="nvGNote">${note}</p>` : '') +
      `<ul class="nvRows">${body}</ul></details>`;
  }
  const allDoneRow = () => '<li class="nvAllDone">这一组都完成了 ✓</li>';
  const runBtn = (sec, g, n) => (n ? `<button type="button" class="nvRunBtn" data-act="run" data-sec="${sec}" data-g="${esc(g)}" title="翻卡过一遍还没看过的 ${n} 个">▶ 过一遍 ${n}</button>` : '');

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

  // 🔤 单词 — by topic (biggest first), words without a topic by word class; common words first.
  function wordsHtml(lv, X, only, item) {
    const all = BY[lv].words;
    const row = (w) => {
      const s = wordStatus(w, X);
      return `<li><a class="nvRow nvWord s${s}" href="${hrefOf(lv, 'words', w)}" data-id="${esc(w.s)}" data-keep="${esc(w.s)}">` +
        `<span class="nvMark" aria-label="${['还没学', '复习中', '会'][s]}">${['○', '◐', '✓'][s]}</span>` +
        `<span class="nvRowT"><span lang="sv" class="nvSv">${esc(w.l)}</span>${w.g ? ` <span class="nvG">${esc(w.g)}</span>` : ''}` +
        ` <span class="nvZh">${esc(w.zh)}</span></span></a></li>`;
    };
    const known = all.filter((w) => wordStatus(w, X) === 2).length;
    const fresh = runQueue(lv, 'words', '*', X);
    let h = '<p class="nvHint">✓ 会 · ◐ 复习中 / 不会 · ○ 还没看过。「▶ 过一遍」= 翻卡自评：先想意思，翻面后点 😎 会 或 🤔 不会。' +
      `<a class="nvLinkBtn" href="../ova/#deck=all&level=${lv}">🔁 在 Öva 里复习${lvLabel(lv)}单词 →</a></p>`;
    if (fresh.queue.length && !fresh.again) {
      h += `<button type="button" class="nvBtn wide" data-act="run" data-sec="words" data-g="*">▶ 过一遍本级还没看过的 ${num(fresh.queue.length)} 个词</button>`;
    }
    if (only && known === all.length) return h + `<ul class="nvRows">${allDoneRow()}</ul>`;
    for (const gr of wordGroups(lv)) {
      const done = gr.items.filter((w) => wordStatus(w, X) === 2).length;
      const shown = only ? gr.items.filter((w) => wordStatus(w, X) !== 2) : gr.items;
      if (!shown.length) continue;
      const left = gr.items.filter((w) => markOf('words', w.s) === undefined && wordStatus(w, X) !== 2).length;
      const hasItem = !!item && shown.some((w) => w.s === item);
      h += group(lv, 'words', gr.key, esc(gr.title), `${done}/${gr.items.length}`, () => shown.map(row).join(''), false, '', hasItem, runBtn('words', gr.key, left));
    }
    return h;
  }

  // 🧩 词组 — by kind; levels marked ≈ were inferred from their words (SPEC §4.2).
  function phrasesHtml(lv, X, only, item) {
    const row = (p) => {
      const s = phraseStatus(p, X);
      return `<li><a class="nvRow nvWord s${s}" href="${hrefOf(lv, 'phrases', p)}" data-id="${esc(p.s)}" data-keep="${esc(p.s)}">` +
        `<span class="nvMark" aria-label="${['还没学', '不会', '会'][s]}">${['○', '◐', '✓'][s]}</span>` +
        `<span class="nvRowT"><span lang="sv" class="nvSv">${esc(p.sv)}</span> <span class="nvZh">${esc(p.zh)}</span>` +
        `${p.inf ? ' <span class="nvChip" title="级别是按词组里最难的词推断的">≈</span>' : ''}</span></a></li>`;
    };
    let h = '<p class="nvHint">带「≈」的词组没有标级别，按其中最难的词推断。「会」= 知识库标了 known、在这里过一遍时点了 😎，或在 Flöde 里点过「😎 会了」。</p>';
    let any = false;
    for (const gr of phraseGroups(lv)) {
      const done = gr.items.filter((p) => phraseStatus(p, X) === 2).length;
      const shown = only ? gr.items.filter((p) => phraseStatus(p, X) !== 2) : gr.items;
      if (!shown.length) continue;
      any = true;
      const left = gr.items.filter((p) => markOf('phrases', p.s) === undefined && phraseStatus(p, X) !== 2).length;
      const hasItem = !!item && shown.some((p) => p.s === item);
      h += group(lv, 'phrases', gr.key, gr.title, `${done}/${gr.items.length}`, () => shown.map(row).join(''), false, '', hasItem, runBtn('phrases', gr.key, left));
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
      return `<li><a class="nvRow nvText${done ? ' done' : ''}" href="${hrefOf(lv, 'kurs', k)}" data-id="${esc(k.s)}">` +
        ring(read ? 100 : pct(paras, k.paras), 'sm') +
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
  function setFocus(lv) {
    mutate((s) => { s.focus = lv; });
    toast(`📌 当前级别：${lvLabel(lv)} —— Läsning / Tala / Lyssna / Öva / Kurs 会默认只看 ${lvLabel(lv)}`);
  }
  main.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act && main.contains(act)) {
      const a = act.getAttribute('data-act');
      if (a === 'run') {
        e.preventDefault();   // the button sits inside a <summary>: don't toggle the group
        if (view) openLayer(runHash(view.lv, act.getAttribute('data-sec'), act.getAttribute('data-g')));
        return;
      }
      if (a === 'ladder') { goLadder(); return; }
      if (a === 'next') { const lv = act.getAttribute('data-lv'); doStep(lv, nextStep(lv, others())); return; }
      if (a === 'test' && view) { openLayer(`#lv=${view.lv}&test=1`); return; }
      if (a === 'place') { openLayer('#place=A1'); return; }
      if (a === 'copy') { copyResults(act); return; }
      if (a === 'focus' && view) {
        if (st.focus === view.lv) { mutate((s) => { s.focus = ''; }); toast('已取消当前级别'); } else setFocus(view.lv);
        renderLevel(view.lv, view.sec, '', {});
        return;
      }
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
    const go = e.target.closest('[data-go]');
    if (go) {
      e.preventDefault();
      goLevel(go.getAttribute('data-go'), go.getAttribute('data-sec') || '');
      return;
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
    if (!det || !det.matches) return;
    if (det.matches('details.nvPassBox')) { openState.set(`${det.getAttribute('data-pass')}|pass`, det.open); return; }
    if (!det.matches('details.nvGroup')) return;
    const k = det.getAttribute('data-g');
    openState.set(k, det.open);
    if (det.open && det.getAttribute('data-lazy')) {
      const fill = lazyRows.get(k);
      const ul = det.querySelector('.nvRows');
      if (fill && ul) ul.innerHTML = fill();
      det.removeAttribute('data-lazy');
    }
  }, true);

  layer.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.getAttribute('data-act');
    if (a === 'say') { e.stopPropagation(); say(act.getAttribute('data-say')); return; }
    if (a === 'close') { closeLayer(); return; }
    if (a === 'flip' && R && !R.flipped) { R.flipped = true; renderRun(); return; }
    if (a === 'yes') { runMark(true); return; }
    if (a === 'no') { runMark(false); return; }
    if (a === 'undo') { runUndo(); return; }
    if (a === 'rungo' && R) {
      const h = runHash(R.lv, R.sec, act.getAttribute('data-g'));
      try { history.replaceState(history.state, '', h); } catch (_e) { /* ignore */ }
      layerKey = '';
      route({ passive: true });
      return;
    }
    if (a === 'opt') { testAnswer(Number(act.getAttribute('data-i'))); return; }
    if (a === 'qnext') { testNext(); return; }
    if (a === 'retest' && T) {
      layerKey = '';
      route({ passive: true });
      return;
    }
    if (a === 'copy') { copyResults(act); return; }
    if (a === 'placenext') {
      try { history.replaceState(history.state, '', `#place=${act.getAttribute('data-lv')}`); } catch (_e) { /* ignore */ }
      route({ passive: true });
      return;
    }
    if (a === 'placestart' || a === 'golevel' || a === 'advance') {
      const lv = act.getAttribute('data-lv');
      if (a !== 'golevel') setFocus(lv);
      hideLayer();
      try { history.replaceState({ nv: 1 }, '', hashFor(lv)); } catch (_e) { /* ignore */ }
      route({ top: true });
    }
  });
  document.addEventListener('keydown', (e) => {
    if (layer.hidden || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') { e.preventDefault(); closeLayer(); return; }
    if (R) {
      if ((e.key === ' ' || e.key === 'Enter') && !R.flipped) { e.preventDefault(); R.flipped = true; renderRun(); return; }
      if (R.flipped && (e.key === 'ArrowRight' || e.key === '2')) { e.preventDefault(); runMark(true); return; }
      if (R.flipped && (e.key === 'ArrowLeft' || e.key === '1')) { e.preventDefault(); runMark(false); return; }
      if (e.key === 'Backspace' || e.key === 'z') { e.preventDefault(); runUndo(); }
      return;
    }
    if (T && T.i < T.qs.length) {
      if (!T.answered && /^[1-4]$/.test(e.key)) { e.preventDefault(); testAnswer(Number(e.key) - 1); return; }
      if (T.answered && (e.key === 'Enter' || e.key === 'ArrowRight')) { e.preventDefault(); testNext(); }
    }
  });

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
  // Landing straight on a level or an exercise: put the ladder / level page underneath so ✕, ← and Back go there.
  (function boot() {
    const h = readHash();
    const target = location.hash;
    try {
      if (h.lv || h.place) {
        history.replaceState(null, '', location.pathname + location.search);
        if (h.lv && (h.run || h.test)) {
          history.pushState({ nv: 1 }, '', hashFor(h.lv, h.sec));
          history.pushState({ nv: 1, layer: 1 }, '', target);
        } else if (h.place) {
          history.pushState({ nv: 1, layer: 1 }, '', target);
        } else {
          history.pushState({ nv: 1 }, '', hashFor(h.lv, h.sec, h.item));
        }
      }
    } catch (_e) { /* ignore */ }
    route({ top: true });
  })();
})();

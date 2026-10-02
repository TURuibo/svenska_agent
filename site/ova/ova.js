/* Öva — multiple-choice vocabulary review over the KB word notes.
 *
 * Decks: 🎯 补弱项 (gap words from the 2026-10-02 vocabulary analysis that now have
 * a KB note — window.VOCAB_PROGRESS.learned), 🆕 最近新词 (notes created in the last
 * 21 days), 📚 全部. Optional CEFR filter.
 *
 * Three question types, chosen by how well the word is known (Leitner box):
 *   box 0–1  ① 看瑞典语选中文   (sv → zh)
 *   box 2–3  ② 看中文选瑞典语   (zh → sv)
 *   box 4+   ③ 句子选词         (cloze from a KB sentence note; falls back to ②)
 * Distractors share the part of speech and, where possible, a topic or CEFR level,
 * so the answer can't be found by elimination.
 *
 * Progress lives in localStorage (this device). "📋 复制结果给 CC" exports an
 * `ova-results v1` block of cumulative counts; `/ova` in Claude Code writes them
 * into the notes' review fields (idempotent — totals, not deltas).
 */
(function () {
  'use strict';

  const KB = window.KB;
  const cardEl = document.getElementById('ovaCard');
  const statsEl = document.getElementById('ovaStats');
  const summaryEl = document.getElementById('ovaSummary');
  const notes = (KB && KB.notes) || [];
  if (!notes.length) {
    cardEl.innerHTML = '<p class="ovaEmpty">⚠️ 找不到 kb-index.js —— 请先运行 <code>node tools/build-kb-site.js</code>。</p>';
    return;
  }

  // ---------- data ----------
  const words = notes.filter((n) => n.type === 'word' && n.lemma && n.zh);
  const bySlug = new Map(words.map((w) => [w.slug, w]));
  const sentences = new Map();   // word slug → [sentence note]
  const addSent = (slug, s) => {
    if (!slug || !s || !s.sentence) return;
    const list = sentences.get(slug) || [];
    if (!list.includes(s)) list.push(s);
    sentences.set(slug, list);
  };
  const sentBySlug = new Map(notes.filter((n) => n.type === 'sentence').map((s) => [s.slug, s]));
  for (const s of sentBySlug.values()) for (const w of s.words || []) addSent(w, s);
  for (const w of words) for (const sl of w.sentences || []) addSent(w.slug, sentBySlug.get(sl));

  const progress = window.VOCAB_PROGRESS || null;
  const focusSlugs = progress && Array.isArray(progress.learned)
    ? progress.learned.map((l) => l.slug).filter((s) => bySlug.has(s)) : [];

  // ---------- state ----------
  const LS = 'ova.state.v1';
  const INTERVALS = [0, 1, 2, 4, 7, 14, 30];   // days until due, by box
  const SESSION = 20;
  const NEW_PER_SESSION = 10;
  let state = { cards: {}, lastCopy: '' };
  try {
    const s = JSON.parse(localStorage.getItem(LS) || 'null');
    if (s && s.cards) state = s;
  } catch (_e) { /* private mode: progress just won't persist */ }
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (_e) {} };

  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dateStr(new Date());
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return dateStr(d); };

  // ---------- helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const posHead = (o) => String(o || '').trim().split(/[\s(/]/)[0].toLowerCase();
  // "诚实的、公道的；正直" → "诚实的、公道的" — keep options short and comparable.
  const zhShort = (z) => {
    const parts = String(z || '').split(/[；;]/).map((s) => s.trim()).filter(Boolean);
    let out = parts[0] || '';
    if (out.length > 16) out = out.slice(0, 16) + '…';
    return out;
  };
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  // Individual Chinese glosses ("诚实的、公道的；正直" → 诚实的 / 公道的 / 正直), used to
  // keep synonyms out of the options (jobba 工作 must not be a "wrong" answer for arbeta 工作).
  const glosses = (z) => new Set(String(z || '').split(/[；;、，,/（）()]/).map((s) => s.replace(/[的地得]$/, '').trim()).filter((s) => s.length >= 1));
  const overlaps = (a, b) => { for (const g of a) if (b.has(g)) return true; return false; };

  // Three distractors: same part of speech; prefer a shared topic, then the same CEFR level;
  // never a word whose meaning overlaps the answer's.
  function distractors(w, field) {
    const head = posHead(w.ordklass);
    const topics = new Set(w.topics || []);
    const mine = glosses(w.zh);
    const seen = new Set([field === 'zh' ? zhShort(w.zh) : w.lemma.toLowerCase()]);
    const scored = shuffle(words).filter((x) => x.slug !== w.slug && posHead(x.ordklass) === head && !overlaps(mine, glosses(x.zh)))
      .map((x) => ({ x, s: ((x.topics || []).some((t) => topics.has(t)) ? 3 : 0) + (x.cefr === w.cefr ? 1 : 0) }))
      .sort((a, b) => b.s - a.s);
    const out = [];
    for (const { x } of scored) {
      const key = field === 'zh' ? zhShort(x.zh) : x.lemma.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(x);
      if (out.length === 3) break;
    }
    // tiny word classes (interjektion …): top up from any word
    for (const x of shuffle(words)) {
      if (out.length === 3) break;
      const key = field === 'zh' ? zhShort(x.zh) : x.lemma.toLowerCase();
      if (x.slug === w.slug || seen.has(key) || overlaps(mine, glosses(x.zh))) continue;
      seen.add(key);
      out.push(x);
    }
    return out;
  }

  // Cloze: a KB sentence containing one of the word's forms, with that form blanked.
  function cloze(w) {
    const forms = [...new Set([...(w.forms || []), w.lemma])].filter(Boolean).sort((a, b) => b.length - a.length);
    for (const s of shuffle(sentences.get(w.slug) || [])) {
      for (const f of forms) {
        const re = new RegExp(`(^|[^A-Za-zÀ-ÿ])(${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![A-Za-zÀ-ÿ])`, 'i');
        const m = s.sentence.match(re);
        if (m) {
          const at = m.index + m[1].length;
          return { s, before: s.sentence.slice(0, at), answer: m[2], after: s.sentence.slice(at + m[2].length) };
        }
      }
    }
    return null;
  }

  // ---------- decks ----------
  let deck = 'focus';
  let level = 'all';
  {
    const h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    if (['focus', 'recent', 'all'].includes(h.get('deck'))) deck = h.get('deck');
    else if (!focusSlugs.length) deck = 'recent';
  }
  function deckWords() {
    let list;
    if (deck === 'focus') list = focusSlugs.map((s) => bySlug.get(s));
    else if (deck === 'recent') {
      const since = addDays(-21);
      list = words.filter((w) => (w.created || '') >= since).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      if (list.length < 30) list = words.slice().sort((a, b) => (b.created || '').localeCompare(a.created || '')).slice(0, 60);
    } else list = words.slice().sort((a, b) => (a.cefr || 'Z').localeCompare(b.cefr || 'Z'));
    if (level !== 'all') list = list.filter((w) => (level === 'B2' ? /^(B2|C1|C2)/.test(w.cefr || '') : (w.cefr || '').startsWith(level)));
    return list.filter(Boolean);
  }

  // ---------- session ----------
  let queue = [];
  let pos = 0;
  let current = null;
  let answered = false;
  let score = { right: 0, wrong: 0, missed: [] };

  function buildSession() {
    const t = today();
    const pool = deckWords();
    const due = pool.filter((w) => state.cards[w.slug] && state.cards[w.slug].d <= t)
      .sort((a, b) => state.cards[a.slug].d.localeCompare(state.cards[b.slug].d) || state.cards[a.slug].b - state.cards[b.slug].b);
    const fresh = pool.filter((w) => !state.cards[w.slug]);
    queue = due.slice(0, SESSION).map((w) => w.slug);
    for (const w of fresh) {
      if (queue.length >= SESSION || queue.length - Math.min(due.length, SESSION) >= NEW_PER_SESSION) break;
      queue.push(w.slug);
    }
    pos = 0;
    score = { right: 0, wrong: 0, missed: [] };
  }

  function questionFor(w) {
    const c = state.cards[w.slug];
    const box = c ? c.b : 0;
    if (box >= 4) {
      const cz = cloze(w);
      if (cz) return { type: 'cloze', w, cz, options: shuffle([w, ...distractors(w, 'lemma')]) };
    }
    if (box >= 2) return { type: 'zh2sv', w, options: shuffle([w, ...distractors(w, 'lemma')]) };
    return { type: 'sv2zh', w, options: shuffle([w, ...distractors(w, 'zh')]) };
  }

  const TYPE_LABEL = { sv2zh: '① 看瑞典语选中文', zh2sv: '② 看中文选瑞典语', cloze: '③ 句子选词（选项是原形）' };
  const DECK_LABEL = { focus: '🎯 补弱项', recent: '🆕 最近新词', all: '📚 全部' };

  function speakBtn(text) {
    if (!(window.SvSpeak && window.SvSpeak.supported)) return '';
    return `<button type="button" class="ovaSpeak" data-say="${esc(text)}" title="朗读">🔊</button>`;
  }

  function render() {
    renderStats();
    if (pos >= queue.length) return renderDone();
    const w = bySlug.get(queue[pos]);
    if (!w) { pos += 1; return render(); }
    current = questionFor(w);
    answered = false;
    const q = current;
    let prompt = '';
    if (q.type === 'sv2zh') {
      prompt = `<div class="ovaPrompt"><span class="ovaBig" lang="sv">${esc(w.lemma)}</span>${speakBtn(w.lemma)}` +
        `<span class="ovaMeta">${esc(w.ordklass || '')}${w.cefr ? ' · ' + esc(w.cefr) : ''}</span></div>`;
    } else if (q.type === 'zh2sv') {
      prompt = `<div class="ovaPrompt"><span class="ovaBig">${esc(zhShort(w.zh))}</span>` +
        `<span class="ovaMeta">${esc(w.ordklass || '')}${w.cefr ? ' · ' + esc(w.cefr) : ''}</span></div>`;
    } else {
      prompt = `<div class="ovaPrompt ovaCloze" lang="sv">${esc(q.cz.before)}<span class="ovaBlank">_____</span>${esc(q.cz.after)}</div>`;
    }
    const opts = q.options.map((o, i) => {
      const text = q.type === 'sv2zh' ? zhShort(o.zh) : o.lemma;
      return `<button type="button" class="ovaOpt" data-slug="${esc(o.slug)}"><span class="ovaKey">${i + 1}</span>` +
        `<span${q.type === 'sv2zh' ? '' : ' lang="sv"'}>${esc(text)}</span></button>`;
    }).join('');
    cardEl.innerHTML =
      `<div class="ovaTop"><span>${DECK_LABEL[deck]}</span><span>${TYPE_LABEL[q.type]}</span>` +
        `<span class="ovaCount">${pos + 1} / ${queue.length}</span></div>` +
      `<div class="ovaBar"><span style="width:${Math.round((100 * pos) / queue.length)}%"></span></div>` +
      prompt +
      `<div class="ovaOpts">${opts}</div>` +
      `<div class="ovaFeedback" id="ovaFeedback"></div>`;
  }

  function answer(slug) {
    if (answered || !current) return;
    answered = true;
    const w = current.w;
    const ok = slug === w.slug;
    cardEl.querySelectorAll('.ovaOpt').forEach((b) => {
      b.disabled = true;
      if (b.dataset.slug === w.slug) b.classList.add('right');
      else if (b.dataset.slug === slug) b.classList.add('wrong');
    });
    const t = today();
    const c = state.cards[w.slug] || { b: 0, d: t, r: 0, w: 0, t };
    if (ok) {
      c.b = Math.min(c.b + 1, INTERVALS.length - 1);
      c.r += 1;
      score.right += 1;
    } else {
      c.b = 0;
      c.w += 1;
      score.wrong += 1;
      if (!score.missed.includes(w.slug)) score.missed.push(w.slug);
      // ask again later in this round (once)
      const again = queue.indexOf(w.slug, pos + 1);
      if (again === -1) queue.splice(Math.min(pos + 4, queue.length), 0, w.slug);
    }
    c.d = addDays(INTERVALS[c.b]);
    c.t = t;
    state.cards[w.slug] = c;
    save();

    const sentence = current.type === 'cloze'
      ? `<p class="ovaSentence" lang="sv">${esc(current.cz.before)}<b>${esc(current.cz.answer)}</b>${esc(current.cz.after)}</p>` +
        (current.cz.s.zh ? `<p class="ovaSentenceZh">${esc(current.cz.s.zh)}</p>` : '')
      : '';
    document.getElementById('ovaFeedback').innerHTML =
      `<p class="ovaVerdict ${ok ? 'ok' : 'no'}">${ok ? '✓ 答对了' : '✗ 正确答案'}：` +
        `<b lang="sv">${esc(w.lemma)}</b> ${speakBtn(w.lemma)} — ${esc(w.zh)}${w.en ? ` <span class="ovaEn">(${esc(w.en)})</span>` : ''}</p>` +
      sentence +
      `<p class="ovaNextRow"><button type="button" class="ovaBtn ovaNote" data-slug="${esc(w.slug)}">📖 看笔记</button>` +
        `<button type="button" class="ovaBtn primary" id="ovaNext">下一题 →</button></p>`;
    renderStats();
  }

  function next() {
    if (!answered) return;
    pos += 1;
    render();
  }

  function renderDone() {
    const total = score.right + score.wrong;
    const pool = deckWords();
    const missed = score.missed.map((s) => bySlug.get(s)).filter(Boolean);
    let msg;
    if (!pool.length && deck === 'focus') {
      msg = '<p class="ovaEmpty">🎯 还没有入库的补弱项词。<br>先读 📖 Läsning 里的 🎯 补弱项文章，<code>/import</code> 之后这些词就会出现在这里。</p>' +
        '<p><button type="button" class="ovaBtn primary" data-deck="recent">改复习 🆕 最近新词</button></p>';
    } else if (!total) {
      const t = today();
      const nextDue = pool.map((w) => state.cards[w.slug]).filter(Boolean).map((c) => c.d).filter((d) => d > t).sort()[0];
      msg = `<p class="ovaEmpty">✅ 这个范围今天没有要复习的词了。${nextDue ? `下一批在 <b>${nextDue}</b>。` : ''}</p>` +
        '<p><button type="button" class="ovaBtn" data-deck="all">换成 📚 全部</button></p>';
    } else {
      msg = `<p class="ovaDoneScore">本轮 ${total} 题 · 答对 <b>${score.right}</b> · 答错 <b>${score.wrong}</b></p>` +
        (missed.length ? `<p class="ovaDoneMissed">要再看看：${missed.map((w) => `<button type="button" class="ovaChip ovaNote" data-slug="${esc(w.slug)}" lang="sv">${esc(w.lemma)}</button>`).join(' ')}</p>` : '') +
        '<p><button type="button" class="ovaBtn primary" id="ovaAgain">再来一轮</button></p>';
    }
    cardEl.innerHTML = `<div class="ovaDone">${msg}</div>`;
  }

  function renderStats() {
    const pool = deckWords();
    const t = today();
    let seen = 0, due = 0, mastered = 0;
    const boxes = new Array(INTERVALS.length).fill(0);
    for (const w of pool) {
      const c = state.cards[w.slug];
      if (!c) continue;
      seen += 1;
      boxes[c.b] += 1;
      if (c.d <= t) due += 1;
      if (c.b >= 5) mastered += 1;
    }
    const max = Math.max(1, ...boxes);
    statsEl.innerHTML =
      `<p class="ovaStatLine"><b>${pool.length}</b> 词 · 学过 <b>${seen}</b> · 今天到期 <b>${due}</b> · 掌握 <b>${mastered}</b></p>` +
      `<div class="ovaBoxes">${boxes.map((n, i) =>
        `<div class="ovaBox" title="第 ${i} 级：${n} 个词（间隔 ${INTERVALS[i]} 天）"><span style="height:${Math.round((100 * n) / max)}%"></span><em>${i}</em></div>`).join('')}</div>` +
      `<p class="ovaBoxLegend">复习等级 0 → 6（越高越熟）</p>`;
    const changed = Object.values(state.cards).filter((c) => !state.lastCopy || c.t >= state.lastCopy).length;
    document.getElementById('ovaPending').textContent = changed ? `${changed} 个词有新成绩` : '没有新成绩';
    summaryEl.textContent = `${words.length} 个 KB 单词 · 🎯 已入库的补弱项词 ${focusSlugs.length} 个` +
      (progress ? ` · P1 缺口已补 ${progress.priorities.find((p) => p.p === 1).done}/${progress.priorities.find((p) => p.p === 1).total}` : '');
  }

  function exportText() {
    const lines = [];
    for (const [slug, c] of Object.entries(state.cards)) {
      if (state.lastCopy && c.t < state.lastCopy) continue;
      const w = bySlug.get(slug);
      lines.push(`- ${w ? w.lemma : slug} | slug ${slug} | box ${c.b} | ✓${c.r} ✗${c.w} | ${c.t}`);
    }
    return '```ova-results v1\ndate: ' + today() + '\n' + lines.join('\n') + '\n```';
  }

  // ---------- events ----------
  function setDeck(d) {
    deck = d;
    document.querySelectorAll('.deckBtn').forEach((b) => b.classList.toggle('active', b.dataset.deck === deck));
    buildSession();
    render();
  }
  document.querySelectorAll('.deckBtn').forEach((b) => b.addEventListener('click', () => setDeck(b.dataset.deck)));
  document.getElementById('ovaLevel').addEventListener('change', (e) => { level = e.target.value; setDeck(deck); });
  cardEl.addEventListener('click', (e) => {
    const opt = e.target.closest('.ovaOpt');
    if (opt) return answer(opt.dataset.slug);
    const say = e.target.closest('.ovaSpeak');
    if (say && window.SvSpeak) return window.SvSpeak.speak(say.dataset.say);
    const note = e.target.closest('.ovaNote');
    if (note && KB && KB.openNote) return KB.openNote(note.dataset.slug);
    if (e.target.closest('#ovaNext')) return next();
    if (e.target.closest('#ovaAgain')) { buildSession(); return render(); }
    const dk = e.target.closest('[data-deck]');
    if (dk) return setDeck(dk.dataset.deck);
  });
  document.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (document.body.classList.contains('kbPopOpen')) return;
    if (!answered && /^[1-4]$/.test(e.key)) {
      const b = cardEl.querySelectorAll('.ovaOpt')[Number(e.key) - 1];
      if (b) answer(b.dataset.slug);
    } else if (answered && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      next();
    }
  });
  document.getElementById('ovaCopy').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const text = exportText();
    const done = () => {
      state.lastCopy = today();
      save();
      btn.textContent = '✓ 已复制 —— 粘贴到 CC 运行 /ova';
      setTimeout(() => { btn.textContent = '📋 复制结果给 CC'; renderStats(); }, 2500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => { window.prompt('复制这段：', text); done(); });
    else { window.prompt('复制这段：', text); done(); }
  });

  setDeck(deck);
})();

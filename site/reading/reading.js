/* Läsning — reading UI. Reads window.READING_DATA (reading-data.js) for articles
   and window.KB_DATA (../kb-data.js) for per-article flashcards. */

(function () {
  'use strict';

  const data = window.READING_DATA;
  const kb = window.KB_DATA && Array.isArray(window.KB_DATA.notes) ? window.KB_DATA.notes : [];
  const listEl = document.getElementById('articleList');
  const viewEl = document.getElementById('articleView');

  if (!data || !Array.isArray(data.articles)) {
    listEl.innerHTML =
      '<p class="listEmpty">⚠️ 找不到 reading-data.js — 请先运行 <code>node tools/build-reading-site.js</code>。</p>';
    return;
  }

  const articles = data.articles;
  document.getElementById('readingUpdated').textContent =
    `数据更新于 ${data.generatedAt} · 共 ${articles.length} 篇`;

  const kbBySlug = new Map();
  for (const n of kb) kbBySlug.set(n.slug, n);

  // ---------- local state (已读 marker) ----------

  const LS_READ = 'lasning.read.v1';
  function loadSet(key) {
    try { const a = JSON.parse(localStorage.getItem(key) || '[]'); return new Set(Array.isArray(a) ? a : []); }
    catch (_e) { return new Set(); }
  }
  function saveSet(key, set) { try { localStorage.setItem(key, JSON.stringify(Array.from(set))); } catch (_e) {} }
  const readSet = loadSet(LS_READ);
  const isRead = (slug) => readSet.has(slug);
  function toggleRead(slug) {
    if (readSet.has(slug)) readSet.delete(slug); else readSet.add(slug);
    saveSet(LS_READ, readSet);
  }

  // ---------- markdown → HTML ----------

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function inline(s) {
    let t = escapeHtml(s);
    t = t.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, slug, label) =>
      `<a href="../#note=${encodeURIComponent(slug)}" target="_blank" rel="noopener">${escapeHtml(label || slug)}</a>`);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return t;
  }
  // Tag blocks inside a 🇨🇳-translation zone with data-zh="1" so recall mode can hide them.
  function mdToHtml(md) {
    const lines = md.split(/\r?\n/);
    const out = [];
    let i = 0, inList = false, zhZone = false;
    const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
    const z = () => (zhZone ? ' data-zh="1"' : '');
    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^```(.*)$/);
      if (fence) {
        closeList(); const buf = []; i += 1;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i += 1; }
        out.push(`<pre${z()}><code>` + escapeHtml(buf.join('\n')) + '</code></pre>'); i += 1; continue;
      }
      if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { closeList(); out.push(`<hr${z()} />`); i += 1; continue; }
      const h = line.match(/^(#{1,6})\s+(.+)$/);
      if (h) {
        closeList();
        const level = Math.min(4, h[1].length);
        const text = h[2].trim();
        zhZone = /翻译|译文|中文/.test(text);
        out.push(`<h${level}${z()}>${inline(text)}</h${level}>`); i += 1; continue;
      }
      const li = line.match(/^\s*[-*]\s+(.+)$/);
      if (li) { if (!inList) { out.push(`<ul${z()}>`); inList = true; } out.push('<li>' + inline(li[1]) + '</li>'); i += 1; continue; }
      if (line.trim() === '') { closeList(); i += 1; continue; }
      closeList(); out.push(`<p${z()}>` + inline(line) + '</p>'); i += 1;
    }
    closeList();
    return out.join('\n');
  }

  // ---------- list ----------

  const KIND_BADGE = { scenario: 'scenario', paste: 'paste', adjsubst: 'adjsubst', other: 'other' };
  let activeKind = 'all', query = '', currentSlug = null, unreadOnly = false;

  function filtered() {
    return articles.filter((a) => {
      if (activeKind !== 'all' && a.kind !== activeKind) return false;
      if (unreadOnly && isRead(a.slug)) return false;
      if (query && !a.searchText.includes(query)) return false;
      return true;
    });
  }

  function renderList() {
    const items = filtered();
    listEl.innerHTML = '';
    if (items.length === 0) {
      listEl.innerHTML = '<p class="listEmpty">没有匹配的文章。换个筛选试试？</p>';
      return;
    }
    for (const a of items) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'articleCard' + (a.slug === currentSlug ? ' active' : '') + (isRead(a.slug) ? ' read' : '');
      card.dataset.slug = a.slug;

      const top = document.createElement('div');
      top.className = 'cardTop';
      const kind = document.createElement('span');
      kind.className = 'cardKind kind-' + (KIND_BADGE[a.kind] || 'other');
      kind.textContent = a.kindLabel ? a.kindLabel.zh : a.kind;
      top.appendChild(kind);
      const status = document.createElement('span');
      status.className = 'cardStatus status-' + a.status;
      status.textContent = a.statusLabel;
      top.appendChild(status);
      if (isRead(a.slug)) {
        const rd = document.createElement('span');
        rd.className = 'cardRead';
        rd.textContent = '✓ 已读';
        top.appendChild(rd);
      }
      card.appendChild(top);

      const title = document.createElement('div');
      title.className = 'cardTitle';
      title.textContent = a.title;
      card.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'cardMeta';
      const bits = [];
      if (a.date) bits.push(a.date);
      if (a.cefr) bits.push(a.cefr);
      if (a.itemTotal) bits.push(`${a.itemTotal} 学习项`);
      meta.textContent = bits.join(' · ');
      card.appendChild(meta);

      card.addEventListener('click', () => openArticle(a.slug));
      listEl.appendChild(card);
    }
  }

  // ---------- per-article flashcard deck (from KB items the source note links) ----------

  // Map an article -> its KB source note. The librarian names source notes with a short
  // 1–3 word kebab summary (e.g. article "scenario-2026-06-15-pa-restaurang-allergi-och-nota"
  // -> source "source-2026-06-15-restaurang-allergi-nota"), so an exact prefix swap usually
  // misses. Strategy: try the exact guess first, then among source notes of the SAME date
  // pick the one whose slug tokens overlap the article's the most.
  const STOP_TOKENS = new Set(['pa', 'och', 'i', 'en', 'ett', 'att', 'det', 'som', 'med', 'the', 'a', 'of']);
  function slugTokens(slug, leadRe) {
    return String(slug)
      .replace(leadRe, '')
      .replace(/\d{4}-\d{2}-\d{2}-?/, '')
      .split('-')
      .filter((t) => t && !STOP_TOKENS.has(t));
  }
  function sourceNoteFor(a) {
    const guess = a.slug.replace(/^(scenario|paste|adjsubst|other)-/, 'source-');
    const exact = kbBySlug.get(guess);
    if (exact) return exact;

    const dateM = String(a.slug).match(/\d{4}-\d{2}-\d{2}/);
    const date = dateM ? dateM[0] : (a.date || '');
    const want = new Set(slugTokens(a.slug, /^(scenario|paste|adjsubst|other)-/));
    let best = null, bestScore = 0, tie = false;
    for (const n of kb) {
      if (n.type !== 'source') continue;
      if (date && !String(n.slug).includes(date)) continue;
      let score = 0;
      for (const t of slugTokens(n.slug, /^source-/)) if (want.has(t)) score += 1;
      if (score > bestScore) { bestScore = score; best = n; tie = false; }
      else if (score === bestScore && score > 0) { tie = true; }
    }
    // require a clear winner; an ambiguous tie (e.g. several "restaurang-*" of the same day
    // sharing only the generic token) returns null -> no flashcard button, never wrong cards.
    return (bestScore >= 1 && !tie) ? best : null;
  }
  function deckFor(a) {
    const src = sourceNoteFor(a);
    if (!src) return [];
    const slugs = [];
    for (const key of ['words', 'phrases', 'sentences', 'grammar']) {
      if (Array.isArray(src[key])) slugs.push(...src[key]);
    }
    return slugs.map((s) => kbBySlug.get(String(s))).filter(Boolean);
  }

  // ---------- reading pane ----------

  function openArticle(slug) {
    const a = articles.find((x) => x.slug === slug);
    if (!a) return;
    currentSlug = slug;
    listEl.querySelectorAll('.articleCard').forEach((c) => c.classList.toggle('active', c.dataset.slug === slug));

    const counts = a.counts || {};
    const countBits = [['words', '词'], ['phrases', '词组'], ['sentences', '句子'], ['grammar', '语法']]
      .filter(([k]) => counts[k]).map(([k, label]) => `${counts[k]} ${label}`);

    const deck = deckFor(a);
    const read = isRead(slug);

    viewEl.innerHTML =
      `<div class="viewHead">` +
        `<span class="cardKind kind-${KIND_BADGE[a.kind] || 'other'}">${a.kindLabel ? a.kindLabel.zh : a.kind}</span>` +
        `<span class="cardStatus status-${a.status}">${a.statusLabel}</span>` +
        (a.cefr ? `<span class="viewCefr">${escapeHtml(a.cefr)}</span>` : '') +
        (a.date ? `<span class="viewDate">${escapeHtml(a.date)}</span>` : '') +
        `<span class="viewSpacer"></span>` +
        `<button type="button" id="markReadBtn" class="viewBtn${read ? ' on' : ''}">${read ? '✓ 已读' : '标为已读'}</button>` +
        (deck.length ? `<button type="button" id="flashBtn" class="viewBtn">🎴 这篇闪卡 (${deck.length})</button>` : '') +
      `</div>` +
      (countBits.length ? `<p class="viewCounts">📚 ${countBits.join(' · ')}</p>` : '') +
      `<div class="articleBody${recall ? ' recall' : ''}">${mdToHtml(a.body || '')}</div>`;

    wireRevealClicks();
    document.getElementById('markReadBtn').addEventListener('click', () => {
      toggleRead(slug);
      openArticle(slug);   // re-render head + card state
      renderList();
    });
    const fb = document.getElementById('flashBtn');
    if (fb) fb.addEventListener('click', () => openFlash(deck, a.title));

    viewEl.scrollTop = 0;
    if (window.matchMedia('(max-width: 760px)').matches) viewEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- recall mode (精读): hide 🇨🇳 blocks; click to peek ----------

  let recall = false;
  function wireRevealClicks() {
    viewEl.querySelectorAll('.articleBody [data-zh="1"]').forEach((el) => {
      el.addEventListener('click', () => {
        if (viewEl.querySelector('.articleBody').classList.contains('recall')) el.classList.toggle('peek');
      });
    });
  }
  document.getElementById('recallToggle').addEventListener('click', (e) => {
    recall = !recall;
    e.currentTarget.classList.toggle('active', recall);
    const body = viewEl.querySelector('.articleBody');
    if (body) {
      body.classList.toggle('recall', recall);
      if (!recall) body.querySelectorAll('.peek').forEach((el) => el.classList.remove('peek'));
    }
  });

  // ---------- filters ----------

  document.querySelectorAll('.kindFilter').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.kindFilter').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeKind = btn.dataset.kind;
      renderList();
    });
  });
  document.getElementById('filterUnread').addEventListener('click', (e) => {
    unreadOnly = !unreadOnly;
    e.currentTarget.classList.toggle('active', unreadOnly);
    renderList();
  });
  const searchInput = document.getElementById('readingSearchInput');
  searchInput.addEventListener('input', () => { query = searchInput.value.trim().toLowerCase(); renderList(); });

  // ---------- flashcards ----------

  const overlay = document.getElementById('flashOverlay');
  const frontEl = document.getElementById('flashFront');
  const backEl = document.getElementById('flashBack');
  const idxEl = document.getElementById('flashIndex');
  const scopeEl = document.getElementById('flashScope');
  const prevBtn = document.getElementById('flashPrev');
  const nextBtn = document.getElementById('flashNext');
  const cardEl = document.getElementById('flashCard');
  let deck = [], pos = 0;

  const TYPE_LABELS = { word: '词', phrase: '词组', sentence: '句子', grammar: '语法' };
  function front(n) {
    if (n.type === 'word') return String(n.lemma || n.title || n.slug);
    if (n.type === 'phrase') return String(n.phrase || n.title || n.slug);
    if (n.type === 'sentence') return String(n.sentence || n.title || n.slug).replace(/^🇸🇪\s*/, '');
    if (n.type === 'grammar') return String(n.name || n.title || n.slug);
    return n.title || n.slug;
  }
  function backHtml(n) {
    const out = [];
    if (n.zh) out.push(`<div class="flashAnswer">${escapeHtml(String(n.zh))}</div>`);
    const sub = [];
    if (n.en) sub.push(`🇬🇧 ${escapeHtml(String(n.en))}`);
    if (n.ordklass) sub.push(`<em>${escapeHtml(String(n.ordklass))}</em>`);
    if (sub.length) out.push(`<div class="flashSub">${sub.join(' · ')}</div>`);
    if (!n.zh && n.body) {
      const p = String(n.body).split(/\n\s*\n/).find((x) => !/^#/.test(x) && x.trim());
      if (p) out.push(`<div class="flashSub">${escapeHtml(p.trim().slice(0, 200))}</div>`);
    }
    if (!out.length) out.push('<div class="flashSub">(无翻译)</div>');
    return out.join('');
  }
  function renderCard() {
    if (!deck.length) { frontEl.textContent = '没有可复习的条目'; idxEl.textContent = '0 / 0'; return; }
    const n = deck[pos];
    frontEl.innerHTML = `<div class="flashType">${TYPE_LABELS[n.type] || n.type}</div>` +
      `<div class="flashTerm">${escapeHtml(front(n))}</div><div class="flashTip">点击/空格看翻译</div>`;
    backEl.innerHTML = `<div class="flashTerm">${escapeHtml(front(n))}</div>` + backHtml(n);
    frontEl.hidden = false; backEl.hidden = true;
    idxEl.textContent = `${pos + 1} / ${deck.length}`;
    prevBtn.disabled = pos === 0; nextBtn.disabled = pos === deck.length - 1;
  }
  function flip() { if (deck.length) { const f = frontEl.hidden; frontEl.hidden = !f; backEl.hidden = f; } }
  function openFlash(items, scope) {
    const d = (items || []).slice();
    if (d.length === 0) { return; }   // never open a blank 0/0 card
    deck = d; pos = 0; scopeEl.textContent = scope || '';
    overlay.hidden = false; renderCard(); cardEl.focus();
  }
  function closeFlash() { overlay.hidden = true; deck = []; }
  cardEl.addEventListener('click', flip);
  nextBtn.addEventListener('click', () => { if (pos < deck.length - 1) { pos++; renderCard(); } });
  prevBtn.addEventListener('click', () => { if (pos > 0) { pos--; renderCard(); } });
  document.getElementById('flashClose').addEventListener('click', closeFlash);
  document.getElementById('flashShuffle').addEventListener('click', () => {
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    pos = 0; renderCard();
  });
  document.addEventListener('keydown', (e) => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeFlash(); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (pos < deck.length - 1) { pos++; renderCard(); } }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (pos > 0) { pos--; renderCard(); } }
  });

  // ---------- init ----------

  renderList();
  if (articles.length > 0) openArticle(articles[0].slug);
})();

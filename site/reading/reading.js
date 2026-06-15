/* Läsning — reading UI. Reads window.READING_DATA (reading-data.js) for articles.
   Pure reading: list + search + 精读 (recall) mode + 已读 marker + 翻译显隐.
   (Vocabulary review lives in Dagbok 闪卡 and the /review workflow — not here.) */

(function () {
  'use strict';

  const data = window.READING_DATA;
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

  // ---------- reading pane ----------

  function openArticle(slug) {
    const a = articles.find((x) => x.slug === slug);
    if (!a) return;
    currentSlug = slug;
    listEl.querySelectorAll('.articleCard').forEach((c) => c.classList.toggle('active', c.dataset.slug === slug));

    const counts = a.counts || {};
    const countBits = [['words', '词'], ['phrases', '词组'], ['sentences', '句子'], ['grammar', '语法']]
      .filter(([k]) => counts[k]).map(([k, label]) => `${counts[k]} ${label}`);

    const read = isRead(slug);

    viewEl.innerHTML =
      `<div class="viewHead">` +
        `<span class="cardKind kind-${KIND_BADGE[a.kind] || 'other'}">${a.kindLabel ? a.kindLabel.zh : a.kind}</span>` +
        `<span class="cardStatus status-${a.status}">${a.statusLabel}</span>` +
        (a.cefr ? `<span class="viewCefr">${escapeHtml(a.cefr)}</span>` : '') +
        (a.date ? `<span class="viewDate">${escapeHtml(a.date)}</span>` : '') +
        `<span class="viewSpacer"></span>` +
        `<button type="button" id="markReadBtn" class="viewBtn${read ? ' on' : ''}">${read ? '✓ 已读' : '标为已读'}</button>` +
      `</div>` +
      (countBits.length ? `<p class="viewCounts">📚 ${countBits.join(' · ')}</p>` : '') +
      `<div class="articleBody${recall ? ' recall' : ''}">${mdToHtml(a.body || '')}</div>`;

    wireRevealClicks();
    document.getElementById('markReadBtn').addEventListener('click', () => {
      toggleRead(slug);
      openArticle(slug);   // re-render head + card state
      renderList();
    });

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

  // ---------- init ----------

  renderList();
  if (articles.length > 0) openArticle(articles[0].slug);
})();

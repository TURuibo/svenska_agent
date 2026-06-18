/* Läsning — reading UI. Reads window.READING_DATA (reading-data.js) for articles.
   Pure reading: list + search + 已读 marker.
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
  const mainEl = document.querySelector('.readingMain');
  const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
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
      `<a href="../sok/#note=${encodeURIComponent(slug)}" target="_blank" rel="noopener">${escapeHtml(label || slug)}</a>`);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return t;
  }
  // Tag blocks inside a 🇨🇳-translation zone with data-zh="1" so they render as a parallel layer.
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
      // GFM table: a header row `| a | b |` immediately followed by a separator row `|---|---|`.
      const isTableRow = (s) => /\|/.test(s) && /\S/.test(s);
      const isTableSep = (s) => /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(s);
      const splitRow = (s) => {
        let t = s.trim().replace(/^\|/, '').replace(/\|$/, '');
        return t.split('|').map((c) => c.trim());
      };
      if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        closeList();
        const head = splitRow(line);
        i += 2; // skip header + separator
        const rows = [];
        while (i < lines.length && isTableRow(lines[i]) && !isTableSep(lines[i])) {
          rows.push(splitRow(lines[i])); i += 1;
        }
        let html = `<table${z()}><thead><tr>` +
          head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead>';
        if (rows.length) {
          // data-label carries the column header onto each cell so a narrow screen
          // can restack the row into a labelled card (see .kind-adjsubst mobile CSS).
          html += '<tbody>' + rows.map((r) =>
            '<tr>' + head.map((h, ci) => `<td data-label="${escapeHtml(h)}">${inline(r[ci] || '')}</td>`).join('') + '</tr>'
          ).join('') + '</tbody>';
        }
        html += '</table>';
        out.push(html); continue;
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

  // Deep link from another page: #article=<slug>&from=<anchor>&frompage=<forms|recap>.
  // `from`/`frompage` let us offer a one-click jump back to where the reader came
  // from (词形表 Former, or 学习时间线 Dagbok). Defaults to forms for back-compat.
  function parseHash() {
    const p = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    return { article: p.get('article'), from: p.get('from'), frompage: p.get('frompage') };
  }
  const BACK_TARGETS = {
    forms: { href: '../forms/#', label: '← 返回词形表' },
    recap: { href: '../#', label: '← 返回 Dagbok' },
  };
  const _h = parseHash();
  const backAnchor = _h.from || '';
  const backTarget = BACK_TARGETS[_h.frompage] || BACK_TARGETS.forms;

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

    const backBtn = backAnchor
      ? `<a class="viewBtn backToForms" href="${backTarget.href}${encodeURIComponent(backAnchor)}" title="返回来源页对应位置">${backTarget.label}</a>`
      : '';

    viewEl.innerHTML =
      `<div class="viewHead">` +
        `<button type="button" id="mobileBackBtn" class="mobileBack viewBtn">← 列表</button>` +
        backBtn +
        `<span class="cardKind kind-${KIND_BADGE[a.kind] || 'other'}">${a.kindLabel ? a.kindLabel.zh : a.kind}</span>` +
        `<span class="cardStatus status-${a.status}">${a.statusLabel}</span>` +
        (a.cefr ? `<span class="viewCefr">${escapeHtml(a.cefr)}</span>` : '') +
        (a.date ? `<span class="viewDate">${escapeHtml(a.date)}</span>` : '') +
        `<span class="viewSpacer"></span>` +
        `<button type="button" id="markReadBtn" class="viewBtn${read ? ' on' : ''}">${read ? '✓ 已读' : '标为已读'}</button>` +
      `</div>` +
      (countBits.length ? `<p class="viewCounts">📚 ${countBits.join(' · ')}</p>` : '') +
      `<div class="articleBody kind-${a.kind}">${mdToHtml(a.body || '')}</div>`;

    document.getElementById('markReadBtn').addEventListener('click', () => {
      toggleRead(slug);
      openArticle(slug);   // re-render head + card state
      renderList();
    });
    document.getElementById('mobileBackBtn').addEventListener('click', backToList);

    // Mobile master-detail: hide the list, show the reading pane full-screen.
    mainEl.classList.add('viewing');
    viewEl.scrollTop = 0;
    if (isMobile()) window.scrollTo({ top: 0, behavior: 'auto' });
  }

  // Return from the reading pane to the article list (mobile only — desktop shows both).
  function backToList() {
    mainEl.classList.remove('viewing');
    if (isMobile()) window.scrollTo({ top: 0, behavior: 'auto' });
  }

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
  // A deep link (#article=…) opens that article directly on any device — the
  // reader followed an explicit link from Former, so honor it over the default.
  const deepSlug = parseHash().article;
  if (deepSlug && articles.some((a) => a.slug === deepSlug)) {
    openArticle(deepSlug);
  } else if (articles.length > 0 && !isMobile()) {
    // Desktop opens the first article straight away (the list stays visible alongside).
    // Mobile lands on the list so the user picks what to read — openArticle then takes
    // over the full screen via the master-detail `viewing` state.
    openArticle(articles[0].slug);
  }
})();

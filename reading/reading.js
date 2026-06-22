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

  // ---------- vocabulary glossary (clickable KB words in the Swedish text) ----------
  // reading-data.js carries a compact `vocab` list: every KB word note reduced to
  // its lemma + a few fields + inflected surface forms. We index those surfaces so
  // any Swedish word the learner already has a note for becomes a clickable chip
  // that opens an in-page glossary popover (no navigation, no 6MB kb-data.js load).

  const vocabList = Array.isArray(data.vocab) ? data.vocab : [];
  const vocabBySlug = new Map();
  const vocabIndex = new Map(); // surface form (lowercased) → vocab entry
  for (const v of vocabList) {
    vocabBySlug.set(v.slug, v);
    for (const form of v.forms || []) {
      const key = (form || '').toLowerCase();
      if (!key) continue;
      const existing = vocabIndex.get(key);
      // Prefer an entry whose lemma IS this surface — a lemma match beats an
      // inflected-form match when two words share a surface (e.g. var / vara).
      if (!existing) vocabIndex.set(key, v);
      else if (existing.lemma.toLowerCase() !== key && v.lemma.toLowerCase() === key) vocabIndex.set(key, v);
    }
  }

  const LS_VOCAB = 'lasning.vocab.v1';
  let vocabOn = (() => { try { return localStorage.getItem(LS_VOCAB) !== '0'; } catch (_e) { return true; } })();

  // 查词模式 (lookup mode): when on, every Swedish word with NO KB note becomes
  // tappable too — tapping opens a search over the in-memory `vocab` so the
  // learner can find the KB note this surface really belongs to and queue a
  // permanent link (written back via /link-forms). Default off so plain reading
  // stays uncluttered. The link queue (surface → KB slug) lives in localStorage.
  const LS_LOOKUP = 'lasning.lookupmode.v1';
  let lookupMode = (() => { try { return localStorage.getItem(LS_LOOKUP) === '1'; } catch (_e) { return false; } })();

  const LS_LINKQ = 'lasning.linkqueue.v1';
  function loadQueue() {
    try { const a = JSON.parse(localStorage.getItem(LS_LINKQ) || '[]'); return Array.isArray(a) ? a : []; }
    catch (_e) { return []; }
  }
  function saveQueue() { try { localStorage.setItem(LS_LINKQ, JSON.stringify(linkQueue)); } catch (_e) {} }
  let linkQueue = loadQueue();   // [{ surface, slug, lemma }]

  // Don't linkify inside links, code, headings, or the 🇨🇳-translation layer.
  const VOCAB_SKIP_TAGS = new Set(['A', 'CODE', 'PRE', 'SCRIPT', 'STYLE', 'BUTTON', 'H1', 'H2', 'H3', 'H4', 'TH']);
  function vocabSkip(node, root) {
    for (let el = node.parentNode; el && el !== root; el = el.parentNode) {
      if (el.nodeType !== 1) continue;
      if (VOCAB_SKIP_TAGS.has(el.tagName)) return true;
      if (el.getAttribute && el.getAttribute('data-zh') === '1') return true;
    }
    return false;
  }

  const VOCAB_TOKEN = /[A-Za-zÀ-ÿ]+/g;
  function wrapTextNode(node) {
    const text = node.nodeValue;
    VOCAB_TOKEN.lastIndex = 0;
    let m, last = 0, frag = null;
    while ((m = VOCAB_TOKEN.exec(text))) {
      const entry = vocabIndex.get(m[0].toLowerCase());
      if (!entry) continue;
      if (!frag) frag = document.createDocumentFragment();
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = document.createElement('span');
      span.className = 'vocabWord' + (entry.known ? ' known' : '');
      span.dataset.slug = entry.slug;
      span.textContent = m[0];
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (frag) {
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    }
  }

  function linkifyVocab(container) {
    if (!vocabIndex.size) return;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const targets = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || !/[A-Za-zÀ-ÿ]/.test(node.nodeValue)) continue;
      if (vocabSkip(node, container)) continue;
      targets.push(node);
    }
    targets.forEach(wrapTextNode);   // mutate after the walk so the walker isn't disturbed
  }

  // 查词模式: wrap every still-plain Swedish word as a .lookupWord so it can be
  // tapped to search the KB. Runs AFTER linkifyVocab, so KB words are already in
  // .vocabWord spans and the remaining text-node tokens are exactly the words
  // with no KB note (the "not in vocabIndex" guard is just belt-and-braces).
  function wrapLookupTextNode(node) {
    const text = node.nodeValue;
    VOCAB_TOKEN.lastIndex = 0;
    let m, last = 0, frag = null;
    while ((m = VOCAB_TOKEN.exec(text))) {
      if (vocabIndex.has(m[0].toLowerCase())) continue;
      if (!frag) frag = document.createDocumentFragment();
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = document.createElement('span');
      span.className = 'lookupWord';
      span.textContent = m[0];
      frag.appendChild(span);
      last = m.index + m[0].length;
    }
    if (frag) {
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(frag, node);
    }
  }
  function decorateLookup(container) {
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    const targets = [];
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || !/[A-Za-zÀ-ÿ]/.test(node.nodeValue)) continue;
      if (vocabSkip(node, container)) continue;
      const p = node.parentNode;
      if (p && p.classList && p.classList.contains('vocabWord')) continue;
      targets.push(node);
    }
    targets.forEach(wrapLookupTextNode);
  }
  function undecorateLookup(container) {
    container.querySelectorAll('.lookupWord').forEach((el) => {
      el.replaceWith(document.createTextNode(el.textContent));
    });
    container.normalize();
  }

  // ---- glossary popover (full note detail, rendered in-page) ----
  // Desktop: a card anchored next to the tapped word.
  // Mobile:  a bottom sheet with a dimmed backdrop, sticky header and scroll-lock.
  let popEl = null, backdropEl = null;
  function closePop() {
    if (backdropEl) { backdropEl.remove(); backdropEl = null; }
    if (popEl) { popEl.remove(); popEl = null; }
    document.body.classList.remove('vocabPopOpen');
  }
  function positionPop(pop) {
    // Mobile: a bottom sheet (CSS .sheet pins it to the bottom).
    // Desktop: a fixed side panel positioned entirely by CSS — we no longer chase
    // the tapped word (that used to push a tall card below the fold and force a
    // page-scroll to read it). The card now stays at a stable, always-visible spot.
    if (isMobile()) pop.classList.add('sheet');
  }

  // Mount an empty popover shell (desktop side panel / mobile bottom sheet),
  // wire its backdrop + scroll-lock, and return it. Callers fill .innerHTML.
  // Shared by the glossary card, the 查词 lookup card, and the 链接清单 panel.
  function mountPop(extraClass, onClick) {
    closePop();
    popEl = document.createElement('div');
    popEl.className = 'vocabPop' + (extraClass ? ' ' + extraClass : '');
    if (onClick) popEl.addEventListener('click', onClick);
    document.body.appendChild(popEl);
    positionPop(popEl);
    if (popEl.classList.contains('sheet')) {
      backdropEl = document.createElement('div');
      backdropEl.className = 'vocabBackdrop';
      backdropEl.addEventListener('click', closePop);
      document.body.insertBefore(backdropEl, popEl);
      document.body.classList.add('vocabPopOpen');
    }
    return popEl;
  }

  // Build the full detail card for one vocab entry: a sticky header (grip + close
  // + lemma + tags + gloss + form chips) followed by the note's whole markdown
  // body (Forms table, collocations, sentences, usage notes …) — same as Former.
  function popInnerHtml(entry) {
    const lemmaLc = entry.lemma.toLowerCase();
    const meta = [];
    if (entry.ordklass) meta.push(`<span class="vocabPopTag">${escapeHtml(entry.ordklass)}</span>`);
    if (entry.cefr) meta.push(`<span class="vocabPopCefr">${escapeHtml(entry.cefr)}</span>`);
    if (entry.known) meta.push(`<span class="vocabPopKnown">✓ 已掌握</span>`);
    if (entry.created) meta.push(`<span class="vocabPopDate">${escapeHtml(entry.created)}</span>`);
    const chips = (entry.forms || []).map((f) =>
      `<span class="vpForm${f.toLowerCase() === lemmaLc ? ' base' : ''}">${escapeHtml(f)}</span>`).join('');
    // Drop the leading "# lemma — ordklass" H1; the header above already shows it.
    const bodyMd = (entry.body || '').replace(/^#\s+.*(\r?\n)+/, '');
    return (
      `<div class="vocabPopHeader">` +
        `<span class="vocabPopGrip" aria-hidden="true"></span>` +
        `<button type="button" class="vocabPopClose" aria-label="关闭">×</button>` +
        `<div class="vocabPopHead">` +
          `<span class="vocabPopLemma">${escapeHtml(entry.lemma)}</span>` +
          (meta.length ? `<span class="vocabPopMeta">${meta.join('')}</span>` : '') +
        `</div>` +
        ((entry.zh || entry.en)
          ? `<div class="vocabPopGloss">🇨🇳 ${escapeHtml(entry.zh || '—')}　·　${escapeHtml(entry.en || '—')}</div>` : '') +
        (chips ? `<div class="vocabPopForms">${chips}</div>` : '') +
      `</div>` +
      (bodyMd ? `<div class="vocabPopBody">${mdToHtml(bodyMd)}</div>` : '') +
      `<a class="vocabPopLink" href="../sok/#note=${encodeURIComponent(entry.slug)}" target="_blank" rel="noopener">在 Sök 中打开完整笔记 →</a>`
    );
  }

  function showEntry(entry) {
    if (!popEl) return;
    popEl.innerHTML = popInnerHtml(entry);
    popEl.scrollTop = 0;
  }

  // Delegated handler for the glossary card: close button, plus in-card navigation
  // — a [[wikilink]] to another KB word opens that word's card in place instead of
  // jumping away to Sök.
  function entryPopClick(e) {
    if (e.target.closest('.vocabPopClose')) { closePop(); return; }
    // The explicit "在 Sök 中打开完整笔记 →" link must always navigate to Sök —
    // never treat it as in-card nav (its slug IS the current word, which is a
    // vocab entry, so the body-wikilink branch below would otherwise swallow it).
    if (e.target.closest('.vocabPopLink')) return;
    const a = e.target.closest('a');
    if (!a) return;
    const m = (a.getAttribute('href') || '').match(/#note=([^&]+)/);
    if (m) {
      const slug = decodeURIComponent(m[1]);
      if (vocabBySlug.has(slug)) { e.preventDefault(); showEntry(vocabBySlug.get(slug)); }
    }
  }

  function openPop(span) {
    const entry = vocabBySlug.get(span.dataset.slug);
    if (!entry) return;
    mountPop('', entryPopClick);
    showEntry(entry);
  }

  // ---- 查词 lookup card (find the KB note a non-linked surface belongs to) ----

  // Rank KB vocab entries against a query. Lets an inflected/definite surface
  // (e.g. "arbetet") surface its lemma ("arbete") via prefix/shared-prefix
  // matching, and lets the learner type the 中文/English meaning when the form
  // is irregular and shares little with the lemma.
  function searchVocab(raw) {
    const q = (raw || '').trim().toLowerCase();
    if (!q) return [];
    const hits = [];
    for (const v of vocabList) {
      const lemma = (v.lemma || '').toLowerCase();
      let score = 0;
      if (lemma === q) score = 100;
      else if (lemma.startsWith(q) || q.startsWith(lemma)) score = 80 - Math.abs(lemma.length - q.length);
      else if ((v.forms || []).some((f) => (f || '').toLowerCase() === q)) score = 75;
      else if (lemma.includes(q) || q.includes(lemma)) score = 55;
      else {
        let p = 0;
        while (p < lemma.length && p < q.length && lemma[p] === q[p]) p += 1;
        if (p >= 3) score = 20 + p;
      }
      if ((v.zh || '').toLowerCase().includes(q) || (v.en || '').toLowerCase().includes(q)) {
        score = Math.max(score, 45);
      }
      if (score > 0) hits.push({ v, score });
    }
    hits.sort((a, b) => b.score - a.score || a.v.lemma.localeCompare(b.v.lemma));
    return hits.slice(0, 30).map((h) => h.v);
  }

  function lookupResultRowHtml(v, surface) {
    const meta = [];
    if (v.ordklass) meta.push(escapeHtml(v.ordklass));
    if (v.cefr) meta.push(escapeHtml(v.cefr));
    if (v.known) meta.push('✓');
    const gloss = [v.zh, v.en].filter(Boolean).map(escapeHtml).join(' · ');
    const queued = linkQueue.some((q) => q.slug === v.slug && q.surface.toLowerCase() === surface.toLowerCase());
    return (
      `<div class="lookupResult">` +
        `<div class="lookupResultText">` +
          `<div class="lookupResultMain">` +
            `<span class="lookupResultLemma">${escapeHtml(v.lemma)}</span>` +
            (meta.length ? `<span class="lookupResultMeta">${meta.join(' · ')}</span>` : '') +
          `</div>` +
          (gloss ? `<div class="lookupResultGloss">🇨🇳 ${gloss}</div>` : '') +
        `</div>` +
        `<button type="button" class="lookupLinkBtn${queued ? ' queued' : ''}" data-slug="${escapeHtml(v.slug)}"${queued ? ' disabled' : ''}>` +
          (queued ? '✓ 已加入' : '🔗 链接') +
        `</button>` +
      `</div>`
    );
  }

  // Queue a surface → KB-word link, and give instant feedback: register the
  // surface in the live index and promote any visible occurrences into working
  // glossary chips right away (the permanent write happens later via /link-forms).
  function confirmLink(surface, v) {
    const key = surface.toLowerCase();
    if (!linkQueue.some((q) => q.slug === v.slug && q.surface.toLowerCase() === key)) {
      linkQueue.push({ surface, slug: v.slug, lemma: v.lemma });
      saveQueue();
      renderLinkBtn();
    }
    if (!vocabIndex.has(key)) vocabIndex.set(key, v);
    if (!(v.forms || []).some((f) => (f || '').toLowerCase() === key)) (v.forms = v.forms || []).push(surface);
    promoteLookupWords(key, v);
  }

  function promoteLookupWords(surfaceKey, entry) {
    const bodyEl = viewEl.querySelector('.articleBody');
    if (!bodyEl) return;
    bodyEl.querySelectorAll('.lookupWord').forEach((el) => {
      if ((el.textContent || '').toLowerCase() === surfaceKey) {
        el.className = 'vocabWord' + (entry.known ? ' known' : '');
        el.dataset.slug = entry.slug;
      }
    });
  }

  function openLookup(span) {
    const surface = (span.textContent || '').trim();
    mountPop('lookupPop', (e) => { if (e.target.closest('.vocabPopClose')) closePop(); });
    popEl.innerHTML =
      `<div class="vocabPopHeader lookupHead">` +
        `<span class="vocabPopGrip" aria-hidden="true"></span>` +
        `<button type="button" class="vocabPopClose" aria-label="关闭">×</button>` +
        `<div class="lookupTitle">🔍 在 KB 里查找 <b>${escapeHtml(surface)}</b></div>` +
        `<input type="search" class="lookupInput" autocomplete="off" placeholder="瑞典语 / 中文 / 英文…" />` +
        `<div class="lookupHint">找到正确的词 → 「🔗 链接」把 <b>${escapeHtml(surface)}</b> 永久接到它。没找到？说明 KB 里确实还没有。</div>` +
      `</div>` +
      `<div class="lookupResults"></div>`;
    const input = popEl.querySelector('.lookupInput');
    const resultsEl = popEl.querySelector('.lookupResults');
    function renderResults() {
      if (!input.value.trim()) { resultsEl.innerHTML = '<p class="lookupEmpty">输入要查找的词…</p>'; return; }
      const hits = searchVocab(input.value);
      if (!hits.length) { resultsEl.innerHTML = '<p class="lookupEmpty">KB 里没找到匹配 —— 这词可能确实还没入库。</p>'; return; }
      resultsEl.innerHTML = hits.map((v) => lookupResultRowHtml(v, surface)).join('');
    }
    input.value = surface;
    input.addEventListener('input', renderResults);
    resultsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.lookupLinkBtn');
      if (!btn || btn.disabled) return;
      const v = vocabBySlug.get(btn.dataset.slug);
      if (!v) return;
      confirmLink(surface, v);
      renderResults();
    });
    renderResults();
    setTimeout(() => { try { input.focus(); input.select(); } catch (_e) {} }, 50);
  }

  // Delegated: a tap on a KB word opens its glossary card (when 生词 is on); a tap
  // on a plain word opens the 查词 lookup card (when 查词模式 is on).
  viewEl.addEventListener('click', (e) => {
    const vw = e.target.closest('.vocabWord');
    if (vw && vocabOn) { e.preventDefault(); openPop(vw); return; }
    const lw = e.target.closest('.lookupWord');
    if (lw && lookupMode) { e.preventDefault(); openLookup(lw); }
  });
  document.addEventListener('click', (e) => {
    if (!popEl) return;
    if (e.target.closest('.vocabPop') || e.target.closest('.vocabWord') || e.target.closest('.lookupWord')) return;
    closePop();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });

  // ---------- list ----------

  const KIND_BADGE = { scenario: 'scenario', article: 'article', adjsubst: 'adjsubst', news: 'news', other: 'other' };
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

    // Turn KB words in the freshly rendered text into clickable glossary chips.
    // When 查词模式 is on, also make the remaining (non-KB) words tappable.
    closePop();
    const bodyEl = viewEl.querySelector('.articleBody');
    if (bodyEl) {
      linkifyVocab(bodyEl);
      if (lookupMode) decorateLookup(bodyEl);
    }
    viewEl.classList.toggle('vocab-off', !vocabOn);

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

  // 生词高亮 toggle — flips the styling/clickability of the glossary chips without
  // re-rendering the article. State persists in localStorage.
  const vocabBtn = document.getElementById('toggleVocab');
  vocabBtn.classList.toggle('active', vocabOn);
  vocabBtn.addEventListener('click', () => {
    vocabOn = !vocabOn;
    try { localStorage.setItem(LS_VOCAB, vocabOn ? '1' : '0'); } catch (_e) {}
    vocabBtn.classList.toggle('active', vocabOn);
    viewEl.classList.toggle('vocab-off', !vocabOn);
    if (!vocabOn) closePop();
  });

  // 查词模式 toggle — adds/removes the .lookupWord wrapping on the current article
  // in place (no re-render, scroll preserved), mirroring how 生词 flips its chips.
  const lookupBtn = document.getElementById('toggleLookup');
  if (lookupBtn) {
    lookupBtn.classList.toggle('active', lookupMode);
    lookupBtn.addEventListener('click', () => {
      lookupMode = !lookupMode;
      try { localStorage.setItem(LS_LOOKUP, lookupMode ? '1' : '0'); } catch (_e) {}
      lookupBtn.classList.toggle('active', lookupMode);
      const bodyEl = viewEl.querySelector('.articleBody');
      if (bodyEl) {
        if (lookupMode) decorateLookup(bodyEl);
        else { undecorateLookup(bodyEl); }
      }
      if (!lookupMode) closePop();
    });
  }

  // 链接清单 — the queued surface → KB-word links, with a ready-to-paste
  // /link-forms command for writing them back permanently.
  const linkBtn = document.getElementById('openLinkQueue');
  function renderLinkBtn() {
    if (!linkBtn) return;
    linkBtn.textContent = '🔗 链接清单' + (linkQueue.length ? ' (' + linkQueue.length + ')' : '');
    linkBtn.classList.toggle('active', linkQueue.length > 0);
  }
  function linkCommandText() {
    const bySlug = new Map();
    for (const q of linkQueue) {
      if (!bySlug.has(q.slug)) bySlug.set(q.slug, []);
      const arr = bySlug.get(q.slug);
      if (!arr.some((f) => f.toLowerCase() === q.surface.toLowerCase())) arr.push(q.surface);
    }
    const lines = ['/link-forms'];
    for (const [slug, forms] of bySlug) lines.push(`${slug}: ${forms.join(', ')}`);
    return lines.join('\n');
  }
  function renderQueuePanel() {
    if (!popEl) return;
    const header =
      `<div class="vocabPopHeader">` +
        `<span class="vocabPopGrip" aria-hidden="true"></span>` +
        `<button type="button" class="vocabPopClose" aria-label="关闭">×</button>` +
        `<div class="lookupTitle">🔗 待链接清单</div>` +
        `<div class="lookupHint">回 Claude Code 粘贴下面的命令跑 <code>/link-forms</code>，把这些形式永久写进词笔记；<code>/sync</code> 推送后阅读站全局生效。</div>` +
      `</div>`;
    if (!linkQueue.length) {
      popEl.innerHTML = header +
        `<div class="linkQueueBody"><p class="lookupEmpty">还没有待链接的词。开启 🔍 查词，点正文里没链接、但其实 KB 已有的词。</p></div>`;
      return;
    }
    const rows = linkQueue.map((q, i) =>
      `<div class="linkQueueRow">` +
        `<span class="lqSurface">${escapeHtml(q.surface)}</span>` +
        `<span class="lqArrow">→</span>` +
        `<span class="lqLemma">${escapeHtml(q.lemma)}</span>` +
        `<button type="button" class="linkQueueRemove" data-i="${i}" aria-label="移除">✕</button>` +
      `</div>`).join('');
    popEl.innerHTML = header +
      `<div class="linkQueueBody">` +
        rows +
        `<pre class="linkQueueCmd">${escapeHtml(linkCommandText())}</pre>` +
        `<div class="linkQueueActions">` +
          `<button type="button" class="viewBtn linkQueueCopy">📋 复制命令</button>` +
          `<button type="button" class="viewBtn linkQueueClear">清空</button>` +
        `</div>` +
      `</div>`;
  }
  function openLinkQueue() {
    mountPop('linkQueuePop', (e) => {
      if (e.target.closest('.vocabPopClose')) { closePop(); return; }
      const rm = e.target.closest('.linkQueueRemove');
      if (rm) {
        linkQueue.splice(Number(rm.dataset.i), 1);
        saveQueue(); renderLinkBtn(); renderQueuePanel();
        return;
      }
      if (e.target.closest('.linkQueueClear')) {
        linkQueue = []; saveQueue(); renderLinkBtn(); renderQueuePanel();
        return;
      }
      const copy = e.target.closest('.linkQueueCopy');
      if (copy) {
        const text = linkCommandText();
        const done = () => { copy.textContent = '✓ 已复制'; setTimeout(() => { if (copy.isConnected) copy.textContent = '📋 复制命令'; }, 1500); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
        else done();
      }
    });
    renderQueuePanel();
  }
  if (linkBtn) linkBtn.addEventListener('click', openLinkQueue);
  renderLinkBtn();

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

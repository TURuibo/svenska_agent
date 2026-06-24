/* Former — 词形变化 by 词性. Reads the shared KB (window.KB from kb-index.js +
   kb-store.js); note bodies for the detail popup load lazily via KB.body().
   One table per word class (ordklass): word | 词形 (forms) | 意思 (meaning), sorted by time. */

(function () {
  'use strict';

  const main = document.getElementById('formsMain');
  const KB = window.KB;
  const MD = window.KBMarkdown;
  if (!KB || !MD) {
    main.innerHTML =
      '<p class="formsEmpty">⚠️ 找不到 kb-index.js / kb-store.js — 请先运行 <code>node tools/build-kb-site.js</code>。</p>';
    return;
  }

  // All notes by slug (words + phrases/sentences/grammar/topics) — used by the
  // in-page detail popup so word + wikilink targets resolve without a page load.
  // Metadata is eager (kb-index.js); full note bodies load lazily via KB.body().
  const bySlug = KB.bySlug;

  // Display order + Chinese labels for the word classes.
  const CLASS_ORDER = [
    'substantiv', 'verb', 'adjektiv', 'adverb',
    'pronomen', 'preposition', 'konjunktion', 'satsadverbial', 'räkneord', 'interjektion',
  ];
  const CLASS_LABEL = {
    substantiv: '名词', verb: '动词', adjektiv: '形容词', adverb: '副词',
    pronomen: '代词', preposition: '介词', konjunktion: '连词',
    satsadverbial: '句副词', räkneord: '数词', interjektion: '感叹词', övrigt: '其他',
  };

  // Normalize "adjektiv/adverb", quotes, casing → a single primary class bucket.
  function normClass(raw) {
    if (!raw) return 'övrigt';
    let c = String(raw).toLowerCase().replace(/["']/g, '').trim();
    c = c.split(/[\/,]/)[0].trim();
    return CLASS_ORDER.includes(c) ? c : (c || 'övrigt');
  }

  function meaning(n) {
    const zh = (n.zh || '').toString().trim();
    const en = (n.en || '').toString().trim();
    if (zh && en) return { zh, en };
    return { zh: zh || en, en: zh ? en : '' };
  }

  const words = KB.notes
    .filter((n) => n.type === 'word')
    .map((n) => ({
      slug: n.slug,
      lemma: n.lemma || n.title || n.slug,
      cls: normClass(n.ordklass),
      ordklass: (n.ordklass || '').toString().replace(/["']/g, ''),
      forms: Array.isArray(n.forms) ? n.forms : [],
      created: (n.created || '').toString(),
      cefr: (n.cefr || '').toString(),
      ...meaning(n),
    }));

  // Group by class.
  const groups = new Map();
  for (const w of words) {
    if (!groups.has(w.cls)) groups.set(w.cls, []);
    groups.get(w.cls).push(w);
  }
  const orderedClasses = [
    ...CLASS_ORDER.filter((c) => groups.has(c)),
    ...[...groups.keys()].filter((c) => !CLASS_ORDER.includes(c)).sort(),
  ];

  // ---- source index (provenance: which 来源/source introduced each word) ----
  // Source notes list the slugs they introduced in `words:`. Invert that so each
  // word knows where it came from, and bucket sources by their date for the
  // by-date view. No build change needed — kb-index.js already carries it.
  const KIND_ICON = {
    article: '📄', text: '📝', dialog: '💬', conversation: '💬',
    story: '📖', narrative: '📖', image: '📷', photo: '📷',
    email: '✉️', sign: '🪧', exercise: '✏️', list: '🗂️',
  };
  function srcIcon(kind) { return KIND_ICON[String(kind || '').toLowerCase()] || '📥'; }
  function srcDate(s) { return (s.date || s.date_added || s.created || '').toString(); }
  function srcLabel(s) { return (s.source_label || s.title || s.slug || '').toString(); }

  const sources = KB.notes.filter((n) => n.type === 'source');
  const sourcesByDate = new Map(); // 'YYYY-MM-DD' -> [source...]
  const wordSource = new Map();    // word slug -> source note (first claimer wins)
  for (const s of sources) {
    const d = srcDate(s);
    if (d) {
      if (!sourcesByDate.has(d)) sourcesByDate.set(d, []);
      sourcesByDate.get(d).push(s);
    }
    if (Array.isArray(s.words)) {
      for (const slug of s.words) {
        if (!wordSource.has(slug)) wordSource.set(slug, s);
      }
    }
  }

  // ---- Läsning cross-link: map each 来源 to its readable article ----
  // The reading site (site/reading/) holds the human-readable version of each
  // generated scenario / drill / pasted text. A KB source note and its reading
  // article share a date and topic but not an exact slug
  // (source-2026-06-15-restaurang-allergi-nota ↔ scenario-…-pa-restaurang-allergi-och-nota),
  // so we match on same date + best topic-token overlap. Sources with no reading
  // article (news, dictionary lookups, older sources) simply get no link.
  const READING = (window.READING_DATA && Array.isArray(window.READING_DATA.articles))
    ? window.READING_DATA.articles : [];
  // Tokens that carry no topic meaning: structural words, file-kind prefixes, and
  // the date components (filtered separately as pure digits).
  const SLUG_STOP = new Set([
    'pa', 'och', 'en', 'ett', 'i', 'att', 'med', 'av', 'om', 'till', 'och', 'eller',
    'bojning', 'scenario', 'adjsubst', 'paste', 'source', 'other', 'text', 'story', 'dialog',
  ]);
  // Fold Swedish diacritics so a label ("hälsa", "födelsedag") matches an
  // ASCII-folded reading slug ("halsa", "fodelsedag").
  function fold(s) {
    return String(s || '').toLowerCase().replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o');
  }
  // Topic tokens from free text (slug, label or title): drop digits (dates),
  // 1-char fragments, and stopwords.
  function topicTokens(str) {
    return new Set(
      fold(str).split(/[^a-z0-9]+/)
        .filter((t) => t.length > 1 && !/^\d+$/.test(t) && !SLUG_STOP.has(t))
    );
  }
  function dateInSlug(slug) {
    const m = /(\d{4}-\d{2}-\d{2})/.exec(String(slug || ''));
    return m ? m[1] : '';
  }
  const readingByDate = new Map(); // 'YYYY-MM-DD' -> [article...]
  for (const a of READING) {
    const d = a.date || dateInSlug(a.slug);
    if (!d) continue;
    if (!readingByDate.has(d)) readingByDate.set(d, []);
    readingByDate.get(d).push(a);
  }
  // Resolve the reading article for a KB source note (or null). Matches on same
  // date + best topic-token overlap, drawing tokens from both the slug and the
  // human label/title so a topic word that lives only in the label still counts.
  function readingFor(src) {
    if (!src) return null;
    const d = srcDate(src) || dateInSlug(src.slug);
    const cands = readingByDate.get(d);
    if (!cands || !cands.length) return null;
    const want = topicTokens(`${src.slug} ${srcLabel(src)}`);
    let best = null;
    let bestScore = 0;
    for (const a of cands) {
      const have = topicTokens(`${a.slug} ${a.title || ''}`);
      let shared = 0;
      for (const t of want) if (have.has(t)) shared += 1;
      if (shared > bestScore) { bestScore = shared; best = a; }
    }
    return bestScore > 0 ? best : null;
  }
  // Deep link into Läsning, carrying a back-anchor to this forms date section.
  function readingHref(article, dateKey) {
    const from = dateKey ? `&from=${encodeURIComponent('date-' + dateKey)}` : '';
    return `../reading/#article=${encodeURIComponent(article.slug)}${from}`;
  }

  let sortMode = 'new';
  let groupMode = 'date';
  let query = '';

  // ---- date helpers (by-date view) ----
  const WD_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }
  const _today = new Date(); _today.setHours(0, 0, 0, 0);
  function relDate(key) {
    const d = parseISO(key);
    if (!d) return key;
    const diff = Math.round((_today - d) / 86400000);
    const wd = WD_CN[d.getDay()];
    if (diff === 0) return `今天 · ${wd}`;
    if (diff === 1) return `昨天 · ${wd}`;
    if (diff === 2) return `前天 · ${wd}`;
    return `${key} · ${wd}`;
  }

  function sortRows(rows) {
    const arr = rows.slice();
    if (sortMode === 'alpha') {
      arr.sort((a, b) => a.lemma.localeCompare(b.lemma, 'sv'));
    } else {
      // Sort by date, then by 来源 within a date so same-source rows stay
      // contiguous (their 来源/录入 cells then collapse into clean runs).
      arr.sort((a, b) => {
        const d = a.created.localeCompare(b.created);
        if (d !== 0) return sortMode === 'new' ? -d : d;
        const sa = (wordSource.get(a.slug) || {}).slug || '';
        const sb = (wordSource.get(b.slug) || {}).slug || '';
        const s = sa.localeCompare(sb);
        if (s !== 0) return s;
        return a.lemma.localeCompare(b.lemma, 'sv');
      });
    }
    return arr;
  }

  function matches(w) {
    if (!query) return true;
    const hay = `${w.lemma} ${w.forms.join(' ')} ${w.zh} ${w.en} ${w.ordklass}`.toLowerCase();
    return hay.includes(query);
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // Markdown → HTML for the in-page popup comes from the shared renderer
  // (../kb-markdown.js). Wikilinks resolve against the live KB.
  const mdToHtml = (md) => MD.mdToHtml(md, { hasSlug: (t) => bySlug.has(t) });

  // ---- in-page detail popup ----

  const overlay = document.createElement('div');
  overlay.className = 'fmOverlay';
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="fmCard" role="dialog" aria-modal="true" aria-labelledby="fmTitle">' +
    '<button type="button" class="fmClose" aria-label="关闭">×</button>' +
    '<div class="fmInner"></div></div>';
  document.body.appendChild(overlay);
  const fmInner = overlay.querySelector('.fmInner');
  let lastFocus = null;

  function detailHtml(note) {
    const lemma = note.lemma || note.title || note.slug;
    const zh = (note.zh || '').toString().trim();
    const en = (note.en || '').toString().trim();
    const gloss = [zh, en].filter(Boolean).join('  ·  ');
    const meta = [];
    const ok = (note.ordklass || '').toString().replace(/["']/g, '').trim();
    if (ok) meta.push(`<span class="fmTag">${esc(ok)}</span>`);
    if (note.cefr) meta.push(`<span class="fmTag cefr">${esc(note.cefr)}</span>`);
    if (note.known === true) meta.push('<span class="fmTag known">✅ 已掌握</span>');
    if (note.created) meta.push(`<span class="fmTag date">${esc(note.created)}</span>`);
    const forms = Array.isArray(note.forms) && note.forms.length
      ? `<div class="fmForms">${note.forms.map((f) => {
          const c = f.toLowerCase() === lemma.toLowerCase() ? 'formTag base' : 'formTag';
          return `<span class="${c}">${esc(f)}</span>`;
        }).join('')}</div>`
      : '';
    // For a 来源 note that has a readable Läsning article, offer a jump to read
    // the full original text (with 中文 translation) — and a back-anchor home.
    let readBlock = '';
    if (note.type === 'source') {
      const article = readingFor(note);
      if (article) {
        const href = readingHref(article, srcDate(note));
        readBlock = `<a class="fmReadLink" href="${href}">📖 阅读原文（Läsning，可看中文翻译）→</a>`;
      }
    }
    return (
      '<header class="fmHead">' +
      `<h2 id="fmTitle">${esc(lemma)}</h2>` +
      (gloss ? `<p class="fmGloss">${esc(gloss)}</p>` : '') +
      (meta.length ? `<div class="fmMeta">${meta.join('')}</div>` : '') +
      readBlock +
      forms +
      '</header>' +
      `<div class="fmDoc" id="fmDoc"><p class="fmLoading">läser…</p></div>`
    );
  }

  function openDetail(slug) {
    const note = bySlug.get(slug);
    if (!note) return;
    fmInner.innerHTML = detailHtml(note);
    overlay.querySelector('.fmCard').scrollTop = 0;
    if (overlay.hidden) {
      lastFocus = document.activeElement;
      overlay.hidden = false;
      document.body.classList.add('fmOpen');
    }
    overlay.querySelector('.fmClose').focus();
    // Body is not in the eager index — fetch it lazily. The placeholder element
    // is replaced; if the user opened another note meanwhile it is disconnected.
    const docEl = fmInner.querySelector('#fmDoc');
    KB.body(slug).then((data) => {
      if (!docEl || !docEl.isConnected) return;
      docEl.innerHTML = data ? mdToHtml(data.body || '') : '<p class="fmLoading">（找不到正文）</p>';
    });
  }

  function closeDetail() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.body.classList.remove('fmOpen');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.fmClose')) { closeDetail(); return; }
    const wiki = e.target.closest('[data-wikilink]');
    if (wiki && bySlug.has(wiki.dataset.wikilink)) openDetail(wiki.dataset.wikilink);
  });

  function renderFormsCell(w) {
    if (!w.forms.length) return '<span class="noForm">—（不变化）</span>';
    // Bold the lemma form so the base form stands out among the inflections.
    return w.forms
      .map((f) => {
        const cls = f.toLowerCase() === w.lemma.toLowerCase() ? 'formTag base' : 'formTag';
        return `<span class="${cls}">${esc(f)}</span>`;
      })
      .join('');
  }

  // A clickable 来源 chip for the by-class table; opens the source note popup.
  function srcChipHtml(w) {
    const s = wordSource.get(w.slug);
    if (!s) return '<span class="srcNone">—</span>';
    return `<button type="button" class="srcChip" data-slug="${esc(s.slug)}" title="${esc(srcLabel(s))}">` +
      `<span class="srcIco">${srcIcon(s.kind)}</span>` +
      `<span class="srcName">${esc(srcLabel(s))}</span></button>`;
  }

  function srcMetaHtml(s) {
    const bits = [];
    if (s.kind) bits.push(esc(String(s.kind)));
    if (s.cefr) bits.push(esc(String(s.cefr)));
    return bits.length ? `<span class="srcMeta">${bits.join(' · ')}</span>` : '';
  }

  function tableHead(showSource, showDate) {
    return '<thead><tr><th class="colWord">词 Ord</th>' +
      '<th class="colForms">词形 Former</th>' +
      '<th class="colMean">意思 Betydelse</th>' +
      (showSource ? '<th class="colSrc">来源 Källa</th>' : '') +
      (showDate ? '<th class="colDate">录入</th>' : '') +
      '</tr></thead>';
  }

  // srcRepeat/dateRepeat collapse runs of identical 来源/录入 values: the value
  // prints once at the top of a run, blank below — kills column repetition.
  function rowHtml(w, showSource, showDate, srcRepeat, dateRepeat) {
    const en = w.en ? `<span class="mEn">${esc(w.en)}</span>` : '';
    return '<tr>' +
      `<td class="colWord"><button type="button" class="lemmaLink" data-slug="${esc(w.slug)}">${esc(w.lemma)}</button>` +
      (w.cefr ? `<span class="cefr">${esc(w.cefr)}</span>` : '') + '</td>' +
      `<td class="colForms">${renderFormsCell(w)}</td>` +
      `<td class="colMean"><span class="mZh">${esc(w.zh)}</span>${en}</td>` +
      (showSource
        ? (srcRepeat ? '<td class="colSrc repeat"></td>' : `<td class="colSrc">${srcChipHtml(w)}</td>`)
        : '') +
      (showDate
        ? (dateRepeat ? '<td class="colDate repeat"></td>' : `<td class="colDate">${esc(w.created || '')}</td>`)
        : '') +
      '</tr>';
  }

  // ---- by word class (default) ----
  function renderByClass(parts) {
    let shownTotal = 0;
    for (const cls of orderedClasses) {
      const rows = sortRows(groups.get(cls).filter(matches));
      if (!rows.length) continue;
      shownTotal += rows.length;
      const label = CLASS_LABEL[cls] || '';
      parts.push(`<section class="classBlock" id="cls-${esc(cls)}">`);
      parts.push(
        `<h2 class="classTitle"><span class="sv">${esc(cls)}</span>` +
        (label ? `<span class="zh">${esc(label)}</span>` : '') +
        `<span class="classCount">${rows.length}</span></h2>`
      );
      parts.push(`<div class="tableWrap"><table class="formsTable">${tableHead(true, true)}<tbody>`);
      let prevSrc = null;
      let prevDate = null;
      for (const w of rows) {
        const sSlug = (wordSource.get(w.slug) || {}).slug || '';
        const date = w.created || '';
        parts.push(rowHtml(w, true, true, sSlug === prevSrc, date === prevDate));
        prevSrc = sSlug;
        prevDate = date;
      }
      parts.push('</tbody></table></div></section>');
    }
    return shownTotal;
  }

  // ---- by 录入 date → source batch (provenance view) ----
  function renderByDate(parts) {
    const byDate = new Map(); // 'YYYY-MM-DD' -> [word...]
    for (const w of words) {
      if (!matches(w)) continue;
      const d = w.created || '(无日期)';
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(w);
    }
    const dates = [...byDate.keys()].sort((a, b) => a.localeCompare(b));
    if (sortMode !== 'old') dates.reverse(); // newest first for 'new' & 'alpha'

    let shownTotal = 0;
    for (const dateKey of dates) {
      const dayWords = byDate.get(dateKey);
      shownTotal += dayWords.length;

      // claim words by the sources recorded on the same date (first source wins)
      const daySources = sourcesByDate.get(dateKey) || [];
      const claim = new Map();
      for (const s of daySources) {
        if (Array.isArray(s.words)) for (const slug of s.words) if (!claim.has(slug)) claim.set(slug, s);
      }
      const batches = new Map(); // src.slug -> { src, items }
      const loose = [];
      for (const w of dayWords) {
        const s = claim.get(w.slug);
        if (s) {
          if (!batches.has(s.slug)) batches.set(s.slug, { src: s, items: [] });
          batches.get(s.slug).items.push(w);
        } else {
          loose.push(w);
        }
      }

      parts.push(`<section class="dateBlock" id="date-${esc(dateKey)}">`);
      parts.push(
        `<h2 class="dateTitle"><span class="dRel">${esc(relDate(dateKey))}</span>` +
        `<span class="dateCount">${dayWords.length} 词</span></h2>`
      );

      const orderedBatches = daySources
        .filter((s) => batches.has(s.slug))
        .map((s) => batches.get(s.slug));
      for (const { src, items } of orderedBatches) {
        items.sort((a, b) => a.lemma.localeCompare(b.lemma, 'sv'));
        const article = readingFor(src);
        const readLink = article
          ? `<a class="srcReadLink" href="${readingHref(article, dateKey)}" title="在 Läsning 阅读原文（可看中文翻译）">📖 阅读原文</a>`
          : '';
        parts.push('<div class="srcBatch">');
        parts.push(
          '<div class="srcHead">' +
          `<button type="button" class="srcHeadBtn" data-slug="${esc(src.slug)}" title="查看来源笔记">` +
          `<span class="srcIco">${srcIcon(src.kind)}</span>` +
          `<span class="srcName">${esc(srcLabel(src))}</span></button>` +
          srcMetaHtml(src) +
          readLink +
          `<span class="srcCount">${items.length} 词</span>` +
          '</div>'
        );
        parts.push(`<div class="tableWrap"><table class="formsTable">${tableHead(false, false)}<tbody>`);
        for (const w of items) parts.push(rowHtml(w, false, false));
        parts.push('</tbody></table></div></div>');
      }

      if (loose.length) {
        loose.sort((a, b) => a.lemma.localeCompare(b.lemma, 'sv'));
        parts.push('<div class="srcBatch looseBatch">');
        parts.push(
          '<div class="srcHead">' +
          '<span class="srcHeadBtn static"><span class="srcIco">✍️</span>' +
          '<span class="srcName">单独录入 / 无来源</span></span>' +
          `<span class="srcCount">${loose.length} 词</span></div>`
        );
        parts.push(`<div class="tableWrap"><table class="formsTable">${tableHead(false, false)}<tbody>`);
        for (const w of loose) parts.push(rowHtml(w, false, false));
        parts.push('</tbody></table></div></div>');
      }
      parts.push('</section>');
    }
    return shownTotal;
  }

  function render() {
    const parts = [];
    const shown = groupMode === 'date' ? renderByDate(parts) : renderByClass(parts);
    if (!shown) {
      main.innerHTML = '<p class="formsEmpty">没有匹配的词。</p>';
      return;
    }
    main.innerHTML = parts.join('');
  }

  function renderNav() {
    const nav = document.getElementById('classFilters');
    if (groupMode === 'date') {
      const counts = new Map();
      for (const w of words) {
        const d = w.created || '(无日期)';
        counts.set(d, (counts.get(d) || 0) + 1);
      }
      const dates = [...counts.keys()].sort((a, b) => b.localeCompare(a));
      nav.innerHTML = dates.map((d) => {
        const rel = relDate(d).split(' · ')[0];
        const short = /^\d{4}-/.test(d) ? d.slice(5) : d;
        return `<a class="classChip" href="#date-${esc(d)}">${esc(rel)} ${esc(short)}<span>${counts.get(d)}</span></a>`;
      }).join('');
    } else {
      nav.innerHTML = orderedClasses.map((cls) => {
        const n = groups.get(cls).length;
        const label = CLASS_LABEL[cls] || '';
        return `<a class="classChip" href="#cls-${esc(cls)}">${esc(cls)}` +
          (label ? ` ${esc(label)}` : '') + `<span>${n}</span></a>`;
      }).join('');
    }
  }

  // Wire controls.
  document.getElementById('formsSearch').addEventListener('input', (e) => {
    query = e.target.value.trim().toLowerCase();
    render();
  });
  document.querySelectorAll('.sortBtn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sortBtn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      sortMode = btn.dataset.sort;
      render();
    });
  });
  document.querySelectorAll('.groupBtn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('active')) return;
      document.querySelectorAll('.groupBtn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      groupMode = btn.dataset.group;
      renderNav();
      render();
    });
  });
  // Click a word (or a 来源 chip) → open the in-page detail popup.
  main.addEventListener('click', (e) => {
    const src = e.target.closest('.srcChip, .srcHeadBtn');
    if (src && src.dataset.slug) { openDetail(src.dataset.slug); return; }
    const btn = e.target.closest('.lemmaLink');
    if (!btn) return;
    openDetail(btn.dataset.slug);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) {
      e.preventDefault();
      closeDetail();
      return;
    }
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      document.getElementById('formsSearch').focus();
    }
  });

  // 筛选 toggle: reveal/collapse the secondary controls (sort/group on phones)
  // and the jump-chip rail. Collapsed by default so the header stays short.
  const header = document.querySelector('.formsHeader');
  const chipToggle = document.getElementById('chipToggle');
  if (chipToggle && header) {
    chipToggle.addEventListener('click', () => {
      const open = header.classList.toggle('filtersOpen');
      chipToggle.setAttribute('aria-expanded', String(open));
      chipToggle.textContent = open ? '筛选 ▴' : '筛选 ▾';
      if (open) header.classList.remove('headerHidden');
    });
  }

  // Auto-hide the sticky header while scrolling DOWN (reading), reveal on any
  // upward flick or near the top — phones only. Frees the whole viewport for
  // words mid-read; controls stay one flick away. Paused while filters are open.
  if (header) {
    const mq = window.matchMedia('(max-width: 760px)');
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      ticking = false;
      if (!mq.matches || header.classList.contains('filtersOpen')) {
        header.classList.remove('headerHidden');
        lastY = window.scrollY;
        return;
      }
      const y = window.scrollY;
      const dy = y - lastY;
      if (y < 8 || dy < -6) header.classList.remove('headerHidden');
      else if (dy > 6) header.classList.add('headerHidden');
      lastY = y;
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { window.requestAnimationFrame(onScroll); ticking = true; }
    }, { passive: true });
  }

  const updated = document.getElementById('formsUpdated');
  if (updated) {
    updated.textContent =
      `${words.length} 词 · ${orderedClasses.length} 词性 · 数据 ${KB.generatedAt || ''}`;
  }

  // The page renders async, so an anchor in the URL (e.g. arriving back from
  // Läsning at #date-2026-06-17) won't have scrolled. Do it after render, and
  // briefly highlight the target section.
  function scrollToHash() {
    const id = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('hashFlash');
    setTimeout(() => el.classList.remove('hashFlash'), 1400);
  }

  renderNav();
  render();
  scrollToHash();
})();

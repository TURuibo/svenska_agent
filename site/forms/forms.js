/* Former — 词形变化 by 词性. Reads window.KB_DATA from ../kb-data.js.
   One table per word class (ordklass): word | 词形 (forms) | 意思 (meaning), sorted by time. */

(function () {
  'use strict';

  const main = document.getElementById('formsMain');
  const data = window.KB_DATA;
  if (!data || !Array.isArray(data.notes)) {
    main.innerHTML =
      '<p class="formsEmpty">⚠️ 找不到 kb-data.js — 请先运行 <code>node tools/build-kb-site.js</code>。</p>';
    return;
  }

  // All notes by slug (words + phrases/sentences/grammar/topics) — used by the
  // in-page detail popup so word + wikilink targets resolve without a page load.
  const bySlug = new Map(data.notes.map((n) => [n.slug, n]));

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

  const words = data.notes
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

  let sortMode = 'new';
  let query = '';

  function sortRows(rows) {
    const arr = rows.slice();
    if (sortMode === 'alpha') {
      arr.sort((a, b) => a.lemma.localeCompare(b.lemma, 'sv'));
    } else {
      arr.sort((a, b) => {
        const d = a.created.localeCompare(b.created);
        if (d !== 0) return sortMode === 'new' ? -d : d;
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

  // ---- compact markdown renderer (subset ported from ../app.js) ----
  // Renders a note body for the in-page popup: headings, lists, tables,
  // code fences, blockquotes, hr, and inline (code/links/bold/italic/wikilinks).

  function inlineMd(value) {
    let html = esc(value);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\[([^\]]+)\]\((https?:[^\s)]+)\)/g, (_m, text, url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
    html = html.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
    // wikilinks [[target|label]] → clickable if the target exists in the KB
    html = html.replace(/\[\[([^\]]+)\]\]/g, (_m, raw) => {
      const target = raw.split('|')[0].trim();
      const label = raw.includes('|') ? raw.split('|').slice(1).join('|').trim() : target;
      const exists = bySlug.has(target);
      const cls = exists ? 'wikiLink' : 'wikiLink missingLink';
      return `<button type="button" class="${cls}" data-wikilink="${esc(target)}">${esc(label)}</button>`;
    });
    return html;
  }

  function isListLine(line) { return /^[ \t]*([-*+]|\d+\.)\s+/.test(line); }
  function listIndent(line) { return /^([ \t]*)/.exec(line)[1].replace(/\t/g, '  ').length; }

  function renderList(lines, start, baseIndent) {
    const first = /^[ \t]*([-*+]|\d+\.)\s+/.exec(lines[start]);
    const tag = /\d+\./.test(first[1]) ? 'ol' : 'ul';
    const items = [];
    let i = start;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) break;
      if (!isListLine(line) || listIndent(line) < baseIndent) break;
      const m = /^[ \t]*(?:[-*+]|\d+\.)\s+(.*)$/.exec(line);
      let content = inlineMd(m[1]);
      i += 1;
      if (i < lines.length && lines[i].trim() && isListLine(lines[i]) && listIndent(lines[i]) > baseIndent) {
        const nested = renderList(lines, i, listIndent(lines[i]));
        content += nested.html;
        i = nested.nextIndex;
      }
      items.push(`<li>${content}</li>`);
    }
    return { html: `<${tag}>${items.join('')}</${tag}>`, nextIndex: i };
  }

  function renderTable(lines, start) {
    const rows = [];
    let i = start;
    while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) { rows.push(lines[i].trim()); i += 1; }
    const body = rows.filter((r) => !/^\|\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|$/.test(r));
    const htmlRows = body.map((row, idx) => {
      const cells = row.slice(1, -1).split('|').map((c) => inlineMd(c.trim()));
      const tg = idx === 0 ? 'th' : 'td';
      return `<tr>${cells.map((c) => `<${tg}>${c}</${tg}>`).join('')}</tr>`;
    });
    return { html: `<table>${htmlRows.join('')}</table>`, nextIndex: i };
  }

  function mdToHtml(markdown) {
    const lines = String(markdown || '').split(/\r?\n/);
    const blocks = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i += 1; continue; }

      const fence = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        const marker = fence[2][0];
        const closeRe = new RegExp(`^\\s*\\${marker}{${fence[2].length},}\\s*$`);
        const buf = [];
        i += 1;
        while (i < lines.length && !closeRe.test(lines[i])) { buf.push(lines[i]); i += 1; }
        if (i < lines.length) i += 1;
        blocks.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }
      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) {
        const lvl = heading[1].length;
        blocks.push(`<h${lvl}>${inlineMd(heading[2])}</h${lvl}>`);
        i += 1;
        continue;
      }
      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { blocks.push('<hr>'); i += 1; continue; }
      if (/^\s*\|.+\|\s*$/.test(line)) {
        const t = renderTable(lines, i);
        blocks.push(t.html);
        i = t.nextIndex;
        continue;
      }
      if (/^\s*>\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i += 1; }
        blocks.push(`<blockquote>${mdToHtml(buf.join('\n'))}</blockquote>`);
        continue;
      }
      if (isListLine(line)) {
        const list = renderList(lines, i, listIndent(line));
        blocks.push(list.html);
        i = list.nextIndex;
        continue;
      }
      const para = [];
      while (
        i < lines.length && lines[i].trim() &&
        !/^(\s*)(`{3,}|~{3,})/.test(lines[i]) && !/^#{1,6}\s+/.test(lines[i]) &&
        !/^\s*\|.+\|\s*$/.test(lines[i]) && !/^\s*>\s?/.test(lines[i]) &&
        !isListLine(lines[i]) && !/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(lines[i])
      ) { para.push(lines[i].trim()); i += 1; }
      if (para.length) blocks.push(`<p>${inlineMd(para.join(' '))}</p>`);
    }
    return blocks.join('');
  }

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
    return (
      '<header class="fmHead">' +
      `<h2 id="fmTitle">${esc(lemma)}</h2>` +
      (gloss ? `<p class="fmGloss">${esc(gloss)}</p>` : '') +
      (meta.length ? `<div class="fmMeta">${meta.join('')}</div>` : '') +
      forms +
      '</header>' +
      `<div class="fmDoc">${mdToHtml(note.body || '')}</div>`
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

  function render() {
    const parts = [];
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
      parts.push('<div class="tableWrap"><table class="formsTable">');
      parts.push(
        '<thead><tr><th class="colWord">词 Ord</th>' +
        '<th class="colForms">词形 Former</th>' +
        '<th class="colMean">意思 Betydelse</th>' +
        '<th class="colDate">录入</th></tr></thead><tbody>'
      );
      for (const w of rows) {
        const en = w.en ? `<span class="mEn">${esc(w.en)}</span>` : '';
        parts.push(
          '<tr>' +
          `<td class="colWord"><button type="button" class="lemmaLink" data-slug="${esc(w.slug)}">${esc(w.lemma)}</button>` +
          (w.cefr ? `<span class="cefr">${esc(w.cefr)}</span>` : '') + '</td>' +
          `<td class="colForms">${renderFormsCell(w)}</td>` +
          `<td class="colMean"><span class="mZh">${esc(w.zh)}</span>${en}</td>` +
          `<td class="colDate">${esc(w.created || '')}</td>` +
          '</tr>'
        );
      }
      parts.push('</tbody></table></div></section>');
    }

    if (!shownTotal) {
      main.innerHTML = '<p class="formsEmpty">没有匹配的词。</p>';
      return;
    }
    main.innerHTML = parts.join('');
  }

  function renderClassFilters() {
    const nav = document.getElementById('classFilters');
    const chips = orderedClasses.map((cls) => {
      const n = groups.get(cls).length;
      const label = CLASS_LABEL[cls] || '';
      return `<a class="classChip" href="#cls-${esc(cls)}">${esc(cls)}` +
        (label ? ` ${esc(label)}` : '') + `<span>${n}</span></a>`;
    });
    nav.innerHTML = chips.join('');
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
  // Click a word → open the in-page detail popup instead of leaving the page.
  main.addEventListener('click', (e) => {
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

  const chipToggle = document.getElementById('chipToggle');
  if (chipToggle) {
    chipToggle.addEventListener('click', () => {
      document.getElementById('classFilters').classList.toggle('hidden');
    });
  }

  const updated = document.getElementById('formsUpdated');
  if (updated) {
    updated.textContent =
      `${words.length} 词 · ${orderedClasses.length} 词性 · 数据 ${data.generatedAt || ''}`;
  }

  renderClassFilters();
  render();
})();

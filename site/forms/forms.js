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

  function lemmaHref(slug) {
    return `../#${encodeURIComponent(slug)}`;
  }

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
          `<td class="colWord"><a href="${lemmaHref(w.slug)}">${esc(w.lemma)}</a>` +
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
  document.addEventListener('keydown', (e) => {
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

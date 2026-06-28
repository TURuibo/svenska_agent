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
  // Shared KB store (kb-index.js + kb-store.js) + markdown renderer (kb-markdown.js).
  // Vocab metadata stays in reading-data.js (to detect clickable words); the full
  // note body for the glossary popover now loads lazily from the shared bodies,
  // so reading-data.js no longer ships ~1 MB of duplicated word bodies.
  const KB = window.KB;
  const MD = window.KBMarkdown;
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
  // that opens an in-page glossary popover (no navigation; the body loads lazily
  // from the shared kb-bodies.js via window.KB, not a multi-MB eager blob).

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

  // ---- learning-item → KB note resolution -------------------------------
  // The 学习项 panel (词/词组/句子/语法 below the article) wants the same
  // click-to-open-full-note behaviour as Dagbok. Each export item only carries
  // text, not a slug, so we match its Swedish text against the loaded KB index
  // (KB.notes) by type to recover the slug, then open KB.openNote(slug) — the
  // shared full-note card. Words go through the richer vocab glossary card.
  const normItem = (s) => String(s || '')
    .toLowerCase()
    .replace(/^🇸🇪\s*/, '')
    .replace(/[.,!?;:…"'“”，。！？；：]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const noteByPhrase = new Map();
  const noteBySentence = new Map();
  const noteByGrammar = new Map();
  if (KB && Array.isArray(KB.notes)) {
    const add = (map, key, slug) => { const k = normItem(key); if (k && !map.has(k)) map.set(k, slug); };
    for (const n of KB.notes) {
      if (n.type === 'phrase') { add(noteByPhrase, n.phrase, n.slug); add(noteByPhrase, n.title, n.slug); }
      else if (n.type === 'sentence') { add(noteBySentence, n.sentence, n.slug); add(noteBySentence, n.title, n.slug); }
      else if (n.type === 'grammar') { add(noteByGrammar, n.name, n.slug); add(noteByGrammar, n.title, n.slug); }
    }
  }
  // Resolve an item to something openable: a vocab glossary entry (words) or a
  // KB note slug (phrases/sentences/grammar). Returns null when the KB has no
  // matching note yet (then the chip renders as plain, non-clickable text).
  function resolveItem(kind, sv) {
    if (kind === 'word') {
      const e = vocabIndex.get(String(sv || '').toLowerCase());
      return e ? { word: e } : null;
    }
    const key = normItem(sv);
    if (kind === 'phrase') return noteByPhrase.has(key) ? { slug: noteByPhrase.get(key) } : null;
    if (kind === 'sentence') return noteBySentence.has(key) ? { slug: noteBySentence.get(key) } : null;
    if (kind === 'grammar') {
      if (noteByGrammar.has(key)) return { slug: noteByGrammar.get(key) };
      // Grammar names often trail a parenthetical example, e.g.
      // "ordningstal i datum (den första juli)" — retry without it.
      const bare = normItem(String(sv || '').replace(/\([^)]*\)/g, ''));
      return noteByGrammar.has(bare) ? { slug: noteByGrammar.get(bare) } : null;
    }
    return null;
  }

  const LS_VOCAB = 'lasning.vocab.v1';
  let vocabOn = (() => { try { return localStorage.getItem(LS_VOCAB) !== '0'; } catch (_e) { return true; } })();

  // 查词模式 (lookup mode): when on, every Swedish word with NO KB note becomes
  // tappable too — tapping opens a read-only search over the in-memory `vocab`
  // so the learner can see whether the KB already has the word. If it doesn't,
  // the card offers 想学 (queue it for /learn). Default off so plain reading
  // stays uncluttered.
  const LS_LOOKUP = 'lasning.lookupmode.v1';
  let lookupMode = (() => { try { return localStorage.getItem(LS_LOOKUP) === '1'; } catch (_e) { return false; } })();

  // 想学清单 (learn queue): words the learner searched for but the KB does NOT
  // have yet. A static page can't run the swedish-dictionary skill or hit the
  // web, so it just accumulates the words and hands back a ready-to-paste
  // `/learn …` command. Paste it into Claude Code; CC does the real lookup and
  // stores the note, so on the next build the word shows up here as a normal KB
  // word. This is the "let CC search for me" bridge for words the KB lacks.
  const LS_LEARNQ = 'lasning.learnqueue.v1';
  function loadLearnQueue() {
    try { const a = JSON.parse(localStorage.getItem(LS_LEARNQ) || '[]'); return Array.isArray(a) ? a : []; }
    catch (_e) { return []; }
  }
  function saveLearnQueue() { try { localStorage.setItem(LS_LEARNQ, JSON.stringify(learnQueue)); } catch (_e) {} }
  let learnQueue = loadLearnQueue();   // [surface, …]

  function addLearn(word) {
    const w = (word || '').trim();
    if (!w) return;
    if (!learnQueue.some((x) => x.toLowerCase() === w.toLowerCase())) {
      learnQueue.push(w);
      saveLearnQueue();
      renderLearnBtn();
    }
  }
  function learnCommandText() { return '/learn ' + learnQueue.join(', '); }

  // Shared clipboard copy with the standard "✓ 已复制" button feedback.
  function copyToClipboard(text, btn, restoreLabel) {
    const done = () => {
      if (!btn) return;
      btn.textContent = '✓ 已复制';
      setTimeout(() => { if (btn.isConnected) btn.textContent = restoreLabel; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
    else done();
  }

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
  // Shared by the glossary card, the 查词 lookup card, and the 想学 panel.
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
    // The body is no longer carried per-vocab; it loads lazily in showEntry().
    return (
      `<div class="vocabPopHeader">` +
        `<span class="vocabPopGrip" aria-hidden="true"></span>` +
        `<button type="button" class="vocabPopClose" aria-label="关闭">×</button>` +
        `<div class="vocabPopHead">` +
          `<span class="vocabPopLemma">${escapeHtml(entry.lemma)}</span>` +
          (window.SvSpeak && window.SvSpeak.supported ? window.SvSpeak.buttonHtml(entry.lemma, 'vocabPopSpeak') : '') +
          (meta.length ? `<span class="vocabPopMeta">${meta.join('')}</span>` : '') +
        `</div>` +
        ((entry.zh || entry.en)
          ? `<div class="vocabPopGloss">🇨🇳 ${escapeHtml(entry.zh || '—')}　·　${escapeHtml(entry.en || '—')}</div>` : '') +
        (chips ? `<div class="vocabPopForms">${chips}</div>` : '') +
      `</div>` +
      `<div class="vocabPopBody"><p class="vocabPopLoading">läser…</p></div>` +
      `<a class="vocabPopLink" href="../sok/#note=${encodeURIComponent(entry.slug)}" target="_blank" rel="noopener">在 Sök 中打开完整笔记 →</a>`
    );
  }

  function showEntry(entry) {
    if (!popEl) return;
    popEl.innerHTML = popInnerHtml(entry);
    popEl.scrollTop = 0;
    const bodyEl = popEl.querySelector('.vocabPopBody');
    if (!bodyEl) return;
    if (!KB || !MD) {
      bodyEl.innerHTML = `<p class="vocabPopLoading"><a href="../sok/#note=${encodeURIComponent(entry.slug)}" target="_blank" rel="noopener">在 Sök 打开完整笔记 →</a></p>`;
      return;
    }
    // Lazy body fetch from the shared store; drop the redundant leading "# lemma" H1.
    KB.body(entry.slug).then((d) => {
      if (!bodyEl.isConnected) return; // popover closed or another word opened
      if (!d) { bodyEl.innerHTML = ''; return; }
      const md = String(d.body || '').replace(/^#\s+.*(\r?\n)+/, '');
      bodyEl.innerHTML = MD.mdToHtml(md, { hasSlug: (t) => KB.bySlug.has(t) });
    });
  }

  // Delegated handler for the glossary card: close button, plus in-card navigation
  // — a [[wikilink]] to another KB word opens that word's card in place instead of
  // jumping away to Sök.
  function entryPopClick(e) {
    if (e.target.closest('.vocabPopClose')) { closePop(); return; }
    // The explicit "在 Sök 中打开完整笔记 →" link must always navigate to Sök —
    // never treat it as in-card nav (its slug IS the current word).
    if (e.target.closest('.vocabPopLink')) return;
    // Shared markdown renders [[wikilinks]] as data-wikilink buttons. A linked KB
    // word opens its card in place; a non-word target (phrase/sentence) falls back
    // to the shared centered popover.
    const wl = e.target.closest('[data-wikilink]');
    if (wl) {
      const slug = wl.dataset.wikilink;
      e.preventDefault();
      if (vocabBySlug.has(slug)) showEntry(vocabBySlug.get(slug));
      else if (KB) KB.openNote(slug);
      return;
    }
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

  // Read-only KB hit: shows whether (something like) this word is already in the
  // KB and its gloss. No action button — if it's not the right word, the learner
  // queues it for /learn via the 想学 footer below.
  function lookupResultRowHtml(v) {
    const meta = [];
    if (v.ordklass) meta.push(escapeHtml(v.ordklass));
    if (v.cefr) meta.push(escapeHtml(v.cefr));
    if (v.known) meta.push('✓');
    const gloss = [v.zh, v.en].filter(Boolean).map(escapeHtml).join(' · ');
    return (
      `<div class="lookupResult">` +
        `<div class="lookupResultText">` +
          `<div class="lookupResultMain">` +
            `<span class="lookupResultLemma">${escapeHtml(v.lemma)}</span>` +
            (window.SvSpeak && window.SvSpeak.supported ? window.SvSpeak.buttonHtml(v.lemma) : '') +
            (meta.length ? `<span class="lookupResultMeta">${meta.join(' · ')}</span>` : '') +
          `</div>` +
          (gloss ? `<div class="lookupResultGloss">🇨🇳 ${gloss}</div>` : '') +
        `</div>` +
      `</div>`
    );
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
        `<div class="lookupHint">看看 KB 里有没有这个词。没有的话 → 「➕ 想学」加进清单，回 Claude Code 跑 <code>/learn</code> 查词入库。</div>` +
      `</div>` +
      `<div class="lookupResults"></div>`;
    const input = popEl.querySelector('.lookupInput');
    const resultsEl = popEl.querySelector('.lookupResults');
    // Footer shown in the lookup card: when the KB has no note for this word,
    // queue it for /learn (or copy a one-off command) so Claude Code can do the
    // real lookup. Always offered as a fallback even when fuzzy hits appear, in
    // case none of them is the right lemma.
    function learnFooterHtml(note) {
      const queued = learnQueue.some((w) => w.toLowerCase() === surface.toLowerCase());
      return (
        `<div class="learnFooter">` +
          (note ? `<p class="lookupEmpty">${note}</p>` : '') +
          `<div class="learnActions">` +
            `<button type="button" class="viewBtn learnAddBtn${queued ? ' queued' : ''}"${queued ? ' disabled' : ''}>` +
              (queued ? '✓ 已加入想学' : `➕ 想学 «${escapeHtml(surface)}»`) +
            `</button>` +
            `<button type="button" class="viewBtn learnCopyBtn">📋 复制 /learn</button>` +
          `</div>` +
        `</div>`
      );
    }
    function renderResults() {
      if (!input.value.trim()) { resultsEl.innerHTML = '<p class="lookupEmpty">输入要查找的词…</p>'; return; }
      const hits = searchVocab(input.value);
      if (!hits.length) {
        resultsEl.innerHTML = learnFooterHtml('KB 里没找到匹配 —— 这词可能还没入库。让 Claude Code 查它：');
        return;
      }
      resultsEl.innerHTML =
        hits.map((v) => lookupResultRowHtml(v)).join('') +
        learnFooterHtml('都不对？这词 KB 可能还没有：');
    }
    input.value = surface;
    input.addEventListener('input', renderResults);
    resultsEl.addEventListener('click', (e) => {
      if (e.target.closest('.learnAddBtn')) { addLearn(surface); renderResults(); return; }
      const copy = e.target.closest('.learnCopyBtn');
      if (copy) copyToClipboard('/learn ' + surface, copy, '📋 复制 /learn');
    });
    renderResults();
    setTimeout(() => { try { input.focus(); input.select(); } catch (_e) {} }, 50);
  }

  // Delegated: a tap on a KB word opens its glossary card (when 生词 is on); a tap
  // on a plain word opens the 查词 lookup card (when 查词模式 is on).
  viewEl.addEventListener('click', (e) => {
    // 学习项 chip / sentence → open its full KB note (Dagbok-style detail).
    const item = e.target.closest('.itemClickable');
    if (item) {
      e.preventDefault();
      e.stopPropagation();   // don't let the document "click outside" handler close the card we're opening
      const slug = item.dataset.itemSlug;
      if (item.dataset.itemKind === 'word' && vocabBySlug.has(slug)) {
        mountPop('', entryPopClick);
        showEntry(vocabBySlug.get(slug));
      } else if (KB) {
        KB.openNote(slug);
      }
      return;
    }
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

  // Extract just the Swedish prose from a rendered article body, as an ordered
  // list of sentences, for whole-article read-aloud. We skip the 🇨🇳 translation
  // and 教学备注 sections (everything from the first such heading onward) and the
  // heading labels themselves, so the sv-SE voice only reads actual Swedish text.
  const HAS_CJK = /[㐀-鿿]/;   // any Chinese char ⇒ it's a translation/note, not Swedish
  function articleSpeechParts(bodyEl) {
    const parts = [];
    const pushText = (raw) => {
      let t = (raw || '').replace(/\s+/g, ' ').trim();
      if (!t || HAS_CJK.test(t)) return;        // skip 🇨🇳 translation / mixed lines
      t = t.replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '').trim();   // strip 🇸🇪 / 🇨🇳 flag markers
      t = t.replace(/^[A-ZÅÄÖ]\s*:\s*/, '');    // drop dialog speaker labels ("A:", "B:")
      if (!t) return;
      t.split(/(?<=[.!?…])\s+/).forEach((s) => { const x = s.trim(); if (x) parts.push(x); });
    };
    for (const el of Array.from(bodyEl.children)) {
      const tag = el.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) {
        if (/翻译|译文|中文|教学|备注|提示|笔记|notes/i.test(el.textContent || '')) break;
        continue; // skip section-label headings ("瑞典语原文", news item titles, …)
      }
      if (el.getAttribute && el.getAttribute('data-zh') === '1') continue; // 🇨🇳 zone block
      if (tag === 'pre' || tag === 'hr' || tag === 'table') continue;
      if (tag === 'ul' || tag === 'ol') {
        el.querySelectorAll('li').forEach((li) => pushText(li.textContent));
        continue;
      }
      pushText(el.textContent);
    }
    return parts;
  }

  // Wire the 朗读全文 button: toggles sequential sv-SE playback of the article's
  // Swedish sentences. Re-entrant (a second tap, or leaving the article, stops).
  function setupReadAloud(slug) {
    const btn = document.getElementById('readAloudBtn');
    if (!btn) return;
    const bodyEl = viewEl.querySelector('.articleBody');
    const reset = () => { btn.classList.remove('on'); btn.textContent = '🔊 朗读全文'; };
    btn.addEventListener('click', () => {
      if (!window.SvSpeak) return;
      if (window.SvSpeak.isSpeaking() && btn.classList.contains('on')) {
        window.SvSpeak.cancel(); reset(); return;
      }
      const parts = bodyEl ? articleSpeechParts(bodyEl) : [];
      if (!parts.length) { btn.textContent = '（无瑞典语正文）'; setTimeout(reset, 1500); return; }
      const ok = window.SvSpeak.speakSequence(parts, { onend: reset, onerror: reset });
      if (ok) { btn.classList.add('on'); btn.textContent = '⏹ 停止朗读'; }
    });
  }

  // ---------- learning items (词/词组/句子/语法 below the article) ----------
  // The same items that appear under this source in Dagbok. The reading-data
  // builder parses them out of the file's `svensk-export` block (which is
  // stripped from the visible prose) and carries them as a.items, so a reader
  // can study the extracted vocab/grammar right beneath the text they read.

  const POS_ABBR = {
    verb: 'v.', substantiv: 'n.', adjektiv: 'adj.', adverb: 'adv.',
    pronomen: 'pron.', preposition: 'prep.', konjunktion: 'konj.',
    interjektion: 'interj.', räkneord: 'num.',
  };
  // ordklass cells look like "substantiv en" / "verb v.1"; abbreviate the head word.
  function abbrevPos(p) {
    const head = String(p || '').trim().split(/\s+/)[0].toLowerCase();
    return POS_ABBR[head] || head;
  }

  // Attributes that make a resolved item open its full KB note on click (Dagbok-
  // style). `ref` comes from resolveItem(); returns '' for unmatched items so
  // they render as plain, non-clickable text.
  function openAttrs(ref) {
    if (!ref) return '';
    if (ref.word) return ' itemClickable" data-item-kind="word" data-item-slug="' + escapeHtml(ref.word.slug);
    return ' itemClickable" data-item-kind="note" data-item-slug="' + escapeHtml(ref.slug);
  }

  function chipHtml(kind, sv, posOrNull, zh) {
    const ref = resolveItem(kind, sv);
    return (
      `<span class="itemChip${openAttrs(ref)}">` +
        `<span class="itemSv">${escapeHtml(sv)}</span>` +
        (posOrNull ? `<span class="itemPos">${escapeHtml(posOrNull)}</span>` : '') +
        (zh ? `<span class="itemZh">${escapeHtml(zh)}</span>` : '') +
      `</span>`
    );
  }

  function groupHtml(label, count, inner) {
    if (!count) return '';
    return (
      `<div class="itemGroup">` +
        `<div class="itemGroupLabel">${label} · ${count}</div>` +
        `<div class="itemChips">${inner}</div>` +
      `</div>`
    );
  }

  // Build the collapsible "学习项" panel that sits below the article body.
  function itemsHtml(a) {
    const it = a.items;
    if (!it) return '';
    const total = (it.words || []).length + (it.phrases || []).length +
      (it.sentences || []).length + (it.grammar || []).length;
    if (!total) return '';

    const words = (it.words || []).map((w) => chipHtml('word', w.sv, abbrevPos(w.pos), w.zh)).join('');
    const phrases = (it.phrases || []).map((p) => chipHtml('phrase', p.sv, null, p.zh)).join('');
    const sentences = (it.sentences || []).map((s) => {
      const ref = resolveItem('sentence', s.sv);
      const open = ref ? ' itemClickable" data-item-kind="note" data-item-slug="' + escapeHtml(ref.slug) : '';
      return (
        `<div class="itemSentence${open}">` +
          `<div class="itemSentenceSv">${escapeHtml(s.sv)}</div>` +
          (s.zh ? `<div class="itemSentenceZh">${escapeHtml(s.zh)}</div>` : '') +
        `</div>`
      );
    }).join('');
    const grammar = (it.grammar || []).map((g) => chipHtml('grammar', g.sv, null, g.zh)).join('');

    return (
      `<div class="articleItems">` +
        `<button type="button" class="itemsToggle" aria-expanded="true">📚 学习项 (${total}) <span class="itemsCaret">▾</span></button>` +
        `<div class="itemsPanel">` +
          groupHtml('词', (it.words || []).length, words) +
          groupHtml('词组', (it.phrases || []).length, phrases) +
          (sentences ? `<div class="itemGroup"><div class="itemGroupLabel">句子 · ${(it.sentences || []).length}</div><div class="itemSentences">${sentences}</div></div>` : '') +
          groupHtml('语法', (it.grammar || []).length, grammar) +
        `</div>` +
      `</div>`
    );
  }

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
        ((window.SvSpeak && window.SvSpeak.supported && a.kind !== 'adjsubst')
          ? `<button type="button" id="readAloudBtn" class="viewBtn" title="用瑞典语朗读全文（只读瑞典语，跳过翻译/备注）">🔊 朗读全文</button>` : '') +
        `<button type="button" id="markReadBtn" class="viewBtn${read ? ' on' : ''}">${read ? '✓ 已读' : '标为已读'}</button>` +
      `</div>` +
      (countBits.length ? `<p class="viewCounts">📚 ${countBits.join(' · ')}</p>` : '') +
      `<div class="articleBody kind-${a.kind}">${mdToHtml(a.body || '')}</div>` +
      itemsHtml(a);

    // 学习项 panel: collapse/expand below the article (default expanded so the
    // extracted vocab/grammar is visible right under the text the reader just read).
    const itemsToggle = viewEl.querySelector('.itemsToggle');
    if (itemsToggle) {
      itemsToggle.addEventListener('click', () => {
        const open = itemsToggle.getAttribute('aria-expanded') !== 'false';
        itemsToggle.setAttribute('aria-expanded', open ? 'false' : 'true');
        viewEl.querySelector('.articleItems').classList.toggle('collapsed', open);
      });
    }

    document.getElementById('markReadBtn').addEventListener('click', () => {
      toggleRead(slug);
      openArticle(slug);   // re-render head + card state
      renderList();
    });
    document.getElementById('mobileBackBtn').addEventListener('click', backToList);

    // Turn KB words in the freshly rendered text into clickable glossary chips.
    // When 查词模式 is on, also make the remaining (non-KB) words tappable.
    closePop();
    if (window.SvSpeak) window.SvSpeak.cancel();  // stop any read-aloud from the previous article
    setupReadAloud(slug);
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

  // 想学清单 — words the KB doesn't have yet, batched into one /learn command so
  // Claude Code can do the real lookup (swedish-dictionary skill + web) and store
  // them.
  const learnBtn = document.getElementById('openLearnQueue');
  function renderLearnBtn() {
    if (!learnBtn) return;
    learnBtn.textContent = '📥 想学' + (learnQueue.length ? ' (' + learnQueue.length + ')' : '');
    learnBtn.classList.toggle('active', learnQueue.length > 0);
  }
  function renderLearnPanel() {
    if (!popEl) return;
    const header =
      `<div class="vocabPopHeader">` +
        `<span class="vocabPopGrip" aria-hidden="true"></span>` +
        `<button type="button" class="vocabPopClose" aria-label="关闭">×</button>` +
        `<div class="lookupTitle">📥 想学清单（KB 里还没有的词）</div>` +
        `<div class="lookupHint">回 Claude Code 粘贴下面的命令跑 <code>/learn</code>，它会用 swedish-dictionary 技能（必要时联网）真正查词并入库；<code>/sync</code> 推送后这些词就出现在阅读站。</div>` +
      `</div>`;
    if (!learnQueue.length) {
      popEl.innerHTML = header +
        `<div class="learnQueueBody"><p class="lookupEmpty">还没有想学的新词。开启 🔍 查词，点正文里 KB 还没有的词，在卡片里选「➕ 想学」。</p></div>`;
      return;
    }
    const rows = learnQueue.map((w, i) =>
      `<div class="learnQueueRow">` +
        `<span class="learnSurface">${escapeHtml(w)}</span>` +
        `<button type="button" class="learnQueueRemove" data-i="${i}" aria-label="移除">✕</button>` +
      `</div>`).join('');
    popEl.innerHTML = header +
      `<div class="learnQueueBody">` +
        rows +
        `<pre class="learnQueueCmd">${escapeHtml(learnCommandText())}</pre>` +
        `<div class="learnQueueActions">` +
          `<button type="button" class="viewBtn learnQueueCopy">📋 复制命令</button>` +
          `<button type="button" class="viewBtn learnQueueClear">清空</button>` +
        `</div>` +
      `</div>`;
  }
  function openLearnQueue() {
    mountPop('learnQueuePop', (e) => {
      if (e.target.closest('.vocabPopClose')) { closePop(); return; }
      const rm = e.target.closest('.learnQueueRemove');
      if (rm) { learnQueue.splice(Number(rm.dataset.i), 1); saveLearnQueue(); renderLearnBtn(); renderLearnPanel(); return; }
      if (e.target.closest('.learnQueueClear')) { learnQueue = []; saveLearnQueue(); renderLearnBtn(); renderLearnPanel(); return; }
      const copy = e.target.closest('.learnQueueCopy');
      if (copy) copyToClipboard(learnCommandText(), copy, '📋 复制命令');
    });
    renderLearnPanel();
  }
  // stopPropagation so this opening click doesn't bubble to the document-level
  // "click outside → closePop" handler (which would shut the panel in the same
  // tick — the button isn't inside .vocabPop, so it'd be treated as an outside click).
  if (learnBtn) learnBtn.addEventListener('click', (e) => { e.stopPropagation(); openLearnQueue(); });
  renderLearnBtn();

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

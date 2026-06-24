/* Shared KB data + search + note-popover layer for every svensk_agent site.
 *
 * Loads the light, eager index (window.KB_INDEX from kb-index.js) and exposes a
 * single window.KB API. Full note bodies live in kb-bodies.js, which is fetched
 * lazily (once, memoised) the first time a body is needed — so pages paint fast
 * and only pay for bodies when a note is actually opened.
 *
 *   KB.notes / KB.bySlug / KB.generatedAt / KB.countsByType() / KB.typeLabel()
 *   KB.search(query, { type, limit })        -> scored, filtered index notes
 *   KB.loadBodies()                          -> Promise (injects kb-bodies.js once)
 *   KB.body(slug)                            -> async { body, links, backlinks, path }
 *   KB.openNote(slug)                        -> shared in-place popover (modal card)
 *
 * Depends on window.KBMarkdown (kb-markdown.js) for openNote().
 */
window.KB = (function () {
  const idx = window.KB_INDEX && Array.isArray(window.KB_INDEX.notes) ? window.KB_INDEX : { notes: [], generatedAt: "unknown" };
  const notes = idx.notes;
  const bySlug = new Map(notes.map((n) => [n.slug, n]));

  const TYPE_LABELS = {
    word: "Words", phrase: "Phrases", sentence: "Sentences",
    grammar: "Grammar", topic: "Topics", source: "Sources", index: "Index",
  };
  const TYPE_ORDER = ["word", "phrase", "sentence", "grammar", "topic", "source", "index"];

  function titleFor(note) {
    return note.title || note.lemma || note.name || note.slug;
  }
  function typeLabel(type) {
    return TYPE_LABELS[type] || type;
  }

  let _counts = null;
  function countsByType() {
    if (_counts) return _counts;
    _counts = notes.reduce((acc, n) => { acc[n.type] = (acc[n.type] || 0) + 1; return acc; }, {});
    return _counts;
  }

  // ---- search ----
  // Ranks exact lemma / inflected-form hits to the top (dictionary behaviour),
  // then prefix matches, then plain substring matches anywhere in the key.
  function score(note, terms) {
    const title = titleFor(note).toLowerCase();
    const slug = note.slug.toLowerCase();
    const lemma = (note.lemma || "").toLowerCase();
    const forms = note.forms || [];
    const hay = `${slug} ${title} ${note.type} ${note.search || ""}`;
    return terms.reduce((total, term) => {
      let s = hay.includes(term) ? 1 : -20;
      if (title.includes(term)) s += 5;
      if (slug.includes(term)) s += 4;
      if (title === term || lemma === term || slug === term) s += 30;        // exact headword
      else if (title.startsWith(term) || lemma.startsWith(term)) s += 10;     // prefix
      else if (forms.some((f) => f.toLowerCase() === term)) s += 15;          // exact inflected form
      return total + s;
    }, 0);
  }

  function search(query, opts) {
    opts = opts || {};
    const type = opts.type && opts.type !== "all" ? opts.type : null;
    const limit = opts.limit || 0;
    const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);

    let pool = type ? notes.filter((n) => n.type === type) : notes;

    let results;
    if (terms.length) {
      results = pool
        .map((note) => ({ note, s: score(note, terms) }))
        .filter(({ note }) => {
          const hay = `${note.slug} ${titleFor(note)} ${note.type} ${note.search || ""}`.toLowerCase();
          return terms.every((t) => hay.includes(t));
        })
        .sort((a, b) => (b.s - a.s) || titleFor(a.note).localeCompare(titleFor(b.note)))
        .map(({ note }) => note);
    } else if (type) {
      // No query but a type filter → browse that type alphabetically.
      results = pool.slice().sort((a, b) => titleFor(a).localeCompare(titleFor(b)));
    } else {
      results = []; // search-first: nothing until the user types
    }
    return limit ? results.slice(0, limit) : results;
  }

  // ---- lazy bodies ----
  function paths() {
    const scripts = document.getElementsByTagName("script");
    for (const s of scripts) {
      if (s.src && /kb-index\.js(\?|$)/.test(s.src)) {
        const root = s.src.replace(/kb-index\.js.*$/, "");
        return { bodies: root + "kb-bodies.js", sok: root + "sok/#note=" };
      }
    }
    return { bodies: "kb-bodies.js", sok: "sok/#note=" };
  }
  const PATHS = paths();

  let _bodiesPromise = null;
  function loadBodies() {
    if (window.KB_BODIES) return Promise.resolve(window.KB_BODIES);
    if (_bodiesPromise) return _bodiesPromise;
    _bodiesPromise = new Promise((resolve, reject) => {
      const tag = document.createElement("script");
      tag.src = PATHS.bodies;
      tag.async = true;
      tag.onload = () => resolve(window.KB_BODIES || {});
      tag.onerror = () => reject(new Error("Failed to load " + PATHS.bodies));
      document.head.appendChild(tag);
    });
    return _bodiesPromise;
  }

  async function body(slug) {
    const all = await loadBodies();
    return all[slug] || null;
  }

  // ---- shared in-place note popover ----
  function plain(value) {
    if (Array.isArray(value)) return value.join(", ");
    if (value === true) return "true";
    if (value === false) return "false";
    return value == null ? "" : String(value);
  }
  const esc = (s) => (window.KBMarkdown ? window.KBMarkdown.escapeHtml(s) : String(s == null ? "" : s));

  function relatedChips(forward, back) {
    function chip(slug) {
      const t = bySlug.get(slug);
      if (!t) return `<span class="kbPopChip missing" title="链接目标不存在">${esc(slug)}</span>`;
      return `<button type="button" class="kbPopChip" data-wikilink="${esc(slug)}"><span class="kbPopChipType type-${esc(t.type)}">${esc(typeLabel(t.type))}</span>${esc(titleFor(t))}</button>`;
    }
    let html = "";
    if (forward && forward.length) {
      html += `<div class="kbPopRelated"><h4>→ 链接到 (${forward.length})</h4><div class="kbPopChips">${forward.slice().sort().map(chip).join("")}</div></div>`;
    }
    if (back && back.length) {
      html += `<div class="kbPopRelated"><h4>🔗 被引用 (${back.length})</h4><div class="kbPopChips">${back.slice().sort().map(chip).join("")}</div></div>`;
    }
    return html;
  }

  let overlay = null;
  let openToken = 0; // bumped on every open/close so a slow body fetch for a
                     // superseded note can't overwrite the card now showing.
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "kbPopBackdrop";
    overlay.hidden = true;
    overlay.innerHTML = `<div class="kbPop" role="dialog" aria-modal="true" aria-label="知识库笔记"></div>`;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeNote();
      const close = e.target.closest(".kbPopClose");
      if (close) { closeNote(); return; }
      const link = e.target.closest("[data-wikilink]");
      if (link && link.dataset.wikilink) {
        if (bySlug.has(link.dataset.wikilink)) { e.preventDefault(); openNote(link.dataset.wikilink); }
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.hidden) closeNote();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function closeNote() {
    openToken += 1;
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("kbPopOpen");
  }

  async function openNote(slug) {
    const note = bySlug.get(slug);
    if (!note) return;
    const ov = ensureOverlay();
    const card = ov.querySelector(".kbPop");
    const token = ++openToken;
    ov.hidden = false;
    document.body.classList.add("kbPopOpen");

    const meta = [];
    if (note.ordklass) meta.push(`<span class="kbPopTag">${esc(plain(note.ordklass))}</span>`);
    if (note.cefr) meta.push(`<span class="kbPopTag cefr">${esc(plain(note.cefr))}</span>`);
    if (note.known === true) meta.push(`<span class="kbPopTag known">✓ 已掌握</span>`);
    const gloss = [plain(note.zh), plain(note.en)].filter(Boolean).join("　·　");
    const forms = (note.forms || []).map((f) => `<span class="kbPopForm">${esc(f)}</span>`).join("");

    card.scrollTop = 0;
    card.innerHTML = `
      <div class="kbPopHead">
        <button type="button" class="kbPopClose" aria-label="关闭">×</button>
        <span class="kbPopType type-${esc(note.type)}">${esc(typeLabel(note.type))}</span>
        <span class="kbPopLemma">${esc(titleFor(note))}</span>
        ${meta.length ? `<span class="kbPopMeta">${meta.join("")}</span>` : ""}
        ${gloss ? `<div class="kbPopGloss">${esc(gloss)}</div>` : ""}
        ${forms ? `<div class="kbPopForms">${forms}</div>` : ""}
      </div>
      <div class="kbPopBody"><p class="kbPopLoading">läser…</p></div>
      <a class="kbPopLink" href="${PATHS.sok}${encodeURIComponent(slug)}" target="_blank" rel="noopener">在 Sök 中打开完整笔记 →</a>
    `;

    const data = await body(slug);
    // Bail if the user closed the popover or opened another note while loading.
    if (token !== openToken) return;
    const bodyEl = card.querySelector(".kbPopBody");
    if (!data) { bodyEl.innerHTML = `<p class="kbPopLoading">（找不到正文）</p>`; return; }
    const md = String(data.body || "").replace(/^#\s+.*(\r?\n)+/, ""); // drop redundant H1
    const html = window.KBMarkdown
      ? window.KBMarkdown.mdToHtml(md, { hasSlug: (t) => bySlug.has(t) })
      : esc(md);
    bodyEl.innerHTML = html + relatedChips(data.links, data.backlinks);
  }

  return {
    notes, bySlug, generatedAt: idx.generatedAt,
    typeLabel, titleFor, countsByType, TYPE_ORDER, TYPE_LABELS,
    search, loadBodies, body, openNote, closeNote,
  };
})();

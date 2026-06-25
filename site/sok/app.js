/* Sök — command-palette search over the KB.
 *
 * Search-first: nothing is listed until you type (or pick a type pill). Results
 * render as a compact list; selecting one shows the full note (body fetched
 * lazily through window.KB). Data + search + markdown come from the shared
 * modules: ../kb-index.js, ../kb-store.js (window.KB), ../kb-markdown.js. */
(function () {
  const KB = window.KB;
  const MD = window.KBMarkdown;
  if (!KB || !MD) {
    document.querySelector(".palette").innerHTML =
      '<p style="font-family:var(--cjk);color:var(--red)">⚠️ 找不到 kb-index.js / kb-store.js — 请先运行 <code>node tools/build-kb-site.js</code>。</p>';
    return;
  }

  const TYPE_SV = { word: "ord", phrase: "fraser", sentence: "meningar", grammar: "grammatik", topic: "ämnen", source: "källor", index: "index" };

  const state = { query: "", type: "all", mode: "empty", selectedSlug: null, results: [], activeIndex: -1 };

  const els = {
    input: document.getElementById("searchInput"),
    typePills: document.getElementById("typePills"),
    statLine: document.getElementById("statLine"),
    resultCount: document.getElementById("resultCount"),
    results: document.getElementById("results"),
    note: document.getElementById("note"),
    emptyHint: document.getElementById("emptyHint"),
    emptyCount: document.getElementById("emptyCount"),
  };

  const esc = (s) => MD.escapeHtml(s);
  const titleFor = (n) => KB.titleFor(n);

  function plain(v) {
    if (Array.isArray(v)) return v.join(", ");
    if (v === true) return "true";
    if (v === false) return "false";
    return v == null ? "" : String(v);
  }
  function typeBadge(type) {
    return `<span class="badge type-${esc(type)}">${esc(type)}</span>`;
  }
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function highlight(text, terms) {
    let html = esc(text);
    for (const t of terms) {
      if (!t) continue;
      html = html.replace(new RegExp(`(${escRe(t)})`, "gi"), "<mark>$1</mark>");
    }
    return html;
  }
  function terms() { return state.query.toLowerCase().split(/\s+/).filter(Boolean); }

  // ---- header: type pills + stats ----
  function renderPills() {
    const counts = KB.countsByType();
    const types = ["all", ...KB.TYPE_ORDER.filter((t) => counts[t])];
    els.typePills.innerHTML = types
      .map((t) => {
        const count = t === "all" ? KB.notes.length : counts[t];
        const label = t === "all" ? "全部" : KB.typeLabel(t);
        return `<button class="filterButton" type="button" data-type="${esc(t)}" aria-pressed="${state.type === t}">${esc(label)} ${count}</button>`;
      })
      .join("");
  }
  function renderStats() {
    const counts = KB.countsByType();
    const parts = KB.TYPE_ORDER.filter((t) => counts[t]).map((t) => `${counts[t]} ${TYPE_SV[t] || t}`);
    els.statLine.textContent = `${KB.notes.length} 条 · ` + parts.join(" · ");
    els.emptyCount.textContent = `${KB.notes.length} 条笔记 — 词 / 词组 / 句子 / 语法 / 主题 / 来源`;
  }

  // ---- results ----
  function renderResults() {
    const ts = terms();
    state.results = KB.search(state.query, { type: state.type });
    if (state.activeIndex >= state.results.length) state.activeIndex = state.results.length - 1;
    els.resultCount.textContent = `${state.results.length} ${state.results.length === 1 ? "note" : "notes"}`;

    if (!state.results.length) {
      els.results.innerHTML = `<p class="noResults">没有匹配的笔记。</p>`;
      return;
    }
    els.results.innerHTML = state.results
      .map((n, i) => {
        const meta = [plain(n.ordklass), plain(n.cefr), plain(n.zh), plain(n.en)].filter(Boolean).join(" · ");
        const known = n.known === true ? `<span class="badge knownBadge">✅ 已掌握</span>` : "";
        const speak = (window.SvSpeak && window.SvSpeak.supported && ["word", "phrase", "sentence"].includes(n.type))
          ? window.SvSpeak.buttonHtml(plain(n.lemma) || titleFor(n)) : "";
        const cls = ["resultItem"];
        if (i === state.activeIndex) cls.push("kbActive");
        if (n.slug === state.selectedSlug) cls.push("active");
        return `
          <button class="${cls.join(" ")}" type="button" data-slug="${esc(n.slug)}" data-index="${i}">
            <span class="resultTopline">
              <span class="resultTitle">${highlight(titleFor(n), ts)}</span>
              <span class="resultBadges">${speak}${known}${typeBadge(n.type)}</span>
            </span>
            ${meta ? `<span class="resultMeta">${highlight(meta, ts)}</span>` : ""}
            ${n.excerpt ? `<span class="resultExcerpt">${highlight(n.excerpt, ts)}</span>` : ""}
          </button>`;
      })
      .join("");
  }
  function updateActive() {
    els.results.querySelectorAll("[data-index]").forEach((b) => {
      const on = Number(b.dataset.index) === state.activeIndex;
      b.classList.toggle("kbActive", on);
      if (on) b.scrollIntoView({ block: "nearest" });
    });
  }

  // ---- note (full-width detail; body fetched lazily) ----
  function chip(slug) {
    const t = KB.bySlug.get(slug);
    if (!t) return `<span class="chip missingLink" title="链接目标不存在">${esc(slug)}</span>`;
    return `<button class="chip" type="button" data-wikilink="${esc(slug)}">${typeBadge(t.type)}<span class="chipLabel">${esc(titleFor(t))}</span></button>`;
  }
  function renderRelated(data) {
    const fwd = (data.links || []).slice().sort((a, b) => a.localeCompare(b));
    const back = (data.backlinks || []).filter((s) => s !== state.selectedSlug).slice().sort((a, b) => a.localeCompare(b));
    let html = "";
    if (fwd.length) html += `<section class="related"><h3>→ 链接到 (${fwd.length})</h3><div class="chips">${fwd.map(chip).join("")}</div></section>`;
    if (back.length) html += `<section class="related"><h3>🔗 被引用 (${back.length})</h3><div class="chips">${back.map(chip).join("")}</div></section>`;
    return html;
  }

  async function renderNote(slug) {
    const n = KB.bySlug.get(slug);
    if (!n) return;
    state.selectedSlug = slug;

    const badges = [];
    if (n.known === true) badges.push(`<span class="known">✅ 已掌握</span>`);
    for (const [k, v] of [["ordklass", n.ordklass], ["cefr", n.cefr], ["created", n.created]]) {
      const t = plain(v);
      if (t) badges.push(`<span>${esc(k)}: ${esc(t)}</span>`);
    }
    const gloss = [plain(n.zh), plain(n.en)].filter(Boolean).join("  ·  ");
    const speak = (window.SvSpeak && window.SvSpeak.supported && ["word", "phrase", "sentence"].includes(n.type))
      ? window.SvSpeak.buttonHtml(plain(n.lemma) || titleFor(n)) : "";

    els.note.innerHTML = `
      <button class="backBar" type="button" id="backBtn">← 返回结果 Back</button>
      <header class="detailHeader">
        <p class="eyebrow">${typeBadge(n.type)} <span class="detailPath" id="notePath"></span></p>
        <h2 tabindex="-1">${esc(titleFor(n))}${speak}</h2>
        ${gloss ? `<p class="detailGloss">${esc(gloss)}</p>` : ""}
        ${badges.length ? `<div class="metadata">${badges.join("")}</div>` : ""}
      </header>
      <div class="noteBody" id="noteBody"><p class="bodyLoading">läser…</p></div>
    `;
    window.scrollTo(0, 0);

    const data = await KB.body(slug);
    if (state.selectedSlug !== slug) return; // user navigated away while loading
    const pathEl = els.note.querySelector("#notePath");
    if (pathEl && data) pathEl.textContent = data.path || "";
    const bodyEl = els.note.querySelector("#noteBody");
    if (!data) { bodyEl.innerHTML = `<p class="bodyLoading">（找不到正文）</p>`; return; }
    bodyEl.innerHTML = MD.mdToHtml(String(data.body || ""), { hasSlug: (t) => KB.bySlug.has(t) }) + renderRelated(data);
  }

  // ---- modes / navigation ----
  function browsing() { return state.query.trim() !== "" || state.type !== "all"; }

  function setMode(mode) {
    state.mode = mode;
    els.emptyHint.hidden = mode !== "empty";
    els.results.hidden = mode !== "results";
    els.resultCount.hidden = mode !== "results";
    els.note.hidden = mode !== "note";
  }

  function navigateTo(slug, push) {
    if (!KB.bySlug.has(slug)) return;
    renderNote(slug);
    setMode("note");
    if (push !== false) {
      const hash = `#note=${encodeURIComponent(slug)}`;
      if (location.hash !== hash) history.pushState({ slug }, "", hash);
    }
  }
  function backToResults() {
    setMode(browsing() ? "results" : "empty");
    if (location.hash) history.pushState({ slug: null }, "", location.pathname + location.search);
    els.input.focus();
  }
  function onQueryChanged() {
    state.activeIndex = -1;
    if (browsing()) { renderResults(); setMode("results"); }
    else setMode("empty");
  }

  // ---- keyboard ----
  function focusSearch() { els.input.focus(); els.input.select(); }

  function onKeydown(event) {
    const tag = (event.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || tag === "select";

    if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) { event.preventDefault(); focusSearch(); return; }
    if (event.key === "/" && !typing) { event.preventDefault(); focusSearch(); return; }
    if (event.key === "Escape") {
      if (state.mode === "note") backToResults();
      else if (els.input.value) { els.input.value = ""; state.query = ""; onQueryChanged(); }
      else els.input.blur();
      return;
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && state.mode === "results") {
      if (!state.results.length) return;
      event.preventDefault();
      state.activeIndex = event.key === "ArrowDown"
        ? Math.min(state.results.length - 1, state.activeIndex + 1)
        : Math.max(0, state.activeIndex - 1);
      updateActive();
      return;
    }
    if (event.key === "Enter" && state.mode === "results") {
      const idx = state.activeIndex >= 0 ? state.activeIndex : 0;
      if (state.results[idx]) navigateTo(state.results[idx].slug);
    }
  }

  function parseHash() {
    const m = /(?:^#|&)note=([^&]+)/.exec(location.hash);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function bindEvents() {
    els.input.addEventListener("input", (e) => { state.query = e.target.value; onQueryChanged(); });

    els.typePills.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-type]");
      if (!btn) return;
      state.type = btn.dataset.type;
      renderPills();
      onQueryChanged();
    });

    els.results.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-slug]");
      if (!btn) return;
      state.activeIndex = Number(btn.dataset.index);
      navigateTo(btn.dataset.slug);
    });

    els.note.addEventListener("click", (e) => {
      if (e.target.closest("#backBtn")) { backToResults(); return; }
      const link = e.target.closest("[data-wikilink]");
      if (link && KB.bySlug.has(link.dataset.wikilink)) navigateTo(link.dataset.wikilink);
    });

    window.addEventListener("popstate", () => {
      const slug = parseHash();
      if (slug && KB.bySlug.has(slug)) { renderNote(slug); setMode("note"); }
      else setMode(browsing() ? "results" : "empty");
    });

    document.addEventListener("keydown", onKeydown);
  }

  function init() {
    renderPills();
    renderStats();
    bindEvents();

    const slug = parseHash();
    if (slug && KB.bySlug.has(slug)) { renderNote(slug); setMode("note"); }
    else { setMode("empty"); focusSearch(); }
  }

  init();
})();

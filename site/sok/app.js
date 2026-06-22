const notes = Array.isArray(window.KB_DATA?.notes) ? window.KB_DATA.notes : [];
const typeOrder = ["word", "phrase", "sentence", "grammar", "topic", "source", "index"];
const typeLabels = {
  word: "Words",
  phrase: "Phrases",
  sentence: "Sentences",
  grammar: "Grammar",
  topic: "Topics",
  source: "Sources",
  index: "Index",
};

const state = {
  query: "",
  type: "all",
  sort: "title",
  selectedSlug: null,
  activeIndex: -1,
};

let currentResults = [];
const mobileQuery = window.matchMedia("(max-width: 760px)");

const bySlug = new Map(notes.map((note) => [note.slug, note]));

// Reverse-link index (backlinks). Forward links live in note.links (slugs).
const backlinks = new Map();
for (const note of notes) {
  for (const target of note.links || []) {
    if (!backlinks.has(target)) backlinks.set(target, new Set());
    backlinks.get(target).add(note.slug);
  }
}

const elements = {
  shell: document.querySelector(".shell"),
  updatedLabel: document.querySelector("#updatedLabel"),
  searchInput: document.querySelector("#searchInput"),
  typeFilters: document.querySelector("#typeFilters"),
  statsGrid: document.querySelector("#statsGrid"),
  sidebarExtras: document.querySelector("#sidebarExtras"),
  sortSelect: document.querySelector("#sortSelect"),
  resultCount: document.querySelector("#resultCount"),
  resultList: document.querySelector("#resultList"),
  detailPane: document.querySelector(".detailPane"),
  detailEmpty: document.querySelector("#detailEmpty"),
  detailContent: document.querySelector("#detailContent"),
  backButton: document.querySelector("#backButton"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text, terms) {
  let html = escapeHtml(text);
  if (!terms || !terms.length) return html;
  for (const term of terms) {
    if (!term) continue;
    html = html.replace(new RegExp(`(${escapeRegExp(term)})`, "gi"), "<mark>$1</mark>");
  }
  return html;
}

function titleFor(note) {
  return note.title || note.lemma || note.name || note.slug;
}

function plainFrontmatterValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === true) return "true";
  if (value === false) return "false";
  return value || "";
}

function excerptFor(note) {
  const text = note.excerpt || note.body || "";
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

// Context snippet around the first matching term; falls back to the excerpt.
function snippetFor(note, terms) {
  const text = (note.excerpt || note.body || "").replace(/\s+/g, " ").trim();
  if (!terms || !terms.length) return text.slice(0, 180);
  const lower = text.toLowerCase();
  let hit = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx !== -1 && (hit === -1 || idx < hit)) hit = idx;
  }
  if (hit === -1) return text.slice(0, 180);
  const start = Math.max(0, hit - 60);
  const slice = text.slice(start, start + 180);
  return (start > 0 ? "…" : "") + slice + (start + 180 < text.length ? "…" : "");
}

function countByType() {
  return notes.reduce((counts, note) => {
    counts[note.type] = (counts[note.type] || 0) + 1;
    return counts;
  }, {});
}

function renderFilters() {
  const counts = countByType();
  const filterTypes = ["all", ...typeOrder.filter((type) => counts[type])];
  elements.typeFilters.innerHTML = filterTypes
    .map((type) => {
      const count = type === "all" ? notes.length : counts[type];
      const label = type === "all" ? "All" : typeLabels[type] || type;
      return `<button class="filterButton" type="button" data-type="${escapeHtml(type)}" aria-pressed="${state.type === type}">${escapeHtml(label)} ${count}</button>`;
    })
    .join("");
}

function renderStats() {
  const counts = countByType();
  const cards = typeOrder
    .filter((type) => counts[type])
    .map((type) => `<div class="statCard"><strong>${counts[type]}</strong><span>${escapeHtml(typeLabels[type] || type)}</span></div>`);
  elements.statsGrid.innerHTML = cards.join("");
}

function score(note, terms) {
  const haystack = `${note.slug} ${titleFor(note)} ${note.type} ${note.searchText || ""}`.toLowerCase();
  return terms.reduce((total, term) => {
    const titleMatch = titleFor(note).toLowerCase().includes(term) ? 5 : 0;
    const slugMatch = note.slug.toLowerCase().includes(term) ? 4 : 0;
    const bodyMatch = haystack.includes(term) ? 1 : -20;
    return total + titleMatch + slugMatch + bodyMatch;
  }, 0);
}

function queryTerms() {
  return state.query.toLowerCase().split(/\s+/).filter(Boolean);
}

function filteredNotes() {
  const terms = queryTerms();
  return notes
    .map((note) => ({ note, score: terms.length ? score(note, terms) : 0 }))
    .filter(({ note }) => {
      const typeMatch = state.type === "all" || note.type === state.type;
      const haystack = `${note.slug} ${titleFor(note)} ${note.type} ${note.searchText || ""}`.toLowerCase();
      const queryMatch = terms.length === 0 || terms.every((term) => haystack.includes(term));
      return typeMatch && queryMatch;
    })
    .sort((left, right) => {
      if (terms.length && right.score !== left.score) return right.score - left.score;
      if (state.sort === "type") return `${left.note.type}:${titleFor(left.note)}`.localeCompare(`${right.note.type}:${titleFor(right.note)}`);
      if (state.sort === "created") return (right.note.created || "").localeCompare(left.note.created || "") || titleFor(left.note).localeCompare(titleFor(right.note));
      return titleFor(left.note).localeCompare(titleFor(right.note));
    })
    .map(({ note }) => note);
}

function typeBadge(type, label) {
  return `<span class="badge type-${escapeHtml(type)}">${escapeHtml(label || type)}</span>`;
}

function renderResults() {
  const terms = queryTerms();
  currentResults = filteredNotes();
  elements.resultCount.textContent = `${currentResults.length} ${currentResults.length === 1 ? "note" : "notes"}`;
  if (state.activeIndex >= currentResults.length) state.activeIndex = currentResults.length - 1;

  if (!currentResults.length) {
    elements.resultList.innerHTML = `<p class="noResults">No matching notes.</p>`;
    return;
  }

  elements.resultList.innerHTML = currentResults
    .map((note, index) => {
      const meta = [plainFrontmatterValue(note.ordklass), plainFrontmatterValue(note.cefr), plainFrontmatterValue(note.zh), plainFrontmatterValue(note.en)]
        .filter(Boolean)
        .join(" · ");
      const known = note.known === true ? `<span class="badge knownBadge">✅ 已掌握</span>` : "";
      const classes = ["resultItem"];
      if (note.slug === state.selectedSlug) classes.push("active");
      if (index === state.activeIndex) classes.push("kbActive");
      return `
        <button class="${classes.join(" ")}" type="button" data-slug="${escapeHtml(note.slug)}" data-index="${index}">
          <span class="resultTopline">
            <span class="resultTitle">${highlight(titleFor(note), terms)}</span>
            <span class="resultBadges">${known}${typeBadge(note.type)}</span>
          </span>
          ${meta ? `<span class="resultMeta">${highlight(meta, terms)}</span>` : ""}
          <span class="resultExcerpt">${highlight(snippetFor(note, terms), terms)}</span>
        </button>
      `;
    })
    .join("");
}

function updateActiveResult() {
  const buttons = elements.resultList.querySelectorAll("[data-index]");
  buttons.forEach((button) => {
    const isActive = Number(button.dataset.index) === state.activeIndex;
    button.classList.toggle("kbActive", isActive);
    if (isActive) button.scrollIntoView({ block: "nearest" });
  });
}

function inlineMarkdown(value) {
  let html = escapeHtml(value);
  // inline code (protect its contents from later inline rules)
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // markdown links [text](url) — before wikilinks; url already escaped
  html = html.replace(/\[([^\]]+)\]\((https?:[^\s)]+)\)/g, (_match, text, url) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
  // bold then italic (bold first so ** isn't eaten by the single-* rule)
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
  html = html.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
  // wikilinks [[target|label]]
  html = html.replace(/\[\[([^\]]+)\]\]/g, (_match, rawTarget) => {
    const target = rawTarget.split("|")[0].trim();
    const label = rawTarget.includes("|") ? rawTarget.split("|").slice(1).join("|").trim() : target;
    const exists = bySlug.has(target);
    const className = exists ? "wikiLink" : "wikiLink missingLink";
    return `<button class="${className}" type="button" data-wikilink="${escapeHtml(target)}">${label}</button>`;
  });
  return html;
}

function listIndent(line) {
  const match = /^([ \t]*)/.exec(line);
  return match[1].replace(/\t/g, "  ").length;
}

function isListLine(line) {
  return /^[ \t]*([-*+]|\d+\.)\s+/.test(line);
}

function renderList(lines, start, baseIndent) {
  const first = /^[ \t]*([-*+]|\d+\.)\s+/.exec(lines[start]);
  const ordered = /\d+\./.test(first[1]);
  const tag = ordered ? "ol" : "ul";
  const items = [];
  let index = start;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      let lookahead = index + 1;
      while (lookahead < lines.length && !lines[lookahead].trim()) lookahead += 1;
      if (lookahead < lines.length && isListLine(lines[lookahead]) && listIndent(lines[lookahead]) >= baseIndent) {
        index = lookahead;
        continue;
      }
      break;
    }
    if (!isListLine(line)) break;
    const indent = listIndent(line);
    if (indent < baseIndent) break;

    const match = /^[ \t]*(?:[-*+]|\d+\.)\s+(.*)$/.exec(line);
    let content = inlineMarkdown(match[1]);
    index += 1;

    if (index < lines.length && lines[index].trim() && isListLine(lines[index]) && listIndent(lines[index]) > baseIndent) {
      const nested = renderList(lines, index, listIndent(lines[index]));
      content += nested.html;
      index = nested.nextIndex;
    }
    items.push(`<li>${content}</li>`);
  }

  return { html: `<${tag}>${items.join("")}</${tag}>`, nextIndex: index };
}

function renderTable(lines, startIndex) {
  const rows = [];
  let index = startIndex;
  while (index < lines.length && /^\s*\|.+\|\s*$/.test(lines[index])) {
    rows.push(lines[index].trim());
    index += 1;
  }

  const normalizedRows = rows.filter((row) => !/^\|\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|$/.test(row));
  const htmlRows = normalizedRows.map((row, rowIndex) => {
    const cells = row.slice(1, -1).split("|").map((cell) => inlineMarkdown(cell.trim()));
    const tag = rowIndex === 0 ? "th" : "td";
    return `<tr>${cells.map((cell) => `<${tag}>${cell}</${tag}>`).join("")}</tr>`;
  });
  return { html: `<table>${htmlRows.join("")}</table>`, nextIndex: index };
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    // fenced code block — content kept verbatim, escaped, no inline rules
    const fence = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      const marker = fence[2][0];
      const fenceLen = fence[2].length;
      const closeRe = new RegExp(`^\\s*\\${marker}{${fenceLen},}\\s*$`);
      const buffer = [];
      index += 1;
      while (index < lines.length && !closeRe.test(lines[index])) {
        buffer.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1; // consume closing fence
      blocks.push(`<pre><code>${escapeHtml(buffer.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    if (/^\s*\|.+\|\s*$/.test(line)) {
      const table = renderTable(lines, index);
      blocks.push(table.html);
      index = table.nextIndex;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const buffer = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        buffer.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${markdownToHtml(buffer.join("\n"))}</blockquote>`);
      continue;
    }

    if (isListLine(line)) {
      const list = renderList(lines, index, listIndent(line));
      blocks.push(list.html);
      index = list.nextIndex;
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(\s*)(`{3,}|~{3,})/.test(lines[index]) &&
      !/^#{1,6}\s+/.test(lines[index]) &&
      !/^\s*\|.+\|\s*$/.test(lines[index]) &&
      !/^\s*>\s?/.test(lines[index]) &&
      !isListLine(lines[index]) &&
      !/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    if (paragraph.length) blocks.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
  }

  return blocks.join("");
}

function linkChip(slug) {
  const target = bySlug.get(slug);
  if (!target) {
    return `<span class="chip missingLink" title="链接目标不存在 (missing target)">${escapeHtml(slug)}</span>`;
  }
  return `<button class="chip" type="button" data-wikilink="${escapeHtml(slug)}">${typeBadge(target.type)}<span class="chipLabel">${escapeHtml(titleFor(target))}</span></button>`;
}

function renderRelated(note) {
  const forward = (note.links || []).slice().sort((a, b) => a.localeCompare(b));
  const back = Array.from(backlinks.get(note.slug) || [])
    .filter((slug) => slug !== note.slug)
    .sort((a, b) => a.localeCompare(b));

  let html = "";
  if (forward.length) {
    html += `<section class="related"><h3>→ 链接到 (Links to · ${forward.length})</h3><div class="chips">${forward.map(linkChip).join("")}</div></section>`;
  }
  if (back.length) {
    html += `<section class="related"><h3>🔗 被引用 (Linked from · ${back.length})</h3><div class="chips">${back.map(linkChip).join("")}</div></section>`;
  }
  return html;
}

function renderDetail(slug) {
  const note = bySlug.get(slug);
  if (!note) return;

  state.selectedSlug = slug;

  const badges = [];
  if (note.known === true) badges.push(`<span class="known">✅ 已掌握</span>`);
  for (const [key, value] of [["ordklass", note.ordklass], ["cefr", note.cefr], ["created", note.created]]) {
    const text = plainFrontmatterValue(value);
    if (text) badges.push(`<span>${escapeHtml(key)}: ${escapeHtml(text)}</span>`);
  }
  const gloss = [plainFrontmatterValue(note.zh), plainFrontmatterValue(note.en)].filter(Boolean).join("  ·  ");

  elements.detailEmpty.hidden = true;
  elements.detailContent.hidden = false;
  elements.detailContent.innerHTML = `
    <header class="detailHeader">
      <p class="eyebrow">${typeBadge(note.type)} <span class="detailPath">${escapeHtml(note.path)}</span></p>
      <h2 tabindex="-1">${escapeHtml(titleFor(note))}</h2>
      ${gloss ? `<p class="detailGloss">${escapeHtml(gloss)}</p>` : ""}
      ${badges.length ? `<div class="metadata">${badges.join("")}</div>` : ""}
    </header>
    <div class="noteBody">${markdownToHtml(note.body)}</div>
    ${renderRelated(note)}
  `;

  elements.detailPane.scrollTop = 0;
  renderResults();
}

function selectFirstVisible() {
  const first = filteredNotes()[0];
  if (first) renderDetail(first.slug);
}

// ----- navigation (deep links + mobile list/detail view) -----

function setMode(mode) {
  elements.shell.classList.toggle("mode-detail", mode === "detail");
}

// Focus mode hides the middle browse column so a deep-linked note (e.g. opened
// from Läsning) reads as a clean full-width article. The search sidebar stays.
function setFocus(on) {
  elements.shell.classList.toggle("mode-focus", on);
}

function exitFocus() {
  if (elements.shell.classList.contains("mode-focus")) setFocus(false);
}

function parseHashSlug() {
  const match = /(?:^#|&)note=([^&]+)/.exec(location.hash);
  return match ? decodeURIComponent(match[1]) : null;
}

function navigateTo(slug, { push = true, focus = false } = {}) {
  if (!bySlug.has(slug)) return;
  renderDetail(slug);
  if (push) {
    const hash = `#note=${encodeURIComponent(slug)}`;
    if (location.hash !== hash) history.pushState({ slug }, "", hash);
  }
  if (mobileQuery.matches) {
    setMode("detail");
    elements.backButton.focus();
  } else if (focus) {
    elements.detailContent.querySelector("h2")?.focus();
  }
}

function showList({ push = true } = {}) {
  setMode("list");
  if (push && location.hash) history.pushState({ slug: null }, "", location.pathname + location.search);
}

// ----- keyboard -----

function focusSearch() {
  elements.searchInput.focus();
  elements.searchInput.select();
}

function onKeydown(event) {
  const tag = (event.target.tagName || "").toLowerCase();
  const typing = tag === "input" || tag === "textarea" || tag === "select";

  if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    focusSearch();
    return;
  }
  if (event.key === "/" && !typing) {
    event.preventDefault();
    focusSearch();
    return;
  }
  if (event.key === "Escape") {
    if (elements.searchInput.value) {
      elements.searchInput.value = "";
      state.query = "";
      state.activeIndex = -1;
      renderResults();
    } else if (mobileQuery.matches && elements.shell.classList.contains("mode-detail")) {
      showList();
    }
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    if (typing && event.target !== elements.searchInput) return;
    if (!currentResults.length) return;
    event.preventDefault();
    if (event.key === "ArrowDown") {
      state.activeIndex = Math.min(currentResults.length - 1, state.activeIndex + 1);
    } else {
      state.activeIndex = Math.max(0, state.activeIndex - 1);
    }
    updateActiveResult();
    return;
  }
  if (event.key === "Enter") {
    if (event.target === elements.searchInput && state.activeIndex < 0 && currentResults.length) {
      navigateTo(currentResults[0].slug);
    } else if (state.activeIndex >= 0 && currentResults[state.activeIndex]) {
      navigateTo(currentResults[state.activeIndex].slug);
    }
  }
}

function syncSidebarExtras() {
  if (!elements.sidebarExtras) return;
  elements.sidebarExtras.open = !mobileQuery.matches;
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    exitFocus(); // user wants to browse → bring the results column back
    state.query = event.target.value;
    state.activeIndex = -1;
    renderResults();
  });

  elements.sortSelect.addEventListener("change", (event) => {
    exitFocus();
    state.sort = event.target.value;
    renderResults();
  });

  elements.typeFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-type]");
    if (!button) return;
    exitFocus();
    state.type = button.dataset.type;
    state.activeIndex = -1;
    renderFilters();
    renderResults();
  });

  elements.resultList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-slug]");
    if (!button) return;
    state.activeIndex = Number(button.dataset.index);
    navigateTo(button.dataset.slug);
  });

  // wikilink + related-chip navigation (event-delegated on the detail pane)
  elements.detailContent.addEventListener("click", (event) => {
    const link = event.target.closest("[data-wikilink]");
    if (!link) return;
    const target = link.dataset.wikilink;
    if (bySlug.has(target)) navigateTo(target);
  });

  elements.backButton.addEventListener("click", () => {
    if (elements.shell.classList.contains("mode-focus")) exitFocus();
    else showList();
  });

  window.addEventListener("popstate", () => {
    const slug = parseHashSlug();
    if (slug && bySlug.has(slug)) {
      renderDetail(slug);
      if (mobileQuery.matches) setMode("detail");
    } else if (mobileQuery.matches) {
      setMode("list");
    }
  });

  document.addEventListener("keydown", onKeydown);

  const onBreakpointChange = () => {
    syncSidebarExtras();
    if (!mobileQuery.matches) setMode("list");
  };
  if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", onBreakpointChange);
  else mobileQuery.addListener(onBreakpointChange);
}

function init() {
  elements.updatedLabel.textContent = `${notes.length} notes · generated ${window.KB_DATA?.generatedAt || "unknown"}`;
  renderFilters();
  renderStats();
  renderResults();
  bindEvents();
  syncSidebarExtras();

  const initialSlug = parseHashSlug();
  if (initialSlug && bySlug.has(initialSlug)) {
    renderDetail(initialSlug);
    if (mobileQuery.matches) setMode("detail");
    else setFocus(true); // arrived via deep link → focused article view
  } else if (!mobileQuery.matches) {
    selectFirstVisible();
  }
}

init();

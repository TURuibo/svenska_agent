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
};

const bySlug = new Map(notes.map((note) => [note.slug, note]));

const elements = {
  updatedLabel: document.querySelector("#updatedLabel"),
  searchInput: document.querySelector("#searchInput"),
  typeFilters: document.querySelector("#typeFilters"),
  statsGrid: document.querySelector("#statsGrid"),
  sortSelect: document.querySelector("#sortSelect"),
  resultCount: document.querySelector("#resultCount"),
  resultList: document.querySelector("#resultList"),
  detailEmpty: document.querySelector("#detailEmpty"),
  detailContent: document.querySelector("#detailContent"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function filteredNotes() {
  const terms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
  return notes
    .map((note) => ({ note, score: terms.length ? score(note, terms) : 0 }))
    .filter(({ note, score: noteScore }) => {
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

function renderResults() {
  const results = filteredNotes();
  elements.resultCount.textContent = `${results.length} ${results.length === 1 ? "note" : "notes"}`;
  if (!results.length) {
    elements.resultList.innerHTML = `<p class="noResults">No matching notes.</p>`;
    return;
  }

  elements.resultList.innerHTML = results
    .map((note) => {
      const meta = [plainFrontmatterValue(note.ordklass), plainFrontmatterValue(note.cefr), plainFrontmatterValue(note.zh), plainFrontmatterValue(note.en)]
        .filter(Boolean)
        .join(" · ");
      return `
        <button class="resultItem ${note.slug === state.selectedSlug ? "active" : ""}" type="button" data-slug="${escapeHtml(note.slug)}">
          <span class="resultTopline">
            <span class="resultTitle">${escapeHtml(titleFor(note))}</span>
            <span class="badge">${escapeHtml(note.type)}</span>
          </span>
          ${meta ? `<span class="resultMeta">${escapeHtml(meta)}</span>` : ""}
          <span class="resultExcerpt">${escapeHtml(excerptFor(note))}</span>
        </button>
      `;
    })
    .join("");
}

function inlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\[\[([^\]]+)\]\]/g, (_, rawTarget) => {
    const target = rawTarget.split("|")[0].trim();
    const label = rawTarget.includes("|") ? rawTarget.split("|").slice(1).join("|").trim() : target;
    const exists = bySlug.has(target);
    const className = exists ? "wikiLink" : "wikiLink missingLink";
    return `<button class="${className}" type="button" data-wikilink="${escapeHtml(target)}">${escapeHtml(label)}</button>`;
  });
  return html;
}

function renderTable(lines, startIndex) {
  const rows = [];
  let index = startIndex;
  while (index < lines.length && /^\|.+\|$/.test(lines[index])) {
    rows.push(lines[index]);
    index += 1;
  }

  const normalizedRows = rows.filter((row) => !/^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|$/.test(row));
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
  let paragraph = [];
  let list = [];

  function flushParagraph() {
    if (paragraph.length) {
      blocks.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  }

  function flushList() {
    if (list.length) {
      blocks.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
      list = [];
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^\|.+\|$/.test(line)) {
      flushParagraph();
      flushList();
      const table = renderTable(lines, index);
      blocks.push(table.html);
      index = table.nextIndex - 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const listItem = /^-\s+(.+)$/.exec(line);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1]);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return blocks.join("");
}

function renderDetail(slug) {
  const note = bySlug.get(slug);
  if (!note) return;

  state.selectedSlug = slug;
  const metaEntries = ["ordklass", "cefr", "zh", "en", "created"]
    .map((key) => [key, plainFrontmatterValue(note[key])])
    .filter(([, value]) => value);

  elements.detailEmpty.hidden = true;
  elements.detailContent.hidden = false;
  elements.detailContent.innerHTML = `
    <header class="detailHeader">
      <p class="eyebrow">${escapeHtml(note.type)} · ${escapeHtml(note.path)}</p>
      <h2>${escapeHtml(titleFor(note))}</h2>
      <p class="detailMeta">${escapeHtml(excerptFor(note))}</p>
      <div class="metadata">${metaEntries.map(([key, value]) => `<span>${escapeHtml(key)}: ${escapeHtml(value)}</span>`).join("")}</div>
    </header>
    <div class="noteBody">${markdownToHtml(note.body)}</div>
  `;
  renderResults();
}

function selectFirstVisible() {
  const first = filteredNotes()[0];
  if (first) renderDetail(first.slug);
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderResults();
  });

  elements.sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderResults();
  });

  elements.typeFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-type]");
    if (!button) return;
    state.type = button.dataset.type;
    renderFilters();
    renderResults();
  });

  elements.resultList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-slug]");
    if (!button) return;
    renderDetail(button.dataset.slug);
  });

  elements.detailContent.addEventListener("click", (event) => {
    const link = event.target.closest("[data-wikilink]");
    if (!link) return;
    const target = link.dataset.wikilink;
    if (bySlug.has(target)) renderDetail(target);
  });
}

function init() {
  elements.updatedLabel.textContent = `${notes.length} notes · generated ${window.KB_DATA?.generatedAt || "unknown"}`;
  renderFilters();
  renderStats();
  renderResults();
  bindEvents();
  selectFirstVisible();
}

init();

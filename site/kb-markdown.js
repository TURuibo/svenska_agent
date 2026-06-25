/* Shared Markdown → HTML renderer for the svensk_agent KB sites.
 *
 * Single source of truth — replaces the four near-identical copies that used to
 * live in sok/app.js, dagbok.js, forms/forms.js and reading/reading.js. Ported
 * from the most complete copy (sok/app.js): fenced code, headings, hr, tables,
 * blockquotes, nested lists, bold / italic / inline-code, markdown links, and
 * Obsidian [[wikilinks]].
 *
 * Wikilinks render as <button class="wikiLink" data-wikilink="<slug>">label</button>
 * so each host can delegate clicks (open in Sök, open a popover, etc.). Pass
 * opts.hasSlug(slug)->bool to mark links whose target is missing.
 *
 *   window.KBMarkdown.mdToHtml(markdown, { hasSlug })
 *   window.KBMarkdown.inlineMarkdown(text, { hasSlug })
 *   window.KBMarkdown.escapeHtml(text)
 */
window.KBMarkdown = (function () {
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function inlineMarkdown(value, opts) {
    const hasSlug = (opts && typeof opts.hasSlug === "function") ? opts.hasSlug : null;
    let html = escapeHtml(value);
    // inline code (protect its contents from later inline rules)
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    // markdown links [text](url) — before wikilinks; url already escaped
    html = html.replace(/\[([^\]]+)\]\((https?:[^\s)]+)\)/g, (_m, text, url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`);
    // bold then italic (bold first so ** isn't eaten by the single-* rule)
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>");
    html = html.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1<em>$2</em>");
    // wikilinks [[target|label]]
    html = html.replace(/\[\[([^\]]+)\]\]/g, (_m, rawTarget) => {
      const target = rawTarget.split("|")[0].trim();
      const label = rawTarget.includes("|") ? rawTarget.split("|").slice(1).join("|").trim() : target;
      const exists = hasSlug ? hasSlug(target) : true;
      const className = exists ? "wikiLink" : "wikiLink missingLink";
      return `<button class="${className}" type="button" data-wikilink="${escapeHtml(target)}">${escapeHtml(label)}</button>`;
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

  function renderList(lines, start, baseIndent, opts) {
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
      let content = inlineMarkdown(match[1], opts);
      index += 1;

      if (index < lines.length && lines[index].trim() && isListLine(lines[index]) && listIndent(lines[index]) > baseIndent) {
        const nested = renderList(lines, index, listIndent(lines[index]), opts);
        content += nested.html;
        index = nested.nextIndex;
      }
      items.push(`<li>${content}</li>`);
    }

    return { html: `<${tag}>${items.join("")}</${tag}>`, nextIndex: index };
  }

  function renderTable(lines, startIndex, opts) {
    const rows = [];
    let index = startIndex;
    while (index < lines.length && /^\s*\|.+\|\s*$/.test(lines[index])) {
      rows.push(lines[index].trim());
      index += 1;
    }

    const normalizedRows = rows.filter((row) => !/^\|\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|$/.test(row));
    const htmlRows = normalizedRows.map((row, rowIndex) => {
      const cells = row.slice(1, -1).split("|").map((cell) => inlineMarkdown(cell.trim(), opts));
      const tag = rowIndex === 0 ? "th" : "td";
      return `<tr>${cells.map((cell) => `<${tag}>${cell}</${tag}>`).join("")}</tr>`;
    });
    return { html: `<table>${htmlRows.join("")}</table>`, nextIndex: index };
  }

  function mdToHtml(markdown, opts) {
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
        blocks.push(`<h${level}>${inlineMarkdown(heading[2], opts)}</h${level}>`);
        index += 1;
        continue;
      }

      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        blocks.push("<hr>");
        index += 1;
        continue;
      }

      if (/^\s*\|.+\|\s*$/.test(line)) {
        const table = renderTable(lines, index, opts);
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
        blocks.push(`<blockquote>${mdToHtml(buffer.join("\n"), opts)}</blockquote>`);
        continue;
      }

      if (isListLine(line)) {
        const list = renderList(lines, index, listIndent(line), opts);
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
      if (paragraph.length) blocks.push(`<p>${inlineMarkdown(paragraph.join(" "), opts)}</p>`);
    }

    return blocks.join("");
  }

  return { escapeHtml, inlineMarkdown, mdToHtml };
})();

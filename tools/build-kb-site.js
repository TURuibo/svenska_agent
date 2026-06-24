#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const kbRoot = path.join(repoRoot, 'knowledge_base');
const siteRoot = path.join(repoRoot, 'site');
// Split output: a light, eager index (loaded by every page) + a heavy, lazy
// bodies map (fetched on demand when a note is first opened). This replaces the
// old single 8.9 MB kb-data.js that blocked first paint on three pages.
const indexPath = path.join(siteRoot, 'kb-index.js');
const bodiesPath = path.join(siteRoot, 'kb-bodies.js');

if (!fs.existsSync(kbRoot)) {
  throw new Error(`knowledge_base folder was not found at ${kbRoot}`);
}

fs.mkdirSync(siteRoot, { recursive: true });

function readUtf8File(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  const listMatch = trimmed.match(/^\[(.*)\]$/);
  if (listMatch) {
    const inside = listMatch[1].trim();
    if (inside === '') return [];
    return inside
      .split(',')
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter((item) => item !== '');
  }
  return trimmed.replace(/^['"]|['"]$/g, '');
}

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const frontmatter = {};
  if (!match) {
    return { frontmatter, body: text.trim() };
  }

  const lines = match[1].split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) { i++; continue; }
    // Top-level key (no leading whitespace) — anything indented is a list item below.
    const lineMatch = line.match(/^([^\s:][^:]*):\s*(.*)$/);
    if (!lineMatch) { i++; continue; }
    const key = lineMatch[1].trim();
    const rest = lineMatch[2];

    // Empty value? May be a multi-line YAML list:
    //   words:
    //     - egentligen
    //     - restaurang
    if (rest === '') {
      const items = [];
      let j = i + 1;
      while (j < lines.length) {
        const listMatch = lines[j].match(/^\s+-\s+(.*)$/);
        if (!listMatch) break;
        items.push(listMatch[1].trim().replace(/^['"]|['"]$/g, ''));
        j += 1;
      }
      if (items.length > 0) {
        frontmatter[key] = items;
        i = j;
        continue;
      }
      frontmatter[key] = '';
      i += 1;
      continue;
    }
    frontmatter[key] = parseScalar(rest);
    i += 1;
  }

  return { frontmatter, body: match[2].trim() };
}

function getTitle(frontmatter, body, slug) {
  for (const key of ['lemma', 'name', 'title']) {
    if (Object.prototype.hasOwnProperty.call(frontmatter, key) && `${frontmatter[key]}` !== '') {
      return `${frontmatter[key]}`;
    }
  }

  const heading = body.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return slug;
}

function getExcerpt(body) {
  let text = body.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, '$1');
  text = text.replace(/[`*_>#|-]/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > 220 ? text.slice(0, 220) : text;
}

// Extract the inflected forms from a word note's "## 语法变形 (Forms)" table.
// Tables differ by word class (verb = 2-col, adjektiv = 4-col, substantiv = grid),
// so we parse generically: column 0 of each data row is the paradigm label, and
// every remaining column is a form value. Returns an ordered, de-duplicated list.
function cleanForm(value) {
  let v = value.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, '$1'); // strip wikilinks
  v = v.replace(/\([^)]*\)/g, ' ');     // drop parentheticals like "(har)"
  v = v.replace(/[`*_]/g, '');          // strip markdown emphasis
  v = v.replace(/\s+/g, ' ').trim();
  v = v.replace(/^att\s+/i, '');        // infinitiv marker
  v = v.replace(/^(en|ett)\s+/i, '');   // indefinite article
  return v.trim();
}

function extractForms(body) {
  const lines = body.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/语法变形/.test(lines[i]) || /^#{2,3}\s+.*\bForms\b/i.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return [];

  const tableLines = [];
  for (let i = start; i < lines.length; i += 1) {
    const ln = lines[i];
    if (/^\s*\|/.test(ln)) { tableLines.push(ln); continue; }
    if (tableLines.length) break;            // table ended
    if (/^\s*$/.test(ln)) continue;          // blank line before table
    if (/^#{1,6}\s/.test(ln)) break;         // next heading, no table here
  }
  if (tableLines.length < 2) return [];

  const rows = tableLines.map((ln) =>
    ln.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
  );
  const bodyRows = rows.filter(
    (r) => !r.every((c) => /^:?-{2,}:?$/.test(c) || c === '')
  );
  if (bodyRows.length < 2) return [];

  const dataRows = bodyRows.slice(1); // row 0 is the header
  const forms = [];
  const seen = new Set();
  for (const row of dataRows) {
    for (let c = 1; c < row.length; c += 1) {
      const cell = row[c];
      if (!cell) continue;
      for (const piece of cell.split(/[\/,]/)) {
        const form = cleanForm(piece);
        if (!form || form === '—' || form === '-') continue;
        if (!/[A-Za-zÅÄÖåäö]/.test(form)) continue;
        const key = form.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        forms.push(form);
      }
    }
  }
  return forms.slice(0, 12);
}

function getWikilinks(text) {
  const links = new Set();
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    links.add(match[1].trim());
  }
  return Array.from(links).sort((a, b) => a.localeCompare(b));
}

function walkMarkdownFiles(dir) {
  const output = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_templates') continue;
      if (entry.name === '_index') continue;
      output.push(...walkMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      output.push(fullPath);
    }
  }
  return output.sort((a, b) => a.localeCompare(b));
}

function relativePath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function singularType(parentType) {
  return parentType.endsWith('s') ? parentType.slice(0, -1) : parentType;
}

const notes = walkMarkdownFiles(kbRoot).map((filePath) => {
  const text = readUtf8File(filePath);
  const { frontmatter, body } = parseFrontmatter(text);
  const slug = path.basename(filePath, '.md');
  const parentType = path.basename(path.dirname(filePath));
  const type = frontmatter.type && `${frontmatter.type}` !== '' ? `${frontmatter.type}` : singularType(parentType);
  const title = getTitle(frontmatter, body, slug);
  const note = {
    slug,
    type,
    title,
    path: relativePath(filePath),
    body,
    excerpt: getExcerpt(body),
    forms: type === 'word' ? extractForms(body) : [],
    links: getWikilinks(text),
  };

  const carryKeys = [
    'lemma', 'name', 'ordklass', 'cefr', 'zh', 'en', 'created', 'known',
    'sentence', 'phrase',
    // recap-site extras
    'date', 'date_added', 'source_label', 'kind', 'category', 'tags',
    'words', 'phrases', 'sentences', 'grammar', 'topics',
  ];
  for (const key of carryKeys) {
    if (Object.prototype.hasOwnProperty.call(frontmatter, key)) {
      note[key] = frontmatter[key];
    }
  }

  return note;
});

// --- B: Compute build-time backlinks by inverting the forward-link graph ---
const backlinkMap = new Map(); // slug → Set of slugs that link TO it
for (const note of notes) {
  for (const target of note.links) {
    if (!backlinkMap.has(target)) backlinkMap.set(target, new Set());
    backlinkMap.get(target).add(note.slug);
  }
}
for (const note of notes) {
  const bl = backlinkMap.get(note.slug);
  note.backlinks = bl ? Array.from(bl).filter(s => s !== note.slug).sort((a, b) => a.localeCompare(b)) : [];
}

// --- C: Write slug manifest to knowledge_base/_index/slugs.json ---
const indexDir = path.join(kbRoot, '_index');
fs.mkdirSync(indexDir, { recursive: true });

const slugsByType = {};
for (const note of notes) {
  const t = note.type || 'unknown';
  if (!slugsByType[t]) slugsByType[t] = [];
  slugsByType[t].push(note.slug);
}
for (const t of Object.keys(slugsByType)) {
  slugsByType[t].sort((a, b) => a.localeCompare(b));
}
const slugManifestPath = path.join(indexDir, 'slugs.json');
fs.writeFileSync(slugManifestPath, JSON.stringify(slugsByType, null, 2), 'utf8');
console.log(`Generated ${slugManifestPath} with ${notes.length} slugs across ${Object.keys(slugsByType).length} types.`);

const generatedAt = process.env.KB_SITE_GENERATED_AT || new Date().toISOString().replace('T', ' ').slice(0, 19);

// --- D: Split into a light index (eager) and a heavy bodies map (lazy) ---
// Metadata + a compact search key go in the index so lists/search render
// instantly; full markdown bodies, links and backlinks live in kb-bodies.js,
// fetched only when a note is actually opened.
const INDEX_CARRY_KEYS = [
  'lemma', 'name', 'ordklass', 'cefr', 'zh', 'en', 'created', 'known',
  'sentence', 'phrase',
  'date', 'date_added', 'source_label', 'kind', 'category', 'tags',
  'words', 'phrases', 'sentences', 'grammar', 'topics',
];

const indexNotes = notes.map((note) => {
  const out = { slug: note.slug, type: note.type, title: note.title };
  for (const key of INDEX_CARRY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(note, key)) out[key] = note[key];
  }
  if (note.type === 'word' && note.forms && note.forms.length) out.forms = note.forms;
  // Short snippet for result rows (full excerpt/body stays out of the index).
  out.excerpt = (note.excerpt || '').slice(0, 140);
  // Lowercase compact search key: title + glosses + inflected forms, so typing
  // an inflected surface (e.g. "arbetade") still finds its lemma ("arbeta").
  out.search = [note.title, note.lemma, note.zh, note.en, (note.forms || []).join(' ')]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return out;
});

const bodies = {};
for (const note of notes) {
  bodies[note.slug] = {
    body: note.body,
    links: note.links,
    backlinks: note.backlinks,
    path: note.path,
  };
}

const indexJs = `window.KB_INDEX = ${JSON.stringify({ generatedAt, notes: indexNotes })};\n`;
fs.writeFileSync(indexPath, indexJs, 'utf8');
console.log(`Generated ${indexPath} with ${indexNotes.length} notes (${(indexJs.length / 1048576).toFixed(2)} MB).`);

const bodiesJs = `window.KB_BODIES = ${JSON.stringify(bodies)};\n`;
fs.writeFileSync(bodiesPath, bodiesJs, 'utf8');
console.log(`Generated ${bodiesPath} with ${Object.keys(bodies).length} bodies (${(bodiesJs.length / 1048576).toFixed(2)} MB).`);

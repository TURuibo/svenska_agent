#!/usr/bin/env node
/**
 * tools/dedup.js — deduplicate a `svensk-export v1` block against the live knowledge base,
 * so no agent has to read knowledge_base/_index/slugs.json (~120 KB ≈ 33k tokens) or scan folders.
 *
 * Usage:
 *   node tools/dedup.js <file.md>        # inbox/… or imported/… file containing a fenced svensk-export block
 *   node tools/dedup.js -                # read the block (or a whole file) from stdin (pasted block)
 *   options: --json   machine-readable
 *            --all    process every svensk-export block in the file (default: first block only)
 *            --root <repo root>
 *
 * What it does, per item in the block:
 *   1. computes the slug exactly per .claude/skills/sv-knowledge-base/SKILL.md §2
 *      (word = lemma; phrase = words joined by "-"; grammar = "grammar-<term>"; sentence = "sent-<first 5 words>")
 *   2. checks the KB three ways: exact slug, diacritic-folded slug (å→a ä→a ö→o, so `grammar-v2-ordfoljd`
 *      still matches "V2-ordföljd"), and — for phrases / sentences — the normalized Swedish text in the
 *      existing notes' frontmatter (`phrase:` / `sentence:`), which catches near-duplicate slugs
 *   3. marks items KNOWN when the matched note has `known: true` or the lemma is in the 已掌握 list of
 *      profile/level.md
 *
 * Output (text mode) lists NEW items with the full original line plus the slug to use, and DUP/KNOWN items
 * as slug pairs — a few hundred tokens instead of a 33k-token manifest. Feed the NEW block straight to
 * sv-librarian / sv-importer; they should not re-check the manifest.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const opts = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json' || a === '--all') opts[a.slice(2)] = true;
  else if (a === '--root') opts.root = argv[++i];
  else positional.push(a);
}
const ROOT = opts.root ? path.resolve(opts.root) : path.resolve(__dirname, '..');
const KB = path.join(ROOT, 'knowledge_base');
const DIRS = { word: 'words', phrase: 'phrases', sentence: 'sentences', grammar: 'grammar' };
const SECTION_TYPE = { words: 'word', phrases: 'phrase', sentences: 'sentence', grammar: 'grammar' };

function die(msg) { console.error(`dedup.js: ${msg}`); process.exit(1); }

// ---------------------------------------------------------------- slug rules (SKILL §2)
function fold(s) {
  return s.toLowerCase().replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e').replace(/ü/g, 'u');
}
function baseSlug(text) {
  return text.trim().toLowerCase()
    .replace(/[.,!?;:"'“”‘’()\[\]]+$/g, '')      // trailing punctuation
    .replace(/[^\p{L}\p{N}\s-]/gu, '')          // strip other punctuation
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
function wordSlug(lemma) { return baseSlug(lemma.replace(/^(att|en|ett)\s+/i, '')); }
function phraseSlug(p) { return baseSlug(p); }
function grammarSlug(term) {
  const s = baseSlug(term.replace(/^grammar-/i, ''));
  return `grammar-${s}`;
}
function sentenceSlug(sv) {
  const tokens = sv.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  let slug = 'sent-' + tokens.slice(0, 5).join('-');
  if (slug.length > 50) slug = slug.slice(0, 50).replace(/-[^-]*$/, '');
  return slug;
}
function normText(s) {
  return fold(s).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- KB index
function readFrontmatter(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return {}; }
  if (!text.startsWith('---')) return {};
  const end = text.indexOf('\n---', 3);
  if (end < 0) return {};
  const fm = {};
  for (const ln of text.slice(3, end).split('\n')) {
    const m = /^([A-Za-z_]+):\s*(.*)$/.exec(ln);
    if (m) fm[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return fm;
}

function buildIndex() {
  const idx = {};
  for (const [type, dir] of Object.entries(DIRS)) {
    const full = path.join(KB, dir);
    const exact = new Map();   // slug → slug
    const folded = new Map();  // folded slug → slug
    const text = new Map();    // normalized sv text → slug (phrase/sentence/grammar)
    const hasText = new Set(); // slugs whose note carries a text field (so text mismatch is meaningful)
    const known = new Set();
    if (fs.existsSync(full)) {
      for (const f of fs.readdirSync(full)) {
        if (!f.endsWith('.md')) continue;
        const slug = f.slice(0, -3);
        exact.set(slug, slug);
        if (!folded.has(fold(slug))) folded.set(fold(slug), slug);
        if (type === 'phrase' || type === 'sentence' || type === 'grammar') {
          const fm = readFrontmatter(path.join(full, f));
          const sv = fm.phrase || fm.sentence || fm.name || '';
          if (sv) { const n = normText(sv); if (!text.has(n)) text.set(n, slug); hasText.add(slug); }
          if (String(fm.known).toLowerCase() === 'true') known.add(slug);
        }
      }
    }
    idx[type] = { exact, folded, text, hasText, known };
  }
  // words: known flag needs frontmatter too, but only read it for matched items (lazy) — see isKnownWord
  return idx;
}
function isKnownNote(type, slug) {
  const fm = readFrontmatter(path.join(KB, DIRS[type], `${slug}.md`));
  return String(fm.known).toLowerCase() === 'true';
}

function knownFromProfile() {
  const file = path.join(ROOT, 'profile', 'level.md');
  const set = new Set();
  if (!fs.existsSync(file)) return set;
  const text = fs.readFileSync(file, 'utf8');
  const m = /## ✅ 已掌握[\s\S]*?(?=\n## |$)/.exec(text);
  if (!m) return set;
  for (const ln of m[0].split('\n')) {
    const b = /^\s*[-*]\s+(.+)$/.exec(ln);
    if (!b || /^_?\(?空/.test(b[1])) continue;
    // "- arbeta, jobba, hus (n.)" or "- [[arbeta]]"
    for (const part of b[1].split(/[,，;；]/)) {
      const w = part.replace(/\[\[|\]\]|`/g, '').replace(/\(.*?\)/g, '').trim().toLowerCase();
      if (w && !/\s/.test(w)) set.add(w);
    }
  }
  return set;
}

// ---------------------------------------------------------------- block parsing
function readInput() {
  const src = positional[0];
  if (!src) die('give an inbox/imported file path, or - for stdin');
  if (src === '-') return { label: 'stdin', text: fs.readFileSync(0, 'utf8') };
  const file = path.isAbsolute(src) ? src : path.join(ROOT, src);
  if (!fs.existsSync(file)) die(`no such file: ${src}`);
  return { label: path.relative(ROOT, file).replace(/\\/g, '/'), text: fs.readFileSync(file, 'utf8') };
}

function extractBlocks(text) {
  const blocks = [];
  const re = /```svensk-export[^\n]*\n([\s\S]*?)\n```/g;
  let m;
  while ((m = re.exec(text))) blocks.push(m[1]);
  if (!blocks.length && /^(date|source|words|phrases|sentences|grammar):/m.test(text)) blocks.push(text); // bare block
  return blocks;
}

function parseBlock(body) {
  const out = { date: '', source: '', words: [], phrases: [], sentences: [], grammar: [] };
  let section = null;
  for (const raw of body.replace(/\r/g, '').split('\n')) {
    const ln = raw.trimEnd();
    if (!ln.trim()) continue;
    const head = /^(date|source|words|phrases|sentences|grammar):\s*(.*)$/.exec(ln);
    if (head) {
      if (head[1] === 'date' || head[1] === 'source') { out[head[1]] = head[2].trim(); section = null; }
      else section = head[1];
      continue;
    }
    const item = /^\s*-\s+(.*)$/.exec(ln);
    if (item && section) {
      const fields = item[1].split('|').map((s) => s.trim());
      out[section].push({ line: item[1].trim(), fields });
    }
  }
  return out;
}

// ---------------------------------------------------------------- dedup
function dedup(block, idx, profileKnown) {
  const result = { date: block.date, source: block.source, new: {}, dup: {}, known: {} };
  const seenInBlock = new Set();
  for (const section of Object.keys(SECTION_TYPE)) {
    const type = SECTION_TYPE[section];
    result.new[section] = []; result.dup[section] = []; result.known[section] = [];
    const usedSlugs = new Set();
    for (const it of block[section]) {
      const sv = it.fields[0] || '';
      if (!sv) continue;
      let slug;
      if (type === 'word') slug = wordSlug(sv);
      else if (type === 'phrase') slug = phraseSlug(sv);
      else if (type === 'grammar') slug = grammarSlug(sv);
      else slug = sentenceSlug(sv);

      const textual = type === 'phrase' || type === 'sentence';
      const key = textual ? `${type}:${normText(sv)}` : `${type}:${slug}`;
      if (seenInBlock.has(key)) { result.dup[section].push({ sv, slug, match: slug, via: 'duplicate in block' }); continue; }
      seenInBlock.add(key);

      const ix = idx[type];
      let match = null, via = '';
      const bySlug = ix.exact.has(slug) ? slug : (ix.folded.has(fold(slug)) ? ix.folded.get(fold(slug)) : null);
      if (textual) {
        // phrases / sentences: the Swedish text decides; a slug collision with a different text is a
        // different item and gets a -2/-3 suffix (SKILL §2)
        if (ix.text.has(normText(sv))) { match = ix.text.get(normText(sv)); via = 'same text'; }
        else if (bySlug && !ix.hasText.has(bySlug)) { match = bySlug; via = 'slug (note has no text field)'; }
        else if (bySlug) {
          let n = 2, s = `${slug}-${n}`;
          while (ix.exact.has(s) && ix.text.get(normText(sv)) !== s) s = `${slug}-${++n}`;
          slug = s;
        }
      } else if (bySlug) {
        match = bySlug; via = bySlug === slug ? 'slug' : 'slug (å/ä/ö folded)';
      } else if (type === 'grammar' && ix.text.has(normText(sv))) {
        match = ix.text.get(normText(sv)); via = 'same name';
      }

      if (match) {
        const known = ix.known.has(match) || (type === 'word' && isKnownNote(type, match)) || profileKnown.has(slug);
        (known ? result.known : result.dup)[section].push({ sv, slug, match, via });
      } else if (type === 'word' && profileKnown.has(slug)) {
        result.known[section].push({ sv, slug, match: null, via: 'profile 已掌握' });
      } else {
        // collision-free slug for new sentences within this batch
        let s = slug, n = 2;
        while (usedSlugs.has(s)) s = `${slug}-${n++}`;
        usedSlugs.add(s);
        result.new[section].push({ sv, slug: s, line: it.line, fields: it.fields });
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------- output
function printText(label, r) {
  const count = (o) => Object.values(o).reduce((a, b) => a + b.length, 0);
  console.log(`DEDUP ${label}  (date: ${r.date || '?'} · source: ${r.source || '?'})`);
  console.log(`NEW ${count(r.new)} · DUP ${count(r.dup)} · KNOWN ${count(r.known)}`);
  for (const section of Object.keys(SECTION_TYPE)) {
    const items = r.new[section];
    if (!items.length) continue;
    console.log(`\nNEW ${section} (${items.length}):`);
    for (const it of items) console.log(`- ${it.line}    → ${it.slug}`);
  }
  for (const kind of ['dup', 'known']) {
    const lines = [];
    for (const section of Object.keys(SECTION_TYPE)) {
      for (const it of r[kind][section]) lines.push(`${section === 'grammar' ? 'grammar' : section.slice(0, -1)} ${it.sv} → ${it.match || '(profile)'}${it.via && it.via !== 'slug' ? ` [${it.via}]` : ''}`);
    }
    if (lines.length) console.log(`\n${kind.toUpperCase()} (${lines.length}): ` + lines.join('; '));
  }
  if (!count(r.new)) console.log('\nNothing new — skip the librarian, just archive the file.');
}

// ---------------------------------------------------------------- main
const { label, text } = readInput();
const blocks = extractBlocks(text);
if (!blocks.length) die(`no svensk-export block found in ${label}`);
const idx = buildIndex();
const profileKnown = knownFromProfile();
const chosen = opts.all ? blocks : [blocks[0]];
const results = chosen.map((b) => dedup(parseBlock(b), idx, profileKnown));
if (opts.json) {
  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
} else {
  results.forEach((r, i) => { if (i) console.log('\n' + '─'.repeat(60)); printText(label, r); });
}

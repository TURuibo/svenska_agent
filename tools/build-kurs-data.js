#!/usr/bin/env node
// Build the data behind the 📘 Kurs site (site/kurs/): every lesson in imported/
// that carries a `## 🔍 逐段精读` section is turned into one structured JSON-like
// object (paragraphs → sentences → structure chunks / points / translation,
// phrase + vocab tables, export-block items, and every KB note the lesson touches).
//
// Outputs (both gitignored, built fresh by the GitHub Action — see CLAUDE.md §4.7):
//   site/kurs/kurs-index.js        → window.KURS_INDEX   (home screen: one row per lesson)
//   site/kurs/data/<slug>.js       → window.KURS_LESSONS['<slug>'] = {...}   (one lesson)
//
// The data contract is frozen in site/kurs/SPEC.md §6. Nothing from a lesson's
// 精读 section may be dropped: lines that don't fit a field land in `extraMd` /
// `extra` / `guideMd`, and `--check` proves it with a line-level reconciliation.
//
//   node tools/build-kurs-data.js            build everything
//   node tools/build-kurs-data.js --check    build in memory + verify (no files written);
//                                            non-zero exit on any hard mismatch
//
// No npm dependencies. Reads imported/*.md, knowledge_base/**, listening/*.json.
'use strict';
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const importedDir = path.join(repoRoot, 'imported');
const kbDir = path.join(repoRoot, 'knowledge_base');
const listenDir = path.join(repoRoot, 'listening');
const outDir = path.join(repoRoot, 'site', 'kurs');
const dataDir = path.join(outDir, 'data');
// ~250 KB gzipped for the largest lesson; cached per lesson by kurs/sw.js. Raised from 600 KB
// (2026-11-15): three lessons need 630-750 KB to keep every word's full note.
const MAX_BYTES = 800 * 1024;
const CHECK = process.argv.includes('--check');
const VERBOSE = process.argv.includes('--verbose');

const SECTION_MARK = /^##\s+🔍\s*逐段精读/;
const CIRCLED = '①-⑳㉑-㉟㊱-㊿'; // ①…⑳ ㉑…㉟ ㊱…㊿
const RE_SENT = new RegExp('^\\*\\*\\s*[' + CIRCLED + ']');
const RE_WIKI = /\[\[([^\]|\\#]+?)\s*(?:[|\\#][^\]]*)?\]\]/g;

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r/g, '');
const nz = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '');
const tokens = (s) => String(s || '').toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) || [];
const unlink = (s) => String(s || '').replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (m, a, b) => b || a);
const plain = (s) => unlink(s).replace(/[`*]/g, '').replace(/\s+/g, ' ').trim();
const hyph = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, '-');
const CJK = /[㐀-鿿]/;

function wikiTargets(text) {
  const out = [];
  String(text || '').replace(RE_WIKI, (m, a) => { out.push(a.trim()); return m; });
  return out;
}

// Flat YAML scalars only (same approach as build-reading-site.js).
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  for (const line of m[1].split('\n')) {
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;
    const kv = line.match(/^([^\s:][^:]*):\s*(.*)$/);
    if (!kv) continue;
    fm[kv[1].trim()] = kv[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return { fm, body: m[2] };
}

// Split a markdown table row on `|`, keeping `[[a|b]]` wikilinks intact and
// treating `\|` as a literal pipe.
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  let depth = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s.startsWith('[[', i)) { depth += 1; cur += '[['; i += 1; continue; }
    if (s.startsWith(']]', i) && depth) { depth -= 1; cur += ']]'; i += 1; continue; }
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i += 1; continue; }
    if (s[i] === '|' && depth === 0) { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}
const isSepRow = (cells) => cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '');

// ---------------------------------------------------------------------------
// Knowledge base: indexes + note parsing
// ---------------------------------------------------------------------------
const KB_DIRS = [
  ['words', 'word'], ['phrases', 'phrase'], ['grammar', 'grammar'],
  ['sentences', 'sentence'], ['topics', 'topic'], ['sources', 'source'],
];
const TYPE_BY_DIR = Object.fromEntries(KB_DIRS);
const noteDirs = new Map();   // slug → [dir, …] (a few slugs exist in words/ AND phrases/)
for (const [dir] of KB_DIRS) {
  const d = path.join(kbDir, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d).sort()) {
    if (!f.endsWith('.md')) continue;
    const slug = f.slice(0, -3);
    if (!noteDirs.has(slug)) noteDirs.set(slug, []);
    noteDirs.get(slug).push(dir);
  }
}
const noteExists = (slug) => noteDirs.has(slug);

// --- surface forms: copied from build-reading-site.js so `forms` matches what the
// reading site highlights. ---
function cleanForm(value) {
  let v = value.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, '$1');
  v = v.replace(/\([^)]*\)/g, ' ');
  v = v.replace(/[`*_]/g, '');
  v = v.replace(/\s+/g, ' ').trim();
  v = v.replace(/^att\s+/i, '');
  v = v.replace(/^(en|ett)\s+/i, '');
  v = v.replace(/^[^A-Za-zÅÄÖåäö]+|[^A-Za-zÅÄÖåäö]+$/g, '');
  return v.trim();
}
const FORM_FILLER = new Set(['sig', 'mig', 'dig', 'oss', 'er', 'den', 'det', 'de', 'en', 'ett', 'att',
  'har', 'hade', 'är', 'var', 'blir', 'blev', 'mer', 'mest', 'som', 'han', 'hon', 'jag', 'vi', 'ni']);
function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}
function formFromPhrase(cell, lemma) {
  if (/\s/.test(String(lemma || '').trim().replace(/\s+sig$/i, ''))) return '';
  const words = cell.split(/\s+/).map((w) => w.replace(/[^A-Za-zÀ-ÿ-]/g, '')).filter(Boolean);
  const rest = words.filter((w) => !FORM_FILLER.has(w.toLowerCase()));
  if (rest.length === 1) return rest[0];
  const stem = String(lemma || '').toLowerCase().split(/\s+/)[0];
  const need = Math.max(3, stem.length - 3);
  const hits = rest.filter((w) => commonPrefix(w.toLowerCase(), stem) >= need);
  return hits.length === 1 ? hits[0] : '';
}
function extractForms(body, lemma) {
  const lines = body.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/语法变形/.test(lines[i]) || /^#{2,3}\s+.*\bForms\b/i.test(lines[i])) { start = i + 1; break; }
  }
  if (start === -1) return [];
  const tableLines = [];
  for (let i = start; i < lines.length; i += 1) {
    const ln = lines[i];
    if (/^\s*\|/.test(ln)) { tableLines.push(ln); continue; }
    if (tableLines.length) break;
    if (/^\s*$/.test(ln)) continue;
    if (/^#{1,6}\s/.test(ln)) break;
  }
  if (tableLines.length < 2) return [];
  const rows = tableLines.map((ln) => ln.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
  const bodyRows = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));
  if (bodyRows.length < 2) return [];
  const forms = [];
  const seen = new Set();
  for (const row of bodyRows.slice(1)) {
    for (let c = 1; c < row.length; c += 1) {
      if (!row[c]) continue;
      for (const piece of row[c].split(/[\/,]/)) {
        const cleaned = cleanForm(piece);
        if (!cleaned || cleaned === '—' || cleaned === '-') continue;
        if (!/[A-Za-zÅÄÖåäö]/.test(cleaned)) continue;
        const form = /\s/.test(cleaned) ? formFromPhrase(cleaned, lemma) : cleaned;
        if (!form) continue;
        const key = form.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        forms.push(form);
      }
    }
  }
  return forms;
}

// Vocabulary index (mirror of buildVocab + reading.js vocabIndex/findVocab).
const wordInfo = new Map();      // slug → { lemma, ordklass, ... }
const lemmaToSlug = new Map();   // lowercased lemma → slug (first, by sorted slug)
const vocabIndex = new Map();    // lowercased surface → word entry
(function buildVocabIndex() {
  const dir = path.join(kbDir, 'words');
  const vocab = [];
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.md')) continue;
    const { fm, body } = parseFrontmatter(read(path.join(dir, f)));
    const slug = f.slice(0, -3);
    const lemma = fm.lemma || slug;
    const reflexive = /^(\S+)\s+sig$/i.exec(lemma);
    const forms = [lemma, ...(reflexive ? [reflexive[1]] : []), ...extractForms(body, lemma)];
    const seen = new Set();
    const surfaces = [];
    for (const x of forms) {
      const k = (x || '').toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      surfaces.push(x);
    }
    vocab.push({ slug, lemma, ordklass: fm.ordklass || '', forms: surfaces });
  }
  vocab.sort((a, b) => a.lemma.localeCompare(b.lemma));
  for (const v of vocab) {
    wordInfo.set(v.slug, v);
    const lk = v.lemma.toLowerCase();
    if (!lemmaToSlug.has(lk)) lemmaToSlug.set(lk, v.slug);
    for (const form of v.forms) {
      const key = form.toLowerCase();
      const existing = vocabIndex.get(key);
      if (!existing) vocabIndex.set(key, v);
      else if (existing.lemma.toLowerCase() !== key && v.lemma.toLowerCase() === key) vocabIndex.set(key, v);
    }
  }
}());
const S_FALLBACK_STOP = new Set(['rätts']);
function findVocab(token) {
  const raw = String(token || '');
  const k = raw.toLowerCase();
  const hit = vocabIndex.get(k);
  if (hit) return hit;
  if (k.length >= 5 && k.endsWith('s') && !/^[A-ZÅÄÖ]/.test(raw) && !S_FALLBACK_STOP.has(k)) {
    const e = vocabIndex.get(k.slice(0, -1));
    if (e && !/^adj(ektiv)?\.?$/i.test(String(e.ordklass || '').trim())) return e;
  }
  if (k.endsWith('aste')) return vocabIndex.get(k.slice(0, -1)) || null;
  return null;
}

// Lookup maps for resolving export-block items to notes.
const phraseKey = new Map();   // nz(phrase) → slug
const grammarKey = new Map();  // nz(name|title) → slug
(function buildOtherIndexes() {
  const add = (map, key, slug) => { const k = nz(key); if (k && !map.has(k)) map.set(k, slug); };
  for (const f of fs.readdirSync(path.join(kbDir, 'phrases')).sort()) {
    if (!f.endsWith('.md')) continue;
    const { fm } = parseFrontmatter(read(path.join(kbDir, 'phrases', f)));
    add(phraseKey, fm.phrase || '', f.slice(0, -3));
    add(phraseKey, f.slice(0, -3), f.slice(0, -3));
  }
  for (const f of fs.readdirSync(path.join(kbDir, 'grammar')).sort()) {
    if (!f.endsWith('.md')) continue;
    const { fm } = parseFrontmatter(read(path.join(kbDir, 'grammar', f)));
    add(grammarKey, fm.name || '', f.slice(0, -3));
    add(grammarKey, fm.title || '', f.slice(0, -3));
  }
}());

// Split a note body into header lines (before the first `## `) and `##` sections.
function splitSections(body) {
  const lines = body.split('\n');
  const head = [];
  const secs = [];
  let cur = null;
  let fence = false;
  for (const ln of lines) {
    if (/^```/.test(ln)) fence = !fence;
    if (!fence && /^## /.test(ln)) {
      cur = { heading: ln.replace(/^##\s+/, '').trim(), lines: [] };
      secs.push(cur);
      continue;
    }
    (cur ? cur.lines : head).push(ln);
  }
  return { head, secs };
}
const trimBlank = (lines) => {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a].trim()) a += 1;
  while (b > a && !lines[b - 1].trim()) b -= 1;
  return lines.slice(a, b);
};
const shortHeading = (h) => h.replace(/\s*\([A-Za-z][^)]*\)\s*$/, '').trim();
const cleanCell = (c) => unlink(c).replace(/[`*]/g, '').trim();

// A "clean" forms table = header + rows, exactly 2 columns. Returns
// { table, rest } where `rest` is the section text that is not that table.
function extractFormsTable(lines) {
  let a = -1;
  let b = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^\s*\|/.test(lines[i])) { if (a < 0) a = i; b = i; } else if (a >= 0) break;
  }
  if (a < 0 || b - a < 1) return { table: [], rest: lines };
  const rows = lines.slice(a, b + 1).map(splitRow);
  const bodyRows = rows.filter((r) => !isSepRow(r));
  if (bodyRows.length < 2 || bodyRows.some((r) => r.length !== 2)) return { table: [], rest: lines };
  const table = bodyRows.slice(1).map((r) => [cleanCell(r[0]), cleanCell(r[1])]);
  return { table, rest: lines.slice(0, a).concat(lines.slice(b + 1)) };
}

const noteCache = new Map();
const stats = { formsClean: 0, formsOther: 0, formsNone: 0 };
function readNote(slug, pref) {
  const dirs = noteDirs.get(slug);
  if (!dirs) return null;
  const dir = dirs.includes(pref) ? pref : dirs[0];
  const key = dir + '/' + slug;
  if (noteCache.has(key)) return noteCache.get(key);
  const type = TYPE_BY_DIR[dir];
  const { fm, body } = parseFrontmatter(read(path.join(kbDir, dir, slug + '.md')));
  const { head, secs } = splitSections(body);
  const headLines = head.filter((l) => !/^#\s/.test(l));
  const note = { slug, dir, type, fm, head: headLines, secs };
  noteCache.set(key, note);
  return note;
}

function exFromSecs(secs) {
  const out = [];
  for (const s of secs) {
    if (!/例句|exempel|Sentences/i.test(s.heading)) continue;
    for (const ln of s.lines) {
      const m = ln.match(/🇸🇪\s*(.+?)\s*[—–]\s*🇨🇳\s*(.+?)\s*$/);
      if (!m) continue;
      out.push([plain(m[1]), plain(m[2])]);
      if (out.length >= 2) return out;
    }
  }
  return out;
}

function ipaFrom(line) {
  const m = line.match(/\/[^\/\n]{1,70}\//) || line.match(/\[[^\]\n]*[ˈˌːɛɪʏɔʊøɑæɐə][^\]\n]*\]/);
  return m ? m[0] : '';
}

function buildKbEntry(slug, lvl, pref) {
  const n = readNote(slug, pref);
  if (!n) return null;
  const { fm, type } = n;
  const full = lvl === 'full';
  const mkSecs = (list) => list.map((s) => ({ h: shortHeading(s.heading), md: trimBlank(s.lines).join('\n') }))
    .filter((s) => s.md || s.h);
  if (type === 'word') {
    const e = {
      t: 'word', title: fm.lemma || slug, pos: fm.ordklass || '', genus: fm.genus || '', cefr: fm.cefr || '',
      zh: fm.zh || '', en: fm.en || '', ipa: '', pron: '', def: '',
      table: [], secs: [], lvl, ex: [], known: fm.known === 'true' ? 1 : 0,
    };
    const leftover = [];
    for (const ln of n.head) {
      if (!ln.trim()) continue;
      if (/^📖\s*中文/.test(ln)) continue;                       // = fm.zh / fm.en
      const d = ln.match(/^🇸🇪\s*Förklaring:?\s*(.*)$/);
      if (d) { e.def = d[1].trim(); continue; }
      if (/^发音提示[:：]/.test(ln)) { e.pron = ln.trim(); e.ipa = ipaFrom(ln); continue; }
      leftover.push(ln);
    }
    const rest = [];
    let sawForms = false;
    for (const s of n.secs) {
      if (!sawForms && (/语法变形/.test(s.heading) || /^变形\b/.test(s.heading) || /\bForms\b/i.test(s.heading))) {
        sawForms = true;
        const { table, rest: r } = extractFormsTable(s.lines);
        if (table.length) {
          stats.formsClean += 1;
          e.table = table;
          if (full && trimBlank(r).length) rest.push({ heading: s.heading, lines: r });
        } else {
          stats.formsOther += 1;
          rest.push(s);
        }
        continue;
      }
      rest.push(s);
    }
    if (!sawForms) stats.formsNone += 1;
    e.ex = exFromSecs(n.secs);
    if (full) {
      const secs = mkSecs(rest);
      const lo = trimBlank(leftover).join('\n');
      if (lo) secs.unshift({ h: '说明', md: lo });
      e.secs = secs;
    }
    return e;
  }
  const secs = mkSecs(n.secs);
  const lo = trimBlank(n.head.filter((l) => !/^一句话[:：]/.test(l))).join('\n');
  if (lo) secs.unshift({ h: '概要', md: lo });
  if (type === 'phrase') {
    return { t: 'phrase', title: fm.phrase || slug, zh: fm.zh || '', en: fm.en || '', cat: fm.category || '', secs };
  }
  if (type === 'grammar') {
    const tip = (n.head.join('\n').match(/^一句话[:：]\s*(.+)$/m) || [])[1] || '';
    return { t: 'grammar', title: fm.name || slug, zh: fm.zh || '', en: fm.en || '', tip: tip.trim(), secs };
  }
  if (type === 'topic') return { t: 'topic', title: fm.slug || slug, zh: fm.zh || '', secs };
  if (type === 'source') return { t: 'source', title: fm.title || slug, zh: '', secs: [] };
  return { t: 'sentence', title: fm.sentence || slug, zh: fm.zh || '', secs: [] };
}

// ---------------------------------------------------------------------------
// Export-block items (words / phrases / sentences / grammar)
// ---------------------------------------------------------------------------
function parseExportItem(section, raw) {
  const parts = raw.split('|').map((p) => p.trim());
  if (section === 'sentences') return { sv: parts[0] || '', zh: parts[1] || '' };
  if (section === 'grammar') return { sv: parts[0] || '', zh: parts[1] || '', en: parts[2] || '' };
  if (parts.length === 3 && CJK.test(parts[1])) return { sv: parts[0], pos: '', zh: parts[1], en: parts[2] };
  return { sv: parts[0] || '', pos: parts[1] || '', zh: parts[2] || '', en: parts[3] || '' };
}
function parseExport(lines) {
  const items = { words: [], phrases: [], sentences: [], grammar: [] };
  let inBlock = false;
  let section = null;
  for (const line of lines) {
    if (/^```/.test(line)) {
      if (!inBlock && /svensk-export/.test(line)) { inBlock = true; section = null; continue; }
      if (inBlock) { inBlock = false; section = null; continue; }
    }
    if (!inBlock) continue;
    const sec = line.match(/^(?:#\s*)?(words|phrases|sentences|grammar)\s*:?\s*$/);
    if (sec) { section = sec[1]; continue; }
    if (section && !/^\s*#/.test(line) && (/^-\s+\S/.test(line) || /\|/.test(line))) {
      items[section].push(parseExportItem(section, line.replace(/^\s*-\s+/, '').replace(/^sv:\s*/, '').trim()));
    }
  }
  return items;
}

function resolveWordItem(sv) {
  const s = sv.trim();
  const h = hyph(s);
  if (noteDirs.has(h)) return h;
  const byLemma = lemmaToSlug.get(s.toLowerCase());
  if (byLemma) return byLemma;
  if (/^[\p{L}-]+$/u.test(s)) { const v = findVocab(s); if (v) return v.slug; }
  const pk = phraseKey.get(nz(s));
  return pk || '';
}
function resolvePhraseItem(sv) {
  const s = sv.trim();
  const h = hyph(s);
  if (noteDirs.get(h) && noteDirs.get(h).includes('phrases')) return h;
  const pk = phraseKey.get(nz(s));
  if (pk) return pk;
  if (noteDirs.has(h)) return h;
  return '';
}
function resolveGrammarItem(name) {
  const k = grammarKey.get(nz(name));
  if (k) return k;
  const bare = grammarKey.get(nz(String(name).replace(/\([^)]*\)/g, '')));
  return bare || '';
}

// ---------------------------------------------------------------------------
// 📐 structure line → chunks
// ---------------------------------------------------------------------------
// Returns { chunks, why }. chunks === null when the line does not reduce to
// `text`(role) + `text`(role) … in order AND the chunk texts do not reconstruct
// the sentence's words in order (ignoring punctuation / case / ⟨⟩).
//   level 0  `text`(role) only
//   level 1  + ⟨clause⟩(role)  — a bracketed clause that carries a role
//   level 2  + role-less `text` / ⟨clause⟩ with r:''  (SHIPPED — SPEC §6: a piece the
//              guide left unlabelled is still a correct chunk; it just gets no role)
const SHIP_LEVEL = 2;
function parseChunks(struct, sentence, level) {
  if (!struct) return { chunks: null, why: 'no 📐 line' };
  if (/\n/.test(struct)) return { chunks: null, why: 'several 📐 lines / sub-bullets' };
  const s = struct.trim();
  const reRole = level >= 1
    ? /(?:`([^`]+)`|(⟨[^⟨⟩]+⟩))\(([^()]*)\)/y
    : /(?:`([^`]+)`())\(([^()]*)\)/y;
  const reBare = /`([^`]+)`|(⟨[^⟨⟩]+⟩)/y;
  const chunks = [];
  let pos = 0;
  while (pos < s.length) {
    reRole.lastIndex = pos;
    let m = reRole.exec(s);
    if (m && m[3].trim()) {
      chunks.push({ t: (m[1] || m[2]).trim(), r: m[3].trim() });
      pos = reRole.lastIndex;
    } else if (level >= 2 && (reBare.lastIndex = pos, (m = reBare.exec(s)))) {
      chunks.push({ t: (m[1] || m[2]).trim(), r: '' });
      pos = reBare.lastIndex;
    } else {
      return { chunks: null, why: chunks.length ? 'chunk without role / text outside backticks' : 'prose or role-less start' };
    }
    const sep = /^\s*[+＋]\s*/.exec(s.slice(pos));
    if (sep) pos += sep[0].length;
    else if (s.slice(pos).trim()) return { chunks: null, why: 'trailing text after chunks' };
    else pos = s.length;
  }
  if (!chunks.length) return { chunks: null, why: 'empty' };
  const a = tokens(chunks.map((c) => c.t).join(' '));
  const b = tokens(sentence);
  if (a.length !== b.length || a.some((t, i) => t !== b[i])) {
    return { chunks: null, why: 'chunks do not reconstruct the sentence' };
  }
  return { chunks, why: '' };
}

// ---------------------------------------------------------------------------
// Lesson parsing
// ---------------------------------------------------------------------------
function h2Sections(lines) {
  const out = [];
  let fence = false;
  lines.forEach((ln, i) => {
    if (/^```/.test(ln)) fence = !fence;
    if (!fence && /^## /.test(ln)) out.push({ h: ln.replace(/^##\s+/, '').trim(), start: i });
  });
  out.forEach((s, k) => { s.end = k + 1 < out.length ? out[k + 1].start : lines.length; });
  return out;
}

function cleanSvLine(t) {
  let s = t.replace(/^-\s+/, '').trim();
  const m = s.match(/^\*\*(.+)\*\*$/);
  if (m && !m[1].includes('**')) s = m[1].trim();
  return s;
}

function parseTableRows(lines) {
  const rows = lines.map(splitRow);
  const header = rows[0] || [];
  const body = rows.slice(1).filter((r) => !isSepRow(r));
  return { header, body };
}
function colIndex(header, re, dflt) {
  const i = header.findIndex((h) => re.test(h));
  return i >= 0 ? i : dflt;
}

// Resolve a vocab/phrase cell to a kb slug. `wiki` = first [[target]] in the cell.
function firstWiki(cell) {
  const m = /\[\[([^\]|\\#]+?)\s*(?:[|\\#]([^\]]*))?\]\]/.exec(cell);
  return m ? { slug: m[1].trim(), label: (m[2] || '').trim() } : null;
}

function parseVocabRows(lines, ctx) {
  const { header, body } = parseTableRows(lines);
  const iForm = colIndex(header, /文中形式|形式/, 0);
  const iLem = colIndex(header, /原形/, 1);
  const iPos = colIndex(header, /词性/, 2);
  const iZh = colIndex(header, /中文/, 3);
  const iNote = colIndex(header, /说明/, 4);
  return body.map((r) => {
    const cells = r.slice();
    if (cells.length > iNote + 1) cells.splice(iNote, cells.length - iNote, cells.slice(iNote).join(' | '));
    const lemCell = cells[iLem] || '';
    const w = firstWiki(lemCell);
    let lemma = plain(lemCell);
    let slug = '';
    if (w) {
      lemma = w.label || w.slug;
      slug = noteExists(w.slug) ? w.slug : '';
      ctx.links.push(w.slug);
      if (slug) ctx.want(slug, 'words');
    } else if (lemma) {
      const cand = hyph(lemma);
      if (noteExists(cand)) slug = cand;
      else slug = lemmaToSlug.get(lemma.toLowerCase()) || '';
      if (slug) ctx.want(slug, 'words');
    }
    return {
      form: plain(cells[iForm] || ''), lemma, slug, pos: plain(cells[iPos] || ''),
      zh: (cells[iZh] || '').trim(), note: (cells[iNote] || '').trim(),
    };
  });
}

function parsePhraseRows(lines, ctx) {
  const { body } = parseTableRows(lines);
  return body.map((r) => {
    const cells = r.slice();
    if (cells.length > 3) cells.splice(2, cells.length - 2, cells.slice(2).join(' | '));
    const cell = cells[0] || '';
    const w = firstWiki(cell);
    let sv = plain(cell);
    let slug = '';
    if (w) {
      ctx.links.push(w.slug);
      if (noteExists(w.slug)) slug = w.slug;
      if (!(cell.replace(/\[\[[^\]]*\]\]/g, '').trim()) || /^\[\[[^\]]*\]\]$/.test(cell.trim())) {
        const n = slug ? readNote(slug, 'phrases') : null;
        sv = w.label || (n && n.type === 'phrase' && n.fm.phrase) || w.slug.replace(/-/g, ' ');
      }
    } else if (sv) {
      const k = phraseKey.get(nz(sv));
      if (k) slug = k;
      else if (noteDirs.get(hyph(sv)) && noteDirs.get(hyph(sv)).includes('phrases')) slug = hyph(sv);
    }
    if (slug) ctx.want(slug, 'phrases');
    return { sv, slug, zh: (cells[1] || '').trim(), use: (cells[2] || '').trim() };
  });
}

// Parse one `### …` paragraph block (lines = [{i, t}] after the heading).
function parseParagraph(heading, body, ctx) {
  const mStd = heading.t.match(/^###\s+¶\s*(\d+)\s*(?:[·:：\-–—]\s*)?(.*)$/);
  const para = { n: 0, kind: 'para', title: '', sv: '', zh: '', sents: [], phrases: [], vocab: [], extraMd: '' };
  if (mStd) {
    para.n = Number(mStd[1]);
    para.title = mStd[2];
  } else {
    para.kind = 'extra';
    para.n = 100 + ctx.extraCount;
    ctx.extraCount += 1;
    para.title = heading.t.replace(/^###\s+/, '');
  }
  para.title = para.title.replace(/\s*[（(]\s*\d+\s*[^）)]*[）)]\s*$/, '').trim();
  ctx.consume(heading.i);

  let state = 'pre';
  let cur = null;           // current sentence
  let last = null;          // last list item { get, set } for indented continuations
  let tbl = [];
  const svLines = [];
  const extra = [];
  let zh = null;
  const flushTable = () => {
    if (!tbl.length) return;
    if (state === 'phr') para.phrases.push(...parsePhraseRows(tbl, ctx));
    else if (state === 'voc') para.vocab.push(...parseVocabRows(tbl, ctx));
    tbl = [];
  };
  for (const L of body) {
    const t = L.t;
    if (!t.trim()) continue;
    if (/^-{3,}\s*$/.test(t.trim())) { ctx.consume(L.i); continue; }   // layout rule, not content
    if (/^####\s/.test(t)) {
      flushTable();
      ctx.consume(L.i);
      cur = null;
      last = null;
      if (/🔍/.test(t)) state = 'sents';
      else if (/🧩/.test(t)) state = 'phr';
      else if (/📚/.test(t)) state = 'voc';
      else { state = 'other'; extra.push(t); }
      continue;
    }
    ctx.consume(L.i);
    if (state === 'pre') {
      if (/^🇨🇳/.test(t) && zh === null) zh = t.replace(/^🇨🇳\s*/, '').trim();
      else if (zh !== null) extra.push(t);
      else svLines.push(cleanSvLine(t));
    } else if (state === 'sents') {
      if (RE_SENT.test(t)) {
        cur = { i: para.sents.length + 1, sv: t.replace(new RegExp('^\\*\\*\\s*[' + CIRCLED + ']\\s*'), '').replace(/\*\*\s*$/, '').trim(), chunks: null, struct: '', points: [], zh: '', key: 0, extra: [] };
        para.sents.push(cur);
        last = null;
      } else if (!cur) {
        extra.push(t);
      } else if (/^-\s*📐/.test(t)) {
        const v = t.replace(/^-\s*📐\s*/, '').trimEnd();
        cur.struct = cur.struct ? cur.struct + '\n' + v : v;
        last = { add: (x) => { cur.struct += '\n' + x; } };
      } else if (/^-\s*⚠️?/.test(t)) {
        const idx = cur.points.length;
        cur.points.push(t.replace(/^-\s*⚠️?\s*/, '').trimEnd());
        const sentRef = cur;
        last = { add: (x) => { sentRef.points[idx] += '\n' + x; } };
      } else if (/^-\s*🇨🇳/.test(t)) {
        const v = t.replace(/^-\s*🇨🇳\s*/, '').trimEnd();
        cur.zh = cur.zh ? cur.zh + '\n' + v : v;
        last = { add: (x) => { cur.zh += '\n' + x; } };
      } else if (/^\s+\S/.test(t) && last) {
        last.add(t.trimEnd());
      } else {
        cur.extra.push(t.trimEnd());
        last = null;
      }
    } else if (state === 'phr' || state === 'voc') {
      if (/^\s*\|/.test(t)) tbl.push(t); else { flushTable(); extra.push(t); }
    } else {
      extra.push(t);
    }
  }
  flushTable();
  para.sv = svLines.join('\n');
  para.zh = zh || '';
  const hasStructure = para.sents.length || para.vocab.length || para.phrases.length || zh !== null;
  if (para.kind === 'extra' && !hasStructure) {
    extra.unshift(...svLines);
    para.sv = '';
  }
  para.extraMd = extra.join('\n');
  return para;
}

function parseLesson(file) {
  const slug = file.replace(/\.md$/, '');
  const text = read(path.join(importedDir, file));
  const lines = text.split('\n');
  const secs = h2Sections(lines);
  const guide = secs.find((s) => SECTION_MARK.test('## ' + s.h));
  if (!guide) return null;

  // --- head: title + meta lines ---
  const h1 = lines.find((l) => /^# /.test(l)) || '';
  let title = h1.replace(/^#\s*/, '').replace(/^🇸🇪\s*/, '').trim();
  let sub = '';
  const pm = title.match(/\s*[（(]([^（）()]*)[）)]\s*$/);
  if (pm) { sub = pm[1].trim(); title = title.slice(0, pm.index).trim(); }
  const firstH2 = secs.length ? secs[0].start : lines.length;
  const meta = [];
  let cefr = '';
  let date = '';
  let book = '';
  for (const ln of lines.slice(0, firstH2)) {
    const m = ln.match(/^\*\*([^*]+?)[:：]\*\*\s*(.*)$/);
    if (!m) continue;
    const label = m[1].trim();
    if (/^CEFR/i.test(label)) { cefr = m[2].trim(); continue; }
    if (/^生成日期/.test(label)) { date = m[2].trim(); continue; }
    const k = label.replace(/\s*[（(][^）)]*[）)]\s*$/, '').trim();
    if (k === '体裁' && !book) book = m[2].trim();
    meta.push({ k, v: m[2].trim() });
  }
  if (!date) { const dm = slug.match(/(\d{4}-\d{2}-\d{2})/); date = dm ? dm[1] : ''; }

  // --- teaching notes ---
  const notes = [];
  const noteLines = [];
  const ns = secs.find((s) => /教学备注/.test(s.h));
  if (ns) {
    const nl = lines.slice(ns.start + 1, ns.end);
    const tbl = nl.filter((l) => /^\s*\|/.test(l));
    const rows = tbl.length ? parseTableRows(tbl).body : [];
    for (const r of rows) {
      const cells = r.length > 3 ? [r[0], r[1], r.slice(2).join(' | ')] : r;
      notes.push({ point: cells[0] || '', sv: cells[1] || '', zh: cells[2] || '' });
    }
    for (const l of nl) {
      if (!l.trim() || /^\s*\|/.test(l) || /^-{3,}\s*$/.test(l.trim())) continue;
      noteLines.push(l);
    }
  }

  // --- 精读 section ---
  const ctx = {
    consumed: new Set(), extraCount: 0, links: [], wants: new Map(),
    consume(i) { this.consumed.add(i); },
    want(slugW, type) { if (!this.wants.has(slugW)) this.wants.set(slugW, new Set()); this.wants.get(slugW).add(type); },
  };
  // the section ends at the export block (fenced or bare) as well as at the next `## `
  let end = guide.end;
  for (let i = guide.start + 1; i < guide.end; i += 1) {
    if (/^```\s*svensk-export/.test(lines[i]) || /^# (words|phrases|sentences|grammar)\s*$/.test(lines[i])) { end = i; break; }
  }
  const sec = [];
  for (let i = guide.start + 1; i < end; i += 1) sec.push({ i, t: lines[i] });
  const headIdx = sec.map((L, k) => (/^### /.test(L.t) ? k : -1)).filter((k) => k >= 0);
  const guideLines = [];
  const firstHead = headIdx.length ? headIdx[0] : sec.length;
  for (const L of sec.slice(0, firstHead)) {
    if (!L.t.trim() || /^-{3,}\s*$/.test(L.t.trim())) continue;
    guideLines.push(L.t.trimEnd());
    ctx.consume(L.i);
  }
  const paras = headIdx.map((k, n) => {
    const stop = n + 1 < headIdx.length ? headIdx[n + 1] : sec.length;
    return parseParagraph(sec[k], sec.slice(k + 1, stop), ctx);
  });
  // horizontal rules inside the section are layout only
  for (const L of sec) if (/^-{3,}\s*$/.test(L.t.trim())) ctx.consume(L.i);

  // --- export block ---
  const exp = parseExport(lines);
  const items = { words: [], phrases: [], grammar: [] };
  for (const w of exp.words) {
    const s = resolveWordItem(w.sv);
    if (s) ctx.want(s, 'words');
    items.words.push({ sv: w.sv, pos: w.pos, zh: w.zh, en: w.en, slug: s });
  }
  for (const p of exp.phrases) {
    const s = resolvePhraseItem(p.sv);
    if (s) ctx.want(s, 'phrases');
    items.phrases.push({ sv: p.sv, pos: p.pos, zh: p.zh, en: p.en, slug: s });
  }
  for (const g of exp.grammar) {
    const s = resolveGrammarItem(g.sv);
    if (s) ctx.want(s, 'grammar');
    items.grammar.push({ name: g.sv, zh: g.zh, en: g.en, slug: s });
  }

  // --- key sentences ---
  // an export `# sentences` row matches a lesson sentence when the normalised texts are equal
  // or one contains the other (export rows are sometimes a clause of the lesson sentence)
  const keyNorm = exp.sentences.map((s) => tokens(s.sv).join(' '));
  const keyHit = keyNorm.map(() => false);
  const keyMatch = (k, n) => k.length >= 12 && n.length >= 8 && (k === n || n.includes(k) || (n.length >= 12 && k.includes(n)));
  for (const p of paras) {
    for (const s of p.sents) {
      const n = tokens(s.sv).join(' ');
      s.key = 0;
      keyNorm.forEach((k, ki) => { if (keyMatch(k, n)) { s.key = 1; keyHit[ki] = true; } });
    }
  }
  const keyUnmatched = exp.sentences.filter((_, ki) => !keyHit[ki]).map((s) => s.sv);

  // --- chunks ---
  const chunkWhy = [];
  const chunkLevels = { 0: 0, 1: 0, 2: 0 };
  for (const p of paras) {
    for (const s of p.sents) {
      const r = parseChunks(s.struct, s.sv, SHIP_LEVEL);
      s.chunks = r.chunks;
      for (const lv of [0, 1, 2]) if (lv !== SHIP_LEVEL && parseChunks(s.struct, s.sv, lv).chunks) chunkLevels[lv] += 1;
      if (r.chunks) chunkLevels[SHIP_LEVEL] += 1;
      if (!r.chunks && s.struct) chunkWhy.push({ para: p.n, i: s.i, why: r.why, struct: s.struct, sv: s.sv });
    }
  }

  // --- links anywhere in the lesson (outside the export block) → kb ---
  const bodyNoExport = [];
  let inExp = false;
  for (const l of lines) {
    if (/^```\s*svensk-export/.test(l)) { inExp = true; continue; }
    if (inExp) { if (/^```\s*$/.test(l)) inExp = false; continue; }
    if (/^# (words|phrases|sentences|grammar)\s*$/.test(l)) continue;
    bodyNoExport.push(l);
  }
  const allLinks = wikiTargets(bodyNoExport.join('\n'));

  // --- Swedish text (for `forms` + lite words) ---
  const svParts = [];
  const orig = secs.find((s) => /^瑞典语原文|^Källtext/.test(s.h));
  if (orig) svParts.push(lines.slice(orig.start + 1, orig.end).join('\n'));
  for (const p of paras) {
    svParts.push(p.sv);
    for (const s of p.sents) svParts.push(s.sv);
    for (const ph of p.phrases) svParts.push(ph.sv);
    for (const v of p.vocab) svParts.push(v.form);
  }

  const lesson = {
    v: 1, slug, title, sub, cefr, date,
    meta, notes, notesMd: noteLines.join('\n'),
    paras, items, forms: {}, kb: {},
  };
  if (guideLines.length) lesson.guideMd = guideLines.join('\n');
  return {
    lesson, ctx, book, chunkWhy, chunkLevels, keyUnmatched, keyTotal: exp.sentences.length, allLinks, svText: svParts.join('\n'),
    sectionLines: sec, lines, guide: { start: guide.start, end }, expSentences: exp.sentences.length,
  };
}

// ---------------------------------------------------------------------------
// Complete a lesson: kb + forms
// ---------------------------------------------------------------------------
function completeLesson(parsed, report) {
  const { lesson, ctx, allLinks, svText } = parsed;
  // 1. which notes are wanted, and with which type preference
  const wants = new Map(ctx.wants);
  const want = (slug, type) => { if (!wants.has(slug)) wants.set(slug, new Set()); wants.get(slug).add(type); };
  for (const l of allLinks) if (noteExists(l)) want(l, 'words');
  // Links that appear only in phrase tables keep their phrase preference (already in wants).
  const pickPref = (slug) => {
    const types = wants.get(slug);
    const dirs = noteDirs.get(slug) || [];
    if (dirs.length > 1) {
      const pref = types && types.has('words') ? 'words' : (types && types.has('phrases') ? 'phrases' : dirs[0]);
      if (types && types.has('words') && types.has('phrases')) report.collisions.add(lesson.slug + ':' + slug);
      return pref;
    }
    return dirs[0];
  };
  const kb = {};
  for (const slug of [...wants.keys()].sort()) {
    if (!noteExists(slug)) continue;
    const pref = pickPref(slug);
    const e = buildKbEntry(slug, 'full', pref);
    if (e) kb[slug] = e;
  }
  // 2. forms: every token of the Swedish text that the reading site would highlight
  const forms = {};
  const seenTok = new Set();
  for (const m of svText.matchAll(/[A-Za-zÀ-ÿ]+/g)) {
    const raw = m[0];
    const k = raw.toLowerCase();
    if (forms[k] !== undefined) continue;
    const v = findVocab(raw);
    if (v) forms[k] = v.slug;
    else seenTok.add(k);
  }
  // author's own mapping from the 生词 tables, for single-token forms the site misses
  for (const p of lesson.paras) {
    for (const v of p.vocab) {
      if (!v.slug) continue;
      const toks = (v.form.match(/[A-Za-zÀ-ÿ]+/g) || []);
      if (toks.length !== 1) continue;
      const k = toks[0].toLowerCase();
      if (forms[k] === undefined) { forms[k] = v.slug; report.authorForms += 1; } else if (forms[k] !== v.slug) report.formConflicts.push(lesson.slug + ': ' + k + ' site→' + forms[k] + ' table→' + v.slug);
    }
  }
  // 3. lite words for forms targets that are not full yet
  for (const slug of [...new Set(Object.values(forms))].sort()) {
    if (kb[slug]) continue;
    const e = buildKbEntry(slug, 'lite', 'words');
    if (e) kb[slug] = e;
    else delete forms[Object.keys(forms).find((k) => forms[k] === slug)];
  }
  const sortedForms = {};
  for (const k of Object.keys(forms).sort()) sortedForms[k] = forms[k];
  const sortedKb = {};
  for (const k of Object.keys(kb).sort()) sortedKb[k] = kb[k];
  lesson.forms = sortedForms;
  lesson.kb = sortedKb;
}

// ---------------------------------------------------------------------------
// Listening episodes → lesson
// ---------------------------------------------------------------------------
function listeningBySlug() {
  const by = {};
  const multi = {};
  if (!fs.existsSync(listenDir)) return { by, multi };
  for (const name of fs.readdirSync(listenDir).sort()) {
    if (!name.endsWith('.json') || name.startsWith('_')) continue;
    let ep;
    try { ep = JSON.parse(read(path.join(listenDir, name))); } catch (_e) { continue; }
    if (!ep.readingSlug) continue;
    const hasCues = Array.isArray(ep.cues) && ep.cues.length > 0;
    const id = ep.id || name.replace(/\.json$/, '');
    (multi[ep.readingSlug] = multi[ep.readingSlug] || []).push(id + (hasCues ? '' : ' (no cues)'));
    const prev = by[ep.readingSlug];
    if (prev && (prev.hasCues || !hasCues)) continue;   // same rule as build-reading-site.js
    by[ep.readingSlug] = { id, hasCues };
  }
  return { by, multi };
}

// ---------------------------------------------------------------------------
// --check: independent reconciliation against the raw source
// ---------------------------------------------------------------------------
function sourceCounts(sectionLines) {
  const c = { paras: 0, parasStd: 0, sents: 0, struct: 0, points: 0, zh: 0, vocab: 0, phrases: 0, perSent: [] };
  let tbl = null;
  let cur = null;
  for (const { t } of sectionLines) {
    if (/^###\s/.test(t)) { c.paras += 1; if (/^###\s+¶/.test(t)) c.parasStd += 1; tbl = null; cur = null; continue; }
    if (/^####\s/.test(t)) { tbl = /📚/.test(t) ? 'vocab' : (/🧩/.test(t) ? 'phrases' : null); cur = null; continue; }
    if (RE_SENT.test(t)) { c.sents += 1; cur = { a: 0, w: 0, z: 0 }; c.perSent.push(cur); tbl = null; continue; }
    if (/^-\s*📐/.test(t)) { c.struct += 1; if (cur) cur.a += 1; continue; }
    if (/^-\s*⚠️?/.test(t)) { c.points += 1; if (cur) cur.w += 1; continue; }
    if (/^-\s*🇨🇳/.test(t)) { c.zh += 1; if (cur) cur.z += 1; continue; }
    if (tbl && /^\s*\|/.test(t)) {
      const cells = splitRow(t);
      if (isSepRow(cells)) continue;
      if (/^(文中形式|词组)$/.test(cells[0])) continue;   // header row
      c[tbl] += 1;
    }
  }
  return c;
}

// Every atom of text on a source line must be found in the lesson's output for
// the same paragraph (normalised: letters + digits only).
function reconcile(parsed) {
  const { lesson, sectionLines } = parsed;
  const missing = [];
  const hayOf = (obj) => {
    const parts = [];
    const walk = (v) => {
      if (typeof v === 'string') parts.push(nz(v));
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(obj);
    return parts.join('¦');
  };
  const paraHay = lesson.paras.map((p) => hayOf(p));
  const guideHay = nz(lesson.guideMd || '');
  let pi = -1;
  let inTable = false;
  const atomOK = (atom, hay) => {
    if (!atom) return true;
    const a1 = nz(atom);
    if (!a1 || hay.includes(a1)) return true;
    const a2 = nz(unlink(atom));
    if (hay.includes(a2)) return true;
    // [[slug|label]] vs a field that stores slug and label separately
    return atom.split(/\s*[|]\s*/).every((x) => !nz(x) || hay.includes(nz(x)) || hay.includes(nz(unlink(x))));
  };
  for (const { i, t } of sectionLines) {
    if (!t.trim() || /^-{3,}\s*$/.test(t.trim())) continue;
    if (/^###\s/.test(t)) {
      pi += 1;
      inTable = false;
      const title = t.replace(/^###\s+(¶\s*\d+\s*(?:[·:：\-–—]\s*)?)?/, '').replace(/\s*[（(]\s*\d+\s*[^）)]*[）)]\s*$/, '');
      if (!atomOK(title, paraHay[pi] || '')) missing.push({ line: i + 1, text: t });
      continue;
    }
    if (pi < 0) { if (!atomOK(t.replace(/^-\s+/, ''), guideHay)) missing.push({ line: i + 1, text: t }); continue; }
    const hay = paraHay[pi] || '';
    let atoms;
    if (/^####\s/.test(t)) {
      inTable = true;
      atoms = /🔍|🧩|📚/.test(t) ? [] : [t.replace(/^####\s+/, '')];
    } else if (/^\s*\|/.test(t)) {
      const cells = splitRow(t);
      atoms = isSepRow(cells) ? [] : cells;
      if (/^(文中形式|词组)$/.test(cells[0])) atoms = [];
    } else if (RE_SENT.test(t)) {
      atoms = [t.replace(new RegExp('^\\*\\*\\s*[' + CIRCLED + ']\\s*'), '').replace(/\*\*\s*$/, '')];
    } else {
      atoms = [t.replace(/^\s*-\s*(📐|⚠️?|🇨🇳)?\s*/, '').replace(/^🇨🇳\s*/, '')];
    }
    void inTable;
    for (const a of atoms) if (!atomOK(a, hay)) { missing.push({ line: i + 1, text: t.slice(0, 120) }); break; }
  }
  return missing;
}

function checkLesson(parsed, serializedBytes) {
  const { lesson, ctx, sectionLines } = parsed;
  const sc = sourceCounts(sectionLines);
  const o = {
    paras: lesson.paras.length,
    parasStd: lesson.paras.filter((p) => p.kind === 'para').length,
    sents: lesson.paras.reduce((n, p) => n + p.sents.length, 0),
    struct: 0, points: 0, zh: 0,
    vocab: lesson.paras.reduce((n, p) => n + p.vocab.length, 0),
    phrases: lesson.paras.reduce((n, p) => n + p.phrases.length, 0),
  };
  const errors = [];
  const flat = [];
  for (const p of lesson.paras) {
    for (const s of p.sents) {
      flat.push(s);
      o.points += s.points.length;
      if (s.struct) o.struct += s.struct.split('\n').filter((l) => !/^\s/.test(l)).length;
      if (s.zh) o.zh += 1;
    }
  }
  for (const k of ['paras', 'parasStd', 'sents', 'struct', 'points', 'zh', 'vocab', 'phrases']) {
    if (sc[k] !== o[k]) errors.push(`${k}: source ${sc[k]} ≠ output ${o[k]}`);
  }
  flat.forEach((s, k) => {
    const src = sc.perSent[k];
    if (!src) return;
    if (src.a > 0 && !s.struct) errors.push(`sentence ${k + 1}: source has 📐 but struct empty`);
    if (src.z > 0 && !s.zh) errors.push(`sentence ${k + 1}: source has 🇨🇳 but zh empty`);
    if (src.w !== s.points.length) errors.push(`sentence ${k + 1}: ⚠️ ${src.w} ≠ ${s.points.length}`);
  });
  // parser-level bookkeeping: every non-empty non-hr line was consumed
  const unaccounted = sectionLines.filter(({ i, t }) => t.trim() && !ctx.consumed.has(i)).map(({ i, t }) => ({ line: i + 1, text: t.slice(0, 100) }));
  // content-level reconciliation
  const missing = reconcile(parsed);
  // notes table rows
  const nl = (() => {
    const { lines } = parsed;
    const secs = h2Sections(lines);
    const ns = secs.find((s) => /教学备注/.test(s.h));
    if (!ns) return 0;
    return lines.slice(ns.start + 1, ns.end).filter((l) => /^\s*\|/.test(l) && !isSepRow(splitRow(l))).length - (lines.slice(ns.start + 1, ns.end).some((l) => /^\s*\|/.test(l)) ? 1 : 0);
  })();
  if (nl !== lesson.notes.length) errors.push(`notes rows: source ${nl} ≠ output ${lesson.notes.length}`);
  // links
  const dangling = [];
  const missingKb = [];
  const scan = (text, inSecs) => {
    for (const t of wikiTargets(text)) {
      if (!noteExists(t)) dangling.push(t);
      else if (!inSecs && !lesson.kb[t]) missingKb.push(t);
    }
  };
  for (const p of lesson.paras) {
    scan([p.sv, p.zh, p.extraMd].join('\n'), false);
    for (const s of p.sents) scan([s.sv, s.struct, s.zh, ...s.points, ...s.extra].join('\n'), false);
    for (const ph of p.phrases) scan([ph.sv, ph.zh, ph.use].join('\n'), false);
    for (const v of p.vocab) scan([v.form, v.lemma, v.zh, v.note].join('\n'), false);
  }
  for (const n of lesson.notes) scan([n.point, n.sv, n.zh].join('\n'), false);
  scan(lesson.notesMd + '\n' + (lesson.guideMd || ''), false);
  if (missingKb.length) errors.push(`${missingKb.length} [[links]] to existing notes missing from kb: ${[...new Set(missingKb)].slice(0, 5).join(', ')}`);
  if (unaccounted.length) errors.push(`${unaccounted.length} source lines not consumed by the parser (first: L${unaccounted[0].line} ${unaccounted[0].text})`);
  if (missing.length) errors.push(`${missing.length} source lines not found in output (first: L${missing[0].line} ${missing[0].text})`);
  // Oversize is reported loudly but is not a data-integrity failure; --strict-size makes it one.
  const warnings = [];
  if (serializedBytes > MAX_BYTES) (process.argv.includes('--strict-size') ? errors : warnings).push(`file is ${(serializedBytes / 1024).toFixed(0)} KB > ${MAX_BYTES / 1024} KB raw (limit per SPEC §6)`);
  for (const [k, v] of Object.entries(lesson.forms)) if (!lesson.kb[v]) errors.push(`forms['${k}'] → ${v} not in kb`);
  const withStruct = flat.filter((s) => s.struct).length;
  const chunked = flat.filter((s) => s.chunks).length;
  return { sc, o, errors, warnings, dangling, withStruct, chunked, unaccounted, missing };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function serialize(lesson) {
  return `window.KURS_LESSONS = window.KURS_LESSONS || {};\nwindow.KURS_LESSONS[${JSON.stringify(lesson.slug)}] = ${JSON.stringify(lesson)};\n`;
}

function main() {
  const files = fs.existsSync(importedDir)
    ? fs.readdirSync(importedDir).filter((f) => f.endsWith('.md') && !f.startsWith('_') && f !== 'README.md').sort()
    : [];
  const report = { collisions: new Set(), formConflicts: [], authorForms: 0 };
  const parsedAll = [];
  for (const f of files) {
    const text = read(path.join(importedDir, f));
    if (!/^##\s+🔍\s*逐段精读/m.test(text)) continue;
    const parsed = parseLesson(f);
    if (parsed) parsedAll.push(parsed);
  }
  if (!parsedAll.length) {
    console.error('build-kurs-data: no lessons found (imported/*.md with a "## 🔍 逐段精读" section). Nothing written.');
    process.exit(CHECK ? 1 : 0);
  }
  const { by: listenBy, multi: listenMulti } = listeningBySlug();
  const outputs = [];
  const indexRows = [];
  for (const parsed of parsedAll) {
    completeLesson(parsed, report);
    const lesson = parsed.lesson;
    const body = serialize(lesson);
    outputs.push({ parsed, body, bytes: Buffer.byteLength(body, 'utf8') });
    indexRows.push({
      slug: lesson.slug, title: lesson.title, sub: lesson.sub, book: parsed.book, cefr: lesson.cefr, date: lesson.date,
      paras: lesson.paras.length,
      sents: lesson.paras.reduce((n, p) => n + p.sents.length, 0),
      words: lesson.items.words.length,
      paraTitles: lesson.paras.map((p) => p.title),
      listen: listenBy[lesson.slug] ? listenBy[lesson.slug].id : '',
    });
  }
  indexRows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.slug < b.slug ? -1 : 1)));
  const indexBody = 'window.KURS_INDEX = ' + JSON.stringify({ v: 1, generatedAt: new Date().toISOString(), lessons: indexRows }) + ';\n';

  if (!CHECK) {
    fs.mkdirSync(dataDir, { recursive: true });
    const keep = new Set(outputs.map((o) => o.parsed.lesson.slug + '.js'));
    for (const f of fs.readdirSync(dataDir)) if (f.endsWith('.js') && !keep.has(f)) fs.unlinkSync(path.join(dataDir, f));
    for (const o of outputs) fs.writeFileSync(path.join(dataDir, o.parsed.lesson.slug + '.js'), o.body);
    fs.writeFileSync(path.join(outDir, 'kurs-index.js'), indexBody);
    const tot = outputs.reduce((n, o) => n + o.bytes, 0);
    console.log(`kurs: ${outputs.length} lessons → site/kurs/data/*.js (${(tot / 1024).toFixed(0)} KB total, max ${(Math.max(...outputs.map((o) => o.bytes)) / 1024).toFixed(0)} KB) + kurs-index.js`);
    const big = outputs.filter((o) => o.bytes > MAX_BYTES);
    if (big.length) console.warn('WARNING: over ' + (MAX_BYTES / 1024) + ' KB: ' + big.map((o) => o.parsed.lesson.slug).join(', '));
    return;
  }

  // ----- --check -----
  const pad = (s, n) => String(s).padEnd(n);
  const rpad = (s, n) => String(s).padStart(n);
  console.log('lesson'.padEnd(40) + ['¶', 'sent', '📐', '⚠️', '🇨🇳', 'voc', 'phr', 'chunk%', 'gap', 'dang', 'KB', 'kbN'].map((h) => rpad(h, 6)).join(''));
  let hard = 0;
  let oversize = 0;
  const T = { paras: 0, parasStd: 0, sents: 0, struct: 0, points: 0, zh: 0, vocab: 0, phrases: 0, withStruct: 0, chunked: 0, gap: 0, dang: 0, bytes: 0 };
  const allWhy = [];
  const whyCount = {};
  const allDangling = [];
  for (const o of outputs) {
    const r = checkLesson(o.parsed, o.bytes);
    for (const k of ['paras', 'parasStd', 'sents', 'struct', 'points', 'zh', 'vocab', 'phrases']) T[k] += r.o[k];
    T.withStruct += r.withStruct; T.chunked += r.chunked; T.gap += r.unaccounted.length + r.missing.length;
    T.dang += r.dangling.length; T.bytes += o.bytes;
    allDangling.push(...r.dangling.map((d) => o.parsed.lesson.slug + ':' + d));
    const pct = r.withStruct ? Math.round((100 * r.chunked) / r.withStruct) : 0;
    console.log(pad(o.parsed.lesson.slug.replace(/^paste-/, '').slice(0, 39), 40) + [
      r.o.paras, r.o.sents, r.o.struct, r.o.points, r.o.zh, r.o.vocab, r.o.phrases, pct + '%',
      r.unaccounted.length + r.missing.length, r.dangling.length, (o.bytes / 1024).toFixed(0), Object.keys(o.parsed.lesson.kb).length,
    ].map((x) => rpad(x, 6)).join(''));
    if (r.errors.length) { hard += r.errors.length; for (const e of r.errors) console.log('   ✗ ' + e); }
    for (const w of r.warnings) { oversize += 1; console.log('   ⚠ ' + w); }
    if (VERBOSE) for (const m of r.missing.concat(r.unaccounted)) console.log(`     L${m.line}: ${m.text}`);
    for (const w of o.parsed.chunkWhy) { allWhy.push({ slug: o.parsed.lesson.slug, ...w }); whyCount[w.why] = (whyCount[w.why] || 0) + 1; }
  }
  console.log('-'.repeat(40 + 72));
  console.log(pad('TOTAL', 40) + [T.paras, T.sents, T.struct, T.points, T.zh, T.vocab, T.phrases,
    Math.round((100 * T.chunked) / Math.max(1, T.withStruct)) + '%', T.gap, T.dang, (T.bytes / 1024).toFixed(0), ''].map((x) => rpad(x, 6)).join(''));
  console.log(`\nparagraphs: ${T.parasStd} ¶ + ${T.paras - T.parasStd} extra   sentences with 📐: ${T.withStruct}/${T.sents}   chunks parsed: ${T.chunked}/${T.withStruct} (${(100 * T.chunked / Math.max(1, T.withStruct)).toFixed(1)}%)`);
  const CL = outputs.reduce((a, o) => [0, 1, 2].map((k) => a[k] + o.parsed.chunkLevels[k]), [0, 0, 0]);
  console.log(`chunk parse rate by rule level (of ${T.withStruct} with 📐): L0 strict only-backtick ` + CL[0] + ' (' + (100 * CL[0] / T.withStruct).toFixed(1) + '%) | L1 + ⟨clause⟩(role) ' + CL[1] + ' (' + (100 * CL[1] / T.withStruct).toFixed(1) + '%) | L2 + role-less pieces [shipped] ' + CL[2] + ' (' + (100 * CL[2] / T.withStruct).toFixed(1) + '%)');
  console.log('chunks=null reasons (shipped level): ' + JSON.stringify(whyCount));
  const kt = outputs.reduce((a, o) => [a[0] + o.parsed.keyTotal, a[1] + o.parsed.keyUnmatched.length], [0, 0]);
  console.log(`export # sentences rows matched to a lesson sentence (key:1): ${kt[0] - kt[1]}/${kt[0]}`);
  if (VERBOSE) for (const o of outputs) for (const u of o.parsed.keyUnmatched) console.log(`   unmatched key row [${o.parsed.lesson.slug}]: ${u.slice(0, 90)}`);
  console.log(`dangling [[links]] (target not a note): ${T.dang}${T.dang ? ' → ' + allDangling.slice(0, 10).join(', ') : ''}`);
  console.log(`word-note Forms sections (per kb entry, all lessons): ${stats.formsClean} clean 2-col → table, ${stats.formsOther} other shape → kept as a section, ${stats.formsNone} none`);
  console.log(`slug collisions words/phrases wanted as both: ${report.collisions.size}${report.collisions.size ? ' → ' + [...report.collisions].join(', ') : ''}`);
  console.log(`forms added from the author's vocab tables (site highlighter misses them): ${report.authorForms}; conflicts: ${report.formConflicts.length}${report.formConflicts.length ? '\n  ' + report.formConflicts.slice(0, 10).join('\n  ') : ''}`);
  for (const [s, ids] of Object.entries(listenMulti)) if (ids.length > 1) console.log(`listening: ${s} has ${ids.length} episodes → using ${listenBy[s].id}`);
  if (process.argv.includes('--chunk-fallbacks')) {
    for (const w of allWhy) console.log(`FALLBACK ${w.slug} ¶${w.para}.${w.i} [${w.why}]\n   sv: ${w.sv}\n   📐: ${w.struct.replace(/\n/g, ' ⏎ ')}`);
  }
  if (oversize) console.log(`WARNING: ${oversize} lesson file(s) exceed ${MAX_BYTES / 1024} KB raw (not counted as failures; pass --strict-size to fail on this)`);
  if (hard) { console.log(`\nFAIL: ${hard} hard mismatch(es)`); process.exit(1); }
  console.log('\nOK: all hard checks pass');
}

main();

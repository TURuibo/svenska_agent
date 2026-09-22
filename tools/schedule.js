#!/usr/bin/env node
/**
 * tools/schedule.js — maintain review/schedule.md WITHOUT an agent ever reading the whole file.
 *
 * review/schedule.md is a ~300 KB markdown table (thousands of rows). Reading it into a model's
 * context costs ~75k tokens per read; this script does the bookkeeping instead so agents only
 * see a handful of lines. See CLAUDE.md §6.
 *
 * Usage:
 *   node tools/schedule.js due [-n 10] [--type word|phrase|sentence|grammar] [--date YYYY-MM-DD] [--json]
 *       Print the items due today (never-reviewed first, then most overdue). Default n=10, mixed
 *       types (≈5 words / 2 phrases / 2 sentences / 1 grammar). Skips known:true and missing notes.
 *
 *   node tools/schedule.js add [--date YYYY-MM-DD] [--batch "label"] type:slug [type:slug ...]
 *       Append rows for new reviewable notes (type = word|phrase|sentence|grammar). Slugs that are
 *       already scheduled are skipped. `--batch` writes a bold header row before the new rows.
 *
 *   node tools/schedule.js add-source <source-slug> [--date YYYY-MM-DD]
 *       Same as `add`, but takes the slugs from the words:/phrases:/sentences:/grammar: lists in
 *       knowledge_base/sources/<source-slug>.md frontmatter (what the librarian just wrote).
 *
 *   node tools/schedule.js update <slug> --q 0-5 [--date YYYY-MM-DD] [--known]
 *       Grade one item (SM-2 lite, rules in .claude/skills/sv-review/SKILL.md §3). Updates BOTH the
 *       table row and the note's frontmatter (reviewed / review_count / ease / interval / known).
 *
 *   node tools/schedule.js tidy [--prune]
 *       Repair the file: move stray rows that ended up below the footer back into the table, drop
 *       duplicate slug rows (keeping the reviewed one), report rows whose note no longer exists
 *       (`--prune` removes them).
 *
 *   node tools/schedule.js sync
 *       Schedule every reviewable note in knowledge_base/ that has no row yet (due = its created: date).
 *       Safety net for imports that forgot the schedule; safe to run any time.
 *
 *   node tools/schedule.js stats
 *       One-line counts (per type, due today, known).
 *
 * Global options: --root <repo root> (default: parent of tools/), --file <schedule path>.
 */
'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const cmd = argv.shift();
const opts = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (['json', 'known', 'prune', 'help'].includes(key) || next === undefined || next.startsWith('--')) {
      opts[key] = true;
    } else {
      opts[key] = next;
      i++;
    }
  } else if (a === '-n') {
    opts.n = argv[++i];
  } else {
    positional.push(a);
  }
}

const ROOT = opts.root ? path.resolve(opts.root) : path.resolve(__dirname, '..');
const FILE = opts.file ? path.resolve(opts.file) : path.join(ROOT, 'review', 'schedule.md');
const KB = path.join(ROOT, 'knowledge_base');

const TYPE_DIR = { word: 'words', phrase: 'phrases', sentence: 'sentences', grammar: 'grammar' };
const TYPES = Object.keys(TYPE_DIR);
const NEVER = '—';
const NOW = '立即';
const FOOTER = '## 说明';

function today() {
  if (opts.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) die(`bad --date "${opts.date}" (want YYYY-MM-DD)`);
    return opts.date;
  }
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function die(msg) {
  console.error(`schedule.js: ${msg}`);
  process.exit(1);
}
function notePath(type, slug) {
  return path.join(KB, TYPE_DIR[type], `${slug}.md`);
}
function relNotePath(type, slug) {
  return `knowledge_base/${TYPE_DIR[type]}/${slug}.md`;
}
function fmtEase(e) {
  return String(Math.round(e * 100) / 100);
}

// ---------------------------------------------------------------- file model
// A row: { slug, type, reviewed, interval, ease, due, known, line(index) }
const ROW_RE = /^\| \[\[([^\]]+)\]\] \| *(\w+) *\| *([^|]*?) *\| *([^|]*?) *\| *([^|]*?) *\| *([^|]*?) *\| *([^|]*?) *\|\s*$/;

function load() {
  if (!fs.existsSync(FILE)) die(`not found: ${FILE}`);
  const text = fs.readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const rows = [];
  let footerAt = -1;
  lines.forEach((ln, i) => {
    if (footerAt < 0 && ln.startsWith(FOOTER)) footerAt = i;
    const m = ROW_RE.exec(ln);
    if (m) {
      rows.push({
        slug: m[1], type: m[2], reviewed: m[3], interval: Number(m[4]) || 0,
        ease: Number(m[5]) || 2.5, due: m[6], known: m[7], line: i,
      });
    }
  });
  return { lines, rows, footerAt };
}

function save(lines) {
  let out = lines.join('\n');
  if (!out.endsWith('\n')) out += '\n';
  fs.writeFileSync(FILE, out, 'utf8');
}

function rowLine(r) {
  return `| [[${r.slug}]] | ${r.type} | ${r.reviewed} | ${r.interval} | ${fmtEase(r.ease)} | ${r.due} | ${r.known} |`;
}
function headerLine(label) {
  return `| **— ${label} —** | | | | | | |`;
}

/** Insert lines at the end of the table (just before the footer, or at EOF). */
function insertRows(model, newLines) {
  const { lines, footerAt } = model;
  let at = footerAt >= 0 ? footerAt : lines.length;
  // keep one blank line between the table and the footer
  while (at > 0 && lines[at - 1].trim() === '') at--;
  lines.splice(at, 0, ...newLines);
  if (footerAt >= 0 && lines[at + newLines.length].trim() !== '') lines.splice(at + newLines.length, 0, '');
}

// ---------------------------------------------------------------- frontmatter helpers
function readFrontmatter(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
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

/** Set scalar keys in a note's frontmatter (adds the key if absent). Returns false if no file. */
function patchFrontmatter(file, patch) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return false; }
  const crlf = text.includes('\r\n');
  text = text.replace(/\r\n/g, '\n');
  if (!text.startsWith('---')) return false;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return false;
  let head = text.slice(4, end).split('\n');
  for (const [k, v] of Object.entries(patch)) {
    const idx = head.findIndex((ln) => ln.startsWith(k + ':'));
    const line = `${k}: ${v}`;
    if (idx >= 0) head[idx] = line; else head.push(line);
  }
  let out = '---\n' + head.join('\n') + text.slice(end);
  if (crlf) out = out.replace(/\n/g, '\r\n');
  fs.writeFileSync(file, out, 'utf8');
  return true;
}

// ---------------------------------------------------------------- commands
function isDue(r, day) {
  if (r.known === 'yes') return false;
  if (r.reviewed === NEVER || r.reviewed === '') return true;
  if (r.due === NOW || r.due === '') return true;
  return r.due <= day;
}

function cmdDue() {
  const day = today();
  const n = Number(opts.n || 10);
  const onlyType = opts.type;
  if (onlyType && !TYPES.includes(onlyType)) die(`--type must be one of ${TYPES.join('|')}`);
  const { rows } = load();

  const seen = new Set();
  const due = [];
  let skippedKnown = 0, skippedMissing = 0;
  for (const r of rows) {
    if (seen.has(r.slug)) continue;
    seen.add(r.slug);
    if (!TYPE_DIR[r.type] || !isDue(r, day)) continue;
    if (onlyType && r.type !== onlyType) continue;
    const fm = readFrontmatter(notePath(r.type, r.slug));
    if (fm === null) { skippedMissing++; continue; }
    if (String(fm.known).toLowerCase() === 'true') { skippedKnown++; continue; }
    due.push({ ...r, fm });
  }

  // never-reviewed first (oldest due first), then most overdue
  const key = (r) => (r.reviewed === NEVER ? 0 : 1);
  due.sort((a, b) => key(a) - key(b) || (a.due === NOW ? '' : a.due).localeCompare(b.due === NOW ? '' : b.due));

  let picked;
  if (onlyType) {
    picked = due.slice(0, n);
  } else {
    const quota = { word: Math.round(n * 0.5), phrase: Math.round(n * 0.2), sentence: Math.round(n * 0.2), grammar: Math.max(1, Math.round(n * 0.1)) };
    picked = [];
    const used = new Set();
    for (const t of TYPES) {
      for (const r of due) {
        if (picked.length >= n) break;
        if (r.type === t && (quota[t] > 0) && !used.has(r.slug)) { picked.push(r); used.add(r.slug); quota[t]--; }
      }
    }
    for (const r of due) { // fill leftovers from any type
      if (picked.length >= n) break;
      if (!used.has(r.slug)) { picked.push(r); used.add(r.slug); }
    }
  }

  const gloss = (r) => {
    const f = r.fm;
    const sv = r.type === 'word' ? r.slug : (f.phrase || f.sentence || f.name || r.slug);
    const zh = f.zh || '';
    const en = f.en || '';
    return `${sv}${zh ? ` · ${zh}` : ''}${en ? ` · ${en}` : ''}`;
  };

  if (opts.json) {
    console.log(JSON.stringify({
      date: day, due_total: due.length, picked: picked.map((r) => ({
        type: r.type, slug: r.slug, path: relNotePath(r.type, r.slug), reviewed: r.reviewed,
        interval: r.interval, ease: r.ease, due: r.due, sv: r.type === 'word' ? r.slug : (r.fm.phrase || r.fm.sentence || r.fm.name || ''),
        zh: r.fm.zh || '', en: r.fm.en || '', cefr: r.fm.cefr || r.fm.level || '',
      })),
    }, null, 2));
    return;
  }
  console.log(`DUE ${day}: ${due.length} items due (${rows.length} rows; skipped known=${skippedKnown}, missing=${skippedMissing}); showing ${picked.length}`);
  picked.forEach((r, i) => {
    const state = r.reviewed === NEVER ? 'new' : `overdue since ${r.due}, ease ${fmtEase(r.ease)}, ivl ${r.interval}d`;
    console.log(`${i + 1}. [${r.type}] ${r.slug} — ${gloss(r)}  (${state})  ${relNotePath(r.type, r.slug)}`);
  });
}

function parseTypedSlugs(tokens) {
  const items = [];
  for (const t of tokens) {
    const m = /^(word|phrase|sentence|grammar):(.+)$/.exec(t);
    if (!m) die(`bad item "${t}" — use type:slug, type ∈ ${TYPES.join('|')}`);
    items.push({ type: m[1], slug: m[2].replace(/\.md$/, '').replace(/^\[\[|\]\]$/g, '') });
  }
  return items;
}

function addItems(items, day, batchLabel) {
  const model = load();
  const existing = new Set(model.rows.map((r) => r.slug));
  const added = [], skipped = [], missing = [];
  const newLines = [];
  for (const it of items) {
    if (existing.has(it.slug)) { skipped.push(it.slug); continue; }
    if (!fs.existsSync(notePath(it.type, it.slug))) { missing.push(it.slug); continue; }
    existing.add(it.slug);
    added.push(it.slug);
    newLines.push(rowLine({ slug: it.slug, type: it.type, reviewed: NEVER, interval: 0, ease: 2.5, due: day, known: 'no' }));
  }
  if (newLines.length) {
    if (batchLabel) newLines.unshift(headerLine(batchLabel));
    insertRows(model, newLines);
    save(model.lines);
  }
  console.log(`schedule: +${added.length} added, ${skipped.length} already scheduled, ${missing.length} no note file` +
    (missing.length ? ` (${missing.join(', ')})` : ''));
}

function cmdAdd() {
  if (!positional.length) die('add: give at least one type:slug');
  addItems(parseTypedSlugs(positional), today(), opts.batch);
}

function cmdAddSource() {
  const src = (positional[0] || '').replace(/\.md$/, '');
  if (!src) die('add-source: give the source-* slug');
  const file = path.join(KB, 'sources', `${src}.md`);
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : die(`no source note: ${file}`);
  const end = text.indexOf('\n---', 3);
  const fmText = text.slice(0, end > 0 ? end : 0);
  const listOf = (key) => {
    // supports `key: [a, b]`, `key: ["a", "b"]` and block lists `key:\n  - a`
    const inline = new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, 'm').exec(fmText);
    if (inline) return inline[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    const block = new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s.*\\n?)+)`, 'm').exec(fmText);
    if (block) return block[1].split('\n').map((s) => s.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    return [];
  };
  const items = [];
  for (const [key, type] of [['words', 'word'], ['phrases', 'phrase'], ['sentences', 'sentence'], ['grammar', 'grammar']]) {
    for (const s of listOf(key)) items.push({ type, slug: s.replace(/^\[\[|\]\]$/g, '') });
  }
  if (!items.length) { console.log(`schedule: source ${src} lists no reviewable notes — nothing added`); return; }
  const dateMatch = /^date:\s*["']?(\d{4}-\d{2}-\d{2})/m.exec(fmText);
  const day = opts.date ? today() : (dateMatch ? dateMatch[1] : today());
  addItems(items, day, opts.batch === undefined ? src : opts.batch);
}

function cmdUpdate() {
  const slug = (positional[0] || '').replace(/^\[\[|\]\]$/g, '');
  if (!slug) die('update: give the slug');
  if (opts.q === undefined) die('update: --q 0-5 is required');
  const q = Number(opts.q);
  if (!(q >= 0 && q <= 5)) die('--q must be 0..5');
  const day = today();

  const model = load();
  let matches = model.rows.filter((r) => r.slug === slug);
  let type = matches[0] ? matches[0].type : TYPES.find((t) => fs.existsSync(notePath(t, slug)));
  if (!type) die(`unknown slug "${slug}" (no row and no note file)`);
  const file = notePath(type, slug);
  const fm = readFrontmatter(file) || {};

  const cur = matches[0] || { slug, type, reviewed: NEVER, interval: 0, ease: 2.5, due: day, known: 'no' };
  let ease = Number(fm.ease) || cur.ease || 2.5;
  let interval = Number(fm.interval) || cur.interval || 0;
  let count = Number(fm.review_count) || 0;

  if (q < 3) {
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
  } else {
    if (count === 0) interval = 1;
    else if (count === 1) interval = 6;
    else interval = Math.max(1, Math.round(interval * ease));
    ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  }
  count += 1;
  const known = opts.known ? 'yes' : (cur.known === 'yes' ? 'yes' : 'no');
  const next = { slug, type, reviewed: day, interval, ease, due: addDays(day, interval), known };

  // table: rewrite the first row, delete duplicates; append if absent
  if (matches.length) {
    model.lines[matches[0].line] = rowLine(next);
    for (const extra of matches.slice(1).sort((a, b) => b.line - a.line)) model.lines.splice(extra.line, 1);
  } else {
    insertRows(model, [rowLine(next)]);
  }
  save(model.lines);

  const patch = { reviewed: `"${day}"`, review_count: count, ease: fmtEase(ease), interval };
  if (opts.known) patch.known = 'true';
  const ok = patchFrontmatter(file, patch);
  console.log(`updated ${slug} (${type}): q=${q} → interval ${interval}d, ease ${fmtEase(ease)}, next due ${next.due}, review_count ${count}` +
    (opts.known ? ', known:true' : '') + (ok ? '' : '  ⚠️ note frontmatter not updated (file missing?)'));
}

function cmdTidy() {
  const model = load();
  const { lines, rows, footerAt } = model;
  const report = { stray: 0, dups: 0, missing: [], pruned: 0 };

  // 1. choose the row to keep per slug: a reviewed one over a never-reviewed one, else the first
  const keep = new Map();
  for (const r of rows) {
    const prev = keep.get(r.slug);
    if (!prev) keep.set(r.slug, r);
    else if (prev.reviewed === NEVER && r.reviewed !== NEVER) keep.set(r.slug, r);
  }
  const drop = new Set();
  for (const r of rows) if (keep.get(r.slug) !== r) { drop.add(r.line); report.dups++; }

  // 2. rows (and batch headers) below the footer are stray: move them above it
  const strayLines = [];
  if (footerAt >= 0) {
    for (let i = footerAt + 1; i < lines.length; i++) {
      const ln = lines[i];
      if (ROW_RE.test(ln) || ln.startsWith('| **—')) { strayLines.push(i); }
    }
  }
  report.stray = strayLines.filter((i) => ROW_RE.test(lines[i])).length;

  // 3. missing notes
  for (const r of keep.values()) {
    if (!TYPE_DIR[r.type] || !fs.existsSync(notePath(r.type, r.slug))) {
      report.missing.push(r.slug);
      if (opts.prune) { drop.add(r.line); report.pruned++; }
    }
  }

  // rebuild: keep everything, minus dropped lines; stray table lines get moved before the footer
  const moved = strayLines.filter((i) => !drop.has(i)).map((i) => lines[i]);
  const strayset = new Set(strayLines);
  const body = [];
  let footerIdx = -1;
  lines.forEach((ln, i) => {
    if (drop.has(i) || strayset.has(i)) return;
    if (i === footerAt) footerIdx = body.length;
    body.push(ln);
  });
  if (moved.length) {
    let at = footerIdx >= 0 ? footerIdx : body.length;
    while (at > 0 && body[at - 1].trim() === '') at--;
    body.splice(at, 0, ...moved);
    if (footerIdx >= 0) body.splice(at + moved.length, 0, '');
  }
  // collapse runs of blank lines left behind by deletions
  const cleaned = body.filter((ln, i) => !(ln.trim() === '' && i > 0 && body[i - 1].trim() === ''));
  save(cleaned);
  console.log(`tidy: moved ${report.stray} stray rows above the footer, removed ${report.dups} duplicate rows, ` +
    `${report.missing.length} rows without a note${opts.prune ? ` (pruned ${report.pruned})` : ' (use --prune to remove)'}`);
  if (report.missing.length && !opts.prune) console.log('  missing: ' + report.missing.slice(0, 20).join(', ') + (report.missing.length > 20 ? ' …' : ''));
}

/** Schedule every reviewable note in knowledge_base/ that has no row yet (due = its created: date). */
function cmdSync() {
  const model = load();
  const existing = new Set(model.rows.map((r) => r.slug));
  const day = today();
  const newLines = [];
  const per = {};
  for (const type of TYPES) {
    const dir = path.join(KB, TYPE_DIR[type]);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
      const slug = f.slice(0, -3);
      if (existing.has(slug)) continue;
      const fm = readFrontmatter(path.join(dir, f)) || {};
      if (String(fm.known).toLowerCase() === 'true') continue;
      const due = /^\d{4}-\d{2}-\d{2}$/.test(fm.created || '') ? fm.created : day;
      const reviewed = /^\d{4}-\d{2}-\d{2}$/.test(fm.reviewed || '') ? fm.reviewed : NEVER;
      newLines.push(rowLine({ slug, type, reviewed, interval: Number(fm.interval) || 0, ease: Number(fm.ease) || 2.5, due, known: 'no' }));
      per[type] = (per[type] || 0) + 1;
      existing.add(slug);
    }
  }
  if (newLines.length) {
    newLines.unshift(headerLine(`sync ${day} — ${newLines.length} unscheduled notes`));
    insertRows(model, newLines);
    save(model.lines);
  }
  console.log(`sync: +${newLines.length ? newLines.length - 1 : 0} rows (${TYPES.map((t) => `${t} ${per[t] || 0}`).join(', ')})`);
}

function cmdStats() {
  const day = today();
  const { rows } = load();
  const seen = new Set();
  const per = {}; let due = 0, known = 0, total = 0;
  for (const r of rows) {
    if (seen.has(r.slug)) continue;
    seen.add(r.slug); total++;
    per[r.type] = (per[r.type] || 0) + 1;
    if (r.known === 'yes') known++;
    else if (isDue(r, day)) due++;
  }
  console.log(`schedule ${day}: ${total} items (${TYPES.map((t) => `${t} ${per[t] || 0}`).join(', ')}) · due ${due} · known ${known}`);
}

// ---------------------------------------------------------------- dispatch
const commands = { due: cmdDue, add: cmdAdd, 'add-source': cmdAddSource, update: cmdUpdate, tidy: cmdTidy, sync: cmdSync, stats: cmdStats };
if (!cmd || opts.help || !commands[cmd]) {
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter((l) => l.startsWith(' *') && l.trim() !== '*/').map((l) => l.replace(/^ \* ?/, '')).join('\n'));
  process.exit(cmd && !commands[cmd] ? 1 : 0);
}
commands[cmd]();

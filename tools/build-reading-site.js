#!/usr/bin/env node
// Build the "Läsning" reading site: scans inbox/ and imported/ for readable
// Swedish texts (scenarios, pasted articles, vocab drills), strips the
// machine-only `svensk-export` block, and emits site/reading/reading-data.js.
//
// The two folders carry different meaning and are surfaced as a status badge:
//   inbox/    → 待导入 (pending) — generated/pasted, not yet ingested into the KB
//   imported/ → 已导入 (done)    — already processed through /import
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const siteRoot = path.join(repoRoot, 'site');
const outDir = path.join(siteRoot, 'reading');
const dataPath = path.join(outDir, 'reading-data.js');

// Folder → status metadata. Order here is the display order.
const SOURCES = [
  { dir: 'inbox', status: 'pending', statusLabel: '待导入', statusEn: 'inbox' },
  { dir: 'imported', status: 'imported', statusLabel: '已导入', statusEn: 'imported' },
];

// Files in those folders that are not readable articles.
const SKIP_FILES = new Set(['README.md', '_used-vocab-adjsubst.md']);

function parseScalar(value) {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
  return trimmed;
}

// Minimal YAML-frontmatter reader (flat scalars only — enough for these files).
function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: text };
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;
    const m = line.match(/^([^\s:][^:]*):\s*(.*)$/);
    if (!m) continue;
    frontmatter[m[1].trim()] = parseScalar(m[2]);
  }
  return { frontmatter, body: match[2] };
}

// Remove every fenced ```svensk-export … ``` block; return the cleaned body
// plus counts of the learning items it declared (for the "学习项" badge).
function stripExportBlocks(body) {
  const lines = body.split(/\r?\n/);
  const kept = [];
  const counts = { words: 0, phrases: 0, sentences: 0, grammar: 0 };
  let inExport = false;
  let section = null;
  for (const line of lines) {
    const fence = line.match(/^```(\s*svensk-export.*)?$/);
    if (fence) {
      if (!inExport && /svensk-export/.test(line)) { inExport = true; section = null; continue; }
      if (inExport) { inExport = false; section = null; continue; }
    }
    if (inExport) {
      const sec = line.match(/^(words|phrases|sentences|grammar)\s*:\s*$/);
      if (sec) { section = sec[1]; continue; }
      if (section && /^-\s+\S/.test(line)) counts[section] += 1;
      continue;
    }
    kept.push(line);
  }
  // Collapse the trailing blank gap left where the block used to be.
  return { body: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(), counts };
}

function kindFromName(name) {
  if (name.startsWith('scenario-')) return 'scenario';
  if (name.startsWith('adjsubst-')) return 'adjsubst';
  if (name.startsWith('paste-')) return 'paste';
  if (name.startsWith('news-')) return 'news';
  return 'other';
}

const KIND_LABELS = {
  scenario: { zh: '情景练习', en: 'scenario' },
  adjsubst: { zh: '词形变化', en: 'adj+subst drill' },
  paste: { zh: '粘贴文章', en: 'pasted text' },
  news: { zh: '新闻', en: 'news' },
  other: { zh: '其他', en: 'other' },
};

function getTitle(frontmatter, body, slug) {
  const heading = body.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  if (frontmatter.title) return frontmatter.title;
  return slug;
}

// Scenario files keep metadata as bold lines (**CEFR 估计:** A2) rather than YAML.
function metaFromBody(body) {
  const out = {};
  const cefr = body.match(/CEFR[^:：]*[:：]\s*\**\s*([A-C][12])/i);
  if (cefr) out.cefr = cefr[1].toUpperCase();
  const type = body.match(/\*\*类型[^:：]*[:：]\*\*\s*([^\n*]+)/);
  if (type) out.scenarioType = type[1].trim();
  const date = body.match(/生成日期[^:：]*[:：]\s*\**\s*(\d{4}-\d{2}-\d{2})/);
  if (date) out.date = date[1];
  return out;
}

// Pull a date out of the filename as a last resort (…-YYYY-MM-DD-…).
function dateFromName(name) {
  const m = name.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

const articles = [];

for (const src of SOURCES) {
  const dir = path.join(repoRoot, src.dir);
  if (!fs.existsSync(dir)) continue;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (SKIP_FILES.has(entry.name) || entry.name.startsWith('_')) continue;

    const filePath = path.join(dir, entry.name);
    const raw = fs.readFileSync(filePath, 'utf8');
    const slug = path.basename(entry.name, '.md');
    const { frontmatter, body: afterFm } = parseFrontmatter(raw);
    const { body, counts } = stripExportBlocks(afterFm);
    const bodyMeta = metaFromBody(afterFm);
    const kind = kindFromName(entry.name);

    articles.push({
      slug,
      file: entry.name,
      folder: src.dir,
      status: src.status,
      statusLabel: src.statusLabel,
      statusEn: src.statusEn,
      kind,
      kindLabel: KIND_LABELS[kind] || KIND_LABELS.other,
      title: getTitle(frontmatter, afterFm, slug),
      cefr: bodyMeta.cefr || frontmatter.cefr || '',
      date: bodyMeta.date || frontmatter.date || dateFromName(entry.name),
      theme: frontmatter.theme || bodyMeta.scenarioType || '',
      source: frontmatter.source || '',
      path: path.relative(repoRoot, filePath).split(path.sep).join('/'),
      counts,
      itemTotal: counts.words + counts.phrases + counts.sentences + counts.grammar,
      body,
      searchText: `${slug} ${getTitle(frontmatter, afterFm, slug)} ${body}`.toLowerCase(),
    });
  }
}

// Newest first, then by title.
articles.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title));

fs.mkdirSync(outDir, { recursive: true });
const generatedAt =
  process.env.KB_SITE_GENERATED_AT || new Date().toISOString().replace('T', ' ').slice(0, 19);
const data = { generatedAt, articles };
fs.writeFileSync(dataPath, `window.READING_DATA = ${JSON.stringify(data, null, 2)};\n`, 'utf8');

const byStatus = articles.reduce((acc, a) => ((acc[a.status] = (acc[a.status] || 0) + 1), acc), {});
console.log(
  `Generated ${path.relative(repoRoot, dataPath)} — ${articles.length} articles ` +
    `(待导入 ${byStatus.pending || 0}, 已导入 ${byStatus.imported || 0}).`
);

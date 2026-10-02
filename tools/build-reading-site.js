#!/usr/bin/env node
// Build the "Läsning" reading site: scans inbox/ and imported/ for readable
// Swedish texts (scenarios, pasted articles, vocab drills), strips the
// machine-only `svensk-export` block, and emits site/reading/reading-data.js.
//
// The same data file also feeds 🗣️ Tala (site/tala/, 口语): the scenarios are
// shown there instead of in Läsning, each tagged with its sub-genre (`form`:
// dialog / text / story) and, for dialogs, pre-parsed speaker turns (`dialog`)
// for role-play.
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
const wordsDir = path.join(repoRoot, 'knowledge_base', 'words');

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

// Parse one `- a | b | c | d` export line into a structured learning item. The
// column layout differs per section (see EXPORT_PROTOCOL.md / the sv-import skill):
//   words/phrases : sv | ordklass(类型) | zh | en
//   sentences     : sv | zh
//   grammar       : name | zh | en
function parseExportItem(section, raw) {
  const parts = raw.split('|').map((p) => p.trim());
  if (section === 'sentences') return { sv: parts[0] || '', zh: parts[1] || '' };
  if (section === 'grammar') return { sv: parts[0] || '', zh: parts[1] || '', en: parts[2] || '' };
  // words & phrases share the same 4-column shape (some pasted blocks omit ordklass: sv | zh | en).
  if (parts.length === 3 && /[㐀-鿿]/.test(parts[1])) return { sv: parts[0], pos: '', zh: parts[1], en: parts[2] };
  return { sv: parts[0] || '', pos: parts[1] || '', zh: parts[2] || '', en: parts[3] || '' };
}

// Remove every fenced ```svensk-export … ``` block; return the cleaned body,
// counts of the learning items it declared (for the "学习项" badge), and the
// parsed items themselves so the reading pane can show them below the text.
function stripExportBlocks(body) {
  const lines = body.split(/\r?\n/);
  const kept = [];
  const counts = { words: 0, phrases: 0, sentences: 0, grammar: 0 };
  const items = { words: [], phrases: [], sentences: [], grammar: [] };
  let inExport = false;
  let section = null;
  for (const line of lines) {
    const fence = line.match(/^```(\s*svensk-export.*)?$/);
    if (fence) {
      if (!inExport && /svensk-export/.test(line)) { inExport = true; section = null; continue; }
      if (inExport) { inExport = false; section = null; continue; }
    }
    if (inExport) {
      // Section headers come in two spellings: the spec's `words:` and the
      // `# words` some pasted/photo articles use. Items likewise may or may not
      // carry the `- ` bullet, so a bare `sv | … | …` line also counts.
      const sec = line.match(/^(?:#\s*)?(words|phrases|sentences|grammar)\s*:?\s*$/);
      if (sec) { section = sec[1]; continue; }
      if (section && !/^\s*#/.test(line) && (/^-\s+\S/.test(line) || /\|/.test(line))) {
        counts[section] += 1;
        items[section].push(parseExportItem(section, line.replace(/^\s*-\s+/, '').replace(/^sv:\s*/, '').trim()));
      }
      continue;
    }
    kept.push(line);
  }
  // Collapse the trailing blank gap left where the block used to be.
  return { body: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(), counts, items };
}

// `/dagens-artikel` writes one file per genre, each with its own slug prefix
// (see .claude/commands/dagens-artikel.md). Pasted articles use `paste-`. They
// are all the same thing to a reader — a narrative/expository article — so they
// share one "文章" (article) kind.
const ARTICLE_PREFIXES = [
  'paste-',
  'biografi-', 'sverige-', 'historia-', 'tradition-',
  'natur-', 'plats-', 'uppfinning-', 'vetenskap-',
];

function kindFromName(name) {
  if (name.startsWith('scenario-')) return 'scenario';
  if (name.startsWith('adjsubst-')) return 'adjsubst';
  if (name.startsWith('news-')) return 'news';
  if (ARTICLE_PREFIXES.some((p) => name.startsWith(p))) return 'article';
  return 'other';
}

const KIND_LABELS = {
  scenario: { zh: '情景练习', en: 'scenario' },
  adjsubst: { zh: '词形变化', en: 'adj+subst drill' },
  article: { zh: '文章', en: 'article' },
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

// Scenario sub-genre from the "**类型 (type):** dialog (…)" line: the first word
// decides — dialog / dialog-pack → 'dialog', story → 'story', anything else
// (mejl, sms, anslag, schema …) → 'text'. Drives the 🗣️ Tala page's filter pills.
function scenarioForm(scenarioType) {
  const head = String(scenarioType || '').trim().toLowerCase();
  if (head.startsWith('dialog')) return 'dialog';
  if (head.startsWith('story')) return 'story';
  return 'text';
}

// ---------------------------------------------------------------------------
// Dialog parser — turns a dialog scenario into speaker turns for the 🗣️ Tala
// page (role-play: the learner takes one role, the sv-SE voice reads the rest).
//
// Scenario writers use several speaker spellings, all handled here:
//   **Emma:** text   ·   Emma: text   ·   Receptionist (R): text → later "R: text"
//   A (servitör): text → later "A: text"   ·   dialog-packs: "🇸🇪" + ``` fence of "K: text"
// The 🇨🇳 translation repeats the same turns in order (**艾玛：** / R：/ B（Lisa）：),
// so each Swedish turn gets its Chinese line by position — only when both sides
// have exactly the same number of turns (otherwise the zh hints are left out
// rather than risk pairing a line with the wrong translation).
// ---------------------------------------------------------------------------

const SV_TURN = /^(?:\*\*)?([A-ZÅÄÖ][A-Za-zÅÄÖåäöÉé.\- ]{0,23}?)(?:\s*\(([^)]{1,30})\))?\s*(?:\*\*\s*:|:\s*\*\*|:)\s*(.+)$/;
const ZH_TURN = /^(?:\*\*)?([^\s:：*#>|\-][^:：\n]{0,30}?)\s*(?:\*\*\s*[:：]|[:：]\s*\*\*|[:：])\s*(.+)$/;
const ITALIC_LINE = /^\*[^*].*\*$|^_[^_].*_$/;

function cleanTurnText(s) {
  return String(s || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

function zoneForHeading(text) {
  if (/翻译|译文|中文|🇨🇳/.test(text)) return 'zh';
  if (/瑞典语|原文|svenska|🇸🇪|dialog/i.test(text)) return 'sv';
  return null;
}

function parseDialog(body) {
  const lines = body.split(/\r?\n/);
  const svTurns = [];   // { kind: 'line'|'stage'|'scene', name, code, sv }
  const zhTurns = [];   // zh speaker lines, in order
  const zhStages = [];  // zh italic stage directions, in order
  let zone = null;            // 'sv' | 'zh' | null (from ## headings)
  let fenceZone = null;       // zone set by a lone 🇸🇪 / 🇨🇳 marker → applies to the next fence only
  let inFence = false;
  let pendingScene = '';

  for (const raw of lines) {
    const line = raw.trim();
    if (/^```/.test(line)) {
      if (!inFence) { inFence = true; continue; }
      inFence = false; fenceZone = null; continue;
    }
    const z = inFence ? (fenceZone || zone) : zone;
    if (!inFence) {
      const h = line.match(/^(#{2,3})\s+(.+)$/);
      if (h) {
        if (h[1] === '##') { zone = zoneForHeading(h[2]); fenceZone = null; continue; }
        // ### inside the Swedish zone, or a top-level ### (dialog-packs) → scene title
        if (zone !== 'zh') pendingScene = cleanTurnText(h[2]);
        continue;
      }
      if (/^🇸🇪\s*$/.test(line)) { fenceZone = 'sv'; continue; }
      if (/^🇨🇳\s*$/.test(line)) { fenceZone = 'zh'; continue; }
      if (/^#/.test(line)) continue;
      // A fence marker only covers its fenced block; prose outside fences in a
      // dialog-pack (Setting:, 📌 notes) belongs to no zone.
      if (fenceZone) continue;
    }
    if (!line || /^(---|\*\*\*|___)$/.test(line)) continue;

    if (z === 'sv') {
      if (ITALIC_LINE.test(line)) {
        svTurns.push({ kind: 'stage', sv: cleanTurnText(line.replace(/^[*_]|[*_]$/g, '')) });
        continue;
      }
      const m = line.match(SV_TURN);
      if (!m || m[1].trim().split(/\s+/).length > 3) continue;
      if (pendingScene) { svTurns.push({ kind: 'scene', sv: pendingScene }); pendingScene = ''; }
      svTurns.push({ kind: 'line', name: m[1].trim(), paren: (m[2] || '').trim(), sv: cleanTurnText(m[3]) });
    } else if (z === 'zh') {
      if (ITALIC_LINE.test(line)) { zhStages.push(cleanTurnText(line.replace(/^[*_]|[*_]$/g, ''))); continue; }
      const m = line.match(ZH_TURN);
      if (!m || /[，。！？、]/.test(m[1])) continue;
      zhTurns.push(cleanTurnText(m[2]));
    }
  }

  // ---- speakers: one canonical key per person ----
  // "Receptionist (R)" → key R (later lines just say "R:"); "A (servitör)" → key A
  // labelled servitör; a plain "Emma" is its own key.
  const CODE = /^[A-ZÅÄÖ]{1,3}$/;
  const labels = new Map();   // key → display label
  const order = [];
  for (const t of svTurns) {
    if (t.kind !== 'line') continue;
    let key = t.name;
    let label = t.name;
    if (t.paren && CODE.test(t.paren)) { key = t.paren; label = t.name; }
    else if (t.paren && CODE.test(t.name)) { key = t.name; label = t.paren; }
    t.speaker = key;
    if (!labels.has(key)) { labels.set(key, label); order.push(key); }
    else if (labels.get(key) === key && label !== key) labels.set(key, label);
  }
  const counts = new Map();
  for (const t of svTurns) if (t.kind === 'line') counts.set(t.speaker, (counts.get(t.speaker) || 0) + 1);
  // A role-play needs a real exchange: ≥2 people who each speak at least twice.
  const actors = order.filter((k) => counts.get(k) >= 2);
  const lineCount = svTurns.filter((t) => t.kind === 'line').length;
  if (actors.length < 2 || lineCount < 4) return null;

  const zhOk = zhTurns.length === lineCount;
  const stageOk = zhStages.length === svTurns.filter((t) => t.kind === 'stage').length;
  let li = 0, si = 0;
  const turns = svTurns.map((t) => {
    if (t.kind === 'line') {
      const zh = zhOk ? zhTurns[li] : '';
      li += 1;
      return { s: t.speaker, sv: t.sv, zh };
    }
    if (t.kind === 'stage') {
      const zh = stageOk ? zhStages[si] : '';
      si += 1;
      return { stage: true, sv: t.sv, zh };
    }
    return { scene: true, sv: t.sv };
  });
  return {
    speakers: order.map((k) => ({ key: k, label: labels.get(k), lines: counts.get(k) })),
    turns,
    zhAligned: zhOk,
  };
}

// ---------------------------------------------------------------------------
// Vocabulary index — lets the reading pane turn every Swedish word the learner
// has a KB note for into a clickable in-page glossary chip. We emit a COMPACT
// per-word record (lemma + a few fields + inflected surface forms) so the
// reading page never has to load the multi-MB kb-data.js just to highlight words.
// ---------------------------------------------------------------------------

// Strip a Forms-table cell down to a bare surface form (mirrors build-kb-site.js).
function cleanForm(value) {
  let v = value.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, '$1'); // strip wikilinks
  v = v.replace(/\([^)]*\)/g, ' ');     // drop parentheticals like "(har)"
  v = v.replace(/[`*_]/g, '');          // strip markdown emphasis
  v = v.replace(/\s+/g, ' ').trim();
  v = v.replace(/^att\s+/i, '');        // infinitiv marker
  v = v.replace(/^(en|ett)\s+/i, '');   // indefinite article
  v = v.replace(/^[^A-Za-zÅÄÖåäö]+|[^A-Za-zÅÄÖåäö]+$/g, ''); // trim stray punctuation (e.g. imperativ "!")
  return v.trim();
}

// Pull inflected surface forms out of a word note's "## 语法变形 (Forms)" table.
function extractForms(body, lemma) {
  const lines = body.split(/\r?\n/);
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
  const rows = tableLines.map((ln) =>
    ln.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
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

// Words that pad an example phrase in a Forms cell ("de skeptiska kunderna",
// "bosatte sig") but are never the inflected form itself.
const FORM_FILLER = new Set(['sig', 'mig', 'dig', 'oss', 'er', 'den', 'det', 'de', 'en', 'ett', 'att',
  'har', 'hade', 'är', 'var', 'blir', 'blev', 'mer', 'mest', 'som', 'han', 'hon', 'jag', 'vi', 'ni']);

// A multi-word Forms cell can only be matched as one token if we can tell which
// word is the form: drop filler words, and if more than one remains keep the one
// that shares a stem with the lemma (skeptisk → "de skeptiska kunderna" → skeptiska).
function formFromPhrase(cell, lemma) {
  // A multi-word lemma ("psykisk ohälsa") inflects as a whole; a single word picked
  // from it would gloss the component (psykiska → "psykisk ohälsa"). Reflexives are fine.
  if (/\s/.test(String(lemma || '').trim().replace(/\s+sig$/i, ''))) return '';
  const words = cell.split(/\s+/).map((w) => w.replace(/[^A-Za-zÀ-ÿ-]/g, '')).filter(Boolean);
  const rest = words.filter((w) => !FORM_FILLER.has(w.toLowerCase()));
  if (rest.length === 1) return rest[0];
  const stem = String(lemma || '').toLowerCase().split(/\s+/)[0];
  const need = Math.max(3, stem.length - 3);
  const hits = rest.filter((w) => commonPrefix(w.toLowerCase(), stem) >= need);
  return hits.length === 1 ? hits[0] : '';
}

function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

function buildVocab() {
  if (!fs.existsSync(wordsDir)) return [];
  const vocab = [];
  for (const entry of fs.readdirSync(wordsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const raw = fs.readFileSync(path.join(wordsDir, entry.name), 'utf8');
    const { frontmatter: fm, body } = parseFrontmatter(raw);
    const slug = path.basename(entry.name, '.md');
    const lemma = fm.lemma || slug;
    // Collect every surface form the learner might meet in text: the lemma plus
    // the inflected forms from the Forms table (lemma always first / preferred).
    // A reflexive lemma ("bosätta sig") can't match as one token, so also index
    // its verb ("bosätta") — the Forms table supplies bosatte/bosatt the same way.
    const reflexive = /^(\S+)\s+sig$/i.exec(lemma);
    const forms = [lemma, ...(reflexive ? [reflexive[1]] : []), ...extractForms(body, lemma)];
    const seen = new Set();
    const surfaces = [];
    for (const f of forms) {
      const k = (f || '').toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      surfaces.push(f);
    }
    vocab.push({
      slug,
      lemma,
      ordklass: fm.ordklass || '',
      cefr: fm.cefr || '',
      zh: fm.zh || '',
      en: fm.en || '',
      known: fm.known === 'true' || fm.known === true,
      created: fm.created || '',
      forms: surfaces,
      // The note body is NOT carried here anymore — the reading glossary popover
      // fetches it lazily from the shared store (site/kb-bodies.js via window.KB),
      // which keeps reading-data.js ~1 MB lighter and avoids duplicating bodies.
    });
  }
  vocab.sort((a, b) => a.lemma.localeCompare(b.lemma));
  return vocab;
}

// Reverse index of the listening episodes: an episode JSON that names a
// `readingSlug` is the audio for that article (e.g. a textbook chapter whose QR
// code points at the publisher's recording), so the article gets a 🎧 jump link.
function buildListeningIndex() {
  const dir = path.join(repoRoot, 'listening');
  const bySlug = {};
  if (!fs.existsSync(dir)) return bySlug;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json') || name.startsWith('_')) continue;
    let ep;
    try {
      ep = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    } catch (err) {
      console.error(`(skipping listening/${name}: ${err.message})`);
      continue;
    }
    if (!ep.readingSlug) continue;
    // Several episodes can point at one article (full reading + sammanfattning).
    // The subtitled one is what "🎧 听这篇" should open; a cue-less episode only
    // fills the slot when nothing better has claimed it.
    const hasCues = Array.isArray(ep.cues) && ep.cues.length > 0;
    const prev = bySlug[ep.readingSlug];
    if (prev && (prev.hasCues || !hasCues)) continue;
    bySlug[ep.readingSlug] = { id: ep.id || name.replace(/\.json$/, ''), title: ep.title || '', hasCues };
  }
  return bySlug;
}

const listeningBySlug = buildListeningIndex();
const vocab = buildVocab();

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
    const { body, counts, items } = stripExportBlocks(afterFm);
    const bodyMeta = metaFromBody(afterFm);
    const kind = kindFromName(entry.name);
    // Scenarios live on the 🗣️ Tala page: tag the sub-genre (dialog/text/story)
    // and pre-parse speaker turns so the page can offer role-play.
    const form = kind === 'scenario' ? scenarioForm(bodyMeta.scenarioType) : '';
    const dialog = kind === 'scenario' ? parseDialog(body) : null;

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
      form,
      dialog,
      source: frontmatter.source || '',
      path: path.relative(repoRoot, filePath).split(path.sep).join('/'),
      counts,
      listening: listeningBySlug[slug] || null,
      itemTotal: counts.words + counts.phrases + counts.sentences + counts.grammar,
      items,
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
const data = { generatedAt, articles, vocab };
fs.writeFileSync(dataPath, `window.READING_DATA = ${JSON.stringify(data, null, 2)};\n`, 'utf8');

const byStatus = articles.reduce((acc, a) => ((acc[a.status] = (acc[a.status] || 0) + 1), acc), {});
console.log(
  `Generated ${path.relative(repoRoot, dataPath)} — ${articles.length} articles ` +
    `(待导入 ${byStatus.pending || 0}, 已导入 ${byStatus.imported || 0}), ${vocab.length} vocab notes, ` +
    `${articles.filter((a) => a.listening).length} with audio, ` +
    `${articles.filter((a) => a.dialog).length} role-play dialogs.`
);

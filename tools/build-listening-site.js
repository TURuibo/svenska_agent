#!/usr/bin/env node
// Build the "Lyssna" listening-practice site: scans listening/*.json (one file
// per SVT "Nyheter på lätt svenska" episode) and emits
// site/listening/listening-data.js as window.LISTENING_DATA.
//
// Each source JSON carries the episode metadata (SVT video id, date, title,
// duration), the live media URLs resolved from SVT's API (HLS stream + WebVTT),
// the timestamped Swedish transcript with a Chinese translation per cue, and a
// vocab list. We store only metadata + our own translation/vocab; the audio and
// subtitles stream from SVT's CDN at view time (nothing is re-hosted).
//
// Media URLs from SVT's world CDN are valid only while the episode is available
// (~1 week). The daily routine keeps the list fresh; expired episodes are
// flagged client-side when the stream 404s and the "Watch on SVT Play" link is
// always offered as a fallback.
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const srcDir = path.join(repoRoot, 'listening');
const outDir = path.join(repoRoot, 'site', 'listening');
const dataPath = path.join(outDir, 'listening-data.js');

function pad(n) { return String(n).padStart(2, '0'); }
function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

if (!fs.existsSync(srcDir)) {
  console.error(`No listening/ source dir at ${srcDir} — nothing to build.`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(dataPath, `window.LISTENING_DATA = ${JSON.stringify({ generatedAt: nowStamp(), episodes: [] }, null, 2)};\n`);
  process.exit(0);
}

// Load the KB's authoritative slug set so we only emit a "click → explanation"
// link when the note actually exists in knowledge_base/. Words keep their
// Swedish lemma verbatim (öka, väntetid); phrases/grammar are sometimes
// ascii-folded, so we try the exact slug and an ascii-folded variant.
const slugsPath = path.join(repoRoot, 'knowledge_base', '_index', 'slugs.json');
let KB = { words: new Set(), phrases: new Set(), grammar: new Set() };
try {
  const raw = JSON.parse(fs.readFileSync(slugsPath, 'utf8'));
  KB = {
    words: new Set(raw.words || []),
    phrases: new Set(raw.phrases || []),
    grammar: new Set(raw.grammar || []),
  };
} catch (e) {
  console.error(`(no slugs.json yet — links will be omitted: ${e.message})`);
}
function asciiFold(s) {
  return s.replace(/å|ä/g, 'a').replace(/ö/g, 'o').replace(/é/g, 'e').replace(/ü/g, 'u');
}
// Resolve a lemma to an existing KB slug in `set`, or null. Tries exact then folded.
function resolveSlug(lemma, set, { phrase = false, grammar = false } = {}) {
  if (!lemma) return null;
  let base = String(lemma).trim().toLowerCase();
  if (phrase) base = base.replace(/\s+/g, '-');
  const candidates = grammar ? ['grammar-' + base, 'grammar-' + asciiFold(base)] : [base, asciiFold(base)];
  for (const c of candidates) { if (set.has(c)) return c; }
  return null;
}

const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
const episodes = [];

for (const file of files) {
  const full = path.join(srcDir, file);
  let ep;
  try {
    ep = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    console.error(`SKIP ${file}: invalid JSON — ${err.message}`);
    continue;
  }
  const cues = Array.isArray(ep.cues) ? ep.cues : [];
  // Attach a KB link to each vocab/phrase/grammar item when its note exists.
  const vocab = (Array.isArray(ep.vocab) ? ep.vocab : []).map((v) => {
    const slug = resolveSlug(v.lemma || v.sv, KB.words);
    return slug ? Object.assign({}, v, { slug }) : v;
  });
  const phrases = (Array.isArray(ep.phrases) ? ep.phrases : []).map((p) => {
    const slug = resolveSlug(p.lemma || p.sv, KB.phrases, { phrase: true });
    return slug ? Object.assign({}, p, { slug }) : p;
  });
  const grammar = (Array.isArray(ep.grammar) ? ep.grammar : []).map((g) => {
    const slug = resolveSlug(g.lemma || g.name, KB.grammar, { grammar: true });
    return slug ? Object.assign({}, g, { slug }) : g;
  });
  episodes.push({
    id: ep.id || file.replace(/\.json$/, ''),
    file,
    date: ep.date || '',
    title: ep.title || file,
    source: ep.source || 'SVT Nyheter på lätt svenska',
    cefr: ep.cefr || '',
    duration: ep.duration || 0,
    svtPlayUrl: ep.svtPlayUrl || '',
    hlsUrl: ep.hlsUrl || '',
    vttUrl: ep.vttUrl || '',
    cueCount: cues.length,
    vocabCount: vocab.length,
    cues,
    vocab,
    phrases,
    grammar,
  });
}

// Newest first.
episodes.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

fs.mkdirSync(outDir, { recursive: true });
const payload = { generatedAt: nowStamp(), episodes };
fs.writeFileSync(dataPath, `window.LISTENING_DATA = ${JSON.stringify(payload, null, 2)};\n`);
console.log(`Generated ${dataPath} with ${episodes.length} episode(s).`);

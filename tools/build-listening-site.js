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
    vocabCount: Array.isArray(ep.vocab) ? ep.vocab.length : 0,
    cues,
    vocab: Array.isArray(ep.vocab) ? ep.vocab : [],
  });
}

// Newest first.
episodes.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

fs.mkdirSync(outDir, { recursive: true });
const payload = { generatedAt: nowStamp(), episodes };
fs.writeFileSync(dataPath, `window.LISTENING_DATA = ${JSON.stringify(payload, null, 2)};\n`);
console.log(`Generated ${dataPath} with ${episodes.length} episode(s).`);

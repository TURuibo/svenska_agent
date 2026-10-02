#!/usr/bin/env node
// Vocabulary progress against the verified gap analysis (profile/vocab-gaps.json,
// produced 2026-10-02 — see profile/vocab-analysis.md).
//
// Unlike tools/vocab-coverage.py (raw matching against the full Kelly / SVALex /
// SALDO downloads), this needs nothing but the repo: it re-checks the saved
// reference rows and gap words against the CURRENT knowledge_base/ notes, so it is
// fast enough to run on every site build.
//
//   node tools/vocab-progress.js                 # write site/vocab-progress.js + print a summary
//   node tools/vocab-progress.js --pick auto 12  # next 12 unlearned gap words, theme chosen automatically
//   node tools/vocab-progress.js --pick T17 12 --exclude T14   # a given theme / skip a theme
//   node tools/vocab-progress.js --pick all 400                # every unlearned P1/P2 word (for /lattlast:
//                                                              #   mark the ones that occur in a fetched text)
//   node tools/vocab-progress.js --write-baseline             # once, right after a new analysis (see below)
//
// Homographs: a gap word can share its spelling with a note the KB already had
// (gap = klippa "to cut", KB had klippa "cliff"). --write-baseline stores how many
// same-spelling notes existed at analysis time (gaps[].kb0, reference[].k0), and a
// gap only counts as learned once the KB has MORE notes than that.
//
// --pick prints JSON ({theme, words:[{w, zh, p, level}]}) for the scenario generators
// (/scenario --gap, /dagens-scenario): P1 words first, then P2 once a theme's P1 is done.
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const gapsPath = path.join(repoRoot, 'profile', 'vocab-gaps.json');
const wordsDir = path.join(repoRoot, 'knowledge_base', 'words');
const phrasesDir = path.join(repoRoot, 'knowledge_base', 'phrases');
const outPath = path.join(repoRoot, 'site', 'vocab-progress.js');
const LEVELS = ['A1', 'A2', 'B1', 'B2'];

function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/…|\.\.\./g, ' ')
    .replace(/[.,!?;:"'«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

// Current KB: word lemmas (→ first slug, created, known, how many notes share the
// lemma) and phrase headwords.
function loadKb() {
  const words = new Map();
  const phrases = new Set();
  if (fs.existsSync(wordsDir)) {
    for (const f of fs.readdirSync(wordsDir)) {
      if (!f.endsWith('.md')) continue;
      const fm = frontmatter(fs.readFileSync(path.join(wordsDir, f), 'utf8'));
      const slug = f.slice(0, -3);
      const key = norm(fm.lemma || slug);
      if (!words.has(key)) words.set(key, { slug, created: fm.created || '', known: fm.known === 'true', count: 0 });
      words.get(key).count += 1;
    }
  }
  if (fs.existsSync(phrasesDir)) {
    for (const f of fs.readdirSync(phrasesDir)) {
      if (!f.endsWith('.md')) continue;
      const fm = frontmatter(fs.readFileSync(path.join(phrasesDir, f), 'utf8'));
      phrases.add(norm(fm.phrase || f.slice(0, -3).replace(/-/g, ' ')));
    }
  }
  return { words, phrases };
}

function pct(a, b) { return b ? Math.round((1000 * a) / b) / 10 : 0; }

function main() {
  if (!fs.existsSync(gapsPath)) {
    console.error('profile/vocab-gaps.json not found — run the vocabulary analysis first.');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(gapsPath, 'utf8'));
  const kb = loadKb();
  // How many KB notes (word notes sharing the lemma + a phrase note) carry this spelling.
  const kbCount = (c) => {
    if (!c) return 0;
    const w = kb.words.get(norm(c));
    return (w ? w.count : 0) + (kb.phrases.has(norm(c)) ? 1 : 0);
  };
  // Learned = more same-spelling notes than at analysis time (baseline 0 for most words).
  const inKb = (base, ...cands) => cands.some((c) => kbCount(c) > (base || 0));
  const wordFor = (w) => kb.words.get(norm(w)) || null;

  if (process.argv.includes('--write-baseline')) {
    let g = 0, r = 0;
    for (const x of data.gaps) { const n = kbCount(x.w); if (n) { x.kb0 = n; g += 1; } else delete x.kb0; }
    for (const x of data.reference) {
      if (x.c !== 'gap' && x.c !== 'basic') { delete x.k0; continue; }
      const n = Math.max(kbCount(x.w), kbCount(x.g));
      if (n) { x.k0 = n; r += 1; } else delete x.k0;
    }
    const s = JSON.stringify(data).replace(/\{"w"/g, '\n{"w"');
    fs.writeFileSync(gapsPath, s + '\n', 'utf8');
    console.log(`baseline written: ${g} gap words and ${r} reference rows share a spelling with an existing note`);
    return;
  }

  // ---- gap words: which are learned (have a note) now ----
  const gaps = data.gaps.map((g) => ({ ...g, done: inKb(g.kb0, g.w) }));

  const args = process.argv.slice(2);
  const pickAt = args.indexOf('--pick');
  if (pickAt !== -1) {
    const want = args[pickAt + 1] || 'auto';
    const n = parseInt(args[pickAt + 2], 10) || 12;
    const exAt = args.indexOf('--exclude');
    const exclude = new Set(exAt !== -1 ? String(args[exAt + 1] || '').split(',') : []);
    const open = gaps.filter((g) => !g.done && g.p >= 1 && g.p <= 2 && !exclude.has(g.theme));
    let theme = want;
    if (want === 'all') {
      const words = open.sort((a, b) => a.p - b.p || (a.rank || 99999) - (b.rank || 99999)).slice(0, n)
        .map((g) => ({ w: g.label || g.w, zh: g.zh, p: g.p, theme: g.theme }));
      console.log(JSON.stringify({ theme: 'all', words }));
      return;
    }
    if (want === 'auto') {
      // the theme with the most unlearned P1 words (P2 as tie-break), skipping "other"
      const score = {};
      for (const g of open) {
        if (g.theme === 'T21') continue;
        score[g.theme] = (score[g.theme] || 0) + (g.p === 1 ? 1000 : 1);
      }
      theme = Object.keys(score).sort((a, b) => score[b] - score[a])[0] || 'T17';
    }
    const words = open.filter((g) => g.theme === theme)
      .sort((a, b) => a.p - b.p || LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || (a.rank || 99999) - (b.rank || 99999))
      .slice(0, n)
      .map((g) => ({ w: g.label || g.w, zh: g.zh, p: g.p, level: g.level }));
    const t = data.themes[theme] || {};
    console.log(JSON.stringify({ theme, icon: t.icon || '', zh: t.zh || '', words }, null, 1));
    return;
  }

  // ---- reference coverage (verified categories, re-checked against today's KB) ----
  const statusNow = (r) => {
    if (r.c === 'excl') return 'excl';
    if (r.c === 'kb') return 'kb';
    return inKb(r.k0, r.w, r.g) ? 'kb' : r.c;      // gap / basic → kb once a (new) note exists
  };
  function coverage(rows, useNow) {
    const c = { kb: 0, basic: 0, gap: 0 };
    for (const r of rows) {
      const s = useNow ? statusNow(r) : r.c;
      if (s !== 'excl') c[s] += 1;
    }
    const n = c.kb + c.basic + c.gap;
    return { n, kb: pct(c.kb, n), kbBasic: pct(c.kb + c.basic, n) };
  }
  const svalex = {}; const kelly = {};
  for (const L of LEVELS) {
    const s = data.reference.filter((r) => r.s === 's' && r.l === L);
    if (s.length) svalex[L] = { now: coverage(s, true), baseline: coverage(s, false) };
    const k = data.reference.filter((r) => r.s === 'k' && r.l === L);
    if (k.length) kelly[L] = { now: coverage(k, true), baseline: coverage(k, false) };
  }
  const top = data.reference.filter((r) => r.s === 'k' && r.r && r.r <= 4000);
  const countTop = (useNow) => top.filter((r) => { const s = useNow ? statusNow(r) : r.c; return s === 'kb' || s === 'basic'; }).length;

  // ---- per-theme gap progress ----
  const themes = Object.entries(data.themes).map(([code, t]) => {
    const mine = gaps.filter((g) => g.theme === code);
    const by = (p) => ({ total: mine.filter((g) => g.p === p).length, done: mine.filter((g) => g.p === p && g.done).length });
    return { code, icon: t.icon, zh: t.zh, p1: by(1), p2: by(2), p3: by(3), basic: by(0) };
  }).filter((t) => t.p1.total + t.p2.total + t.p3.total + t.basic.total > 0);

  // Gap words that now have a KB note — the 🎯 deck for Öva (review).
  const learned = gaps.filter((g) => g.done && g.p >= 1).map((g) => {
    const w = wordFor(g.w);
    return { w: g.w, zh: g.zh, theme: g.theme, p: g.p, slug: w ? w.slug : '', created: w ? w.created : '' };
  });

  const total = (p) => gaps.filter((g) => g.p === p).length;
  const done = (p) => gaps.filter((g) => g.p === p && g.done).length;
  const progress = {
    generatedAt: process.env.KB_SITE_GENERATED_AT || new Date().toISOString().replace('T', ' ').slice(0, 19),
    analysisDate: data.generated,
    svalex, kelly,
    top4000: { now: countTop(true), baseline: countTop(false) },
    priorities: [1, 2, 3, 0].map((p) => ({ p, total: total(p), done: done(p) })),
    themes,
    learned,
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `window.VOCAB_PROGRESS = ${JSON.stringify(progress)};\n`, 'utf8');

  const line = (o) => LEVELS.filter((L) => o[L]).map((L) => `${L} ${o[L].now.kbBasic}%（基线 ${o[L].baseline.kbBasic}%）`).join(' · ');
  console.log(`Generated ${path.relative(repoRoot, outPath)}`);
  console.log(`  教材核心词 (SVALex, KB+基础词): ${line(svalex)}`);
  console.log(`  Kelly (KB+基础词):              ${line(kelly)}`);
  console.log(`  最常用 4000 词: ${progress.top4000.now}（基线 ${progress.top4000.baseline}）`);
  console.log('  缺口已补: ' + progress.priorities.map((x) => `${x.p ? 'P' + x.p : '基础'} ${x.done}/${x.total}`).join(' · '));
}

main();

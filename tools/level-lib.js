// Shared level rules for 🪜 Nivå (site/niva/SPEC.md §4) — one implementation for
// every builder that needs a CEFR level or a text difficulty:
//   tools/build-reading-site.js  → per-article lv / lvHi / lix / over / d / up
//   tools/build-niva-data.js     → words, phrases, sentences, grammar, listening
// The page-side twin (site/niva/niva.js) only reads the results; keep the rules here.
'use strict';

const LEVELS = ['A1', 'A2', 'B1', 'B2'];                       // home levels; C1/C2 fold into B2
const RANK = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
const BY_RANK = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
// SFI course → CEFR span (sv-assess/levels.md: A≈A1 · B≈A2 · C≈A2+/B1− · D≈B1).
const SFI = { A: ['A1', 'A1'], B: ['A2', 'A2'], C: ['A2', 'B1'], D: ['B1', 'B1'] };

// "A2" · "A2–B1" · "SFI B / CEFR A2" · "SFI B-C / CEFR A2" · "A1 / SFI B" · "SFI C" → { lo, hi } | null.
// When the string names CEFR explicitly, only the part after "CEFR" counts (the SFI part is a
// coarser restatement of the same thing); otherwise every A1–C2 token counts; SFI letters are
// the fallback.
function parseLevel(raw) {
  const s = String(raw == null ? '' : raw);
  if (!s.trim()) return null;
  const at = s.search(/CEFR/i);
  const toks = (at >= 0 ? s.slice(at + 4) : s).match(/[ABC][12]/g);
  if (toks && toks.length) {
    const r = toks.map((t) => RANK[t]);
    return { lo: BY_RANK[Math.min(...r)], hi: BY_RANK[Math.max(...r)] };
  }
  const m = s.match(/SFI\s*([A-D])\b(?:\s*[-–\/]\s*([A-D])\b)?/i);
  if (m) {
    const a = SFI[m[1].toUpperCase()];
    const b = m[2] ? SFI[m[2].toUpperCase()] : a;
    return { lo: RANK[a[0]] <= RANK[b[0]] ? a[0] : b[0], hi: RANK[a[1]] >= RANK[b[1]] ? a[1] : b[1] };
  }
  return null;
}

const fold = (lv) => (RANK[lv] >= 4 ? 'B2' : lv || '');
const rankOf = (lv) => Math.min(RANK[lv] || 0, 4);

// Where an item lives in Nivå: home = lower bound (C1/C2 → B2); a range whose folded
// upper bound is higher makes it a 🌉 bridge item at the end of its home level.
function placement(p) {
  if (!p) return { lv: '', hi: '', br: 0 };
  const lv = fold(p.lo);
  const hi = fold(p.hi);
  return rankOf(hi) > rankOf(lv) ? { lv, hi, br: 1 } : { lv, hi: '', br: 0 };
}

const levelFromRank = (r) => BY_RANK[Math.max(1, Math.min(4, Math.round(r)))] || '';

// Median of a list of level ranks (0 = unknown, ignored) → level string or ''.
function medianLevel(ranks) {
  const r = ranks.filter((x) => x > 0).sort((a, b) => a - b);
  if (!r.length) return '';
  return levelFromRank(r[(r.length - 1) >> 1]);
}

// ---------------------------------------------------------------------------
// Text difficulty (§4.3). Only used to ORDER texts inside a level and to flag
// ⬆ 偏难 — it never moves a text out of the level its author declared.
// ---------------------------------------------------------------------------

const CJK = /[㐀-鿿]/;
const WORD = /[A-Za-zÅÄÖåäöÉéÜü]+(?:-[A-Za-zÅÄÖåäöÉéÜü]+)*/g;
// Closed-class words both reference lists can miss; always A1.
const A1_EXTRA = ('och att i på är en ett det som för med till av om inte har den de jag du han hon vi ni man sig ' +
  'var kan ska vill måste så men eller när där här vad vem hur varför också bara mycket många alla inga någon något ' +
  'några min mitt mina din ditt dina hans hennes vår vårt våra er ert era deras sin sitt sina mig dig honom henne oss ' +
  'dem hade fick blev går kom gick sa ja nej hej tack').split(' ');

// Surface form (lowercase) → lowest level rank. KB word notes contribute every inflected
// form from their Forms table; the Kelly / SVALex reference list (profile/vocab-gaps.json
// `reference`) contributes lemmas the KB has no note for.
function buildLexicon({ vocab = [], reference = [] } = {}) {
  const lex = new Map();
  const put = (k, r) => {
    const key = String(k || '').toLowerCase().trim();
    if (!key || !r) return;
    const prev = lex.get(key);
    if (!prev || r < prev) lex.set(key, r);
  };
  for (const v of vocab) {
    const p = parseLevel(v.cefr);
    const r = p ? rankOf(p.lo) : 0;
    for (const f of v.forms || []) put(f, r);
    put(v.lemma, r);
  }
  for (const e of reference) {
    const r = rankOf(e.l);
    put(e.w, r);
    if (e.g) put(e.g, r);
  }
  for (const w of A1_EXTRA) put(w, 1);
  return lex;
}

// The Swedish prose of an article body: the "## 瑞典语原文" section when there is one,
// otherwise the whole body. Chinese lines, headings, tables, quotes and fences go;
// list bullets, dialog speaker labels and markdown are stripped from what stays.
function svProse(body) {
  const text = String(body || '');
  const lines = text.split(/\r?\n/);
  let from = 0;
  let to = lines.length;
  const start = lines.findIndex((l) => /^##\s.*(瑞典语原文|🇸🇪\s*原文)/.test(l));
  if (start >= 0) {
    from = start + 1;
    const end = lines.slice(from).findIndex((l) => /^##\s/.test(l));
    if (end >= 0) to = from + end;
  }
  const out = [];
  for (const raw of lines.slice(from, to)) {
    let l = raw.trim();
    if (!l || CJK.test(l)) continue;
    if (/^(#|\||>|```|---|\*\*\*|___)/.test(l)) continue;
    l = l.replace(/^[-*+]\s+|^\d+[.)]\s+/, '');
    // Dialog speaker label: "**Emma:** …", "Emma: …", "Receptionist (R): …", "A: …"
    l = l.replace(/^(?:\*\*)?[A-ZÅÄÖ][A-Za-zÅÄÖåäöÉé.\- ]{0,23}?(?:\s*\([^)]{1,30}\))?\s*(?:\*\*\s*:|:\s*\*\*|:)\s+/, '');
    l = l.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '');
    if (/[A-Za-zÅÄÖåäö]{2}/.test(l)) out.push(l);
  }
  return out.join('\n');
}

// LIX + a level histogram of the tokens. hist[r] = tokens whose lowest level rank is r
// (1–6); hist[0] = lowercase tokens the lexicon does not know. Capitalised unknown tokens
// are treated as names and only count toward LIX.
function textStats(prose, lex) {
  const tokens = String(prose || '').match(WORD) || [];
  let sentences = 0;
  for (const line of String(prose || '').split('\n')) {
    for (const seg of line.split(/[.!?:…]+(?=\s|$)/)) if (/[A-Za-zÅÄÖåäö]/.test(seg)) sentences += 1;
  }
  const hist = [0, 0, 0, 0, 0, 0, 0];
  let long = 0;
  let names = 0;
  for (const t of tokens) {
    if (t.length > 6) long += 1;
    const r = lex.get(t.toLowerCase());
    if (r) hist[r] += 1;
    else if (/^[A-ZÅÄÖÉÜ]/.test(t)) names += 1;
    else if (t.length > 1) hist[0] += 1;
  }
  const words = tokens.length;
  const lix = words ? words / Math.max(1, sentences) + (100 * long) / words : 0;
  return { words, sentences, long, names, hist, lix };
}

// Share (0–1) of the recognisable tokens that sit above `level` (unknown lowercase tokens
// count as above). null when there is too little text to say anything.
function overShare(stats, level) {
  const home = rankOf(level);
  if (!stats || !home) return null;
  const h = stats.hist;
  const total = h.reduce((a, b) => a + b, 0);
  if (total < 20) return null;
  let above = h[0];
  for (let r = home + 1; r < h.length; r += 1) above += h[r];
  return above / total;
}

// Lowest level a reader could manage (≤ `maxOver` above-level tokens), for texts that
// declare no level of their own. '' when the text is too short to judge.
function inferTextLevel(stats, maxOver) {
  for (const lv of LEVELS) {
    const o = overShare(stats, lv);
    if (o == null) return '';
    if (o <= maxOver) return lv;
  }
  return 'B2';
}

// Percentile rank (0–1, ties share their average rank) of each value in `values`.
function percentiles(values) {
  const n = values.length;
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(n).fill(0);
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j += 1;
    const p = n > 1 ? ((i + j) / 2) / (n - 1) : 0;
    for (let k = i; k <= j; k += 1) out[idx[k][1]] = p;
    i = j + 1;
  }
  return out;
}

// Difficulty 1–5 inside each group (e.g. "A2|reading"): 0.45 LIX + 0.45 above-level share
// + 0.10 length, each as a percentile within the group; the easiest fifth gets 1.
// `items` need { lix, over, words }; items without stats (lix 0 / over null) get d = 0.
function assignDifficulty(items, groupOf) {
  const groups = new Map();
  for (const it of items) {
    it.d = 0;
    if (!it.lix || it.over == null) continue;
    const g = groupOf(it);
    if (!g) continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(it);
  }
  for (const list of groups.values()) {
    const pl = percentiles(list.map((x) => x.lix));
    const po = percentiles(list.map((x) => x.over));
    const pn = percentiles(list.map((x) => x.words));
    const scored = list.map((x, i) => ({ x, s: 0.45 * pl[i] + 0.45 * po[i] + 0.10 * pn[i] }));
    scored.sort((a, b) => a.s - b.s);
    scored.forEach((e, i) => { e.x.d = 1 + Math.floor((i * 5) / scored.length); });
  }
}

module.exports = {
  LEVELS, RANK, parseLevel, placement, fold, rankOf, levelFromRank, medianLevel,
  buildLexicon, svProse, textStats, overShare, inferTextLevel, assignDifficulty,
};

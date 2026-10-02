#!/usr/bin/env node
// Study-guide health check for one reading article (sv-study-guide skill).
//
//   node tools/check-coverage.js <slug | imported/…md> [--gaps <out.tsv>] [--json]
//
// Reports, for the article's "## 瑞典语原文" section:
//   • vocab coverage — share of tokens the 📖 Läsning site can make clickable,
//     using the same matcher as site/reading/reading.js (exact surface → -s
//     fallback for non-capitalised, non-adjective hits → -aste → -ast);
//   • the content words still missing (function words + capitalised names skipped);
//   • learning-item count from the svensk-export block (0 = format problem);
//   • 逐段精读 state: present?, card count vs. source paragraphs, broken [[links]].
// --gaps writes "surface<TAB>slug" lines for the librarian to work from.
// Exit code 1 when there are broken links or the item panel would be empty.
//
// Rebuilds site/reading/reading-data.js first so new KB notes are counted.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repo = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? null : (args.splice(i, 2)[1] || ''); };
const gapsOut = flag('--gaps');
const asJson = args.includes('--json');
const target = args.filter((a) => a !== '--json')[0];
if (!target) {
  console.error('usage: node tools/check-coverage.js <slug | path> [--gaps out.tsv] [--json]');
  process.exit(2);
}
const slug = path.basename(target).replace(/\.md$/, '');

execFileSync('node', [path.join(repo, 'tools/build-reading-site.js')], { stdio: 'ignore' });
global.window = {};
// eslint-disable-next-line no-eval
eval(fs.readFileSync(path.join(repo, 'site/reading/reading-data.js'), 'utf8'));
const data = global.window.READING_DATA;
const article = data.articles.find((a) => a.slug === slug);
if (!article) { console.error(`article not found: ${slug} (looked in inbox/ + imported/)`); process.exit(2); }

// --- matcher (keep in sync with site/reading/reading.js findVocab) ---
const index = new Map();
for (const v of data.vocab) {
  for (const f of v.forms) {
    const k = f.toLowerCase();
    const e = index.get(k);
    if (!e) index.set(k, v);
    else if (e.lemma.toLowerCase() !== k && v.lemma.toLowerCase() === k) index.set(k, v);
  }
}
const S_STOP = new Set(['rätts']);
function findVocab(raw) {
  const k = raw.toLowerCase();
  if (index.get(k)) return index.get(k);
  if (k.length >= 5 && k.endsWith('s') && !/^[A-ZÅÄÖ]/.test(raw) && !S_STOP.has(k)) {
    const e = index.get(k.slice(0, -1));
    if (e && !/^adj(ektiv)?\.?$/i.test(String(e.ordklass || '').trim())) return e;
  }
  if (k.endsWith('aste')) return index.get(k.slice(0, -1)) || null;
  return null;
}
const FUNCTION_WORDS = new Set(('och i på att som han hon det den de en ett till från med av för om men inte så då nu där här ' +
  'var vi ni jag du man sig sin sina sitt hans hennes deras dem honom henne mig dig oss er vad vem när eller också än ' +
  'efter under vid ur mot hos utan').split(' '));

// --- Swedish source text ---
const sections = article.body.split(/\n(?=## )/);
// Normal articles have one "## 瑞典语原文" section. Others (news digests, …)
// spread the Swedish over several sections: then take every section before the
// first translation / notes / study-guide heading, minus lines with Chinese.
const svSection = sections.find((s) => /^## .*(瑞典语原文|Källtext)/.test(s));
let svText;
if (svSection) {
  svText = svSection.replace(/^## .*\n/, '');
} else {
  const stop = sections.findIndex((s) => /^## .*(翻译|译文|教学|备注|精读|导入块|复习表)/.test(s));
  svText = sections.slice(0, stop === -1 ? undefined : stop)
    .join('\n').split('\n').filter((l) => !/[㐀-鿿]/.test(l) && !/^#/.test(l)).join('\n');
}
const paragraphs = svText.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !/^#/.test(p));

let tokens = 0, covered = 0, contentTokens = 0, contentCovered = 0;
const missing = new Map();
for (const m of svText.matchAll(/[A-Za-zÀ-ÿ]+/g)) {
  const w = m[0];
  tokens += 1;
  const hit = findVocab(w);
  if (hit) covered += 1;
  const lower = w.toLowerCase();
  const isName = /^[A-ZÅÄÖ]/.test(w) && !index.has(lower);
  if (FUNCTION_WORDS.has(lower) || isName) continue;
  contentTokens += 1;
  if (hit) contentCovered += 1; else missing.set(lower, (missing.get(lower) || 0) + 1);
}

// --- 逐段精读 state ---
const file = path.join(repo, article.path);
const raw = fs.readFileSync(file, 'utf8');
const gStart = raw.search(/^## .*精读/m);
const guide = gStart === -1 ? '' : raw.slice(gStart, raw.indexOf('```svensk-export', gStart) === -1 ? undefined : raw.indexOf('```svensk-export', gStart));
const cards = (guide.match(/^### /gm) || []).length;
const slugs = new Set();
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(dir, e.name));
    else if (e.name.endsWith('.md')) slugs.add(e.name.slice(0, -3));
  }
})(path.join(repo, 'knowledge_base'));
const broken = [...new Set([...guide.matchAll(/\[\[([^\]|]+)/g)].map((m) => m[1]))].filter((s) => !slugs.has(s));

const report = {
  slug,
  path: article.path,
  listening: article.listening ? article.listening.id : null,
  coverage: { tokens, covered, pct: tokens ? +(100 * covered / tokens).toFixed(1) : 0 },
  contentCoverage: { tokens: contentTokens, covered: contentCovered, pct: contentTokens ? +(100 * contentCovered / contentTokens).toFixed(1) : 0 },
  missing: [...missing.entries()].sort((a, b) => b[1] - a[1]).map(([w, n]) => ({ word: w, count: n })),
  learningItems: article.itemTotal,
  guide: { present: gStart !== -1, cards, sourceParagraphs: paragraphs.length, brokenLinks: broken },
};

if (gapsOut) {
  fs.writeFileSync(gapsOut, report.missing.map((m) => `${m.word}\t${slug}`).join('\n') + '\n');
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const g = report.guide;
  console.log(`📄 ${slug}${report.listening ? '  🎧 ' + report.listening : ''}`);
  console.log(`   覆盖率  全部词 ${report.coverage.pct}% (${covered}/${tokens})  ·  实词 ${report.contentCoverage.pct}% (${contentCovered}/${contentTokens})`);
  console.log(`   学习项  ${report.learningItems}${report.learningItems ? '' : '  ⚠️ 导出块未被解析（格式问题）'}`);
  console.log(`   精读    ${g.present ? `✅ ${g.cards} 张卡片 / 原文 ${g.sourceParagraphs} 段` : '— 尚未写'}` +
    (g.brokenLinks.length ? `  ⚠️ 断链: ${g.brokenLinks.join(', ')}` : ''));
  console.log(`   缺词    ${report.missing.length ? report.missing.map((m) => m.word).join(' ') : '无'}`);
  if (gapsOut) console.log(`   → 缺词清单已写入 ${gapsOut}`);
}
process.exit(report.guide.brokenLinks.length || !report.learningItems ? 1 : 0);

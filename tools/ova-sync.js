#!/usr/bin/env node
// Write review results back into the KB: an `ova-results v1` block copied from 🔁 Öva (site/ova/)
// or from 🪜 Nivå (site/niva/, which also carries Öva's rows). Read on stdin or from a file argument.
//
// 1) Öva rows — spaced-repetition fields of the word note:
//      - hävda | slug hävda | box 2 | ✓3 ✗1 | 2026-10-03
//    reviewed      ← date of the last review
//    review_count  ← max(current, ✓ + ✗)        (totals → re-running is harmless)
//    interval      ← days for the Leitner box   (0 1 2 4 7 14 30)
//    ease          ← 2.5 + 0.1·(✓ − 2·✗), clamped to 1.3–3.0
//    known: true   ← once box ≥ 5 with ≥ 4 right answers and ≤ 20 % wrong
// 2) Nivå 「过一遍」 rows — he flipped the card and said 😎 会:
//      - smörgås | slug smörgås | known | 2026-11-21
//    known: true on knowledge_base/words/<slug>.md (or phrases/<slug>.md for a phrase).
// 3) Nivå level rows — 🏁 self-test / 🧭 placement:
//      level: A1 | test 18/20 | passed | 2026-11-21        (passed · placed · -)
//    passed / placed → one row in profile/level.md 「评估历史」; the overall estimate stays /assess's call.
//
// Words that become known are added to profile/level.md 「已掌握」 (sv-assess: no full lookups for them).
// Every step is idempotent: running the same block twice changes nothing the second time.
//
//   node tools/ova-sync.js results.txt
//   node tools/ova-sync.js <<'EOF'
//   ```ova-results v1
//   date: 2026-10-03
//   - hävda | slug hävda | box 2 | ✓3 ✗1 | 2026-10-03
//   ```
//   EOF
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const wordsDir = path.join(repoRoot, 'knowledge_base', 'words');
const phrasesDir = path.join(repoRoot, 'knowledge_base', 'phrases');
const profilePath = path.join(repoRoot, 'profile', 'level.md');
const INTERVALS = [0, 1, 2, 4, 7, 14, 30];

const input = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : fs.readFileSync(0, 'utf8');
if (!/ova-results v1/.test(input)) {
  console.error('No `ova-results v1` block found.');
  process.exit(1);
}

const rows = [];
const knownRows = [];
const levelRows = [];
for (const line of input.split(/\r?\n/)) {
  let m = line.match(/^\s*-\s*(.+?)\s*\|\s*slug\s+(\S+)\s*\|\s*box\s+(\d)\s*\|\s*✓\s*(\d+)\s*✗\s*(\d+)\s*\|\s*(\d{4}-\d{2}-\d{2})/);
  if (m) { rows.push({ lemma: m[1], slug: m[2], box: +m[3], right: +m[4], wrong: +m[5], date: m[6] }); continue; }
  m = line.match(/^\s*-\s*(.+?)\s*\|\s*slug\s+(\S+)\s*\|\s*known\s*\|\s*(\d{4}-\d{2}-\d{2})/);
  if (m) { knownRows.push({ lemma: m[1], slug: m[2], date: m[3] }); continue; }
  m = line.match(/^\s*level:\s*([ABC][12])\s*\|\s*test\s+(\d+\s*\/\s*\d+|-)\s*\|\s*(passed|placed|-)\s*\|\s*(\d{4}-\d{2}-\d{2})/);
  if (m) levelRows.push({ lv: m[1], test: m[2].replace(/\s+/g, ''), status: m[3], date: m[4] });
}

// Set (or add) a scalar key inside the YAML frontmatter.
function setKey(fm, key, value) {
  const re = new RegExp(`^${key}:.*$`, 'm');
  return re.test(fm) ? fm.replace(re, `${key}: ${value}`) : `${fm}\n${key}: ${value}`;
}
function editFrontmatter(file, fn) {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = fn(m[1]);
  const next = text.replace(m[0], `---\n${fm}\n---`);
  if (next === text) return false;
  fs.writeFileSync(file, next, 'utf8');
  return true;
}

// ---- 1) Öva rows ----
const updated = [];
const missing = [];
const mastered = [];   // { lemma, tag } → profile 已掌握
for (const r of rows) {
  const file = path.join(wordsDir, `${r.slug}.md`);
  if (!fs.existsSync(file)) { missing.push(r.lemma); continue; }
  let became = false;
  const changed = editFrontmatter(file, (fm) => {
    const current = parseInt((fm.match(/^review_count:\s*(\d+)/m) || [])[1] || '0', 10);
    const total = r.right + r.wrong;
    const ease = Math.min(3.0, Math.max(1.3, 2.5 + 0.1 * (r.right - 2 * r.wrong)));
    fm = setKey(fm, 'reviewed', `"${r.date}"`);
    fm = setKey(fm, 'review_count', String(Math.max(current, total)));
    fm = setKey(fm, 'interval', String(INTERVALS[Math.min(r.box, INTERVALS.length - 1)]));
    fm = setKey(fm, 'ease', ease.toFixed(2));
    const isMastered = r.box >= 5 && r.right >= 4 && r.wrong <= 0.2 * total;
    if (isMastered && !/^known:\s*true/m.test(fm)) { fm = setKey(fm, 'known', 'true'); became = true; }
    return fm;
  });
  if (changed === null) { missing.push(r.lemma); continue; }
  if (changed) updated.push(r.lemma);
  if (became) mastered.push({ lemma: r.lemma, tag: `Öva 掌握 ${r.date}` });
}

// ---- 2) Nivå 「会」 rows ----
const knownWords = [];
const knownPhrases = [];
for (const r of knownRows) {
  const asWord = path.join(wordsDir, `${r.slug}.md`);
  const asPhrase = path.join(phrasesDir, `${r.slug}.md`);
  const file = fs.existsSync(asWord) ? asWord : fs.existsSync(asPhrase) ? asPhrase : '';
  if (!file) { missing.push(r.lemma); continue; }
  const changed = editFrontmatter(file, (fm) => (/^known:\s*true\s*$/m.test(fm) ? fm : setKey(fm, 'known', 'true')));
  if (changed === null) { missing.push(r.lemma); continue; }
  if (!changed) continue;
  if (file === asWord) { knownWords.push(r.lemma); mastered.push({ lemma: r.lemma, tag: `Nivå 自评 ${r.date}` }); } else knownPhrases.push(r.lemma);
}

// ---- profile/level.md ----
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function sectionBounds(prof, headRe) {
  const head = prof.match(headRe);
  if (!head) return null;
  const start = head.index + head[0].length;
  const nextHead = prof.slice(start).search(/^## /m);
  return { start, end: nextHead === -1 ? prof.length : start + nextHead };
}
let prof = fs.existsSync(profilePath) ? fs.readFileSync(profilePath, 'utf8') : '';
const profBefore = prof;
// Mastered words join the skip-list (sv-assess: 已掌握 = no full lookups).
if (mastered.length && prof) {
  const b = sectionBounds(prof, /^## ✅ 已掌握.*$/m);
  if (b) {
    let section = prof.slice(b.start, b.end);
    const seen = new Set();
    const add = mastered.filter((x) => {
      if (seen.has(x.lemma) || new RegExp(`^- ${escRe(x.lemma)}(\\s|（|$)`, 'm').test(section)) return false;
      seen.add(x.lemma);
      return true;
    });
    if (add.length) {
      section = section.replace(/^- _\(空[^\n]*\n?/m, '').replace(/\s*$/, '');
      const lastLine = section.split('\n').pop();
      // Continue an existing list directly; start a new one after a blank line.
      section += (/^- /.test(lastLine) ? '\n' : '\n\n') + add.map((x) => `- ${x.lemma}（${x.tag}）`).join('\n') + '\n\n';
      prof = prof.slice(0, b.start) + section + prof.slice(b.end);
    }
  }
}
// Passed / placed levels → one row each in 评估历史 (the table's last row is followed by the new ones).
const history = [];
if (levelRows.length && prof) {
  const b = sectionBounds(prof, /^## 🕓 评估历史.*$/m);
  if (b) {
    let section = prof.slice(b.start, b.end);
    for (const r of levelRows) {
      if (r.status === '-') continue;
      const label = r.lv === 'B2' ? 'B2+' : r.lv;
      if (new RegExp(`^\\|\\s*${escRe(r.date)}\\s*\\|\\s*${escRe(label)} ✅`, 'm').test(section)) continue;
      const note = r.status === 'placed' ? `Nivå 定级测试通过（${r.test}）` : `Nivå 通关（自测 ${r.test}）`;
      const row = `| ${r.date} | ${label} ✅ | ${note} |`;
      const lines = section.split('\n');
      let last = -1;
      lines.forEach((l, i) => { if (/^\|/.test(l)) last = i; });
      if (last === -1) { section = section.replace(/\s*$/, '\n') + `| 日期 | 总体 | 备注 |\n|------|------|------|\n${row}\n\n`; } else {
        lines.splice(last + 1, 0, row);
        section = lines.join('\n');
      }
      history.push(`${label} ${r.status === 'placed' ? '定级通过' : '通关'}`);
    }
    prof = prof.slice(0, b.start) + section + prof.slice(b.end);
  }
}
if (prof && prof !== profBefore) fs.writeFileSync(profilePath, prof, 'utf8');

const parts = [];
if (rows.length) parts.push(`Öva 结果 ${rows.length} 条 · 更新 ${updated.length} 个词条`);
const nowKnown = mastered.filter((x) => x.tag.startsWith('Öva')).map((x) => x.lemma);
if (nowKnown.length) parts.push(`Öva 新掌握 ${nowKnown.length} 个：${nowKnown.join(', ')}`);
if (knownRows.length) {
  parts.push(`Nivå「会」${knownRows.length} 条 · 新标 known: true —— 单词 ${knownWords.length} 个、词组 ${knownPhrases.length} 个` +
    (knownWords.length ? '（单词已加入 profile/level.md 已掌握）' : ''));
}
if (history.length) parts.push(`评估历史 +${history.length}：${history.join('、')}`);
else if (levelRows.length) parts.push(`级别记录 ${levelRows.length} 条（没有新的通关 / 定级）`);
if (missing.length) parts.push(`找不到 ${missing.length} 个：${missing.join(', ')}`);
console.log(parts.length ? parts.join(' · ') : '这段结果里没有可写回的行。');

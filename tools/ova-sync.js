#!/usr/bin/env node
// Write Öva (site/ova/) review results back into the KB word notes.
//
// Reads an `ova-results v1` block (copied from the Öva page) on stdin or from a
// file argument, and updates each word note's spaced-repetition frontmatter:
//
//   reviewed      ← date of the last review
//   review_count  ← max(current, ✓ + ✗)        (totals → re-running is harmless)
//   interval      ← days for the Leitner box   (0 1 2 4 7 14 30)
//   ease          ← 2.5 + 0.1·(✓ − 2·✗), clamped to 1.3–3.0
//   known: true   ← once box ≥ 5 with ≥ 4 right answers and ≤ 20 % wrong;
//                   the lemma is then also added to profile/level.md 已掌握.
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
const profilePath = path.join(repoRoot, 'profile', 'level.md');
const INTERVALS = [0, 1, 2, 4, 7, 14, 30];

const input = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : fs.readFileSync(0, 'utf8');
if (!/ova-results v1/.test(input)) {
  console.error('No `ova-results v1` block found.');
  process.exit(1);
}

const rows = [];
for (const line of input.split(/\r?\n/)) {
  const m = line.match(/^\s*-\s*(.+?)\s*\|\s*slug\s+(\S+)\s*\|\s*box\s+(\d)\s*\|\s*✓\s*(\d+)\s*✗\s*(\d+)\s*\|\s*(\d{4}-\d{2}-\d{2})/);
  if (m) rows.push({ lemma: m[1], slug: m[2], box: +m[3], right: +m[4], wrong: +m[5], date: m[6] });
}

// Set (or add) a scalar key inside the YAML frontmatter.
function setKey(fm, key, value) {
  const re = new RegExp(`^${key}:.*$`, 'm');
  return re.test(fm) ? fm.replace(re, `${key}: ${value}`) : `${fm}\n${key}: ${value}`;
}

const updated = [];
const missing = [];
const mastered = [];
for (const r of rows) {
  const file = path.join(wordsDir, `${r.slug}.md`);
  if (!fs.existsSync(file)) { missing.push(r.lemma); continue; }
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) { missing.push(r.lemma); continue; }
  let fm = m[1];
  const current = parseInt((fm.match(/^review_count:\s*(\d+)/m) || [])[1] || '0', 10);
  const total = r.right + r.wrong;
  const ease = Math.min(3.0, Math.max(1.3, 2.5 + 0.1 * (r.right - 2 * r.wrong)));
  fm = setKey(fm, 'reviewed', `"${r.date}"`);
  fm = setKey(fm, 'review_count', String(Math.max(current, total)));
  fm = setKey(fm, 'interval', String(INTERVALS[Math.min(r.box, INTERVALS.length - 1)]));
  fm = setKey(fm, 'ease', ease.toFixed(2));
  const isMastered = r.box >= 5 && r.right >= 4 && r.wrong <= 0.2 * total;
  if (isMastered && !/^known:\s*true/m.test(fm)) {
    fm = setKey(fm, 'known', 'true');
    mastered.push(r.lemma);
  }
  const next = text.replace(m[0], `---\n${fm}\n---`);
  if (next !== text) { fs.writeFileSync(file, next, 'utf8'); updated.push(r.lemma); }
}

// Mastered words join the profile's skip-list (sv-assess: 已掌握 = no full lookups).
if (mastered.length && fs.existsSync(profilePath)) {
  let prof = fs.readFileSync(profilePath, 'utf8');
  const head = prof.match(/^## ✅ 已掌握.*$/m);
  if (head) {
    const start = head.index + head[0].length;
    const nextHead = prof.slice(start).search(/^## /m);
    const end = nextHead === -1 ? prof.length : start + nextHead;
    let section = prof.slice(start, end);
    const add = mastered.filter((l) => !new RegExp(`^- ${l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|（|$)`, 'm').test(section));
    if (add.length) {
      section = section.replace(/^- _\(空[^\n]*\n?/m, '');
      section = section.replace(/\s*$/, '\n') + add.map((l) => `- ${l}（Öva 掌握 ${rows[0].date}）`).join('\n') + '\n\n';
      prof = prof.slice(0, start) + section + prof.slice(end);
      fs.writeFileSync(profilePath, prof, 'utf8');
    }
  }
}

console.log(`Öva 结果：${rows.length} 条 · 更新 ${updated.length} 个词条` +
  (mastered.length ? ` · 新掌握 ${mastered.length} 个（known: true，已加入 profile/level.md）：${mastered.join(', ')}` : '') +
  (missing.length ? ` · 找不到 ${missing.length} 个：${missing.join(', ')}` : ''));

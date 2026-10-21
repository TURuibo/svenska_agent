#!/usr/bin/env node
// Activity gate for the remote scheduled routines (CLAUDE.md §4.9).
//
// Ruibo's rule (2026-10-21): "activity" means marking generated material as read
// (标为已读 in 📖 Läsning / 🗣️ Tala / 🎧 Lyssna) — not photo uploads or /learn.
// If nothing has been marked read for 48 h, the routines stop generating; the
// next mark makes the next scheduled run go ahead again.
//
// The sites push the marks (site/read-sync.js) to read-log.json on the repo's
// `read-log` branch:
//   { version, created, lastMarkedAt, reads: { <slug | lyssna:<episode>>: <iso time | null> } }
// null = an old mark migrated from before syncing existed; it never counts as fresh.
// Before the first real mark the clock runs from `created`.
//
//   node tools/activity-gate.js                       # fetch origin/read-log and decide
//   node tools/activity-gate.js --log read-log.json   # use a local copy (testing)
//   node tools/activity-gate.js --hours 36 --now 2026-10-24T02:00:00Z   # override window / clock
//
// Prints one line starting with RUN or SKIP. Exit code: 0 = RUN, 3 = SKIP.
// ERROR (exit 1) means the gate itself failed — routines then run as usual (fail open).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_HOURS = 48;
const BRANCH = 'read-log';
const FILE = 'read-log.json';

function parseArgs(argv) {
  const opts = { hours: DEFAULT_HOURS, now: new Date(), log: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--hours') opts.hours = Number(val());
    else if (a === '--now') opts.now = parseDate(val(), a);
    else if (a === '--log') opts.log = val();
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!(opts.hours > 0)) throw new Error('--hours must be a positive number');
  return opts;
}

function parseDate(s, flag) {
  const d = new Date(s);
  if (isNaN(d)) throw new Error(`${flag}: not a date: ${s}`);
  return d;
}

function readLog(file) {
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const git = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git(['fetch', '--quiet', '--depth=1', 'origin', BRANCH]);
  } catch (e) {
    throw new Error(`git fetch origin ${BRANCH} 失败（分支不存在或没网）`);
  }
  return JSON.parse(git(['show', `FETCH_HEAD:${FILE}`]));
}

// Newest timestamped mark (at <= now, so --now can replay a past day).
function lastMark(log, now) {
  let best = null;
  const consider = (iso, id) => {
    const at = iso ? new Date(iso) : null;
    if (at && !isNaN(at) && at <= now && (!best || at > best.at)) best = { at, id };
  };
  for (const [id, iso] of Object.entries(log.reads || {})) consider(iso, id);
  consider(log.lastMarkedAt, null);   // survives the mark being undone later
  return best;
}

function fmt(d) {
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const log = readLog(opts.log);
  const mark = lastMark(log, opts.now);
  let since, what;
  if (mark) {
    since = mark.at;
    what = `最近一次标记已读 ${fmt(since)}${mark.id ? `（${mark.id}）` : ''}`;
  } else {
    since = parseDate(log.created, 'created');
    what = `还没有标记过已读，从 ${fmt(since)} 起算`;
  }
  const hours = (opts.now - since) / 36e5;
  if (hours < opts.hours) {
    console.log(`RUN — ${what}，距今 ${hours.toFixed(1)} 小时 < ${opts.hours} 小时`);
    process.exit(0);
  }
  console.log(`SKIP — ${what}，距今 ${hours.toFixed(1)} 小时 ≥ ${opts.hours} 小时；` +
    `暂停自动生成，在 Läsning / Tala / Lyssna 标记已读后自动恢复（若标了却仍暂停：检查 ☁️ 同步是否设了 token）`);
  process.exit(3);
}

try {
  main();
} catch (e) {
  console.log(`ERROR — ${e.message}（活跃度检查本身出错：照常运行）`);
  process.exit(1);
}

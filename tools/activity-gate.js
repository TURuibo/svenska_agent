#!/usr/bin/env node
// Activity gate for the remote scheduled routines (CLAUDE.md §4.9).
//
// Ruibo's rule (2026-10-21): if he hasn't been active for ~2 days, the daily
// routines stop generating content; as soon as there is activity again they resume.
// Every routine runs this before generating anything and stops on SKIP.
//
// "Activity" = the newest of two signals:
//   1. git — newest commit on main whose subject is NOT a routine's own
//      ("news: …", "scenario: …", "artikel: …" …): /learn, /ova, /sync, 精读, site work …
//   2. Claude sessions — newest interactive session on this repo. The script can't
//      call the sessions API itself, so the routine agent reads it with
//      mcp__claude-code-remote__list_sessions (scheduled runs are not listed there)
//      and passes its updated_at via --session-at.
// Reading the sites (Läsning / Öva …) leaves no trace and can't be counted.
//
//   node tools/activity-gate.js                               # git signal only
//   node tools/activity-gate.js --session-at 2026-10-21T20:19:00Z
//   node tools/activity-gate.js --hours 36 --now 2026-10-24T02:00:00Z   # override window / clock (testing)
//
// Prints one line starting with RUN or SKIP. Exit code: 0 = RUN, 3 = SKIP.
// Any other failure is a bug in the gate — routines then run as usual (fail open).
const { execFileSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const DEFAULT_HOURS = 48;
// Subjects written by the routines themselves (CLAUDE.md §4.2–§4.7), and merge commits.
const ROUTINE_SUBJECT = /^(news|scenario|artikel|biografi|adjsubst|horning|listening|lattlast|myndighet)\s*[:：]|^Merge /i;

function parseArgs(argv) {
  const opts = { hours: DEFAULT_HOURS, sessions: [], now: new Date() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--session-at') opts.sessions.push(parseDate(val(), a));
    else if (a === '--hours') opts.hours = Number(val());
    else if (a === '--now') opts.now = parseDate(val(), a);
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

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

// Newest non-routine commit on main (origin/main when present: a routine's own branch
// may already carry its commit). Shallow clones are fine — 50 commits is weeks of history.
// Commits after `now` are ignored so --now can replay a past day.
function lastUserCommit(now) {
  let ref = 'HEAD';
  try { git(['rev-parse', '--verify', '--quiet', 'origin/main']); ref = 'origin/main'; } catch (e) { /* no remote ref */ }
  const lines = git(['log', ref, '-n', '300', '--format=%cI%x09%s']).split('\n').filter(Boolean);
  for (const line of lines) {
    const [date, subject] = line.split('\t');
    const at = new Date(date);
    if (at <= now && !ROUTINE_SUBJECT.test(subject)) return { at, what: `git: ${subject}` };
  }
  return null;
}

function fmt(d) {
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const signals = [];
  const commit = lastUserCommit(opts.now);
  if (commit) signals.push(commit);
  for (const at of opts.sessions) if (at <= opts.now) signals.push({ at, what: 'Claude 交互会话' });

  const latest = signals.sort((a, b) => b.at - a.at)[0];
  if (!latest) {
    console.log(`SKIP — 找不到任何活跃记录（git 里没有非 routine 提交，也没有会话时间），暂停自动生成`);
    process.exit(3);
  }
  const hours = (opts.now - latest.at) / 36e5;
  const ago = `距今 ${hours.toFixed(1)} 小时`;
  if (hours < opts.hours) {
    console.log(`RUN — 最近活跃 ${fmt(latest.at)}（${latest.what}），${ago} < ${opts.hours} 小时`);
    process.exit(0);
  }
  console.log(`SKIP — 最近活跃 ${fmt(latest.at)}（${latest.what}），${ago} ≥ ${opts.hours} 小时；暂停自动生成，等有活跃度再恢复`);
  process.exit(3);
}

try {
  main();
} catch (e) {
  console.log(`ERROR — ${e.message}（活跃度检查本身出错：照常运行）`);
  process.exit(1);
}

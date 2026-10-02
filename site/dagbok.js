/* Dagbok — site home: a slim per-day index of what was practised, linking out to
   📖 Läsning (articles), 🎧 Lyssna (episodes) and 🔍 Sök (individual lookups).
   Reads window.DAGBOK_DATA, built by tools/build-dagbok-data.js. */

(function () {
  'use strict';

  const main = document.getElementById('dgDays');
  const summary = document.getElementById('dgSummary');
  const DATA = window.DAGBOK_DATA;
  if (!DATA || !Array.isArray(DATA.days)) {
    summary.textContent = '';
    main.innerHTML =
      '<p class="dgEmpty">⚠️ 找不到 dagbok-data.js — 先运行 <code>node tools/build-kb-site.js</code>、' +
      '<code>build-reading-site.js</code>、<code>build-listening-site.js</code>，再 <code>node tools/build-dagbok-data.js</code>。</p>';
    return;
  }
  const days = DATA.days; // newest first

  // How much of each row shows before "+N ▾".
  const SHOW = { reading: 3, listening: 3, sources: 3, lookups: 8 };
  // Days in the last RECENT_DAYS calendar days render up front (at least
  // MIN_RECENT active days); older ones sit behind "显示更早".
  const RECENT_DAYS = 30;
  const MIN_RECENT = 7;

  // ---------- dates ----------

  function isoLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }
  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);
  const TODAY_KEY = isoLocal(TODAY);
  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function daysAgo(key) {
    const d = parseISO(key);
    return d ? Math.round((TODAY - d) / 86400000) : Infinity;
  }
  function relLabel(key) {
    const n = daysAgo(key);
    if (n === 0) return '今天';
    if (n === 1) return '昨天';
    if (n === 2) return '前天';
    if (n > 2 && n < 7) return `${n} 天前`;
    const d = parseISO(key);
    return d ? `${d.getMonth() + 1} 月 ${d.getDate()} 日` : key;
  }

  // ---------- summary line: streak · this week · updated ----------

  const active = new Set(days.map((d) => d.date));

  function streak() {
    // Counts back from today; if nothing yet today, a run ending yesterday still counts.
    let d = active.has(TODAY_KEY) ? TODAY : addDays(TODAY, -1);
    let n = 0;
    while (active.has(isoLocal(d))) { n += 1; d = addDays(d, -1); }
    return n;
  }
  function activeThisWeek() {
    const monday = addDays(TODAY, -((TODAY.getDay() + 6) % 7));
    let n = 0;
    for (let d = monday; d <= TODAY; d = addDays(d, 1)) if (active.has(isoLocal(d))) n += 1;
    return n;
  }

  const parts = [];
  const s = streak();
  if (s > 0) parts.push(`🔥 连续 ${s} 天`);
  else if (days.length) parts.push(`上次练习：${relLabel(days[0].date)}`);
  parts.push(`本周 ${activeThisWeek()} 天`);
  if (DATA.generatedAt) parts.push(`更新于 ${DATA.generatedAt}`);
  summary.textContent = parts.join(' · ');

  // ---------- links ----------

  const enc = encodeURIComponent;
  function back(date) {
    return `&from=${enc('day-' + date)}&frompage=recap`;
  }
  const readingHref = (slug, date) => `reading/#article=${enc(slug)}${back(date)}`;
  const listeningHref = (id, date) => `listening/#ep=${enc(id)}${back(date)}`;
  const sokHref = (slug) => `sok/#note=${enc(slug)}`;

  // ---------- DOM helpers ----------

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function link(cls, href, text, title) {
    const a = el('a', cls, text);
    a.href = href;
    if (title) a.title = title;
    return a;
  }

  // A row = label column (icon · name · count) + content list. Items past
  // `limit` start hidden behind a "+N ▾" toggle.
  function row(kind, icon, name, entries, limit, unit, listTag) {
    const r = el('div', `dgRow dgRow-${kind}`);
    const label = el('div', 'dgRowLabel');
    label.append(el('span', 'dgRowIcon', icon), el('span', 'dgRowName', name), el('span', 'dgRowCount', String(entries.length)));
    const list = el(listTag || 'ul', 'dgList');
    entries.forEach((node, i) => {
      if (i >= limit) node.classList.add('dgHidden');
      list.appendChild(node);
    });
    const content = el('div', 'dgRowContent');
    content.appendChild(list);
    const extra = entries.length - limit;
    if (extra > 0) {
      const btn = el('button', 'dgMore');
      btn.type = 'button';
      let open = false;
      const sync = () => {
        btn.textContent = open ? '收起 ▴' : `+${extra} ${unit} ▾`;
        btn.setAttribute('aria-expanded', String(open));
        list.classList.toggle('dgOpen', open);
      };
      btn.addEventListener('click', () => { open = !open; sync(); });
      sync();
      content.appendChild(btn);
    }
    r.append(label, content);
    return r;
  }

  // Article titles are mostly "Svenska — 中文"; mute the Chinese half so the
  // Swedish reads first. Splits on the LAST em dash (Swedish parts use – too).
  function titleLink(href, title, tip) {
    const a = link('dgTitle', href, null, tip);
    const i = title.lastIndexOf(' — ');
    if (i > 0 && /[\u3400-\u9fff]/.test(title.slice(i))) {
      a.append(title.slice(0, i), el('span', 'dgZh', title.slice(i)));
    } else {
      a.textContent = title;
    }
    return a;
  }

  function readingEntry(a, date) {
    const li = el('li', 'dgEntry');
    li.appendChild(titleLink(readingHref(a.slug, date), a.title, '📖 在 Läsning 阅读'));
    li.appendChild(el('span', `dgTag kind-${a.kind}`, a.kindLabel));
    if (a.cefr) li.appendChild(el('span', 'dgCefr', a.cefr));
    if (a.ep) li.appendChild(link('dgMini', listeningHref(a.ep, date), '🎧', '🎧 在 Lyssna 听这篇'));
    return li;
  }
  function listeningEntry(ep, date) {
    const li = el('li', 'dgEntry');
    li.appendChild(titleLink(listeningHref(ep.id, date), ep.title, '🎧 在 Lyssna 听'));
    if (ep.readingSlug) li.appendChild(link('dgMini', readingHref(ep.readingSlug, date), '📖', '📖 在 Läsning 读原文'));
    return li;
  }
  function sourceEntry(src) {
    const li = el('li', 'dgEntry');
    li.appendChild(link('dgTitle', sokHref(src.slug), src.label, '在 Sök 打开来源笔记'));
    if (src.count) li.appendChild(el('span', 'dgCefr', `${src.count} 项`));
    return li;
  }
  function lookupChip(it) {
    const a = link(`dgChip type-${it.type}`, sokHref(it.slug), it.label, it.zh || '');
    a.dataset.type = it.type;
    return a;
  }

  // ---------- days ----------

  function renderDay(d) {
    const sec = el('section', 'dgDay');
    sec.id = `day-${d.date}`;
    if (d.date === TODAY_KEY) sec.classList.add('dgToday');

    const h2 = el('h2', 'dgDate', relLabel(d.date));
    const date = parseISO(d.date);
    h2.appendChild(el('span', 'dgDateAbs', date ? `${d.date} ${WEEKDAYS[date.getDay()]}` : d.date));
    sec.appendChild(h2);

    if (d.reading.length) {
      sec.appendChild(row('reading', '📖', '阅读', d.reading.map((a) => readingEntry(a, d.date)), SHOW.reading, '篇'));
    }
    if (d.listening.length) {
      sec.appendChild(row('listening', '🎧', '听力', d.listening.map((ep) => listeningEntry(ep, d.date)), SHOW.listening, '集'));
    }
    if (d.lookups.length) {
      sec.appendChild(row('lookups', '🔍', '查词', d.lookups.map(lookupChip), SHOW.lookups, '个', 'div'));
    }
    if (d.sources.length) {
      sec.appendChild(row('sources', '📝', '来源', d.sources.map(sourceEntry), SHOW.sources, '个'));
    }
    return sec;
  }

  function monthKey(date) {
    return date.slice(0, 7);
  }
  function monthLabel(key) {
    const [y, m] = key.split('-');
    return `${y} 年 ${Number(m)} 月`;
  }

  // Appends days to `main`, inserting a month heading whenever the month changes.
  let lastMonth = '';
  function appendDays(list) {
    for (const d of list) {
      const mk = monthKey(d.date);
      if (mk !== lastMonth) {
        main.appendChild(el('h3', 'dgMonth', monthLabel(mk)));
        lastMonth = mk;
      }
      main.appendChild(renderDay(d));
    }
  }

  main.innerHTML = '';
  if (!days.length) {
    main.innerHTML = '<p class="dgEmpty">还没有任何练习记录。先去 /learn 一些瑞典语吧 🇸🇪</p>';
    return;
  }

  let cut = days.findIndex((d) => daysAgo(d.date) > RECENT_DAYS);
  if (cut === -1) cut = days.length;
  cut = Math.min(days.length, Math.max(cut, MIN_RECENT));
  const recent = days.slice(0, cut);
  const older = days.slice(cut);

  appendDays(recent);

  let moreBtn = null;
  function showOlder() {
    if (!moreBtn) return;
    moreBtn.remove();
    moreBtn = null;
    appendDays(older);
  }
  if (older.length) {
    moreBtn = el('button', 'dgOlder', `显示更早的 ${older.length} 天 ▾`);
    moreBtn.type = 'button';
    moreBtn.addEventListener('click', showOlder);
    main.appendChild(moreBtn);
  }

  // #day-YYYY-MM-DD (e.g. Läsning's "← 返回 Dagbok") scrolls to that day,
  // rendering the older days first if the target is among them.
  function scrollToHash() {
    let hash = location.hash || '';
    try { hash = decodeURIComponent(hash); } catch (_e) { /* malformed %-escape: use as-is */ }
    const m = /^#day-(\d{4}-\d{2}-\d{2})$/.exec(hash);
    if (!m) return;
    if (!document.getElementById(`day-${m[1]}`) && older.some((d) => d.date === m[1])) showOlder();
    const target = document.getElementById(`day-${m[1]}`);
    if (!target) return;
    target.scrollIntoView({ block: 'start' });
    target.classList.add('dgFlash');
    setTimeout(() => target.classList.remove('dgFlash'), 1600);
  }
  scrollToHash();
  window.addEventListener('hashchange', scrollToHash);
})();

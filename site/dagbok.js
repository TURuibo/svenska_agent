/* Dagbok — recap UI (site home). Reads the shared KB (window.KB from
   kb-index.js + kb-store.js); note bodies load lazily via KB.body(). */

(function () {
  'use strict';

  const KB = window.KB;
  const MD = window.KBMarkdown;
  if (!KB || !MD) {
    document.getElementById('timeline').innerHTML =
      '<p class="timelineEmpty">⚠️ 找不到 kb-index.js / kb-store.js — 请先运行 <code>node tools/build-kb-site.js</code>。</p>';
    return;
  }

  const notes = KB.notes;
  const TYPE_LABELS = { word: '词', phrase: '词组', sentence: '句子', grammar: '语法', topic: '主题', source: '来源' };
  const ITEM_TYPES = ['word', 'phrase', 'sentence', 'grammar'];

  // ---------- source categories (origin of each item) ----------
  // An item's origin is the category of the source note that claims it. Study
  // material (SFI / 课本 / 新闻 / 文章) and individual dictionary lookups (items
  // claimed by no source) share one bucket, 'sfi' — the high-value content.
  const SOURCE_CATS = {
    sfi:      { label: '教材/SFI/查词', icon: '📚' },
    scenario: { label: '情景练习',     icon: '🎭' },
    adjsubst: { label: '词形变化',     icon: '🔤' },
    other:    { label: '其他',         icon: '✏️' },
  };
  // Display order in the filter bar.
  const SOURCE_ORDER = ['sfi', 'scenario', 'adjsubst', 'other'];

  // Per-batch visual flavor (icon + left-rule color), so the timeline isn't a
  // wall of identical 📥/green bars. Keyed by a fine-grained kind that prefers
  // the matched Läsning article's kind (scenario/article/news/adjsubst) — the
  // same colour language as the reading-site cards — and falls back to the
  // coarser source category. `cls` toggles a border-left colour in dagbok.css.
  const BATCH_FLAVORS = {
    scenario: { icon: '🎭', cls: 'flavor-scenario' },
    article:  { icon: '📄', cls: 'flavor-article' },
    news:     { icon: '📰', cls: 'flavor-news' },
    adjsubst: { icon: '🔤', cls: 'flavor-adjsubst' },
    sfi:      { icon: '📚', cls: 'flavor-sfi' },
    other:    { icon: '✏️', cls: 'flavor-other' },
  };
  function batchFlavor(src, article) {
    let kind = article ? String(article.kind || '') : '';
    if (!kind || !BATCH_FLAVORS[kind]) {
      const cat = classifySource(src); // sfi / scenario / adjsubst / other
      kind = BATCH_FLAVORS[cat] ? cat : 'sfi';
    }
    return BATCH_FLAVORS[kind] || BATCH_FLAVORS.other;
  }

  // Classify a source note into a category. Honors an explicit `category:`
  // frontmatter field; otherwise derives it from source_label / title / kind,
  // since the raw `kind` field is inconsistent across the KB.
  function classifySource(src) {
    if (src.category) return String(src.category);
    const kind = String(src.kind || '').toLowerCase();
    const hay = `${src.source_label || ''} ${src.title || ''} ${src.slug || ''}`.toLowerCase();
    if (/adjektiv\+substantiv|adjsubst|böjning|bojning/.test(hay) || kind === 'drill') return 'adjsubst';
    if (/\bsfi\b|språkvägen|sprakvagen|nyhets|biografi|\bkurs\b|kapitel|läsning|lasning|övning|ovning|练习|練習|词汇|vocab|ordlista|artikel|传记文章/.test(hay)
        || kind === 'article' || kind === 'functional') return 'sfi';
    if (/scenario|dialog|berättelse|berattelse|story|samtal/.test(hay) || kind === 'scenario' || kind === 'dialogue') return 'scenario';
    return 'other';
  }

  // ---------- local state (known/star overrides) ----------

  const LS_KNOWN = 'dagbok.known.v1';
  const LS_STAR  = 'dagbok.stars.v1';

  function loadSet(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch (_e) { return new Set(); }
  }
  function saveSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify(Array.from(set))); } catch (_e) {}
  }

  const knownLocal = loadSet(LS_KNOWN);
  const starred = loadSet(LS_STAR);

  function isKnown(n) {
    return n.known === true || knownLocal.has(n.slug);
  }
  function isStarred(slug) {
    return starred.has(slug);
  }
  function toggleKnown(slug) {
    if (knownLocal.has(slug)) knownLocal.delete(slug); else knownLocal.add(slug);
    saveSet(LS_KNOWN, knownLocal);
  }
  function toggleStar(slug) {
    if (starred.has(slug)) starred.delete(slug); else starred.add(slug);
    saveSet(LS_STAR, starred);
  }

  function refreshChip(slug) {
    document.querySelectorAll(`.chip[data-slug="${CSS.escape(slug)}"]`).forEach((el) => {
      const n = bySlug.get(slug);
      el.classList.toggle('known', !!(n && isKnown(n)));
      el.classList.toggle('starred', isStarred(slug));
      const glyph = el.querySelector('.starGlyph');
      if (isStarred(slug) && !glyph) {
        const g = document.createElement('span');
        g.className = 'starGlyph';
        g.textContent = '⭐';
        el.appendChild(g);
      } else if (!isStarred(slug) && glyph) {
        glyph.remove();
      }
    });
  }

  // ---------- date helpers ----------

  function localISODate(d) {
    const o = d.getTimezoneOffset();
    return new Date(d.getTime() - o * 60000).toISOString().slice(0, 10);
  }
  function parseISODate(s) {
    if (!s || typeof s !== 'string') return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  function daysBetween(a, b) {
    return Math.round((b - a) / 86400000);
  }
  function startOfWeek(d) {
    // Monday-based week
    const x = new Date(d);
    const dow = (x.getDay() + 6) % 7; // Mon = 0
    x.setDate(x.getDate() - dow);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function fmtCN(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function weekdayCN(date) {
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()];
  }

  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);
  const TODAY_KEY = localISODate(TODAY);
  const YESTERDAY = new Date(TODAY); YESTERDAY.setDate(YESTERDAY.getDate() - 1);
  const YESTERDAY_KEY = localISODate(YESTERDAY);
  const WEEK_START = startOfWeek(TODAY);
  const LAST_WEEK_START = new Date(WEEK_START); LAST_WEEK_START.setDate(LAST_WEEK_START.getDate() - 7);
  const MONTH_START = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);

  // ---------- index notes by date and slug ----------

  const bySlug = new Map();
  for (const n of notes) bySlug.set(n.slug, n);

  // group items by created date; sources go to a separate map
  const itemsByDate = new Map(); // 'YYYY-MM-DD' -> [note...]
  const sourcesByDate = new Map(); // 'YYYY-MM-DD' -> [sourceNote...]
  let totalItems = 0;

  for (const n of notes) {
    if (!ITEM_TYPES.includes(n.type) && n.type !== 'source') continue;
    const createdRaw = n.created || (n.type === 'source' ? (n.date || n.date_added) : null);
    const created = createdRaw ? String(createdRaw) : null;
    if (!created) continue;
    if (n.type === 'source') {
      if (!sourcesByDate.has(created)) sourcesByDate.set(created, []);
      sourcesByDate.get(created).push(n);
    } else {
      if (!itemsByDate.has(created)) itemsByDate.set(created, []);
      itemsByDate.get(created).push(n);
      totalItems += 1;
    }
  }

  // Build a per-source claim set: for each source, slugs it explicitly lists.
  // Items in that set, on that source's date, get attached to the source group.
  function sourceClaims(src) {
    const claimed = new Set();
    for (const key of ['words', 'phrases', 'sentences', 'grammar']) {
      const list = src[key];
      if (Array.isArray(list)) {
        for (const slug of list) claimed.add(String(slug));
      }
    }
    return claimed;
  }

  // Map each item slug to its origin category + its source note (first claiming
  // source wins). Items in no source default to 'sfi' — individual dictionary
  // lookups share the high-value bucket with study material.
  const catBySlug = new Map();
  const sourceBySlug = new Map(); // item slug -> source note (for peek read-link)
  for (const n of notes) {
    if (n.type !== 'source') continue;
    const cat = classifySource(n);
    for (const slug of sourceClaims(n)) {
      if (!catBySlug.has(slug)) catBySlug.set(slug, cat);
      if (!sourceBySlug.has(slug)) sourceBySlug.set(slug, n);
    }
  }
  function itemCategory(n) {
    return catBySlug.get(n.slug) || 'sfi';
  }

  // ---------- Läsning cross-link: map a 来源 to its readable article ----------
  // The reading site holds the human-readable version of each generated scenario
  // / drill / pasted text. A source note and its reading article share a date and
  // topic but not an exact slug, so match on same date + best topic-token overlap
  // (tokens drawn from slug AND label/title). Sources with no reading article
  // (older sources, news, pure lookups) simply get no link. Mirrors forms.js.
  const READING = (window.READING_DATA && Array.isArray(window.READING_DATA.articles))
    ? window.READING_DATA.articles : [];
  const SLUG_STOP = new Set([
    'pa', 'och', 'en', 'ett', 'i', 'att', 'med', 'av', 'om', 'till', 'eller',
    'bojning', 'scenario', 'adjsubst', 'paste', 'source', 'other', 'text', 'story', 'dialog',
  ]);
  function fold(s) {
    return String(s || '').toLowerCase().replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o');
  }
  function topicTokens(str) {
    return new Set(
      fold(str).split(/[^a-z0-9]+/)
        .filter((t) => t.length > 1 && !/^\d+$/.test(t) && !SLUG_STOP.has(t))
    );
  }
  function dateInSlug(slug) {
    const m = /(\d{4}-\d{2}-\d{2})/.exec(String(slug || ''));
    return m ? m[1] : '';
  }
  function srcDateOf(src) {
    return String(src.date || src.date_added || src.created || '') || dateInSlug(src.slug);
  }
  function srcLabelOf(src) {
    return String(src.source_label || src.title || src.slug || '');
  }
  const readingByDate = new Map();
  for (const a of READING) {
    const d = a.date || dateInSlug(a.slug);
    if (!d) continue;
    if (!readingByDate.has(d)) readingByDate.set(d, []);
    readingByDate.get(d).push(a);
  }
  function readingFor(src) {
    if (!src) return null;
    const cands = readingByDate.get(srcDateOf(src));
    if (!cands || !cands.length) return null;
    const want = topicTokens(`${src.slug} ${srcLabelOf(src)}`);
    let best = null;
    let bestScore = 0;
    for (const a of cands) {
      const have = topicTokens(`${a.slug} ${a.title || ''}`);
      let shared = 0;
      for (const t of want) if (have.has(t)) shared += 1;
      if (shared > bestScore) { bestScore = shared; best = a; }
    }
    return bestScore > 0 ? best : null;
  }
  // Deep link into Läsning carrying a back-anchor to this Dagbok day.
  function readingHref(article, dateKey) {
    const from = dateKey ? `&from=${encodeURIComponent('day-' + dateKey)}&frompage=recap` : '';
    return `reading/#article=${encodeURIComponent(article.slug)}${from}`;
  }

  // Per-category item counts (drives which filter buttons appear + their badges).
  const catCounts = {};
  for (const [, items] of itemsByDate) {
    for (const it of items) {
      const c = itemCategory(it);
      catCounts[c] = (catCounts[c] || 0) + 1;
    }
  }

  // Multi-select: an empty selection means "全部" (show everything); otherwise
  // an item matches if its category is among the selected ones.
  function matchesSource(n) {
    if (activeSources.size === 0) return true;
    return activeSources.has(itemCategory(n));
  }

  // ---------- stats ----------

  function countSince(thresholdDate) {
    let n = 0;
    for (const [key, items] of itemsByDate) {
      const d = parseISODate(key);
      if (d && d >= thresholdDate) n += items.length;
    }
    return n;
  }

  function streakDays() {
    let streak = 0;
    const cur = new Date(TODAY);
    while (true) {
      const key = localISODate(cur);
      if ((itemsByDate.get(key) || []).length === 0) break;
      streak += 1;
      cur.setDate(cur.getDate() - 1);
    }
    return streak;
  }

  document.getElementById('statToday').textContent = (itemsByDate.get(TODAY_KEY) || []).length;
  document.getElementById('statYesterday').textContent = (itemsByDate.get(YESTERDAY_KEY) || []).length;
  document.getElementById('statWeek').textContent = countSince(WEEK_START);
  document.getElementById('statMonth').textContent = countSince(MONTH_START);
  document.getElementById('statTotal').textContent = totalItems;
  document.getElementById('statStreak').textContent = streakDays();
  document.getElementById('recapUpdated').textContent =
    `数据更新于 ${KB.generatedAt} · 今天 ${TODAY_KEY} ${weekdayCN(TODAY)}`;

  // ---------- heatmap (12 weeks, ending this week) ----------

  function buildHeatmap() {
    const root = document.getElementById('heatmap');
    root.innerHTML = '';
    const WEEKS = 12;
    // Start = Monday of (this week - (WEEKS-1) weeks)
    const start = new Date(WEEK_START);
    start.setDate(start.getDate() - (WEEKS - 1) * 7);

    // Determine quantile thresholds based on non-zero days in window
    const counts = [];
    for (let i = 0; i < WEEKS * 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const key = localISODate(d);
      counts.push((itemsByDate.get(key) || []).length);
    }
    const sortedNonZero = counts.filter((x) => x > 0).sort((a, b) => a - b);
    const q = (frac) => {
      if (sortedNonZero.length === 0) return 1;
      return sortedNonZero[Math.min(sortedNonZero.length - 1, Math.floor(sortedNonZero.length * frac))];
    };
    const t1 = q(0.25), t2 = q(0.55), t3 = q(0.85);

    function level(n) {
      if (n === 0) return 'l0';
      if (n <= t1) return 'l1';
      if (n <= t2) return 'l2';
      if (n <= t3) return 'l3';
      return 'l4';
    }

    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setDate(date.getDate() + w * 7 + d);
        const key = localISODate(date);
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'heatCell ' + level(counts[w * 7 + d]);
        if (key === TODAY_KEY) cell.classList.add('today');
        if (date > TODAY) {
          cell.classList.add('empty');
          cell.disabled = true;
          cell.style.gridColumn = (w + 1).toString();
          cell.style.gridRow = (d + 1).toString();
          root.appendChild(cell);
          continue;
        }
        const n = counts[w * 7 + d];
        cell.title = `${key} ${weekdayCN(date)} · ${n} 项`;
        cell.style.gridColumn = (w + 1).toString();
        cell.style.gridRow = (d + 1).toString();
        cell.addEventListener('click', () => {
          const anchor = document.querySelector(`[data-day="${key}"]`);
          if (anchor) {
            anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
            anchor.classList.add('flash');
            setTimeout(() => anchor.classList.remove('flash'), 1200);
          } else {
            // no entries that day — flash a small tooltip
            cell.classList.add('today');
            setTimeout(() => { if (key !== TODAY_KEY) cell.classList.remove('today'); }, 600);
          }
        });
        root.appendChild(cell);
      }
    }
  }

  // ---------- rendering ----------

  const TIMELINE = document.getElementById('timeline');

  function chipForNote(n) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.slug = n.slug;
    btn.dataset.type = n.type;
    if (isKnown(n)) btn.classList.add('known');
    if (isStarred(n.slug)) btn.classList.add('starred');

    const title = document.createElement('span');
    title.className = 'chipTitle';
    title.textContent = frontText(n);
    btn.appendChild(title);

    if (n.type === 'word' && n.ordklass) {
      const pos = document.createElement('span');
      pos.className = 'pos';
      pos.textContent = abbrevPos(String(n.ordklass));
      btn.appendChild(pos);
    }

    if (n.zh) {
      const zh = document.createElement('span');
      zh.className = 'zh';
      zh.textContent = String(n.zh);
      btn.appendChild(zh);
    }

    if (isStarred(n.slug)) {
      const g = document.createElement('span');
      g.className = 'starGlyph';
      g.textContent = '⭐';
      btn.appendChild(g);
    }

    btn.addEventListener('click', () => openPeek(n));
    return btn;
  }

  function frontText(n) {
    // Clean Swedish-side text for chip title and flashcard front
    if (n.type === 'word') return String(n.lemma || n.title || n.slug);
    if (n.type === 'phrase') return String(n.phrase || n.title || n.slug);
    if (n.type === 'sentence') {
      const s = String(n.sentence || n.title || n.slug);
      return s.replace(/^🇸🇪\s*/, '');
    }
    if (n.type === 'grammar') return String(n.name || n.title || n.slug);
    return n.title || n.slug;
  }

  function abbrevPos(p) {
    const map = {
      verb: 'v.', substantiv: 'n.', adjektiv: 'adj.', adverb: 'adv.',
      pronomen: 'pron.', preposition: 'prep.', konjunktion: 'konj.',
      interjektion: 'interj.', räkneord: 'num.',
    };
    return map[p.toLowerCase()] || p;
  }

  function typeRow(label, items, type) {
    if (!items || items.length === 0) return null;
    const row = document.createElement('div');
    row.className = 'typeRow';
    if (type) row.dataset.type = type;
    const lab = document.createElement('div');
    lab.className = 'typeLabel';
    lab.textContent = `${label} · ${items.length}`;
    const chips = document.createElement('div');
    chips.className = 'chips';
    const chipEls = items.map((it) => {
      const c = chipForNote(it);
      chips.appendChild(c);
      return c;
    });
    row.appendChild(lab);
    row.appendChild(chips);

    // Long sentence lists are collapsed by default so the diary stays scannable.
    const COLLAPSE_AFTER = 3;
    if (type === 'sentence' && chipEls.length > COLLAPSE_AFTER) {
      const hidden = chipEls.slice(COLLAPSE_AFTER);
      hidden.forEach((c) => c.classList.add('chipHidden'));
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'rowToggle';
      let expanded = false;
      const sync = () => {
        hidden.forEach((c) => c.classList.toggle('chipHidden', !expanded));
        toggle.textContent = expanded ? '收起 ▴' : `展开剩余 ${hidden.length} 句 ▾`;
      };
      toggle.addEventListener('click', () => { expanded = !expanded; sync(); });
      sync();
      chips.appendChild(toggle);
    }
    return row;
  }

  function renderItemsBlock(items, container) {
    const buckets = { word: [], phrase: [], sentence: [], grammar: [] };
    for (const it of items) {
      if (buckets[it.type]) buckets[it.type].push(it);
    }
    // sort each bucket
    for (const key of Object.keys(buckets)) {
      buckets[key].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }
    let added = 0;
    for (const t of ITEM_TYPES) {
      const row = typeRow(TYPE_LABELS[t], buckets[t], t);
      if (row) { container.appendChild(row); added += 1; }
    }
    return added;
  }

  function relativeDayLabel(date) {
    const diff = daysBetween(date, TODAY);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff === 2) return '前天';
    if (date >= WEEK_START) return `本${weekdayCN(date)}`;
    if (date >= LAST_WEEK_START) return `上${weekdayCN(date)}`;
    if (date >= MONTH_START) return `本月 ${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')}`;
    return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function passesType(n) {
    if (activeType === 'starred') return isStarred(n.slug);
    if (activeType && activeType !== 'all') return n.type === activeType;
    return true;
  }

  function updateFilterCount(shown) {
    const el = document.getElementById('filterCount');
    if (!el) return;
    const filtered = activeType !== 'all' || activeSources.size > 0;
    el.textContent = filtered ? `显示 ${shown} 项` : '';
  }

  function renderTimeline() {
    TIMELINE.innerHTML = '';
    const dates = Array.from(itemsByDate.keys()).sort((a, b) => b.localeCompare(a));
    if (dates.length === 0) {
      TIMELINE.innerHTML = '<p class="timelineEmpty">还没有任何录入条目。先去 /learn 一些瑞典语吧 🇸🇪</p>';
      updateFilterCount(0);
      return;
    }

    let renderedDays = 0;
    let shownCount = 0;
    for (const dateKey of dates) {
      const date = parseISODate(dateKey);
      let items = itemsByDate.get(dateKey) || [];
      items = items.filter((n) => matchesSource(n) && passesType(n));
      if (items.length === 0) continue;
      shownCount += items.length;

      const section = document.createElement('section');
      section.className = 'daySection';
      section.dataset.day = dateKey;

      // day header
      const header = document.createElement('div');
      header.className = 'dayHeader';
      const h2 = document.createElement('h2');
      h2.className = 'dayDate';
      h2.textContent = relativeDayLabel(date);
      const abs = document.createElement('span');
      abs.className = 'dayDateAbs';
      abs.textContent = `${fmtCN(date)} ${weekdayCN(date)}`;
      h2.appendChild(abs);
      const cntWrap = document.createElement('div');
      cntWrap.style.display = 'flex';
      cntWrap.style.alignItems = 'center';
      const cnt = document.createElement('span');
      cnt.className = 'dayCount';
      cnt.textContent = `${items.length} 项`;
      const dayFlash = document.createElement('button');
      dayFlash.type = 'button';
      dayFlash.className = 'dayFlashBtn';
      dayFlash.textContent = '🎴 闪卡';
      dayFlash.title = `逐张闪卡复习这天的 ${items.length} 项`;
      dayFlash.addEventListener('click', () => openFlash(items, `${dateKey} · ${items.length} 项`));
      cntWrap.appendChild(cnt);
      cntWrap.appendChild(dayFlash);
      header.appendChild(h2);
      header.appendChild(cntWrap);
      section.appendChild(header);

      // partition into batches by source
      const sources = sourcesByDate.get(dateKey) || [];
      const claimedToSource = new Map(); // slug -> source
      for (const src of sources) {
        const claims = sourceClaims(src);
        for (const slug of claims) {
          // first source wins
          if (!claimedToSource.has(slug)) claimedToSource.set(slug, src);
        }
      }

      const batchItems = new Map(); // sourceSlug -> { src, items[] }
      const looseItems = [];
      for (const it of items) {
        const src = claimedToSource.get(it.slug);
        if (src) {
          if (!batchItems.has(src.slug)) batchItems.set(src.slug, { src, items: [] });
          batchItems.get(src.slug).items.push(it);
        } else {
          looseItems.push(it);
        }
      }

      // render each batch
      for (const { src, items: bItems } of batchItems.values()) {
        // 📖 jump to the readable Läsning article for this source (if any) — also
        // drives the batch's visual flavor (icon + left-rule colour).
        const article = readingFor(src);
        const flavor = batchFlavor(src, article);

        const batch = document.createElement('div');
        batch.className = 'batch ' + flavor.cls;

        const bHead = document.createElement('div');
        bHead.className = 'batchHeader';
        const icon = document.createElement('span'); icon.className = 'batchIcon'; icon.textContent = flavor.icon;
        const title = document.createElement('h3');
        title.className = 'batchTitle';
        title.textContent = src.source_label || src.title || src.slug;
        const counts = document.createElement('span');
        counts.className = 'batchCounts';
        const grouped = bItems.reduce((acc, it) => { acc[it.type] = (acc[it.type] || 0) + 1; return acc; }, {});
        counts.textContent = ITEM_TYPES
          .filter((t) => grouped[t])
          .map((t) => `${grouped[t]} ${TYPE_LABELS[t]}`)
          .join(' · ');
        const batchFlash = document.createElement('button');
        batchFlash.type = 'button';
        batchFlash.className = 'batchFlashBtn';
        batchFlash.textContent = '🎴';
        batchFlash.title = `闪卡复习此批次 (${bItems.length} 项)`;
        batchFlash.addEventListener('click', () => openFlash(bItems, src.source_label || src.title || src.slug));
        bHead.appendChild(icon);
        bHead.appendChild(title);
        bHead.appendChild(counts);
        if (article) {
          const read = document.createElement('a');
          read.className = 'batchReadLink';
          read.href = readingHref(article, dateKey);
          read.textContent = '📖 阅读原文';
          read.title = '在 Läsning 阅读站看原文（可切中文翻译）+ 词/词组/句子/语法学习项，可一键跳回';
          bHead.appendChild(read);
        }

        // The chips + source-note footer live in a body wrapper. When this source
        // has a readable Läsning article, the same 词/词组/句子/语法 are shown there
        // (clickable), so Dagbok defaults to a clean title + 📖 阅读原文 entry and
        // tucks the chips behind an 展开 toggle. Sources with no reading article
        // (e.g. older sources, news without an article) stay expanded.
        const body = document.createElement('div');
        body.className = 'batchBody';
        renderItemsBlock(bItems, body);

        // small footer link to open the source note
        const footer = document.createElement('div');
        footer.style.marginTop = '6px';
        const a = document.createElement('a');
        a.href = `sok/#note=${encodeURIComponent(src.slug)}`;
        a.target = '_blank';
        a.rel = 'noopener';
        a.style.fontFamily = 'var(--cjk)';
        a.style.fontSize = '12px';
        a.style.color = 'var(--muted)';
        a.style.textDecoration = 'none';
        a.textContent = '→ 查看完整 source 笔记';
        footer.appendChild(a);
        body.appendChild(footer);

        if (article) {
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'batchToggle';
          let expanded = false;
          const sync = () => {
            body.classList.toggle('collapsed', !expanded);
            toggle.textContent = expanded ? '收起 ▴' : `展开学习项 ▾`;
            toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
          };
          toggle.addEventListener('click', () => { expanded = !expanded; sync(); });
          sync();   // start collapsed — clean title + 阅读原文 by default
          bHead.appendChild(toggle);
        }

        bHead.appendChild(batchFlash);
        batch.appendChild(bHead);
        batch.appendChild(body);

        section.appendChild(batch);
      }

      if (looseItems.length > 0) {
        const loose = document.createElement('div');
        loose.className = 'looseGroup';
        if (batchItems.size > 0) {
          const hdr = document.createElement('div');
          hdr.style.fontFamily = 'var(--cjk)';
          hdr.style.fontSize = '13px';
          hdr.style.color = 'var(--muted)';
          hdr.style.margin = '10px 0 4px';
          hdr.textContent = '其他 (单独录入)';
          loose.appendChild(hdr);
        }
        renderItemsBlock(looseItems, loose);
        section.appendChild(loose);
      }

      TIMELINE.appendChild(section);
      renderedDays += 1;
    }

    if (renderedDays === 0) {
      TIMELINE.innerHTML = '<p class="timelineEmpty">当前筛选下没有条目。试试别的类型或来源？</p>';
    }
    updateFilterCount(shownCount);
  }

  // ---------- peek panel ----------

  const peek = document.getElementById('peekPanel');
  const peekTitle = document.getElementById('peekTitle');
  const peekBody = document.getElementById('peekBody');
  const peekOpen = document.getElementById('peekOpen');

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Markdown → HTML for the peek panel uses the shared renderer (kb-markdown.js).
  // Wikilinks render as data-wikilink buttons; the peek panel delegates clicks to
  // open the linked note in place (see peekBody handler below).
  const mdToHtml = (md) => MD.mdToHtml(md, { hasSlug: (t) => KB.bySlug.has(t) });

  let peekCurrent = null;

  function openPeek(n) {
    peekCurrent = n;
    peekTitle.textContent = `${frontText(n)} · ${TYPE_LABELS[n.type] || n.type}`;
    const meta = [];
    if (n.ordklass) meta.push(escapeHtml(String(n.ordklass)));
    if (n.cefr) meta.push(`CEFR ${escapeHtml(String(n.cefr))}`);
    if (n.zh) meta.push(`🇨🇳 ${escapeHtml(String(n.zh))}`);
    if (n.en) meta.push(`🇬🇧 ${escapeHtml(String(n.en))}`);
    const speak = (window.SvSpeak && window.SvSpeak.supported && ['word', 'phrase', 'sentence'].includes(n.type))
      ? window.SvSpeak.buttonHtml(frontText(n)) + ' ' : '';
    const metaHtml = (speak || meta.length) ? `<div class="peekMeta">${speak}${meta.join(' · ')}</div>` : '';
    // If this item came from a source with a readable Läsning article, offer a
    // jump to read the original (with 中文), carrying a back-anchor to its day.
    let readHtml = '';
    const src = sourceBySlug.get(n.slug);
    const article = src && readingFor(src);
    if (article) {
      const dateKey = String(n.created || srcDateOf(src) || '');
      readHtml = `<div class="peekRead"><a class="batchReadLink" href="${readingHref(article, dateKey)}">📖 阅读原文（Läsning，可看中文翻译）→</a></div>`;
    }
    // Body is not in the eager index — show header immediately, fetch body lazily.
    peekBody.innerHTML = metaHtml + readHtml + '<p class="peekLoading">läser…</p>';
    peekOpen.href = `sok/#note=${encodeURIComponent(n.slug)}`;
    peek.hidden = false;
    syncPeekActions();
    KB.body(n.slug).then((d) => {
      if (!peekCurrent || peekCurrent.slug !== n.slug) return; // user opened another
      peekBody.innerHTML = metaHtml + readHtml + (d ? mdToHtml(d.body || '') : '');
    });
  }

  function syncPeekActions() {
    if (!peekCurrent) return;
    document.getElementById('peekKnown').classList.toggle('active', isKnown(peekCurrent));
    document.getElementById('peekStar').classList.toggle('active', isStarred(peekCurrent.slug));
  }

  document.getElementById('peekClose').addEventListener('click', () => { peek.hidden = true; peekCurrent = null; });
  // In-peek [[wikilink]] navigation: open the linked note in the same panel.
  peekBody.addEventListener('click', (e) => {
    const link = e.target.closest('[data-wikilink]');
    if (!link) return;
    const target = bySlug.get(link.dataset.wikilink);
    if (target) { e.preventDefault(); openPeek(target); }
  });
  document.getElementById('peekKnown').addEventListener('click', () => {
    if (!peekCurrent) return;
    toggleKnown(peekCurrent.slug);
    syncPeekActions();
    refreshChip(peekCurrent.slug);
  });
  document.getElementById('peekStar').addEventListener('click', () => {
    if (!peekCurrent) return;
    toggleStar(peekCurrent.slug);
    syncPeekActions();
    refreshChip(peekCurrent.slug);
  });
  document.getElementById('peekFlashOne').addEventListener('click', () => {
    if (!peekCurrent) return;
    openFlash([peekCurrent], `${frontText(peekCurrent)} (单条)`);
  });

  // ---------- flashcard modal ----------

  const flashOverlay = document.getElementById('flashOverlay');
  const flashCardEl = document.getElementById('flashCard');
  const flashFront = document.getElementById('flashFront');
  const flashBack = document.getElementById('flashBack');
  const flashIndexEl = document.getElementById('flashIndex');
  const flashScopeEl = document.getElementById('flashScope');
  const flashPrevBtn = document.getElementById('flashPrev');
  const flashNextBtn = document.getElementById('flashNext');

  let flashDeck = [];
  let flashPos = 0;
  let flashFlipped = false;

  function backHtml(n) {
    const lines = [];
    if (n.zh) lines.push(`<div class="flashAnswer">${escapeHtml(String(n.zh))}</div>`);
    const subs = [];
    if (n.en) subs.push(`🇬🇧 ${escapeHtml(String(n.en))}`);
    if (n.ordklass) subs.push(`<em>${escapeHtml(String(n.ordklass))}</em>`);
    if (n.cefr) subs.push(`CEFR ${escapeHtml(String(n.cefr))}`);
    if (subs.length) lines.push(`<div class="flashSub">${subs.join(' · ')}</div>`);
    // For grammar without zh, fall back to the short excerpt carried in the index.
    if (!n.zh && n.excerpt) {
      lines.push(`<div class="flashSub">${escapeHtml(String(n.excerpt).trim())}</div>`);
    }
    if (lines.length === 0) lines.push(`<div class="flashSub">(无翻译)</div>`);
    return lines.join('');
  }

  function renderFlash() {
    if (flashDeck.length === 0) {
      flashFront.innerHTML = '<div class="flashEmpty">没有可复习的条目</div>';
      flashBack.hidden = true;
      flashIndexEl.textContent = '0 / 0';
      flashPrevBtn.disabled = true;
      flashNextBtn.disabled = true;
      return;
    }
    const n = flashDeck[flashPos];
    const long = String(frontText(n)).length > 20;
    const speak = (window.SvSpeak && window.SvSpeak.supported && ['word', 'phrase', 'sentence'].includes(n.type))
      ? window.SvSpeak.buttonHtml(frontText(n)) : '';
    flashFront.innerHTML =
      `<div class="flashTypeChip">${TYPE_LABELS[n.type] || n.type}</div>` +
      `<div class="flashTerm ${long ? 'flashTermSmall' : ''}">${escapeHtml(frontText(n))}${speak}</div>` +
      `<div class="flashHintBack">点击或按空格看翻译</div>`;
    flashBack.innerHTML =
      `<div class="flashTerm">${escapeHtml(frontText(n))}${speak}</div>` + backHtml(n);
    flashFlipped = false;
    flashFront.hidden = false;
    flashBack.hidden = true;
    flashIndexEl.textContent = `${flashPos + 1} / ${flashDeck.length}`;
    flashPrevBtn.disabled = flashPos === 0;
    flashNextBtn.disabled = flashPos === flashDeck.length - 1;
  }

  function flipFlash() {
    if (flashDeck.length === 0) return;
    flashFlipped = !flashFlipped;
    flashFront.hidden = flashFlipped;
    flashBack.hidden = !flashFlipped;
  }

  function nextFlash() {
    if (flashPos < flashDeck.length - 1) { flashPos += 1; renderFlash(); }
  }
  function prevFlash() {
    if (flashPos > 0) { flashPos -= 1; renderFlash(); }
  }

  function shuffleDeck() {
    for (let i = flashDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [flashDeck[i], flashDeck[j]] = [flashDeck[j], flashDeck[i]];
    }
    flashPos = 0;
    renderFlash();
  }

  function openFlash(items, scopeLabel) {
    flashDeck = items.slice();
    flashPos = 0;
    flashScopeEl.textContent = scopeLabel || '';
    flashOverlay.hidden = false;
    renderFlash();
    flashCardEl.focus();
  }

  function closeFlash() {
    flashOverlay.hidden = true;
    flashDeck = [];
  }

  flashCardEl.addEventListener('click', flipFlash);
  flashNextBtn.addEventListener('click', nextFlash);
  flashPrevBtn.addEventListener('click', prevFlash);
  document.getElementById('flashClose').addEventListener('click', closeFlash);
  document.getElementById('flashShuffle').addEventListener('click', shuffleDeck);
  document.getElementById('flashRestart').addEventListener('click', () => { flashPos = 0; renderFlash(); });

  document.addEventListener('keydown', (e) => {
    if (!flashOverlay.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeFlash(); return; }
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipFlash(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); nextFlash(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prevFlash(); return; }
      return;
    }
    if (e.key === 'Escape' && !peek.hidden) { peek.hidden = true; peekCurrent = null; }
  });

  // Today flashcard from header
  document.getElementById('todayFlashBtn').addEventListener('click', () => {
    const items = itemsByDate.get(TODAY_KEY) || [];
    if (items.length === 0) {
      // fall back to yesterday if today is empty
      const yItems = itemsByDate.get(YESTERDAY_KEY) || [];
      if (yItems.length > 0) {
        openFlash(yItems, `昨天 ${YESTERDAY_KEY} · ${yItems.length} 项`);
        return;
      }
      openFlash([], '今天没有新条目');
      return;
    }
    openFlash(items, `今天 ${TODAY_KEY} · ${items.length} 项`);
  });

  // ---------- jump bar & filter ----------

  let activeType = 'all';

  function jumpTo(target) {
    let date = null;
    if (target === 'today') date = TODAY;
    else if (target === 'yesterday') date = YESTERDAY;
    else if (target === 'this-week') date = WEEK_START;
    else if (target === 'last-week') date = LAST_WEEK_START;
    else if (target === 'this-month') date = MONTH_START;
    else if (target === 'all') {
      TIMELINE.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!date) return;
    // find the first day-section with date <= target date
    const sections = Array.from(document.querySelectorAll('.daySection'));
    for (const s of sections) {
      const d = parseISODate(s.dataset.day);
      if (d && d <= date) {
        s.scrollIntoView({ behavior: 'smooth', block: 'start' });
        s.classList.add('flash');
        setTimeout(() => s.classList.remove('flash'), 1200);
        return;
      }
    }
    // none — scroll to the closest later one
    if (sections.length > 0) sections[sections.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.querySelectorAll('.jumpBar [data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => jumpTo(btn.dataset.jump));
  });

  document.querySelectorAll('.typeFilter').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.typeFilter').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeType = btn.dataset.type;
      renderTimeline();
    });
  });

  // ---------- source (origin) filter ----------

  const LS_SRC = 'dagbok.sourceFilter.v1';
  // Multi-select set of category keys. Empty = 全部 (everything).
  const activeSources = new Set();
  try {
    const raw = JSON.parse(localStorage.getItem(LS_SRC) || '[]');
    if (Array.isArray(raw)) for (const k of raw) if (catCounts[k] > 0) activeSources.add(k);
  } catch (_e) {}

  function saveSources() {
    try { localStorage.setItem(LS_SRC, JSON.stringify(Array.from(activeSources))); } catch (_e) {}
  }

  function buildSourceBar() {
    const bar = document.getElementById('sourceFilters');
    if (!bar) return;

    // 全部 + each non-empty category (multi-select toggles).
    const defs = [{ key: 'all', label: '全部' }];
    for (const key of SOURCE_ORDER) {
      if ((catCounts[key] || 0) > 0) {
        defs.push({ key, label: SOURCE_CATS[key].label, icon: SOURCE_CATS[key].icon, count: catCounts[key] });
      }
    }

    function syncActive() {
      bar.querySelectorAll('.sourceFilter').forEach((b) => {
        const k = b.dataset.source;
        b.classList.toggle('active', k === 'all' ? activeSources.size === 0 : activeSources.has(k));
      });
    }

    bar.innerHTML = '';
    for (const d of defs) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sourceFilter';
      btn.dataset.source = d.key;
      btn.textContent = (d.icon ? d.icon + ' ' : '') + d.label + (d.count ? ` ${d.count}` : '');
      if (d.key !== 'all') btn.title = '可多选：点击叠加/取消此来源';
      btn.addEventListener('click', () => {
        if (d.key === 'all') {
          activeSources.clear();
        } else if (activeSources.has(d.key)) {
          activeSources.delete(d.key);
        } else {
          activeSources.add(d.key);
        }
        saveSources();
        syncActive();
        renderTimeline();
      });
      bar.appendChild(btn);
    }
    syncActive();
  }

  // Arriving back from Läsning with #day-YYYY-MM-DD → scroll to that day and
  // flash it. If a source filter hides the day, clear the filter first so the
  // target is actually rendered.
  function scrollToDayHash() {
    const m = /^#day-(\d{4}-\d{2}-\d{2})$/.exec(location.hash || '');
    if (!m) return;
    // Stop the browser from restoring the previous scroll position on top of ours.
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (_e) {}
    const key = m[1];
    let anchor = document.querySelector(`[data-day="${key}"]`);
    if (!anchor && activeSources.size > 0) {
      activeSources.clear();
      saveSources();
      buildSourceBar();
      renderTimeline();
      anchor = document.querySelector(`[data-day="${key}"]`);
    }
    if (!anchor) return;
    // Defer past initial layout + the browser's own scroll restoration — a
    // synchronous scrollIntoView during load gets ignored or overridden. Use an
    // instant jump (smooth is unreliable right after load) to land on the day.
    setTimeout(() => {
      anchor.scrollIntoView({ block: 'start' });
      anchor.classList.add('flash');
      setTimeout(() => anchor.classList.remove('flash'), 1400);
    }, 60);
  }

  // ---------- init ----------

  buildHeatmap();
  buildSourceBar();
  renderTimeline();

  // brief flash style for jumped sections
  const style = document.createElement('style');
  style.textContent =
    '.daySection.flash { box-shadow: 0 0 0 3px var(--gold), 0 24px 60px rgba(32,47,38,0.18); transition: box-shadow 0.4s; }';
  document.head.appendChild(style);

  scrollToDayHash();
})();

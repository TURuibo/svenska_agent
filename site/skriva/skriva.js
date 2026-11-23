/* ✍️ Skriva — 写作专栏 (see SPEC.md, the design authority).
 *   #                               home: genre cards, 📂 我的作文, 常错类型
 *   #g=<key>&tab=mall|texter|ova|skriv   one genre: 🧱 骨架 · 📄 范文 · 🧩 练习 · ✍️ 写
 *   #g=<key>&t=<slug>               a model text taken apart (structure labels, phrase highlights, 中文)
 *   #g=<key>&d=ordna|fraser&t=<slug>     drills generated from the model text
 *   #g=<key>&u=<U1>                 a writing task: requirements, skeleton hints, editor, checklist, 📋 复制给 CC
 *   #mina / #mina=<id>              corrected texts (written by /skriva into skriva/texter/)
 * Data: skriva-data.js (window.SKRIVA_DATA) — SPEC §6. State: skriva.state.v1 (SPEC §7); model texts'
 * read marks go through ReadSync (the same mark as Läsning). */
(function () {
  'use strict';

  const D = window.SKRIVA_DATA;
  const main = document.getElementById('skMain');
  const pop = document.getElementById('skPop');
  const MD = window.KBMarkdown || null;
  const SP = window.SvSpeak || null;

  // ---------- helpers ----------
  const str = (x) => (x == null ? '' : String(x));
  const esc = (s) => str(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const enc = encodeURIComponent;
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const arr = (x) => (Array.isArray(x) ? x : []);
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (_e) { return false; } };
  const parse = (raw) => { try { return JSON.parse(raw || 'null'); } catch (_e) { return null; } };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i -= 1) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const words = (t) => (str(t).match(/\S+/g) || []).length;
  // **bold** and [[wikilinks]] in notes; plain escape when the shared renderer is missing.
  // Grammar links read better as a name than as a slug: [[grammar-v2-ordfoljd]] → 📗 v2-ordfoljd.
  const inline = (s) => (MD
    ? MD.inlineMarkdown(str(s)).replace(/(<button[^>]*data-wikilink="[^"]*"[^>]*>)grammar-([^<]+)(<\/button>)/g, '$1📗 $2$3')
    : esc(s));
  const sayable = (t) => str(t).replace(/…|\.\.\./g, ', ').replace(/\s+/g, ' ').trim();
  const say = (t) => { if (SP && SP.supported) SP.speak(sayable(t)); else toast('这个浏览器不支持朗读'); };
  const sayBtn = (t) => (SP && SP.supported
    ? `<button type="button" class="skSay" data-act="say" data-say="${esc(t)}" aria-label="朗读" title="朗读">🔊</button>` : '');

  let toastT = 0;
  function toast(msg) {
    const t = document.getElementById('skToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2400);
  }

  if (!D || !Array.isArray(D.genres)) {
    main.innerHTML = '<header class="skHead"><h1>✍️ Skriva <small>写作专栏</small></h1></header>' +
      '<p class="skEmpty">⚠️ 找不到 <code>skriva-data.js</code>。请先运行 <code>node tools/build-skriva-data.js</code>' +
      '（GitHub Action 发布网站时会自动生成）。</p>';
    return;
  }

  const GENRES = D.genres.filter((g) => isObj(g) && g.key);
  const gBy = new Map(GENRES.map((g) => [g.key, g]));
  const MINA = arr(D.mina).filter(isObj);
  const TABS = [['mall', '🧱', '骨架'], ['texter', '📄', '范文'], ['ova', '🧩', '练习'], ['skriv', '✍️', '写']];
  const TAB_IDS = TABS.map((t) => t[0]);
  const slotOf = (g, n) => arr(g.slots).find((s) => s.n === n) || null;
  const textOf = (g, slug) => arr(g.texts).find((t) => t.slug === slug) || null;
  const taskOf = (g, id) => arr(g.tasks).find((t) => t.id === id) || null;
  // Parts that frame a text (date, greeting, sign-off, name, title): shown and labelled, but not drilled.
  const isFrame = (slot) => !!slot && /datum|hälsning|namn|rubrik/i.test(str(slot.sv));
  const cClass = (n) => `c${((Number(n) || 1) - 1) % 7 + 1}`;

  // ---------- state ----------
  const LS = 'skriva.state.v1';
  function loadState() {
    const o = parse(lsGet(LS));
    const s = isObj(o) ? o : {};
    s.v = 1;
    for (const k of ['drafts', 'req', 'checks', 'sent', 'ordna', 'fraser', 'tab']) if (!isObj(s[k])) s[k] = {};
    const v = isObj(s.view) ? s.view : {};
    s.view = { struct: v.struct !== false, phr: v.phr !== false, zh: !!v.zh };
    return s;
  }
  let st = loadState();
  // Re-read before every write so another tab's changes survive.
  function mutate(fn) {
    st = loadState();
    fn(st);
    lsSet(LS, JSON.stringify(st));
  }
  const isRead = (slug) => { try { return !!(window.ReadSync && window.ReadSync.isRead(slug)); } catch (_e) { return false; } };
  const tk = (g, u) => `${g.key}/${u.id}`;
  const draftOf = (g, u) => { const d = st.drafts[tk(g, u)]; return isObj(d) ? str(d.text) : ''; };
  const minaOf = (g, u) => MINA.filter((m) => m.genre === g.key && m.uppgift === u.id);

  function progress(g) {
    const texts = arr(g.texts);
    const tasks = arr(g.tasks);
    return {
      read: texts.filter((t) => isRead(t.slug)).length,
      texts: texts.length,
      drills: texts.reduce((n, t) => n + (st.ordna[t.slug] ? 1 : 0) + (st.fraser[t.slug] ? 1 : 0), 0),
      drillsAll: texts.length * 2,
      written: tasks.filter((u) => st.sent[tk(g, u)] || minaOf(g, u).length).length,
      tasks: tasks.length,
    };
  }

  // ---------- routing ----------
  function readHash() {
    const h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    if (h.has('mina')) return { view: 'mina', id: h.get('mina') || '' };
    const g = gBy.get(h.get('g'));
    if (!g) return { view: 'home' };
    const t = h.get('t') ? textOf(g, h.get('t')) : null;
    if (t && ['ordna', 'fraser'].includes(h.get('d'))) return { view: 'drill', g, t, d: h.get('d') };
    if (t) return { view: 'text', g, t };
    const u = h.get('u') ? taskOf(g, h.get('u')) : null;
    if (u) return { view: 'task', g, u };
    return { view: 'genre', g, tab: TAB_IDS.includes(h.get('tab')) ? h.get('tab') : '' };
  }
  const gHash = (g, tab) => `#g=${enc(g.key)}${tab ? `&tab=${tab}` : ''}`;
  const tHash = (g, t) => `#g=${enc(g.key)}&t=${enc(t.slug)}`;
  const dHash = (g, t, d) => `#g=${enc(g.key)}&d=${d}&t=${enc(t.slug)}`;
  const uHash = (g, u) => `#g=${enc(g.key)}&u=${enc(u.id)}`;
  const HOME = () => location.pathname + location.search;

  let cur = { view: '' };
  let routed = null;
  function route(opts) {
    opts = opts || {};
    const h = readHash();
    // The editor and a running drill keep their state in the DOM / memory: a passive repaint would wipe it.
    if (opts.passive && (cur.view === 'task' || cur.view === 'drill') && h.view === cur.view) return;
    flushDraft();
    hidePop();
    cur = h;
    if (h.view === 'home') renderHome();
    else if (h.view === 'genre') renderGenre(h.g, h.tab);
    else if (h.view === 'text') renderText(h.g, h.t);
    else if (h.view === 'drill') (h.d === 'ordna' ? startOrdna : startFraser)(h.g, h.t);
    else if (h.view === 'task') renderTask(h.g, h.u);
    else if (h.view === 'mina') (h.id ? renderMine : renderMineList)(h.id);
    if (opts.top) window.scrollTo(0, 0);
    routed = location.hash;
  }
  function go(hash) {
    try { history.pushState({ sk: 1, from: location.hash || '' }, '', hash || HOME()); } catch (_e) { location.hash = hash; return; }
    route({ top: true });
  }
  // ← always goes UP to the view's parent. When the parent is also the page he came from, that is a plain
  // history.back() (so Back / Forward stay tidy); otherwise the current entry is replaced by the parent.
  const sameHash = (a, b) => str(a).replace(/^#/, '') === str(b).replace(/^#/, '');
  function up(parent) {
    const hs = history.state;
    if (hs && hs.sk && sameHash(hs.from, parent)) { history.back(); return; }
    try { history.replaceState(null, '', parent || HOME()); } catch (_e) { /* ignore */ }
    route({ top: true });
  }
  window.addEventListener('popstate', () => route({ top: true }));
  window.addEventListener('hashchange', () => { if (location.hash !== routed) route({ top: true }); });

  const topBar = (parent, title, sub) => '<header class="skTop">' +
    `<button type="button" class="skIcon" data-act="up" data-parent="${esc(parent)}" aria-label="返回" title="返回">←</button>` +
    `<div class="skTopMid"><h1>${title}</h1>${sub ? `<span class="skTopSub">${sub}</span>` : ''}</div></header>`;

  // ---------- home ----------
  const OMDOME = { klar: ['✅', '达到要求'], 'nästan': ['🟡', '差一点'], 'inte-än': ['🔴', '还不够'] };
  function mineRow(m) {
    const g = gBy.get(m.genre);
    const o = OMDOME[m.omdome];
    return `<li><a class="skMineRow" href="#mina=${enc(m.id)}" data-nav>` +
      `<span class="skMineT" lang="sv">${esc(m.titel || m.id)}</span>` +
      `<span class="skMeta"><span>${esc(m.date)}</span>${g ? `<span>${g.icon} ${esc(g.zh)}</span>` : ''}<span>${m.ord} ord</span>` +
      `<span>${arr(m.rows).length} 处修改</span>${o ? `<span class="skOm ${esc(m.omdome)}">${o[0]} ${o[1]}</span>` : ''}</span></a></li>`;
  }
  function typerHtml() {
    const e = Object.entries(isObj(D.typer) ? D.typer : {}).sort((a, b) => b[1] - a[1]);
    if (!e.length) return '';
    return '<p class="skTyper"><b>常错类型</b>' + e.map(([k, n]) => `<span class="skTyp">${esc(k)} ${n}</span>`).join('') + '</p>';
  }
  function renderHome() {
    document.title = 'Skriva — 写作专栏 · svensk_agent';
    let h = '<header class="skHead"><h1>✍️ Skriva <small>写作专栏</small></h1>' +
      '<p>把范文当写作课来学：这一段在干什么、哪句话可以照搬、换一个题目我怎么写。</p></header>' +
      '<ol class="skSteps"><li><b>📄 看范文</b>每一块在做什么</li><li><b>🧱 记骨架</b>每一格的句型</li>' +
      '<li><b>🧩 做练习</b>排结构 · 填句型</li><li><b>✍️ 自己写</b>复制给 CC 批改</li></ol>';
    if (!GENRES.length) h += '<p class="skEmpty">还没有体裁（<code>skriva/&lt;key&gt;.md</code>）。</p>';
    h += '<ul class="skGenres">';
    for (const g of GENRES) {
      const p = progress(g);
      h += `<li><a class="skGenre" href="${gHash(g)}" data-nav>` +
        `<span class="skGIcon" aria-hidden="true">${esc(g.icon)}</span>` +
        `<span class="skGTxt"><span class="skGName"><span lang="sv">${esc(g.sv)}</span>${g.cefr ? `<span class="skChip">${esc(g.cefr)}</span>` : ''}</span>` +
        `<span class="skGZh">${esc(g.zh)}</span>${g.one ? `<span class="skGOne">${inline(g.one)}</span>` : ''}` +
        `<span class="skGProg"><span class="${p.read === p.texts && p.texts ? 'done' : ''}">📄 范文 ${p.read}/${p.texts}</span>` +
        `<span class="${p.drills === p.drillsAll && p.drillsAll ? 'done' : ''}">🧩 练习 ${p.drills}/${p.drillsAll}</span>` +
        `<span class="${p.written === p.tasks && p.tasks ? 'done' : ''}">✍️ 写 ${p.written}/${p.tasks}</span></span></span>` +
        '<span class="skGo" aria-hidden="true">→</span></a></li>';
    }
    h += '</ul>';
    h += `<section class="skMine"><h2>📂 我的作文${MINA.length ? ` <small>${MINA.length} 篇</small>` : ''}</h2>`;
    if (MINA.length) {
      h += typerHtml() + `<ul class="skMineList">${MINA.slice(0, 3).map(mineRow).join('')}</ul>` +
        (MINA.length > 3 ? `<a class="skLink" href="#mina" data-nav>全部 ${MINA.length} 篇 →</a>` : '');
    } else {
      h += '<p class="skHint">还没有批改过的作文。在任意一道写作题里写完 → 点「📋 复制给 CC 批改」→ 回 Claude Code 粘贴运行 <code>/skriva</code>，' +
        '批改好的作文（逐句修改、改后全文、总评）就会出现在这里。</p>';
    }
    h += '</section>';
    main.innerHTML = h;
  }

  // ---------- genre page ----------
  function phraseRow(g, pi) {
    const p = arr(g.phrases)[pi];
    if (!p) return '';
    return `<li class="skPhrRow">${sayBtn(p.sv)}<span class="skPhrTxt"><span class="skPsv" lang="sv">${esc(p.sv)}</span>` +
      `<span class="skPzh">${esc(p.zh)}</span>${p.note ? `<span class="skPnote">${inline(p.note)}</span>` : ''}</span>` +
      (arr(p.src).length ? '<span class="skSrc" title="范文里出现过">范文</span>' : '') + '</li>';
  }
  function mallHtml(g) {
    let h = '<p class="skHint">从上到下就是这种文章的样子。每一格：<b>写什么</b> + 这一格能用的句型（🔊 朗读；标「范文」的在范文里出现过）。</p><ol class="skSlots">';
    for (const s of arr(g.slots)) {
      const n = arr(s.groups).reduce((a, gr) => a + arr(gr.phrases).length, 0);
      h += `<li class="skSlot ${cClass(s.n)}"><details open><summary><span class="skNum">${s.n}</span>` +
        `<span class="skSlotT"><span lang="sv">${esc(s.sv)}</span> <span class="skZh">${esc(s.zh)}</span></span><span class="skCount">${n} 句</span></summary>` +
        (s.what ? `<p class="skWhat">${inline(s.what)}</p>` : '');
      for (const gr of arr(s.groups)) {
        if (gr.sv || gr.zh) h += `<h4 class="skGrp"><span lang="sv">${esc(gr.sv)}</span> ${esc(gr.zh)}</h4>`;
        h += `<ul class="skPhr">${arr(gr.phrases).map((pi) => phraseRow(g, pi)).join('')}</ul>`;
      }
      h += '</details></li>';
    }
    h += '</ol>';
    if (g.compare && MD) h += `<section class="skCompare"><h3>⚖️ 正式 vs 非正式</h3><div class="skTableWrap">${MD.mdToHtml(g.compare)}</div></section>`;
    if (arr(g.grammar).length) {
      h += '<p class="skRel">📗 相关语法笔记：' + g.grammar.map((x) =>
        `<a class="skLink" href="../sok/#note=${enc(x.slug)}">${esc(x.zh || x.name)}</a>`).join(' · ') + '</p>';
    }
    return h;
  }
  function drillState(t) {
    const o = st.ordna[t.slug];
    const f = st.fraser[t.slug];
    return `<span class="${o ? 'done' : ''}">🧱 ${o ? '✓' : '—'}</span><span class="${f ? 'done' : ''}">🖍️ ${Array.isArray(f) ? `${f[0]}/${f[1]}` : '—'}</span>`;
  }
  function texterHtml(g) {
    let h = '<p class="skHint">点开一篇：正文按骨架上色，每一块标着「这一块在做什么」，可以照搬的句型有下划线。</p><ul class="skTexts">';
    for (const t of arr(g.texts)) {
      const done = isRead(t.slug);
      h += `<li><a class="skTextCard${done ? ' done' : ''}" href="${tHash(g, t)}" data-nav>` +
        `<span class="skMark" aria-label="${done ? '已读' : '没读'}">${done ? '✓' : '○'}</span>` +
        `<span class="skTTxt"><span class="skTT" lang="sv">${esc(t.name)}</span>` +
        `<span class="skMeta">${t.sheet ? `<span>${esc(t.sheet)}</span>` : ''}<span>${t.words} 词</span>${t.cefr ? `<span>${esc(t.cefr)}</span>` : ''}` +
        `${drillState(t)}</span></span><span class="skGo" aria-hidden="true">→</span></a></li>`;
    }
    h += '</ul>';
    if (arr(g.more).length) {
      h += '<h3 class="skH3">📚 更多同类范文 <small>在 Läsning / Tala 里读</small></h3><ul class="skMore">';
      for (const m of g.more) {
        h += `<li><a href="../${m.page === 'tala' ? 'tala' : 'reading'}/#article=${enc(m.slug)}"><span lang="sv">${esc(m.title)}</span>` +
          `${m.note ? `<small>${inline(m.note)}</small>` : ''}</a></li>`;
      }
      h += '</ul>';
    }
    return h;
  }
  function ovaHtml(g) {
    let h = '<p class="skHint">两种练习都从范文里自动出题：<b>🧱 排结构</b>——把打乱的各块排回去；<b>🖍️ 填句型</b>——挖掉句型，四选一。先读范文再练。</p><ul class="skDrills">';
    for (const t of arr(g.texts)) {
      const o = st.ordna[t.slug];
      const f = st.fraser[t.slug];
      h += `<li class="skDrill"><span class="skTT" lang="sv">${esc(t.name)}</span><span class="skDrillBtns">` +
        `<a class="skMini${o ? ' on' : ''}" href="${dHash(g, t, 'ordna')}" data-nav>🧱 排结构${o ? ' ✓' : ''}</a>` +
        (clozeItems(g, t).length >= 3
          ? `<a class="skMini${f ? ' on' : ''}" href="${dHash(g, t, 'fraser')}" data-nav>🖍️ 填句型${Array.isArray(f) ? ` ${f[0]}/${f[1]}` : ''}</a>`
          : '<span class="skSmall">句型太少，没有填句型</span>') +
        '</span></li>';
    }
    return h + '</ul>';
  }
  function taskState(g, u) {
    const mine = minaOf(g, u);
    if (mine.length) return `<span class="done">✓ 批改过 ${mine.length} 篇</span>`;
    if (st.sent[tk(g, u)]) return `<span class="done">📋 ${esc(st.sent[tk(g, u)])} 已复制给 CC</span>`;
    const n = words(draftOf(g, u));
    return n ? `<span>草稿 ${n} 词</span>` : '';
  }
  function skrivHtml(g) {
    let h = '<p class="skHint">从 U1 开始：前两道和范文是同一种题，照着骨架写；后两道换了情境。写完复制给 CC 批改。</p><ul class="skTasks">';
    for (const u of arr(g.tasks)) {
      h += `<li><a class="skTaskCard" href="${uHash(g, u)}" data-nav><span class="skUId">${esc(u.id)}</span>` +
        `<span class="skTTxt"><span class="skTT" lang="sv">${esc(u.sv)}</span><span class="skGZh">${esc(u.zh)}</span>` +
        `<span class="skMeta">${u.cefr ? `<span>${esc(u.cefr)}</span>` : ''}<span>${u.len[0]}–${u.len[1]} ord</span>${taskState(g, u)}</span></span>` +
        '<span class="skGo" aria-hidden="true">→</span></a></li>';
    }
    return h + '</ul>';
  }
  function renderGenre(g, tab) {
    if (!tab) {
      tab = TAB_IDS.includes(st.tab[g.key]) ? st.tab[g.key] : 'mall';
      // Keep the tab in the address, so "where he came from" (history state) always names it.
      try { history.replaceState(history.state, '', gHash(g, tab)); } catch (_e) { /* ignore */ }
    }
    cur.tab = tab;
    document.title = `Skriva · ${g.sv} — svensk_agent`;
    let h = topBar('', `<span aria-hidden="true">${esc(g.icon)}</span> <span lang="sv">${esc(g.sv)}</span>`, `${esc(g.zh)}${g.cefr ? ` · ${esc(g.cefr)}` : ''}`);
    if (g.one || g.when) {
      h += `<section class="skIntro">${g.one ? `<p>${inline(g.one)}</p>` : ''}${g.when ? `<p class="skSmall"><b>什么时候写：</b>${inline(g.when)}</p>` : ''}</section>`;
    }
    h += '<div class="skTabs" role="tablist" aria-label="分区">' + TABS.map(([id, icon, name]) =>
      `<button type="button" role="tab" class="skTab${id === tab ? ' on' : ''}" data-tab="${id}" aria-selected="${id === tab}">` +
      `<span aria-hidden="true">${icon}</span><span>${name}</span></button>`).join('') + '</div>';
    h += `<section class="skSec" role="tabpanel">${{ mall: mallHtml, texter: texterHtml, ova: ovaHtml, skriv: skrivHtml }[tab](g)}</section>`;
    main.innerHTML = h;
  }

  // ---------- a model text taken apart ----------
  const svLines = (s) => esc(s).replace(/\n/g, '<br>');
  // A task block: plain paragraph, or a bullet list when its lines start with "- ".
  function taskBlockHtml(b, zh) {
    const lines = str(b.sv).split('\n');
    const sv = lines.every((l) => /^[-*]\s+/.test(l))
      ? `<ul lang="sv">${lines.map((l) => `<li>${esc(l.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`
      : `<p lang="sv">${svLines(b.sv)}</p>`;
    return sv + (zh && b.zh ? `<p class="skZhLine">${svLines(str(b.zh).replace(/^[-*]\s+/gm, '· '))}</p>` : '');
  }
  function blockHtml(g, b, withPhr) {
    const sv = str(b.sv);
    let out = '';
    let at = 0;
    for (const [start, len, pi] of withPhr ? arr(b.hl) : []) {
      if (start < at) continue;
      const p = arr(g.phrases)[pi];
      out += svLines(sv.slice(at, start)) +
        `<span class="skHl ${cClass(p ? p.slot : b.slot)}" role="button" tabindex="0" data-act="phr" data-pi="${pi}">${svLines(sv.slice(start, start + len))}</span>`;
      at = start + len;
    }
    return out + svLines(sv.slice(at));
  }
  function slotLabel(g, b) {
    const s = slotOf(g, b.slot);
    const s2 = b.slot2 ? slotOf(g, b.slot2) : null;
    return `<span class="skNum">${b.slot}</span><span lang="sv">${esc(s ? s.sv : '')}</span>` +
      (s2 ? ` <span class="skNum ${cClass(s2.n)}">${s2.n}</span><span lang="sv">${esc(s2.sv)}</span>` : '') +
      (b.sub ? `<span class="skSub" lang="sv">${esc(b.sub)}</span>` : '');
  }
  function renderText(g, t) {
    document.title = `Skriva · ${t.name} — svensk_agent`;
    const v = st.view;
    const read = isRead(t.slug);
    let h = topBar(gHash(g, 'texter'), `<span lang="sv">${esc(t.name)}</span>`, esc([t.sheet, `${t.words} 词`].filter(Boolean).join(' · ')));
    if (arr(t.task).length) {
      h += '<section class="skTaskBox"><h2>📌 Uppgift <small>题目</small></h2>' + t.task.map((b) => taskBlockHtml(b, v.zh)).join('') + '</section>';
    }
    h += '<div class="skToggles" role="group" aria-label="显示">' +
      `<button type="button" class="skMini${v.struct ? ' on' : ''}" data-act="view" data-k="struct" aria-pressed="${v.struct}">🏷️ 结构</button>` +
      `<button type="button" class="skMini${v.phr ? ' on' : ''}" data-act="view" data-k="phr" aria-pressed="${v.phr}">🖍️ 句型</button>` +
      `<button type="button" class="skMini${v.zh ? ' on' : ''}" data-act="view" data-k="zh" aria-pressed="${v.zh}">🇨🇳 翻译</button></div>`;
    h += `<article class="skPaper${v.struct ? ' struct' : ''}">`;
    for (const b of arr(t.blocks)) {
      const s = slotOf(g, b.slot);
      h += `<div class="skBlock ${cClass(b.slot)}${s && /datum/i.test(s.sv) ? ' right' : ''}">` +
        (v.struct ? `<div class="skLabel">${slotLabel(g, b)}</div>${b.what ? `<p class="skDoing">${inline(b.what)}</p>` : ''}` : '') +
        `<p class="skSv" lang="sv">${blockHtml(g, b, v.phr)}</p>` +
        (v.zh && b.zh ? `<p class="skZhLine">${svLines(b.zh)}</p>` : '') + '</div>';
    }
    h += '</article>';
    if (v.phr) h += '<p class="skSmall">有下划线的是句型：点一下看中文和用法。</p>';
    if (arr(t.notes).length) h += `<section class="skNotes"><h3>✨ 可以偷的写法</h3><ul>${t.notes.map((n) => `<li>${inline(n)}</li>`).join('')}</ul></section>`;
    h += '<div class="skActions">' +
      `<a class="skBtn" href="${gHash(g, 'ova')}" data-nav>🧩 用范文做练习</a>` +
      `<a class="skMini" href="../${t.page === 'tala' ? 'tala' : 'reading'}/#article=${enc(t.slug)}">📖 在 ${t.page === 'tala' ? 'Tala' : 'Läsning'} 里读（可点词）</a>` +
      (t.kurs ? `<a class="skMini" href="../kurs/#l=${enc(t.slug)}">📘 在 Kurs 里逐句精读</a>` : '') +
      (window.ReadSync ? `<button type="button" class="skMini${read ? ' on' : ''}" data-act="read" aria-pressed="${read}">${read ? '✓ 已读' : '标为已读'}</button>` : '') +
      '</div>';
    main.innerHTML = h;
  }

  // Phrase popover (a strip above the bottom nav).
  function showPop(g, pi) {
    const p = arr(g.phrases)[pi];
    if (!p) return;
    const s = slotOf(g, p.slot);
    pop.innerHTML = `<div class="skPopIn ${cClass(p.slot)}"><div class="skPopTop">${sayBtn(p.sv)}<span class="skPsv" lang="sv">${esc(p.sv)}</span>` +
      '<button type="button" class="skIcon sm" data-act="closepop" aria-label="关闭">✕</button></div>' +
      `<p class="skPzh">${esc(p.zh)}</p>${p.note ? `<p class="skPnote">${inline(p.note)}</p>` : ''}` +
      (s ? `<p class="skPopSlot"><span class="skNum">${s.n}</span><span lang="sv">${esc(s.sv)}</span> ${esc(s.zh)}</p>` : '') + '</div>';
    pop.hidden = false;
  }
  function hidePop() { if (!pop.hidden) { pop.hidden = true; pop.innerHTML = ''; } }

  // ---------- drill 1: 🧱 排结构 ----------
  let O = null;   // { g, t, order: [block index…], checked, revealed }
  const firstBit = (sv) => { const s = str(sv).replace(/\s+/g, ' ').trim(); const m = s.match(/^.{20,150}?[.!?…](?=\s|$)/); const o = m ? m[0] : s; return o.length > 150 ? `${o.slice(0, 149)}…` : o; };
  function startOrdna(g, t) {
    const n = arr(t.blocks).length;
    const target = t.blocks.map((b) => b.slot);
    let order = [...Array(n).keys()];
    for (let k = 0; k < 30; k += 1) {
      order = shuffle(order);
      if (order.filter((i, p) => t.blocks[i].slot !== target[p]).length >= Math.min(3, n - 1)) break;
    }
    O = { g, t, order, checked: false, revealed: false };
    renderOrdna();
  }
  function renderOrdna() {
    const { g, t } = O;
    const target = t.blocks.map((b) => b.slot);
    const okAt = (p) => t.blocks[O.order[p]].slot === target[p];
    const right = O.order.filter((_i, p) => okAt(p)).length;
    const all = right === O.order.length;
    document.title = `Skriva · 排结构 — ${t.name}`;
    let h = topBar(gHash(g, 'ova'), '🧱 排结构', `<span lang="sv">${esc(t.name)}</span>`) +
      `<p class="skHint">${O.revealed ? '这是原文的顺序。看每一块属于骨架的哪一格。' : '这篇被打乱了。用 ▲▼ 把每一块移回它的位置，再点「检查」。同一格里的两段可以互换。'}</p>` +
      '<ol class="skOrd">';
    O.order.forEach((bi, p) => {
      const b = t.blocks[bi];
      const show = O.checked || O.revealed;
      const cls = show ? (okAt(p) ? ' ok' : ' bad') : '';
      h += `<li class="skOrdRow${show ? ` ${cClass(b.slot)}` : ''}${cls}">` +
        `<div class="skOrdTxt">${show ? `<div class="skLabel">${slotLabel(g, b)}</div>` : ''}<p lang="sv">${esc(firstBit(b.sv))}</p></div>` +
        (O.revealed ? '' : `<div class="skOrdBtns"><button type="button" class="skIcon sm" data-act="mv" data-p="${p}" data-d="-1" aria-label="上移"${p ? '' : ' disabled'}>▲</button>` +
          `<button type="button" class="skIcon sm" data-act="mv" data-p="${p}" data-d="1" aria-label="下移"${p < O.order.length - 1 ? '' : ' disabled'}>▼</button></div>`) +
        '</li>';
    });
    h += '</ol>';
    if (O.revealed) {
      h += `<div class="skLyBtns"><button type="button" class="skBtn" data-act="ordagain">再排一次</button><a class="skMini" href="${gHash(g, 'ova')}" data-nav>回练习列表</a></div>`;
    } else if (O.checked && all) {
      h += '<p class="skResult ok">🎉 全对！每一块都在它的格子里。</p>' +
        `<div class="skLyBtns">${clozeItems(g, t).length >= 3 ? `<a class="skBtn" href="${dHash(g, t, 'fraser')}" data-nav>接着做 🖍️ 填句型 →</a>` : ''}` +
        `<a class="skMini" href="${gHash(g, 'ova')}" data-nav>回练习列表</a></div>`;
    } else {
      h += (O.checked ? `<p class="skResult">${right} / ${O.order.length} 块位置对了。红色的再挪一挪（标签是它该在的格子）。</p>` : '') +
        `<div class="skLyBtns"><button type="button" class="skBtn" data-act="ordcheck">检查</button>` +
        (O.checked ? '<button type="button" class="skMini" data-act="ordshow">看正确顺序</button>' : '') + '</div>';
    }
    main.innerHTML = h;
  }

  // ---------- drill 2: 🖍️ 填句型 ----------
  // The fixed stretch of a phrase as its author wrote it (same rule as the builder's matchChunk, case kept).
  function chunkOf(sv) {
    let best = '';
    for (const p of str(sv).split(/…|\.\.\./).map((x) => x.replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '').trim())) if (p.length > best.length) best = p;
    return best;
  }
  const drillable = (chunk) => !/\d/.test(chunk) && (/\s/.test(chunk.trim()) || chunk.replace(/[^A-Za-zÅÄÖåäö]/g, '').length >= 6);
  const ABBR = /(?:^|[^A-Za-zÅÄÖåäö])(?:t\.ex|bl\.a|d\.v\.s|m\.m|o\.s\.v|f\.d|s\.k|kl|ca|nr)\.$/i;
  // [start, end) of the sentence around [at, at+len) inside `text`; also returns the sentence before it.
  function sentenceAt(text, at, len) {
    const cuts = [0];
    const re = /[.!?…]+["”’)]*(?=\s|$)|\n+/g;
    let m;
    while ((m = re.exec(text))) {
      const end = m.index + m[0].length;
      if (m[0][0] !== '\n' && ABBR.test(text.slice(0, end))) continue;
      cuts.push(end);
    }
    cuts.push(text.length);
    let i = 0;
    while (i < cuts.length - 2 && cuts[i + 1] <= at) i += 1;
    let j = i + 1;
    while (j < cuts.length - 1 && cuts[j] < at + len) j += 1;
    let a = cuts[i];
    while (a < at && /\s/.test(text[a])) a += 1;
    return { a, b: cuts[j], prev: i > 0 ? text.slice(cuts[i - 1], cuts[i]).trim() : '' };
  }
  // Every highlight that makes a fair question: a real phrase (not a date / name / greeting), once per phrase.
  function clozeItems(g, t) {
    const bySentence = new Map();
    arr(t.blocks).forEach((b, bi) => {
      for (const [start, len, pi] of arr(b.hl)) {
        const p = arr(g.phrases)[pi];
        if (!p || isFrame(slotOf(g, p.slot)) || !drillable(str(b.sv).substr(start, len))) continue;
        const key = `${bi}:${sentenceAt(str(b.sv), start, len).a}`;
        const old = bySentence.get(key);
        if (!old || len > old.len) bySentence.set(key, { bi, start, len, pi });
      }
    });
    const out = [];
    const seen = new Set();
    for (const it of [...bySentence.values()].sort((x, y) => x.bi - y.bi || x.start - y.start)) {
      if (seen.has(it.pi)) continue;
      seen.add(it.pi);
      out.push(it);
    }
    return out;
  }
  let F = null;   // { g, t, qs: [{ item, opts, answer }], i, right, picked }
  function startFraser(g, t) {
    let items = clozeItems(g, t);
    if (items.length > 6) items = shuffle(items).slice(0, 6).sort((x, y) => x.bi - y.bi || x.start - y.start);
    const pool = arr(g.phrases).map((p, pi) => ({ pi, slot: p.slot, chunk: chunkOf(p.sv) }))
      .filter((x) => x.chunk && drillable(x.chunk) && !isFrame(slotOf(g, x.slot)));
    const qs = items.map((item) => {
      const b = t.blocks[item.bi];
      const answer = str(b.sv).substr(item.start, item.len);
      const low = answer.toLowerCase();
      const mine = arr(g.phrases)[item.pi];
      const upper = /^[A-ZÅÄÖ]/.test(answer);
      const whole = (c) => /[.!?]$/.test(c);   // a complete sentence ("Hoppas att det löser sig!") vs a part of one
      const fit = (c) => (whole(c) || upper ? c.charAt(0).toUpperCase() + c.slice(1) : c.charAt(0).toLowerCase() + c.slice(1));
      const taken = new Set([low]);
      const picks = [];
      const kin = pool.filter((x) => whole(x.chunk) === whole(answer));
      // Same kind as the answer and from other parts of the skeleton first (so the question is "which kind of
      // phrase goes here"), then the same kind from anywhere, then anything.
      for (const tier of [kin.filter((x) => x.slot !== mine.slot), kin, pool]) {
        for (const x of shuffle(tier)) {
          const c = x.chunk.toLowerCase();
          if (picks.length >= 3) break;
          if (taken.has(c) || c.includes(low) || low.includes(c)) continue;
          taken.add(c);
          picks.push(fit(x.chunk));
        }
      }
      return { item, answer, opts: shuffle([answer].concat(picks)) };
    }).filter((q) => q.opts.length >= 3);
    F = { g, t, qs, i: 0, right: 0, picked: -1 };
    renderFraser();
  }
  function renderFraser() {
    const { g, t } = F;
    document.title = `Skriva · 填句型 — ${t.name}`;
    let h = topBar(gHash(g, 'ova'), '🖍️ 填句型', `<span lang="sv">${esc(t.name)}</span>`);
    if (!F.qs.length) {
      main.innerHTML = h + `<p class="skEmpty">这篇范文里可以出题的句型太少。</p><a class="skMini" href="${gHash(g, 'ova')}" data-nav>回练习列表</a>`;
      return;
    }
    if (F.i >= F.qs.length) {
      h += `<p class="skResult${F.right === F.qs.length ? ' ok' : ''}">${F.right === F.qs.length ? '🎉 ' : ''}${F.right} / ${F.qs.length} 题对了。</p>` +
        '<p class="skHint">这些句型都在 🧱 骨架 里，按「放在文章的哪一格」分好了；写的时候直接拿来用。</p>' +
        `<div class="skLyBtns"><button type="button" class="skBtn" data-act="fragain">再练一次</button>` +
        `<a class="skMini" href="${gHash(g, 'skriv')}" data-nav>去写一篇 →</a><a class="skMini" href="${gHash(g, 'ova')}" data-nav>回练习列表</a></div>`;
      main.innerHTML = h;
      return;
    }
    const q = F.qs[F.i];
    const b = t.blocks[q.item.bi];
    const sv = str(b.sv);
    const s = sentenceAt(sv, q.item.start, q.item.len);
    const done = F.picked >= 0;
    const p = arr(g.phrases)[q.item.pi];
    const gap = done ? `<b class="skGapDone">${esc(q.answer)}</b>` : '<span class="skGap" aria-label="空">＿＿＿＿</span>';
    h += `<div class="skLyBar" aria-hidden="true"><span style="width:${Math.round((F.i / F.qs.length) * 100)}%"></span></div>` +
      `<p class="skQNo">第 ${F.i + 1} / ${F.qs.length} 题</p>` +
      `<div class="skQ ${cClass(b.slot)}"><div class="skLabel">${slotLabel(g, b)}</div>` +
      (s.prev ? `<p class="skQPrev" lang="sv">${esc(s.prev)}</p>` : '') +
      `<p class="skQSv" lang="sv">${svLines(sv.slice(s.a, q.item.start))}${gap}${svLines(sv.slice(q.item.start + q.item.len, s.b))}</p></div>` +
      '<div class="skOpts">' + q.opts.map((o, i) => {
        const cls = !done ? '' : o === q.answer ? ' ok' : i === F.picked ? ' bad' : ' dim';
        return `<button type="button" class="skOpt${cls}" data-act="opt" data-i="${i}" lang="sv"${done ? ' disabled' : ''}>${esc(o)}</button>`;
      }).join('') + '</div>';
    if (done) {
      h += `<div class="skAfter"><p><span lang="sv"><b>${esc(p.sv)}</b></span> ${sayBtn(p.sv)}<br>${esc(p.zh)}${p.note ? `<br><span class="skPnote">${inline(p.note)}</span>` : ''}</p>` +
        `<button type="button" class="skBtn" data-act="frnext">${F.i + 1 < F.qs.length ? '下一题 →' : '看结果'}</button></div>`;
    }
    main.innerHTML = h;
  }

  // ---------- a writing task ----------
  let saveT = 0;
  let pending = null;   // { key, text } waiting to be written
  let taSeen = false;   // has he put the cursor in the editor on this visit?
  function flushDraft() {
    clearTimeout(saveT);
    if (!pending) return;
    const { key, text } = pending;
    pending = null;
    mutate((s) => { if (text.trim()) s.drafts[key] = { text, at: new Date().toISOString() }; else delete s.drafts[key]; });
  }
  function countHtml(u, n) {
    const [lo, hi] = u.len;
    const cls = n >= lo && n <= hi ? 'ok' : n > hi ? 'over' : '';
    return `<b class="${cls}">${n}</b> ord · 目标 ${lo}–${hi}${n > hi ? ' · 超了，可以删一点' : n >= lo ? ' · 够了 ✓' : ''}`;
  }
  function checkCount(g, u) {
    const c = isObj(st.checks[tk(g, u)]) ? st.checks[tk(g, u)] : {};
    const all = arr(g.checks).reduce((n, x) => n + arr(x.items).length, 0);
    return `${Object.keys(c).filter((k) => c[k]).length}/${all}`;
  }
  function renderTask(g, u) {
    document.title = `Skriva · ${u.id} ${u.sv} — svensk_agent`;
    const key = tk(g, u);
    const req = isObj(st.req[key]) ? st.req[key] : {};
    const chk = isObj(st.checks[key]) ? st.checks[key] : {};
    const text = draftOf(g, u);
    const model = u.model ? textOf(g, u.model) : null;
    const mine = minaOf(g, u);
    taSeen = false;
    let h = topBar(gHash(g, 'skriv'), `<span class="skUId">${esc(u.id)}</span> <span lang="sv">${esc(u.sv)}</span>`, esc(u.zh));
    h += '<section class="skTaskBox"><h2>📌 Uppgift <small>题目</small></h2>' +
      `<p lang="sv">${esc(u.sit.sv)}</p><details class="skZhD"><summary>🇨🇳 中文</summary><p>${esc(u.sit.zh)}</p></details>` +
      '<p class="skReqH" lang="sv">I texten ska du …</p><ul class="skReq">' +
      arr(u.req).map((r, i) => `<li><label><input type="checkbox" data-act="req" data-i="${i}"${req[i] ? ' checked' : ''}>` +
        `<span><span lang="sv">${esc(r.sv)}</span><small>${esc(r.zh)}</small></span></label></li>`).join('') + '</ul>' +
      `<p class="skMeta">${u.cefr ? `<span>${esc(u.cefr)}</span>` : ''}<span>${u.len[0]}–${u.len[1]} ord</span>` +
      (model ? `<a class="skLink" href="${tHash(g, model)}" data-nav>📄 仿：${esc(model.name)}</a>` : '') + '</p></section>';

    // Skeleton hints: tap a phrase to drop it into the text at the cursor.
    h += '<details class="skAid"><summary>🧱 骨架提示 <small>点句型放进作文</small></summary>';
    if (arr(u.hints).length) {
      h += '<p class="skAidH">这道题用得上：</p><div class="skChips">' +
        u.hints.map((x) => `<button type="button" class="skIns" data-act="ins" data-ins="${esc(x.sv)}" title="${esc(x.zh)}" lang="sv">${esc(x.sv)}</button>`).join('') + '</div>';
    }
    for (const s of arr(g.slots)) {
      const ps = [].concat(...arr(s.groups).map((gr) => arr(gr.phrases))).map((pi) => g.phrases[pi]).filter(Boolean).slice(0, 4);
      h += `<div class="skAidSlot ${cClass(s.n)}"><p><span class="skNum">${s.n}</span><span lang="sv">${esc(s.sv)}</span> <span class="skZh">${esc(s.zh)}</span></p>` +
        (!ps.length ? '' : '<div class="skChips">' + ps.map((p) =>
          `<button type="button" class="skIns" data-act="ins" data-ins="${esc(p.sv)}" title="${esc(p.zh)}" lang="sv">${esc(p.sv)}</button>`).join('') + '</div>') + '</div>';
    }
    h += `<a class="skLink" href="${gHash(g, 'mall')}" data-nav>全部句型 →</a></details>`;

    h += `<div class="skEditor"><textarea id="skTa" lang="sv" spellcheck="true" autocapitalize="sentences" autocomplete="off" rows="12" ` +
      `placeholder="Skriv din text här …" aria-label="作文">${esc(text)}</textarea>` +
      `<div class="skCountRow"><span id="skCount">${countHtml(u, words(text))}</span><span id="skSaved" class="skSaved">${text ? '草稿已保存在这台设备' : ''}</span></div></div>`;

    if (arr(g.checks).length) {
      h += `<details class="skCheck"><summary>✅ 自查清单 <small id="skChkN">${checkCount(g, u)}</small></summary>`;
      let n = 0;
      for (const c of g.checks) {
        if (c.name) h += `<h4>${esc(c.name)}</h4>`;
        h += '<ul class="skReq">' + arr(c.items).map((it) => {
          const i = n; n += 1;
          return `<li><label><input type="checkbox" data-act="chk" data-i="${i}"${chk[i] ? ' checked' : ''}><span>${inline(it)}</span></label></li>`;
        }).join('') + '</ul>';
      }
      h += '</details>';
    }
    h += '<div class="skSend"><button type="button" class="skBtn" data-act="copy">📋 复制给 CC 批改</button>' +
      '<button type="button" class="skMini" data-act="clear">清空</button></div>' +
      '<p class="skSmall">回 Claude Code 粘贴，运行 <code>/skriva</code>：逐句改错、给改后全文和总评，并存进「📂 我的作文」。' +
      '仓库是公开的——作文里别写真实的姓名、地址、电话（像范文那样编一个）。草稿只存在这台设备的浏览器里。</p>';
    if (mine.length) h += `<section class="skMine"><h2>📂 这道题批改过的</h2><ul class="skMineList">${mine.map(mineRow).join('')}</ul></section>`;
    main.innerHTML = h;
  }
  function taskInput(ta) {
    if (cur.view !== 'task') return;
    const n = words(ta.value);
    const c = document.getElementById('skCount');
    if (c) c.innerHTML = countHtml(cur.u, n);
    const sv = document.getElementById('skSaved');
    if (sv) sv.textContent = '…';
    pending = { key: tk(cur.g, cur.u), text: ta.value };
    clearTimeout(saveT);
    saveT = setTimeout(() => { flushDraft(); const e = document.getElementById('skSaved'); if (e) e.textContent = '草稿已保存在这台设备'; }, 500);
  }
  function insertPhrase(text) {
    const ta = document.getElementById('skTa');
    if (!ta) return;
    const a = !taSeen || ta.selectionStart == null ? ta.value.length : ta.selectionStart;
    const b = !taSeen || ta.selectionEnd == null ? a : ta.selectionEnd;
    const before = ta.value.slice(0, a);
    const lead = before && !/\s$/.test(before) ? ' ' : '';
    const ins = `${lead}${text} `;
    ta.value = before + ins + ta.value.slice(b);
    const pos = a + ins.length;
    ta.focus();
    try { ta.setSelectionRange(pos, pos); } catch (_e) { /* ignore */ }
    taskInput(ta);
  }
  function copyTask() {
    const ta = document.getElementById('skTa');
    const text = ta ? ta.value.replace(/\s+$/, '') : '';
    if (words(text) < 10) { toast('先写几句（至少 10 个词）再复制'); return; }
    flushDraft();
    const { g, u } = cur;
    const block = '```skriva-text v1\n' + `date: ${today()}\ngenre: ${g.key}\nuppgift: ${u.id}\ntitel: ${u.sv}\nord: ${words(text)}\n---\n${text.replace(/```/g, "'''")}\n` + '```';
    const done = () => {
      mutate((s) => { s.sent[tk(g, u)] = today(); });
      toast('✓ 已复制。回 Claude Code 粘贴，运行 /skriva');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(block).then(done, () => { window.prompt('复制这段：', block); done(); });
    else { window.prompt('复制这段：', block); done(); }
  }

  // ---------- my corrected texts ----------
  function renderMineList() {
    document.title = 'Skriva · 我的作文 — svensk_agent';
    main.innerHTML = topBar('', '📂 我的作文', `${MINA.length} 篇`) + typerHtml() +
      (MINA.length ? `<ul class="skMineList">${MINA.map(mineRow).join('')}</ul>` : '<p class="skEmpty">还没有批改过的作文。</p>');
  }
  const paras = (t) => str(t).split(/\n[ \t]*\n/).map((p) => `<p lang="sv">${svLines(p.trim())}</p>`).join('');
  function renderMine(id) {
    const m = MINA.find((x) => x.id === id);
    if (!m) { renderMineList(); return; }
    const g = gBy.get(m.genre);
    const u = g ? taskOf(g, m.uppgift) : null;
    const o = OMDOME[m.omdome];
    document.title = `Skriva · ${m.titel || m.id} — svensk_agent`;
    let h = topBar('#mina', `<span lang="sv">${esc(m.titel || m.id)}</span>`, esc([m.date, g ? g.zh : '', `${m.ord} ord`].filter(Boolean).join(' · ')));
    if (o) h += `<p class="skOmBig ${esc(m.omdome)}">${o[0]} ${o[1]}</p>`;
    if (arr(m.total).length) h += `<section class="skNotes"><h3>💬 总评</h3><ul>${m.total.map((x) => `<li>${inline(x)}</li>`).join('')}</ul></section>`;
    if (arr(m.rows).length) {
      h += `<section><h3 class="skH3">🔎 逐句修改 <small>${m.rows.length} 处</small></h3><ol class="skFix">` + m.rows.map((r) =>
        `<li><p class="skMin" lang="sv">${esc(r.min)}</p><p class="skRatt" lang="sv">${esc(r.ratt)}</p>` +
        `<p class="skWhy">${r.typ ? `<span class="skTyp">${esc(r.typ)}</span>` : ''}${inline(r.why)}</p></li>`).join('') + '</ol></section>';
    }
    if (m.rattad) h += `<section><h3 class="skH3">✅ 改后全文</h3><article class="skPaper plain">${paras(m.rattad)}</article></section>`;
    h += `<details class="skZhD wide"><summary>✍️ 我的原文</summary><article class="skPaper plain">${paras(m.original)}</article></details>`;
    if (arr(m.uppgiften).length) {
      h += '<section><h3 class="skH3">📋 任务完成情况</h3><ul class="skUpp">' +
        m.uppgiften.map((x) => `<li><span>${esc(x.mark)}</span><span>${inline(x.text)}</span></li>`).join('') + '</ul></section>';
    }
    if (g && u) h += `<div class="skActions"><a class="skBtn" href="${uHash(g, u)}" data-nav>↻ 再写一遍这道题</a></div>`;
    main.innerHTML = h;
  }

  // ---------- events ----------
  main.addEventListener('click', (e) => {
    const wiki = e.target.closest('[data-wikilink]');
    if (wiki) { location.href = `../sok/#note=${enc(wiki.getAttribute('data-wikilink'))}`; return; }
    const nav = e.target.closest('a[data-nav]');
    if (nav) { e.preventDefault(); go(nav.getAttribute('href')); return; }
    const tab = e.target.closest('.skTab');
    if (tab && cur.view === 'genre') {
      const id = tab.getAttribute('data-tab');
      mutate((s) => { s.tab[cur.g.key] = id; });
      try { history.replaceState(history.state, '', gHash(cur.g, id)); } catch (_e) { /* ignore */ }
      routed = location.hash;
      renderGenre(cur.g, id);
      return;
    }
    const act = e.target.closest('[data-act]');
    if (!act) { hidePop(); return; }
    const a = act.getAttribute('data-act');
    if (a === 'say') { e.preventDefault(); say(act.getAttribute('data-say')); return; }
    if (a === 'up') { up(act.getAttribute('data-parent')); return; }
    if (a === 'phr' && cur.view === 'text') { showPop(cur.g, Number(act.getAttribute('data-pi'))); return; }
    hidePop();
    if (a === 'view' && cur.view === 'text') {
      const k = act.getAttribute('data-k');
      mutate((s) => { s.view[k] = !s.view[k]; });
      const y = window.scrollY;
      renderText(cur.g, cur.t);
      window.scrollTo(0, y);
      return;
    }
    if (a === 'read' && cur.view === 'text' && window.ReadSync) {
      const on = !isRead(cur.t.slug);
      window.ReadSync.setRead(cur.t.slug, on);
      toast(on ? '✓ 已标为已读' : '已取消已读');
      const y = window.scrollY;
      renderText(cur.g, cur.t);
      window.scrollTo(0, y);
      return;
    }
    if (O && cur.view === 'drill') {
      if (a === 'mv') {
        const p = Number(act.getAttribute('data-p'));
        const q = p + Number(act.getAttribute('data-d'));
        if (q >= 0 && q < O.order.length) { [O.order[p], O.order[q]] = [O.order[q], O.order[p]]; O.checked = false; renderOrdna(); }
        return;
      }
      if (a === 'ordcheck') {
        O.checked = true;
        const target = O.t.blocks.map((b) => b.slot);
        if (O.order.every((bi, p) => O.t.blocks[bi].slot === target[p])) mutate((s) => { s.ordna[O.t.slug] = today(); });
        renderOrdna();
        return;
      }
      if (a === 'ordshow') { O.order = [...Array(O.t.blocks.length).keys()]; O.revealed = true; renderOrdna(); window.scrollTo(0, 0); return; }
      if (a === 'ordagain') { startOrdna(O.g, O.t); window.scrollTo(0, 0); return; }
    }
    if (F && cur.view === 'drill') {
      if (a === 'opt' && F.picked < 0) {
        const i = Number(act.getAttribute('data-i'));
        const q = F.qs[F.i];
        F.picked = i;
        if (q.opts[i] === q.answer) F.right += 1;
        renderFraser();
        return;
      }
      if (a === 'frnext') {
        F.i += 1;
        F.picked = -1;
        if (F.i >= F.qs.length) mutate((s) => { s.fraser[F.t.slug] = [F.right, F.qs.length, today()]; });
        renderFraser();
        window.scrollTo(0, 0);
        return;
      }
      if (a === 'fragain') { startFraser(F.g, F.t); window.scrollTo(0, 0); return; }
    }
    if (cur.view === 'task') {
      if (a === 'ins') { insertPhrase(act.getAttribute('data-ins')); return; }
      if (a === 'copy') { copyTask(); return; }
      if (a === 'clear') {
        const ta = document.getElementById('skTa');
        if (ta && ta.value && window.confirm('清空这篇草稿？')) { ta.value = ''; taskInput(ta); flushDraft(); }
        return;
      }
    }
  });
  main.addEventListener('change', (e) => {
    const box = e.target.closest('input[type="checkbox"][data-act]');
    if (!box || cur.view !== 'task') return;
    const a = box.getAttribute('data-act');
    const i = box.getAttribute('data-i');
    const key = tk(cur.g, cur.u);
    const bag = a === 'req' ? 'req' : 'checks';
    mutate((s) => { if (!isObj(s[bag][key])) s[bag][key] = {}; if (box.checked) s[bag][key][i] = 1; else delete s[bag][key][i]; });
    const n = document.getElementById('skChkN');
    if (n) n.textContent = checkCount(cur.g, cur.u);
  });
  main.addEventListener('input', (e) => { if (e.target && e.target.id === 'skTa') taskInput(e.target); });
  main.addEventListener('focusin', (e) => { if (e.target && e.target.id === 'skTa') taSeen = true; });
  pop.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.getAttribute('data-act') === 'say') say(act.getAttribute('data-say'));
    else hidePop();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hidePop(); return; }
    // The highlighted phrases are spans (so they can wrap); give them a button's keys.
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.classList && e.target.classList.contains('skHl')) { e.preventDefault(); e.target.click(); }
  });
  window.addEventListener('pagehide', flushDraft);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushDraft(); });

  // Read marks arrive from other devices after load; another tab may finish a drill or edit a draft.
  if (window.ReadSync && window.ReadSync.onChange) window.ReadSync.onChange(() => route({ passive: true }));
  window.addEventListener('pageshow', (e) => { if (e.persisted) { st = loadState(); route({ passive: true }); } });
  window.addEventListener('storage', (e) => { if (e.key === LS) { st = loadState(); route({ passive: true }); } });

  // ---------- boot ----------
  // Landing straight on a deep view: no in-app history yet, so ← goes to the view's parent (see up()).
  route({ top: true });
})();

/* Tala — 口语练习. The speaking companion to Läsning: the same reading engine
   (../reading/reading.js, run with <body data-site="tala">) lists the scenarios
   and, each time one opens, fires a 'reading:open' event with an empty
   #practiceSlot above the text. This file fills that slot with two drills:

   🎭 角色扮演 (role-play) — dialogs only (a.dialog, parsed at build time by
      tools/build-reading-site.js). Pick a role; the sv-SE voice reads everyone
      else, and on your lines it stops and waits: your Swedish is hidden behind
      the 中文 cue, you say it aloud, then reveal / hear the model / record
      yourself and compare, and carry on.
   🗣️ 跟读 (shadowing) — every scenario. One sentence at a time: hear it, then a
      pause sized to the sentence for you to repeat it; 单句循环 and 盲跟 (hide
      the text) for harder practice.

   Pure static page: speech is the browser's SpeechSynthesis (speak.js), the
   optional 🎙️ recording stays in memory only (MediaRecorder → blob URL). */

(function () {
  'use strict';

  const SV = window.SvSpeak;
  const canSpeak = !!(SV && SV.supported);
  const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

  // ---------- prefs (per viewer, localStorage) ----------

  const LS_PREFS = 'tala.prefs.v1';
  const prefs = Object.assign(
    { rate: 0.85, gap: 1.5, hideMine: true, zh: true, blind: false },
    (() => { try { return JSON.parse(localStorage.getItem(LS_PREFS) || '{}') || {}; } catch (_e) { return {}; } })()
  );
  function savePrefs() { try { localStorage.setItem(LS_PREFS, JSON.stringify(prefs)); } catch (_e) {} }

  const RATES = [[0.7, '🐢 慢'], [0.85, '中速'], [1, '常速']];
  const GAPS = [[1, '短'], [1.5, '中'], [2, '长']];

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  const plain = (s) => String(s || '').replace(/[*_]/g, '').trim();

  // ---------- state ----------
  // One practice context per open scenario. Re-opening the same scenario (e.g.
  // "标为已读" re-renders the pane) keeps the mode / role / position / recordings.
  let ctx = null;
  let timer = null;
  let rec = null;   // active MediaRecorder session { mr, stream, slug, i }

  document.addEventListener('reading:open', (e) => {
    const { article, slot, speechParts } = e.detail || {};
    halt(true);
    if (!article || !slot) return;
    const same = ctx && ctx.a.slug === article.slug;
    if (!same && ctx) ctx.recs.forEach((url) => URL.revokeObjectURL(url));
    ctx = same ? Object.assign(ctx, { slot, speechParts, playing: false, waiting: false }) : {
      a: article,
      slot,
      speechParts,
      mode: article.dialog ? 'roleplay' : 'shadow',
      role: null,           // null = picker; '*' = listen only; else a speaker key
      idx: 0,               // role-play position (index into dialog.turns)
      sIdx: 0,              // shadowing position (index into shadowItems())
      playing: false,
      waiting: false,       // stopped on a line that needs the learner (their turn / no voice)
      done: false,
      loop: false,
      phase: '',            // shadowing: 'speak' | 'gap'
      gapMs: 0,
      revealed: new Set(),  // my role-play lines already shown
      recs: new Map(),      // turn index → recording blob URL
      shadow: null,
    };
    slot.addEventListener('click', onClick);
    render();
  });

  // Stop playback / timers / recording. cancelSpeech=false leaves speech alone
  // (used when the page's own 🔊 朗读全文 takes over the voice).
  function halt(cancelSpeech) {
    clearTimeout(timer);
    timer = null;
    if (rec) { try { rec.mr.stop(); } catch (_e) {} }
    if (ctx) { ctx.playing = false; ctx.phase = ''; }
    if (cancelSpeech && SV) SV.cancel();
  }

  // The page's 🔊 朗读全文 and our drills share one voice: when one starts, the
  // other must look stopped. (reading.js owns that button; we only mirror state.)
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#readAloudBtn') || !ctx || !ctx.playing) return;
    halt(false);
    ctx.waiting = false;
    render();
  });
  function quietReadAloud() {
    const ra = document.getElementById('readAloudBtn');
    if (ra && ra.classList.contains('on')) { ra.classList.remove('on'); ra.textContent = '🔊 朗读全文'; }
  }

  // Speak one line; onend fires only if this run is still current. Returns false
  // when there is no usable Swedish voice (speak.js then shows its install hint).
  function say(text, onend, onstart) {
    if (!canSpeak) return false;
    quietReadAloud();
    return SV.speakSequence([plain(text)], { rate: prefs.rate, onpart: onstart, onend });
  }

  // ---------- role-play ----------

  const turns = () => (ctx.a.dialog ? ctx.a.dialog.turns : []);
  const speakers = () => (ctx.a.dialog ? ctx.a.dialog.speakers : []);
  const isMine = (t) => !!t.s && t.s === ctx.role;
  function speakerName(key) {
    const sp = speakers().find((x) => x.key === key);
    return sp ? sp.label : key;
  }
  function speakerIndex(key) {
    return Math.max(0, speakers().findIndex((x) => x.key === key)) % 6;
  }

  function rpStep() {
    const list = turns();
    if (!ctx.playing) return;
    while (ctx.idx < list.length && !list[ctx.idx].s) ctx.idx += 1;   // skip scene titles / stage directions
    if (ctx.idx >= list.length) {
      ctx.playing = false; ctx.waiting = false; ctx.done = true;
      render();
      return;
    }
    const t = list[ctx.idx];
    if (isMine(t)) {
      ctx.playing = false; ctx.waiting = true;
      render();
      return;
    }
    ctx.waiting = false;
    render();
    const ok = say(t.sv, () => {
      if (!ctx.playing) return;
      ctx.idx += 1;
      rpStep();
    });
    if (!ok) { ctx.playing = false; ctx.waiting = true; render(); }   // no voice → step by hand
  }

  function rpStart(fromIdx) {
    halt(true);
    ctx.idx = fromIdx;
    ctx.done = false;
    ctx.playing = true;
    rpStep();
  }

  function rpNext() {
    halt(true);
    const t = turns()[ctx.idx];
    if (t && isMine(t)) ctx.revealed.add(ctx.idx);
    ctx.idx += 1;
    ctx.waiting = false;
    ctx.playing = true;
    rpStep();
  }

  function turnHtml(t, i) {
    if (t.scene) return `<div class="tlScene">${esc(t.sv)}</div>`;
    if (t.stage) {
      return `<div class="tlStage"><em>${esc(t.sv)}</em>` +
        (prefs.zh && t.zh ? `<span class="tlZh">${esc(t.zh)}</span>` : '') + `</div>`;
    }
    const mine = isMine(t);
    const current = i === ctx.idx && (ctx.playing || ctx.waiting);
    const past = i < ctx.idx || ctx.done;
    const hidden = mine && prefs.hideMine && !ctx.revealed.has(i) && !ctx.done;
    // Your hidden line still needs a cue, so its 中文 shows even with 🇨🇳 off.
    const showZh = t.zh && (prefs.zh || hidden);
    const cls = ['tlTurn', `tlSp${speakerIndex(t.s)}`];
    if (mine) cls.push('mine');
    if (current) cls.push('current');
    else if (past) cls.push('past');
    if (hidden) cls.push('hidden');

    let acts = '';
    if (current && ctx.waiting) {
      acts = mine
        ? `<div class="tlActs">` +
            `<span class="tlCue">🎤 轮到你了 — 先自己说出来</span>` +
            (hidden ? `<button type="button" class="tlBtn" data-act="reveal">👀 看原文</button>` : '') +
            (canSpeak ? `<button type="button" class="tlBtn" data-act="model" data-i="${i}">🔊 听示范</button>` : '') +
            (canRecord ? `<button type="button" class="tlBtn${rec && rec.i === i ? ' rec' : ''}" data-act="rec" data-i="${i}">${rec && rec.i === i ? '⏹ 停止录音' : '🎙️ 录音对比'}</button>` : '') +
            `<button type="button" class="tlBtn primary" data-act="next">说完了，继续 →</button>` +
          `</div>`
        : `<div class="tlActs"><button type="button" class="tlBtn primary" data-act="next">下一句 →</button></div>`;
    }
    const recUrl = ctx.recs.get(i);
    return (
      `<div class="${cls.join(' ')}" data-i="${i}">` +
        `<div class="tlWho">${mine ? '🙋 你 · ' : ''}${esc(speakerName(t.s))}</div>` +
        `<div class="tlBubble">` +
          `<div class="tlSv">${esc(plain(t.sv))}${!hidden && canSpeak ? SV.buttonHtml(plain(t.sv), 'tlSpeak') : ''}</div>` +
          (showZh ? `<div class="tlZh">${esc(t.zh)}</div>` : '') +
          acts +
          (recUrl ? `<div class="tlRec"><span>🎙️ 你的录音</span><audio controls preload="auto" src="${recUrl}" data-i="${i}"></audio></div>` : '') +
        `</div>` +
      `</div>`
    );
  }

  function rolePickerHtml() {
    const d = ctx.a.dialog;
    const btns = d.speakers
      .filter((sp) => sp.lines >= 1)
      .map((sp) =>
        `<button type="button" class="tlRole tlSp${speakerIndex(sp.key)}" data-act="role" data-role="${esc(sp.key)}">` +
          `<span class="tlRoleName">🙋 ${esc(sp.label)}${sp.label !== sp.key ? ` <small>(${esc(sp.key)})</small>` : ''}</span>` +
          `<span class="tlRoleMeta">${sp.lines} 句</span>` +
        `</button>`).join('');
    return (
      `<p class="tlIntro">选一个角色 —— 你来说这个人的台词，其他人由瑞典语语音朗读。轮到你时会停下，` +
        `先看中文提示自己说，再「看原文 / 听示范 / 录音对比」。</p>` +
      `<div class="tlRoles">${btns}` +
        `<button type="button" class="tlRole listen" data-act="role" data-role="*">` +
          `<span class="tlRoleName">🎧 只听全文</span><span class="tlRoleMeta">先熟悉对话</span>` +
        `</button>` +
      `</div>` +
      (d.zhAligned ? '' : `<p class="tlNote">⚠️ 这篇的中文译文没能逐句对齐，轮到你时只能凭记忆说（或开 👀 看原文）。</p>`)
    );
  }

  function roleplayHtml() {
    if (!ctx.role) return rolePickerHtml();
    const listening = ctx.role === '*';
    const bar =
      `<div class="tlBar">` +
        `<span class="tlBarRole">${listening ? '🎧 只听全文' : `🙋 我演：<b>${esc(speakerName(ctx.role))}</b>`}</span>` +
        `<button type="button" class="tlBtn" data-act="pickRole">换角色</button>` +
        `<span class="tlSpacer"></span>` +
        (ctx.playing
          ? `<button type="button" class="tlBtn primary" data-act="pause">⏸ 暂停</button>`
          : `<button type="button" class="tlBtn primary" data-act="play">▶ ${ctx.idx > 0 && !ctx.done ? '继续' : '开始'}</button>`) +
        `<button type="button" class="tlBtn" data-act="restart">↺ 从头</button>` +
      `</div>` +
      `<div class="tlToggles">` +
        (listening ? '' : toggleHtml('hideMine', '🙈 藏我的台词')) +
        toggleHtml('zh', '🇨🇳 中文') +
        `<span class="tlHint">点任意一句 = 从那句开始</span>` +
      `</div>`;
    const done = ctx.done
      ? `<div class="tlDone">🎉 ${listening ? '听完了！' : '演完了！'}` +
          `<button type="button" class="tlBtn" data-act="restart">↺ 再来一遍</button>` +
          `<button type="button" class="tlBtn" data-act="pickRole">🔄 换个角色</button></div>`
      : '';
    return bar + `<div class="tlScript">${turns().map(turnHtml).join('')}${done}</div>`;
  }

  // ---------- shadowing ----------

  // Sentences to shadow: a dialog's turns (speaker + aligned 中文, long turns split
  // into sentences); otherwise the Swedish prose reading.js extracts for 朗读全文.
  function shadowItems() {
    if (ctx.shadow) return ctx.shadow;
    const out = [];
    if (ctx.a.dialog) {
      for (const t of ctx.a.dialog.turns) {
        if (!t.s) continue;
        const sv = plain(t.sv).split(/(?<=[.!?…])\s+/).filter(Boolean);
        const zh = String(t.zh || '').split(/(?<=[。！？…])/).map((x) => x.trim()).filter(Boolean);
        sv.forEach((s, k) => out.push({ sv: s, zh: zh.length === sv.length ? zh[k] : t.zh, who: speakerName(t.s) }));
      }
    } else {
      for (const s of ctx.speechParts() || []) out.push({ sv: s, zh: '', who: '' });
    }
    ctx.shadow = out;
    return out;
  }

  function shStep() {
    const list = shadowItems();
    if (!ctx.playing) return;
    if (ctx.sIdx >= list.length) {
      ctx.playing = false; ctx.phase = ''; ctx.done = true; ctx.sIdx = list.length - 1;
      render();
      return;
    }
    ctx.phase = 'speak';
    render();
    let t0 = 0;
    const ok = say(list[ctx.sIdx].sv, () => {
      if (!ctx.playing) return;
      // Repeat window ≈ how long the voice took × the chosen pause, + a beat to start.
      const dur = t0 ? performance.now() - t0 : 2500;
      ctx.gapMs = Math.round(Math.max(1500, dur * prefs.gap + 600));
      ctx.phase = 'gap';
      render();
      timer = setTimeout(() => {
        if (!ctx.playing) return;
        if (!ctx.loop) ctx.sIdx += 1;
        shStep();
      }, ctx.gapMs);
    }, () => { t0 = performance.now(); });
    if (!ok) { ctx.playing = false; ctx.phase = ''; render(); }
  }

  function shGo(i, play) {
    halt(true);
    const n = shadowItems().length;
    ctx.sIdx = Math.max(0, Math.min(n - 1, i));
    ctx.done = false;
    ctx.playing = !!play;
    if (play) shStep(); else render();
  }

  function shadowHtml() {
    const list = shadowItems();
    if (!list.length) return `<p class="tlIntro">这篇没有可跟读的瑞典语句子。</p>`;
    const it = list[ctx.sIdx] || list[0];
    const phase = ctx.phase === 'speak' ? '🔊 听…' : ctx.phase === 'gap' ? '🎤 跟读！' : ctx.done ? '🎉 全部跟读完' : '';
    const blind = prefs.blind && ctx.phase !== 'gap' && !ctx.done;
    const sentences = list.map((x, i) =>
      `<li class="${i === ctx.sIdx ? 'current' : ''}" data-act="jump" data-i="${i}">` +
        (x.who ? `<b>${esc(x.who)}:</b> ` : '') + `${esc(x.sv)}</li>`).join('');
    return (
      `<p class="tlIntro">听一句 → 停顿时<b>大声跟读</b>（模仿语调和节奏）→ 自动下一句。` +
        `${prefs.blind ? '盲跟模式：听的时候不看字，跟读时才显示。' : ''}</p>` +
      `<div class="tlCard${ctx.phase ? ' ' + ctx.phase : ''}">` +
        `<div class="tlCardTop"><span>第 ${ctx.sIdx + 1} / ${list.length} 句</span>` +
          (it.who ? `<span class="tlCardWho">${esc(it.who)}</span>` : '') +
          `<span class="tlSpacer"></span><span class="tlPhase">${phase}</span></div>` +
        `<div class="tlCardSv${blind ? ' blind' : ''}">${esc(it.sv)}</div>` +
        (prefs.zh && it.zh ? `<div class="tlCardZh">${esc(it.zh)}</div>` : '') +
        `<div class="tlGap">${ctx.phase === 'gap' ? `<div class="tlGapBar" style="animation-duration:${ctx.gapMs}ms"></div>` : ''}</div>` +
        `<div class="tlCtrls">` +
          `<button type="button" class="tlBtn" data-act="prev" aria-label="上一句">⏮</button>` +
          (ctx.playing
            ? `<button type="button" class="tlBtn primary" data-act="pause">⏸ 暂停</button>`
            : `<button type="button" class="tlBtn primary" data-act="play">▶ ${ctx.done ? '再来一遍' : '开始跟读'}</button>`) +
          `<button type="button" class="tlBtn" data-act="next" aria-label="下一句">⏭</button>` +
          `<button type="button" class="tlBtn${ctx.loop ? ' on' : ''}" data-act="loop" title="反复跟读这一句">🔁 单句循环</button>` +
        `</div>` +
      `</div>` +
      `<div class="tlToggles">` +
        `<span class="tlSeg"><span class="tlSegLabel">停顿</span>` +
          GAPS.map(([v, label]) => `<button type="button" class="tlSegBtn${prefs.gap === v ? ' on' : ''}" data-act="gap" data-v="${v}">${label}</button>`).join('') +
        `</span>` +
        toggleHtml('blind', '🙈 盲跟') +
        toggleHtml('zh', '🇨🇳 中文') +
      `</div>` +
      `<details class="tlAll"><summary>全部句子 (${list.length}) — 点一句从那里开始</summary><ol>${sentences}</ol></details>`
    );
  }

  // ---------- shell ----------

  function toggleHtml(key, label) {
    return `<button type="button" class="tlBtn tlToggle${prefs[key] ? ' on' : ''}" data-act="pref" data-key="${key}" aria-pressed="${prefs[key]}">${label}</button>`;
  }

  function render() {
    if (!ctx || !ctx.slot || !ctx.slot.isConnected) return;
    const hasDialog = !!ctx.a.dialog;
    const prevScroll = (ctx.slot.querySelector('.tlScript') || {}).scrollTop || 0;
    ctx.slot.innerHTML =
      `<section class="talaPanel">` +
        `<div class="tlHead">` +
          `<span class="tlTitle">🗣️ 口语练习</span>` +
          (hasDialog
            ? `<span class="tlTabs" role="tablist">` +
                `<button type="button" role="tab" class="tlTab${ctx.mode === 'roleplay' ? ' on' : ''}" data-act="mode" data-mode="roleplay">🎭 角色扮演</button>` +
                `<button type="button" role="tab" class="tlTab${ctx.mode === 'shadow' ? ' on' : ''}" data-act="mode" data-mode="shadow">🗣️ 跟读</button>` +
              `</span>`
            : `<span class="tlTabs"><span class="tlTab on">🗣️ 跟读</span></span>`) +
          `<span class="tlSpacer"></span>` +
          `<span class="tlSeg" title="朗读语速">` +
            RATES.map(([v, label]) => `<button type="button" class="tlSegBtn${prefs.rate === v ? ' on' : ''}" data-act="rate" data-v="${v}">${label}</button>`).join('') +
          `</span>` +
        `</div>` +
        (canSpeak ? '' : `<p class="tlNote">⚠️ 这个浏览器不支持语音合成，听不到朗读；角色扮演仍可逐句手动进行。</p>`) +
        `<div class="tlMain">${ctx.mode === 'roleplay' && hasDialog ? roleplayHtml() : shadowHtml()}</div>` +
      `</section>`;

    // Keep the current line in view inside the script box (no page jump).
    const box = ctx.slot.querySelector('.tlScript');
    if (box) {
      box.scrollTop = prevScroll;
      const cur = box.querySelector('.tlTurn.current') || box.querySelector('.tlDone');
      if (cur) {
        const top = cur.offsetTop - box.clientHeight / 3;
        if (Math.abs(box.scrollTop - top) > 40) box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }
    }
    const curLi = ctx.slot.querySelector('.tlAll[open] li.current');
    if (curLi) curLi.scrollIntoView({ block: 'nearest' });
  }

  // ---------- recording (role-play, your turn) ----------

  async function toggleRec(i) {
    if (rec) { try { rec.mr.stop(); } catch (_e) {} return; }
    const slug = ctx.a.slug;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (_e) {
      window.alert('无法使用麦克风 —— 请在浏览器里允许本页访问麦克风后再试。');
      return;
    }
    if (!ctx || ctx.a.slug !== slug) { stream.getTracks().forEach((t) => t.stop()); return; }
    const mr = new MediaRecorder(stream);
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const session = rec;
      rec = null;
      if (!ctx || !session || ctx.a.slug !== session.slug || !chunks.length) { render(); return; }
      const old = ctx.recs.get(session.i);
      if (old) URL.revokeObjectURL(old);
      ctx.recs.set(session.i, URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })));
      render();
      const au = ctx.slot.querySelector(`audio[data-i="${session.i}"]`);
      if (au) au.play().catch(() => {});
    };
    if (SV) SV.cancel();
    rec = { mr, stream, slug, i };
    mr.start();
    render();
  }

  // ---------- events ----------

  function onClick(e) {
    if (!ctx) return;
    if (e.target.closest('.speakBtn, audio, summary')) return;
    const btn = e.target.closest('[data-act]');
    if (!btn) {
      // Tap a role-play line = (re)start from that line.
      const turn = e.target.closest('.tlTurn');
      if (turn && ctx.role) rpStart(Number(turn.dataset.i));
      return;
    }
    const act = btn.dataset.act;
    const rp = ctx.mode === 'roleplay' && ctx.a.dialog;
    switch (act) {
      case 'mode':
        if (btn.dataset.mode === ctx.mode) return;
        halt(true);
        ctx.mode = btn.dataset.mode; ctx.waiting = false; ctx.done = false;
        render();
        return;
      case 'rate':
        prefs.rate = Number(btn.dataset.v); savePrefs(); render();
        return;
      case 'gap':
        prefs.gap = Number(btn.dataset.v); savePrefs(); render();
        return;
      case 'pref':
        prefs[btn.dataset.key] = !prefs[btn.dataset.key]; savePrefs(); render();
        return;
      case 'role':
        ctx.role = btn.dataset.role; ctx.revealed.clear();
        rpStart(0);   // the tap is the user gesture mobile browsers need before speaking
        return;
      case 'pickRole':
        halt(true);
        ctx.role = null; ctx.idx = 0; ctx.waiting = false; ctx.done = false;
        render();
        return;
      case 'reveal':
        ctx.revealed.add(ctx.idx); render();
        return;
      case 'model': {
        const t = turns()[Number(btn.dataset.i)];
        if (t) say(t.sv);
        return;
      }
      case 'rec':
        toggleRec(Number(btn.dataset.i));
        return;
      case 'loop':
        ctx.loop = !ctx.loop; render();
        return;
      case 'jump':
        shGo(Number(btn.dataset.i), true);
        return;
      case 'prev':
        shGo(ctx.sIdx - 1, ctx.playing);
        return;
      default:
        break;
    }
    if (rp) {
      if (act === 'play') rpStart(ctx.done ? 0 : ctx.idx);
      else if (act === 'pause') { halt(true); ctx.waiting = false; render(); }
      else if (act === 'restart') { ctx.revealed.clear(); rpStart(0); }
      else if (act === 'next') rpNext();
    } else {
      if (act === 'play') shGo(ctx.done ? 0 : ctx.sIdx, true);
      else if (act === 'pause') { halt(true); render(); }
      else if (act === 'next') shGo(ctx.sIdx + 1, ctx.playing);
    }
  }

  // Leaving the page mid-drill: don't let the voice keep talking.
  window.addEventListener('pagehide', () => halt(true));
})();

/* speak.js — 瑞典语点击发声 (click-to-hear pronunciation).
   Uses the browser Web Speech API (SpeechSynthesis) with a sv-SE voice so any
   Swedish word/phrase/sentence in the KB can be heard without storing audio.
   Shared by Sök (查词), Läsning (阅读), Dagbok (闪卡), Lyssna (听力).

   Two uses:
   1. Inline 🔊 control: emit SvSpeak.buttonHtml(text); a delegated click/keyboard
      handler on the document speaks data-speak. The control is a <span role=button>
      (not <button>) so it nests safely inside Sök/Dagbok button rows.
   2. Whole-article / multi-sentence reading: SvSpeak.speakSequence(parts, opts)
      queues each part as its own utterance and reports progress, so callers can
      toggle a 朗读全文 button and stop midway via SvSpeak.cancel(). */

(function () {
  'use strict';

  const synth = window.speechSynthesis;
  const supported = !!synth && typeof window.SpeechSynthesisUtterance === 'function';

  // Voices load asynchronously in most browsers; cache the best Swedish match
  // and refresh it when the list arrives (voiceschanged).
  let svVoice = null;

  // Is this a Swedish voice? Match by BCP-47 lang (sv, sv-SE, sv_SE) or, as a
  // fallback, by a name that mentions Swedish/Sweden (some engines mislabel lang).
  function isSwedish(v) {
    const lang = (v.lang || '').toLowerCase();
    if (lang === 'sv' || lang.startsWith('sv-') || lang.startsWith('sv_')) return true;
    return /\bsvensk|swedish|sweden\b/i.test(v.name || '');
  }
  // Quality score: prefer high-quality neural / cloud voices over the small
  // built-in (eSpeak-ish) ones. Higher = better.
  function voiceScore(v) {
    let s = 0;
    if ((v.lang || '').toLowerCase() === 'sv-se') s += 4;       // exact sv-SE
    if (/neural|natural/i.test(v.name || '')) s += 6;           // MS/Google neural
    if (/google|microsoft/i.test(v.name || '')) s += 3;
    if (v.localService === false) s += 2;                       // cloud voice, usually better
    if (/multilingual/i.test(v.name || '')) s += 1;
    return s;
  }
  function pickVoice() {
    if (!supported) return null;
    const sv = (synth.getVoices() || []).filter(isSwedish);
    sv.sort((a, b) => voiceScore(b) - voiceScore(a));
    svVoice = sv[0] || null;
    return svVoice;
  }
  if (supported) {
    pickVoice();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', pickVoice);
  }

  function makeUtterance(text) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'sv-SE';
    if (!svVoice) pickVoice();
    if (svVoice) u.voice = svVoice;
    u.rate = 0.9; // a touch slower than native — easier to follow when learning
    return u;
  }

  // True only when a real Swedish voice is installed. Without one, setting
  // lang='sv-SE' just makes the browser read Swedish with an ENGLISH voice
  // ("英音瑞典语") — worse than nothing for a learner, so we refuse + hint.
  function hasSwedishVoice() {
    if (!supported) return false;
    if (!svVoice) pickVoice();
    return !!svVoice;
  }

  // One-time, dismissible banner telling the user how to install a Swedish voice.
  // Shown when they tap 🔊 but no sv-SE voice exists. sessionStorage guards it so
  // it doesn't nag on every click within a session.
  function showVoiceHint() {
    try { if (sessionStorage.getItem('svSpeakHintDismissed') === '1') return; } catch (_e) {}
    if (document.querySelector('.svSpeakHint')) return;
    const div = document.createElement('div');
    div.className = 'svSpeakHint';
    div.innerHTML =
      '<div class="svSpeakHintMsg">🔇 没有检测到<b>瑞典语语音</b>，无法朗读（否则会用英语音念瑞典语）。' +
      '请在系统/浏览器里安装一个 sv-SE 语音：<br>' +
      '· <b>Windows</b>：设置 → 时间和语言 → 语言 → 添加「Svenska」并安装语音；推荐用 <b>Edge</b>（自带高质量瑞典语神经语音）。<br>' +
      '· <b>Mac</b>：系统设置 → 辅助功能 → 朗读内容 → 系统语音 → 管理语音 → 添加瑞典语（Alva/Klara）。<br>' +
      '· <b>iPhone/iPad</b>：设置 → 辅助功能 → 朗读内容 → 声音 → 添加「瑞典语」。<br>' +
      '· <b>Android</b>：安装/启用 Google 文字转语音的瑞典语语言包。<br>' +
      '装好后<b>刷新本页</b>即可。</div>' +
      '<button type="button" class="svSpeakHintClose">知道了</button>';
    div.querySelector('.svSpeakHintClose').addEventListener('click', () => {
      try { sessionStorage.setItem('svSpeakHintDismissed', '1'); } catch (_e) {}
      div.remove();
    });
    document.body.appendChild(div);
  }

  // Speak one short item (a word / phrase). Cancels anything in flight so rapid
  // taps don't pile up. Refuses (and hints) when no real Swedish voice exists.
  function speak(text) {
    const t = (text || '').trim();
    if (!t || !supported) return false;
    if (!hasSwedishVoice()) { showVoiceHint(); return false; }
    try {
      synth.cancel();
      synth.speak(makeUtterance(t));
      return true;
    } catch (_e) {
      return false;
    }
  }

  // A monotonic token: every speak()/speakSequence()/cancel() bumps it so a stale
  // sequence's onend/onboundary callbacks become no-ops after the user moves on.
  let runToken = 0;
  function cancel() {
    runToken += 1;
    if (supported) { try { synth.cancel(); } catch (_e) {} }
  }

  // Queue `parts` (array of strings) as sequential utterances. Returns false if
  // unsupported / empty. opts: { onpart(i), onend(), onerror() }.
  function speakSequence(parts, opts) {
    const list = (parts || []).map((s) => (s || '').trim()).filter(Boolean);
    if (!list.length || !supported) return false;
    if (!hasSwedishVoice()) { showVoiceHint(); return false; }
    cancel();                 // stop anything already playing, bump token
    const token = runToken;   // capture; if it changes, abandon this run
    let i = 0;
    const o = opts || {};
    function next() {
      if (token !== runToken) return;        // superseded by a newer call
      if (i >= list.length) { if (o.onend) o.onend(); return; }
      const idx = i;
      const u = makeUtterance(list[i]);
      u.onstart = () => { if (token === runToken && o.onpart) o.onpart(idx); };
      u.onend = () => { if (token === runToken) { i += 1; next(); } };
      u.onerror = () => {
        if (token !== runToken) return;
        // 'interrupted'/'canceled' fire on a normal stop — don't treat as failure.
        i += 1; next();
      };
      try { synth.speak(u); } catch (_e) { if (o.onerror) o.onerror(); }
    }
    next();
    return true;
  }

  function isSpeaking() {
    return supported && (synth.speaking || synth.pending);
  }

  // Return the markup for an inline 🔊 control. `text` is the Swedish word/phrase
  // to pronounce; `cls` lets each site add its own positioning class.
  // It's a <span role="button">, NOT a <button>: in Sök/Dagbok the control sits
  // inside a <button> row, and nesting real buttons is invalid HTML (the parser
  // would hoist the inner one out). A span nests safely everywhere.
  function buttonHtml(text, cls) {
    const safe = String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const klass = 'speakBtn' + (cls ? ' ' + cls : '');
    return `<span class="${klass}" role="button" tabindex="0" data-speak="${safe}" title="朗读发音" aria-label="朗读发音 (sv-SE)">🔊</span>`;
  }

  function trigger(el, e) {
    e.preventDefault();
    e.stopPropagation();
    const ok = speak(el.getAttribute('data-speak'));
    if (ok) {
      el.classList.add('speaking');
      setTimeout(() => el.classList.remove('speaking'), 600);
    }
  }

  // One delegated listener handles every .speakBtn on the page, including those
  // injected later into popovers / detail panes. Capture phase + stopPropagation
  // so a speak tap inside a result row / glossary chip / flashcard doesn't also
  // trigger that element's own handler (open note, flip card, …).
  document.addEventListener('click', function (e) {
    const el = e.target.closest && e.target.closest('.speakBtn');
    if (el) trigger(el, e);
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    const el = e.target.closest && e.target.closest('.speakBtn');
    if (el) trigger(el, e);
  }, true);

  window.SvSpeak = { speak, speakSequence, cancel, isSpeaking, buttonHtml, supported, hasSwedishVoice };
})();

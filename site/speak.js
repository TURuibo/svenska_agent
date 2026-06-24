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
  function pickVoice() {
    if (!supported) return null;
    const voices = synth.getVoices() || [];
    svVoice =
      voices.find((v) => /^sv[-_]SE$/i.test(v.lang)) ||
      voices.find((v) => /^sv\b/i.test(v.lang) || /^sv[-_]/i.test(v.lang)) ||
      null;
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

  // Speak one short item (a word / phrase). Cancels anything in flight so rapid
  // taps don't pile up.
  function speak(text) {
    const t = (text || '').trim();
    if (!t || !supported) return false;
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

  window.SvSpeak = { speak, speakSequence, cancel, isSpeaking, buttonHtml, supported };
})();

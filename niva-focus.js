/* 🪜 Nivå's current level, for the pages that follow it (Läsning · Tala · Lyssna · Öva · Kurs · Dagbok).
 *
 *   NivaFocus.get()        → 'A1' | 'A2' | 'B1' | 'B2' | ''   — the level set with 📌 in site/niva/
 *   NivaFocus.home(raw)    → home level of a CEFR string ("A2–B1" → 'A2', "SFI B / CEFR A2" → 'A2', C1 → 'B2')
 *   NivaFocus.label(lv)    → 'B2+' for B2, else lv
 *   NivaFocus.summary()    → { lv, pct, next:{ t, href }, … } that Nivå leaves for Dagbok, or null
 *
 * Read-only: only site/niva/ writes niva.state.v1. The parsing rules are the same as tools/level-lib.js
 * (site/niva/SPEC.md §4.1) — keep the two in step. */
(function () {
  'use strict';

  var LEVELS = ['A1', 'A2', 'B1', 'B2'];
  var RANK = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
  var BY_RANK = ['', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  var SFI = { A: 'A1', B: 'A2', C: 'A2', D: 'B1' };   // lower end of each SFI course

  function state() {
    try {
      var o = JSON.parse(localStorage.getItem('niva.state.v1') || 'null');
      return o && typeof o === 'object' ? o : {};
    } catch (_e) { return {}; }
  }

  function home(raw) {
    var s = String(raw == null ? '' : raw);
    if (!s.trim()) return '';
    var at = s.search(/CEFR/i);
    var toks = (at >= 0 ? s.slice(at + 4) : s).match(/[ABC][12]/g);
    var lo = '';
    if (toks && toks.length) {
      var r = 9;
      for (var i = 0; i < toks.length; i++) r = Math.min(r, RANK[toks[i]]);
      lo = BY_RANK[r];
    } else {
      var m = s.match(/SFI\s*([A-D])\b/i);
      if (m) lo = SFI[m[1].toUpperCase()];
    }
    if (!lo) return '';
    return RANK[lo] >= 4 ? 'B2' : lo;
  }

  window.NivaFocus = {
    LEVELS: LEVELS,
    get: function () { var f = state().focus; return LEVELS.indexOf(f) >= 0 ? f : ''; },
    home: home,
    label: function (lv) { return lv === 'B2' ? 'B2+' : lv; },
    summary: function () { var s = state().summary; return s && typeof s === 'object' && s.lv ? s : null; },
  };
})();

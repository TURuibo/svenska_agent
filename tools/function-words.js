'use strict';
// Function words (articles, pronouns, particles, the commonest prepositions /
// conjunctions) that leak into word notes' "## 语法变形 (Forms)" tables as padding:
// "en/ett öl" → en, "den/det allergiska" → den, "gå in / ut" → in, "Reflexiv | sig"
// (hen) → sig, "5:e" (femte) → e. Emitted as a surface form they turn every "en"
// in a text into a link to öl, so a function word may only be a form of a note
// whose lemma is that word itself (or the head of its own small paradigm, e.g.
// mig → jag, ett → en, if such notes are ever added).
//
// Shared by tools/build-kb-site.js (kb-index forms → Sök, Flöde),
// tools/build-reading-site.js (reading-data vocab → Läsning, Tala) and
// tools/build-kurs-data.js (Kurs).
//
// Deliberately NOT listed: real irregular forms that look like function words —
// är/var (vara), har/hade (ha), blir/blev (bli), mer/mest (mycket), kan (kunna) …

const OWNERS = {
  en: ['en'], ett: ['ett', 'en'],
  den: ['den'], det: ['det', 'den'], de: ['de', 'den'],
  e: [],
  in: ['in'], ut: ['ut'],
  sig: ['sig'], mig: ['mig', 'jag'], dig: ['dig', 'du'], oss: ['oss', 'vi'], er: ['er', 'ni'],
  att: ['att'], och: ['och'], i: ['i'], på: ['på'], för: ['för'], om: ['om'], av: ['av'],
  till: ['till'], med: ['med'], som: ['som'], mot: ['mot'],
  han: ['han'], hon: ['hon'], jag: ['jag'], du: ['du'], vi: ['vi'], ni: ['ni'], man: ['man'],
};

const FUNCTION_WORDS = new Set(Object.keys(OWNERS));

// True when `form` is a function word that must NOT be indexed as a surface form
// of the note with this lemma.
function isForeignFunctionWord(form, lemma) {
  const k = String(form || '').trim().toLowerCase();
  if (!FUNCTION_WORDS.has(k)) return false;
  const l = String(lemma || '').trim().toLowerCase();
  return !OWNERS[k].includes(l);
}

module.exports = { FUNCTION_WORDS, isForeignFunctionWord };

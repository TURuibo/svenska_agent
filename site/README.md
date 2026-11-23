# Swedish learning site (multi-page)

Static, dependency-free site for the local Swedish markdown knowledge base. Nine pages share one
palette (`styles.css`), one navigation component (`nav.js`), and a small set of **shared KB
modules**:

- `kb-index.js` — light, eager dataset: per-note metadata + a compact search key (no bodies).
  Loaded by every page; ~0.3 MB gzip.
- `kb-bodies.js` — full note bodies + links/backlinks, **loaded lazily** (only when a note is
  opened) by `kb-store.js`.
- `kb-store.js` — `window.KB`: data access, search (`KB.search`), lazy bodies (`KB.body`), and a
  shared in-place note popover (`KB.openNote`) used across pages.
- `kb-markdown.js` — `window.KBMarkdown`: the single Markdown→HTML renderer (was copy-pasted in four
  pages).
- `kb-popover.css` — styles for the shared `KB.openNote` popover.
- `read-sync.js` — `window.ReadSync`: the 「标为已读」 marks of Läsning / Tala / Lyssna, pushed to
  `read-log.json` on the `read-log` branch (needs a token per device, via the ☁️ button). The
  scheduled routines pause when nothing was marked read for 48 h (CLAUDE.md §4.9). localStorage is
  its source of truth — every change re-reads it, so tabs / bfcache-restored pages don't clobber each other.

> These replace the old single `kb-data.js` (an 8.9 MB blocking blob that made several pages slow to
> open). Splitting metadata from bodies cut first-load weight by ~4× and made every note body lazy.

Public GitHub Pages URL (lands on **Dagbok**, the home page):

```text
https://turuibo.github.io/svenska_agent/
```

## Pages & layout

| Page | Path | What it's for |
|------|------|----------------|
| **Dagbok** 📅 | `site/index.html` (`/`) | Home — slim daily index: what was read / listened / looked up each day, linking out |
| **Nivå** 🪜 | `site/niva/` | Everything at one CEFR level on one page (grammar, words, phrases, reading, scenarios, listening, lessons), easiest first, with progress — see [Nivå](#nivå-by-level) |
| **Flöde** 🌊 | `site/flode/` | Phone-first card feed for spare minutes (☀️ daytime); installable PWA — see [Flöde](#flöde-feed) |
| **Kurs** 📘 | `site/kurs/` | Phone-first textbook study: one paragraph = one session (读 → 拆 → 词 → 练), resumable — see [Kurs](#kurs-textbook-study) |
| **Läsning** 📖 | `site/reading/` | Read articles / news / drills with toggleable 🇨🇳 translation |
| **Tala** 🗣️ | `site/tala/` | Speaking: the scenarios, with 🎭 dialog role-play and 🗣️ shadowing |
| **Lyssna** 🎧 | `site/listening/` | SVT easy-Swedish listening with synced bilingual transcript |
| **Skriva** ✍️ | `site/skriva/` | The writing column: per genre a skeleton with phrases, model texts taken apart, two drills, writing tasks with an editor, and the corrected texts — see [Skriva](#skriva-writing) |
| **Öva** 🔁 | `site/ova/` | Multiple-choice vocabulary review (🎯 gap words / recent / all) with spaced repetition. **No nav tab** since 2026-11-15 (Flöde covers quick review); reached from Läsning's / Dagbok's 🔁 去复习 links, and still where 📋 复制结果给 CC → `/ova` lives |
| **Former** 📐 | `site/forms/` | Word forms grouped by 词性 / date |
| **Sök** 🔍 | `site/sok/` | Dictionary / full-text search tool (formerly the home page) |

## Navigation (`nav.js`)

Every page sets `<body data-site="…">` and loads `nav.js`, which injects one consistent nav so you
can jump between the pages from any page: ten tabs (Öva has no tab; the Flöde page itself is an immersive, nav-less
feed and does not load `nav.js`). On desktop it's a slim sticky **top bar**; on
phones it becomes a fixed **bottom tab bar** (icon + label, current page highlighted; the tabs fit one
row at 360 px — 34 px each — thanks to a smaller label under 400 px). Add a new
destination once, in `nav.js`'s `DEST` list — never per page.

## Cache-busting (`?v=N`)

Static code assets (`styles.css`, `nav.js`, each page's `*.css` / `*.js`) are referenced with a
`?v=N` query, e.g. `styles.css?v=4`. **When you edit any of those files, bump the number** (same `N`
across all pages) so browsers fetch the new copy instead of a stale cached one — important since the
site is used on both laptop and phone. Generated data files (`kb-index.js`, `kb-bodies.js`,
`reading-data.js`, `listening-data.js`, `flode/flode-data.js`, `niva/niva-data.js`, `skriva/skriva-data.js`) are intentionally left unversioned: the daily routines
regenerate them, and a frozen `?v` would hide fresh data.

## Sök (search tool)

`site/sok/` is a **command-palette style, search-first** page: a centered search box, nothing listed
until you type (or pick a type pill), then a compact ranked result list; selecting a result renders
the full note. Exact lemma / inflected-form matches rank to the top (dictionary behaviour); results
highlight matched terms. Selecting a note shows its full markdown body — fenced code blocks (grammar
diagrams), tables, ordered/nested lists, blockquotes — plus a **backlinks / "linked from"** panel and
a forward-links list that flags broken targets. The body loads lazily via `KB.body`. Each note is
deep-linkable via `#note=<slug>`; the **Back** button retraces wikilink trails; keyboard shortcuts
work (`/` or `Ctrl/Cmd-K` to focus search, ↑/↓ to move, Enter to open, Esc to back/clear). Other
pages link in as `…/sok/#note=<slug>`, or open notes inline via the shared `KB.openNote` popover.

## Nivå (by level)

`site/niva/` answers "show me everything at A1, then A2 …" (CLAUDE.md §4.12; full design in
[`niva/SPEC.md`](niva/SPEC.md)). Dagbok indexes the material by **date**; Nivå indexes the same material by
**level**. It never copies content: every row links to the page where the material lives.

- **Ladder** (`#`): one card per level — A1 ≈ SFI A · A2 ≈ SFI B · B1 ≈ SFI D · B2+ — with the counts per
  section and a progress ring; 「▶ 继续上次」 reopens the last level / section.
- **Level page** (`#lv=A2&sec=read`): seven section tabs, each in a fixed order —

  | Section | Order | Links to | 「完成」 |
  |---|---|---|---|
  | 📗 语法 | 核心 = the syllabus `profile/niva-syllabus.md` in teaching order, then 常用 → 细节 (by how many notes / articles link the point) | Sök note | ○ toggle 「学过」 (local) |
  | 🔤 单词 | grouped by topic (biggest first), common words first (Kelly rank) | Sök note | `known: true`, Öva box ≥ 4, or Flöde 「😎 会了」 |
  | 🧩 词组 | grouped by kind (partikelverb, 介词短语 …) | Sök note | `known: true` or Flöde 「😎 会了」 |
  | 📖 阅读 / 🗣️ 情景 | easiest first (difficulty 1–5 within the level), 📐 drills and 🌉 ranges in their own groups | Läsning / Tala | 标为已读 |
  | 🎧 听力 | episodes with subtitles first; 📖 opens the text version | Lyssna | 标为已读 |
  | 📘 课文 | textbook lessons with a 逐段精读 guide | Kurs | all paragraphs done, or 标为已读 |

  Level progress = mean completion of the sections that have material at that level. The page also shows how
  many example sentences the level has and links 🔤 to `../ova/#deck=all&level=<lv>`.
- **Studying a level (P1)** — all of it in a layer over the page (✕ / Back closes it):

  | Feature | What happens |
  |---|---|
  | 📌 当前级别 | Set on a level page; the ladder shows it on top with its progress and ▶ 下一步, and the other pages follow it (below) |
  | ▶ 过一遍 (`#lv=A2&run=words&g=<topic>`) | Flip cards per topic group (or `g=*`): think of the meaning, flip (IPA, en, forms, example, 🔊), then 😎 会 / 🤔 不会. 会 → counts as known here and mutes the word in Flöde; 不会 → due today in Öva. ↩ 撤销, keyboard (space / ← / → / Backspace), resumable. Phrases work the same (no Öva) |
  | ▶ 下一步 | One suggestion at a time: the unfinished run, else whichever pass condition lags most (core grammar / a word group / the easiest unread text), then the self-test, listening, lessons, phrases |
  | 🏁 自测 (`#lv=A2&test=1`) | 20 questions from the level: 8 sv→zh · 4 zh→sv · 3 en/ett · 5 sentence cloze; answers go into `ova.state.v1` |
  | 🧭 定级 (`#place=A1`) | The same test from A1 up: ≥ 90 % marks the level 「✅ 定级通过」 and offers the next; below that, the level becomes the current one |
  | 🏁 通关 | Words 会 ≥ 80 % · core grammar all + all grammar ≥ 70 % · half the (non-bridge) texts read · self-test ≥ 80 % → 「✅ 已通关」 and 「进入 B1」; never locks a level |
  | 📋 复制结果给 CC | An `ova-results v1` block: Öva's rows + `- lemma \| slug x \| known \| date` + `level: A1 \| test 18/20 \| passed \| date`; `/ova` (`tools/ova-sync.js`) sets `known: true`, fills 已掌握 and adds 评估历史 rows in `profile/level.md` |

- **Following the current level**: `site/niva-focus.js` (`NivaFocus.get()` / `home(cefr)` / `summary()`, same level rules
  as `tools/level-lib.js`). Läsning and Tala get a 级别 dropdown (easiest first when a level is chosen), Lyssna a 级别
  dropdown over the episode list, Kurs level chips, Öva's level select defaults to it, and Dagbok shows a 🪜 card
  (level, progress, ▶ 下一步) from the summary Nivå leaves in `niva.state.v1`. A level picked on a page lasts for that
  tab only; without a current level every page behaves as before. **P2:** Flöde's 🆕 lane serves only the current
  level (then the next one), everything else ≤ it except due Öva reviews (⚙︎ 「🪜 跟随当前级别」, on by default, shows
  「🪜 A2」 in the top bar); Sök gets a row of level pills under the type pills (default 全部, 📌 marks the current level).
  Both read the build-time `lv` in `kb-index.js` / `flode-data.js`.
- **P2 extras on the level page**:

  | Feature | What happens |
  |---|---|
  | 🎯 可读度 (i+1) | Each 阅读 / 情景 row shows 「认识 N%」 — the share of its words *he* knows (closed-class words + names, words he marked 会 / known / Öva box ≥ 4, every word of a level he has passed). 90–98 % is the i+1 band: a 「🎯 最适合你」 group lists the 3 best unread texts, and ▶ 下一步 picks the best one. Switched on once ≥ 100 words count as known. Data: `niva/data/<level>-texts.js` (token counts per text, 11–95 KB) |
  | 缺材料 | A section with fewer than 10 texts of its own level (bridges and drills don't count), or no listening, ends with copyable commands: `/dagens-artikel <LV> 1\|3\|4` for 阅读, `/scenario dialog\|text\|story <LV> <topic>` for 情景 / 听力 (topics = where he has the most words left). B2 gets a note instead (the generators stop at B1) |
- **Levels** come from one rule set, `tools/level-lib.js` (SPEC §4): CEFR from `cefr` / `level` / the 「级别:」 line /
  the article's `CEFR 估计` line; a range (A2–B1) lives at the end of its lower level as 🌉 bridge material;
  phrases without a level get the level of their hardest head word (shown as ≈); texts without one get a level
  from their vocabulary. `build-kb-site.js` writes the same result into `kb-index.js` (`lv`, plus `lvInf: 1` when
  inferred) and lets the grammar syllabus override grammar levels, so Nivå, Sök and Flöde always agree.
- **Text difficulty** (`build-reading-site.js`, new `reading-data.js` fields `lv` / `lvHi` / `lvInf` / `lix` / `n` /
  `over` / `d` / `up`): LIX + the share of words above the text's level, as a percentile within the level and
  page; ⬆ 偏难 = more than 1 word in 10 above the top of the text's declared level.
- **Back links**: rows open Läsning / Tala / Lyssna / Kurs with `&from=<Nivå hash>&frompage=niva`, which shows
  「← 返回 Nivå」 there and lands back on the same row.
- **Data**: `niva/niva-data.js` (~0.8 MB raw, ~170 KB gzip) plus one `niva/data/<level>.js` per level (en / IPA / forms /
  examples / cloze sentences, 55–375 KB, loaded only by 过一遍 and 自测) and one `niva/data/<level>-texts.js` (🎯 可读度,
  loaded by the 阅读 / 情景 sections and ▶ 下一步), all from `tools/build-niva-data.js`, run after
  `build-reading-site.js`; gitignored, built by the Action. The page loads only those, `../speak.js` and `../read-sync.js`.
- **localStorage**: `niva.state.v1` (current level, grammar 「学过」, 会 / 不会 marks, tests, passes, the unfinished run, last
  level / section, filters, the Dagbok summary). Writes `ova.state.v1` (不会 + test answers, Öva's own rules) and
  `flode.state.v1`'s `mute` (会); reads `kurs.state.v1` and ReadSync. Nivå does not count as §4.9 activity.

## Skriva (writing)

`site/skriva/` is the **writing column** (CLAUDE.md §4.13; full design and file formats in
[`skriva/SPEC.md`](skriva/SPEC.md)). Läsning and Kurs treat a model text as something to read; Skriva looks at the
same text as a writer: what each part is doing, which phrases can be reused, and how to write one's own.

| View | What it does |
|---|---|
| Home (`#`) | One card per genre (💌 informellt brev · 🏛️ formellt brev · 📝 text om ett ämne) with progress, 📂 我的作文 and the most frequent error types |
| 🧱 骨架 (`#g=<key>&tab=mall`) | The genre from top to bottom: every part of the skeleton says what goes there and lists its phrases (🔊); letters also show a formal / informal comparison |
| 📄 范文 (`#g=<key>&t=<slug>`) | A model text taken apart: the task, then each block coloured by skeleton part with a line on what the writer is doing, reusable phrases underlined (tap → 中文 + usage); toggles 🏷️ 结构 · 🖍️ 句型 · 🇨🇳 翻译; ✓ 标为已读 is the same mark as Läsning |
| 🧩 练习 | Generated from the annotations, no extra content: **排结构** (reorder the shuffled blocks; judged by skeleton part) and **填句型** (six gaps, four options each, distractors from other parts of the skeleton) |
| ✍️ 写 (`#g=<key>&u=U1`) | A writing task: situation + requirements to tick, skeleton hints whose phrases drop into the text at the cursor, an autosaving editor with a word count, a checklist, and 📋 复制给 CC 批改 |
| 📂 我的作文 (`#mina`) | Texts corrected by `/skriva`: corrections sentence by sentence with an error type, the corrected text, the original, how the task was met, and a summary |

- **Content** lives in `skriva/<genre>.md` (skeleton + phrases, annotations of the model texts, tasks, checklist) and
  `skriva/texter/*.md` (corrected texts). The model texts themselves stay in `imported/`. Adding a genre = adding a file.
- **Data**: `tools/build-skriva-data.js` → `skriva/skriva-data.js` (gitignored, built by the Action). `--check` validates the
  genre files (skeleton numbering, every model-text row against its block, block counts of text and translation,
  required task fields) and lists the phrases that occur in no model text.
- **localStorage**: `skriva.state.v1` (drafts, ticked requirements / checklist items, drill results, view toggles, last
  tab). Drafts stay on the device; a text reaches the repo only through 📋 → `/skriva`.

## Flöde (feed)

`site/flode/` is the **daytime** half of the loop (CLAUDE.md §4.10; full design in
[`flode/SPEC.md`](flode/SPEC.md)): a vertical, snap-scrolling feed of 5–20 s cards cut from the same
KB, for spare minutes on the phone. The other pages stay the place to study properly at night.

| Card | What |
|------|------|
| `word` / `phrase` | Headword + IPA; tap → meaning, Förklaring, example; 😎 会了 / 🤔 再看看 |
| `quiz` / `cloze` / `enett` / `pairs` | Objective cards: choose the meaning, fill the gap, en/ett, match 4 pairs |
| `sentence` / `listen` | A sentence (tap → 中文); blind-listen version reads it aloud first |
| `grammar` | A rule in one line + 1–2 examples |
| `news` / `dialog` / `teaser` | Bites of 8 Sidor news, chat-bubble dialogues, article teasers (→ 🌙 read tonight) |
| `stat` | Summary card every 10 cards |

- **State** is per device (`localStorage`): `ova.state.v1` is **shared with Öva** (Flöde's objective
  answers feed the same Leitner boxes, so `/ova` covers them); `flode.state.v1` holds seen / unsure /
  muted, the 🌙 `tonight` list, per-day counts, the daily goal and prefs. Dagbok's **🌙 今晚细看**
  panel reads `flode.state.v1` (summary line + the `tonight` list with ✓ / 清空).
- **Data**: `flode/flode-data.js` (≤ 3.2 MB raw, about 1 MB gzipped) is built by `tools/build-flode-data.js` from the other
  generated data files (run it after them); gitignored, produced by the Action. The page loads only
  `../styles.css`, `../speak.js` and that file — none of the heavy KB data (`kb-index.js`, `kb-bodies.js`,
  `reading-data.js`).
- **PWA**: `manifest.webmanifest` (`start_url ./`, `scope ../`, standalone) + icons (`icon-192/512.png`,
  `icon-maskable-512.png`, `apple-touch-icon.png`). `flode/sw.js` (scope `flode/` only) does
  stale-while-revalidate for the page's same-origin GETs (`?v=N` variants share one cache slot) and serves
  the cached `index.html` offline; other pages are never touched. Bump `CACHE_VERSION` to flush it.
- Flöde does **not** count as activity for the §4.9 gate — only 「标为已读」 does.

## Läsning (reading)

`site/reading/` lists every news / article / adjsubst source (scenarios live in **Tala**, below) and reads it with a
toggleable 🇨🇳 translation. Because the page is fully static (no backend, can't reach Claude Code),
the toolbar offers an **in-page glossary** plus a "queue a command, paste it back into CC" bridge
(persisted in `localStorage`, the toolbar button shows a count):

| Toolbar | What it does | Bridge back to CC |
|---------|--------------|-------------------|
| **🔤 生词** | Highlight every word that already has a `knowledge_base/words/*.md` note (incl. inflected forms, e.g. `arbetade`→`arbeta`); tap → in-page gloss card. | — (read-only) |
| **🔍 查词** | Also make un-highlighted words tappable; tapping opens a **read-only** search of the in-memory `vocab` (does the KB already have this word, and what does it mean?). | — (opens the lookup card) |
| **📥 想学** | When a tapped word is **not in the KB at all** → "➕ 想学" / "📋 复制 /learn" queues it. | Copy → run `/learn a, b, c`; CC does the real lookup (swedish-dictionary + web) and stores it. |

> The old **🔗 链接清单 / `/link-forms`** action (manually link a surface form to an existing KB word)
> was removed on 2026-06-24.

After running the command in CC and `/sync`-ing, the next site rebuild turns those words into normal
clickable KB vocab here. The 📥 want-to-learn queue stores the **tapped surface form** (`/learn`
lemmatizes on import). See CLAUDE.md §4.2 for the full flow.

**Filters (2026-10-02):** 题材 (genre: 论述 · 书信 · 说明文 · 新闻 · 政府信息 · 课文 · 词形练习 …) and 主题
(topic code T01–T21 from `profile/vocab-gaps.json`) dropdowns, plus **🎯 补弱项**. New texts declare
them in `**题材:** / **主题:**` lines; older files get a genre (and, where unambiguous, a topic) from
their filename prefix in `tools/build-reading-site.js`. `scenario-<date>-fokus-*` (gap-targeted texts)
and `myndighet-*` (/lattlast) are shown here, not in Tala. A text with a `**目标词:**` line gets a
**🎯 本篇目标词** panel (✓ = already imported, chip opens the note) and its target words highlighted in
the Swedish original. `#focus=1` opens the list pre-filtered to 🎯 texts.

## Tala (speaking)

`site/tala/` is the 口语 page for every `scenario-*` text (moved out of Läsning on 2026-10-02). It is
the **same engine** as Läsning — `tala/index.html` loads `../reading/reading.js` and
`../reading/reading-data.js` with `<body data-site="tala">`, so the list, search, 已读 marker, glossary,
🔍 查词 / 📥 想学 and 学习项 panel all behave identically — but it lists only scenarios, filters by
sub-genre (💬 对话 / ✉️ 文本 / 📖 故事 = the article's `form`), and leaves a `#practiceSlot` above the
text that `tala/tala.js` fills on the `reading:open` event:

| Drill | For | How it works |
|-------|-----|--------------|
| 🎭 角色扮演 | dialogs (`a.dialog`) | Pick a role. The sv-SE voice reads the other speakers; on your lines it stops, blurs your Swedish and shows only the 中文 cue. Say it aloud, then 👀 看原文 / 🔊 听示范 / 🎙️ 录音对比 (MediaRecorder, in-memory only) → 继续. Tap any line to start from it; 🎧 只听全文 plays everything. |
| 🗣️ 跟读 | every scenario | One sentence at a time: hear it, then a pause sized to the sentence (短/中/长) to repeat it; 🔁 单句循环, 🙈 盲跟 (text hidden while listening). |

Speech rate (慢 0.7 / 中速 0.85 / 常速 1.0) and the toggles persist in `localStorage` (`tala.prefs.v1`).
Speaker turns and their line-by-line 中文 are parsed at build time by `parseDialog()` in
`tools/build-reading-site.js` (handles `**Emma:**`, `Receptionist (R):` → `R:`, `A (servitör):`, and
dialog-pack 🇸🇪 / 🇨🇳 fenced blocks); the 中文 is attached only when both sides have the same number of
turns. Old `reading/#article=scenario-…` links redirect to Tala (and vice versa), so Former / Lyssna /
bookmarks keep working.

## Kurs (textbook study)

`site/kurs/` turns the textbook articles that carry a `## 🔍 逐段精读` guide (`imported/*.md`, written per
`.claude/skills/sv-study-guide`) into a phone-first course. Design authority: `site/kurs/SPEC.md`.

- **Four steps per paragraph**: ① 读 (whole paragraph, tappable words) → ② 拆 (one sentence per page: 📐 structure
  blocks, ⚠️ point cards, translation hidden by default) → ③ 词 (phrases + vocab; tap for the full word card) →
  ④ 练 (5–8 questions built from that paragraph). The position (lesson / paragraph / step / sentence) is saved on
  every page turn, so the home page always offers 「继续上次」.
- **Data**: `node tools/build-kurs-data.js` writes `site/kurs/kurs-index.js` and one `site/kurs/data/<slug>.js`
  per lesson (both gitignored, built by the Action). `node tools/build-kurs-data.js --check` reconciles every
  line of each guide against the parsed fields and exits non-zero on a mismatch — run it after writing or
  editing a 逐段精读. The page loads **none** of the heavy KB data files (`kb-index.js` / `kb-bodies.js` /
  `reading-data.js`); lesson files are inserted on demand.
- **localStorage**: `kurs.state.v1` (progress, ⭐ marks, prefs) and the shared `ova.state.v1` (quiz right/wrong
  feed the same spaced-repetition state as Öva / Flöde).
- **标为已读** is the same `ReadSync` mark as Läsning's, so it counts as activity for the §4.9 gate.
- **Entry from Läsning**: articles whose body contains the `🔍 逐段精读` heading show 「📘 在手机上精读 →」
  (→ `../kurs/#l=<slug>`); Tala never does.
- **Offline**: `kurs/sw.js` (scope `kurs/` only, no manifest) is stale-while-revalidate for same-origin GETs,
  cache `kurs-v<N>` keyed without `?v=`; cross-origin and non-GET requests (read-sync) pass straight through.

## Öva (review)

Multiple-choice review over the KB word notes (`kb-index.js`). Decks: **🎯 补弱项** — gap words from
the 2026-10-02 vocabulary analysis that now have a KB note (`vocab-progress.js` → `learned`),
**🆕 最近新词** (created in the last 21 days) and **📚 全部**, with an optional CEFR filter.

| Leitner box | Question |
|-------------|----------|
| 0–1 | ① 看瑞典语选中文 (sv → zh) |
| 2–3 | ② 看中文选瑞典语 (zh → sv) |
| 4+  | ③ 句子选词 — cloze from a KB sentence note (options are lemmas); falls back to ② |

Distractors share the word class and preferably a topic / CEFR level, and never overlap the answer's
Chinese gloss (so `jobba` is never a wrong option for `arbeta`). Right → next box (due in 1 / 2 / 4 / 7 /
14 / 30 days); wrong → box 0 and asked again later in the round. Keys: `1`–`4`, `Enter`.
Progress is per device (`localStorage`, `ova.state.v1`); **📋 复制结果给 CC** copies an
`ova-results v1` block of cumulative counts, and `/ova` (→ `tools/ova-sync.js`) writes it into the
notes' `reviewed` / `review_count` / `interval` / `ease` and marks well-known words `known: true`.

## Dagbok (home)

A slim **entry page**: "what did I practise on day X?" — one card per active day (newest first,
grouped by month), each with up to five rows that link straight to where the material lives:

| Row | From | Links to |
|-----|------|----------|
| 📖 阅读 | `imported/` articles (date = import date) | `reading/#article=…&frompage=recap` (+ 🎧 when the article has audio) |
| 🗣️ 口语 | `imported/scenario-*` (date = import date) | `tala/#article=…&frompage=recap` |
| 🎧 听力 | `listening/*.json` episodes not already shown as an article's 🎧 | `listening/#ep=…&frompage=recap` |
| 🔍 查词 | KB items created that day that no source / same-day article claims | `sok/#note=<slug>` per chip |
| 📝 来源 | older `sources/` notes with no readable article | `sok/#note=source-…` |

Long rows collapse to the first few entries behind "+N ▾"; days older than ~30 days sit behind
"显示更早". The header shows one line: 🔥 streak · active days this week. Läsning and Lyssna both
offer "← 返回 Dagbok" (so does Tala), which lands back on `#day-YYYY-MM-DD`. (Stats, heatmap, filters, the peek
panel and flashcards were removed 2026-10-02.)

The page loads only `site/dagbok-data.js` (~80 KB), built by `tools/build-dagbok-data.js` from the
other three generated data files — run it **after** them (the Action does).

At the very top, **🌙 今晚细看** (in `dagbok.js`) shows Flöde's daytime summary (cards today / goal, 答对, 🔥 streak
of days with ≥ 10 cards) and the list of things saved with 🌙 in Flöde — each links to Sök / Läsning / Tala, ✓
removes it, 清空 clears all. It is rendered from `localStorage['flode.state.v1']` only (nothing if Flöde was never
used) and writes touch just `tonight`.

Above the days, **📊 词汇进度** (`vocab-card.js`, data `site/vocab-progress.js` from
`tools/vocab-progress.js`) shows SVALex-core coverage A1/A2/B1 against the 2026-10-02 baseline, how many
P1/P2 gap words are done, the themes with the most P1 words left, and links to 🎯 texts / Öva / the gap list.

The old `/recap/` URL now redirects here. Dark mode follows the OS setting on every page.

`knowledge_base/` remains the source of truth; `site/kb-index.js` + `site/kb-bodies.js` are generated
from those markdown files (backlinks computed at build time). Serve the folder or open
`site/index.html` directly — no build needed to view; only re-run the generator below after editing
KB notes.

Regenerate the searchable data after adding or editing KB notes:

```bash
node tools/build-kb-site.js
# full local preview of every page (all gitignored):
node tools/build-reading-site.js && node tools/build-listening-site.js && node tools/build-dagbok-data.js
node tools/build-niva-data.js   # 🪜 Nivå — after build-reading-site.js
node tools/build-skriva-data.js # ✍️ Skriva — independent of the others (add --check to validate skriva/*.md)
```

Publish the refreshed site to GitHub Pages:

```powershell
git add site
git commit -m "Update KB viewer data"
git push
$sha = git subtree split --prefix site main
git push origin "$sha`:refs/heads/gh-pages"
```

GitHub Pages serves the `gh-pages` branch. The branch is generated from the `site/` folder with
`git subtree split`, so the web root is `site/index.html` without an extra `/site/` path segment.

The GitHub Actions workflow `.github/workflows/kb-site.yml` also regenerates and publishes the viewer on every `main` push that touches the KB/site tooling, once per day, and on manual dispatch.

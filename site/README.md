# Swedish learning site (multi-page)

Static, dependency-free site for the local Swedish markdown knowledge base. Five pages share one
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
| **Läsning** 📖 | `site/reading/` | Read scenarios / articles with toggleable 🇨🇳 translation |
| **Lyssna** 🎧 | `site/listening/` | SVT easy-Swedish listening with synced bilingual transcript |
| **Former** 📐 | `site/forms/` | Word forms grouped by 词性 / date |
| **Sök** 🔍 | `site/sok/` | Dictionary / full-text search tool (formerly the home page) |

## Navigation (`nav.js`)

Every page sets `<body data-site="…">` and loads `nav.js`, which injects one consistent nav so you
can jump between **all five** pages from any page. On desktop it's a slim sticky **top bar**; on
phones it becomes a fixed **bottom tab bar** (icon + label, current page highlighted). Add a new
destination once, in `nav.js`'s `DEST` list — never per page.

## Cache-busting (`?v=N`)

Static code assets (`styles.css`, `nav.js`, each page's `*.css` / `*.js`) are referenced with a
`?v=N` query, e.g. `styles.css?v=2`. **When you edit any of those files, bump the number** (same `N`
across all pages) so browsers fetch the new copy instead of a stale cached one — important since the
site is used on both laptop and phone. Generated data files (`kb-index.js`, `kb-bodies.js`,
`reading-data.js`, `listening-data.js`) are intentionally left unversioned: the daily routines
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

## Läsning (reading)

`site/reading/` lists every scenario / news / article / adjsubst source and reads it with a
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

## Dagbok (home)

A slim **entry page**: "what did I practise on day X?" — one card per active day (newest first,
grouped by month), each with up to four rows that link straight to where the material lives:

| Row | From | Links to |
|-----|------|----------|
| 📖 阅读 | `imported/` articles (date = import date) | `reading/#article=…&frompage=recap` (+ 🎧 when the article has audio) |
| 🎧 听力 | `listening/*.json` episodes not already shown as an article's 🎧 | `listening/#ep=…&frompage=recap` |
| 🔍 查词 | KB items created that day that no source / same-day article claims | `sok/#note=<slug>` per chip |
| 📝 来源 | older `sources/` notes with no readable article | `sok/#note=source-…` |

Long rows collapse to the first few entries behind "+N ▾"; days older than ~30 days sit behind
"显示更早". The header shows one line: 🔥 streak · active days this week. Läsning and Lyssna both
offer "← 返回 Dagbok", which lands back on `#day-YYYY-MM-DD`. (Stats, heatmap, filters, the peek
panel and flashcards were removed 2026-10-02.)

The page loads only `site/dagbok-data.js` (~80 KB), built by `tools/build-dagbok-data.js` from the
other three generated data files — run it **after** them (the Action does).

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

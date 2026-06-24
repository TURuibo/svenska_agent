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
| **Dagbok** 📅 | `site/index.html` (`/`) | Home — learning diary: stats, heatmap, day-by-day timeline |
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

## Dagbok (home)

The landing page focuses on **evening recap** rather than search: "what did I add today / yesterday
/ this week?". Features:

- Stats strip (今天/昨天/本周/本月/总条目/连续天数 streak)
- 12-week activity heatmap, clickable to jump to that day
- Timeline grouped by day, with import batches (`sources/`) shown as cards containing their words /
  phrases / sentences / grammar
- Type filter (词 / 词组 / 句子 / 语法) and quick-jump buttons
- Click any chip to open an inline peek panel with the full markdown rendered; "在查词站打开 →"
  jumps into the Sök tool (`sok/#note=<slug>`).

The old `/recap/` URL now redirects here. Dark mode follows the OS setting on every page.

`knowledge_base/` remains the source of truth; `site/kb-index.js` + `site/kb-bodies.js` are generated
from those markdown files (backlinks computed at build time). Serve the folder or open
`site/index.html` directly — no build needed to view; only re-run the generator below after editing
KB notes.

Regenerate the searchable data after adding or editing KB notes:

```bash
node tools/build-kb-site.js
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

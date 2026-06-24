# Swedish learning site (multi-page)

Static, dependency-free site for the local Swedish markdown knowledge base. Five pages share one
palette (`styles.css`), one generated dataset (`kb-data.js`), and one navigation component
(`nav.js`).

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
site is used on both laptop and phone. Data files (`kb-data.js`, `reading-data.js`,
`listening-data.js`) are intentionally left unversioned: the daily routines regenerate them, and a
frozen `?v` would hide fresh data.

## Sök (search tool)

`site/sok/` supports category filters, full-text search (term highlighting + match snippets), note
previews, clickable `[[wikilinks]]`, and a **backlinks / "linked from"** panel plus a forward-links
list that flags broken targets. It renders the full markdown body — fenced code blocks (grammar
diagrams), tables, ordered/nested lists, blockquotes. Each note is deep-linkable via `#note=<slug>`;
the browser **Back** button retraces wikilink trails; keyboard shortcuts work (`/` or `Ctrl/Cmd-K`
to focus search, ↑/↓ to move, Enter to open, Esc to clear/back). On phones it shows one note at a
time with a "← Back to list" bar. Other pages link into it as `…/sok/#note=<slug>`.

## Läsning (reading)

`site/reading/` lists every scenario / news / article / adjsubst source and reads it with a
toggleable 🇨🇳 translation. Because the page is fully static (no backend, can't reach Claude Code),
the toolbar offers an **in-page glossary** plus two "queue a command, paste it back into CC" bridges
(both persisted in `localStorage`, each toolbar button shows a count):

| Toolbar | What it does | Bridge back to CC |
|---------|--------------|-------------------|
| **🔤 生词** | Highlight every word that already has a `knowledge_base/words/*.md` note (incl. inflected forms, e.g. `arbetade`→`arbeta`); tap → in-page gloss card. | — (read-only) |
| **🔍 查词** | Also make *un-linked* words tappable, to search the in-memory `vocab`. | — (opens the lookup card) |
| **🔗 链接清单** | When a tapped word **is** in the KB but that surface form wasn't tagged → queue `surface → slug`. | Copy → run `/link-forms` to write the form into the note permanently. |
| **📥 想学** | When a tapped word is **not in the KB at all** → "➕ 想学" / "📋 复制 /learn" queues it. | Copy → run `/learn a, b, c`; CC does the real lookup (swedish-dictionary + web) and stores it. |

After running the command in CC and `/sync`-ing, the next site rebuild turns those words into normal
clickable KB vocab here. The 📥 want-to-learn queue stores the **tapped surface form** (`/learn`
lemmatizes on import). See CLAUDE.md §4.2 for the full flow.

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

`knowledge_base/` remains the source of truth; `site/kb-data.js` is generated from those markdown
files (backlinks computed in the browser). Serve the folder or open `site/index.html` directly —
no build needed to view; only re-run the generator below after editing KB notes.

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

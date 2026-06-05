# KB Web Viewer

Open `site/index.html` in a browser to browse and search the local Swedish markdown knowledge base.

Public GitHub Pages URL:

```text
https://turuibo.github.io/svenska_agent/
```

The viewer supports category filters, full-text search (with term highlighting and match
snippets), note previews, clickable `[[wikilinks]]`, and a **backlinks / "linked from"** panel plus
a forward-links list that flags broken targets. It renders the full markdown body — including
fenced code blocks (grammar formula diagrams), tables, ordered/nested lists, and blockquotes.

Navigation: each note is deep-linkable via `#note=<slug>`, the browser **Back** button retraces
wikilink trails, and keyboard shortcuts work (`/` or `Ctrl/Cmd-K` to search, ↑/↓ to move through
results, Enter to open, Esc to clear/back). On phones it switches to a one-note-at-a-time view with
a "← Back to list" bar and a collapsible filters/stats panel. Dark mode follows the OS setting.

It is static and has no external dependencies. `knowledge_base/` remains the source of truth;
`site/kb-data.js` is generated from those markdown files (backlinks are computed in the browser, so
no schema change is needed). Open `site/index.html` directly or serve the folder — no build needed
to view; only re-run the generator below after editing KB notes.

## Dagbok (recap page)

`site/recap/` is a sister page focused on **evening recap** rather than search: "what did I add
today / yesterday / this week?". It shares `kb-data.js` and the same color palette, and lives at
`/recap/` on GitHub Pages. Features:

- Stats strip (今天/昨天/本周/本月/总条目/连续天数 streak)
- 12-week activity heatmap, clickable to jump to that day
- Timeline grouped by day, with import batches (`sources/`) shown as cards containing their words /
  phrases / sentences / grammar
- Type filter (词 / 词组 / 句子 / 语法) and quick-jump buttons
- Click any chip to open an inline peek panel with the full markdown rendered; "在主站打开 →"
  jumps to the main search viewer.

The main viewer header carries a "📅 Dagbok" link to switch between the two; the recap header
carries a "🔍 Search KB" link back.

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

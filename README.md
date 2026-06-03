# KB Web Viewer

Open `site/index.html` in a browser to browse and search the local Swedish markdown knowledge base.

Public GitHub Pages URL:

```text
https://turuibo.github.io/svenska_agent/
```

The viewer supports category filters, full-text search, note previews, and clickable `[[wikilinks]]`.
It is static and has no external dependencies. `knowledge_base/` remains the source of truth;
`site/kb-data.js` is generated from those markdown files.

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

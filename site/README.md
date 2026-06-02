# KB Web Viewer

Open `site/index.html` in a browser to browse and search the local Swedish markdown knowledge base.

Regenerate the searchable data after adding or editing KB notes:

```powershell
powershell -ExecutionPolicy Bypass -File tools/build-kb-site.ps1
```

The viewer is static and has no external dependencies. `knowledge_base/` remains the source of truth; `site/kb-data.js` is generated from those markdown files.

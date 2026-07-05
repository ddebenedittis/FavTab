# FavTab | Bookmarks New Tab Page

A Manifest V3 Chromium extension that replaces the new tab page with a grid of
your bookmarks, shown as large clickable icons.

- **Source of truth: Chrome bookmarks.** The grid mirrors your Bookmarks Bar;
  adding, editing, deleting or reordering tiles edits the real bookmarks, and
  changes made elsewhere (e.g. `chrome://bookmarks`) appear live.
- **Folders** appear as tiles; click to enter, use the breadcrumb to go back.
- **Icons** come from Google's favicon service (`google.com/s2/favicons`) at
  128px; sites without a favicon get a colored letter tile.
- **Editing:** right-click a tile for Open/Edit/Delete, right-click the
  background for Add favourite / New folder, or use the `+` tile.
- **Drag and drop** to reorder, or drop a tile onto a folder to move it inside.
- Light/dark theme follows the system (`prefers-color-scheme`).

No build step, no background service worker, no host permissions — the only
permission is `bookmarks`.

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this directory
4. Open a new tab

## Files

```
manifest.json      MV3 manifest (newtab override, bookmarks permission)
newtab.html        the new tab page
css/newtab.css     styles, light/dark palettes
js/main.js         entry point: navigation state, context menu, wiring
js/bookmarks.js    chrome.bookmarks adapter + debounced change events
js/grid.js         breadcrumb + tile grid rendering
js/icons.js        favicon URLs, letter-tile fallback, SVG glyphs
js/dnd.js          drag-and-drop reordering / move-into-folder
js/dialogs.js      add-edit dialog, confirm dialog, context menu, toast
```

## Automated tests (optional, Docker)

`test/test-extension.js` loads the extension in real Chromium via Playwright and
exercises rendering, live bookmark sync, folder navigation, the add/edit dialog,
bookmarklet handling and the `bookmarks.move` index semantics:

```sh
docker run --rm --init -v "$PWD":/ext:ro mcr.microsoft.com/playwright:v1.54.0-noble \
  bash -c 'mkdir /work && cd /work && cp /ext/test/test-extension.js . &&
           npm i playwright@1.54.0 >/dev/null 2>&1 && xvfb-run node test-extension.js'
```

(`--init` matters: without a real init as PID 1, `xvfb-run` hangs and swallows
the test output.)

Add `-v "$PWD/test":/out` to also capture light/dark screenshots into `test/`.

## Notes

- `javascript:` bookmarklets can't run from an extension page (MV3 CSP); they
  show a toast instead.
- `chrome://` and `about:` bookmarks open via `chrome.tabs.update/create`
  since regular links to them are blocked.

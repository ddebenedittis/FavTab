// Functional test: load the unpacked extension in Chromium via Playwright,
// exercise the core flows, and probe chrome.bookmarks.move index semantics.
const { chromium } = require('playwright');

const EXT = '/ext';
// Unpacked-extension IDs are the first 32 hex chars of sha256(path), mapped 0-f -> a-p.
const ID = require('crypto')
  .createHash('sha256')
  .update(EXT)
  .digest('hex')
  .slice(0, 32)
  .replace(/./g, (c) => String.fromCharCode(97 + parseInt(c, 16)));

let failures = 0;
function assert(cond, msg) {
  console.log((cond ? 'PASS' : 'FAIL') + ': ' + msg);
  if (!cond) failures++;
}

(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/profile-' + Date.now(), {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-sandbox',
    ],
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('console', (m) => {
    const url = m.location()?.url ?? '';
    const isIconNoise = /favicon|gstatic|google\.com\/s2/;
    if (m.type() === 'error' && !isIconNoise.test(url) && !isIconNoise.test(m.text()))
      errors.push('console: ' + m.text() + ' @ ' + url);
  });

  await page.goto(`chrome-extension://${ID}/newtab.html`);
  await page.waitForTimeout(800);

  const getBar = `(async () => {
    const root = (await chrome.bookmarks.getTree())[0];
    return root.children.find(n => n.folderType === 'bookmarks-bar') ?? root.children.find(n => n.id === '1') ?? root.children[0];
  })()`;

  // 1. initial render
  assert((await page.locator('.tile-add').count()) === 1, 'add tile renders');
  assert(await page.locator('#empty').isVisible(), 'empty message visible with no bookmarks');

  // 2. external creates → live update (grid re-renders from bookmark events)
  await page.evaluate(async (getBarSrc) => {
    const bar = await eval(getBarSrc);
    await chrome.bookmarks.create({ parentId: bar.id, title: 'Example', url: 'https://example.com/' });
    const f = await chrome.bookmarks.create({ parentId: bar.id, title: 'Work' });
    await chrome.bookmarks.create({ parentId: f.id, title: 'Inside', url: 'https://developer.mozilla.org/' });
  }, getBar);
  await page.waitForTimeout(500);
  assert((await page.locator('.tile[data-id]').count()) === 2, 'live update: 2 tiles after external create');
  assert((await page.locator('.tile.tile-is-folder').count()) === 1, 'folder tile renders');
  assert(
    (await page.locator('a.tile[href="https://example.com/"]').count()) === 1,
    'bookmark tile is a real anchor'
  );
  assert(await page.locator('#empty').isHidden(), 'empty message hides when tiles exist');

  // 2b. A burst of bookmark events that nets to the current state (what Chrome
  // Sync emits during background reconciliation) must NOT re-render. A full
  // re-render recreates every <img>, blanking and reloading the icons — the
  // "periodic flash". Mark the live tiles, create+remove a bookmark within the
  // debounce window (net change = none), and assert the same DOM nodes survive.
  await page.evaluate(() => {
    for (const t of document.querySelectorAll('#grid .tile')) t.dataset.probe = '1';
  });
  await page.evaluate(async (getBarSrc) => {
    const bar = await eval(getBarSrc);
    const tmp = await chrome.bookmarks.create({ parentId: bar.id, title: 'tmp', url: 'https://tmp.example/' });
    await chrome.bookmarks.remove(tmp.id);
  }, getBar);
  await page.waitForTimeout(300);
  assert(
    (await page.locator('#grid .tile').count()) ===
      (await page.locator('#grid .tile[data-probe="1"]').count()),
    'net-zero event burst does not re-render (icons do not flash)'
  );

  // 3. folder navigation + breadcrumb
  await page.locator('.tile.tile-is-folder').click();
  await page.waitForTimeout(300);
  assert((await page.locator('.crumb').count()) === 2, 'breadcrumb shows two segments inside folder');
  assert((await page.locator('.tile[data-id]').count()) === 1, 'folder shows its one child');
  await page.locator('.crumb').first().click();
  await page.waitForTimeout(300);
  assert((await page.locator('.tile[data-id]').count()) === 2, 'breadcrumb navigates back to root');

  // 4. add dialog (with scheme normalization)
  await page.locator('.tile-add').click();
  await page.fill('#edit-form input[name="title"]', 'Wikipedia');
  await page.fill('#edit-form input[name="url"]', 'wikipedia.org');
  await page.click('#dialog-ok');
  await page.waitForTimeout(500);
  assert(
    (await page.locator('a.tile[href="https://wikipedia.org/"]').count()) === 1,
    'add dialog creates bookmark, https:// prepended'
  );

  // 5. invalid URL shows inline error, dialog stays open
  await page.locator('.tile-add').click();
  await page.fill('#edit-form input[name="url"]', 'https://');
  await page.click('#dialog-ok');
  assert(await page.locator('#url-error').isVisible(), 'invalid URL shows inline error');
  assert(await page.locator('#edit-dialog').isVisible(), 'dialog stays open on invalid URL');
  await page.click('#edit-form button[value="cancel"]');

  // 6. external rename → live update
  await page.evaluate(async (getBarSrc) => {
    const bar = await eval(getBarSrc);
    const kids = await chrome.bookmarks.getChildren(bar.id);
    await chrome.bookmarks.update(kids.find((k) => k.title === 'Example').id, { title: 'Example Renamed' });
  }, getBar);
  await page.waitForTimeout(300);
  assert(
    (await page.locator('.tile-label').allTextContents()).includes('Example Renamed'),
    'external rename reflected live'
  );

  // 7. bookmarklet: letter tile + toast instead of navigation
  await page.evaluate(async (getBarSrc) => {
    const bar = await eval(getBarSrc);
    await chrome.bookmarks.create({ parentId: bar.id, title: 'JSBM', url: 'javascript:void(0)' });
  }, getBar);
  await page.waitForTimeout(300);
  const jsTile = page.locator('button.tile[data-id]').filter({ hasText: 'JSBM' });
  assert((await jsTile.locator('.tile-letter').count()) === 1, 'bookmarklet renders as letter tile');
  await jsTile.click();
  await page.waitForTimeout(200);
  assert(await page.locator('#toast').isVisible(), 'bookmarklet click shows toast, no navigation');

  // 8. probe move() index semantics (the plan's flagged quirk)
  const order = await page.evaluate(async (getBarSrc) => {
    const bar = await eval(getBarSrc);
    const p = await chrome.bookmarks.create({ parentId: bar.id, title: 'Probe' });
    const a = await chrome.bookmarks.create({ parentId: p.id, title: 'A', url: 'https://a.example/' });
    await chrome.bookmarks.create({ parentId: p.id, title: 'B', url: 'https://b.example/' });
    await chrome.bookmarks.create({ parentId: p.id, title: 'C', url: 'https://c.example/' });
    await chrome.bookmarks.move(a.id, { parentId: p.id, index: 2 });
    return (await chrome.bookmarks.getChildren(p.id)).map((n) => n.title).join('');
  }, getBar);
  console.log(`INFO: move(A -> index 2) over [A,B,C] gives [${order}]`);
  assert(order === 'BAC', 'move uses pre-removal index semantics (dnd.js assumption)');

  // 8b. settings: dock, icon size, and sort mode
  const workId = await page.evaluate(async (getBarSrc) => {
    const bar = await eval(getBarSrc);
    const kids = await chrome.bookmarks.getChildren(bar.id);
    return kids.find((k) => k.title === 'Work').id;
  }, getBar);

  await page.locator('#open-settings').click();
  assert(await page.locator('#settings-dialog').isVisible(), 'gear opens settings dialog');
  // Dock tab is shown first; its panel is visible, the Appearance panel hidden.
  assert(
    (await page.locator('.settings-panel[data-panel="dock"]').isVisible()) &&
      !(await page.locator('.settings-panel[data-panel="appearance"]').isVisible()),
    'settings open on the Dock tab'
  );
  await page.locator('#settings-form input[name="dockEnabled"]').check();
  await page.locator('#settings-form select[name="dockFolderId"]').selectOption(workId);
  await page.locator('#settings-form select[name="dockPosition"]').selectOption('left');
  // Switch to the Appearance tab for the size / order controls.
  await page.locator('.settings-tab[data-tab="appearance"]').click();
  assert(
    await page.locator('.settings-panel[data-panel="appearance"]').isVisible(),
    'clicking a tab reveals its panel'
  );
  await page.$eval('#settings-form input[name="iconSize"]', (el) => {
    el.value = '64';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#settings-form select[name="sortMode"]').selectOption('alphabetical');
  await page.locator('#settings-form button[value="ok"]').click();
  await page.waitForTimeout(300);

  assert(await page.locator('#dock').isVisible(), 'dock visible once enabled');
  assert(
    (await page.locator('#dock .tile[data-id]').count()) === 1,
    'dock shows the chosen folder contents (Inside), no add tile'
  );
  assert(
    (await page.evaluate(() => document.body.dataset.dockPosition)) === 'left',
    'dock position written to body[data-dock-position]'
  );
  assert(
    await page.locator('#dock .tile[data-id] .tile-label').first().isVisible(),
    'dock tiles show labels and match grid tile width'
  );
  assert(
    (await page.evaluate(() => {
      const dockTile = document.querySelector('#dock .tile[data-id]');
      return getComputedStyle(dockTile).width;
    })) ===
      (await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--tile-width').trim()
      )),
    'dock tile width equals --tile-width'
  );
  assert(
    (await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--icon-size').trim()
    )) === '64px',
    'icon size setting applies --icon-size'
  );

  // Alphabetical order + drag disabled, checked inside the Probe folder ([B,A,C]).
  await page.locator('.tile.tile-is-folder').filter({ hasText: 'Probe' }).click();
  await page.waitForTimeout(300);
  assert(
    (await page.locator('#grid .tile[data-id] .tile-label').allTextContents()).join('') === 'ABC',
    'alphabetical mode sorts tiles A→Z (display only)'
  );
  assert(
    (await page.locator('#grid .tile[data-id]').first().getAttribute('draggable')) === 'false',
    'tiles are not draggable outside manual mode'
  );

  // 8c. settings persist across a reload (chrome.storage.sync)
  await page.reload();
  await page.waitForTimeout(800);
  assert(await page.locator('#dock').isVisible(), 'dock + settings persist after reload');
  assert(
    (await page.evaluate(() => document.body.dataset.dockPosition)) === 'left',
    'dock position persists after reload'
  );

  // 8d. per-bookmark custom icon overrides (chrome.storage.sync 'iconOverrides')
  // The reload above left us at the root folder, where the Wikipedia bookmark lives.
  const wikiSel = 'a.tile[href="https://wikipedia.org/"]';
  // Auto chain: a normal web bookmark is tried through its own /favicon.ico first.
  assert(
    (await page.locator(`${wikiSel} img.tile-icon`).getAttribute('src'))?.includes('wikipedia.org/favicon.ico'),
    "web bookmark icon resolves via the site's /favicon.ico first"
  );

  const wikiId = await page.locator(wikiSel).getAttribute('data-id');
  // A 1x1 PNG data URI — loads successfully (no network), so an override sticks.
  const DATA_ICON =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  // Override wins: seeding storage re-renders (via icon-store onChange) and the
  // tile switches to the custom icon ahead of every auto source.
  await page.evaluate(async ([id, icon]) => {
    const cur = (await chrome.storage.sync.get('iconOverrides')).iconOverrides ?? {};
    await chrome.storage.sync.set({ iconOverrides: { ...cur, [id]: icon } });
  }, [wikiId, DATA_ICON]);
  await page.waitForTimeout(400);
  assert(
    (await page.locator(`${wikiSel} img.tile-icon`).getAttribute('src')) === DATA_ICON,
    'custom icon override wins over auto sources'
  );

  // Fallback chain: when the current source (the override) errors, the image
  // advances to the next — the site's /favicon.ico.
  await page.locator(`${wikiSel} img.tile-icon`).evaluate((el) => el.dispatchEvent(new Event('error')));
  await page.waitForTimeout(200);
  assert(
    (await page.locator(`${wikiSel} img.tile-icon`).getAttribute('src'))?.includes('wikipedia.org/favicon.ico'),
    "icon advances to the next source (the site's /favicon.ico) when a source errors"
  );

  // Terminal fallback: when every auto source errors (no favicon anywhere), the
  // tile ends on the colored letter tile — not a stuck generic placeholder.
  for (let n = 0; n < 5; n++) {
    if ((await page.locator(`${wikiSel} img.tile-icon`).count()) === 0) break;
    await page.locator(`${wikiSel} img.tile-icon`).evaluate((el) => el.dispatchEvent(new Event('error')));
    await page.waitForTimeout(80);
  }
  assert(
    (await page.locator(`${wikiSel} .tile-letter`).count()) === 1 &&
      (await page.locator(`${wikiSel} img.tile-icon`).count()) === 0,
    'icon falls back to the colored letter tile when all sources fail'
  );

  // Clean slate before the dialog test so the save triggers a fresh re-render.
  await page.evaluate(async (id) => {
    const cur = (await chrome.storage.sync.get('iconOverrides')).iconOverrides ?? {};
    delete cur[id];
    await chrome.storage.sync.set({ iconOverrides: cur });
  }, wikiId);
  await page.waitForTimeout(300);

  // Edit dialog persists an override to chrome.storage.sync and renders it.
  await page.locator(wikiSel).click({ button: 'right' });
  await page.waitForTimeout(100);
  await page.locator('#context-menu button').filter({ hasText: 'Change icon' }).click();
  await page.fill('#edit-form input[name="iconUrl"]', DATA_ICON);
  await page.click('#dialog-ok');
  await page.waitForTimeout(400);
  assert(
    (await page.evaluate(
      async (id) => ((await chrome.storage.sync.get('iconOverrides')).iconOverrides ?? {})[id],
      wikiId
    )) === DATA_ICON,
    'edit dialog persists the custom icon to chrome.storage.sync'
  );
  assert(
    (await page.locator(`${wikiSel} img.tile-icon`).getAttribute('src')) === DATA_ICON,
    'saved custom icon renders on the tile'
  );

  // Clearing the field removes the override entirely.
  await page.locator(wikiSel).click({ button: 'right' });
  await page.waitForTimeout(100);
  await page.locator('#context-menu button').filter({ hasText: 'Change icon' }).click();
  await page.fill('#edit-form input[name="iconUrl"]', '');
  await page.click('#dialog-ok');
  await page.waitForTimeout(400);
  assert(
    (await page.evaluate(
      async (id) => ((await chrome.storage.sync.get('iconOverrides')).iconOverrides ?? {})[id] ?? null,
      wikiId
    )) === null,
    'clearing the icon field removes the override'
  );

  // 9. screenshots, light + dark (only if an /out volume is mounted)
  if (require('fs').existsSync('/out')) {
    await page.screenshot({ path: '/out/newtab-light.png' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(200);
    await page.screenshot({ path: '/out/newtab-dark.png' });
  }

  if (errors.length) {
    console.log('PAGE ERRORS:');
    for (const e of errors) console.log('  ' + e);
    failures++;
  } else {
    console.log('PASS: no console/page errors');
  }

  await ctx.close();
  console.log(failures ? `${failures} FAILURE(S)` : 'ALL TESTS PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error('Test crashed:', e);
  process.exit(2);
});

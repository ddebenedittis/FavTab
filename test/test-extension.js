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
    if (m.type() === 'error' && !/favicon|gstatic/.test(url) && !/favicon|gstatic/.test(m.text()))
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

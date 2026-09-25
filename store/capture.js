// Renders the Chrome Web Store listing images: loads the unpacked extension in
// Chromium, seeds generic bookmarks, and captures 1280x800 screenshots plus the
// promo tiles. Run from the repo root (see store/README.md).
const { chromium } = require('playwright');
const fs = require('fs');

const EXT = '/ext';
const OUT = '/out';
const ID = require('crypto')
  .createHash('sha256')
  .update(EXT)
  .digest('hex')
  .slice(0, 32)
  .replace(/./g, (c) => String.fromCharCode(97 + parseInt(c, 16)));

const GRID = [
  ['Google', 'https://www.google.com/'],
  ['YouTube', 'https://www.youtube.com/'],
  ['Wikipedia', 'https://www.wikipedia.org/'],
  ['GitHub', 'https://github.com/'],
  ['Reddit', 'https://www.reddit.com/'],
  ['Amazon', 'https://www.amazon.com/'],
  ['Netflix', 'https://www.netflix.com/'],
  ['Spotify', 'https://open.spotify.com/'],
  ['Stack Overflow', 'https://stackoverflow.com/'],
  ['LinkedIn', 'https://www.linkedin.com/'],
  ['Twitch', 'https://www.twitch.tv/'],
  ['Discord', 'https://discord.com/'],
  ['Duolingo', 'https://www.duolingo.com/'],
  ['Airbnb', 'https://www.airbnb.com/'],
];
const FOLDERS = {
  News: [
    ['BBC News', 'https://www.bbc.com/news'],
    ['The Guardian', 'https://www.theguardian.com/'],
    ['Reuters', 'https://www.reuters.com/'],
    ['Hacker News', 'https://news.ycombinator.com/'],
    ['The Verge', 'https://www.theverge.com/'],
    ['Ars Technica', 'https://arstechnica.com/'],
    ['Weather', 'https://weather.com/'],
  ],
  Work: [
    ['Notion', 'https://www.notion.so/'],
    ['Slack', 'https://slack.com/'],
    ['Trello', 'https://trello.com/'],
    ['Figma', 'https://www.figma.com/'],
    ['Zoom', 'https://zoom.us/'],
  ],
  Recipes: [
    ['Allrecipes', 'https://www.allrecipes.com/'],
    ['BBC Good Food', 'https://www.bbcgoodfood.com/'],
    ['Serious Eats', 'https://www.seriouseats.com/'],
  ],
};
const DOCK = [
  ['Outlook', 'https://outlook.live.com/'],
  ['Drive', 'https://drive.google.com/'],
  ['Dropbox', 'https://www.dropbox.com/'],
  ['WhatsApp', 'https://web.whatsapp.com/'],
  ['Translate', 'https://translate.google.com/'],
  ['Photos', 'https://photos.google.com/'],
];
// Sites whose /favicon.ico is low-res: point them at a sharper icon via the
// extension's own per-bookmark icon override.
const S2 = (d) => `https://www.google.com/s2/favicons?domain=${d}&sz=256`;
const OVERRIDES = {
  YouTube: S2('youtube.com'),
  Airbnb: S2('airbnb.com'),
  Weather: S2('weather.com'),
  Outlook: S2('outlook.live.com'),
  Dropbox: S2('dropbox.com'),
  WhatsApp: S2('whatsapp.com'),
};

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page
    .waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(800);
}

(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/profile-' + Date.now(), {
    headless: false,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${ID}/newtab.html`);
  await page.waitForTimeout(800);

  const newsId = await page.evaluate(
    async ({ GRID, FOLDERS, DOCK, OVERRIDES }) => {
      const root = (await chrome.bookmarks.getTree())[0];
      const bar = root.children.find((n) => n.folderType === 'bookmarks-bar') ?? root.children[0];
      const other = root.children.find((n) => n.folderType === 'other') ?? root.children[1];
      const iconOverrides = {};
      const add = async (parentId, [title, url]) => {
        const n = await chrome.bookmarks.create({ parentId, title, url });
        if (OVERRIDES[title]) iconOverrides[n.id] = OVERRIDES[title];
      };
      const ids = {};
      for (const [name, items] of Object.entries(FOLDERS)) {
        const f = await chrome.bookmarks.create({ parentId: bar.id, title: name });
        ids[name] = f.id;
        for (const it of items) await add(f.id, it);
      }
      for (const it of GRID) await add(bar.id, it);
      const dock = await chrome.bookmarks.create({ parentId: other.id, title: 'Dock' });
      for (const it of DOCK) await add(dock.id, it);
      await chrome.storage.sync.set({
        iconOverrides,
        settings: { dockEnabled: true, dockFolderId: dock.id, dockPosition: 'bottom', iconSize: 48 },
      });
      return ids.News;
    },
    { GRID, FOLDERS, DOCK, OVERRIDES }
  );

  await page.reload();
  await settle(page);
  fs.mkdirSync(`${OUT}/screenshots`, { recursive: true });

  // 1. Home grid with dock, light
  await page.screenshot({ path: `${OUT}/screenshots/1-grid-light.png` });

  // 2. Same, dark
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/screenshots/2-grid-dark.png` });
  await page.emulateMedia({ colorScheme: 'light' });

  // 3. Inside a folder (breadcrumb), light
  await page.locator('.tile.tile-is-folder').filter({ hasText: 'News' }).click();
  await settle(page);
  await page.screenshot({ path: `${OUT}/screenshots/3-folder.png` });

  // 4. Context menu on a tile, back at the root
  await page.locator('#breadcrumb button, #breadcrumb a').first().click();
  await settle(page);
  const tile = page.locator('#grid .tile[data-id]').filter({ hasText: 'Wikipedia' });
  const box = await tile.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/screenshots/4-context-menu.png` });
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);

  // 5. Settings dialog (Appearance tab), dark
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.locator('#open-settings').click();
  await page.locator('.settings-tab[data-tab="appearance"]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/screenshots/5-settings-dark.png` });
  await page.keyboard.press('Escape');
  await page.emulateMedia({ colorScheme: 'light' });

  // Promo tiles, built from the extension icon and screenshot 1.
  const b64 = (p) => fs.readFileSync(p).toString('base64');
  const icon = `data:image/png;base64,${b64(`${EXT}/icons/icon128.png`)}`;
  const shot = `data:image/png;base64,${b64(`${OUT}/screenshots/1-grid-light.png`)}`;
  const promo = fs.readFileSync(`${EXT}/store/promo.html`, 'utf8');
  const promoPage = await ctx.newPage();
  for (const [kind, w, h] of [
    ['small', 440, 280],
    ['marquee', 1400, 560],
  ]) {
    await promoPage.setViewportSize({ width: w, height: h });
    await promoPage.setContent(
      promo.replaceAll('__ICON__', icon).replaceAll('__SHOT__', shot).replace('__KIND__', kind)
    );
    await promoPage.waitForTimeout(300);
    await promoPage.screenshot({ path: `${OUT}/promo-${kind}-${w}x${h}.png` });
  }

  await ctx.close();
  console.log('done', newsId ? '' : '(no folders?)');
})().catch((e) => {
  console.error('capture failed:', e);
  process.exit(2);
});

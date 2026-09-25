# Chrome Web Store listing: FavTab

Copy-paste text for the Developer Dashboard, tab by tab.

## Package

- File: `dist/favtab-1.0.0.zip`

## Store listing tab

**Name** (from the manifest): FavTab | Bookmarks New Tab Page

**Summary** (from the manifest, max 132 characters): Replaces the new tab page with a grid of your bookmarks.

**Category:** Productivity → Tools

**Language:** English

**Description:**

```
FavTab turns every new tab into a clean grid of your bookmarks, shown as large, clickable icons.

Your Chrome bookmarks are the single source of truth. The grid mirrors your Bookmarks Bar, and anything you change in FavTab is saved straight to your real bookmarks. Changes made elsewhere, such as in the bookmark manager or on another synced device, show up instantly.

FEATURES
• Big, sharp icons for every site, with a colored letter tile when a site has no icon
• Folders appear as tiles: click to open, and use the breadcrumb to go back
• Drag and drop to reorder, or drop a tile onto a folder to move it inside
• Right-click to open, edit, delete, or set a custom icon for any bookmark
• Add bookmarks and folders with the + tile or by right-clicking the background
• Optional dock: pin a bookmark folder to the top, bottom, left or right edge of the page
• Adjustable icon size, number of icons per row, background colour, and sort order (manual, locked, or A–Z)
• Light and dark themes that follow your system
• Settings sync across your Chrome profiles

PRIVACY
FavTab has no account, no analytics and no tracking. It uses only the "bookmarks" and "storage" permissions. To show icons, it loads each bookmarked site's favicon from the site itself or from Google's favicon service.
```

**Graphic assets:**

| Field | File |
| --- | --- |
| Store icon (128×128) | `icons/icon128.png` |
| Screenshots (1280×800) | `store/screenshots/1-grid-light.png` … `5-settings-dark.png` (upload in order) |
| Small promo tile (440×280) | `store/promo-small-440x280.png` |
| Marquee promo tile (1400×560) | `store/promo-marquee-1400x560.png` |

**Official URL:** none.
**Homepage URL:** https://github.com/ddebenedittis/FavTab
**Support URL:** https://github.com/ddebenedittis/FavTab/issues

## Privacy practices tab

**Single purpose:**

```
FavTab replaces Chrome's new tab page with a grid of the user's bookmarks, which the user can open, organize and edit.
```

**Permission justification: bookmarks**

```
The new tab page displays the user's bookmarks as a grid of tiles. The permission is needed to read the bookmark tree, and to create, edit, move and delete bookmarks when the user does so from the page.
```

**Permission justification: storage**

```
Stores the user's display preferences (icon size, columns, background colour, sort order, dock) and optional custom icon URLs in chrome.storage.sync, so they persist and follow the user's Chrome profile.
```

**Are you using remote code?** No, I am not using remote code.

**Data usage:** tick **Website content**? No.
Tick nothing under the data-type list: the extension does not collect or transmit user data to the developer.
Loading favicons sends a bookmarked site's hostname to that site and to Google's favicon service, which the privacy policy discloses.

Certify all three statements:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://github.com/ddebenedittis/FavTab/blob/main/PRIVACY.md

## Distribution tab

- Visibility: Public (or Unlisted to test first)
- Regions: All regions

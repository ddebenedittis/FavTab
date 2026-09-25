# FavTab privacy policy

_Last updated: 25 September 2026_

FavTab is a Chrome extension that replaces the new tab page with a grid of your bookmarks.
This policy explains what data it touches and where that data goes.

## Data the developer collects

None.
FavTab has no servers, accounts, analytics, telemetry, advertising or tracking of any kind.
The developer never receives your bookmarks, settings, browsing history or any other information.

## Data used on your device

- **Bookmarks.** FavTab reads your Chrome bookmarks to display them, and creates, edits, moves or deletes bookmarks only when you do so from the page. Bookmarks stay in Chrome's own bookmark storage.
- **Settings and custom icons.** Display preferences (icon size, columns, background colour, sort order, dock) and any custom icon URLs you enter are saved with `chrome.storage.sync`. If you have Chrome Sync turned on, Chrome syncs this data across your devices through your Google account, under Google's privacy policy.

## Network requests for icons

To show an icon for each bookmark, FavTab loads images from:

- the bookmarked website itself (its `/favicon.ico`);
- Google's favicon service (`https://www.google.com/s2/favicons`), which receives the website's domain name;
- any custom icon URL you set for a bookmark.

These are ordinary image requests, like the ones any web page makes.
FavTab sends no other information with them, and they are governed by the privacy policies of the sites and services involved.

## Sharing and selling

FavTab does not sell, share or transfer user data to anyone.

## Changes

Any changes to this policy will be published in this file, with an updated date.

## Contact

Questions: open an issue at https://github.com/ddebenedittis/FavTab/issues.

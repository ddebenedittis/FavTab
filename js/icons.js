// Tile icons: resolved through a fallback chain per bookmark, ordered
// best-quality-first —
//   custom override → direct /favicon.ico → Google → colored letter tile.
// The chain advances on an image load error, or — for proxy sources only — the
// generic-icon heuristic (naturalWidth < 32). The site's own /favicon.ico is
// tried first: it's the real icon at native resolution (often 48–64px, far
// crisper than a cached 16px) and it errors cleanly (404 / non-image) when the
// site has none. It is trusted at ANY size, so a site whose only icon is a real
// 16px .ico still shows it rather than being discarded as a "globe". Google's s2
// service is the fallback for sites whose icon isn't at /favicon.ico; on a miss
// it returns a 16px globe that the < 32 heuristic skips, so a genuinely
// icon-less site reliably lands on the letter tile.
//
// We deliberately do NOT use two tempting-looking sources:
//   - Chrome's _favicon cache: never errors (returns a full-size default globe
//     on a miss), which would mask the letter-tile fallback.
//   - DuckDuckGo's ip3 service: on a miss it serves a 48×48 *placeholder* that
//     loads successfully and is >= 32px, so it's indistinguishable from a real
//     icon via <img> and would jam the chain on a blank tile.

export function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function isWebUrl(url) {
  const u = parseUrl(url);
  return !!u && (u.protocol === 'http:' || u.protocol === 'https:');
}

// The site's own /favicon.ico — the real icon at native resolution, and the
// best default source. Errors cleanly (404 / HTML / non-image) when absent.
export function directFaviconUrl(url) {
  const u = parseUrl(url);
  if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:')) return null;
  return `${u.protocol}//${u.host}/favicon.ico`;
}

// Google's favicon service, as a fallback for sites whose icon lives somewhere
// other than /favicon.ico. On a miss it yields a 16px globe the size heuristic
// discards.
export function faviconUrl(url) {
  const u = parseUrl(url);
  if (!u || !u.hostname || (u.protocol !== 'http:' && u.protocol !== 'https:')) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=256`;
}

function hueFor(seed) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}

export function letterTile(node) {
  const div = document.createElement('div');
  div.className = 'tile-letter';
  const seed = parseUrl(node.url)?.hostname || node.title || '?';
  div.style.backgroundColor = `hsl(${hueFor(seed)} 45% 52%)`;
  div.textContent = [...(node.title || seed).trim()][0]?.toUpperCase() ?? '?';
  return div;
}

export function iconElement(node, overrideUrl = null) {
  // Ordered candidate sources. `checkSize` marks proxy sources that substitute a
  // tiny generic globe when they have no real icon — those get the naturalWidth
  // heuristic. The custom override and the site's own /favicon.ico are trusted
  // at any size: an override is explicit, and a /favicon.ico that loads is the
  // site's real icon (a site with none errors instead of serving a globe), so a
  // legitimately small favicon (e.g. a 16px .ico) must not be thrown away.
  const sources = [];
  if (overrideUrl) sources.push({ url: overrideUrl, checkSize: false });
  if (isWebUrl(node.url)) {
    const direct = directFaviconUrl(node.url);
    const google = faviconUrl(node.url);
    if (direct) sources.push({ url: direct, checkSize: false });
    if (google) sources.push({ url: google, checkSize: true });
  }
  if (!sources.length) return letterTile(node);

  const img = document.createElement('img');
  img.className = 'tile-icon';
  img.alt = '';
  img.draggable = false;
  let i = 0;

  const advance = () => {
    if (i >= sources.length) {
      img.replaceWith(letterTile(node));
      return;
    }
    img.src = sources[i++].url;
  };

  img.addEventListener('error', advance);
  img.addEventListener('load', () => {
    // A tiny image from a proxy source is its generic globe; skip to the next
    // source (and ultimately the letter tile).
    const current = sources[i - 1];
    if (current.checkSize && img.naturalWidth < 32) advance();
  });

  advance();
  return img;
}

export function folderGlyph() {
  const span = document.createElement('span');
  span.className = 'tile-folder-glyph';
  span.innerHTML =
    '<svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor" aria-hidden="true">' +
    '<path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/>' +
    '</svg>';
  return span;
}

export function plusGlyph() {
  const span = document.createElement('span');
  span.className = 'tile-plus-glyph';
  span.innerHTML =
    '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M12 5v14M5 12h14"/>' +
    '</svg>';
  return span;
}

// Tile icons: Google favicon service for http(s) URLs, with a colored
// letter tile as fallback (no hostname, load error, or Google's generic globe).

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

export function faviconUrl(url) {
  const u = parseUrl(url);
  if (!u || !u.hostname || (u.protocol !== 'http:' && u.protocol !== 'https:')) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=128`;
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

export function iconElement(node) {
  const src = faviconUrl(node.url);
  if (!src) return letterTile(node);

  const img = document.createElement('img');
  img.className = 'tile-icon';
  img.alt = '';
  img.draggable = false;
  img.addEventListener('load', () => {
    // Google returns a tiny generic globe when it has no favicon for the
    // domain; a real high-res icon is at least 32px. Prefer the letter tile
    // over an upscaled blur.
    if (img.naturalWidth < 32) img.replaceWith(letterTile(node));
  });
  img.addEventListener('error', () => img.replaceWith(letterTile(node)));
  img.src = src;
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

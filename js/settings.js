// Persisted user settings, stored as one object under the `settings` key in
// chrome.storage.sync so they follow the user across devices.
//
// set() applies changes to the in-memory cache and notifies listeners
// synchronously (instant live preview), then debounces the actual sync write
// to stay under chrome.storage.sync's write-rate quota. Cross-device / other-tab
// updates arrive via chrome.storage.onChanged; our own writes echo back through
// that same event and are dropped by a value-equality check.

export const DEFAULTS = {
  dockEnabled: false, // y/n dock
  dockFolderId: null, // bookmark folder id; null = unchosen
  dockPosition: 'bottom', // 'top' | 'bottom' | 'left' | 'right'
  iconSize: 48, // px; matches the original .tile-icon size
  perRow: 0, // 0 = responsive auto-fill; N = fixed column count
  bgColor: '', // '' = follow light/dark theme; '#rrggbb' = override both
  sortMode: 'manual', // 'manual' | 'locked' | 'alphabetical'
};

let cache = { ...DEFAULTS };
const listeners = new Set();

export async function load() {
  const stored = await chrome.storage.sync.get('settings');
  cache = { ...DEFAULTS, ...(stored.settings ?? {}) };
  return cache;
}

export function get() {
  return cache;
}

let writeTimer = null;

export function set(patch) {
  const next = { ...cache, ...patch };
  const changed = Object.keys(patch).filter((k) => cache[k] !== patch[k]);
  if (changed.length === 0) return;
  cache = next;
  notify(changed);

  // Debounce the sync write; range/color sliders can fire dozens of set()s.
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    chrome.storage.sync.set({ settings: cache });
  }, 250);
}

export function onChange(callback) {
  listeners.add(callback);
}

function notify(changedKeys) {
  for (const cb of listeners) cb(cache, changedKeys);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes.settings) return;
  const incoming = { ...DEFAULTS, ...(changes.settings.newValue ?? {}) };
  const changed = Object.keys(incoming).filter((k) => cache[k] !== incoming[k]);
  if (changed.length === 0) return; // echo of our own write
  cache = incoming;
  notify(changed);
});

// Write the size / columns / background settings out as CSS custom properties
// on :root, so the grid, tiles and dock all pick them up with no per-element JS.
export function applyCssVars(s = cache) {
  const root = document.documentElement.style;
  root.setProperty('--icon-size', `${s.iconSize}px`);
  root.setProperty('--chip-size', `${Math.round(s.iconSize * 1.5)}px`);
  if (s.perRow > 0) root.setProperty('--grid-template', `repeat(${s.perRow}, minmax(0, 1fr))`);
  else root.removeProperty('--grid-template');
  if (s.bgColor) root.setProperty('--custom-bg', s.bgColor);
  else root.removeProperty('--custom-bg');
}

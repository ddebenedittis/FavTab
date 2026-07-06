// Per-bookmark custom icon URLs, stored as one map ({ [bookmarkId]: url }) under
// the `iconOverrides` key in chrome.storage.sync so they follow the user across
// devices. Kept separate from `settings` to stay small. Mirrors the cache +
// debounced write + onChanged echo-drop pattern in settings.js.

const KEY = 'iconOverrides';

let cache = {};
const listeners = new Set();

export async function load() {
  const stored = await chrome.storage.sync.get(KEY);
  cache = { ...(stored[KEY] ?? {}) };
  return cache;
}

export function getIconOverride(id) {
  return cache[id] ?? null;
}

let writeTimer = null;
function scheduleWrite() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    chrome.storage.sync.set({ [KEY]: cache });
  }, 250);
}

export function setIconOverride(id, url) {
  if (cache[id] === url) return;
  cache = { ...cache, [id]: url };
  notify();
  scheduleWrite();
}

export function clearIconOverride(id) {
  if (!(id in cache)) return;
  const next = { ...cache };
  delete next[id];
  cache = next;
  notify();
  scheduleWrite();
}

export function onChange(callback) {
  listeners.add(callback);
}

function notify() {
  for (const cb of listeners) cb(cache);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !changes[KEY]) return;
  const incoming = { ...(changes[KEY].newValue ?? {}) };
  if (JSON.stringify(incoming) === JSON.stringify(cache)) return; // echo of our own write
  cache = incoming;
  notify();
});

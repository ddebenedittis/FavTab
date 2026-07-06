// Entry point: navigation state and wiring. Mutations go through the
// bookmarks adapter; re-rendering happens via onAnyChange (bookmark data) and
// settings.onChange (user preferences).

import * as bm from './bookmarks.js';
import * as settings from './settings.js';
import * as iconStore from './icon-store.js';
import { renderBreadcrumb, renderGrid } from './grid.js';
import { initDnd } from './dnd.js';
import { openBookmarkDialog, confirmDialog, openContextMenu, showToast } from './dialogs.js';
import { openSettingsDialog } from './settings-ui.js';

const gridEl = document.getElementById('grid');
const crumbEl = document.getElementById('breadcrumb');
const emptyEl = document.getElementById('empty');
const dockEl = document.getElementById('dock');
const dockGridEl = document.getElementById('dock-grid');

const state = {
  path: [], // [{id, title}], path[0] is the Bookmarks Bar
  children: [], // last rendered children of the current folder
  renderKey: null, // signature of the last render; skips redundant re-renders
};

// The dock shows a fixed chosen folder, navigated independently of the grid.
const dockState = {
  folderId: null,
  children: [],
  renderKey: null,
};

const currentFolder = () => state.path[state.path.length - 1];
const dragEnabled = () => settings.get().sortMode === 'manual';

function gridOptions(showAdd) {
  const { sortMode } = settings.get();
  return { sortMode, draggable: sortMode === 'manual', showAdd };
}

// A stable fingerprint of everything a view draws. Chrome fires bookmark events
// during background sync even when nothing actually changed; re-rendering on
// those recreates every <img> and makes the icons flash. If the fingerprint is
// unchanged we skip the render entirely. sortMode is part of it so switching
// order forces a redraw.
function renderKey(parts, children, sortMode) {
  return JSON.stringify([
    sortMode,
    parts,
    children.map((n) => [n.id, n.title ?? '', n.url ?? '']),
  ]);
}

async function refresh() {
  // If the current folder was deleted externally, back out to the nearest
  // surviving ancestor.
  while (state.path.length > 1) {
    try {
      await bm.getNode(currentFolder().id);
      break;
    } catch {
      state.path.pop();
    }
  }

  let children;
  try {
    children = await bm.getChildren(currentFolder().id);
  } catch {
    children = [];
  }
  state.children = children;

  const key = renderKey(
    state.path.map((p) => [p.id, p.title ?? '']),
    children,
    settings.get().sortMode
  );
  if (key === state.renderKey) return; // nothing visible changed — don't reflash
  state.renderKey = key;

  renderBreadcrumb(crumbEl, state.path, (i) => {
    state.path = state.path.slice(0, i + 1);
    refresh();
  });
  renderGrid(gridEl, children, handlers, gridOptions(true));
  emptyEl.hidden = children.length !== 0;
}

// Render the dock from its chosen folder, or hide it (and drop the reserved
// edge padding) when it's off, unchosen, or the folder no longer exists.
async function refreshDock() {
  const s = settings.get();
  let children = null;
  if (s.dockEnabled && s.dockFolderId) {
    try {
      await bm.getNode(s.dockFolderId);
      children = await bm.getChildren(s.dockFolderId);
    } catch {
      children = null;
    }
  }

  if (!children) {
    dockEl.hidden = true;
    delete document.body.dataset.dockPosition;
    dockState.folderId = null;
    dockState.children = [];
    dockState.renderKey = null;
    return;
  }

  dockState.folderId = s.dockFolderId;
  dockState.children = children;
  // Set outside the render-key guard so a position-only change still moves it.
  document.body.dataset.dockPosition = s.dockPosition;
  dockEl.hidden = false;

  const key = renderKey([s.dockFolderId], children, s.sortMode);
  if (key === dockState.renderKey) return;
  dockState.renderKey = key;
  renderGrid(dockGridEl, children, handlers, gridOptions(false));
}

function refreshAll() {
  return Promise.all([refresh(), refreshDock()]);
}

const handlers = {
  onOpenFolder(node) {
    // A folder click — from the grid or the dock — navigates the main grid.
    state.path.push({ id: node.id, title: node.title });
    refresh();
  },
  onAdd() {
    openBookmarkDialog({ mode: 'add', parentId: currentFolder().id });
  },
  async onOpenSpecial(node, inNewTab) {
    if (node.url.startsWith('javascript:')) {
      showToast("Bookmarklets can't run from the new tab page.");
      return;
    }
    try {
      if (inNewTab) await chrome.tabs.create({ url: node.url });
      else await chrome.tabs.update({ url: node.url });
    } catch {
      showToast(`Couldn't open ${node.url}`);
    }
  },
};

async function deleteNode(node) {
  try {
    if (!node.url) {
      const kids = await bm.getChildren(node.id);
      const ok = await confirmDialog(
        `Delete folder "${node.title || 'Untitled'}" and its ${kids.length} item(s)?`
      );
      if (!ok) return;
      await bm.removeTree(node.id);
    } else {
      await bm.removeBookmark(node.id);
      showToast(`Deleted "${node.title || node.url}"`);
    }
  } catch (err) {
    showToast(err?.message || String(err));
  }
}

document.addEventListener('contextmenu', (event) => {
  // Keep the native menu inside dialogs and form fields (copy/paste etc.).
  if (event.target.closest('dialog, input, textarea')) return;
  event.preventDefault();

  // The menu operates on whichever view was right-clicked.
  const inDock = !!event.target.closest('#dock');
  const children = inDock ? dockState.children : state.children;
  const addParentId = inDock ? dockState.folderId : currentFolder().id;

  const tile = event.target.closest('.tile[data-id]');
  const node = tile && children.find((n) => n.id === tile.dataset.id);

  if (node && node.url) {
    const items = [
      { label: 'Open in new tab', action: () => chrome.tabs.create({ url: node.url }) },
      { label: 'Edit…', action: () => openBookmarkDialog({ mode: 'edit', node }) },
      { label: 'Change icon…', action: () => openBookmarkDialog({ mode: 'edit', node, focusIcon: true }) },
    ];
    if (iconStore.getIconOverride(node.id)) {
      items.push({ label: 'Reset icon', action: () => iconStore.clearIconOverride(node.id) });
    }
    items.push({ label: 'Delete', danger: true, action: () => deleteNode(node) });
    openContextMenu(event.clientX, event.clientY, items);
  } else if (node) {
    openContextMenu(event.clientX, event.clientY, [
      { label: 'Open', action: () => handlers.onOpenFolder(node) },
      { label: 'Rename…', action: () => openBookmarkDialog({ mode: 'rename-folder', node }) },
      { label: 'Delete…', danger: true, action: () => deleteNode(node) },
    ]);
  } else if (addParentId) {
    openContextMenu(event.clientX, event.clientY, [
      { label: 'Add favourite…', action: () => openBookmarkDialog({ mode: 'add', parentId: addParentId }) },
      { label: 'New folder…', action: () => openBookmarkDialog({ mode: 'add-folder', parentId: addParentId }) },
    ]);
  }
});

async function moveNode(id, destination) {
  try {
    await bm.move(id, destination);
  } catch (err) {
    showToast(err?.message || String(err));
  }
}

initDnd(gridEl, {
  getCurrentFolderId: () => currentFolder().id,
  isEnabled: dragEnabled,
  moveNode,
});

initDnd(dockGridEl, {
  getCurrentFolderId: () => dockState.folderId,
  isEnabled: dragEnabled,
  moveNode,
});

function onSettingsChange(s, changed) {
  const has = (k) => changed.includes(k);
  if (has('iconSize') || has('perRow') || has('bgColor')) settings.applyCssVars(s);
  if (has('sortMode')) {
    refreshAll(); // re-order both views and toggle draggable
  } else if (has('dockEnabled') || has('dockFolderId') || has('dockPosition')) {
    refreshDock();
  }
}

document.getElementById('open-settings').addEventListener('click', () => {
  openSettingsDialog();
});

// A custom-icon change doesn't touch bookmark data, so the renderKey guard would
// skip the redraw — clear it to force both views to rebuild their icons.
function onIconOverridesChange() {
  state.renderKey = null;
  dockState.renderKey = null;
  refreshAll();
}

// Drop overrides for bookmarks (and whole folders) deleted anywhere.
chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  const prune = (node) => {
    if (!node) return;
    iconStore.clearIconOverride(node.id);
    for (const child of node.children ?? []) prune(child);
  };
  iconStore.clearIconOverride(id);
  prune(removeInfo?.node);
});

(async function init() {
  try {
    await settings.load();
    await iconStore.load();
    settings.applyCssVars();
    const bar = await bm.getBarFolder();
    state.path = [{ id: bar.id, title: bar.title || 'Bookmarks' }];
    bm.onAnyChange(refreshAll);
    settings.onChange(onSettingsChange);
    iconStore.onChange(onIconOverridesChange);
    await refreshAll();
  } catch (err) {
    showToast(err?.message || String(err));
  } finally {
    document.documentElement.classList.remove('booting');
  }
})();

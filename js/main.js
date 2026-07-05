// Entry point: navigation state and wiring. Mutations go through the
// bookmarks adapter; re-rendering happens only via onAnyChange.

import * as bm from './bookmarks.js';
import { renderBreadcrumb, renderGrid } from './grid.js';
import { initDnd } from './dnd.js';
import { openBookmarkDialog, confirmDialog, openContextMenu, showToast } from './dialogs.js';

const gridEl = document.getElementById('grid');
const crumbEl = document.getElementById('breadcrumb');
const emptyEl = document.getElementById('empty');

const state = {
  path: [], // [{id, title}], path[0] is the Bookmarks Bar
  children: [], // last rendered children of the current folder
};

const currentFolder = () => state.path[state.path.length - 1];

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

  renderBreadcrumb(crumbEl, state.path, (i) => {
    state.path = state.path.slice(0, i + 1);
    refresh();
  });
  renderGrid(gridEl, children, handlers);
  emptyEl.hidden = children.length !== 0;
}

const handlers = {
  onOpenFolder(node) {
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

  const tile = event.target.closest('.tile[data-id]');
  const node = tile && state.children.find((n) => n.id === tile.dataset.id);

  if (node && node.url) {
    openContextMenu(event.clientX, event.clientY, [
      { label: 'Open in new tab', action: () => chrome.tabs.create({ url: node.url }) },
      { label: 'Edit…', action: () => openBookmarkDialog({ mode: 'edit', node }) },
      { label: 'Delete', danger: true, action: () => deleteNode(node) },
    ]);
  } else if (node) {
    openContextMenu(event.clientX, event.clientY, [
      { label: 'Open', action: () => handlers.onOpenFolder(node) },
      { label: 'Rename…', action: () => openBookmarkDialog({ mode: 'rename-folder', node }) },
      { label: 'Delete…', danger: true, action: () => deleteNode(node) },
    ]);
  } else {
    openContextMenu(event.clientX, event.clientY, [
      { label: 'Add favourite…', action: () => openBookmarkDialog({ mode: 'add', parentId: currentFolder().id }) },
      { label: 'New folder…', action: () => openBookmarkDialog({ mode: 'add-folder', parentId: currentFolder().id }) },
    ]);
  }
});

initDnd(gridEl, {
  getCurrentFolderId: () => currentFolder().id,
  moveNode: async (id, destination) => {
    try {
      await bm.move(id, destination);
    } catch (err) {
      showToast(err?.message || String(err));
    }
  },
});

(async function init() {
  try {
    const bar = await bm.getBarFolder();
    state.path = [{ id: bar.id, title: bar.title || 'Bookmarks' }];
    bm.onAnyChange(refresh);
    await refresh();
  } catch (err) {
    showToast(err?.message || String(err));
  }
})();

// Thin promise-based adapter over chrome.bookmarks.
// All UI mutations go through here; re-rendering is driven solely by the
// change events (see onAnyChange), so local and external edits share one path.

const api = chrome.bookmarks;

export async function getBarFolder() {
  const [root] = await api.getTree();
  const children = root.children ?? [];
  return (
    children.find((n) => n.folderType === 'bookmarks-bar') ??
    children.find((n) => n.id === '1') ??
    children[0]
  );
}

export async function getNode(id) {
  const [node] = await api.get(id);
  return node;
}

// Every folder in the tree (nodes without a url), flattened with a depth so the
// settings picker can indent them. The unnamed roots are skipped.
export async function getAllFolders() {
  const [root] = await api.getTree();
  const out = [];
  const walk = (node, depth) => {
    for (const child of node.children ?? []) {
      if (child.url) continue;
      out.push({ id: child.id, title: child.title || 'Untitled', depth });
      walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

export function getChildren(folderId) {
  return api.getChildren(folderId);
}

export function createBookmark(parentId, title, url) {
  return api.create({ parentId, title, url });
}

export function createFolder(parentId, title) {
  return api.create({ parentId, title });
}

export function update(id, changes) {
  return api.update(id, changes);
}

export function removeBookmark(id) {
  return api.remove(id);
}

export function removeTree(id) {
  return api.removeTree(id);
}

export function move(id, destination) {
  return api.move(id, destination);
}

// Debounce all bookmark change events into a single callback, and stay quiet
// during bulk imports (one re-render at onImportEnded instead of hundreds).
export function onAnyChange(callback) {
  let timer = null;
  let importing = false;

  const schedule = () => {
    if (importing) return;
    clearTimeout(timer);
    timer = setTimeout(callback, 50);
  };

  for (const event of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered']) {
    api[event].addListener(schedule);
  }
  api.onImportBegan.addListener(() => {
    importing = true;
  });
  api.onImportEnded.addListener(() => {
    importing = false;
    schedule();
  });
}

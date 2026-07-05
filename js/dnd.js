// HTML5 drag-and-drop: reorder within the current folder, or drop onto a
// folder tile to move the bookmark into it.
//
// Index semantics: chrome.bookmarks.move interprets `index` against the child
// list *before* the dragged node is removed (BookmarkModel compensates for
// same-folder forward moves), so we pass the pre-removal insertion index.

export function initDnd(gridEl, { getCurrentFolderId, moveNode, isEnabled = () => true }) {
  let dragId = null;
  let lastTarget = null;

  const clearIndicator = () => {
    if (lastTarget) {
      lastTarget.classList.remove('drop-before', 'drop-after', 'drop-into');
      lastTarget = null;
    }
  };

  gridEl.addEventListener('dragstart', (event) => {
    if (!isEnabled()) return;
    const tile = event.target.closest('.tile[data-id]');
    if (!tile) return;
    dragId = tile.dataset.id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragId);
    // Defer the class so the drag image is the un-dimmed tile.
    requestAnimationFrame(() => tile.classList.add('dragging'));
  });

  gridEl.addEventListener('dragend', () => {
    dragId = null;
    clearIndicator();
    gridEl.querySelector('.dragging')?.classList.remove('dragging');
  });

  gridEl.addEventListener('dragover', (event) => {
    if (!dragId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const target = hitTest(event);
    if (target?.tile !== lastTarget) clearIndicator();
    if (!target) return;
    lastTarget = target.tile;
    target.tile.classList.remove('drop-before', 'drop-after', 'drop-into');
    target.tile.classList.add(`drop-${target.kind}`);
  });

  gridEl.addEventListener('dragleave', (event) => {
    if (!gridEl.contains(event.relatedTarget)) clearIndicator();
  });

  gridEl.addEventListener('drop', async (event) => {
    if (!dragId) return;
    event.preventDefault();
    const id = dragId;
    const target = hitTest(event);
    clearIndicator();

    if (!target) {
      // Dropped on empty grid space: move to the end of the current folder.
      await moveNode(id, { parentId: getCurrentFolderId() });
      return;
    }
    if (target.kind === 'into') {
      await moveNode(id, { parentId: target.tile.dataset.id });
      return;
    }
    const index = Number(target.tile.dataset.index) + (target.kind === 'after' ? 1 : 0);
    await moveNode(id, { parentId: getCurrentFolderId(), index });
  });

  // Classify what the pointer is over: before/after a tile, or into a folder.
  function hitTest(event) {
    const tile = event.target.closest?.('.tile[data-id]');
    if (!tile || tile.dataset.id === dragId) return null;
    const rect = tile.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    if ('folder' in tile.dataset && ratio > 0.3 && ratio < 0.7) {
      return { tile, kind: 'into' };
    }
    return { tile, kind: ratio < 0.5 ? 'before' : 'after' };
  }
}

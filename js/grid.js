// Rendering of the breadcrumb and the tile grid. Full re-render on every
// change — bookmark folders are small enough that diffing would be overkill.

import { iconElement, folderGlyph, plusGlyph, isWebUrl } from './icons.js';

export function renderBreadcrumb(container, path, onNavigate) {
  container.textContent = '';
  path.forEach((entry, i) => {
    if (i > 0) {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.textContent = '›';
      container.append(sep);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'crumb';
    btn.textContent = entry.title || 'Untitled';
    btn.disabled = i === path.length - 1;
    btn.addEventListener('click', () => onNavigate(i));
    container.append(btn);
  });
  // Hide the breadcrumb entirely while at the root.
  container.classList.toggle('breadcrumb-root', path.length <= 1);
}

export function renderGrid(container, children, handlers) {
  container.textContent = '';
  children.forEach((node, index) => container.append(makeTile(node, index, handlers)));
  container.append(makeAddTile(handlers.onAdd));
}

function makeTile(node, index, handlers) {
  const isFolder = !node.url;
  let tile;

  if (isFolder) {
    tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile tile-is-folder';
    tile.dataset.folder = '';
    tile.append(chip(folderGlyph()), label(node.title || 'Untitled'));
    tile.addEventListener('click', () => handlers.onOpenFolder(node));
  } else if (isWebUrl(node.url)) {
    // Real anchor: left click, middle click and Ctrl-click behave natively.
    tile = document.createElement('a');
    tile.className = 'tile';
    tile.href = node.url;
    tile.append(chip(iconElement(node)), label(node.title || node.url));
  } else {
    // chrome://, about:, file:, javascript:, … — anchors can't navigate to
    // these from an extension page, so route clicks through the handler.
    tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile';
    tile.append(chip(iconElement(node)), label(node.title || node.url));
    tile.addEventListener('click', () => handlers.onOpenSpecial(node, false));
    tile.addEventListener('auxclick', (event) => {
      if (event.button === 1) {
        event.preventDefault();
        handlers.onOpenSpecial(node, true);
      }
    });
  }

  tile.draggable = true;
  tile.dataset.id = node.id;
  tile.dataset.index = index;
  tile.title = node.title || node.url || '';
  return tile;
}

function makeAddTile(onAdd) {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.className = 'tile tile-add';
  tile.append(chip(plusGlyph()), label('Add'));
  tile.title = 'Add favourite';
  tile.addEventListener('click', onAdd);
  return tile;
}

function chip(iconEl) {
  const span = document.createElement('span');
  span.className = 'tile-chip';
  span.append(iconEl);
  return span;
}

function label(text) {
  const span = document.createElement('span');
  span.className = 'tile-label';
  span.textContent = text;
  return span;
}

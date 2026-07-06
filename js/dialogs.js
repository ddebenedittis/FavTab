// Add/edit dialog, delete confirmation, custom context menu and toast.

import * as bm from './bookmarks.js';
import { getIconOverride, setIconOverride, clearIconOverride } from './icon-store.js';

const dialog = document.getElementById('edit-dialog');
const form = document.getElementById('edit-form');
const heading = document.getElementById('dialog-title');
const urlRow = document.getElementById('url-row');
const urlError = document.getElementById('url-error');
const iconRow = document.getElementById('icon-row');
const confirmEl = document.getElementById('confirm-dialog');
const confirmMsg = document.getElementById('confirm-message');
const menuEl = document.getElementById('context-menu');
const toastEl = document.getElementById('toast');

const HEADINGS = {
  add: 'Add favourite',
  edit: 'Edit favourite',
  'add-folder': 'New folder',
  'rename-folder': 'Rename folder',
};

let submitAction = null;

export function openBookmarkDialog({ mode, node, parentId, focusIcon = false }) {
  const folderMode = mode === 'add-folder' || mode === 'rename-folder';
  heading.textContent = HEADINGS[mode];
  urlRow.hidden = folderMode;
  iconRow.hidden = folderMode;
  urlError.hidden = true;
  form.elements.title.value = node?.title ?? '';
  form.elements.url.value = node?.url ?? '';
  form.elements.iconUrl.value = node ? (getIconOverride(node.id) ?? '') : '';

  submitAction = async () => {
    const title = form.elements.title.value.trim();
    if (folderMode) {
      if (mode === 'add-folder') await bm.createFolder(parentId, title || 'New folder');
      else await bm.update(node.id, { title });
      return true;
    }
    const url = normalizeUrl(form.elements.url.value);
    if (!url) {
      urlError.hidden = false;
      form.elements.url.focus();
      return false;
    }
    const finalTitle = title || new URL(url).hostname;
    let id;
    if (mode === 'add') {
      id = (await bm.createBookmark(parentId, finalTitle, url)).id;
    } else {
      await bm.update(node.id, { title: finalTitle, url });
      id = node.id;
    }
    const iconUrl = form.elements.iconUrl.value.trim();
    if (iconUrl) setIconOverride(id, iconUrl);
    else clearIconOverride(id);
    return true;
  };

  dialog.showModal();
  if (focusIcon && !folderMode) form.elements.iconUrl.focus();
  else form.elements.title.select();
}

form.addEventListener('submit', async (event) => {
  if (event.submitter?.value === 'cancel') return; // let method="dialog" close it
  event.preventDefault();
  try {
    if (await submitAction()) dialog.close();
  } catch (err) {
    dialog.close();
    showToast(err?.message || String(err));
  }
});

// Accept "example.com" as well as full URLs; reject anything unparsable.
function normalizeUrl(raw) {
  let value = raw.trim();
  if (!value) return null;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) value = 'https://' + value;
  try {
    return new URL(value).href;
  } catch {
    return null;
  }
}

export function confirmDialog(message) {
  return new Promise((resolve) => {
    confirmMsg.textContent = message;
    confirmEl.showModal();
    confirmEl.addEventListener('close', () => resolve(confirmEl.returnValue === 'ok'), {
      once: true,
    });
  });
}

export function openContextMenu(x, y, items) {
  menuEl.textContent = '';
  for (const item of items) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.label;
    if (item.danger) btn.classList.add('danger');
    btn.addEventListener('click', () => {
      closeContextMenu();
      item.action();
    });
    li.append(btn);
    menuEl.append(li);
  }
  menuEl.style.left = '0px';
  menuEl.style.top = '0px';
  menuEl.hidden = false;
  const rect = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.max(0, Math.min(x, innerWidth - rect.width - 4)) + 'px';
  menuEl.style.top = Math.max(0, Math.min(y, innerHeight - rect.height - 4)) + 'px';
  menuEl.querySelector('button')?.focus();
}

function closeContextMenu() {
  menuEl.hidden = true;
}

addEventListener('pointerdown', (event) => {
  if (!menuEl.hidden && !menuEl.contains(event.target)) closeContextMenu();
});
addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeContextMenu();
});
addEventListener('scroll', closeContextMenu, true);
addEventListener('blur', closeContextMenu);

let toastTimer = null;

export function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 3000);
}

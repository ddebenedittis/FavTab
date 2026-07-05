// The settings dialog. Controls live-apply through settings.set() (which
// notifies main.js to re-render / restyle instantly); the "Done" button just
// closes the native <dialog>.

import * as bm from './bookmarks.js';
import * as settings from './settings.js';

const dialog = document.getElementById('settings-dialog');
const form = document.getElementById('settings-form');
const folderSelect = form.elements.dockFolderId;
const iconSizeValue = document.getElementById('icon-size-value');
const bgToggle = document.getElementById('bg-custom-toggle');
const bgColor = document.getElementById('bg-color-input');
const dockFolderRow = document.getElementById('dock-folder-row');
const dockPositionRow = document.getElementById('dock-position-row');
const tabs = [...dialog.querySelectorAll('.settings-tab')];
const panels = [...dialog.querySelectorAll('.settings-panel')];

const DEFAULT_COLOR = '#f5f6f8';

export async function openSettingsDialog() {
  await populateFolders();
  syncControls();
  selectTab('dock');
  dialog.showModal();
}

function selectTab(name) {
  for (const tab of tabs) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  for (const panel of panels) panel.hidden = panel.dataset.panel !== name;
}

for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab));
}

// Rebuilt each open so newly-created folders show up. The current selection is
// re-applied by syncControls() afterwards.
async function populateFolders() {
  const folders = await bm.getAllFolders();
  folderSelect.textContent = '';
  folderSelect.append(new Option('— choose a folder —', ''));
  for (const f of folders) {
    folderSelect.append(new Option('  '.repeat(f.depth) + f.title, f.id));
  }
}

function syncControls() {
  const s = settings.get();
  form.elements.dockEnabled.checked = s.dockEnabled;
  folderSelect.value = s.dockFolderId ?? '';
  form.elements.dockPosition.value = s.dockPosition;
  form.elements.iconSize.value = String(s.iconSize);
  iconSizeValue.textContent = `${s.iconSize}px`;
  form.elements.perRow.value = String(s.perRow);
  form.elements.sortMode.value = s.sortMode;
  bgToggle.checked = !!s.bgColor;
  bgColor.value = s.bgColor || DEFAULT_COLOR;
  updateDockRows(s.dockEnabled);
}

function updateDockRows(enabled) {
  dockFolderRow.hidden = !enabled;
  dockPositionRow.hidden = !enabled;
}

form.elements.dockEnabled.addEventListener('change', (e) => {
  settings.set({ dockEnabled: e.target.checked });
  updateDockRows(e.target.checked);
});
folderSelect.addEventListener('change', (e) => {
  settings.set({ dockFolderId: e.target.value || null });
});
form.elements.dockPosition.addEventListener('change', (e) => {
  settings.set({ dockPosition: e.target.value });
});
form.elements.iconSize.addEventListener('input', (e) => {
  const value = Number(e.target.value);
  iconSizeValue.textContent = `${value}px`;
  settings.set({ iconSize: value });
});
form.elements.perRow.addEventListener('change', (e) => {
  settings.set({ perRow: Number(e.target.value) });
});
form.elements.sortMode.addEventListener('change', (e) => {
  settings.set({ sortMode: e.target.value });
});
// The colour input can't be empty, so a checkbox represents "no custom colour".
bgToggle.addEventListener('change', (e) => {
  settings.set({ bgColor: e.target.checked ? bgColor.value : '' });
});
bgColor.addEventListener('input', (e) => {
  bgToggle.checked = true;
  settings.set({ bgColor: e.target.value });
});

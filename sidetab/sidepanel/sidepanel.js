import { getStorage, setStorage, updateStorage, generateId } from '../lib/storage.js';

let state = { folders: [], bookmarks: [] };
let dragData = null;
let ctxFolderId = null;

// === Init ===
document.addEventListener('DOMContentLoaded', async () => {
  state = await getStorage();
  renderAll();
  bindEvents();
});

// === Rendering ===
function renderAll() {
  const tree = document.getElementById('folder-tree');
  tree.innerHTML = '';

  const sorted = [...state.folders].sort((a, b) => a.order - b.order);

  if (sorted.length === 0) {
    tree.innerHTML = '<div class="empty-state"><p>No folders yet</p><p>Click "+ Folder" to start</p></div>';
    return;
  }

  for (const folder of sorted) {
    tree.appendChild(createFolderElement(folder));
  }

  // Update modal folder selector
  const select = document.getElementById('select-folder');
  if (select) {
    select.innerHTML = sorted.map(f =>
      `<option value="${f.id}">${escapeHtml(f.name)}</option>`
    ).join('');
  }
}

function createFolderElement(folder) {
  const tmpl = document.getElementById('tmpl-folder');
  const clone = tmpl.content.cloneNode(true);
  const root = clone.querySelector('.folder-node');
  root.dataset.folderId = folder.id;

  const toggle = root.querySelector('.btn-toggle');
  const nameEl = root.querySelector('.folder-name');
  const children = root.querySelector('.folder-children');

  nameEl.textContent = folder.name;
  if (folder.collapsed) {
    toggle.classList.add('collapsed');
    children.classList.add('collapsed');
  }

  const folderBookmarks = state.bookmarks
    .filter(b => b.folderId === folder.id)
    .sort((a, b) => a.order - b.order);

  for (const bm of folderBookmarks) {
    children.appendChild(createBookmarkElement(bm));
  }

  return root;
}

function createBookmarkElement(bookmark) {
  const tmpl = document.getElementById('tmpl-bookmark');
  const clone = tmpl.content.cloneNode(true);
  const root = clone.querySelector('.bookmark-node');
  root.dataset.bookmarkId = bookmark.id;

  const img = root.querySelector('.bookmark-favicon');
  if (bookmark.favicon) {
    img.src = bookmark.favicon;
  } else {
    img.src = `chrome://favicon/size/16@2x/${bookmark.url}`;
  }
  img.onerror = () => { img.style.display = 'none'; };

  root.querySelector('.bookmark-title').textContent = bookmark.title;
  root.querySelector('.bookmark-url').textContent = bookmark.url;

  return root;
}

// === Event Binding ===
function bindEvents() {
  document.getElementById('btn-add-folder').addEventListener('click', addFolder);
  document.getElementById('btn-save-current').addEventListener('click', () => saveCurrentTab());
  document.getElementById('btn-add-bookmark').addEventListener('click', openModal);
  document.getElementById('btn-modal-save').addEventListener('click', saveBookmark);
  document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
  document.getElementById('input-bookmark-title').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBookmark();
    if (e.key === 'Escape') closeModal();
  });
  document.getElementById('input-bookmark-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBookmark();
    if (e.key === 'Escape') closeModal();
  });
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('folder-tree').addEventListener('click', handleTreeClick);
  document.getElementById('folder-tree').addEventListener('dblclick', handleTreeDblClick);
  document.getElementById('folder-tree').addEventListener('contextmenu', handleContextMenu);
  document.addEventListener('click', () => hideContextMenu());
  bindDragAndDrop();
}

// === Folder Operations ===
async function addFolder() {
  const name = `New Folder`;
  await updateStorage(data => {
    const maxOrder = data.folders.reduce((max, f) => Math.max(max, f.order), -1);
    data.folders.push({ id: generateId(), name, collapsed: false, order: maxOrder + 1 });
    return data;
  });
  state = await getStorage();
  renderAll();
}

async function toggleFolder(folderId) {
  await updateStorage(data => {
    const folder = data.folders.find(f => f.id === folderId);
    if (folder) folder.collapsed = !folder.collapsed;
    return data;
  });
  state = await getStorage();
  renderAll();
}

async function deleteFolder(folderId) {
  const bookmarksInFolder = state.bookmarks.filter(b => b.folderId === folderId);
  if (bookmarksInFolder.length > 0) {
    const msg = `Delete folder "${state.folders.find(f => f.id === folderId)?.name}" and its ${bookmarksInFolder.length} bookmark(s)?`;
    if (!confirm(msg)) return;
  }
  await updateStorage(data => {
    data.folders = data.folders.filter(f => f.id !== folderId);
    data.bookmarks = data.bookmarks.filter(b => b.folderId !== folderId);
    return data;
  });
  state = await getStorage();
  renderAll();
}

async function renameFolder(folderId, newName) {
  const name = newName.trim();
  if (!name) return;
  await updateStorage(data => {
    const folder = data.folders.find(f => f.id === folderId);
    if (folder) folder.name = name;
    return data;
  });
  state = await getStorage();
  // Don't full re-render during inline edit, just update the DOM text
}

// === Bookmark Operations ===
function openModal() {
  document.getElementById('modal-title').textContent = 'Add Bookmark';
  document.getElementById('input-bookmark-title').value = '';
  document.getElementById('input-bookmark-url').value = '';
  document.getElementById('modal-error').classList.add('hidden');
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('input-bookmark-title').focus();
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

async function saveBookmark() {
  const title = document.getElementById('input-bookmark-title').value.trim();
  const url = document.getElementById('input-bookmark-url').value.trim();
  const folderId = document.getElementById('select-folder').value;
  const errEl = document.getElementById('modal-error');

  if (!title) { errEl.textContent = 'Title is required'; errEl.classList.remove('hidden'); return; }
  if (!url) { errEl.textContent = 'URL is required'; errEl.classList.remove('hidden'); return; }

  try { new URL(url); } catch {
    errEl.textContent = 'Invalid URL (must include https://)';
    errEl.classList.remove('hidden');
    return;
  }

  await updateStorage(data => {
    const siblings = data.bookmarks.filter(b => b.folderId === folderId);
    const maxOrder = siblings.reduce((max, b) => Math.max(max, b.order), -1);
    data.bookmarks.push({
      id: generateId(),
      folderId,
      title,
      url,
      favicon: `chrome://favicon/size/16@2x/${url}`,
      order: maxOrder + 1
    });
    return data;
  });

  state = await getStorage();
  renderAll();
  closeModal();
}

async function saveCurrentTab(targetFolderId) {
  // Use specified folder, or first folder, or create default
  let folderId = targetFolderId;
  if (!folderId) {
    if (state.folders.length === 0) {
      await addFolder();
      folderId = state.folders[0]?.id;
    } else {
      folderId = state.folders[0].id;
    }
  }
  if (!folderId) return;

  const result = await chrome.runtime.sendMessage({ type: 'SAVE_CURRENT_TAB', folderId });

  if (result.status === 'saved') {
    state = await getStorage();
    renderAll();
  }
}

async function openBookmark(bookmarkId) {
  const bookmark = state.bookmarks.find(b => b.id === bookmarkId);
  if (!bookmark) return;
  await chrome.runtime.sendMessage({ type: 'OPEN_BOOKMARK', url: bookmark.url });
}

async function deleteBookmark(bookmarkId) {
  await updateStorage(data => {
    data.bookmarks = data.bookmarks.filter(b => b.id !== bookmarkId);
    return data;
  });
  state = await getStorage();
  renderAll();
}

async function moveBookmark(bookmarkId, targetFolderId, insertBeforeId) {
  await updateStorage(data => {
    const bm = data.bookmarks.find(b => b.id === bookmarkId);
    if (!bm) return data;

    bm.folderId = targetFolderId;

    // Reorder within target folder
    const others = data.bookmarks.filter(b => b.folderId === targetFolderId && b.id !== bookmarkId)
      .sort((a, b) => a.order - b.order);

    if (insertBeforeId) {
      const idx = others.findIndex(b => b.id === insertBeforeId);
      if (idx >= 0) {
        others.splice(idx, 0, bm);
      } else {
        others.push(bm);
      }
    } else {
      others.push(bm);
    }

    others.forEach((b, i) => { b.order = i; });
    data.bookmarks = [...data.bookmarks.filter(b => b.folderId !== targetFolderId), ...others];
    return data;
  });

  state = await getStorage();
  renderAll();
}

// === Tree Click Handler ===
function handleTreeClick(e) {
  const bookmarkNode = e.target.closest('.bookmark-node');
  const toggleBtn = e.target.closest('.btn-toggle');
  const actBtn = e.target.closest('.btn-folder-act');
  const delBtn = e.target.closest('.btn-bookmark-delete');

  if (delBtn) {
    e.stopPropagation();
    const node = delBtn.closest('.bookmark-node');
    if (node) deleteBookmark(node.dataset.bookmarkId);
    return;
  }

  if (bookmarkNode && !e.target.closest('button')) {
    openBookmark(bookmarkNode.dataset.bookmarkId);
    return;
  }

  if (toggleBtn) {
    const folderNode = toggleBtn.closest('.folder-node');
    if (folderNode) toggleFolder(folderNode.dataset.folderId);
    return;
  }

  if (actBtn) {
    const folderNode = actBtn.closest('.folder-node');
    if (!folderNode) return;
    const folderId = folderNode.dataset.folderId;
    if (actBtn.dataset.act === 'edit') {
      const nameEl = folderNode.querySelector('.folder-name');
      if (nameEl) startInlineEdit(nameEl, folderId);
    } else if (actBtn.dataset.act === 'delete') {
      deleteFolder(folderId);
    }
  }
}

function handleTreeDblClick(e) {
  const nameEl = e.target.closest('.folder-name');
  const folderHeader = e.target.closest('.folder-header');
  if (!nameEl || !folderHeader) return;
  const folderId = folderHeader.closest('.folder-node')?.dataset.folderId;
  if (!folderId) return;
  startInlineEdit(nameEl, folderId);
}

function startInlineEdit(nameEl, folderId) {
  if (nameEl.isContentEditable === 'true') return;

  const original = nameEl.textContent;
  nameEl.contentEditable = 'true';
  nameEl.focus();

  const range = document.createRange();
  range.selectNodeContents(nameEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const save = async () => {
    nameEl.contentEditable = 'false';
    nameEl.removeEventListener('blur', save);
    nameEl.removeEventListener('keydown', onKey);
    const newName = nameEl.textContent.trim();
    if (!newName) {
      nameEl.textContent = original;
      return;
    }
    await renameFolder(folderId, newName);
    nameEl.textContent = newName;
    // Update modal folder selector
    const select = document.getElementById('select-folder');
    const opt = select?.querySelector(`option[value="${folderId}"]`);
    if (opt) opt.textContent = newName;
  };

  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') {
      nameEl.textContent = original;
      nameEl.contentEditable = 'false';
      nameEl.removeEventListener('blur', save);
      nameEl.removeEventListener('keydown', onKey);
    }
  };

  nameEl.addEventListener('blur', save);
  nameEl.addEventListener('keydown', onKey);
}

// === Context Menu ===
function handleContextMenu(e) {
  const folderHdr = e.target.closest('.folder-header');
  if (!folderHdr) return;

  e.preventDefault();
  e.stopPropagation();
  ctxFolderId = folderHdr.closest('.folder-node').dataset.folderId;

  const menu = document.getElementById('context-menu');
  menu.classList.remove('hidden');
  menu.style.left = e.clientX + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 120) + 'px';

  menu.onclick = async (ev) => {
    const action = ev.target.dataset.ctxAction;
    if (action === 'save-here') {
      await saveCurrentTab(ctxFolderId);
    } else if (action === 'rename') {
      const nameEl = folderHdr.querySelector('.folder-name');
      if (nameEl) startInlineEdit(nameEl, ctxFolderId);
    } else if (action === 'delete') {
      await deleteFolder(ctxFolderId);
    }
    hideContextMenu();
  };
}

function hideContextMenu() {
  const menu = document.getElementById('context-menu');
  if (!menu.classList.contains('hidden')) {
    menu.classList.add('hidden');
    ctxFolderId = null;
  }
}

// === Drag and Drop ===
function bindDragAndDrop() {
  const tree = document.getElementById('folder-tree');

  tree.addEventListener('dragstart', (e) => {
    const folderHdr = e.target.closest('.folder-header');
    const bmNode = e.target.closest('.bookmark-node');

    if (folderHdr) {
      const folderId = folderHdr.closest('.folder-node').dataset.folderId;
      dragData = { type: 'folder', id: folderId };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', folderId);
      setTimeout(() => folderHdr.classList.add('drag-ghost'), 0);
    } else if (bmNode) {
      const bookmarkId = bmNode.dataset.bookmarkId;
      const bookmark = state.bookmarks.find(b => b.id === bookmarkId);
      dragData = { type: 'bookmark', id: bookmarkId, sourceFolderId: bookmark?.folderId };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', bookmarkId);
      setTimeout(() => bmNode.classList.add('drag-ghost'), 0);
    } else {
      e.preventDefault();
    }
  });

  tree.addEventListener('dragend', () => {
    tree.querySelectorAll('.drag-ghost, .drag-over-top, .drag-over-bottom, .drag-over-enter')
      .forEach(el => el.classList.remove('drag-ghost', 'drag-over-top', 'drag-over-bottom', 'drag-over-enter'));
    dragData = null;
  });

  tree.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dragData) return;

    clearDragIndicators();

    const target = findDropTarget(e.target);
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    const isFolderHeader = target.matches('.folder-header');
    const isBookmark = target.matches('.bookmark-node');

    if (dragData.type === 'folder' && isFolderHeader) {
      if (ratio < 0.5) target.classList.add('drag-over-top');
      else target.classList.add('drag-over-bottom');
    } else if (dragData.type === 'bookmark') {
      if (isBookmark) {
        if (ratio < 0.5) target.classList.add('drag-over-top');
        else target.classList.add('drag-over-bottom');
      } else if (isFolderHeader) {
        target.classList.add('drag-over-enter');
      }
    }

    e.dataTransfer.dropEffect = 'move';
  });

  tree.addEventListener('drop', async (e) => {
    e.preventDefault();
    clearDragIndicators();
    if (!dragData) return;

    const target = findDropTarget(e.target);
    if (!target) { dragData = null; return; }

    const rect = target.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;

    if (dragData.type === 'folder') {
      await handleFolderDrop(dragData.id, target, ratio);
    } else if (dragData.type === 'bookmark') {
      await handleBookmarkDrop(dragData, target, ratio);
    }

    dragData = null;
  });
}

function findDropTarget(el) {
  return el.closest('.folder-header') || el.closest('.bookmark-node');
}

function clearDragIndicators() {
  document.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over-enter')
    .forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-enter'));
}

async function handleFolderDrop(draggedId, target, ratio) {
  const targetFolderNode = target.closest('.folder-node');
  const targetId = targetFolderNode.dataset.folderId;
  if (draggedId === targetId) return;

  await updateStorage(data => {
    const sorted = data.folders.sort((a, b) => a.order - b.order);
    const draggedIdx = sorted.findIndex(f => f.id === draggedId);
    if (draggedIdx === -1) return data;

    const [dragged] = sorted.splice(draggedIdx, 1);
    let targetIdx = sorted.findIndex(f => f.id === targetId);
    if (targetIdx === -1) { sorted.push(dragged); }
    else {
      if (ratio >= 0.5) targetIdx++;
      sorted.splice(targetIdx, 0, dragged);
    }
    sorted.forEach((f, i) => { f.order = i; });
    data.folders = sorted;
    return data;
  });

  state = await getStorage();
  renderAll();
}

async function handleBookmarkDrop(dragInfo, target, ratio) {
  const isFolderHeader = target.matches('.folder-header');
  const isBookmark = target.matches('.bookmark-node');

  let targetFolderId;
  let insertBeforeId = null;

  if (isFolderHeader) {
    targetFolderId = target.closest('.folder-node').dataset.folderId;
  } else if (isBookmark) {
    targetFolderId = target.closest('.folder-node').dataset.folderId;
    if (ratio < 0.5) {
      insertBeforeId = target.dataset.bookmarkId;
    } else {
      // Insert after: find next sibling
      const siblings = state.bookmarks
        .filter(b => b.folderId === targetFolderId)
        .sort((a, b) => a.order - b.order);
      const idx = siblings.findIndex(b => b.id === target.dataset.bookmarkId);
      if (idx >= 0 && idx < siblings.length - 1) {
        insertBeforeId = siblings[idx + 1].id;
      }
    }
  } else {
    return;
  }

  await moveBookmark(dragInfo.id, targetFolderId, insertBeforeId);
}

// === Utility ===
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

import { getStorage, updateStorage, generateId } from '../lib/storage.js';

let state = { folders: [], bookmarks: [] };
let dragData = null;
let ctxFolderId = null;

// === Init ===
document.addEventListener('DOMContentLoaded', async () => {
  state = await getStorage();
  renderAll();
  bindEvents();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.sidetab_data) {
      state = changes.sidetab_data.newValue || { folders: [], bookmarks: [] };
      renderAll();
    }
  });
});

// === Rendering ===
function renderAll() {
  const uncategorized = document.getElementById('uncategorized-children');
  const tree = document.getElementById('folder-tree');
  const uncatSection = document.getElementById('uncategorized-section');

  // Uncategorized bookmarks (folderId === null)
  const uncatBookmarks = state.bookmarks
    .filter(b => b.folderId === null)
    .sort((a, b) => a.order - b.order);

  uncategorized.innerHTML = '';
  if (uncatBookmarks.length === 0) {
    uncatSection.classList.add('empty');
  } else {
    uncatSection.classList.remove('empty');
    for (const bm of uncatBookmarks) {
      uncategorized.appendChild(createBookmarkElement(bm));
    }
  }
  document.getElementById('uncategorized-count').textContent =
    uncatBookmarks.length > 0 ? `(${uncatBookmarks.length})` : '';

  // Folder tree
  tree.innerHTML = '';
  const sorted = [...state.folders].sort((a, b) => a.order - b.order);
  for (const folder of sorted) {
    tree.appendChild(createFolderElement(folder));
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

  if (bookmark.tabId != null) {
    const dot = document.createElement('span');
    dot.className = 'live-dot';
    dot.title = 'Linked to open tab';
    root.appendChild(dot);
  }

  return root;
}

// === Event Binding ===
function bindEvents() {
  document.getElementById('btn-add-folder').addEventListener('click', addFolder);
  document.getElementById('content-area').addEventListener('click', handleTreeClick);
  document.getElementById('content-area').addEventListener('dblclick', handleTreeDblClick);
  document.getElementById('content-area').addEventListener('contextmenu', handleContextMenu);
  document.addEventListener('click', () => hideContextMenu());
  bindDragAndDrop();
}

// === Folder Operations ===
async function addFolder() {
  await updateStorage(data => {
    const maxOrder = data.folders.reduce((max, f) => Math.max(max, f.order), -1);
    data.folders.push({ id: generateId(), name: 'New Folder', collapsed: false, order: maxOrder + 1 });
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
    const liveCount = bookmarksInFolder.filter(b => b.tabId != null).length;
    const extra = liveCount > 0 ? ` (${liveCount} associated tab(s) will also close)` : '';
    const msg = `Delete folder "${state.folders.find(f => f.id === folderId)?.name}" and its ${bookmarksInFolder.length} bookmark(s)?${extra}`;
    if (!confirm(msg)) return;
  }

  for (const bm of bookmarksInFolder) {
    if (bm.tabId != null) {
      chrome.runtime.sendMessage({ type: 'CLOSE_TAB', tabId: bm.tabId });
    }
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
}

// === Bookmark Operations ===
async function openBookmark(bookmarkId) {
  const bookmark = state.bookmarks.find(b => b.id === bookmarkId);
  if (!bookmark) return;
  await chrome.runtime.sendMessage({ type: 'OPEN_BOOKMARK', url: bookmark.url });
}

async function deleteBookmark(bookmarkId) {
  const bookmark = state.bookmarks.find(b => b.id === bookmarkId);
  if (bookmark?.tabId != null) {
    await chrome.runtime.sendMessage({ type: 'CLOSE_TAB', tabId: bookmark.tabId });
  }
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

    const others = data.bookmarks.filter(b =>
      b.folderId === targetFolderId && b.id !== bookmarkId
    ).sort((a, b) => a.order - b.order);

    if (insertBeforeId) {
      const idx = others.findIndex(b => b.id === insertBeforeId);
      if (idx >= 0) others.splice(idx, 0, bm);
      else others.push(bm);
    } else {
      others.push(bm);
    }

    others.forEach((b, i) => { b.order = i; });
    data.bookmarks = [
      ...data.bookmarks.filter(b => b.folderId !== targetFolderId),
      ...others
    ];
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
  menu.style.top = Math.min(e.clientY, window.innerHeight - 80) + 'px';

  menu.onclick = async (ev) => {
    const action = ev.target.dataset.ctxAction;
    if (action === 'rename') {
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
  const area = document.getElementById('content-area');

  area.addEventListener('dragstart', (e) => {
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

  area.addEventListener('dragend', () => {
    area.querySelectorAll('.drag-ghost, .drag-over-top, .drag-over-bottom, .drag-over-enter')
      .forEach(el => el.classList.remove('drag-ghost', 'drag-over-top', 'drag-over-bottom', 'drag-over-enter'));
    dragData = null;
  });

  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dragData) return;

    clearDragIndicators();

    const target = findDropTarget(e.target);
    const uncatSection = document.getElementById('uncategorized-section');

    if (!target) {
      // Dropping onto empty uncategorized area or section header
      if (dragData.type === 'bookmark' && isOverUncategorized(e.target)) {
        uncatSection.classList.add('drag-over-enter');
      }
      return;
    }

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

  area.addEventListener('drop', async (e) => {
    e.preventDefault();
    clearDragIndicators();
    if (!dragData) return;

    const target = findDropTarget(e.target);

    if (!target && dragData.type === 'bookmark' && isOverUncategorized(e.target)) {
      // Drop bookmark into uncategorized area
      await moveBookmark(dragData.id, null, null);
      dragData = null;
      return;
    }

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

function isOverUncategorized(el) {
  // Check if dragging over the uncategorized section or its children
  const uncat = document.getElementById('uncategorized-section');
  if (!uncat) return false;
  // Is the element inside uncategorized (and not inside a folder node)?
  if (uncat.contains(el) && !el.closest('.folder-node')) return true;
  return false;
}

function findDropTarget(el) {
  return el.closest('.folder-header') || el.closest('.bookmark-node');
}

function clearDragIndicators() {
  const uncat = document.getElementById('uncategorized-section');
  if (uncat) uncat.classList.remove('drag-over-enter');
  document.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over-enter')
    .forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-enter'));
}

async function handleFolderDrop(draggedId, target, ratio) {
  const targetId = target.closest('.folder-node').dataset.folderId;
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
    // Check if target is in uncategorized or in a folder
    const folderNode = target.closest('.folder-node');
    targetFolderId = folderNode ? folderNode.dataset.folderId : null;

    if (ratio < 0.5) {
      insertBeforeId = target.dataset.bookmarkId;
    } else {
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

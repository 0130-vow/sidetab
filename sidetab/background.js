import { getStorage, setStorage, generateId } from './lib/storage.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Clean up bookmarks when their associated tabs are closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const data = await getStorage();
  const before = data.bookmarks.length;
  data.bookmarks = data.bookmarks.filter(b => b.tabId !== tabId);
  if (data.bookmarks.length < before) {
    await setStorage(data);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg).then(sendResponse);
  return true;
});

async function handleMessage(msg) {
  switch (msg.type) {
    case 'GET_CURRENT_TAB':
      return getCurrentTab();
    case 'OPEN_BOOKMARK':
      return openOrSwitchToTab(msg.url);
    case 'SAVE_CURRENT_TAB':
      return saveCurrentTab(msg.folderId);
    case 'CLOSE_TAB':
      return closeTab(msg.tabId);
    default:
      return { error: 'Unknown message type' };
  }
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return { title: tab?.title || '', url: tab?.url || '', favicon: tab?.favIconUrl || '' };
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return url;
  }
}

async function openOrSwitchToTab(targetUrl) {
  const target = normalizeUrl(targetUrl);
  const allTabs = await chrome.tabs.query({});
  let match = allTabs.find(t => normalizeUrl(t.url) === target);
  if (!match) {
    match = allTabs.find(t => normalizeUrl(t.url).startsWith(target));
  }

  if (match) {
    await chrome.tabs.update(match.id, { active: true });
    await chrome.windows.update(match.windowId, { focused: true });
    return { status: 'switched', tabId: match.id };
  }
  const tab = await chrome.tabs.create({ url: targetUrl, active: true });
  return { status: 'created', tabId: tab.id };
}

async function saveCurrentTab(folderId) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return { status: 'error', message: 'No active tab found' };

  const data = await getStorage();
  const folder = data.folders.find(f => f.id === folderId);
  if (!folder) return { status: 'error', message: 'Folder not found' };

  // Update existing bookmark for this tab instead of creating a duplicate
  const existing = data.bookmarks.find(b => b.tabId === tab.id);
  if (existing) {
    existing.title = tab.title || tab.url;
    existing.url = tab.url;
    existing.favicon = tab.favIconUrl || '';
    existing.folderId = folderId;
    await setStorage(data);
    return { status: 'updated', bookmark: existing };
  }

  const siblings = data.bookmarks.filter(b => b.folderId === folderId);
  const maxOrder = siblings.reduce((max, b) => Math.max(max, b.order), -1);

  const bookmark = {
    id: generateId(),
    folderId,
    title: tab.title || tab.url,
    url: tab.url,
    favicon: tab.favIconUrl || '',
    tabId: tab.id,
    order: maxOrder + 1
  };

  data.bookmarks.push(bookmark);
  await setStorage(data);
  return { status: 'saved', bookmark };
}

async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
    return { status: 'closed' };
  } catch {
    // Tab already gone — clean up the bookmark
    const data = await getStorage();
    data.bookmarks = data.bookmarks.filter(b => b.tabId !== tabId);
    await setStorage(data);
    return { status: 'already-closed' };
  }
}

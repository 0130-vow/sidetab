import { getStorage, setStorage, generateId } from './lib/storage.js';

chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Scan all existing tabs and create bookmarks on first install
  const data = await getStorage();
  const existingIds = new Set(data.bookmarks.map(b => b.tabId));

  const tabs = await chrome.tabs.query({});
  let added = 0;
  for (const tab of tabs) {
    if (isTrackableUrl(tab.url) && !existingIds.has(tab.id)) {
      const maxOrder = data.bookmarks.reduce((max, b) => Math.max(max, b.order), -1);
      data.bookmarks.push({
        id: generateId(),
        folderId: null,
        title: tab.title || tab.url,
        url: tab.url,
        favicon: tab.favIconUrl || '',
        tabId: tab.id,
        order: maxOrder + 1
      });
      added++;
    }
  }
  if (added > 0) await setStorage(data);
});

// Auto-add bookmark when a new tab opens
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!isTrackableUrl(tab.url)) return;
  const data = await getStorage();
  const maxOrder = data.bookmarks.reduce((max, b) => Math.max(max, b.order), -1);
  data.bookmarks.push({
    id: generateId(),
    folderId: null,
    title: tab.title || tab.url,
    url: tab.url,
    favicon: tab.favIconUrl || '',
    tabId: tab.id,
    order: maxOrder + 1
  });
  await setStorage(data);
});

// Update bookmark when tab title/url/favicon changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.title && !changeInfo.url && !changeInfo.favIconUrl) return;
  if (!isTrackableUrl(tab.url) && !changeInfo.url) return;

  const data = await getStorage();
  const bm = data.bookmarks.find(b => b.tabId === tabId);

  if (bm) {
    // If URL changed to something untrackable, remove the bookmark
    if (changeInfo.url && !isTrackableUrl(tab.url)) {
      data.bookmarks = data.bookmarks.filter(b => b.tabId !== tabId);
    } else {
      if (changeInfo.title) bm.title = tab.title || tab.url;
      if (changeInfo.url) bm.url = tab.url;
      if (changeInfo.favIconUrl) bm.favicon = tab.favIconUrl;
    }
    await setStorage(data);
  } else if (isTrackableUrl(tab.url)) {
    // New tab just got a real URL (e.g. opened from new-tab page)
    const maxOrder = data.bookmarks.reduce((max, b) => Math.max(max, b.order), -1);
    data.bookmarks.push({
      id: generateId(),
      folderId: null,
      title: tab.title || tab.url,
      url: tab.url,
      favicon: tab.favIconUrl || '',
      tabId: tab.id,
      order: maxOrder + 1
    });
    await setStorage(data);
  }
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
    case 'OPEN_BOOKMARK':
      return openOrSwitchToTab(msg.url);
    case 'CLOSE_TAB':
      return closeTab(msg.tabId);
    default:
      return { error: 'Unknown message type' };
  }
}

function isTrackableUrl(url) {
  if (!url) return false;
  return !url.startsWith('chrome://') &&
         !url.startsWith('chrome-extension://') &&
         !url.startsWith('about:') &&
         !url.startsWith('edge://');
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

async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
    return { status: 'closed' };
  } catch {
    const data = await getStorage();
    data.bookmarks = data.bookmarks.filter(b => b.tabId !== tabId);
    await setStorage(data);
    return { status: 'already-closed' };
  }
}

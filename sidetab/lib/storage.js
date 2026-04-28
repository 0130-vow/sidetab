const STORAGE_KEY = 'sidetab_data';

const DEFAULT_DATA = {
  folders: [],
  bookmarks: []
};

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export async function getStorage() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  if (result[STORAGE_KEY]?.folders?.length > 0) {
    return deepClone(result[STORAGE_KEY]);
  }
  await setStorage(deepClone(DEFAULT_DATA));
  return deepClone(DEFAULT_DATA);
}

export async function setStorage(data) {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

export async function updateStorage(updaterFn) {
  const data = await getStorage();
  const updated = updaterFn(data);
  await setStorage(updated);
  return updated;
}

export function generateId() {
  return crypto.randomUUID?.() ??
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : r & 0x3 | 0x8).toString(16);
    });
}

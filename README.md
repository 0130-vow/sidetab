# SideTab

A Chrome extension that organizes your tabs in a sidebar folder tree. Think of it as a live bookmark manager — save tabs into categorized folders, and keep them in sync with your browser.

## Features

- **Sidebar panel** — opens from the toolbar icon or `Ctrl+Shift+S`
- **Folder tree** — categorize saved tabs into collapsible folders
- **Live tab sync** — bookmarks linked to open tabs; close the tab → bookmark removed, delete the bookmark → tab closed
- **Smart open** — clicking a bookmark switches to the existing tab if already open, or opens a new one
- **Drag & drop** — reorder folders and bookmarks, move bookmarks between folders
- **One-click save** — save the current tab to any folder instantly
- **Manual add** — add bookmarks by typing a title and URL
- **Inline rename** — double-click a folder name to rename it
- **Local storage** — all data stored in `chrome.storage.local`, no account or cloud sync needed

## Install

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked** and select the `sidetab/` folder

The SideTab icon will appear in your toolbar. Click it or press `Ctrl+Shift+S` to open the sidebar.

## Usage

| Action | How |
|--------|-----|
| Add folder | Click `+ Folder` button |
| Rename folder | Double-click the folder name |
| Collapse/expand | Click the arrow next to a folder |
| Save current tab | Click `Save Current Tab` (saves to first folder) |
| Save to specific folder | Right-click a folder → `Save Current Tab Here` |
| Add bookmark manually | Click `+ Bookmark`, fill in title & URL |
| Open bookmark | Click the bookmark — switches to existing tab or opens new one |
| Delete bookmark | Hover and click the X button |
| Delete folder | Hover and click the X button (or right-click → Delete) |
| Reorder | Drag and drop folders or bookmarks |

## Permissions

| Permission | Purpose |
|------------|---------|
| `sidePanel` | Open the sidebar panel |
| `tabs` | Query, switch, create, and close browser tabs |
| `storage` | Persist folder and bookmark data locally |
| `activeTab` | Read the current tab's title and URL for saving |
| `favicon` | Display website favicons in bookmark entries |

// Opens the side panel, keeps the latest selection in session storage (so a
// freshly opened panel can show it), and decides where the selection-watching
// content script runs.
//
// The extension installs with no site access. The content script is added:
//   * to the current tab when the user clicks the toolbar icon, presses the
//     shortcut, or uses the context menu (activeTab grants temporary access to
//     that tab until it navigates), and
//   * to every page, if the user opts in to the optional <all_urls> host
//     permission from the side panel ("Look up highlights on every site").

import { track } from './analytics.js';

const ALL_SITES = { origins: ['<all_urls>'] };
const SCRIPT_ID = 'selection-watcher';

// We open the panel ourselves so that the click also grants activeTab and we
// can inject into the tab.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((err) => console.error(err));

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install' || reason === 'update') track(`extension_${reason}`);

  chrome.contextMenus.create({
    id: 'zhongwen-lookup',
    title: `Look up “%s” in ${chrome.runtime.getManifest().name}`,
    contexts: ['selection'],
  });

  await syncAllSites({ injectOpenTabs: true });
});

chrome.runtime.onStartup.addListener(() => syncAllSites());
chrome.permissions.onAdded.addListener(() => syncAllSites({ injectOpenTabs: true }));
chrome.permissions.onRemoved.addListener(() => syncAllSites());

// Toolbar icon and the Alt+Shift+Z shortcut (_execute_action).
chrome.action.onClicked.addListener((tab) => {
  // open() must be called synchronously within the user gesture.
  chrome.sidePanel.open({ windowId: tab.windowId });
  injectInto(tab.id);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'zhongwen-lookup' || !info.selectionText) return;
  chrome.sidePanel.open({ windowId: tab.windowId });
  publish(info.selectionText.trim(), 'context_menu');
  injectInto(tab.id); // so further highlights in this tab are looked up too
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'zhongwen-selection') publish(msg.text, 'page');
});

// The side panel watches this key; the timestamp makes re-selecting the same
// text register as a change.
function publish(text, source) {
  chrome.storage.session.set({ lastSelection: { text, source, ts: Date.now() } });
}

function injectInto(tabId) {
  if (tabId == null || tabId < 0) return;
  // content.js guards against running twice in the same page.
  chrome.scripting
    .executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] })
    .catch(() =>
      // Cross-origin frames may be off-limits under activeTab; the top frame is enough.
      chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {}));
  // Restricted pages (chrome://, the Web Store) can't be scripted at all.
}

// Registers the content script on all pages exactly when the optional
// all-sites permission is granted, and removes it when it's revoked.
async function syncAllSites({ injectOpenTabs = false } = {}) {
  const granted = await chrome.permissions.contains(ALL_SITES);
  const registered = (await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] })).length > 0;
  if (granted && !registered) {
    await chrome.scripting.registerContentScripts([{
      id: SCRIPT_ID,
      matches: ['<all_urls>'],
      js: ['content.js'],
      allFrames: true,
      runAt: 'document_idle',
      persistAcrossSessions: true,
    }]);
  } else if (!granted && registered) {
    await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  }
  if (granted && injectOpenTabs) {
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*', 'file://*/*'] });
    for (const tab of tabs) injectInto(tab.id);
  }
}

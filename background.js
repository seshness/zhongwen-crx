// Opens the side panel from the toolbar icon, keeps the latest selection in
// session storage (so a freshly opened panel can show it), and injects the
// content script into tabs that were already open when the extension loaded.

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error(err));

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({
    id: 'zhongwen-lookup',
    title: 'Look up “%s” in Zhongwen sidebar',
    contexts: ['selection'],
  });

  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*', 'file://*/*'] });
  for (const tab of tabs) {
    chrome.scripting
      .executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content.js'] })
      .catch(() => {}); // Restricted pages (Web Store, etc.) can't be scripted.
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'zhongwen-selection') {
    publish(msg.text);
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'zhongwen-lookup' || !info.selectionText) return;
  const text = info.selectionText.trim();
  // open() must be called synchronously within the user gesture.
  chrome.sidePanel.open({ windowId: tab.windowId });
  publish(text);
});

// The side panel watches this key; the timestamp makes re-selecting the same
// text register as a change.
function publish(text) {
  chrome.storage.session.set({ lastSelection: { text, ts: Date.now() } });
}

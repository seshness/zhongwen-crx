// Watches text selection on the page and forwards any selection containing
// Chinese characters to the extension (side panel + background).
(() => {
  if (window.__zhongwenSidebarInjected) return;
  window.__zhongwenSidebarInjected = true;

  const HAN = /[㐀-䶿一-鿿豈-﫿\u{20000}-\u{2ebef}]/u;
  const MAX_LEN = 300;
  let lastSent = '';
  let timer = null;

  function check() {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim().slice(0, MAX_LEN) : '';
    if (!text || !HAN.test(text) || text === lastSent) return;
    lastSent = text;
    try {
      chrome.runtime.sendMessage({ type: 'zhongwen-selection', text });
    } catch {
      // Extension was reloaded; this orphaned script can no longer talk to it.
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(check, 150);
  }

  document.addEventListener('mouseup', schedule, true);
  document.addEventListener('keyup', (e) => {
    if (e.shiftKey || e.key === 'Shift') schedule();
  }, true);
  document.addEventListener('dblclick', schedule, true);
  // Reset so re-selecting the same text after clearing it triggers a lookup again.
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) lastSent = '';
  });
})();

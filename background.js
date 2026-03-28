const DEFAULT_COLOR = "yellow";

function urlKey(urlStr) {
  try {
    const u = new URL(urlStr);
    return (u.origin + u.pathname).replace(/\/+$/, "");
  } catch {
    return urlStr;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "highlight-selection",
    title: "Highlight selected text",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "highlight-selection") return;

  const text = info.selectionText?.trim();
  if (!text || !tab?.url) return;

  const key = urlKey(tab.url);

  chrome.storage.local.get(["pages", "defaultColor"], (result) => {
    const pages = result.pages || {};
    const entry = pages[key] || { snippets: [] };
    const color = result.defaultColor || DEFAULT_COLOR;

    // Don't add duplicates
    if (entry.snippets.some((s) => (typeof s === "string" ? s : s.text) === text)) return;

    entry.snippets.push({ text, color, createdAt: Date.now() });
    pages[key] = entry;

    chrome.storage.local.set({ pages }, () => {
      chrome.tabs.sendMessage(tab.id, { action: "refresh-highlights" }).catch(() => {});
    });
  });
});

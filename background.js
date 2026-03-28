const DEFAULT_COLOR = "yellow";
const DEFAULT_SCOPE = "page";

function urlKey(urlStr) {
  try {
    const u = new URL(urlStr);
    return (u.origin + u.pathname).replace(/\/+$/, "");
  } catch {
    return urlStr;
  }
}

function originKey(urlStr) {
  try {
    return new URL(urlStr).origin;
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
  const origin = originKey(tab.url);

  chrome.storage.local.get(["pages", "sites", "defaultColor", "defaultScope"], (result) => {
    const pages = result.pages || {};
    const sites = result.sites || {};
    const color = result.defaultColor || DEFAULT_COLOR;
    const scope = result.defaultScope || DEFAULT_SCOPE;

    if (scope === "site") {
      const entry = sites[origin] || { snippets: [] };
      if (entry.snippets.some((s) => (typeof s === "string" ? s : s.text) === text)) return;
      entry.snippets.push({ text, color, createdAt: Date.now() });
      sites[origin] = entry;
      chrome.storage.local.set({ sites }, () => {
        chrome.tabs.sendMessage(tab.id, { action: "refresh-highlights" }).catch(() => {});
      });
    } else {
      const entry = pages[key] || { snippets: [] };
      if (entry.snippets.some((s) => (typeof s === "string" ? s : s.text) === text)) return;
      entry.snippets.push({ text, color, createdAt: Date.now() });
      pages[key] = entry;
      chrome.storage.local.set({ pages }, () => {
        chrome.tabs.sendMessage(tab.id, { action: "refresh-highlights" }).catch(() => {});
      });
    }
  });
});

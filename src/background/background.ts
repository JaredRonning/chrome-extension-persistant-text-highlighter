import { ColorId, Scope, StoredSnippet } from "../shared/types";
import { DEFAULT_COLOR } from "../shared/colors";
import { DEFAULT_SCOPE } from "../shared/storage";
import { urlKey, originKey } from "../shared/url";

function updateBadge(tabId: number, url: string): void {
  const key = urlKey(url);
  const origin = originKey(url);
  chrome.storage.local.get(["pages", "sites"], (result) => {
    const pageCount = result.pages?.[key]?.snippets?.length || 0;
    const siteCount = result.sites?.[origin]?.snippets?.length || 0;
    const total = pageCount + siteCount;
    chrome.action.setBadgeText({ text: total > 0 ? String(total) : "", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#e94560", tabId });
  });
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab.url) updateBadge(tabId, tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.url) updateBadge(tabId, tab.url);
});

chrome.storage.onChanged.addListener(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.id && tab.url) updateBadge(tab.id, tab.url);
  });
});

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
  if (!text || !tab?.url || !tab.id) return;

  const key = urlKey(tab.url);
  const origin = originKey(tab.url);
  const tabId = tab.id;

  chrome.storage.local.get(
    ["pages", "sites", "defaultColor", "defaultScope"],
    (result) => {
      const pages: Record<string, { snippets: StoredSnippet[] }> =
        result.pages || {};
      const sites: Record<string, { snippets: StoredSnippet[] }> =
        result.sites || {};
      const color: ColorId = result.defaultColor || DEFAULT_COLOR;
      const scope: Scope = result.defaultScope || DEFAULT_SCOPE;

      if (scope === "site") {
        const entry = sites[origin] || { snippets: [] };
        if (
          entry.snippets.some(
            (s) => (typeof s === "string" ? s : s.text) === text,
          )
        )
          return;
        entry.snippets.push({ text, color, createdAt: Date.now() });
        sites[origin] = entry;
        chrome.storage.local.set({ sites }, () => {
          chrome.tabs
            .sendMessage(tabId, { action: "refresh-highlights" })
            .catch(() => {});
          updateBadge(tabId, tab.url!);
        });
      } else {
        const entry = pages[key] || { snippets: [] };
        if (
          entry.snippets.some(
            (s) => (typeof s === "string" ? s : s.text) === text,
          )
        )
          return;
        entry.snippets.push({ text, color, createdAt: Date.now() });
        pages[key] = entry;
        chrome.storage.local.set({ pages }, () => {
          chrome.tabs
            .sendMessage(tabId, { action: "refresh-highlights" })
            .catch(() => {});
          updateBadge(tabId, tab.url!);
        });
      }
    },
  );
});

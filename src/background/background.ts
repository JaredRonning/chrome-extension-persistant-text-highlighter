import { ColorId, Scope, StoredSnippet } from "../shared/types";
import { DEFAULT_COLOR } from "../shared/colors";
import { DEFAULT_SCOPE } from "../shared/storage";
import { urlKey, originKey } from "../shared/url";

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
        });
      }
    },
  );
});

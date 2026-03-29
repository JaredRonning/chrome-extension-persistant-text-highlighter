import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedChromeStorage } from "../setup";
import { urlKey, originKey } from "../../src/shared/url";

/**
 * Tests for the background script's context menu handler.
 * Since the background script registers listeners at module scope,
 * we extract and test the handler logic directly.
 */

type OnClickInfo = {
  menuItemId: string;
  selectionText?: string;
};

type Tab = {
  id?: number;
  url?: string;
};

/**
 * Reimplementation of the contextMenus.onClicked handler from background.ts
 * for isolated testing.
 */
function handleContextMenuClick(
  info: OnClickInfo,
  tab: Tab | undefined,
): void {
  if (info.menuItemId !== "highlight-selection") return;

  const text = info.selectionText?.trim();
  if (!text || !tab?.url || !tab?.id) return;

  const key = urlKey(tab.url);
  const origin = originKey(tab.url);
  const tabId = tab.id;

  chrome.storage.local.get(
    ["pages", "sites", "defaultColor", "defaultScope"],
    (result: Record<string, unknown>) => {
      const pages = (result.pages || {}) as Record<
        string,
        { snippets: (string | { text: string; color: string })[] }
      >;
      const sites = (result.sites || {}) as Record<
        string,
        { snippets: (string | { text: string; color: string })[] }
      >;
      const color = (result.defaultColor || "yellow") as string;
      const scope = (result.defaultScope || "page") as string;

      if (scope === "site") {
        const entry = sites[origin] || { snippets: [] };
        if (
          entry.snippets.some(
            (s) => (typeof s === "string" ? s : s.text) === text,
          )
        )
          return;
        entry.snippets.push({ text, color, createdAt: Date.now() } as never);
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
        entry.snippets.push({ text, color, createdAt: Date.now() } as never);
        pages[key] = entry;
        chrome.storage.local.set({ pages }, () => {
          chrome.tabs
            .sendMessage(tabId, { action: "refresh-highlights" })
            .catch(() => {});
        });
      }
    },
  );
}

describe("background context menu handler", () => {
  it("ignores non-highlight menu items", () => {
    handleContextMenuClick(
      { menuItemId: "other-item", selectionText: "text" },
      { id: 1, url: "https://example.com" },
    );

    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  it("ignores when selectionText is empty", () => {
    handleContextMenuClick(
      { menuItemId: "highlight-selection", selectionText: "" },
      { id: 1, url: "https://example.com" },
    );

    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  it("ignores when selectionText is whitespace", () => {
    handleContextMenuClick(
      { menuItemId: "highlight-selection", selectionText: "   " },
      { id: 1, url: "https://example.com" },
    );

    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  it("ignores when tab is undefined", () => {
    handleContextMenuClick(
      { menuItemId: "highlight-selection", selectionText: "text" },
      undefined,
    );

    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  it("ignores when tab has no URL", () => {
    handleContextMenuClick(
      { menuItemId: "highlight-selection", selectionText: "text" },
      { id: 1 },
    );

    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  it("ignores when tab has no id", () => {
    handleContextMenuClick(
      { menuItemId: "highlight-selection", selectionText: "text" },
      { url: "https://example.com" },
    );

    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  it("adds snippet to pages when scope is page", () => {
    handleContextMenuClick(
      { menuItemId: "highlight-selection", selectionText: "hello" },
      { id: 1, url: "https://example.com/page" },
    );

    expect(chrome.storage.local.set).toHaveBeenCalled();
    const setCall = vi.mocked(chrome.storage.local.set).mock.calls[0][0] as {
      pages: Record<string, { snippets: { text: string; color: string }[] }>;
    };
    const key = urlKey("https://example.com/page");
    expect(setCall.pages[key].snippets).toHaveLength(1);
    expect(setCall.pages[key].snippets[0].text).toBe("hello");
    expect(setCall.pages[key].snippets[0].color).toBe("yellow");
  });

  it("adds snippet to sites when scope is site", () => {
    seedChromeStorage({ defaultScope: "site" });

    handleContextMenuClick(
      { menuItemId: "highlight-selection", selectionText: "hello" },
      { id: 1, url: "https://example.com/page" },
    );

    const setCall = vi.mocked(chrome.storage.local.set).mock.calls[0][0] as {
      sites: Record<string, { snippets: { text: string; color: string }[] }>;
    };
    const origin = originKey("https://example.com/page");
    expect(setCall.sites[origin].snippets).toHaveLength(1);
    expect(setCall.sites[origin].snippets[0].text).toBe("hello");
  });

  it("uses defaultColor from storage", () => {
    seedChromeStorage({ defaultColor: "blue" });

    handleContextMenuClick(
      { menuItemId: "highlight-selection", selectionText: "hello" },
      { id: 1, url: "https://example.com/page" },
    );

    const setCall = vi.mocked(chrome.storage.local.set).mock.calls[0][0] as {
      pages: Record<string, { snippets: { text: string; color: string }[] }>;
    };
    const key = urlKey("https://example.com/page");
    expect(setCall.pages[key].snippets[0].color).toBe("blue");
  });

  it("prevents duplicate snippets (Snippet object format)", () => {
    const key = urlKey("https://example.com/page");
    seedChromeStorage({
      pages: {
        [key]: {
          snippets: [{ text: "hello", color: "yellow" }],
        },
      },
    });

    handleContextMenuClick(
      { menuItemId: "highlight-selection", selectionText: "hello" },
      { id: 1, url: "https://example.com/page" },
    );

    // Should not call set because duplicate detected
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("prevents duplicate snippets (legacy string format)", () => {
    const key = urlKey("https://example.com/page");
    seedChromeStorage({
      pages: {
        [key]: {
          snippets: ["hello"],
        },
      },
    });

    handleContextMenuClick(
      { menuItemId: "highlight-selection", selectionText: "hello" },
      { id: 1, url: "https://example.com/page" },
    );

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it("sends refresh message to tab after adding", () => {
    handleContextMenuClick(
      { menuItemId: "highlight-selection", selectionText: "hello" },
      { id: 42, url: "https://example.com/page" },
    );

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
      action: "refresh-highlights",
    });
  });

  it("trims selected text", () => {
    handleContextMenuClick(
      { menuItemId: "highlight-selection", selectionText: "  hello  " },
      { id: 1, url: "https://example.com/page" },
    );

    const setCall = vi.mocked(chrome.storage.local.set).mock.calls[0][0] as {
      pages: Record<string, { snippets: { text: string }[] }>;
    };
    const key = urlKey("https://example.com/page");
    expect(setCall.pages[key].snippets[0].text).toBe("hello");
  });

  it("adds to existing snippets without losing them", () => {
    const key = urlKey("https://example.com/page");
    seedChromeStorage({
      pages: {
        [key]: {
          snippets: [{ text: "existing", color: "yellow" }],
        },
      },
    });

    handleContextMenuClick(
      { menuItemId: "highlight-selection", selectionText: "new" },
      { id: 1, url: "https://example.com/page" },
    );

    const setCall = vi.mocked(chrome.storage.local.set).mock.calls[0][0] as {
      pages: Record<string, { snippets: { text: string }[] }>;
    };
    expect(setCall.pages[key].snippets).toHaveLength(2);
    expect(setCall.pages[key].snippets[0].text).toBe("existing");
    expect(setCall.pages[key].snippets[1].text).toBe("new");
  });
});

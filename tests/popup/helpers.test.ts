import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  Snippet,
  DisplaySnippet,
  Scope,
  ColorId,
  HighlightStyle,
} from "../../src/shared/types";

/**
 * Tests for popup helper functions. These are reimplemented here because
 * popup.ts executes side effects at module scope (DOM queries, event listeners,
 * chrome.tabs.query). Testing the logic in isolation verifies correctness.
 */

// ── timeAgo ──

function timeAgo(ts: number | undefined): string | null {
  if (!ts) return null;
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for undefined", () => {
    expect(timeAgo(undefined)).toBeNull();
  });

  it("returns null for 0", () => {
    expect(timeAgo(0)).toBeNull();
  });

  it('returns "just now" for current time', () => {
    expect(timeAgo(Date.now())).toBe("just now");
  });

  it('returns "just now" for 30 seconds ago', () => {
    expect(timeAgo(Date.now() - 30_000)).toBe("just now");
  });

  it('returns "just now" for 59 seconds ago', () => {
    expect(timeAgo(Date.now() - 59_000)).toBe("just now");
  });

  it('returns "1m ago" for 60 seconds ago', () => {
    expect(timeAgo(Date.now() - 60_000)).toBe("1m ago");
  });

  it('returns "5m ago" for 5 minutes ago', () => {
    expect(timeAgo(Date.now() - 5 * 60_000)).toBe("5m ago");
  });

  it('returns "59m ago" for 59 minutes ago', () => {
    expect(timeAgo(Date.now() - 59 * 60_000)).toBe("59m ago");
  });

  it('returns "1h ago" for 1 hour ago', () => {
    expect(timeAgo(Date.now() - 60 * 60_000)).toBe("1h ago");
  });

  it('returns "23h ago" for 23 hours ago', () => {
    expect(timeAgo(Date.now() - 23 * 60 * 60_000)).toBe("23h ago");
  });

  it('returns "1d ago" for 24 hours ago', () => {
    expect(timeAgo(Date.now() - 24 * 60 * 60_000)).toBe("1d ago");
  });

  it('returns "29d ago" for 29 days ago', () => {
    expect(timeAgo(Date.now() - 29 * 24 * 60 * 60_000)).toBe("29d ago");
  });

  it('returns "1mo ago" for 30 days ago', () => {
    expect(timeAgo(Date.now() - 30 * 24 * 60 * 60_000)).toBe("1mo ago");
  });

  it('returns "3mo ago" for 90 days ago', () => {
    expect(timeAgo(Date.now() - 90 * 24 * 60 * 60_000)).toBe("3mo ago");
  });
});

// ── buildDisplayList ──

function buildDisplayList(
  pageSnippets: Snippet[],
  siteSnippets: Snippet[],
): DisplaySnippet[] {
  const list: DisplaySnippet[] = [];
  pageSnippets.forEach((s, i) =>
    list.push({ ...s, _scope: "page", _srcIndex: i }),
  );
  siteSnippets.forEach((s, i) =>
    list.push({ ...s, _scope: "site", _srcIndex: i }),
  );
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return list;
}

describe("buildDisplayList", () => {
  it("returns empty array when no snippets", () => {
    expect(buildDisplayList([], [])).toEqual([]);
  });

  it("returns page snippets with correct metadata", () => {
    const page: Snippet[] = [{ text: "hello", color: "yellow", createdAt: 100 }];
    const result = buildDisplayList(page, []);

    expect(result).toHaveLength(1);
    expect(result[0]._scope).toBe("page");
    expect(result[0]._srcIndex).toBe(0);
    expect(result[0].text).toBe("hello");
  });

  it("returns site snippets with correct metadata", () => {
    const site: Snippet[] = [{ text: "world", color: "blue", createdAt: 200 }];
    const result = buildDisplayList([], site);

    expect(result).toHaveLength(1);
    expect(result[0]._scope).toBe("site");
    expect(result[0]._srcIndex).toBe(0);
  });

  it("merges page and site snippets", () => {
    const page: Snippet[] = [{ text: "a", color: "yellow", createdAt: 100 }];
    const site: Snippet[] = [{ text: "b", color: "blue", createdAt: 200 }];
    const result = buildDisplayList(page, site);

    expect(result).toHaveLength(2);
  });

  it("sorts by createdAt descending (newest first)", () => {
    const page: Snippet[] = [
      { text: "old", color: "yellow", createdAt: 100 },
      { text: "new", color: "yellow", createdAt: 300 },
    ];
    const site: Snippet[] = [
      { text: "mid", color: "blue", createdAt: 200 },
    ];
    const result = buildDisplayList(page, site);

    expect(result[0].text).toBe("new");
    expect(result[1].text).toBe("mid");
    expect(result[2].text).toBe("old");
  });

  it("treats missing createdAt as 0 (oldest)", () => {
    const page: Snippet[] = [
      { text: "no-date", color: "yellow" },
      { text: "has-date", color: "yellow", createdAt: 100 },
    ];
    const result = buildDisplayList(page, []);

    expect(result[0].text).toBe("has-date");
    expect(result[1].text).toBe("no-date");
  });

  it("preserves _srcIndex relative to source array", () => {
    const page: Snippet[] = [
      { text: "a", color: "yellow", createdAt: 300 },
      { text: "b", color: "yellow", createdAt: 100 },
    ];
    const site: Snippet[] = [
      { text: "c", color: "blue", createdAt: 200 },
    ];
    const result = buildDisplayList(page, site);

    // Sorted: a(300), c(200), b(100)
    expect(result[0]).toMatchObject({ text: "a", _scope: "page", _srcIndex: 0 });
    expect(result[1]).toMatchObject({ text: "c", _scope: "site", _srcIndex: 0 });
    expect(result[2]).toMatchObject({ text: "b", _scope: "page", _srcIndex: 1 });
  });

  it("does not deduplicate same text in page and site", () => {
    const page: Snippet[] = [{ text: "dup", color: "yellow", createdAt: 100 }];
    const site: Snippet[] = [{ text: "dup", color: "blue", createdAt: 200 }];
    const result = buildDisplayList(page, site);

    expect(result).toHaveLength(2);
  });

  it("preserves styles in output", () => {
    const page: Snippet[] = [
      { text: "styled", color: "yellow", createdAt: 100, styles: ["bold", "underline"] },
    ];
    const result = buildDisplayList(page, []);

    expect(result[0].styles).toEqual(["bold", "underline"]);
  });

  it("preserves notes in output", () => {
    const page: Snippet[] = [
      { text: "noted", color: "yellow", createdAt: 100, note: "my note" },
    ];
    const result = buildDisplayList(page, []);

    expect(result[0].note).toBe("my note");
  });
});

// ── addSnippet logic ──

describe("addSnippet logic", () => {
  function addSnippet(
    text: string,
    pageSnippets: Snippet[],
    siteSnippets: Snippet[],
    defaultColor: ColorId,
    defaultScope: Scope,
    defaultStyles: HighlightStyle[],
  ): { added: boolean; target: "page" | "site" | null } {
    const trimmed = text.trim();
    if (!trimmed) return { added: false, target: null };
    if (
      pageSnippets.some((s) => s.text === trimmed) ||
      siteSnippets.some((s) => s.text === trimmed)
    ) {
      return { added: false, target: null };
    }
    const entry: Snippet = {
      text: trimmed,
      color: defaultColor,
      createdAt: Date.now(),
      ...(defaultStyles.length > 0 ? { styles: [...defaultStyles] } : {}),
    };
    if (defaultScope === "site") {
      siteSnippets.push(entry);
      return { added: true, target: "site" };
    } else {
      pageSnippets.push(entry);
      return { added: true, target: "page" };
    }
  }

  it("rejects empty text", () => {
    const result = addSnippet("", [], [], "yellow", "page", []);
    expect(result.added).toBe(false);
  });

  it("rejects whitespace-only text", () => {
    const result = addSnippet("   ", [], [], "yellow", "page", []);
    expect(result.added).toBe(false);
  });

  it("adds to pageSnippets when scope is page", () => {
    const page: Snippet[] = [];
    const result = addSnippet("hello", page, [], "yellow", "page", []);
    expect(result).toEqual({ added: true, target: "page" });
    expect(page).toHaveLength(1);
    expect(page[0].text).toBe("hello");
    expect(page[0].color).toBe("yellow");
  });

  it("adds to siteSnippets when scope is site", () => {
    const site: Snippet[] = [];
    const result = addSnippet("hello", [], site, "blue", "site", []);
    expect(result).toEqual({ added: true, target: "site" });
    expect(site).toHaveLength(1);
    expect(site[0].color).toBe("blue");
  });

  it("rejects duplicate in pageSnippets", () => {
    const page: Snippet[] = [{ text: "hello", color: "yellow" }];
    const result = addSnippet("hello", page, [], "yellow", "page", []);
    expect(result.added).toBe(false);
    expect(page).toHaveLength(1);
  });

  it("rejects duplicate in siteSnippets", () => {
    const site: Snippet[] = [{ text: "hello", color: "blue" }];
    const result = addSnippet("hello", [], site, "yellow", "page", []);
    expect(result.added).toBe(false);
  });

  it("trims whitespace from text", () => {
    const page: Snippet[] = [];
    addSnippet("  hello  ", page, [], "yellow", "page", []);
    expect(page[0].text).toBe("hello");
  });

  it("includes styles when defaultStyles is non-empty", () => {
    const page: Snippet[] = [];
    addSnippet("hello", page, [], "yellow", "page", ["bold", "underline"]);
    expect(page[0].styles).toEqual(["bold", "underline"]);
  });

  it("omits styles when defaultStyles is empty", () => {
    const page: Snippet[] = [];
    addSnippet("hello", page, [], "yellow", "page", []);
    expect(page[0].styles).toBeUndefined();
  });

  it("sets createdAt", () => {
    const page: Snippet[] = [];
    const before = Date.now();
    addSnippet("hello", page, [], "yellow", "page", []);
    const after = Date.now();
    expect(page[0].createdAt).toBeGreaterThanOrEqual(before);
    expect(page[0].createdAt).toBeLessThanOrEqual(after);
  });
});

// ── removeSnippet logic ──

describe("removeSnippet logic", () => {
  it("removes from pageSnippets by index", () => {
    const page: Snippet[] = [
      { text: "a", color: "yellow" },
      { text: "b", color: "blue" },
      { text: "c", color: "green" },
    ];
    const snippet: DisplaySnippet = {
      text: "b",
      color: "blue",
      _scope: "page",
      _srcIndex: 1,
    };
    const srcArr = snippet._scope === "site" ? [] : page;
    srcArr.splice(snippet._srcIndex, 1);

    expect(page).toHaveLength(2);
    expect(page.map((s) => s.text)).toEqual(["a", "c"]);
  });

  it("removes from siteSnippets by index", () => {
    const site: Snippet[] = [
      { text: "x", color: "yellow" },
      { text: "y", color: "blue" },
    ];
    const snippet: DisplaySnippet = {
      text: "x",
      color: "yellow",
      _scope: "site",
      _srcIndex: 0,
    };
    site.splice(snippet._srcIndex, 1);

    expect(site).toHaveLength(1);
    expect(site[0].text).toBe("y");
  });

  it("results in empty array when last snippet removed", () => {
    const page: Snippet[] = [{ text: "only", color: "yellow" }];
    page.splice(0, 1);
    expect(page).toHaveLength(0);
  });
});

// ── toggleSnippetScope logic ──

describe("toggleSnippetScope logic", () => {
  it("moves snippet from page to site", () => {
    const page: Snippet[] = [
      { text: "a", color: "yellow", createdAt: 100, note: "keep" },
    ];
    const site: Snippet[] = [];

    const [moved] = page.splice(0, 1);
    site.push(moved);

    expect(page).toHaveLength(0);
    expect(site).toHaveLength(1);
    expect(site[0]).toEqual({
      text: "a",
      color: "yellow",
      createdAt: 100,
      note: "keep",
    });
  });

  it("moves snippet from site to page", () => {
    const page: Snippet[] = [];
    const site: Snippet[] = [
      { text: "b", color: "blue", styles: ["bold"] },
    ];

    const [moved] = site.splice(0, 1);
    page.push(moved);

    expect(site).toHaveLength(0);
    expect(page).toHaveLength(1);
    expect(page[0].styles).toEqual(["bold"]);
  });

  it("preserves all snippet properties during move", () => {
    const page: Snippet[] = [];
    const site: Snippet[] = [
      {
        text: "full",
        color: "purple",
        createdAt: 999,
        note: "my note",
        styles: ["underline", "bold"],
      },
    ];

    const [moved] = site.splice(0, 1);
    page.push(moved);

    expect(page[0]).toEqual({
      text: "full",
      color: "purple",
      createdAt: 999,
      note: "my note",
      styles: ["underline", "bold"],
    });
  });
});

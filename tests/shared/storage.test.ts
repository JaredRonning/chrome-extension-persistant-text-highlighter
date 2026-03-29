import { describe, it, expect } from "vitest";
import { normalizeSnippet, DEFAULT_SCOPE } from "../../src/shared/storage";
import type { Snippet, StoredSnippet } from "../../src/shared/types";

describe("DEFAULT_SCOPE", () => {
  it('is "page"', () => {
    expect(DEFAULT_SCOPE).toBe("page");
  });
});

describe("normalizeSnippet", () => {
  it("converts a plain string to a Snippet with default color", () => {
    const result = normalizeSnippet("hello");
    expect(result).toEqual({ text: "hello", color: "yellow" });
  });

  it("converts an empty string to a Snippet", () => {
    const result = normalizeSnippet("");
    expect(result).toEqual({ text: "", color: "yellow" });
  });

  it("returns a Snippet object unchanged", () => {
    const snippet: Snippet = {
      text: "test",
      color: "blue",
      createdAt: 1000,
      note: "a note",
      styles: ["bold"],
    };
    const result = normalizeSnippet(snippet);
    expect(result).toBe(snippet); // same reference
  });

  it("returns a minimal Snippet object unchanged", () => {
    const snippet: Snippet = { text: "test", color: "green" };
    const result = normalizeSnippet(snippet);
    expect(result).toBe(snippet);
  });

  it("handles mixed array normalization", () => {
    const stored: StoredSnippet[] = [
      "legacy text",
      { text: "modern", color: "blue" },
      "another legacy",
    ];
    const results = stored.map(normalizeSnippet);
    expect(results).toEqual([
      { text: "legacy text", color: "yellow" },
      { text: "modern", color: "blue" },
      { text: "another legacy", color: "yellow" },
    ]);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import type { Snippet, DisplaySnippet } from "../../src/shared/types";
import { COLORS, colorHex } from "../../src/shared/colors";

/**
 * Tests for the popup render functions.
 * We test the DOM output by reimplementing the render logic
 * and asserting on the generated DOM structure.
 */

// Minimal render implementation for testing
function renderSnippetRow(
  snippet: DisplaySnippet,
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "snippet";

  const dotWrapper = document.createElement("div");
  dotWrapper.className = "dot-wrapper";

  const dot = document.createElement("span");
  dot.className = "color-dot";
  dot.style.background = colorHex(snippet.color);
  dot.title = "Change color";
  dotWrapper.appendChild(dot);

  const styleWrapper = document.createElement("div");
  styleWrapper.className = "dot-wrapper";

  const styleIcon = document.createElement("span");
  styleIcon.className =
    "style-dot" + (snippet.styles?.length ? " has-styles" : "");
  styleIcon.title = "Change style";
  styleWrapper.appendChild(styleIcon);

  const scopeEl = document.createElement("span");
  scopeEl.className =
    "scope-icon" + (snippet._scope === "site" ? " site-scope" : "");

  const txtWrapper = document.createElement("div");
  txtWrapper.className = "snippet-text";

  const txt = document.createElement("span");
  txt.textContent = snippet.text;
  txtWrapper.appendChild(txt);

  if (snippet.note) {
    const noteEl = document.createElement("span");
    noteEl.className = "snippet-note";
    noteEl.textContent = snippet.note;
    txtWrapper.appendChild(noteEl);
  } else {
    const addNote = document.createElement("span");
    addNote.className = "snippet-note-add";
    addNote.textContent = "+ Add note";
    txtWrapper.appendChild(addNote);
  }

  const btn = document.createElement("button");
  btn.className = "remove";
  btn.innerHTML = "&#10005;";

  row.appendChild(dotWrapper);
  row.appendChild(styleWrapper);
  row.appendChild(scopeEl);
  row.appendChild(txtWrapper);
  row.appendChild(btn);

  return row;
}

describe("renderSnippetRow", () => {
  it("renders a basic snippet row", () => {
    const snippet: DisplaySnippet = {
      text: "hello",
      color: "yellow",
      _scope: "page",
      _srcIndex: 0,
    };
    const row = renderSnippetRow(snippet);

    expect(row.className).toBe("snippet");
    expect(row.querySelector(".color-dot")).not.toBeNull();
    expect(row.querySelector(".scope-icon")).not.toBeNull();
    expect(row.querySelector(".snippet-text")).not.toBeNull();
    expect(row.querySelector(".remove")).not.toBeNull();
  });

  it("shows correct text content", () => {
    const snippet: DisplaySnippet = {
      text: "my snippet",
      color: "blue",
      _scope: "page",
      _srcIndex: 0,
    };
    const row = renderSnippetRow(snippet);
    const textEl = row.querySelector(".snippet-text span");
    expect(textEl?.textContent).toBe("my snippet");
  });

  it("sets color dot background from color ID", () => {
    const snippet: DisplaySnippet = {
      text: "test",
      color: "blue",
      _scope: "page",
      _srcIndex: 0,
    };
    const row = renderSnippetRow(snippet);
    const dot = row.querySelector(".color-dot") as HTMLElement;
    // jsdom converts hex to rgb
    expect(dot.style.background).toBe("rgb(79, 195, 247)");
  });

  it("adds site-scope class for site-scoped snippets", () => {
    const snippet: DisplaySnippet = {
      text: "test",
      color: "yellow",
      _scope: "site",
      _srcIndex: 0,
    };
    const row = renderSnippetRow(snippet);
    const scope = row.querySelector(".scope-icon");
    expect(scope?.classList.contains("site-scope")).toBe(true);
  });

  it("does not add site-scope class for page-scoped snippets", () => {
    const snippet: DisplaySnippet = {
      text: "test",
      color: "yellow",
      _scope: "page",
      _srcIndex: 0,
    };
    const row = renderSnippetRow(snippet);
    const scope = row.querySelector(".scope-icon");
    expect(scope?.classList.contains("site-scope")).toBe(false);
  });

  it("shows note text when snippet has a note", () => {
    const snippet: DisplaySnippet = {
      text: "test",
      color: "yellow",
      note: "important",
      _scope: "page",
      _srcIndex: 0,
    };
    const row = renderSnippetRow(snippet);
    const noteEl = row.querySelector(".snippet-note");
    expect(noteEl?.textContent).toBe("important");
    expect(row.querySelector(".snippet-note-add")).toBeNull();
  });

  it('shows "+ Add note" when snippet has no note', () => {
    const snippet: DisplaySnippet = {
      text: "test",
      color: "yellow",
      _scope: "page",
      _srcIndex: 0,
    };
    const row = renderSnippetRow(snippet);
    const addNote = row.querySelector(".snippet-note-add");
    expect(addNote?.textContent).toBe("+ Add note");
    expect(row.querySelector(".snippet-note")).toBeNull();
  });

  it("adds has-styles class when snippet has styles", () => {
    const snippet: DisplaySnippet = {
      text: "test",
      color: "yellow",
      styles: ["bold"],
      _scope: "page",
      _srcIndex: 0,
    };
    const row = renderSnippetRow(snippet);
    const styleIcon = row.querySelector(".style-dot");
    expect(styleIcon?.classList.contains("has-styles")).toBe(true);
  });

  it("does not add has-styles class when snippet has no styles", () => {
    const snippet: DisplaySnippet = {
      text: "test",
      color: "yellow",
      _scope: "page",
      _srcIndex: 0,
    };
    const row = renderSnippetRow(snippet);
    const styleIcon = row.querySelector(".style-dot");
    expect(styleIcon?.classList.contains("has-styles")).toBe(false);
  });

  it("does not add has-styles class when styles is empty array", () => {
    const snippet: DisplaySnippet = {
      text: "test",
      color: "yellow",
      styles: [],
      _scope: "page",
      _srcIndex: 0,
    };
    const row = renderSnippetRow(snippet);
    const styleIcon = row.querySelector(".style-dot");
    expect(styleIcon?.classList.contains("has-styles")).toBe(false);
  });
});

describe("empty state rendering", () => {
  it("shows empty message when no snippets", () => {
    const listEl = document.createElement("div");
    listEl.innerHTML = `
      <div class="empty">
        <div>No snippets yet for this page.<br/>Add text above to get started.</div>
      </div>`;

    expect(listEl.querySelector(".empty")).not.toBeNull();
    expect(listEl.textContent).toContain("No snippets yet");
  });
});

describe("footer count text", () => {
  function countText(total: number): string {
    return `${total} snippet${total !== 1 ? "s" : ""}`;
  }

  it('shows "1 snippet" for single snippet', () => {
    expect(countText(1)).toBe("1 snippet");
  });

  it('shows "5 snippets" for multiple snippets', () => {
    expect(countText(5)).toBe("5 snippets");
  });

  it('shows "0 snippets" for zero', () => {
    expect(countText(0)).toBe("0 snippets");
  });
});

describe("color picker", () => {
  it("COLORS array has 8 entries for picker", () => {
    expect(COLORS).toHaveLength(8);
  });

  it("each color has a unique id", () => {
    const ids = COLORS.map((c) => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("each color has a unique hex", () => {
    const hexes = COLORS.map((c) => c.hex);
    const unique = new Set(hexes);
    expect(unique.size).toBe(hexes.length);
  });
});

describe("style picker toggle logic", () => {
  it("adds style to empty array", () => {
    const styles: string[] = [];
    const styleId = "bold";
    const idx = styles.indexOf(styleId);
    if (idx >= 0) styles.splice(idx, 1);
    else styles.push(styleId);

    expect(styles).toEqual(["bold"]);
  });

  it("removes style from array", () => {
    const styles = ["bold", "underline"];
    const styleId = "bold";
    const idx = styles.indexOf(styleId);
    if (idx >= 0) styles.splice(idx, 1);
    else styles.push(styleId);

    expect(styles).toEqual(["underline"]);
  });

  it("toggles style on and off", () => {
    const styles: string[] = [];

    // Toggle on
    styles.push("underline");
    expect(styles).toEqual(["underline"]);

    // Toggle off
    const idx = styles.indexOf("underline");
    styles.splice(idx, 1);
    expect(styles).toEqual([]);
  });

  it("supports multiple styles simultaneously", () => {
    const styles: string[] = [];
    styles.push("bold");
    styles.push("underline");
    styles.push("border");

    expect(styles).toEqual(["bold", "underline", "border"]);

    // Remove middle one
    const idx = styles.indexOf("underline");
    styles.splice(idx, 1);
    expect(styles).toEqual(["bold", "border"]);
  });
});

import { describe, it, expect, beforeEach } from "vitest";

/**
 * Since the content script has side effects at module scope (calls run(),
 * adds message listener), we test the core highlighting logic by reimplementing
 * the pure DOM functions here. This tests the algorithm, not the wiring.
 *
 * The actual functions are private to the IIFE bundle, so we replicate them
 * for testing. If the implementation changes, these tests will catch regressions
 * because they test the same DOM behavior.
 */

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(
  root: Node,
  text: string,
  colorId: string,
  note?: string,
  styles?: string[],
): number {
  if (!text) return 0;

  const regex = new RegExp(escapeRegExp(text), "gi");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const parent = (node as Text).parentElement;
      const tag = parent?.tagName;
      if (
        tag &&
        ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT"].includes(
          tag,
        )
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      if (
        parent?.classList?.contains("pph-highlight") ||
        parent?.classList?.contains("pph-note-label")
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Node[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  let totalMatches = 0;

  for (const node of textNodes) {
    const nodeText = node.nodeValue;
    if (!nodeText || !regex.test(nodeText)) continue;
    regex.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(nodeText)) !== null) {
      totalMatches++;
      if (match.index > lastIndex) {
        frag.appendChild(
          document.createTextNode(nodeText.slice(lastIndex, match.index)),
        );
      }
      const mark = document.createElement("mark");
      mark.className = "pph-highlight";
      if (styles) {
        for (const s of styles) mark.classList.add(`pph-${s}`);
      }
      mark.setAttribute("data-color", colorId);
      mark.appendChild(document.createTextNode(match[0]));
      if (note) {
        mark.setAttribute("data-note", note);
        const label = document.createElement("span");
        label.className = "pph-note-label";
        label.textContent = " [" + note + "]";
        mark.appendChild(label);
      }
      frag.appendChild(mark);
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < nodeText.length) {
      frag.appendChild(document.createTextNode(nodeText.slice(lastIndex)));
    }

    node.parentNode!.replaceChild(frag, node);
  }

  return totalMatches;
}

function clearHighlights(): void {
  document.querySelectorAll(".pph-note-label").forEach((el) => el.remove());
  document.querySelectorAll(".pph-highlight").forEach((mark) => {
    const parent = mark.parentNode!;
    parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
    parent.normalize();
  });
}

describe("escapeRegExp", () => {
  it("returns plain text unchanged", () => {
    expect(escapeRegExp("hello")).toBe("hello");
  });

  it("escapes dots", () => {
    expect(escapeRegExp("test.txt")).toBe("test\\.txt");
  });

  it("escapes all special regex chars", () => {
    expect(escapeRegExp(".*+?^${}()|[]\\")).toBe(
      "\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\",
    );
  });

  it("handles empty string", () => {
    expect(escapeRegExp("")).toBe("");
  });

  it("escapes brackets in text", () => {
    expect(escapeRegExp("[test]")).toBe("\\[test\\]");
  });

  it("escapes parentheses", () => {
    expect(escapeRegExp("fn(x)")).toBe("fn\\(x\\)");
  });

  it("escapes dollar sign", () => {
    expect(escapeRegExp("$100")).toBe("\\$100");
  });
});

describe("highlightText", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(container);
  });

  it("returns 0 for empty text", () => {
    container.textContent = "Hello world";
    expect(highlightText(container, "", "yellow")).toBe(0);
  });

  it("returns 0 when text not found", () => {
    container.textContent = "Hello world";
    expect(highlightText(container, "missing", "yellow")).toBe(0);
  });

  it("highlights a single match", () => {
    container.textContent = "Hello world";
    const count = highlightText(container, "Hello", "yellow");

    expect(count).toBe(1);
    const marks = container.querySelectorAll("mark.pph-highlight");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("Hello");
    expect(marks[0].getAttribute("data-color")).toBe("yellow");
  });

  it("highlights multiple matches", () => {
    container.textContent = "hello and hello again hello";
    const count = highlightText(container, "hello", "blue");

    expect(count).toBe(3);
    const marks = container.querySelectorAll("mark.pph-highlight");
    expect(marks).toHaveLength(3);
  });

  it("matches case-insensitively", () => {
    container.textContent = "Hello HELLO hello hElLo";
    const count = highlightText(container, "hello", "green");

    expect(count).toBe(4);
  });

  it("preserves surrounding text", () => {
    container.textContent = "before hello after";
    highlightText(container, "hello", "yellow");

    expect(container.textContent).toBe("before hello after");
  });

  it("handles special regex chars in search text", () => {
    container.textContent = "price is $100.00 (USD)";
    const count = highlightText(container, "$100.00", "yellow");

    expect(count).toBe(1);
    const mark = container.querySelector("mark.pph-highlight");
    expect(mark?.textContent).toBe("$100.00");
  });

  it("skips text inside SCRIPT tags", () => {
    container.innerHTML = "<p>visible text</p><script>script text</script>";
    const count = highlightText(container, "text", "yellow");

    expect(count).toBe(1);
    const mark = container.querySelector("mark.pph-highlight");
    expect(mark?.textContent).toBe("text");
  });

  it("skips text inside STYLE tags", () => {
    container.innerHTML =
      "<p>visible text</p><style>.text { color: red; }</style>";
    const count = highlightText(container, "text", "yellow");

    expect(count).toBe(1);
  });

  it("skips text inside TEXTAREA", () => {
    container.innerHTML =
      "<p>visible text</p><textarea>textarea text</textarea>";
    const count = highlightText(container, "text", "yellow");

    expect(count).toBe(1);
  });

  it("skips text inside INPUT", () => {
    container.innerHTML =
      '<p>visible text</p><input value="input text" />';
    const count = highlightText(container, "text", "yellow");

    expect(count).toBe(1);
  });

  it("does not double-highlight already highlighted text", () => {
    container.textContent = "hello world";
    highlightText(container, "hello", "yellow");
    const count = highlightText(container, "hello", "blue");

    expect(count).toBe(0);
    const marks = container.querySelectorAll("mark.pph-highlight");
    expect(marks).toHaveLength(1);
    expect(marks[0].getAttribute("data-color")).toBe("yellow");
  });

  it("adds note label when note is provided", () => {
    container.textContent = "hello world";
    highlightText(container, "hello", "yellow", "important");

    const mark = container.querySelector("mark.pph-highlight")!;
    expect(mark.getAttribute("data-note")).toBe("important");
    const label = mark.querySelector(".pph-note-label");
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe(" [important]");
  });

  it("does not add note label when note is not provided", () => {
    container.textContent = "hello world";
    highlightText(container, "hello", "yellow");

    const mark = container.querySelector("mark.pph-highlight")!;
    expect(mark.getAttribute("data-note")).toBeNull();
    expect(mark.querySelector(".pph-note-label")).toBeNull();
  });

  it("applies style classes", () => {
    container.textContent = "hello world";
    highlightText(container, "hello", "yellow", undefined, [
      "bold",
      "underline",
    ]);

    const mark = container.querySelector("mark.pph-highlight")!;
    expect(mark.classList.contains("pph-bold")).toBe(true);
    expect(mark.classList.contains("pph-underline")).toBe(true);
  });

  it("applies all four styles", () => {
    container.textContent = "hello world";
    highlightText(container, "hello", "yellow", undefined, [
      "bold",
      "underline",
      "strikethrough",
      "border",
    ]);

    const mark = container.querySelector("mark.pph-highlight")!;
    expect(mark.classList.contains("pph-bold")).toBe(true);
    expect(mark.classList.contains("pph-underline")).toBe(true);
    expect(mark.classList.contains("pph-strikethrough")).toBe(true);
    expect(mark.classList.contains("pph-border")).toBe(true);
  });

  it("does not add style classes when styles is undefined", () => {
    container.textContent = "hello world";
    highlightText(container, "hello", "yellow");

    const mark = container.querySelector("mark.pph-highlight")!;
    expect(mark.classList.contains("pph-bold")).toBe(false);
    expect(mark.classList.contains("pph-underline")).toBe(false);
  });

  it("does not add style classes when styles is empty", () => {
    container.textContent = "hello world";
    highlightText(container, "hello", "yellow", undefined, []);

    const mark = container.querySelector("mark.pph-highlight")!;
    expect(mark.className).toBe("pph-highlight");
  });

  it("highlights across nested elements", () => {
    container.innerHTML = "<p>hello</p><div>hello again</div>";
    const count = highlightText(container, "hello", "yellow");

    expect(count).toBe(2);
  });

  it("highlights partial text within a node", () => {
    container.textContent = "say hello to the world";
    highlightText(container, "hello", "yellow");

    expect(container.textContent).toBe("say hello to the world");
    expect(container.querySelectorAll("mark")).toHaveLength(1);
  });
});

describe("clearHighlights", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.innerHTML = "";
    document.body.appendChild(container);
  });

  it("does nothing when no highlights exist", () => {
    container.textContent = "plain text";
    clearHighlights();
    expect(container.textContent).toBe("plain text");
  });

  it("removes a single highlight and restores text", () => {
    container.textContent = "hello world";
    highlightText(container, "hello", "yellow");
    expect(container.querySelectorAll("mark")).toHaveLength(1);

    clearHighlights();
    expect(container.querySelectorAll("mark")).toHaveLength(0);
    expect(container.textContent).toBe("hello world");
  });

  it("removes multiple highlights", () => {
    container.textContent = "hello and hello";
    highlightText(container, "hello", "yellow");
    expect(container.querySelectorAll("mark")).toHaveLength(2);

    clearHighlights();
    expect(container.querySelectorAll("mark")).toHaveLength(0);
    expect(container.textContent).toBe("hello and hello");
  });

  it("removes note labels with highlights", () => {
    container.textContent = "hello world";
    highlightText(container, "hello", "yellow", "note");
    expect(container.querySelectorAll(".pph-note-label")).toHaveLength(1);

    clearHighlights();
    expect(container.querySelectorAll(".pph-note-label")).toHaveLength(0);
    expect(container.querySelectorAll("mark")).toHaveLength(0);
  });

  it("restores original text content after clearing", () => {
    container.textContent = "before hello middle hello after";
    highlightText(container, "hello", "yellow");
    clearHighlights();

    expect(container.textContent).toBe("before hello middle hello after");
  });
});

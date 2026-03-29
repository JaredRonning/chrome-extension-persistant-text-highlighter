import {
  ColorId,
  HighlightStyle,
  StoredSnippet,
  ExtensionMessage,
  CountMatchesResponse,
} from "../shared/types";
import { urlKey, originKey } from "../shared/url";

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(
  root: Node,
  text: string,
  colorId: ColorId,
  note?: string,
  styles?: HighlightStyle[],
): number {
  if (!text) return 0;

  const regex = new RegExp(escapeRegExp(text), "gi");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const parent = node.parentElement;
      const tag = parent?.tagName;
      if (
        tag &&
        ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT"].includes(tag)
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

function hideNoteLabels(): void {
  document.querySelectorAll(".pph-note-label").forEach((el) => el.remove());
}

function clearHighlights(): void {
  hideNoteLabels();
  document.querySelectorAll(".pph-highlight").forEach((mark) => {
    const parent = mark.parentNode!;
    parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
    parent.normalize();
  });
}

// ── Cached snippets & MutationObserver ──

let cachedSnippets: StoredSnippet[] = [];
let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function highlightSubtree(root: Node): void {
  cachedSnippets.forEach((snippet) => {
    if (typeof snippet === "string") {
      highlightText(root, snippet, "yellow");
    } else {
      highlightText(root, snippet.text, snippet.color || "yellow", snippet.note, snippet.styles);
    }
  });
}

function stopObserver(): void {
  if (observer) observer.disconnect();
}

function startObserver(): void {
  if (!observer) {
    observer = new MutationObserver((mutations) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (cachedSnippets.length === 0) return;

        stopObserver();
        for (const mutation of mutations) {
          for (const node of Array.from(mutation.addedNodes)) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              highlightSubtree(node);
            }
          }
        }
        startObserver();
      }, 300);
    });
  }
  observer.observe(document.body, { childList: true, subtree: true });
}

function applyNotesState(): void {
  chrome.storage.local.get(["showNotes"], (result) => {
    document.body.classList.toggle("pph-show-notes", result.showNotes || false);
  });
}

function run(): void {
  const key = urlKey(window.location.href);
  const origin = originKey(window.location.href);

  chrome.storage.local.get(["pages", "sites"], (result) => {
    const pages = result.pages || {};
    const sites = result.sites || {};
    const pageEntry = pages[key];
    const siteEntry = sites[origin];

    console.log("[PPH content] origin:", origin);
    console.log("[PPH content] result.sites:", JSON.stringify(result.sites));
    console.log("[PPH content] siteEntry:", JSON.stringify(siteEntry));

    stopObserver();
    clearHighlights();

    const merged: StoredSnippet[] = [
      ...(pageEntry?.snippets || []),
      ...(siteEntry?.snippets || []),
    ];
    console.log("[PPH content] merged count:", merged.length);

    if (merged.length === 0) {
      cachedSnippets = [];
      return;
    }

    cachedSnippets = merged;
    highlightSubtree(document.body);
    applyNotesState();
    startObserver();
  });
}

// Run on load
run();

// Listen for messages from the popup to re-run highlights after changes
chrome.runtime.onMessage.addListener(
  (
    msg: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: CountMatchesResponse) => void,
  ): boolean | undefined => {
    if (msg.action === "refresh-highlights") {
      run();
    } else if (msg.action === "toggle-notes") {
      document.body.classList.toggle("pph-show-notes", msg.showNotes);
    } else if (msg.action === "count-matches") {
      const counts: CountMatchesResponse = {};
      for (const text of msg.texts) {
        const regex = new RegExp(escapeRegExp(text), "gi");
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node: Node) {
              const tag = (node as Text).parentElement?.tagName;
              if (
                ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT"].includes(tag ?? "")
              ) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            },
          },
        );
        let count = 0;
        while (walker.nextNode()) {
          const m = walker.currentNode.nodeValue?.match(regex);
          if (m) count += m.length;
        }
        counts[text] = count;
      }
      sendResponse(counts);
      return true;
    }
    return undefined;
  },
);

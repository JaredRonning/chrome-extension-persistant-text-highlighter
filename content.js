/**
 * Persistent Page Highlighter — Content Script
 * Runs on every page, checks storage for snippets matching the current URL,
 * and highlights every occurrence in the DOM using per-snippet colors.
 */

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Walk text nodes inside `root` and wrap matches with <mark> tags.
 * colorId is the color identifier stored per snippet (e.g. "yellow", "blue").
 */
function highlightText(root, text, colorId, note) {
  if (!text) return 0;

  const regex = new RegExp(escapeRegExp(text), "gi");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const tag = node.parentElement?.tagName;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT"].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (node.parentElement?.classList?.contains("pph-highlight") ||
          node.parentElement?.classList?.contains("pph-note-label")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  let totalMatches = 0;

  for (const node of textNodes) {
    const nodeText = node.nodeValue;
    if (!regex.test(nodeText)) continue;
    regex.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(nodeText)) !== null) {
      totalMatches++;
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(nodeText.slice(lastIndex, match.index)));
      }
      const mark = document.createElement("mark");
      mark.className = "pph-highlight";
      mark.setAttribute("data-color", colorId);
      if (note) mark.setAttribute("data-note", note);
      mark.textContent = match[0];
      frag.appendChild(mark);
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < nodeText.length) {
      frag.appendChild(document.createTextNode(nodeText.slice(lastIndex)));
    }

    node.parentNode.replaceChild(frag, node);
  }

  return totalMatches;
}

function clearHighlights() {
  hideNoteLabels();
  document.querySelectorAll(".pph-highlight").forEach((mark) => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
}

function urlKey(urlStr) {
  try {
    const u = new URL(urlStr);
    return (u.origin + u.pathname).replace(/\/+$/, "");
  } catch {
    return urlStr;
  }
}

// ── Cached snippets & MutationObserver ──

let cachedSnippets = [];
let observer = null;
let debounceTimer = null;

function highlightSubtree(root) {
  cachedSnippets.forEach((snippet) => {
    if (typeof snippet === "string") {
      highlightText(root, snippet, "yellow");
    } else {
      highlightText(root, snippet.text, snippet.color || "yellow", snippet.note);
    }
  });
}

function stopObserver() {
  if (observer) observer.disconnect();
}

function startObserver() {
  if (!observer) {
    observer = new MutationObserver((mutations) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (cachedSnippets.length === 0) return;

        stopObserver();
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
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

function applyNotesState() {
  chrome.storage.local.get(["showNotes"], (result) => {
    document.body.classList.toggle("pph-show-notes", result.showNotes || false);
    showNoteLabels();
  });
}

// ── Inline note labels (inserted after highlights) ──

function hideNoteLabels() {
  document.querySelectorAll(".pph-note-label").forEach((el) => el.remove());
}

function showNoteLabels() {
  hideNoteLabels();
  if (!document.body.classList.contains("pph-show-notes")) return;
  stopObserver();
  document.querySelectorAll(".pph-highlight[data-note]").forEach((mark) => {
    const label = document.createElement("span");
    label.className = "pph-note-label";
    label.textContent = " [" + mark.getAttribute("data-note") + "]";
    mark.after(label);
  });
  if (cachedSnippets.length > 0) startObserver();
}

function run() {
  const key = urlKey(window.location.href);

  chrome.storage.local.get(["pages"], (result) => {
    const pages = result.pages || {};
    const entry = pages[key];

    stopObserver();
    clearHighlights();

    if (!entry || !entry.snippets || entry.snippets.length === 0) {
      cachedSnippets = [];
      return;
    }

    cachedSnippets = entry.snippets;
    highlightSubtree(document.body);
    applyNotesState();
    startObserver();
  });
}

// Run on load
run();

// Listen for messages from the popup to re-run highlights after changes
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "refresh-highlights") {
    run();
  } else if (msg.action === "toggle-notes") {
    document.body.classList.toggle("pph-show-notes", msg.showNotes);
    showNoteLabels();
  }
});

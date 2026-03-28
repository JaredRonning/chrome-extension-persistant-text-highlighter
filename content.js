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
function highlightText(root, text, colorId) {
  if (!text) return 0;

  const regex = new RegExp(escapeRegExp(text), "gi");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const tag = node.parentElement?.tagName;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT"].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (node.parentElement?.classList?.contains("pph-highlight")) {
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

function run() {
  const key = urlKey(window.location.href);

  chrome.storage.local.get(["pages"], (result) => {
    const pages = result.pages || {};
    const entry = pages[key];
    if (!entry || !entry.snippets || entry.snippets.length === 0) return;

    clearHighlights();

    entry.snippets.forEach((snippet) => {
      // Support both old format (plain string) and new format ({text, color})
      if (typeof snippet === "string") {
        highlightText(document.body, snippet, "yellow");
      } else {
        highlightText(document.body, snippet.text, snippet.color || "yellow");
      }
    });
  });
}

// Run on load
run();

// Listen for messages from the popup to re-run highlights after changes
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "refresh-highlights") {
    clearHighlights();
    run();
  }
});

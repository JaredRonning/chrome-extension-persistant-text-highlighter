/**
 * Color palette — shared between popup and content script via color ID.
 * Each entry: { id, hex, label }
 */
const COLORS = [
  { id: "yellow", hex: "#fff176", label: "Yellow" },
  { id: "green",  hex: "#aed581", label: "Green" },
  { id: "blue",   hex: "#4fc3f7", label: "Blue" },
  { id: "orange", hex: "#ff8a65", label: "Orange" },
  { id: "purple", hex: "#ce93d8", label: "Purple" },
  { id: "pink",   hex: "#f48fb1", label: "Pink" },
  { id: "teal",   hex: "#80cbc4", label: "Teal" },
  { id: "amber",  hex: "#ffcc80", label: "Amber" },
];

const DEFAULT_COLOR = "yellow";
const DEFAULT_SCOPE = "page";

// ── DOM refs ──
const listEl = document.getElementById("list");
const footerEl = document.getElementById("footer");
const countEl = document.getElementById("count");
const inputEl = document.getElementById("snippetInput");
const addBtn = document.getElementById("addBtn");
const clearBtn = document.getElementById("clearBtn");
const rehighlightBtn = document.getElementById("rehighlightBtn");
const toggleNotesBtn = document.getElementById("toggleNotesBtn");
const pageDomainEl = document.getElementById("pageDomain");
const pagePathEl = document.getElementById("pagePath");
const defaultPaletteEl = document.getElementById("defaultPalette");
const scopeToggleEl = document.getElementById("scopeToggle");

let currentKey = "";      // origin + pathname (page-level key)
let currentOrigin = "";   // origin only (site-level key)
let pageSnippets = [];    // snippets scoped to this page
let siteSnippets = [];    // snippets scoped to this site (origin)
let defaultColor = DEFAULT_COLOR;
let defaultScope = DEFAULT_SCOPE;
let openPopoverIndex = -1;
let showNotes = false;

// ── Helpers ──

function timeAgo(ts) {
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

function colorHex(id) {
  return COLORS.find((c) => c.id === id)?.hex || COLORS[0].hex;
}

function urlKey(urlStr) {
  try {
    const u = new URL(urlStr);
    return (u.origin + u.pathname).replace(/\/+$/, "");
  } catch {
    return urlStr;
  }
}

function originKey(urlStr) {
  try {
    return new URL(urlStr).origin;
  } catch {
    return urlStr;
  }
}

/** Build a merged display list with _scope tags */
function buildDisplayList() {
  const list = [];
  pageSnippets.forEach((s, i) => list.push({ ...s, _scope: "page", _srcIndex: i }));
  siteSnippets.forEach((s, i) => list.push({ ...s, _scope: "site", _srcIndex: i }));
  // Sort by createdAt descending (newest first) — fallback to insertion order
  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return list;
}

// ── Storage ──

function save(callback) {
  chrome.storage.local.get(["pages", "sites"], (result) => {
    const pages = result.pages || {};
    const sites = result.sites || {};

    if (pageSnippets.length === 0) {
      delete pages[currentKey];
    } else {
      pages[currentKey] = { snippets: pageSnippets };
    }

    if (siteSnippets.length === 0) {
      delete sites[currentOrigin];
    } else {
      sites[currentOrigin] = { snippets: siteSnippets };
    }

    chrome.storage.local.set({ pages, sites, defaultColor, defaultScope }, () => {
      notifyContentScript();
      if (callback) callback();
    });
  });
}

function notifyContentScript() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "refresh-highlights" }).catch(() => {});
    }
  });
}

// ── Default color palette ──

function renderDefaultPalette() {
  defaultPaletteEl.innerHTML = "";
  COLORS.forEach((c) => {
    const sw = document.createElement("span");
    sw.className = "swatch" + (defaultColor === c.id ? " selected" : "");
    sw.style.background = c.hex;
    sw.title = c.label;
    sw.addEventListener("click", () => {
      defaultColor = c.id;
      chrome.storage.local.set({ defaultColor });
      renderDefaultPalette();
    });
    defaultPaletteEl.appendChild(sw);
  });
}

// ── Scope toggle ──

function renderScopeToggle() {
  scopeToggleEl.querySelectorAll(".scope-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.scope === defaultScope);
  });
}

scopeToggleEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".scope-btn");
  if (!btn) return;
  defaultScope = btn.dataset.scope;
  chrome.storage.local.set({ defaultScope });
  renderScopeToggle();
});

// ── SVG helpers for scope icons in snippet rows ──

function pageSvg() {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
}

function globeSvg() {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>';
}

// ── Snippet list ──

function closeAllPopovers() {
  openPopoverIndex = -1;
  document.querySelectorAll(".color-picker-popover").forEach((el) => el.remove());
}

function render() {
  closeAllPopovers();
  listEl.innerHTML = "";

  const displayList = buildDisplayList();

  if (displayList.length === 0) {
    listEl.innerHTML = `
      <div class="empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        <div>No snippets yet for this page.<br/>Add text above to get started.</div>
      </div>`;
    footerEl.style.display = "none";
    return;
  }

  displayList.forEach((snippet, i) => {
    const row = document.createElement("div");
    row.className = "snippet";

    // Dot wrapper (holds dot + popover)
    const dotWrapper = document.createElement("div");
    dotWrapper.className = "dot-wrapper";

    const dot = document.createElement("span");
    dot.className = "color-dot";
    dot.style.background = colorHex(snippet.color);
    dot.title = "Change color";
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleColorPicker(i, dotWrapper, snippet);
    });

    dotWrapper.appendChild(dot);

    // Scope icon
    const scopeEl = document.createElement("span");
    scopeEl.className = "scope-icon" + (snippet._scope === "site" ? " site-scope" : "");
    scopeEl.innerHTML = snippet._scope === "site" ? globeSvg() : pageSvg();
    scopeEl.title = snippet._scope === "site" ? "Site-wide — click for page only" : "Page only — click for site-wide";
    scopeEl.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSnippetScope(snippet);
    });

    const txtWrapper = document.createElement("div");
    txtWrapper.className = "snippet-text";

    const txt = document.createElement("span");
    txt.textContent = snippet.text;
    txtWrapper.appendChild(txt);

    const ago = timeAgo(snippet.createdAt);
    if (ago) {
      const ts = document.createElement("span");
      ts.className = "snippet-time";
      ts.textContent = ago;
      txtWrapper.appendChild(ts);
    }

    // Note area
    if (snippet.note) {
      const noteEl = document.createElement("span");
      noteEl.className = "snippet-note";
      noteEl.textContent = snippet.note;
      noteEl.addEventListener("click", (e) => {
        e.stopPropagation();
        showNoteEditor(txtWrapper, noteEl, snippet, snippet.note);
      });
      txtWrapper.appendChild(noteEl);
    } else {
      const addNote = document.createElement("span");
      addNote.className = "snippet-note-add";
      addNote.textContent = "+ Add note";
      addNote.addEventListener("click", (e) => {
        e.stopPropagation();
        showNoteEditor(txtWrapper, addNote, snippet, "");
      });
      txtWrapper.appendChild(addNote);
    }

    const btn = document.createElement("button");
    btn.className = "remove";
    btn.innerHTML = "&#10005;";
    btn.title = "Remove snippet";
    btn.addEventListener("click", () => removeSnippet(snippet));

    row.appendChild(dotWrapper);
    row.appendChild(scopeEl);
    row.appendChild(txtWrapper);
    row.appendChild(btn);
    listEl.appendChild(row);
  });

  footerEl.style.display = "flex";
  const total = displayList.length;
  countEl.textContent = `${total} snippet${total !== 1 ? "s" : ""}`;
}

function toggleColorPicker(displayIndex, parentEl, snippet) {
  if (openPopoverIndex === displayIndex) {
    closeAllPopovers();
    return;
  }
  closeAllPopovers();
  openPopoverIndex = displayIndex;

  const popover = document.createElement("div");
  popover.className = "color-picker-popover";

  COLORS.forEach((c) => {
    const sw = document.createElement("span");
    sw.className = "swatch" + (snippet.color === c.id ? " active" : "");
    sw.style.background = c.hex;
    sw.title = c.label;
    sw.addEventListener("click", (e) => {
      e.stopPropagation();
      // Update the source array
      const srcArr = snippet._scope === "site" ? siteSnippets : pageSnippets;
      srcArr[snippet._srcIndex].color = c.id;
      save(() => render());
    });
    popover.appendChild(sw);
  });

  parentEl.appendChild(popover);
}

// ── Note editor ──

function showNoteEditor(parent, replaceEl, snippet, currentNote) {
  const textarea = document.createElement("textarea");
  textarea.className = "snippet-note-input";
  textarea.value = currentNote;
  textarea.placeholder = "Type a note…";
  parent.replaceChild(textarea, replaceEl);
  textarea.focus();

  function saveNote() {
    const note = textarea.value.trim();
    const srcArr = snippet._scope === "site" ? siteSnippets : pageSnippets;
    srcArr[snippet._srcIndex].note = note || undefined;
    save(() => render());
  }

  textarea.addEventListener("blur", saveNote);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      textarea.blur();
    }
  });
  textarea.addEventListener("click", (e) => e.stopPropagation());
}

// ── Actions ──

function addSnippet() {
  const text = inputEl.value.trim();
  if (!text) return;
  // Check for duplicates in both arrays
  if (pageSnippets.some((s) => s.text === text) || siteSnippets.some((s) => s.text === text)) {
    inputEl.select();
    return;
  }
  const entry = { text, color: defaultColor, createdAt: Date.now() };
  if (defaultScope === "site") {
    siteSnippets.push(entry);
  } else {
    pageSnippets.push(entry);
  }
  inputEl.value = "";
  save(() => render());
}

function removeSnippet(snippet) {
  const srcArr = snippet._scope === "site" ? siteSnippets : pageSnippets;
  srcArr.splice(snippet._srcIndex, 1);
  save(() => render());
}

function toggleSnippetScope(snippet) {
  const fromArr = snippet._scope === "site" ? siteSnippets : pageSnippets;
  const toArr = snippet._scope === "site" ? pageSnippets : siteSnippets;
  // Remove from source, strip internal fields, add to target
  const [moved] = fromArr.splice(snippet._srcIndex, 1);
  toArr.push(moved);
  save(() => render());
}

// ── Close popover on outside click ──
document.addEventListener("click", () => {
  closeAllPopovers();
});

// ── Event Listeners ──
addBtn.addEventListener("click", addSnippet);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addSnippet();
});
clearBtn.addEventListener("click", () => {
  const total = pageSnippets.length + siteSnippets.length;
  if (total === 0) return;
  if (confirm(`Remove all ${total} snippet${total !== 1 ? "s" : ""} from this page?`)) {
    pageSnippets = [];
    siteSnippets = [];
    save(() => render());
  }
});
rehighlightBtn.addEventListener("click", () => {
  notifyContentScript();
});
toggleNotesBtn.addEventListener("click", () => {
  showNotes = !showNotes;
  toggleNotesBtn.innerHTML = showNotes ? "Show notes &#9679;" : "Show notes &#9675;";
  chrome.storage.local.set({ showNotes });
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: "toggle-notes", showNotes }).catch(() => {});
    }
  });
});

// ── Version ──
fetch(chrome.runtime.getURL("version.json"))
  .then((r) => r.json())
  .then((data) => {
    document.getElementById("version").textContent = "v" + data.version;
  })
  .catch(() => {});

// ── Init ──
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab?.url) return;

  currentKey = urlKey(tab.url);
  currentOrigin = originKey(tab.url);
  try {
    const u = new URL(tab.url);
    pageDomainEl.textContent = u.origin;
    const path = u.pathname.replace(/\/+$/, "");
    pagePathEl.textContent = path || "/";
  } catch {
    pageDomainEl.textContent = currentKey;
  }

  chrome.storage.local.get(["pages", "sites", "defaultColor", "defaultScope", "showNotes"], (result) => {
    const pages = result.pages || {};
    const sites = result.sites || {};

    // Migrate old format: if snippets are plain strings, convert them
    const storedPage = pages[currentKey]?.snippets || [];
    pageSnippets = storedPage.map((s) => {
      if (typeof s === "string") return { text: s, color: DEFAULT_COLOR };
      return s;
    });

    const storedSite = sites[currentOrigin]?.snippets || [];
    siteSnippets = storedSite.map((s) => {
      if (typeof s === "string") return { text: s, color: DEFAULT_COLOR };
      return s;
    });

    defaultColor = result.defaultColor || DEFAULT_COLOR;
    defaultScope = result.defaultScope || DEFAULT_SCOPE;
    showNotes = result.showNotes || false;
    toggleNotesBtn.innerHTML = showNotes ? "Show notes &#9679;" : "Show notes &#9675;";
    renderDefaultPalette();
    renderScopeToggle();
    render();
    inputEl.focus();
  });
});

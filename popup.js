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

// ── DOM refs ──
const listEl = document.getElementById("list");
const footerEl = document.getElementById("footer");
const countEl = document.getElementById("count");
const inputEl = document.getElementById("snippetInput");
const addBtn = document.getElementById("addBtn");
const clearBtn = document.getElementById("clearBtn");
const rehighlightBtn = document.getElementById("rehighlightBtn");
const toggleNotesBtn = document.getElementById("toggleNotesBtn");
const pageUrlEl = document.getElementById("pageUrl");
const defaultPaletteEl = document.getElementById("defaultPalette");

let currentKey = "";
let snippets = [];        // Array of { text: string, color: string (color id) }
let defaultColor = DEFAULT_COLOR;
let openPopoverIndex = -1; // which snippet has its color picker open
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

// ── Storage ──

function save(callback) {
  chrome.storage.local.get(["pages", "defaultColor"], (result) => {
    const pages = result.pages || {};
    if (snippets.length === 0) {
      delete pages[currentKey];
    } else {
      pages[currentKey] = { snippets };
    }
    chrome.storage.local.set({ pages, defaultColor }, () => {
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
      // Save the global default (not page-specific)
      chrome.storage.local.set({ defaultColor });
      renderDefaultPalette();
    });
    defaultPaletteEl.appendChild(sw);
  });
}

// ── Snippet list ──

function closeAllPopovers() {
  openPopoverIndex = -1;
  document.querySelectorAll(".color-picker-popover").forEach((el) => el.remove());
}

function render() {
  closeAllPopovers();
  listEl.innerHTML = "";

  if (snippets.length === 0) {
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

  snippets.forEach((snippet, i) => {
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
      toggleColorPicker(i, dotWrapper, snippet.color);
    });

    dotWrapper.appendChild(dot);

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
        showNoteEditor(txtWrapper, noteEl, i, snippet.note);
      });
      txtWrapper.appendChild(noteEl);
    } else {
      const addNote = document.createElement("span");
      addNote.className = "snippet-note-add";
      addNote.textContent = "+ Add note";
      addNote.addEventListener("click", (e) => {
        e.stopPropagation();
        showNoteEditor(txtWrapper, addNote, i, "");
      });
      txtWrapper.appendChild(addNote);
    }

    const btn = document.createElement("button");
    btn.className = "remove";
    btn.innerHTML = "&#10005;";
    btn.title = "Remove snippet";
    btn.addEventListener("click", () => removeSnippet(i));

    row.appendChild(dotWrapper);
    row.appendChild(txtWrapper);
    row.appendChild(btn);
    listEl.appendChild(row);
  });

  footerEl.style.display = "flex";
  countEl.textContent = `${snippets.length} snippet${snippets.length !== 1 ? "s" : ""}`;
}

function toggleColorPicker(index, parentEl, currentColorId) {
  // If already open for this index, close it
  if (openPopoverIndex === index) {
    closeAllPopovers();
    return;
  }
  closeAllPopovers();
  openPopoverIndex = index;

  const popover = document.createElement("div");
  popover.className = "color-picker-popover";

  COLORS.forEach((c) => {
    const sw = document.createElement("span");
    sw.className = "swatch" + (currentColorId === c.id ? " active" : "");
    sw.style.background = c.hex;
    sw.title = c.label;
    sw.addEventListener("click", (e) => {
      e.stopPropagation();
      snippets[index].color = c.id;
      save(() => render());
    });
    popover.appendChild(sw);
  });

  parentEl.appendChild(popover);
}

// ── Note editor ──

function showNoteEditor(parent, replaceEl, index, currentNote) {
  const textarea = document.createElement("textarea");
  textarea.className = "snippet-note-input";
  textarea.value = currentNote;
  textarea.placeholder = "Type a note…";
  parent.replaceChild(textarea, replaceEl);
  textarea.focus();

  function saveNote() {
    const note = textarea.value.trim();
    snippets[index].note = note || undefined;
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
  if (snippets.some((s) => s.text === text)) {
    inputEl.select();
    return;
  }
  snippets.push({ text, color: defaultColor, createdAt: Date.now() });
  inputEl.value = "";
  save(() => render());
}

function removeSnippet(index) {
  snippets.splice(index, 1);
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
  snippets = [];
  save(() => render());
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
  pageUrlEl.textContent = currentKey;

  chrome.storage.local.get(["pages", "defaultColor", "showNotes"], (result) => {
    const pages = result.pages || {};
    const stored = pages[currentKey]?.snippets || [];

    // Migrate old format: if snippets are plain strings, convert them
    snippets = stored.map((s) => {
      if (typeof s === "string") return { text: s, color: DEFAULT_COLOR };
      return s;
    });

    defaultColor = result.defaultColor || DEFAULT_COLOR;
    showNotes = result.showNotes || false;
    toggleNotesBtn.innerHTML = showNotes ? "Show notes &#9679;" : "Show notes &#9675;";
    renderDefaultPalette();
    render();
    inputEl.focus();
  });
});

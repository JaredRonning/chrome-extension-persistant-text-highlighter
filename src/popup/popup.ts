import {
  ColorId,
  HighlightStyle,
  Snippet,
  DisplaySnippet,
  Scope,
  CountMatchesResponse,
} from "../shared/types";
import { COLORS, DEFAULT_COLOR, colorHex } from "../shared/colors";
import { DEFAULT_SCOPE, normalizeSnippet } from "../shared/storage";
import { urlKey, originKey } from "../shared/url";
import { sendToActiveTab } from "../shared/messages";

// ── DOM refs ──
const listEl = document.getElementById("list")!;
const footerEl = document.getElementById("footer")!;
const countEl = document.getElementById("count")!;
const inputEl = document.getElementById("snippetInput") as HTMLInputElement;
const addBtn = document.getElementById("addBtn")!;
const clearBtn = document.getElementById("clearBtn")!;
const rehighlightBtn = document.getElementById("rehighlightBtn")!;
const toggleNotesBtn = document.getElementById("toggleNotesBtn")!;
const pageDomainEl = document.getElementById("pageDomain")!;
const pagePathEl = document.getElementById("pagePath")!;
const defaultPaletteEl = document.getElementById("defaultPalette")!;
const scopeToggleEl = document.getElementById("scopeToggle")!;
const defaultStylesEl = document.getElementById("defaultStyles")!;

const STYLES: { id: HighlightStyle; label: string; display: string }[] = [
  { id: "bold", label: "Bold", display: "B" },
  { id: "underline", label: "Underline", display: "U" },
  { id: "strikethrough", label: "Strikethrough", display: "S" },
  { id: "border", label: "Border", display: "\u25a1" },
];

let currentKey = "";
let currentOrigin = "";
let pageSnippets: Snippet[] = [];
let siteSnippets: Snippet[] = [];
let defaultColor: ColorId = DEFAULT_COLOR;
let defaultScope: Scope = DEFAULT_SCOPE;
let defaultStyles: HighlightStyle[] = [];
let openPopoverIndex = -1;
let showNotes = false;
let dragSrcIndex: number | null = null;
let autoScrollRAF: number | null = null;
let lastDragClientY = 0;
const SCROLL_ZONE = 40;
const MAX_SCROLL_SPEED = 8;

function autoScrollTick(): void {
  const rect = listEl.getBoundingClientRect();
  const distFromTop = lastDragClientY - rect.top;
  const distFromBottom = rect.bottom - lastDragClientY;

  let speed = 0;
  if (distFromTop < SCROLL_ZONE && distFromTop >= 0) {
    speed = -MAX_SCROLL_SPEED * (1 - distFromTop / SCROLL_ZONE);
  } else if (distFromBottom < SCROLL_ZONE && distFromBottom >= 0) {
    speed = MAX_SCROLL_SPEED * (1 - distFromBottom / SCROLL_ZONE);
  }

  if (speed !== 0) {
    listEl.scrollTop += speed;
    autoScrollRAF = requestAnimationFrame(autoScrollTick);
  } else {
    autoScrollRAF = null;
  }
}

function stopAutoScroll(): void {
  if (autoScrollRAF !== null) {
    cancelAnimationFrame(autoScrollRAF);
    autoScrollRAF = null;
  }
}

// ── Helpers ──

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

function buildDisplayList(): DisplaySnippet[] {
  const list: DisplaySnippet[] = [];
  pageSnippets.forEach((s, i) =>
    list.push({ ...s, _scope: "page", _srcIndex: i }),
  );
  siteSnippets.forEach((s, i) =>
    list.push({ ...s, _scope: "site", _srcIndex: i }),
  );
  const hasSortIndex = list.some((s) => s.sortIndex !== undefined);
  if (hasSortIndex) {
    list.sort((a, b) => (a.sortIndex ?? Infinity) - (b.sortIndex ?? Infinity));
  } else {
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  return list;
}

// ── Storage ──

function save(callback?: () => void): void {
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

    chrome.storage.local.set({ pages, sites, defaultColor, defaultScope, defaultStyles }, () => {
      console.log("[PPH popup] saved sites:", JSON.stringify(sites));
      console.log("[PPH popup] currentOrigin:", currentOrigin);
      sendToActiveTab({ action: "refresh-highlights" });
      if (callback) callback();
    });
  });
}

// ── Default color palette ──

function renderDefaultPalette(): void {
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

// ── Default styles ──

function renderDefaultStyles(): void {
  defaultStylesEl.innerHTML = "";
  defaultStylesEl.style.display = "flex";
  defaultStylesEl.style.gap = "4px";
  STYLES.forEach((s) => {
    const btn = document.createElement("button");
    btn.className = "style-btn" + (defaultStyles.includes(s.id) ? " active" : "");
    btn.textContent = s.display;
    btn.title = s.label;
    if (s.id === "bold") btn.style.fontWeight = "800";
    if (s.id === "underline") btn.style.textDecoration = "underline";
    if (s.id === "strikethrough") btn.style.textDecoration = "line-through";
    btn.addEventListener("click", () => {
      const idx = defaultStyles.indexOf(s.id);
      if (idx >= 0) defaultStyles.splice(idx, 1);
      else defaultStyles.push(s.id);
      chrome.storage.local.set({ defaultStyles });
      renderDefaultStyles();
    });
    defaultStylesEl.appendChild(btn);
  });
}

// ── Scope toggle ──

function renderScopeToggle(): void {
  scopeToggleEl.querySelectorAll<HTMLElement>(".scope-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.scope === defaultScope);
  });
}

scopeToggleEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>(".scope-btn");
  if (!btn) return;
  defaultScope = btn.dataset.scope as Scope;
  chrome.storage.local.set({ defaultScope });
  renderScopeToggle();
});

// ── SVG helpers for scope icons in snippet rows ──

function pageSvg(): string {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
}

function globeSvg(): string {
  return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>';
}

// ── Snippet list ──

function closeAllPopovers(): void {
  openPopoverIndex = -1;
  document.querySelectorAll(".color-picker-popover, .style-picker-popover").forEach((el) => el.remove());
}

function render(): void {
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
    row.draggable = true;
    row.dataset.displayIndex = String(i);

    row.addEventListener("dragstart", (e) => {
      dragSrcIndex = i;
      row.classList.add("dragging");
      e.dataTransfer!.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      stopAutoScroll();
      dragSrcIndex = null;
      row.classList.remove("dragging");
      listEl.querySelectorAll(".snippet").forEach((el) =>
        el.classList.remove("drag-over"),
      );
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
      listEl.querySelectorAll(".snippet").forEach((el) =>
        el.classList.remove("drag-over"),
      );
      if (dragSrcIndex !== null && dragSrcIndex !== i) {
        row.classList.add("drag-over");
      }
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      if (dragSrcIndex === null || dragSrcIndex === i) return;
      reorderSnippets(dragSrcIndex, i, displayList);
      dragSrcIndex = null;
    });

    // Drag handle
    const handle = document.createElement("span");
    handle.className = "drag-handle";
    handle.innerHTML = "&#8942;";
    handle.title = "Drag to reorder";

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

    // Style button
    const styleWrapper = document.createElement("div");
    styleWrapper.className = "dot-wrapper";

    const styleIcon = document.createElement("span");
    styleIcon.className = "style-dot" + ((snippet.styles?.length) ? " has-styles" : "");
    styleIcon.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>';
    styleIcon.title = "Change style";
    styleIcon.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleStylePicker(i, styleWrapper, snippet);
    });
    styleWrapper.appendChild(styleIcon);

    // Scope icon
    const scopeEl = document.createElement("span");
    scopeEl.className =
      "scope-icon" + (snippet._scope === "site" ? " site-scope" : "");
    scopeEl.innerHTML = snippet._scope === "site" ? globeSvg() : pageSvg();
    scopeEl.title =
      snippet._scope === "site"
        ? "Site-wide \u2014 click for page only"
        : "Page only \u2014 click for site-wide";
    scopeEl.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSnippetScope(snippet);
    });

    const txtWrapper = document.createElement("div");
    txtWrapper.className = "snippet-text";

    const txt = document.createElement("span");
    txt.textContent = snippet.text;
    txtWrapper.appendChild(txt);

    const matchCount = document.createElement("span");
    matchCount.className = "match-count";
    matchCount.dataset.text = snippet.text;
    matchCount.textContent = "…";
    txtWrapper.appendChild(matchCount);

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
        showNoteEditor(txtWrapper, noteEl, snippet, snippet.note!);
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

    row.appendChild(handle);
    row.appendChild(dotWrapper);
    row.appendChild(styleWrapper);
    row.appendChild(scopeEl);
    row.appendChild(txtWrapper);
    row.appendChild(btn);
    listEl.appendChild(row);
  });

  footerEl.style.display = "flex";
  const total = displayList.length;
  countEl.textContent = `${total} snippet${total !== 1 ? "s" : ""}`;

  updateMatchIndicators();
}

function updateMatchIndicators(): void {
  const texts = [
    ...new Set(buildDisplayList().map((s) => s.text)),
  ];
  if (texts.length === 0) return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    console.log("[PPH popup] updateMatchIndicators, tabId:", tabId, "texts:", texts);
    if (tabId === undefined) return;
    chrome.tabs
      .sendMessage(tabId, { action: "count-matches" as const, texts })
      .then((counts: CountMatchesResponse) => {
        if (!counts) return;
        document
          .querySelectorAll<HTMLSpanElement>(".match-count")
          .forEach((el) => {
            const count = counts[el.dataset.text ?? ""] || 0;
            if (count > 0) {
              el.textContent = `*${count}`;
              el.classList.add("found");
            } else {
              el.textContent = "*0";
              el.classList.remove("found");
            }
          });
      })
      .catch(() => {});
  });
}

function toggleColorPicker(
  displayIndex: number,
  parentEl: HTMLElement,
  snippet: DisplaySnippet,
): void {
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
      const srcArr = snippet._scope === "site" ? siteSnippets : pageSnippets;
      srcArr[snippet._srcIndex].color = c.id;
      save(() => render());
    });
    popover.appendChild(sw);
  });

  parentEl.appendChild(popover);
}

function toggleStylePicker(
  displayIndex: number,
  parentEl: HTMLElement,
  snippet: DisplaySnippet,
): void {
  // Use negative index to distinguish from color picker
  const styleKey = -(displayIndex + 1);
  if (openPopoverIndex === styleKey) {
    closeAllPopovers();
    return;
  }
  closeAllPopovers();
  openPopoverIndex = styleKey;

  const popover = document.createElement("div");
  popover.className = "style-picker-popover";

  const currentStyles = snippet.styles || [];

  STYLES.forEach((s) => {
    const btn = document.createElement("button");
    btn.className = "style-btn" + (currentStyles.includes(s.id) ? " active" : "");
    btn.textContent = s.display;
    btn.title = s.label;
    if (s.id === "bold") btn.style.fontWeight = "800";
    if (s.id === "underline") btn.style.textDecoration = "underline";
    if (s.id === "strikethrough") btn.style.textDecoration = "line-through";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const srcArr = snippet._scope === "site" ? siteSnippets : pageSnippets;
      const target = srcArr[snippet._srcIndex];
      const styles = target.styles || [];
      const idx = styles.indexOf(s.id);
      if (idx >= 0) styles.splice(idx, 1);
      else styles.push(s.id);
      target.styles = styles.length > 0 ? styles : undefined;
      save(() => render());
    });
    popover.appendChild(btn);
  });

  parentEl.appendChild(popover);
}

function reorderSnippets(
  fromDisplayIdx: number,
  toDisplayIdx: number,
  displayList: DisplaySnippet[],
): void {
  // Reorder the display list
  const reordered = [...displayList];
  const [moved] = reordered.splice(fromDisplayIdx, 1);
  reordered.splice(toDisplayIdx, 0, moved);

  // Assign sortIndex to all snippets based on new order
  reordered.forEach((item, newIdx) => {
    const srcArr = item._scope === "site" ? siteSnippets : pageSnippets;
    srcArr[item._srcIndex].sortIndex = newIdx;
  });

  save(() => render());
}

// ── Note editor ──

function showNoteEditor(
  parent: HTMLElement,
  replaceEl: HTMLElement,
  snippet: DisplaySnippet,
  currentNote: string,
): void {
  const textarea = document.createElement("textarea");
  textarea.className = "snippet-note-input";
  textarea.value = currentNote;
  textarea.placeholder = "Type a note\u2026";
  parent.replaceChild(textarea, replaceEl);
  textarea.focus();

  function saveNote(): void {
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

function addSnippet(): void {
  const text = inputEl.value.trim();
  if (!text) return;
  if (
    pageSnippets.some((s) => s.text === text) ||
    siteSnippets.some((s) => s.text === text)
  ) {
    inputEl.select();
    return;
  }
  const entry: Snippet = {
    text,
    color: defaultColor,
    createdAt: Date.now(),
    ...(defaultStyles.length > 0 ? { styles: [...defaultStyles] } : {}),
  };
  if (defaultScope === "site") {
    siteSnippets.push(entry);
  } else {
    pageSnippets.push(entry);
  }
  inputEl.value = "";
  save(() => render());
}

function removeSnippet(snippet: DisplaySnippet): void {
  const srcArr = snippet._scope === "site" ? siteSnippets : pageSnippets;
  srcArr.splice(snippet._srcIndex, 1);
  save(() => render());
}

function toggleSnippetScope(snippet: DisplaySnippet): void {
  const fromArr = snippet._scope === "site" ? siteSnippets : pageSnippets;
  const toArr = snippet._scope === "site" ? pageSnippets : siteSnippets;
  const [moved] = fromArr.splice(snippet._srcIndex, 1);
  toArr.push(moved);
  save(() => render());
}

// ── Close popover on outside click ──
document.addEventListener("click", () => {
  closeAllPopovers();
});

// ── Event Listeners ──
listEl.addEventListener("dragover", (e) => {
  lastDragClientY = e.clientY;
  if (autoScrollRAF === null) {
    autoScrollRAF = requestAnimationFrame(autoScrollTick);
  }
});

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
  sendToActiveTab({ action: "refresh-highlights" });
});
toggleNotesBtn.addEventListener("click", () => {
  showNotes = !showNotes;
  toggleNotesBtn.innerHTML = showNotes ? "Show notes &#9679;" : "Show notes &#9675;";
  chrome.storage.local.set({ showNotes });
  sendToActiveTab({ action: "toggle-notes", showNotes });
});

// ── Version ──
fetch(chrome.runtime.getURL("version.json"))
  .then((r) => r.json())
  .then((data: { version: string }) => {
    document.getElementById("version")!.textContent = "v" + data.version;
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

  chrome.storage.local.get(
    ["pages", "sites", "defaultColor", "defaultScope", "showNotes", "defaultStyles"],
    (result) => {
      const pages = result.pages || {};
      const sites = result.sites || {};

      const storedPage = pages[currentKey]?.snippets || [];
      pageSnippets = storedPage.map(normalizeSnippet);

      const storedSite = sites[currentOrigin]?.snippets || [];
      siteSnippets = storedSite.map(normalizeSnippet);

      defaultColor = result.defaultColor || DEFAULT_COLOR;
      defaultScope = result.defaultScope || DEFAULT_SCOPE;
      defaultStyles = result.defaultStyles || [];
      showNotes = result.showNotes || false;
      toggleNotesBtn.innerHTML = showNotes
        ? "Show notes &#9679;"
        : "Show notes &#9675;";
      renderDefaultPalette();
      renderDefaultStyles();
      renderScopeToggle();
      render();
      inputEl.focus();
    },
  );
});

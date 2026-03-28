# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Manifest V3 extension ("Persistent Page Highlighter") that lets users save text snippets per URL and highlights all occurrences on the page with customizable colors. Highlights persist across visits via `chrome.storage.local`.

## Architecture

- **No build step** — plain JS/CSS/HTML loaded directly by Chrome. No bundler, no transpiler, no package manager.
- **manifest.json** — MV3 config. Declares a popup action and a content script injected on all URLs at `document_idle`.
- **popup.html / popup.js** — Extension popup UI. Manages snippets (add/remove/change color) per URL key (`origin + pathname`). Stores data in `chrome.storage.local` under a `pages` map keyed by normalized URL. Sends `refresh-highlights` message to content script on changes.
- **content.js / content.css** — Content script injected into every page. On load (and on `refresh-highlights` message), reads snippets for the current URL from storage and wraps matching text nodes with `<mark class="pph-highlight" data-color="...">` elements. Colors are applied via CSS attribute selectors in `content.css`.
- **Color system** — Both popup and content script share a color palette (defined as a `COLORS` array in each file). Snippets store a color ID string (e.g. `"yellow"`); CSS maps `data-color` attributes to background colors.

## Key Patterns

- URL normalization: `origin + pathname` with trailing slashes stripped — query params and hash are ignored.
- Storage shape: `{ pages: { [urlKey]: { snippets: [{ text, color }] } }, defaultColor: "yellow" }`.
- Old format migration: plain string snippets are auto-converted to `{ text, color }` objects on read.
- Highlight injection uses a TreeWalker over text nodes, skipping `SCRIPT`/`STYLE`/`TEXTAREA`/`INPUT` elements and already-highlighted nodes.

## Development

To test: load the extension directory as an unpacked extension in `chrome://extensions` with Developer Mode enabled. After code changes, click the reload button on the extension card (content script changes also require refreshing the target page).

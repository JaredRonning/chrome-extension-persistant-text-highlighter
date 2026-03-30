# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome Manifest V3 extension ("Persistent Page Highlighter") that lets users save text snippets per URL and highlights all occurrences on the page with customizable colors. Highlights persist across visits via `chrome.storage.local`.

## Architecture

- **TypeScript + esbuild** — Source lives in `src/`, esbuild bundles three IIFE entry points into `dist/`. Chrome loads the built files from `dist/`.
- **manifest.json** — MV3 config. Declares a popup action and a content script injected on all URLs at `document_idle`. Points to `dist/` for JS files.
- **src/shared/** — Shared types (`types.ts`), color definitions (`colors.ts`), URL helpers (`url.ts`), storage helpers (`storage.ts`), and message helpers (`messages.ts`).
- **src/popup/popup.ts** → `dist/popup/popup.js` — Extension popup UI. Manages snippets (add/remove/change color) per URL key (`origin + pathname`). Stores data in `chrome.storage.local` under a `pages` map keyed by normalized URL. Sends `refresh-highlights` message to content script on changes.
- **src/content/content.ts** → `dist/content/content.js` — Content script injected into every page. On load (and on `refresh-highlights` message), reads snippets for the current URL from storage and wraps matching text nodes with `<mark class="pph-highlight" data-color="...">` elements. Colors are applied via CSS attribute selectors in `content.css`.
- **src/background/background.ts** → `dist/background/background.js` — Service worker for context menu integration.
- **Color system** — Shared color palette defined in `src/shared/colors.ts`. Snippets store a `ColorId` string (e.g. `"yellow"`); CSS maps `data-color` attributes to background colors.

## Key Patterns

- URL normalization: `origin + pathname` with trailing slashes stripped — query params and hash are ignored.
- Storage shape: `{ pages: { [urlKey]: { snippets: [{ text, color }] } }, sites: { [origin]: { snippets: [...] } }, defaultColor: "yellow", defaultScope: "page", showNotes: false }`.
- Old format migration: plain string snippets are auto-converted to `{ text, color }` objects on read via `normalizeSnippet()`.
- Highlight injection uses a TreeWalker over text nodes, skipping `SCRIPT`/`STYLE`/`TEXTAREA`/`INPUT` elements and already-highlighted nodes.

## Development

- **Build**: `npm run build` — compiles TypeScript and bundles into `dist/`.
- **Watch**: `npm run watch` — rebuilds on file changes.
- **Type check**: `npm run typecheck` — runs `tsc --noEmit` for type checking only.
- **Test in Chrome**: Load the extension directory as an unpacked extension in `chrome://extensions` with Developer Mode enabled. After code changes, run `npm run build`, then click the reload button on the extension card (content script changes also require refreshing the target page).
- **Important**: `dist/` is gitignored and can become stale. Always run `npm run build` after modifying source files in `src/` to keep `dist/` in sync.

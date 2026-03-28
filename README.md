# Persistent Page Highlighter

A Chrome extension that lets you save text snippets to highlight on any webpage. Highlights persist across visits and support multiple colors.

## Installation

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select this project folder
5. The extension icon will appear in your toolbar — click it on any page to start adding highlights

## Usage

1. Navigate to any webpage
2. Click the extension icon to open the popup
3. Type text in the input field and click **Add** (or press Enter)
4. All occurrences of that text on the page will be highlighted
5. Click the color dot next to a snippet to change its highlight color
6. Use the **Default color** palette at the top to set the color for new snippets
7. Highlights are saved per URL and will reappear on future visits

## Making Changes

There is no build step — all files are plain HTML, CSS, and JavaScript.

1. Edit the source files directly
2. Go to `chrome://extensions`
3. Click the **reload** button (circular arrow) on the extension card
4. If you changed `content.js` or `content.css`, also refresh the target webpage

### File Overview

| File | Purpose |
|------|---------|
| `manifest.json` | Extension configuration (permissions, scripts, icons) |
| `popup.html` | Popup UI markup and styles |
| `popup.js` | Popup logic — manages snippets, colors, and storage |
| `content.js` | Content script — finds and highlights text on pages |
| `content.css` | Highlight styling and color definitions |
| `icons/` | Extension icons (16, 48, 128px) |

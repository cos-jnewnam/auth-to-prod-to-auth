# Sitefinity Preview Helper (Chrome / Edge extension)

Helps with Sitefinity multisite Preview URLs on `scottsdaleaz-aut.sitefinity.cloud`.

## Install (unpacked)

**Chrome**

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and select this folder.
3. Pin the extension to the toolbar (optional).

**Edge**

1. Open `edge://extensions` and turn on **Developer mode** (left sidebar).
2. Click **Load unpacked** and select this folder.
3. Show the extension in the toolbar via the puzzle-piece menu (optional).

After changing any file, click the extension's **Reload** button on the extensions page.

## What it does

| Feature | How |
| --- | --- |
| Remove `/Action/Preview` | Automatic when a Preview page opens (toggle in the popup/settings). The site is detected from the page title, e.g. `Book Recommendations \| Scottsdale Public Library` → `/library/book-recommendations`. If the title doesn't match, it checks which authoring URL exists. |
| View in Production (new tab) | Popup button, right-click menu, or `Alt+Shift+P`. Works from Preview or authoring pages. |
| View in Sitefinity authoring | From a Production page: popup button, right-click menu, or `Alt+Shift+A`. Only available when you're logged in to the Sitefinity backend. |

## Site mapping

| Site | Authoring path | Production |
| --- | --- | --- |
| City of Scottsdale | `/` | `https://www.scottsdaleaz.gov` |
| Scottsdale Public Library | `/library` | `https://www.scottsdalelibrary.org` |
| Choose Scottsdale | `/choosescottsdale` | `https://www.choosescottsdale.com` |

Edit the mapping (including title suffixes) on the extension's **Settings** page. Change shortcuts at `chrome://extensions/shortcuts` (Chrome) or `edge://extensions/shortcuts` (Edge), or use the link in the popup.

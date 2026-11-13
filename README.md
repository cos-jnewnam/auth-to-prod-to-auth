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
| Edit in Sitefinity | From a Production page: popup button, right-click menu, or `Alt+Shift+E`. Opens the page editor, e.g. `www.scottsdalelibrary.org/borrow/digital-collection` → `/Sitefinity/adminapp/pages/borrow/digital-collection/Action/Edit/en?sf_site=<library site id>`. Site homepages map to `home`. Only available when you're logged in. |
| Edit a news article | On a Production detail page (`…/details/<slug>`), **Edit in Sitefinity** looks up the item's ID and provider by `UrlName` through the public `/api/default/newsitems` API and opens `/Sitefinity/adminapp/content/newsitems/<id>/edit?sf_provider=<provider>&sf_culture=en` (e.g. `OpenAccessDataProvider` for ScottsdaleAZ, `scottsdalepubliclibrarynews` for the Library). If no item matches, it opens the editor for the hosting page (e.g. `/scottsdale-news`). Enabled for ScottsdaleAZ and the Library. |

## Site mapping

| Site | Authoring path | Production | Site ID |
| --- | --- | --- | --- |
| City of Scottsdale | `/` | `https://www.scottsdaleaz.gov` | `63cd8978-b8d2-41f9-aa54-53eceaf84bb2` |
| Scottsdale Public Library | `/library` | `https://www.scottsdalelibrary.org` | `d47dfb13-ad6e-433f-aba9-a35b1e0c6316` |
| Choose Scottsdale | `/choosescottsdale` | `https://www.choosescottsdale.com` | `4fede6ef-5ff7-4f6f-80a3-6ee83c0892b9` |

Edit the mapping (including title suffixes and site IDs) on the extension's **Settings** page. Additional content types (events, public notices, etc.) can be added under **Content types** on the same page. Change shortcuts at `chrome://extensions/shortcuts` (Chrome) or `edge://extensions/shortcuts` (Edge), or use the link in the popup.

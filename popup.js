const KIND_LABELS = {
  preview: "Preview page",
  contentPreview: "Content preview",
  authoring: "Authoring page",
  production: "Production page",
  backendContent: "Sitefinity content editor",
  backendPage: "Sitefinity page editor",
  backend: "Sitefinity backend",
  other: "Not a Scottsdale Sitefinity page"
};

const BACKEND_KINDS = ["contentPreview", "backendContent", "backendPage"];

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

function button(label, href, onClick) {
  const wrap = document.createElement("div");
  wrap.className = "action";
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.addEventListener("click", async () => {
    await onClick();
    window.close();
  });
  const small = document.createElement("div");
  small.className = "url";
  small.textContent = href;
  wrap.append(btn, small);
  $("actions").append(wrap);
}

function note(html) {
  const div = document.createElement("div");
  div.className = "note";
  div.innerHTML = html;
  $("actions").append(div);
}

function openBeside(tab, url) {
  return chrome.tabs.create({ url, index: tab.index + 1, openerTabId: tab.id });
}

async function init() {
  const cfg = await SFX.getConfig();
  $("autoRedirect").checked = cfg.autoRedirect;
  $("autoRedirect").addEventListener("change", (e) => chrome.storage.sync.set({ autoRedirect: e.target.checked }));
  $("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
  const scheme = navigator.userAgent.includes("Edg/") ? "edge" : "chrome";
  $("openShortcuts").addEventListener("click", () => chrome.tabs.create({ url: `${scheme}://extensions/shortcuts` }));

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    $("status").textContent = KIND_LABELS.other;
    return;
  }

  const info = await chrome.runtime.sendMessage({ type: "resolveTab", tab });
  const siteName = info.site ? ` · ${info.site.name}` : "";
  $("status").textContent = (KIND_LABELS[info.kind] || KIND_LABELS.other) + siteName;

  if (info.kind === "preview") {
    button("Open authoring page", info.authoringUrl, () => chrome.tabs.update(tab.id, { url: info.authoringUrl }));
  }
  if (BACKEND_KINDS.includes(info.kind) && info.authoringUrl) {
    const label = info.kind === "contentPreview" ? "Open authoring page" : "View on authoring site";
    button(label, info.authoringUrl, () => openBeside(tab, info.authoringUrl));
  }
  if (info.productionUrl && (info.kind === "preview" || info.kind === "authoring" || BACKEND_KINDS.includes(info.kind))) {
    button("View in Production", info.productionUrl, () => openBeside(tab, info.productionUrl));
  }
  if (info.kind === "backendContent" && info.problem) {
    const type = escapeHtml(info.editType || "content");
    const site = escapeHtml(info.site?.name || "this site");
    if (info.problem === "notFound") {
      note(`This ${type} item wasn't found on the live site. It may not be published yet; use Sitefinity's <strong>Preview</strong> button to see the draft.`);
    } else if (info.problem === "noDetailPath") {
      note(`No detail page is configured for ${type} on ${site}. Add one under <code>detailPaths</code> in <a href="#" id="problemSettings">Settings</a>.`);
    } else {
      note(`This content type isn't set up yet. Add it under Content types in <a href="#" id="problemSettings">Settings</a>.`);
    }
    $("problemSettings")?.addEventListener("click", () => chrome.runtime.openOptionsPage());
  }
  if (info.kind === "production") {
    const loggedIn = await chrome.runtime.sendMessage({ type: "checkLogin", force: true });
    if (loggedIn) {
      const editLabel = info.editType ? `Edit ${info.editType} item in Sitefinity` : "Edit page in Sitefinity";
      button(editLabel, info.editUrl, () => openBeside(tab, info.editUrl));
      button("View in Sitefinity authoring", info.authoringUrl, () => openBeside(tab, info.authoringUrl));
    } else {
      note(`Log in to <a href="${cfg.authoringOrigin}/Sitefinity" target="_blank">Sitefinity</a> to edit this page or jump to the authoring page.`);
    }
  }
}

init();

const KIND_LABELS = {
  preview: "Preview page",
  authoring: "Authoring page",
  production: "Production page",
  backend: "Sitefinity backend",
  other: "Not a Scottsdale Sitefinity page"
};

const $ = (id) => document.getElementById(id);

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
  if (info.kind === "preview" || info.kind === "authoring") {
    button("View in Production", info.productionUrl, () => openBeside(tab, info.productionUrl));
  }
  if (info.kind === "production") {
    const loggedIn = await chrome.runtime.sendMessage({ type: "checkLogin", force: true });
    if (loggedIn) {
      button("View in Sitefinity authoring", info.authoringUrl, () => openBeside(tab, info.authoringUrl));
    } else {
      note(`Log in to <a href="${cfg.authoringOrigin}/Sitefinity" target="_blank">Sitefinity</a> to jump to the authoring page.`);
    }
  }
}

init();

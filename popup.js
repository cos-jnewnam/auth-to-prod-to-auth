const $ = (id) => document.getElementById(id);

function openBeside(tab, url) {
  return chrome.tabs.create({ url, index: tab.index + 1, openerTabId: tab.id });
}

function renderButton(tab, { label, url, mode }) {
  const wrap = document.createElement("div");
  wrap.className = "action";
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.addEventListener("click", async () => {
    if (mode === "same") await chrome.tabs.update(tab.id, { url });
    else await openBeside(tab, url);
    window.close();
  });
  const small = document.createElement("div");
  small.className = "url";
  small.textContent = url;
  wrap.append(btn, small);
  $("actions").append(wrap);
}

function renderNote({ text, link }) {
  const div = document.createElement("div");
  div.className = "note";
  div.textContent = text;
  if (link) {
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = link.label;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      if (link.url === "options") chrome.runtime.openOptionsPage();
      else chrome.tabs.create({ url: link.url });
    });
    div.append(" ", a);
  }
  $("actions").append(div);
}

function bindToggle(id, key) {
  $(id).addEventListener("change", (e) => chrome.storage.sync.set({ [key]: e.target.checked }));
}

async function init() {
  const cfg = await SFX.getConfig();
  $("autoRedirect").checked = cfg.autoRedirect;
  $("showOverlay").checked = cfg.showOverlay;
  bindToggle("autoRedirect", "autoRedirect");
  bindToggle("showOverlay", "showOverlay");
  $("openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
  const scheme = navigator.userAgent.includes("Edg/") ? "edge" : "chrome";
  $("openShortcuts").addEventListener("click", () => chrome.tabs.create({ url: `${scheme}://extensions/shortcuts` }));

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    $("status").textContent = SFX.KIND_LABELS.other;
    return;
  }

  const info = await chrome.runtime.sendMessage({ type: "resolveTab", tab });
  const siteName = info.site ? ` · ${info.site.name}` : "";
  $("status").textContent = (SFX.KIND_LABELS[info.kind] || SFX.KIND_LABELS.other) + siteName;

  const loggedIn = info.kind === "production" && (await chrome.runtime.sendMessage({ type: "checkLogin", force: true }));
  const { buttons, notes } = SFX.actionsFor(info, loggedIn, cfg);
  buttons.forEach((b) => renderButton(tab, b));
  notes.forEach(renderNote);
}

init();

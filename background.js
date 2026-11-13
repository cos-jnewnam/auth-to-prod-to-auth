importScripts("sites.js");

const LOGIN_CACHE_MS = 60 * 1000;
const MENU = {
  production: "sfx-open-production",
  authoringFromPreview: "sfx-open-authoring-from-preview",
  authoringFromBackend: "sfx-open-authoring-from-backend",
  authoringFromProduction: "sfx-open-authoring-from-production",
  editFromProduction: "sfx-edit-from-production"
};

// Logged-in admins can open the backend dashboard; anonymous users are redirected to /Sitefinity/Login.
async function checkLogin(force = false) {
  const cfg = await SFX.getConfig();
  if (!force) {
    const { loginState } = await chrome.storage.session.get("loginState");
    if (loginState && Date.now() - loginState.at < LOGIN_CACHE_MS) return loginState.loggedIn;
  }
  let loggedIn = false;
  try {
    const res = await fetch(cfg.authoringOrigin + "/Sitefinity/Dashboard", {
      credentials: "include",
      cache: "no-store"
    });
    loggedIn = res.ok && !/\/Sitefinity\/(Login|Authenticate|SignIn)/i.test(res.url);
  } catch {
    loggedIn = false;
  }
  await chrome.storage.session.set({ loginState: { loggedIn, at: Date.now() } });
  return loggedIn;
}

async function getTitle(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.title
    });
    return result?.result || "";
  } catch {
    return "";
  }
}

const TITLE_KINDS = ["preview", "contentPreview"];
const BACKEND_KINDS = ["contentPreview", "backendContent", "backendPage"];

async function resolveTab(tab, title) {
  const cfg = await SFX.getConfig();
  const kind = SFX.classify(tab.url, cfg).kind;
  if (title === undefined) title = TITLE_KINDS.includes(kind) ? await getTitle(tab.id) : "";
  return SFX.resolve(tab.url, title, cfg);
}

// Info for the on-page panel. Production lookups only run when an admin session exists.
async function pageInfo(tab, title) {
  const cfg = await SFX.getConfig();
  const c = SFX.classify(tab.url, cfg);
  let info;
  let loggedIn = false;
  if (c.kind === "production") {
    loggedIn = await checkLogin();
    info = loggedIn ? await resolveTab(tab, title) : { kind: c.kind, site: c.site };
  } else if (c.kind === "other" || c.kind === "backend") {
    info = { kind: c.kind };
  } else {
    info = await resolveTab(tab, title);
  }
  return {
    status: (SFX.KIND_LABELS[info.kind] || SFX.KIND_LABELS.other) + (info.site ? ` · ${info.site.name}` : ""),
    ...SFX.actionsFor(info, loggedIn, cfg)
  };
}

function openBeside(tab, url) {
  return chrome.tabs.create({ url, index: tab.index + 1, openerTabId: tab.id });
}

async function openProduction(tab) {
  const info = await resolveTab(tab);
  if (info.productionUrl && info.kind !== "production") await openBeside(tab, info.productionUrl);
}

async function openAuthoring(tab) {
  const info = await resolveTab(tab);
  if (info.kind === "preview") {
    await chrome.tabs.update(tab.id, { url: info.authoringUrl });
  } else if (BACKEND_KINDS.includes(info.kind)) {
    if (info.authoringUrl) await openBeside(tab, info.authoringUrl);
  } else if (info.kind === "production") {
    if (await checkLogin()) await openBeside(tab, info.authoringUrl);
  }
}

async function openEdit(tab) {
  const info = await resolveTab(tab);
  if (info.kind === "production" && info.editUrl && (await checkLogin())) {
    await openBeside(tab, info.editUrl);
  }
}

const MENU_CONTEXTS = ["page", "frame", "link", "selection", "image"];

function createMenu(props) {
  return new Promise((resolve) => {
    chrome.contextMenus.create({ contexts: MENU_CONTEXTS, ...props }, () => {
      // Ignore errors (e.g. duplicate ids) so they don't surface as "Unchecked runtime.lastError".
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

// Rebuilds are queued so overlapping calls (install/startup/settings change) can't create duplicate ids.
let menuBuild = Promise.resolve();
function buildMenus() {
  menuBuild = menuBuild.then(rebuildMenus, rebuildMenus);
  return menuBuild;
}

async function rebuildMenus() {
  const cfg = await SFX.getConfig();
  const origin = new URL(cfg.authoringOrigin).origin;
  const prodPatterns = cfg.sites.flatMap((s) => (s.productionHosts || []).map((h) => `*://${h}/*`));

  await chrome.contextMenus.removeAll();
  await createMenu({
    id: MENU.production,
    title: "View in Production",
    documentUrlPatterns: [`${origin}/*`]
  });
  await createMenu({
    id: MENU.authoringFromPreview,
    title: "Open authoring page (remove /Action/Preview)",
    documentUrlPatterns: [`${origin}/*/Action/Preview*`, `${origin}/*/action/preview*`]
  });
  await createMenu({
    id: MENU.authoringFromBackend,
    title: "View on authoring site",
    documentUrlPatterns: [
      `${origin}/Sitefinity/adminapp/content/*`,
      `${origin}/Sitefinity/adminapp/pages/*`,
      `${origin}/sitefinity/adminapp/content/*`,
      `${origin}/sitefinity/adminapp/pages/*`,
      `${origin}/*sf-content-action=preview*`
    ]
  });
  if (prodPatterns.length) {
    await createMenu({
      id: MENU.authoringFromProduction,
      title: "View in Sitefinity authoring",
      documentUrlPatterns: prodPatterns,
      visible: false
    });
    await createMenu({
      id: MENU.editFromProduction,
      title: "Edit in Sitefinity",
      documentUrlPatterns: prodPatterns,
      visible: false
    });
  }
}

// Only show the production-page menus when an admin session exists.
async function refreshProductionMenu(tab) {
  if (!tab?.url) return;
  const cfg = await SFX.getConfig();
  if (SFX.classify(tab.url, cfg).kind !== "production") return;
  const loggedIn = await checkLogin();
  for (const id of [MENU.authoringFromProduction, MENU.editFromProduction]) {
    chrome.contextMenus.update(id, { visible: loggedIn }, () => void chrome.runtime.lastError);
  }
}

chrome.runtime.onInstalled.addListener(buildMenus);
chrome.runtime.onStartup.addListener(buildMenus);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.sites) buildMenus();
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  refreshProductionMenu(await chrome.tabs.get(tabId));
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) refreshProductionMenu(tab);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const target = { ...tab, url: info.pageUrl || tab.url };
  if (info.menuItemId === MENU.production) openProduction(target);
  else if (
    [MENU.authoringFromPreview, MENU.authoringFromBackend, MENU.authoringFromProduction].includes(info.menuItemId)
  ) {
    openAuthoring(target);
  } else if (info.menuItemId === MENU.editFromProduction) openEdit(target);
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  tab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.url) return;
  if (command === "open-production") openProduction(tab);
  else if (command === "open-authoring") openAuthoring(tab);
  else if (command === "open-edit") openEdit(tab);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "pageInfo" && sender.tab) {
    pageInfo({ ...sender.tab, url: msg.url || sender.tab.url }, msg.title ?? "").then(sendResponse);
    return true;
  }
  if (msg?.type === "openBeside" && sender.tab && /^https?:\/\//i.test(msg.url || "")) {
    openBeside(sender.tab, msg.url);
    sendResponse(true);
    return false;
  }
  if (msg?.type === "openOptions") {
    chrome.runtime.openOptionsPage();
    sendResponse(true);
    return false;
  }
  if (msg?.type === "checkLogin") {
    checkLogin(!!msg.force).then(sendResponse);
    return true;
  }
  if (msg?.type === "resolveTab") {
    resolveTab(msg.tab).then(sendResponse);
    return true;
  }
  return false;
});

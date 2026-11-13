importScripts("sites.js");

const LOGIN_CACHE_MS = 60 * 1000;
const MENU = {
  production: "sfx-open-production",
  authoringFromPreview: "sfx-open-authoring-from-preview",
  authoringFromProduction: "sfx-open-authoring-from-production"
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

async function resolveTab(tab) {
  const cfg = await SFX.getConfig();
  const kind = SFX.classify(tab.url, cfg).kind;
  const title = kind === "preview" ? await getTitle(tab.id) : "";
  return SFX.resolve(tab.url, title, cfg);
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
  } else if (info.kind === "production") {
    if (await checkLogin()) await openBeside(tab, info.authoringUrl);
  }
}

async function buildMenus() {
  const cfg = await SFX.getConfig();
  const origin = new URL(cfg.authoringOrigin).origin;
  const prodPatterns = cfg.sites.flatMap((s) => (s.productionHosts || []).map((h) => `*://${h}/*`));

  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU.production,
    title: "View in Production",
    contexts: ["page", "frame", "link", "selection", "image"],
    documentUrlPatterns: [`${origin}/*`]
  });
  chrome.contextMenus.create({
    id: MENU.authoringFromPreview,
    title: "Open authoring page (remove /Action/Preview)",
    contexts: ["page", "frame", "link", "selection", "image"],
    documentUrlPatterns: [`${origin}/*/Action/Preview*`, `${origin}/*/action/preview*`]
  });
  if (prodPatterns.length) {
    chrome.contextMenus.create({
      id: MENU.authoringFromProduction,
      title: "View in Sitefinity authoring",
      contexts: ["page", "frame", "link", "selection", "image"],
      documentUrlPatterns: prodPatterns,
      visible: false
    });
  }
}

// Only show the "authoring" menu on production pages when an admin session exists.
async function refreshProductionMenu(tab) {
  if (!tab?.url) return;
  const cfg = await SFX.getConfig();
  if (SFX.classify(tab.url, cfg).kind !== "production") return;
  const loggedIn = await checkLogin();
  chrome.contextMenus.update(MENU.authoringFromProduction, { visible: loggedIn }, () => void chrome.runtime.lastError);
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
  else if (info.menuItemId === MENU.authoringFromPreview || info.menuItemId === MENU.authoringFromProduction) {
    openAuthoring(target);
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  tab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.url) return;
  if (command === "open-production") openProduction(tab);
  else if (command === "open-authoring") openAuthoring(tab);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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

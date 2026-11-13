const $ = (id) => document.getElementById(id);

function showMsg(text, isError = false) {
  $("msg").textContent = text;
  $("msg").className = "msg" + (isError ? " error" : "");
}

function validate(sites) {
  if (!Array.isArray(sites) || !sites.length) throw new Error("Sites must be a non-empty array.");
  for (const s of sites) {
    if (!s.name || typeof s.prefix !== "string" || !s.productionOrigin) {
      throw new Error("Each site needs name, prefix (string) and productionOrigin.");
    }
    if (s.prefix && !/^\/[^/]+$/.test(s.prefix)) throw new Error(`Invalid prefix "${s.prefix}" (use e.g. "/library").`);
    new URL(s.productionOrigin);
  }
  if (!sites.some((s) => !s.prefix)) throw new Error('One site must have an empty prefix ("") as the main site.');
}

function validateContentTypes(types) {
  if (!Array.isArray(types)) throw new Error("Content types must be an array (use [] for none).");
  for (const t of types) {
    if (!t.name || !t.entitySet) throw new Error("Each content type needs name and entitySet.");
    if (t.sites !== undefined && !Array.isArray(t.sites)) throw new Error(`"sites" for ${t.name} must be an array.`);
    if (t.detailPaths !== undefined) {
      const ok =
        t.detailPaths && typeof t.detailPaths === "object" && !Array.isArray(t.detailPaths) &&
        Object.values(t.detailPaths).every((p) => typeof p === "string" && p.startsWith("/") && p.includes("{UrlName}"));
      if (!ok) throw new Error(`"detailPaths" for ${t.name} must map site ids to paths like "/news/details/{UrlName}".`);
    }
    if (t.pathPattern !== undefined) {
      try {
        new RegExp(t.pathPattern, "i");
      } catch {
        throw new Error(`"pathPattern" for ${t.name} is not a valid regular expression.`);
      }
    }
  }
}

async function load() {
  const cfg = await SFX.getConfig();
  $("autoRedirect").checked = cfg.autoRedirect;
  $("showOverlay").checked = cfg.showOverlay;
  $("sites").value = JSON.stringify(cfg.sites, null, 2);
  $("contentTypes").value = JSON.stringify(cfg.contentTypes, null, 2);
}

$("autoRedirect").addEventListener("change", (e) => chrome.storage.sync.set({ autoRedirect: e.target.checked }));
$("showOverlay").addEventListener("change", (e) => chrome.storage.sync.set({ showOverlay: e.target.checked }));

$("save").addEventListener("click", async () => {
  try {
    const sites = JSON.parse($("sites").value);
    validate(sites);
    const contentTypes = JSON.parse($("contentTypes").value);
    validateContentTypes(contentTypes);
    await chrome.storage.sync.set({ sites, contentTypes });
    showMsg("Saved.");
  } catch (err) {
    showMsg(err.message, true);
  }
});

$("reset").addEventListener("click", async () => {
  await chrome.storage.sync.remove(["sites", "contentTypes"]);
  await load();
  showMsg("Reset to defaults.");
});

load();

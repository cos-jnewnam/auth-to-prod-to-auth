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

async function load() {
  const cfg = await SFX.getConfig();
  $("autoRedirect").checked = cfg.autoRedirect;
  $("sites").value = JSON.stringify(cfg.sites, null, 2);
}

$("autoRedirect").addEventListener("change", (e) => chrome.storage.sync.set({ autoRedirect: e.target.checked }));

$("save").addEventListener("click", async () => {
  try {
    const sites = JSON.parse($("sites").value);
    validate(sites);
    await chrome.storage.sync.set({ sites });
    showMsg("Saved.");
  } catch (err) {
    showMsg(err.message, true);
  }
});

$("reset").addEventListener("click", async () => {
  await chrome.storage.sync.remove("sites");
  await load();
  showMsg("Reset to defaults.");
});

load();

// Shared URL-mapping logic. Loaded by the content script, service worker, popup, and options page.
(function (root) {
  const DEFAULT_CONFIG = {
    authoringOrigin: "https://scottsdaleaz-aut.sitefinity.cloud",
    autoRedirect: true,
    sites: [
      {
        id: "main",
        name: "City of Scottsdale",
        prefix: "",
        siteId: "63cd8978-b8d2-41f9-aa54-53eceaf84bb2",
        productionOrigin: "https://www.scottsdaleaz.gov",
        productionHosts: ["www.scottsdaleaz.gov", "scottsdaleaz.gov"],
        titleSuffixes: []
      },
      {
        id: "library",
        name: "Scottsdale Public Library",
        prefix: "/library",
        siteId: "d47dfb13-ad6e-433f-aba9-a35b1e0c6316",
        productionOrigin: "https://www.scottsdalelibrary.org",
        productionHosts: ["www.scottsdalelibrary.org", "scottsdalelibrary.org"],
        titleSuffixes: ["Scottsdale Public Library"]
      },
      {
        id: "choosescottsdale",
        name: "Choose Scottsdale",
        prefix: "/choosescottsdale",
        siteId: "4fede6ef-5ff7-4f6f-80a3-6ee83c0892b9",
        productionOrigin: "https://www.choosescottsdale.com",
        productionHosts: ["www.choosescottsdale.com", "choosescottsdale.com"],
        titleSuffixes: ["Choose Scottsdale"]
      }
    ]
  };

  const PREVIEW_RE = /\/Action\/Preview\/?$/i;
  const EDIT_CULTURE = "en";
  const HOME_PAGE_NAME = "home";

  async function getConfig() {
    const stored = await chrome.storage.sync.get(["sites", "autoRedirect", "authoringOrigin"]);
    const storedSites = Array.isArray(stored.sites) && stored.sites.length ? stored.sites : null;
    return {
      authoringOrigin: stored.authoringOrigin || DEFAULT_CONFIG.authoringOrigin,
      autoRedirect: stored.autoRedirect ?? DEFAULT_CONFIG.autoRedirect,
      sites: storedSites ? storedSites.map(withDefaultSiteId) : DEFAULT_CONFIG.sites
    };
  }

  // Settings saved before siteId existed won't have it; fill it in from the defaults.
  function withDefaultSiteId(site) {
    if (site.siteId) return site;
    const def = DEFAULT_CONFIG.sites.find((d) => d.id === site.id);
    return def?.siteId ? { ...site, siteId: def.siteId } : site;
  }

  // e.g. /neighborhood-programs/block-party -> /Sitefinity/adminapp/pages/neighborhood-programs/block-party/Action/Edit/en?sf_site=...
  function editUrlFor(pathname, site, cfg) {
    const pagePath = pathname.replace(/^\/+|\/+$/g, "") || HOME_PAGE_NAME;
    const query = site.siteId ? `?sf_site=${encodeURIComponent(site.siteId)}` : "";
    return `${cfg.authoringOrigin}/Sitefinity/adminapp/pages/${pagePath}/Action/Edit/${EDIT_CULTURE}${query}`;
  }

  function defaultSite(cfg) {
    return cfg.sites.find((s) => !s.prefix) || cfg.sites[0];
  }

  function prefixedSites(cfg) {
    return cfg.sites.filter((s) => s.prefix);
  }

  function hasPrefix(pathname, prefix) {
    const p = pathname.toLowerCase();
    const pre = prefix.toLowerCase();
    return p === pre || p.startsWith(pre + "/");
  }

  function isAuthoring(url, cfg) {
    return url.origin.toLowerCase() === new URL(cfg.authoringOrigin).origin.toLowerCase();
  }

  function isPreview(url, cfg) {
    return isAuthoring(url, cfg) && PREVIEW_RE.test(url.pathname);
  }

  function productionSiteFor(url, cfg) {
    const host = url.hostname.toLowerCase();
    return cfg.sites.find((s) => (s.productionHosts || []).some((h) => h.toLowerCase() === host)) || null;
  }

  function classify(href, cfg) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return { kind: "other" };
    }
    if (isPreview(url, cfg)) return { kind: "preview", url };
    if (isAuthoring(url, cfg)) {
      if (/^\/sitefinity(\/|$)/i.test(url.pathname)) return { kind: "backend", url };
      return { kind: "authoring", url };
    }
    const site = productionSiteFor(url, cfg);
    if (site) return { kind: "production", url, site };
    return { kind: "other", url };
  }

  // Detects the site of a preview page from its <title>, e.g. "Book Recommendations | Scottsdale Public Library".
  function siteFromTitle(title, cfg) {
    const t = (title || "").trim().toLowerCase();
    if (!t) return null;
    for (const site of cfg.sites) {
      for (const suffix of site.titleSuffixes || []) {
        if (suffix && t.endsWith(suffix.trim().toLowerCase())) return site;
      }
    }
    return null;
  }

  async function urlExists(href) {
    try {
      const res = await fetch(href, { credentials: "include", cache: "no-store" });
      return res.ok;
    } catch {
      return false;
    }
  }

  function stripPreview(pathname) {
    return pathname.replace(PREVIEW_RE, "") || "/";
  }

  // Determines which site a preview URL belongs to: title suffix first, then by probing which authoring URL exists.
  async function resolvePreviewSite(href, title, cfg) {
    const bySuffix = siteFromTitle(title, cfg);
    if (bySuffix) return bySuffix;

    const url = new URL(href);
    const path = stripPreview(url.pathname);
    const main = defaultSite(cfg);
    if (await urlExists(cfg.authoringOrigin + (main.prefix || "") + path)) return main;
    for (const site of prefixedSites(cfg)) {
      if (await urlExists(cfg.authoringOrigin + site.prefix + path)) return site;
    }
    return main;
  }

  function joinPath(prefix, path) {
    const p = path.startsWith("/") ? path : "/" + path;
    if (!prefix) return p;
    return p === "/" ? prefix : prefix + p;
  }

  function authoringSiteFor(url, cfg) {
    return prefixedSites(cfg).find((s) => hasPrefix(url.pathname, s.prefix)) || defaultSite(cfg);
  }

  function pathWithoutPrefix(url, site) {
    if (!site.prefix) return url.pathname;
    return url.pathname.slice(site.prefix.length) || "/";
  }

  /**
   * Returns { kind, site, authoringUrl, productionUrl, editUrl? } for the given page (editUrl only for production pages).
   * `title` is only needed for preview URLs.
   */
  async function resolve(href, title, cfg) {
    const c = classify(href, cfg);
    if (c.kind === "preview") {
      const site = await resolvePreviewSite(href, title, cfg);
      const path = stripPreview(c.url.pathname);
      return {
        kind: c.kind,
        site,
        authoringUrl: cfg.authoringOrigin + joinPath(site.prefix, path) + c.url.search + c.url.hash,
        productionUrl: site.productionOrigin + path + c.url.search + c.url.hash
      };
    }
    if (c.kind === "authoring") {
      const site = authoringSiteFor(c.url, cfg);
      return {
        kind: c.kind,
        site,
        authoringUrl: c.url.href,
        productionUrl: site.productionOrigin + pathWithoutPrefix(c.url, site) + c.url.search + c.url.hash
      };
    }
    if (c.kind === "production") {
      return {
        kind: c.kind,
        site: c.site,
        authoringUrl: cfg.authoringOrigin + joinPath(c.site.prefix, c.url.pathname) + c.url.search + c.url.hash,
        editUrl: editUrlFor(c.url.pathname, c.site, cfg),
        productionUrl: c.url.href
      };
    }
    return { kind: c.kind };
  }

  root.SFX = { DEFAULT_CONFIG, getConfig, classify, siteFromTitle, resolve, stripPreview };
})(globalThis);

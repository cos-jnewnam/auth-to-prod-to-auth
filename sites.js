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
    ],
    // Content items on Production, looked up by UrlName via the public /api/default/<entitySet> service.
    // `pathPattern` is a case-insensitive regex matched against the Production path: group 1 = hosting page path
    //   (edited when no item is found), group 2 = the item's UrlName. Defaults to ".../details/<UrlName>".
    // The item's Provider from the API is used for the editor link; `provider` is only a fallback.
    // `detailPaths` maps site id -> the path an item is shown at ({UrlName} is replaced); used to go from the
    //   backend content editor to the live item.
    // `sites` limits which site ids the type applies to (empty = all).
    contentTypes: [
      {
        name: "News",
        entitySet: "newsitems",
        adminType: "newsitems",
        provider: "OpenAccessDataProvider",
        pathPattern: "^(.*?)/details/([^/]+)/?$",
        detailPaths: {
          main: "/scottsdale-news/details/{UrlName}",
          library: "/news/details/{UrlName}"
        },
        sites: ["main", "library"]
      },
      {
        name: "Public Notice",
        entitySet: "publicnotices",
        adminType: "publicnotices",
        provider: "OpenAccessProvider",
        pathPattern: "^(/public-notices)/([^/]+)/?$",
        detailPaths: {
          main: "/public-notices/{UrlName}"
        },
        sites: ["main"]
      }
    ]
  };

  const PREVIEW_RE = /\/Action\/Preview\/?$/i;
  const CONTENT_EDIT_RE = /^\/Sitefinity\/adminapp\/content\/([^/]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/|$)/i;
  const PAGE_EDIT_RE = /^\/Sitefinity\/adminapp\/pages\/(.+?)\/Action\/Edit(\/[^/]*)?\/?$/i;
  const DEFAULT_PATH_PATTERN = "^(.*?)/details/([^/]+)/?$";
  const EDIT_CULTURE = "en";
  const HOME_PAGE_NAME = "home";

  async function getConfig() {
    const stored = await chrome.storage.sync.get(["sites", "autoRedirect", "authoringOrigin", "contentTypes"]);
    const storedSites = Array.isArray(stored.sites) && stored.sites.length ? stored.sites : null;
    return {
      authoringOrigin: stored.authoringOrigin || DEFAULT_CONFIG.authoringOrigin,
      autoRedirect: stored.autoRedirect ?? DEFAULT_CONFIG.autoRedirect,
      sites: storedSites ? storedSites.map(withDefaultSiteId) : DEFAULT_CONFIG.sites,
      contentTypes: Array.isArray(stored.contentTypes) ? stored.contentTypes.map(withDefaultDetailPaths) : DEFAULT_CONFIG.contentTypes
    };
  }

  // Content types saved before detailPaths existed won't have it; fill it in from the defaults.
  function withDefaultDetailPaths(type) {
    if (type.detailPaths) return type;
    const def = DEFAULT_CONFIG.contentTypes.find((d) => d.entitySet === type.entitySet);
    return def?.detailPaths ? { ...type, detailPaths: def.detailPaths } : type;
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

  function safeDecode(s) {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }

  // Finds the id (and provider) of a content item by its UrlName using the site's public API.
  async function findContentItem(origin, slug, type) {
    const filter = `UrlName eq '${safeDecode(slug).replace(/'/g, "''")}'`;
    // Prefer the item's own Provider (it differs per site); fall back to Id-only if a type doesn't expose it.
    for (const select of ["Id,Provider", "Id"]) {
      const api = `${origin}/api/default/${type.entitySet}?$filter=${encodeURIComponent(filter)}&$select=${select}&$top=1`;
      try {
        const res = await fetch(api, { cache: "no-store" });
        if (!res.ok) continue;
        const item = (await res.json())?.value?.[0];
        if (item?.Id) return { type, id: item.Id, provider: item.Provider || type.provider };
        return null;
      } catch {
        // Try the next query.
      }
    }
    return null;
  }

  function contentEditUrlFor(item, cfg) {
    const query = new URLSearchParams({ sf_provider: item.provider || "OpenAccessDataProvider", sf_culture: EDIT_CULTURE });
    return `${cfg.authoringOrigin}/Sitefinity/adminapp/content/${item.type.adminType || item.type.entitySet}/${item.id}/edit?${query}`;
  }

  function matchPath(type, pathname) {
    try {
      return pathname.match(new RegExp(type.pathPattern || DEFAULT_PATH_PATTERN, "i"));
    } catch {
      return null;
    }
  }

  // Content item pages edit the item; other pages (or items not found) edit the (hosting) page.
  async function resolveEdit(url, site, cfg) {
    const types = (cfg.contentTypes || []).filter((t) => !t.sites?.length || t.sites.includes(site.id));
    let hostingPath = null;
    for (const type of types) {
      const match = matchPath(type, url.pathname);
      if (!match || !match[2]) continue;
      const item = await findContentItem(url.origin, match[2], type);
      if (item) return { editUrl: contentEditUrlFor(item, cfg), editType: item.type.name };
      hostingPath ??= match[1] || "/";
    }
    return { editUrl: editUrlFor(hostingPath ?? url.pathname, site, cfg), editType: null };
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

  // Content item previews opened from the backend, e.g. /scottsdale-news/details/<slug>?sf-content-action=preview&sf-auth=...
  function isContentPreview(url) {
    return (url.searchParams.get("sf-content-action") || "").toLowerCase() === "preview" || url.searchParams.has("sf-auth");
  }

  function siteById(cfg, siteId) {
    if (!siteId) return null;
    return cfg.sites.find((s) => (s.siteId || "").toLowerCase() === siteId.toLowerCase()) || null;
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
      const content = url.pathname.match(CONTENT_EDIT_RE);
      if (content) return { kind: "backendContent", url, adminType: content[1], id: content[2] };
      const page = url.pathname.match(PAGE_EDIT_RE);
      if (page) return { kind: "backendPage", url, pagePath: "/" + page[1] };
      if (/^\/sitefinity(\/|$)/i.test(url.pathname)) return { kind: "backend", url };
      if (isContentPreview(url)) return { kind: "contentPreview", url };
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

  function liveUrls(site, path, cfg) {
    return {
      authoringUrl: cfg.authoringOrigin + joinPath(site.prefix, path),
      productionUrl: site.productionOrigin + path
    };
  }

  // Query strings (including the sf-auth token) are dropped so the live page is shown.
  async function resolveContentPreview(c, title, cfg) {
    const prefixed = prefixedSites(cfg).find((s) => hasPrefix(c.url.pathname, s.prefix));
    if (prefixed) return { site: prefixed, ...liveUrls(prefixed, pathWithoutPrefix(c.url, prefixed), cfg) };
    const site = await resolvePreviewSite(c.url.origin + c.url.pathname, title, cfg);
    return { site, ...liveUrls(site, c.url.pathname, cfg) };
  }

  async function fetchUrlName(origin, entitySet, id) {
    try {
      const res = await fetch(`${origin}/api/default/${entitySet}(${id})?$select=UrlName`, { cache: "no-store" });
      if (!res.ok) return null;
      return (await res.json())?.UrlName || null;
    } catch {
      return null;
    }
  }

  // Looks up a backend content item's UrlName on the live site(s) and builds its detail page URLs.
  // Sets `problem` ("unknownType" | "notFound" | "noDetailPath") when no live URL can be built.
  async function resolveBackendContent(c, cfg) {
    const type = (cfg.contentTypes || []).find(
      (t) => (t.adminType || t.entitySet).toLowerCase() === c.adminType.toLowerCase()
    );
    const sfSite = siteById(cfg, c.url.searchParams.get("sf_site"));
    const base = { site: sfSite, editType: type?.name ?? null };
    if (!type) return { ...base, problem: "unknownType" };

    const typeSites = cfg.sites.filter((s) => !type.sites?.length || type.sites.includes(s.id));
    const candidates = [...new Set([sfSite, ...typeSites].filter(Boolean))];
    for (const site of candidates) {
      const urlName = await fetchUrlName(site.productionOrigin, type.entitySet, c.id);
      if (!urlName) continue;
      const template = type.detailPaths?.[site.id];
      if (!template) return { ...base, site, problem: "noDetailPath" };
      return { ...base, site, ...liveUrls(site, template.replace(/\{UrlName\}/g, urlName), cfg) };
    }
    return { ...base, problem: "notFound" };
  }

  // Page editor -> live page. Uses sf_site when present, otherwise checks which site's authoring URL exists.
  async function resolveBackendPage(c, cfg) {
    const path = c.pagePath.toLowerCase() === "/" + HOME_PAGE_NAME ? "/" : c.pagePath;
    let site = siteById(cfg, c.url.searchParams.get("sf_site"));
    if (!site) {
      const ordered = [defaultSite(cfg), ...prefixedSites(cfg)];
      for (const s of ordered) {
        if (await urlExists(cfg.authoringOrigin + joinPath(s.prefix, path))) {
          site = s;
          break;
        }
      }
      site ||= defaultSite(cfg);
    }
    return { site, ...liveUrls(site, path, cfg) };
  }

  /**
   * Returns { kind, site, authoringUrl, productionUrl, editUrl?, editType?, problem? } for the given page.
   * editUrl is only set for production pages; editType names the content type (e.g. "News") for content items,
   * or is null for pages. `problem` is set for backend content items without a live URL.
   * `title` is only needed for preview and content preview URLs.
   */
  async function resolve(href, title, cfg) {
    const c = classify(href, cfg);
    if (c.kind === "contentPreview") return { kind: c.kind, ...(await resolveContentPreview(c, title, cfg)) };
    if (c.kind === "backendContent") return { kind: c.kind, ...(await resolveBackendContent(c, cfg)) };
    if (c.kind === "backendPage") return { kind: c.kind, ...(await resolveBackendPage(c, cfg)) };
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
        ...(await resolveEdit(c.url, c.site, cfg)),
        productionUrl: c.url.href
      };
    }
    return { kind: c.kind };
  }

  root.SFX = { DEFAULT_CONFIG, getConfig, classify, siteFromTitle, resolve, stripPreview };
})(globalThis);

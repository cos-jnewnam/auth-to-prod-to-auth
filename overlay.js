// On-page helper panel (top-right). Enabled with the "Show panel on pages" setting.
(() => {
  if (window.top !== window) return;

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .wrap { position: fixed; top: 12px; right: 12px; z-index: 2147483647;
      font: 13px/1.4 "Segoe UI", system-ui, sans-serif; color: #1f2933; }
    .panel { width: 280px; background: #fff; border: 1px solid #d0d7de; border-radius: 8px;
      box-shadow: 0 6px 20px rgba(0,0,0,.18); overflow: hidden; }
    .head { display: flex; align-items: center; gap: 8px; padding: 7px 8px 7px 10px; background: #0b5394; color: #fff; }
    .logo { font-weight: 700; }
    .status { flex: 1; font-size: 12px; opacity: .9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .icon { background: transparent; border: 0; color: #fff; cursor: pointer; font-size: 15px; line-height: 1;
      padding: 2px 6px; border-radius: 4px; }
    .icon:hover { background: rgba(255,255,255,.2); }
    .body { padding: 10px; display: flex; flex-direction: column; gap: 6px; }
    .btn { width: 100%; padding: 7px 10px; border: 0; border-radius: 5px; background: #0b5394; color: #fff;
      font: 600 13px/1.3 "Segoe UI", system-ui, sans-serif; cursor: pointer; text-align: left; }
    .btn:hover { background: #083d6d; }
    .note { background: #fff8e1; border: 1px solid #f0d878; padding: 7px; border-radius: 5px; font-size: 12px; }
    .note a { color: #0b5394; cursor: pointer; }
    .badge { width: 34px; height: 34px; border-radius: 50%; border: 0; background: #0b5394; color: #fff;
      font: 700 15px/1 "Segoe UI", system-ui, sans-serif; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,.25); }
    .badge:hover { background: #083d6d; }
    @media print { .wrap { display: none; } }
  `;

  let enabled = false;
  let collapsed = false;
  let hiddenForPage = false;
  let lastHref = "";
  let seq = 0;
  let host = null;
  let data = null;

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...children);
    return node;
  }

  async function send(msg) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch {
      // After the extension is reloaded, this page's script is orphaned; remove the stale panel.
      if (!chrome.runtime?.id) remove();
      return null;
    }
  }

  function remove() {
    host?.remove();
    host = null;
  }

  function onAction({ url, mode }) {
    if (mode === "same") location.assign(url);
    else send({ type: "openBeside", url });
  }

  function render() {
    if (!enabled || hiddenForPage || !data || (!data.buttons.length && !data.notes.length)) return remove();
    if (!host) {
      host = el("div");
      host.attachShadow({ mode: "open" });
      document.documentElement.append(host);
    }
    const root = host.shadowRoot;
    root.replaceChildren(el("style", { textContent: STYLE }));
    const wrap = el("div", { className: "wrap" });
    root.append(wrap);

    if (collapsed) {
      const badge = el("button", { className: "badge", textContent: "S", title: `Sitefinity Preview Helper: ${data.status}` });
      badge.addEventListener("click", () => chrome.storage.local.set({ overlayCollapsed: false }));
      wrap.append(badge);
      return;
    }

    const min = el("button", { className: "icon", textContent: "–", title: "Minimize" });
    min.addEventListener("click", () => chrome.storage.local.set({ overlayCollapsed: true }));
    const close = el("button", { className: "icon", textContent: "×", title: "Hide on this page" });
    close.addEventListener("click", () => {
      hiddenForPage = true;
      remove();
    });
    const head = el("div", { className: "head" }, [
      el("span", { className: "logo", textContent: "S" }),
      el("span", { className: "status", textContent: data.status, title: data.status }),
      min,
      close
    ]);

    const body = el("div", { className: "body" });
    for (const b of data.buttons) {
      const btn = el("button", { className: "btn", textContent: b.label, title: b.url });
      btn.addEventListener("click", () => onAction(b));
      body.append(btn);
    }
    for (const n of data.notes) {
      const note = el("div", { className: "note", textContent: n.text });
      if (n.link) {
        const a = el("a", { textContent: n.link.label, href: n.link.url === "options" ? "#" : n.link.url });
        a.addEventListener("click", (e) => {
          e.preventDefault();
          if (n.link.url === "options") send({ type: "openOptions" });
          else send({ type: "openBeside", url: n.link.url });
        });
        note.append(" ", a);
      }
      body.append(note);
    }
    wrap.append(el("div", { className: "panel" }, [head, body]));
  }

  async function refresh() {
    lastHref = location.href;
    if (!enabled) return remove();
    const mine = ++seq;
    const res = await send({ type: "pageInfo", url: location.href, title: document.title });
    if (mine !== seq) return;
    data = res;
    render();
  }

  async function init() {
    const [{ showOverlay }, { overlayCollapsed }] = await Promise.all([
      chrome.storage.sync.get("showOverlay"),
      chrome.storage.local.get("overlayCollapsed")
    ]);
    enabled = !!showOverlay;
    collapsed = !!overlayCollapsed;
    refresh();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.showOverlay) {
        enabled = !!changes.showOverlay.newValue;
        refresh();
      } else if (area === "sync" && (changes.sites || changes.contentTypes)) {
        refresh();
      } else if (area === "local" && changes.overlayCollapsed) {
        collapsed = !!changes.overlayCollapsed.newValue;
        render();
      }
    });

    // The Sitefinity backend is a single-page app; pick up in-app navigation.
    setInterval(() => {
      if (enabled && location.href !== lastHref) {
        hiddenForPage = false;
        refresh();
      }
    }, 1000);
  }

  init();
})();

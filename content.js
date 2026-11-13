// Runs on authoring Preview pages; redirects to the working authoring URL when auto-redirect is on.
(async () => {
  const cfg = await SFX.getConfig();
  if (!cfg.autoRedirect) return;
  if (SFX.classify(location.href, cfg).kind !== "preview") return;

  const info = await SFX.resolve(location.href, document.title, cfg);
  if (info.authoringUrl && info.authoringUrl !== location.href) {
    location.replace(info.authoringUrl);
  }
})();

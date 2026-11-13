// Inspect the community feed's rendered cards. Target: "Steam Big Picture Mode".
// Run after navigating to a shortcut and selecting its Community tab.
// Vars: __LABEL__ (tab label, default Community)
//
// Reports remote card images (ignimgs/ytimg/steamusercontent) and data-URI
// avatars (our injected provider icons — a non-zero count indicates the "?"
// placeholder is replaced). Read-only.
//
// Only images at or after the tab strip count: the game page's own shortcut
// icon is a data URI too, and it sits in the play bar above the tabs.
(() => {
  const imgs = [...document.querySelectorAll("img")];
  const src = (i) => (i.src || i.getAttribute("src") || "") + (i.srcset || "");
  const remote = imgs.filter((i) => /ignimgs\.com|ytimg\.com|steamusercontent\.com/i.test(src(i)));
  const host = (u) => { try { return new URL(u, location.href).hostname; } catch (e) { return "?"; } };
  const hostCounts = {};
  for (const i of remote) { const h = host(src(i)); hostCounts[h] = (hostCounts[h] || 0) + 1; }

  const want = "__LABEL__".trim().toLowerCase();
  const sel = "[class*=Focusable],[role=tab],button,[tabindex],a";
  const candidates = [...document.querySelectorAll(sel)]
    .filter((el) => (el.textContent || "").trim().toLowerCase() === want);
  const tab = candidates.find((el) => !candidates.some((o) => o !== el && el.contains(o)));
  const beforeTab = (img) => !!tab && !!(img.compareDocumentPosition(tab) & Node.DOCUMENT_POSITION_FOLLOWING);

  return JSON.stringify({
    cardImageCount: remote.length,
    ignimgsCount: remote.filter((i) => /ignimgs\.com/i.test(src(i))).length,
    ytimgCount: remote.filter((i) => /ytimg\.com/i.test(src(i))).length,
    steamUgcCount: remote.filter((i) => /steamusercontent\.com/i.test(src(i))).length,
    dataUriAvatarCount: imgs.filter((i) => /^data:image/i.test(i.src || "") && !beforeTab(i)).length,
    hostCounts,
  });
})();

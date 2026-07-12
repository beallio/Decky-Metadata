// Inspect the community feed's rendered cards. Target: "Steam Big Picture Mode".
// Run after navigating to a shortcut and selecting its Community tab.
//
// Reports remote card images (ignimgs/ytimg/steamusercontent) and data-URI
// avatars (our injected provider icons — a non-zero count indicates the "?"
// placeholder is replaced). Read-only.
(() => {
  const imgs = [...document.querySelectorAll("img")];
  const src = (i) => (i.src || i.getAttribute("src") || "") + (i.srcset || "");
  const remote = imgs.filter((i) => /ignimgs\.com|ytimg\.com|steamusercontent\.com/i.test(src(i)));
  const host = (u) => { try { return new URL(u, location.href).hostname; } catch (e) { return "?"; } };
  const hostCounts = {};
  for (const i of remote) { const h = host(src(i)); hostCounts[h] = (hostCounts[h] || 0) + 1; }
  return JSON.stringify({
    cardImageCount: remote.length,
    ignimgsCount: remote.filter((i) => /ignimgs\.com/i.test(src(i))).length,
    ytimgCount: remote.filter((i) => /ytimg\.com/i.test(src(i))).length,
    steamUgcCount: remote.filter((i) => /steamusercontent\.com/i.test(src(i))).length,
    dataUriAvatarCount: imgs.filter((i) => /^data:image/i.test(i.src || "")).length,
    hostCounts,
  });
})()

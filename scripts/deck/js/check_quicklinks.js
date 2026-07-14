// Inspect the current Game Info page for the quick-links row and plugin
// metadata markers. Target: "Steam Big Picture Mode". No vars.
// Run after navigating to /library/app/<appid>/tab/GameInfo.
(() => {
  const text = document.body.innerText;
  const quickLinkLabels = new Set([
    "Store Page",
    "DLC",
    "Community Hub",
    "Points Shop",
    "Support",
  ]);
  const quickLinkOrder = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => quickLinkLabels.has(line));
  return JSON.stringify({
    quickLinksRow: quickLinkOrder.length > 0,
    storePage: quickLinkOrder.includes("Store Page"),
    dlc: quickLinkOrder.includes("DLC"),
    communityHub: quickLinkOrder.includes("Community Hub"),
    pointsShop: quickLinkOrder.includes("Points Shop"),
    support: quickLinkOrder.includes("Support"),
    quickLinkOrder,
    discussions: /Discussions/i.test(text),
    market: /Community Market|Market/i.test(text),
    developerInfo: /Developer/i.test(text),
    hltbRows: /MAIN STORY/i.test(text),
    textLength: text.length,
  });
})()

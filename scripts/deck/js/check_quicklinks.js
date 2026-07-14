// Inspect the current Game Info page for the quick-links row and plugin
// metadata markers. Target: "Steam Big Picture Mode". No vars.
// Run after navigating to /library/app/<appid>/tab/GameInfo.
(() => {
  const text = document.body.innerText;
  const hasDetailsMetadata = () => {
    for (const element of document.querySelectorAll("*")) {
      const fiberKey = Object.keys(element).find((key) => key.startsWith("__reactFiber$"));
      if (!fiberKey) continue;
      let fiber = element[fiberKey];
      for (let depth = 0; fiber && depth < 50; depth += 1, fiber = fiber.return) {
        const props = fiber.memoizedProps;
        if (!props?.details || !props?.overview) continue;
        const description = String(props.details.strFullDescription || "").trim();
        const developers = props.details.rgDevelopers;
        return description.length > 0 && Array.isArray(developers) && developers.length > 0;
      }
    }
    return false;
  };
  const quickLinkLabels = new Set([
    "Store Page",
    "DLC",
    "Community Hub",
    "Points Shop",
    "Support",
    "Market",
    "Community Market",
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
    market: quickLinkOrder.includes("Market") ||
      quickLinkOrder.includes("Community Market") ||
      /Community Market|Market/i.test(text),
    developerInfo: /Developer/i.test(text),
    detailsMetadata: hasDetailsMetadata(),
    hltbRows: /MAIN STORY/i.test(text),
    textLength: text.length,
  });
})()

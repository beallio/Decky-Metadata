// Inspect the current Game Info page for the quick-links row and plugin
// metadata markers. Target: "Steam Big Picture Mode". No vars.
// Run after navigating to /library/app/<appid>/tab/GameInfo.
(() => {
  const text = document.body.innerText;
  return JSON.stringify({
    quickLinksRow: /Store Page/i.test(text) || /Community Hub/i.test(text),
    storePage: /Store Page/i.test(text),
    communityHub: /Community Hub/i.test(text),
    discussions: /Discussions/i.test(text),
    developerInfo: /Developer/i.test(text),
    hltbRows: /MAIN STORY/i.test(text),
    textLength: text.length,
  });
})()

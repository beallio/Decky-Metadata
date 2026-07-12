// Inspect the currently-open modal/overlay: gamepad focus + navigability.
// Target: "Steam Big Picture Mode". Read-only. No vars.
//
// Built for debugging gamepad focus/close bugs (Steam modals need focus routed
// INTO them with navigable focusables). Reports the focusable set, which element
// holds gpfocus, whether focus is inside the modal, and any scroll container that
// can trap directional navigation. Run while a modal (e.g. a screenshot lightbox
// or dialog) is open.
(() => {
  const modal = document.querySelector(
    "[class*=FullModalOverlay],[class*=ModalOverlay],[role=dialog]"
  );
  if (!modal) return JSON.stringify({ modalPresent: false });
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const ae = document.activeElement;
  const focusables = [...modal.querySelectorAll("[class*=Focusable]")].map((el) => ({
    text: (el.textContent || "").trim().slice(0, 24),
    cls: (el.className || "").slice(0, 50),
    gpfocus: /\bgpfocus\b/.test(el.className || ""),
    rect: rect(el),
  }));
  // Scroll containers that could intercept directional nav (overflow > a few px).
  const scrollers = [...modal.querySelectorAll("*")]
    .filter((el) => { const s = getComputedStyle(el); return /auto|scroll/.test(s.overflowY) && el.scrollHeight - el.clientHeight > 2; })
    .slice(0, 4)
    .map((el) => ({ cls: (el.className || "").slice(0, 40), overflowPx: el.scrollHeight - el.clientHeight }));
  return JSON.stringify({
    modalPresent: true,
    modalClasses: (modal.className || "").slice(0, 60),
    focusablesInModal: focusables.length,
    focusables,
    activeElement: ae ? { text: (ae.textContent || "").trim().slice(0, 24), cls: (ae.className || "").slice(0, 50), rect: rect(ae) } : null,
    focusInsideModal: !!(ae && modal.contains(ae)),
    activeHasGpfocus: !!(ae && /\bgpfocus\b/.test(ae.className || "")),
    scrollTraps: scrollers,
    modalText: (modal.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
  }, null, 2);
})()

// Walk React fibers upward from the DOM element whose exact trimmed text is
// __TEXT__, printing the component chain (name, class-component?, our
// wrapper?). Target: "Steam Big Picture Mode". Vars: __TEXT__
(() => {
  const leaf = [...document.querySelectorAll("*")].find(
    (el) => (el.textContent || "").trim() === "__TEXT__" && el.children.length === 0
  );
  if (!leaf) return JSON.stringify({ error: "no leaf element with text __TEXT__" });
  const fiberKey = Object.keys(leaf).find((k) => k.startsWith("__reactFiber$"));
  if (!fiberKey) return JSON.stringify({ error: "no fiber on element" });
  let fiber = leaf[fiberKey];
  const chain = [];
  for (let i = 0; fiber && i < 50; i++, fiber = fiber.return) {
    const type = fiber.type;
    if (typeof type !== "function" && typeof type !== "string") continue;
    const props = fiber.memoizedProps || {};
    const propKeys = typeof type === "function" && props && typeof props === "object"
      ? Object.keys(props).filter((k) => k !== "children").slice(0, 6)
      : undefined;
    chain.push({
      name: typeof type === "string" ? type : type.displayName || type.name || "anon",
      cls: typeof type === "function" ? !!type.prototype?.isReactComponent : undefined,
      wrapped: typeof type === "function" ? !!type.__dmQuickLinksWrapper : undefined,
      propKeys,
    });
  }
  return JSON.stringify(chain);
})()

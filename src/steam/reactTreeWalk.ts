// Safe React element-tree traversal, extracted for unit testing.
//
// HAZARD (learned on-device 2026-07-11): a traversal that follows arbitrary
// object-valued props will wander into MobX store instances (overview /
// details / appStore). Enumerating an observable's keys inside an observer
// render subscribes that render to every property touched — after which any
// store change re-renders, re-walks, re-subscribes, and the renderer wedges.
// This walker therefore descends ONLY into React elements and arrays via
// props.children, with a node budget as a backstop.

export const isReactElement = (node: any): boolean =>
  !!node &&
  typeof node === "object" &&
  typeof node.$$typeof === "symbol" &&
  String(node.$$typeof).includes("react.");

export const findChildElements = (
  root: any,
  predicate: (node: any) => boolean,
  out: any[]
): void => {
  const stack = [root];
  let budget = 500;
  while (stack.length && budget-- > 0 && out.length < 8) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
      continue;
    }
    if (!isReactElement(node)) continue;
    try {
      if (predicate(node)) {
        out.push(node);
        continue;
      }
    } catch (_error) {
      // Keep walking when a candidate's props are not inspectable.
    }
    const children = node.props?.children;
    if (children && typeof children === "object") stack.push(children);
  }
};

export const isQuickLinksElement = (node: any): boolean => {
  const props = node?.props;
  return (
    !!props &&
    typeof props === "object" &&
    "overview" in props &&
    "details" in props &&
    "workshopVisible" in props &&
    "marketPresence" in props
  );
};

export const isInfoSectionBoundary = (node: any): boolean => {
  const props = node?.props;
  return (
    !!props &&
    typeof props === "object" &&
    "overview" in props &&
    "details" in props &&
    typeof node.type === "function" &&
    !node.type.prototype?.isReactComponent &&
    !(node.type as any).__dmQuickLinksWrapper
  );
};

// Page placement and launch hiding follow HLTB for Deck (MIT).
import { routerHook } from "@decky/api";
import {
  afterPatch,
  appDetailsClasses,
  appDetailsHeaderClasses,
  createReactTreePatcher,
  findInReactTree,
  MenuItem,
} from "@decky/ui";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { setHltbMenuItem } from "../contextMenuPatch";
import { GAME_DETAIL_ROUTES, getNativeOverview, isNativeNonSteamShortcut, metadataCache } from "../steam/core";
import { HltbController, type HltbSnapshot } from "./controller";
import { HltbStats } from "./HltbStats";
import { hltbStore, type HltbInputs } from "./store";

const ROW_KEY = "decky-metadata-hltb-row";

const positiveId = (value: unknown, maximum: number): number | null => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= maximum ? id : null;
};

/** The Steam ID, title and chosen HLTB game a lookup for this page is based on. */
export const hltbInputs = (appId: number, isShortcut: boolean, title: string): HltbInputs => {
  if (!isShortcut) return { steam: positiveId(appId, 0x7fffffff), title, pinned: null };
  const record = metadataCache[String(appId)];
  return {
    steam: positiveId(record?.steam_appid, 0x7fffffff),
    title,
    pinned: positiveId((record as { hltb_game_id?: unknown } | undefined)?.hltb_game_id, 0x7fffffff),
  };
};

function useSnapshot(): HltbSnapshot {
  const [snapshot, setSnapshot] = useState(hltbController.getSnapshot());
  useEffect(() => {
    const refresh = () => setSnapshot(hltbController.getSnapshot());
    const unsubscribe = hltbController.subscribe(refresh);
    refresh();
    return unsubscribe;
  }, []);
  return snapshot;
}

/** Hide the row while Steam's header animates into a game launch. */
function useLaunching(ref: { current: HTMLDivElement | null }, active: boolean): boolean {
  const [launching, setLaunching] = useState(false);
  useEffect(() => {
    if (!active) return;
    const header = Array.from(ref.current?.parentElement?.children ?? [])
      .find((child) => child.className.includes(appDetailsClasses.Header));
    const capsule = Array.from(header?.children ?? [])
      .find((child) => child.className.includes(appDetailsHeaderClasses.TopCapsule));
    const View = ref.current?.ownerDocument.defaultView?.MutationObserver;
    if (!capsule || !View) return;
    const observer = new View(() => {
      const name = capsule.className;
      const entering = [
        appDetailsHeaderClasses.FullscreenEnterStart, appDetailsHeaderClasses.FullscreenEnterActive,
        appDetailsHeaderClasses.FullscreenEnterDone, appDetailsHeaderClasses.FullscreenExitStart,
        appDetailsHeaderClasses.FullscreenExitActive,
      ].some((value) => value && name.includes(value));
      setLaunching(entering && !name.includes(appDetailsHeaderClasses.FullscreenExitDone));
    });
    observer.observe(capsule, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [active]);
  return launching;
}

function HltbGameRow({ appId }: { appId: number }) {
  const snapshot = useSnapshot();
  const ref = useRef<HTMLDivElement | null>(null);
  const [, rerender] = useState(0);
  const native = getNativeOverview(appId);
  const isShortcut = isNativeNonSteamShortcut(native);
  const title = String(native?.display_name ?? "").trim();
  const inputs = hltbInputs(appId, isShortcut, title);
  const active = snapshot.effectiveEnabled && !snapshot.settings.hiddenAppIds.includes(appId) && title !== "";
  const view = hltbStore.view(appId, inputs);
  const launching = useLaunching(ref, active);
  useEffect(() => hltbStore.subscribe(appId, () => rerender((value) => value + 1)), [appId]);
  useEffect(() => {
    if (active && view.needsFetch) hltbStore.request(appId, isShortcut, inputs);
  });
  if (!active) return null;
  const entry = view.entry?.status === "matched" ? view.entry : null;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <HltbStats stats={entry?.stats ?? null} hltbId={entry?.hltb_id ?? null} settings={snapshot.settings} launching={launching} />
    </div>
  );
}

/** True for the child that holds Steam's Play section (the row goes right above it). */
const isPlaySection = (child: ReactElement | null) => {
  const props = (child?.props ?? {}) as Record<string, any>;
  const inner = props.children?.props ?? {};
  return props.childFocusDisabled !== undefined && props.navRef !== undefined &&
    inner.details !== undefined && inner.overview !== undefined && inner.bFastRender !== undefined;
};

function installHltbGameView(): () => void {
  const unpatchers: Array<() => void> = [];
  for (const route of GAME_DETAIL_ROUTES) {
    const patch = routerHook.addPatch(route, (tree: any) => {
      const routeProps = findInReactTree(tree, (node: any) => node?.renderFunc);
      if (!routeProps) return tree;
      let appId = 0;
      const handler = createReactTreePatcher([
        (inner: any) => {
          const children = findInReactTree(inner, (node: any) => node?.props?.children?.props?.overview)?.props?.children;
          appId = Number(children?.props?.overview?.appid) || 0;
          return children ?? null;
        },
      ], (_args: unknown[], ret: ReactElement) => {
        const children = findInReactTree(ret, (node: any) =>
          Array.isArray(node?.props?.children) && node?.props?.className?.includes(appDetailsClasses.InnerContainer),
        )?.props?.children as Array<ReactElement | null> | undefined;
        if (!children || appId <= 0 || children.some((child) => child?.key === ROW_KEY)) return ret;
        const index = children.findIndex(isPlaySection);
        if (index >= 0) children.splice(index, 0, <HltbGameRow key={ROW_KEY} appId={appId} />);
        return ret;
      });
      const renderPatch = afterPatch(routeProps, "renderFunc", handler);
      unpatchers.push(() => renderPatch.unpatch());
      return tree;
    });
    unpatchers.push(() => routerHook.removePatch(route, patch));
  }
  setHltbMenuItem((appId) => (
    <MenuItem key="decky-metadata-hltb" onSelected={() => { void hltbController.toggleHidden(appId); }}>
      {"Show/Hide HLTB Stats"}
    </MenuItem>
  ));
  return () => {
    setHltbMenuItem(undefined);
    for (const unpatch of unpatchers.splice(0)) {
      try {
        unpatch();
      } catch {
        // Steam may already have released the route.
      }
    }
  };
}

export const hltbController = new HltbController({ install: installHltbGameView });

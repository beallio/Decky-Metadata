// Page placement and launch hiding follow HLTB for Deck (MIT).
import { routerHook } from "@decky/api";
import {
  afterPatch,
  appDetailsClasses,
  appDetailsHeaderClasses,
  basicAppDetailsSectionStylerClasses,
  createReactTreePatcher,
  findInReactTree,
} from "@decky/ui";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { GAME_DETAIL_ROUTES, getNativeOverview, isNativeNonSteamShortcut, metadataCache } from "../steam/core";
import { HltbController, type HltbSnapshot } from "./controller";
import { HltbStats } from "./HltbStats";
import { hltbStore, type HltbInputs } from "./store";
import type { HltbBlur, HltbSettings } from "./settings";
import type { HltbEntry } from "../backend";

const ROW_KEY = "decky-metadata-hltb-row";
const JOINED_CLASS = "decky-metadata-hltb-joined";
const NO_SURFACE = { joined: false, height: 0, paddingTop: 0 };

const px = (value: number) => String(Math.round(value * 100) / 100);

/** One blur surface: the Play section's own, grown up over the HLTB bar. */
const joinedRule = (height: number, paddingTop: number) =>
  `.${appDetailsClasses.InnerContainer}:has(> .${JOINED_CLASS}) .${basicAppDetailsSectionStylerClasses.PlaySection} { margin-top: calc(0px - ${px(height)}px); padding-top: calc(${px(paddingTop)}px + ${px(height)}px); }`;

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

export function useHltbSnapshot(): HltbSnapshot {
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

/**
 * The HLTB game a page shows for this app, looked up when missing or stale.
 * Nothing is looked up or returned unless `wanted` and the game has a title.
 */
export function useHltbMatch(appId: number, wanted: boolean): { active: boolean; entry: HltbEntry | null } {
  const [, rerender] = useState(0);
  const native = getNativeOverview(appId);
  const isShortcut = isNativeNonSteamShortcut(native);
  const title = String(native?.display_name ?? "").trim();
  const inputs = hltbInputs(appId, isShortcut, title);
  const active = wanted && title !== "";
  const view = hltbStore.view(appId, inputs);
  useEffect(() => hltbStore.subscribe(appId, () => rerender((value) => value + 1)), [appId]);
  useEffect(() => {
    if (active && view.needsFetch) hltbStore.request(appId, isShortcut, inputs);
  });
  return { active, entry: active && view.entry?.status === "matched" ? view.entry : null };
}

/**
 * Copy the native Play section's surface onto the row for the "Clean" styles, or
 * with clean-default on a blurred Play bar, extend that one blur over both rows:
 * the bar and underlay stay transparent and the Play rule supplies the surface.
 */
function useNativeCleanSurface(
  ref: { current: HTMLDivElement | null },
  enabled: boolean,
  style: HltbSettings["style"],
  blur: HltbBlur,
): { joined: boolean; height: number; paddingTop: number } {
  const [surface, setSurface] = useState(NO_SURFACE);
  const padding = useRef(0);
  useEffect(() => {
    const row = ref.current;
    const document = row?.ownerDocument;
    const view = document?.defaultView;
    if (!enabled || style === "default" || !row || !document || !view || !row.parentElement) {
      setSurface((previous) => previous.joined ? NO_SURFACE : previous);
      return;
    }
    const names = ["--hltb-native-background", "--hltb-native-opacity", "--hltb-native-underlay", "--hltb-native-underlay-opacity", "--hltb-native-backdrop"];
    const resize: { element: HTMLElement | null; observer: ResizeObserver | null } = { element: null, observer: null };
    function update(): void {
      const section = row.nextElementSibling?.querySelector<HTMLElement>(`.${basicAppDetailsSectionStylerClasses.PlaySection}`);
      const bar = row.querySelector<HTMLElement>(".decky-metadata-hltb-info");
      if (!section) {
        for (const name of names) row.style.removeProperty(name);
        resize.observer?.disconnect();
        resize.element = null;
        setSurface((previous) => previous.joined ? NO_SURFACE : previous);
        return;
      }
      const computed = view.getComputedStyle(section);
      // Native padding is only readable while our own rule is not applied.
      if (!row.classList.contains(JOINED_CLASS)) padding.current = parseFloat(computed.paddingTop) || 0;
      // Layout height, not the rect: Steam animates an ancestor transform on page entry.
      const height = bar ? parseFloat(view.getComputedStyle(bar).height) || 0 : 0;
      const radius = Number(/blur\(([\d.]+)px\)/.exec(computed.backdropFilter ?? "")?.[1] ?? 0);
      const joined = style === "clean-default" && blur !== "none" && radius > 0 && height > 0;
      row.style.setProperty("--hltb-native-background", joined ? "transparent" : computed.background);
      row.style.setProperty("--hltb-native-opacity", joined ? "1" : computed.opacity);
      row.style.setProperty("--hltb-native-backdrop", joined ? "none" : blur === "none" ? "none" : blur === "blur" ? "blur(8px)" : computed.backdropFilter);
      const root = section.closest<HTMLElement>(`.${basicAppDetailsSectionStylerClasses.AppDetailsRoot}`);
      const underlay = !joined && root && !root.contains(row) ? view.getComputedStyle(root) : null;
      row.style.setProperty("--hltb-native-underlay", joined ? "transparent" : underlay?.background ?? "transparent");
      row.style.setProperty("--hltb-native-underlay-opacity", joined ? "1" : underlay?.opacity ?? "1");
      if (bar !== resize.element) {
        resize.observer?.disconnect();
        resize.element = bar;
        if (bar) {
          resize.observer ??= new view.ResizeObserver(update);
          resize.observer.observe(bar);
        }
      }
      const next = joined ? { joined: true, height, paddingTop: padding.current } : NO_SURFACE;
      setSurface((previous) => previous.joined === next.joined && previous.height === next.height && previous.paddingTop === next.paddingTop ? previous : next);
    }
    update();
    const observer = new view.MutationObserver(update);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    observer.observe(row.parentElement, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      resize.observer?.disconnect();
      for (const name of names) row.style.removeProperty(name);
    };
  }, [enabled, style, blur]);
  return surface;
}

function HltbGameRow({ appId }: { appId: number }) {
  const snapshot = useHltbSnapshot();
  const ref = useRef<HTMLDivElement | null>(null);
  const { active, entry } = useHltbMatch(appId, snapshot.effectiveEnabled);
  const launching = useLaunching(ref, active);
  const surface = useNativeCleanSurface(ref, active, snapshot.settings.style, snapshot.settings.appearance.blur);
  if (!active) return null;
  return (
    <div ref={ref} className={surface.joined ? JOINED_CLASS : undefined} style={{ position: "relative", transformStyle: "preserve-3d" }}>
      {surface.joined && <style>{joinedRule(surface.height, surface.paddingTop)}</style>}
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
  return () => {
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

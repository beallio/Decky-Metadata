// Page placement and launch hiding follow HLTB for Deck (MIT).
import { routerHook } from "@decky/api";
import {
  afterPatch,
  appActionButtonClasses,
  appDetailsClasses,
  appDetailsHeaderClasses,
  basicAppDetailsSectionStylerClasses,
  createReactTreePatcher,
  findInReactTree,
  playSectionClasses,
} from "@decky/ui";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { GAME_DETAIL_ROUTES, getNativeOverview, isNativeNonSteamShortcut, metadataCache } from "../steam/core";
import { resolveSteamCssClass } from "../steam/nativeCssClasses";
import { HltbController, type HltbSnapshot } from "./controller";
import { HltbStats } from "./HltbStats";
import { getSteamHltbOverride, subscribeSteamOverrides } from "./steamOverrides";
import { hltbStore, type HltbInputs } from "./store";
import type { HltbBlur, HltbSettings } from "./settings";
import type { HltbEntry } from "../backend";

const ROW_KEY = "decky-metadata-hltb-row";
const JOINED_CLASS = "decky-metadata-hltb-joined";
const NO_SURFACE = { joined: false, height: 0, paddingTop: 0 };

const px = (value: number) => String(Math.round(value * 100) / 100);

/** One blur surface: the Play section's own, grown up over the HLTB bar. */
const joinedRule = (height: number, paddingTop: number) => {
  const inner = resolveSteamCssClass(appDetailsClasses?.InnerContainer, "appDetailsInnerContainer");
  const playSection = resolveSteamCssClass(basicAppDetailsSectionStylerClasses?.PlaySection, "playSection");
  const rule = `{ margin-top: calc(0px - ${px(height)}px); padding-top: calc(${px(paddingTop)}px + ${px(height)}px); }`;
  if (inner && playSection) return `.${inner}:has(> .${JOINED_CLASS}) .${playSection} ${rule}`;
  if (playSection) return `.${JOINED_CLASS} + * .${playSection} ${rule}`;
  return `.${JOINED_CLASS} + * ${rule}`;
};

const findHeaderElement = (row: HTMLDivElement): HTMLElement | undefined => {
  const container = row.parentElement;
  if (!container) return undefined;
  const headerClass = resolveSteamCssClass(appDetailsClasses?.Header, "appDetailsHeader");
  if (headerClass) {
    const matched = Array.from(container.children).find((child) => child.className.includes(headerClass));
    if (matched) return matched as HTMLElement;
  }
  return (row.previousElementSibling as HTMLElement | null) ?? undefined;
};

const findPlaySectionElement = (row: HTMLDivElement): HTMLElement | null => {
  const next = row.nextElementSibling as HTMLElement | null;
  if (!next) return null;
  const playSectionClass = resolveSteamCssClass(basicAppDetailsSectionStylerClasses?.PlaySection, "playSection");
  if (playSectionClass) {
    return next.querySelector<HTMLElement>(`.${playSectionClass}`);
  }
  return next.firstElementChild as HTMLElement | null ?? next;
};

const positiveId = (value: unknown, maximum: number): number | null => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= maximum ? id : null;
};

/** The Steam ID, title and chosen HLTB game a lookup for this page is based on. */
export const hltbInputs = (appId: number, isShortcut: boolean, title: string): HltbInputs => {
  if (!isShortcut) {
    return { steam: positiveId(appId, 0x7fffffff), title, pinned: getSteamHltbOverride(appId) };
  }
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
    if (!active || !ref.current) return;
    const header = findHeaderElement(ref.current);
    const topCapsuleClass = resolveSteamCssClass(appDetailsHeaderClasses?.TopCapsule, "topCapsule");
    const capsule = topCapsuleClass
      ? Array.from(header?.children ?? []).find((child) => child.className.includes(topCapsuleClass))
      : header?.firstElementChild ?? undefined;
    const View = ref.current?.ownerDocument.defaultView?.MutationObserver;
    if (!capsule || !View) return;
    const observer = new View(() => {
      const name = capsule.className;
      const entering = [
        resolveSteamCssClass(appDetailsHeaderClasses?.FullscreenEnterStart, "fullscreenEnterStart"),
        resolveSteamCssClass(appDetailsHeaderClasses?.FullscreenEnterActive, "fullscreenEnterActive"),
        resolveSteamCssClass(appDetailsHeaderClasses?.FullscreenEnterDone, "fullscreenEnterDone"),
        resolveSteamCssClass(appDetailsHeaderClasses?.FullscreenExitStart, "fullscreenExitStart"),
        resolveSteamCssClass(appDetailsHeaderClasses?.FullscreenExitActive, "fullscreenExitActive"),
      ].some((value) => value && name.includes(value));
      const exitDone = resolveSteamCssClass(appDetailsHeaderClasses?.FullscreenExitDone, "fullscreenExitDone");
      setLaunching(entering && (!exitDone || !name.includes(exitDone)));
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
  useEffect(() => {
    const refresh = () => rerender((value) => value + 1);
    const unsubscribeStore = hltbStore.subscribe(appId, refresh);
    const unsubscribeOverrides = isShortcut ? undefined : subscribeSteamOverrides(refresh);
    return () => {
      unsubscribeStore();
      unsubscribeOverrides?.();
    };
  }, [appId, isShortcut]);
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
  pushPlayDown: boolean,
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
      const section = findPlaySectionElement(row);
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
      const joined = !pushPlayDown && style === "clean-default" && blur !== "none" && radius > 0 && height > 0;
      row.style.setProperty("--hltb-native-background", joined ? "transparent" : computed.background);
      row.style.setProperty("--hltb-native-opacity", joined ? "1" : computed.opacity);
      row.style.setProperty("--hltb-native-backdrop", joined ? "none" : blur === "none" ? "none" : blur === "blur" ? "blur(8px)" : computed.backdropFilter);
      const appDetailsRootClass = resolveSteamCssClass(basicAppDetailsSectionStylerClasses?.AppDetailsRoot, "appDetailsRoot");
      const root = appDetailsRootClass ? section.closest<HTMLElement>(`.${appDetailsRootClass}`) : null;
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
  }, [enabled, style, blur, pushPlayDown]);
  return surface;
}

/**
 * True while a Steam Cloud or SDH-Ludusavi save status bar sits on the bottom of
 * the header art: pushing Play down would leave that bar without its backdrop.
 */
function useStatusBandOverlay(ref: { current: HTMLDivElement | null }, wanted: boolean): boolean {
  const [overlay, setOverlay] = useState(false);
  useEffect(() => {
    const row = ref.current;
    const container = row?.parentElement;
    const document = row?.ownerDocument;
    const view = document?.defaultView;
    if (!wanted || !row || !container || !document || !view) {
      setOverlay(false);
      return;
    }
    const status = resolveSteamCssClass(playSectionClasses?.CloudStatusRow, "cloudStatusRow");
    const selector = `[data-sdh-ludusavi-status-row="true"]${status ? `, .${status}` : ""}`;
    let frame = 0;
    const touching = (): boolean => {
      const header = findHeaderElement(row);
      const headerBgClass = resolveSteamCssClass(appDetailsHeaderClasses?.HeaderBackgroundImage, "headerBackgroundImage");
      const art = headerBgClass
        ? header?.querySelector<HTMLElement>(`.${headerBgClass}`)
        : header?.querySelector<HTMLElement>("img")?.parentElement ?? undefined;
      if (!art) return false;
      const bounds = art.getBoundingClientRect();
      // Only art-sized images follow the hero bounds; Steam's full-bleed backdrop sits below it.
      const bottom = Math.max(bounds.bottom, ...Array.from(art.querySelectorAll<HTMLElement>("img"), (image) => image.getBoundingClientRect())
        .filter((rect) => Math.abs(rect.width - bounds.width) <= 2)
        .map((rect) => rect.bottom));
      // Rect, not layout: Steam scales the page while it animates in.
      const flow = row.querySelector<HTMLElement>("#decky-metadata-hltb.decky-metadata-hltb-flow");
      const displacement = flow?.getBoundingClientRect().height ?? 0;
      for (const bar of Array.from(container.querySelectorAll<HTMLElement>(selector))) {
        const rect = bar.getBoundingClientRect();
        if (row.contains(bar) || !bar.textContent?.trim() || bar.offsetHeight <= 0 ||
            Math.abs(rect.width - bounds.width) > 2 || rect.bottom <= bounds.top ||
            rect.top - bottom > displacement + 1) continue;
        const own = view.getComputedStyle(bar);
        if (own.position === "absolute" || own.position === "fixed" || own.position === "sticky") continue;
        // SDH keeps its row in layout while suppressing its paint, so opacity 0 still counts.
        const suppressed = bar.getAttribute("data-sdh-ludusavi-paint-suppressed") === "true";
        let visible = true;
        for (let element: HTMLElement | null = bar; element; element = element.parentElement) {
          const style = view.getComputedStyle(element);
          if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" ||
              (!suppressed && Number(style.opacity) <= 0)) {
            visible = false;
            break;
          }
          if (element === container) break;
        }
        if (visible) return true;
      }
      return false;
    };
    const update = () => {
      frame = 0;
      const next = touching();
      setOverlay((previous) => previous === next ? previous : next);
    };
    const schedule = () => {
      if (!frame) frame = view.requestAnimationFrame(update);
    };
    const observer = new view.MutationObserver(schedule);
    observer.observe(container, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden", "data-sdh-ludusavi-status-row", "data-sdh-ludusavi-paint-suppressed"],
    });
    // CSS Loader themes restyle the page from the head and the root element alone.
    observer.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    const resize = new view.ResizeObserver(schedule);
    resize.observe(container);
    view.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      resize.disconnect();
      view.removeEventListener("resize", schedule);
      if (frame) view.cancelAnimationFrame(frame);
    };
  }, [wanted]);
  return wanted && overlay;
}

type PushRoom = { push: number; rowHeight: number };

/** A border box's layout top: unaffected by transforms and scroll position. */
function layoutTop(element: HTMLElement): number {
  let top = 0;
  for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
  return top;
}

/**
 * How far Play can move down before its button would go under Big Picture's footer.
 * Uses layout numbers, so scrolling and Steam's page-entry scale do not change it.
 */
function usePushRoom(ref: { current: HTMLDivElement | null }, wanted: boolean): PushRoom | null {
  const [room, setRoom] = useState<PushRoom | null>(null);
  useEffect(() => {
    const row = ref.current;
    const container = row?.parentElement;
    const document = row?.ownerDocument;
    const view = document?.defaultView;
    if (!wanted || !row || !container || !document || !view) {
      setRoom((previous) => previous === null ? previous : null);
      return;
    }
    let frame = 0;
    let footer: HTMLElement | null = null;
    const resize = new view.ResizeObserver(() => schedule());
    const footerResize = new view.ResizeObserver(() => schedule());
    const measure = (): PushRoom | null => {
      // The whole surface that moves Play down in flow mode, margins included. Never
      // the row wrapper: over the art it is 0 tall, so its height would flip the mode.
      const surface = row.querySelector<HTMLElement>("#decky-metadata-hltb");
      const surfaceStyle = surface && view.getComputedStyle(surface);
      const rowHeight = surface
        ? surface.offsetHeight + (parseFloat(surfaceStyle?.marginTop ?? "") || 0) + (parseFloat(surfaceStyle?.marginBottom ?? "") || 0)
        : 0;
      const section = findPlaySectionElement(row);
      if (!rowHeight || !section) return null;
      let scroller = container.parentElement;
      while (scroller) {
        const style = view.getComputedStyle(scroller);
        if (/(auto|scroll)/.test(style.overflowY)) break;
        scroller = scroller.parentElement;
      }
      if (!scroller || scroller.clientHeight <= 0) return null;
      const nextFooter = document.querySelector<HTMLElement>("#Footer");
      // Re-bound every pass: the footer can arrive or be replaced after the page has loaded.
      if (nextFooter !== footer) {
        footerResize.disconnect();
        footer = nextFooter;
        if (footer) footerResize.observe(footer);
      }
      const header = findHeaderElement(row);
      if (!header) return null;
      // Layout, not rects: Steam scales and translates the page while it animates in,
      // and a rect read mid-animation would stick until something else moved.
      // Absolute layout space, as for the footer: no rect and no scroller-local offset.
      const artBottom = layoutTop(header) + header.offsetHeight;
      // The visible bar's border box; the labels may overhang it but Play clears the bar.
      const footerTop = footer && footer.offsetHeight > 0
        ? layoutTop(footer)
        : layoutTop(scroller) + scroller.clientHeight;
      const lift = row.classList.contains(JOINED_CLASS) ? rowHeight : 0;
      const playButton = resolveSteamCssClass(appActionButtonClasses?.PlayButton, "playButton");
      const appActionButton = resolveSteamCssClass(basicAppDetailsSectionStylerClasses?.AppActionButton, "appActionButton");
      // The button face; the wrapper's AppActionButton class is the fallback.
      const button = (playButton ? section.querySelector<HTMLElement>(`.${playButton}`) : null) ??
        (appActionButton ? section.querySelector<HTMLElement>(`.${appActionButton}`) : null);
      // Relative to the section's top, in flow layout space: the joined rule adds `lift` padding.
      const buttonBottom = button
        ? layoutTop(button) - layoutTop(section) + button.offsetHeight - lift
        : section.offsetHeight - lift;
      const free = footerTop - 4 - artBottom - buttonBottom;
      return { push: Math.min(rowHeight, Math.max(0, Math.floor(free))), rowHeight };
    };
    const update = () => {
      frame = 0;
      const next = measure();
      setRoom((previous) => previous?.push === next?.push && previous?.rowHeight === next?.rowHeight ? previous : next);
    };
    const schedule = () => {
      if (!frame) frame = view.requestAnimationFrame(update);
    };
    const observer = new view.MutationObserver(schedule);
    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    // Themes restyle the page and the footer from the head and the root element.
    observer.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    resize.observe(container);
    view.addEventListener("resize", schedule);
    // Steam animates the page in without any resize or mutation: re-measure when it ends.
    document.addEventListener("transitionend", schedule, true);
    document.addEventListener("animationend", schedule, true);
    update();
    return () => {
      observer.disconnect();
      resize.disconnect();
      footerResize.disconnect();
      view.removeEventListener("resize", schedule);
      document.removeEventListener("transitionend", schedule, true);
      document.removeEventListener("animationend", schedule, true);
      if (frame) view.cancelAnimationFrame(frame);
    };
  }, [wanted]);
  return wanted ? room : null;
}

function HltbGameRow({ appId }: { appId: number }) {
  const snapshot = useHltbSnapshot();
  const ref = useRef<HTMLDivElement | null>(null);
  const { active, entry } = useHltbMatch(appId, snapshot.effectiveEnabled);
  const launching = useLaunching(ref, active);
  const { settings } = snapshot;
  const pushWanted = active && settings.pushPlayDown && (settings.style === "default" || settings.style === "clean-default");
  const overlay = useStatusBandOverlay(ref, pushWanted);
  const room = usePushRoom(ref, pushWanted && !overlay && settings.respectMenuBar);
  const pushPlayDown = settings.pushPlayDown && !overlay && room?.push !== 0;
  const surface = useNativeCleanSurface(ref, active, settings.style, settings.appearance.blur, pushPlayDown);
  const shortfall = room && room.push > 0 ? room.rowHeight - room.push : 0;
  if (!active) return null;
  return (
    <div ref={ref} className={surface.joined ? JOINED_CLASS : undefined} style={{ position: "relative", transformStyle: "preserve-3d", marginTop: shortfall ? -shortfall : undefined }}>
      {surface.joined && <style>{joinedRule(surface.height, surface.paddingTop)}</style>}
      <HltbStats stats={entry?.stats ?? null} hltbId={entry?.hltb_id ?? null} settings={{ ...settings, pushPlayDown }} launching={launching} />
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
        const innerContainer = resolveSteamCssClass(appDetailsClasses?.InnerContainer, "appDetailsInnerContainer");
        const children = findInReactTree(ret, (node: any) =>
          Array.isArray(node?.props?.children) && (
            (innerContainer && node?.props?.className?.includes(innerContainer)) ||
            node.props.children.some(isPlaySection)
          ),
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

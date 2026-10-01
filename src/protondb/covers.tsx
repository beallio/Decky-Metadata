import { createModuleMapping, Router } from "@decky/ui";
import { createElement, memo } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { getNativeOverview, getOverview } from "../steam/core";
import { findSteamUiDocumentMatch } from "../steam/steamUiHost";
import type { ProtonDbBadgeSettings, ProtonDbTier } from "../types";
import { protonDbBadgeController } from "./controller";
import { resolveProtonDbAppId } from "./identity";
import { PROTONDB_COLORS, protonDbTierLabel } from "./Icon";

// Native mounting boundaries and icon layout are from the local ProtonDB fork.
const COVER_SELECTOR = "._1pwP4eeP1zQD7PEgmsep0W";
const FOOTER_SELECTOR = "._3BPFqWN5T-x8njyrRYM1CX";
const OVERLAY_SELECTOR = "._2GRcKrPZsMSF6glMPRMZei";
const HOST_CLASS = "decky-metadata-protondb-cover-host";
const STYLE_ID = "decky-metadata-protondb-covers-style";
const APP_ID_FROM_SRC = /\/(?:assets|customimages)\/(\d+)/;
const COVER_CSS = `
.${HOST_CLASS}{display:contents}
.decky-metadata-protondb-cover{width:20px;height:20px;padding:2px;border-radius:20px;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:1}
.decky-metadata-protondb-cover--bottom-left{flex-shrink:0}
.decky-metadata-protondb-cover--top-left{position:absolute;top:4px;left:4px}
.decky-metadata-protondb-cover--top-right{position:absolute;top:4px;right:4px}
.decky-metadata-protondb-cover--focus{opacity:0}
.WYgDg9NyCcMIVuMyZ_NBC.gpfocus .decky-metadata-protondb-cover--focus,
${COVER_SELECTOR}.gpfocuswithin .decky-metadata-protondb-cover--focus,
${COVER_SELECTOR}:focus-within .decky-metadata-protondb-cover--focus,
${COVER_SELECTOR}:hover .decky-metadata-protondb-cover--focus{opacity:1;transition:opacity .6s cubic-bezier(0,.73,.48,1)}
`;

type Surface = "home" | "library";
type NativeRoot = { render(children: ReactNode): void; unmount(): void };
type NativeRootCreator = (container: HTMLElement) => NativeRoot;
type HostEntry = {
  host: HTMLElement; footer: Element; appId: number; key: number;
  name: string; sourceId: number | null; revision: number;
  tier: ProtonDbTier | null; disposeRating?: () => void;
};

const CoverIcon = memo(function CoverIcon({ appId, sourceId, tier, position, focusOnly }: {
  appId: number; sourceId: number | null; tier: ProtonDbTier | null;
  position: ProtonDbBadgeSettings["coverPosition"]; focusOnly: boolean;
}) {
  if (!tier || sourceId === null) return null;
  const color = PROTONDB_COLORS[tier];
  return (
    <div className={`decky-metadata-protondb-cover decky-metadata-protondb-cover--${position}${focusOnly ? " decky-metadata-protondb-cover--focus" : ""}`}
      data-appid={appId} data-protondb-appid={sourceId} data-protondb-tier={tier}
      role="img" aria-label={`ProtonDB ${protonDbTierLabel(tier)}`} title={`ProtonDB: ${protonDbTierLabel(tier)}`}>
      <svg viewBox="0 0 512 512" width="16" height="16" aria-hidden="true">
        <circle cx="256" cy="256" r="36" fill={color} />
        <ellipse cx="256" cy="256" rx="220" ry="88" fill="none" stroke={color} strokeWidth="28" />
        <ellipse cx="256" cy="256" rx="220" ry="88" fill="none" stroke={color} strokeWidth="28" transform="rotate(60 256 256)" />
        <ellipse cx="256" cy="256" rx="220" ry="88" fill="none" stroke={color} strokeWidth="28" transform="rotate(120 256 256)" />
      </svg>
    </div>
  );
});

const appIdFromCover = (cover: Element): number | null => {
  const tileId = cover.closest("[data-id]")?.getAttribute("data-id");
  const imageId = cover.querySelector("img")?.getAttribute("src")?.match(APP_ID_FROM_SRC)?.[1];
  const id = Number(tileId || imageId);
  return Number.isSafeInteger(id) && id > 0 && id <= 0xffffffff ? id : null;
};

const currentSurface = (): Surface | null => {
  const mainWindow = Router.WindowStore?.GamepadUIMainWindowInstance as unknown as {
    m_history?: { location?: { pathname?: string } };
  } | undefined;
  const path = mainWindow?.m_history?.location?.pathname;
  if (/^\/(?:routes\/)?library\/home(?:\/|$)/.test(path ?? "")) return "home";
  if (/^\/(?:routes\/)?library(?:\/collections(?:\/|$)|\/?$)/.test(path ?? "")) return "library";
  return null;
};

export const installProtonDbCoverBadges = (): (() => void) => {
  const creators = new Set<NativeRootCreator>();
  for (const module of createModuleMapping(value => typeof value?.createRoot === "function").values()) {
    creators.add(module.createRoot);
  }
  if (creators.size !== 1) throw new Error(`Expected one native React createRoot export; found ${creators.size}`);
  const createRoot = creators.values().next().value as NativeRootCreator;
  const hosts = new Map<Element, HostEntry>();
  const affected = new Set<Element>();
  let disposed = false;
  let document: Document | null = null;
  let root: NativeRoot | null = null;
  let style: HTMLStyleElement | null = null;
  let observer: MutationObserver | null = null;
  let renderQueued = false;
  let observerQueued = false;
  let nextKey = 0;
  let settings = protonDbBadgeController.getSnapshot().settings;

  const surfaceEnabled = (): boolean => {
    const snapshot = protonDbBadgeController.getSnapshot();
    const surface = currentSurface();
    return snapshot.settingsLoaded && snapshot.settings.enabled && surface !== null && snapshot.settings[surface];
  };

  const queueRender = (): void => {
    if (disposed || !root || renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => {
      renderQueued = false;
      if (disposed || !root) return;
      root.render(Array.from(hosts.values(), entry => createPortal(
        createElement(CoverIcon, {
          appId: entry.appId, sourceId: entry.sourceId, tier: entry.tier,
          position: settings.coverPosition, focusOnly: settings.focusOnly,
        }), entry.host, String(entry.key),
      )));
    });
  };

  const releaseEntry = (cover: Element, entry: HostEntry): void => {
    entry.revision += 1;
    entry.disposeRating?.();
    entry.disposeRating = undefined;
    entry.host.remove();
    hosts.delete(cover);
    queueRender();
  };

  const loadTier = (cover: Element, entry: HostEntry, overview: unknown): void => {
    const revision = ++entry.revision;
    entry.disposeRating?.();
    entry.disposeRating = undefined;
    entry.sourceId = null;
    entry.tier = null;
    queueRender();
    void resolveProtonDbAppId(entry.appId, overview).then(sourceId => {
      if (disposed || !surfaceEnabled() || hosts.get(cover) !== entry || entry.revision !== revision || sourceId === null) return;
      entry.sourceId = sourceId;
      const refresh = () => {
        if (disposed || hosts.get(cover) !== entry || entry.revision !== revision) return;
        const tier = protonDbBadgeController.getRating(sourceId).tier;
        if (entry.tier === tier) return;
        entry.tier = tier;
        queueRender();
      };
      entry.disposeRating = protonDbBadgeController.subscribeRating(sourceId, refresh);
      refresh();
    });
  };

  const reconcile = (cover: Element): void => {
    const existing = hosts.get(cover);
    const appId = appIdFromCover(cover);
    const footer = cover.querySelector(FOOTER_SELECTOR);
    const overlay = footer?.closest(OVERLAY_SELECTOR);
    const valid = cover.isConnected && cover.ownerDocument === document && appId !== null &&
      footer && overlay && cover.contains(overlay) && surfaceEnabled();
    if (existing && (!valid || existing.footer !== footer || existing.host.parentElement !== footer)) {
      releaseEntry(cover, existing);
    }
    if (!valid || !document || !footer || appId === null) return;
    const overview = getNativeOverview(appId) ?? getOverview(appId);
    const name = overview?.display_name ?? "";
    let entry = hosts.get(cover);
    if (!entry) {
      const host = document.createElement("div");
      host.className = HOST_CLASS;
      footer.prepend(host);
      entry = { host, footer, appId, name, key: nextKey++, revision: 0, sourceId: null, tier: null };
      hosts.set(cover, entry);
      loadTier(cover, entry, overview);
    } else if (entry.appId !== appId || entry.name !== name) {
      entry.appId = appId;
      entry.name = name;
      loadTier(cover, entry, overview);
    }
  };

  const collect = (node: Node): void => {
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (element.closest(`.${HOST_CLASS}`) && !element.classList.contains(HOST_CLASS)) return;
    const cover = element.closest(COVER_SELECTOR);
    if (cover) affected.add(cover);
    for (const child of element.querySelectorAll(COVER_SELECTOR)) affected.add(child);
  };

  const detachDocument = (): void => {
    observer?.disconnect();
    observer = null;
    affected.clear();
    root?.unmount();
    root = null;
    for (const entry of hosts.values()) {
      entry.revision += 1;
      entry.disposeRating?.();
      entry.host.remove();
    }
    hosts.clear();
    style?.remove();
    style = null;
    document = null;
  };

  const scan = (): void => {
    if (!document) return;
    for (const [cover, entry] of hosts) {
      if (!cover.isConnected || !entry.footer.isConnected || entry.host.parentElement !== entry.footer || !cover.contains(entry.footer)) {
        releaseEntry(cover, entry);
      }
    }
    for (const cover of document.querySelectorAll(COVER_SELECTOR)) reconcile(cover);
  };

  const syncDocument = (): void => {
    if (disposed) return;
    const nextDocument = surfaceEnabled()
      ? findSteamUiDocumentMatch(candidate => candidate.querySelector(COVER_SELECTOR) ? candidate as Document : undefined) ?? null
      : null;
    if (nextDocument === document) return;
    detachDocument();
    if (!nextDocument?.body) return;
    document = nextDocument;
    root = createRoot(document.createElement("div"));
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = COVER_CSS;
    document.head.appendChild(style);
    const popup = document.defaultView;
    if (!popup) return;
    const Observer = Reflect.get(popup, "MutationObserver") as typeof MutationObserver;
    observer = new Observer(records => {
      for (const record of records) {
        const target = record.target as Element;
        if (target.closest?.(`.${HOST_CLASS}`)) continue;
        collect(target);
        for (const node of record.addedNodes) collect(node);
        for (const node of record.removedNodes) collect(node);
      }
      if (observerQueued || disposed) return;
      observerQueued = true;
      queueMicrotask(() => {
        observerQueued = false;
        if (disposed || !document) return;
        for (const [cover, entry] of hosts) {
          if (!cover.isConnected || !entry.footer.isConnected || entry.host.parentElement !== entry.footer || !cover.contains(entry.footer)) affected.add(cover);
        }
        const covers = Array.from(affected);
        affected.clear();
        for (const cover of covers) reconcile(cover);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "data-id"] });
    scan();
  };

  const refreshSettings = (): void => {
    if (disposed) return;
    settings = protonDbBadgeController.getSnapshot().settings;
    syncDocument();
    scan();
    queueRender();
  };
  const unsubscribe = protonDbBadgeController.subscribe(refreshSettings);
  const maintenance = setInterval(syncDocument, 1_000);
  refreshSettings();
  return () => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    clearInterval(maintenance);
    detachDocument();
  };
};

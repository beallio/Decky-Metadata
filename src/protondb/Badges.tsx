import { Navigation } from "@decky/ui";
import {
  cloneElement, createElement, isValidElement, useEffect, useLayoutEffect, useRef, useState,
} from "react";
import type { ComponentType, ReactNode } from "react";
import { subscribeMetadataMatchChanges } from "../steam/core";
import { protonDbBadgeController } from "./controller";
import { resolveProtonDbAppId } from "./identity";
import { ProtonDbIcon, protonDbTierLabel } from "./Icon";

type CoverSurface = "home" | "library";
type CardProps = { className?: string; children?: ReactNode };
export type NativeProtonDbButtonProps = {
  className: string;
  direction: "bottom";
  onClick: () => void;
  toolTipContent: string;
  "aria-label": string;
  bNavStop?: boolean;
  children?: ReactNode;
};

const CARD_CLASS = "decky-metadata-protondb-card";
const COVER_KEY = "decky-metadata-protondb-cover";
// Steam raises focused artwork to z-index 12; the badge must stay above it.
const COVER_CSS = `
.decky-metadata-protondb-host{display:contents;pointer-events:none}
.decky-metadata-protondb-cover{position:absolute;z-index:13;left:8px;bottom:8px;width:22px;height:22px;padding:3px;border-radius:50%;background:rgba(0,0,0,.72);border:1px solid rgba(255,255,255,.12);pointer-events:none;display:flex;align-items:center;justify-content:center}
.decky-metadata-protondb-cover svg{width:100%;height:100%}
.decky-metadata-protondb-cover--top-left{top:8px;bottom:auto}
.decky-metadata-protondb-cover--top-right{top:8px;right:8px;left:auto;bottom:auto}
.decky-metadata-protondb-cover--focus{opacity:0}
.${CARD_CLASS}:hover .decky-metadata-protondb-cover--focus,
.${CARD_CLASS}.gpfocus .decky-metadata-protondb-cover--focus,
.${CARD_CLASS}.gpfocuswithin .decky-metadata-protondb-cover--focus,
.${CARD_CLASS}:focus-within .decky-metadata-protondb-cover--focus,
.${CARD_CLASS}:has(.gpfocus) .decky-metadata-protondb-cover--focus{opacity:1}
`;
const styleLeases = new WeakMap<Document, { style: HTMLStyleElement; count: number }>();

function acquireCoverStyle(document: Document): () => void {
  let entry = styleLeases.get(document);
  if (!entry) {
    const style = document.createElement("style");
    style.dataset.deckyMetadataProtondb = "covers";
    style.textContent = COVER_CSS;
    (document.head ?? document.documentElement).appendChild(style);
    entry = { style, count: 0 };
    styleLeases.set(document, entry);
  }
  const lease = entry;
  lease.count += 1;
  return () => {
    lease.count -= 1;
    if (lease.count === 0) {
      lease.style.remove();
      styleLeases.delete(document);
    }
  };
}

function useBadgeSnapshot(displayedAppId: number) {
  const [, update] = useState(0);
  useEffect(() => {
    const refresh = () => update(value => value + 1);
    const unsubscribe = protonDbBadgeController.subscribe(refresh);
    refresh();
    return unsubscribe;
  }, []);
  useEffect(() => subscribeMetadataMatchChanges(appId => {
    if (appId === displayedAppId) update(value => value + 1);
  }), [displayedAppId]);
  return protonDbBadgeController.getSnapshot();
}

function useBadgeTier(sourceAppId: number | null, active: boolean) {
  const [, update] = useState(0);
  useEffect(() => {
    if (!active || sourceAppId === null) return;
    const refresh = () => update(value => value + 1);
    const unsubscribe = protonDbBadgeController.subscribeRating(sourceAppId, refresh);
    refresh();
    return unsubscribe;
  }, [sourceAppId, active]);
  // Derive from the current source ID, never retain an old game's rating in state.
  return active && sourceAppId !== null ? protonDbBadgeController.getRating(sourceAppId).tier : null;
}

function ProtonDbCoverBadge({ displayedAppId, overview, surface }: {
  displayedAppId: number; overview: unknown; surface: CoverSurface;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const snapshot = useBadgeSnapshot(displayedAppId);
  const active = snapshot.settingsLoaded && snapshot.settings.enabled && snapshot.settings[surface];
  const sourceAppId = active ? resolveProtonDbAppId(displayedAppId, overview) : null;
  const tier = useBadgeTier(sourceAppId, active && visible);

  useLayoutEffect(() => {
    const element = host.current;
    if (!active || !element) {
      setVisible(false);
      return;
    }
    const cover = element.closest(`.${CARD_CLASS}`);
    if (!cover) return;
    const popup = element.ownerDocument.defaultView;
    if (!popup) return;
    const constructor: unknown = Reflect.get(popup, "IntersectionObserver");
    if (typeof constructor !== "function") return;
    // Use Steam's popup realm; SharedJSContext has a different viewport.
    const Observer = constructor as unknown as typeof IntersectionObserver;
    const releaseStyle = acquireCoverStyle(element.ownerDocument);
    const observer = new Observer(entries => {
      setVisible(entries.some(entry => entry.isIntersecting));
    });
    observer.observe(cover);
    return () => { observer.disconnect(); releaseStyle(); };
  }, [active, displayedAppId]);

  return (
    <span ref={host} className="decky-metadata-protondb-host" style={{ display: "contents", pointerEvents: "none" }}>
      {tier ? (
        <span className={`decky-metadata-protondb-cover decky-metadata-protondb-cover--${snapshot.settings.coverPosition}${snapshot.settings.focusOnly ? " decky-metadata-protondb-cover--focus" : ""}`}
          role="img" aria-label={`ProtonDB ${protonDbTierLabel(tier)}`} title={`ProtonDB: ${protonDbTierLabel(tier)}`}>
          <ProtonDbIcon tier={tier} />
        </span>
      ) : null}
    </span>
  );
}

export function decorateProtonDbCover(output: unknown, overview: unknown, surface: CoverSurface): unknown {
  if (!isValidElement<CardProps>(output) || typeof output.props.className !== "string") return output;
  if (!overview || typeof overview !== "object" || !("appid" in overview) || typeof overview.appid !== "number") return output;
  const children = Array.isArray(output.props.children) ? output.props.children : [output.props.children];
  if (children.some(child => isValidElement(child) && child.key === COVER_KEY)) return output;
  return cloneElement(output, {
    className: `${output.props.className} ${CARD_CLASS}`,
    children: [...children, createElement(ProtonDbCoverBadge, {
      key: COVER_KEY, displayedAppId: overview.appid, overview, surface,
    })],
  });
}

export function subscribeProtonDbCoverChanges(listener: () => void): () => void {
  let previous = protonDbBadgeController.getSnapshot();
  return protonDbBadgeController.subscribe(() => {
    const next = protonDbBadgeController.getSnapshot();
    const changed = previous.settingsLoaded !== next.settingsLoaded ||
      previous.settings.enabled !== next.settings.enabled || previous.settings.home !== next.settings.home ||
      previous.settings.library !== next.settings.library || previous.settings.focusOnly !== next.settings.focusOnly ||
      previous.settings.coverPosition !== next.settings.coverPosition;
    previous = next;
    if (changed) listener();
  });
}

export function ProtonDbGameButton({ displayedAppId, overview, Button, className }: {
  displayedAppId: number;
  overview: unknown;
  Button: ComponentType<NativeProtonDbButtonProps>;
  className: string;
}) {
  const snapshot = useBadgeSnapshot(displayedAppId);
  const active = snapshot.settingsLoaded && snapshot.settings.enabled && snapshot.settings.gameView;
  const sourceAppId = active ? resolveProtonDbAppId(displayedAppId, overview) : null;
  const tier = useBadgeTier(sourceAppId, active);
  if (!tier || sourceAppId === null) return null;
  const label = `ProtonDB: ${protonDbTierLabel(tier)}`;
  return (
    <Button className={className} direction="bottom" bNavStop onClick={() => {
      Navigation.NavigateToExternalWeb(`https://www.protondb.com/app/${sourceAppId}`);
    }} toolTipContent={label} aria-label={label}>
      <ProtonDbIcon tier={tier} />
    </Button>
  );
}

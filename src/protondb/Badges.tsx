import { Navigation } from "@decky/ui";
import { useEffect, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { getNativeOverview } from "../steam/core";
import { protonDbBadgeController } from "./controller";
import { resolveProtonDbAppId } from "./identity";
import { ProtonDbIcon, protonDbTierLabel } from "./Icon";

export type NativeProtonDbButtonProps = {
  className: string;
  direction: "bottom";
  onClick: () => void;
  toolTipContent: string;
  "aria-label": string;
  bNavStop?: boolean;
  children?: ReactNode;
};

function useBadgeSnapshot() {
  const [, update] = useState(0);
  useEffect(() => {
    const refresh = () => update(value => value + 1);
    const unsubscribe = protonDbBadgeController.subscribe(refresh);
    refresh();
    return unsubscribe;
  }, []);
  return protonDbBadgeController.getSnapshot();
}

function useSourceAppId(displayedAppId: number, overview: unknown, active: boolean) {
  const name = getNativeOverview(displayedAppId)?.display_name ??
    (overview && typeof overview === "object" && "display_name" in overview ? overview.display_name : "");
  const [resolved, setResolved] = useState<{ displayedAppId: number; name: unknown; id: number | null } | null>(null);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void resolveProtonDbAppId(displayedAppId, overview).then(id => {
      if (!cancelled) setResolved({ displayedAppId, name, id });
    });
    return () => { cancelled = true; };
  }, [displayedAppId, name, active]);
  return active && resolved?.displayedAppId === displayedAppId && resolved.name === name ? resolved.id : null;
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
  return active && sourceAppId !== null ? protonDbBadgeController.getRating(sourceAppId).tier : null;
}

export function ProtonDbGameButton({ displayedAppId, overview, Button, className }: {
  displayedAppId: number;
  overview: unknown;
  Button: ComponentType<NativeProtonDbButtonProps>;
  className: string;
}) {
  const snapshot = useBadgeSnapshot();
  const active = snapshot.settingsLoaded && snapshot.settings.enabled && snapshot.settings.gameView;
  const sourceAppId = useSourceAppId(displayedAppId, overview, active);
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

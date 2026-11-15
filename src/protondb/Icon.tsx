import type { CSSProperties } from "react";
import { t } from "../i18n";
import type { ProtonDbTier } from "../types";

export const PROTONDB_COLORS: Record<ProtonDbTier, string> = {
  platinum: "#b4c7dc",
  gold: "#cfb53b",
  silver: "#a6a6a6",
  bronze: "#cd7f32",
  borked: "#ff0000",
};

/** Tiers are enum values, so each label needs its own literal key. */
export const protonDbTierLabel = (tier: ProtonDbTier): string => {
  switch (tier) {
    case "platinum": return t("protondb.tier.platinum");
    case "gold": return t("protondb.tier.gold");
    case "silver": return t("protondb.tier.silver");
    case "bronze": return t("protondb.tier.bronze");
    case "borked": return t("protondb.tier.borked");
  }
};

export function ProtonDbIcon({ tier, size }: { tier?: ProtonDbTier; size?: number }) {
  const style: CSSProperties | undefined = tier ? { color: PROTONDB_COLORS[tier] } : undefined;
  return (
    <svg viewBox="0 0 32 32" width={size ?? "100%"} height={size ?? "100%"} style={style} aria-hidden="true">
      <circle cx="16" cy="16" r="2.3" fill="currentColor" />
      <g fill="none" stroke="currentColor" strokeWidth="1.7">
        <ellipse cx="16" cy="16" rx="13" ry="5.2" />
        <ellipse cx="16" cy="16" rx="13" ry="5.2" transform="rotate(60 16 16)" />
        <ellipse cx="16" cy="16" rx="13" ry="5.2" transform="rotate(120 16 16)" />
      </g>
    </svg>
  );
}

import type { CSSProperties } from "react";
import type { ProtonDbTier } from "../types";

export const PROTONDB_COLORS: Record<ProtonDbTier, string> = {
  platinum: "#b4c7dc",
  gold: "#cfb53b",
  silver: "#a6a6a6",
  bronze: "#cd7f32",
  borked: "#ff0000",
};

export const protonDbTierLabel = (tier: ProtonDbTier): string =>
  tier.charAt(0).toUpperCase() + tier.slice(1);

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

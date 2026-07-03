// Shared semantic style tokens, aligned with beallio/SDH-Ludusavi.
export const colors = {
  accent: "#1a9fff",
  info: "#60a5fa",
  success: "#4ade80",
  warning: "#f59e0b",
  error: "#f87171",
  errorIcon: "#ef4444",
  text: "#f8fafc",
  textSecondary: "#cbd5e1",
  surfaceKnockout: "#0b151f",
} as const;

// #1a9fff as rgb components, for CSS that needs alpha (e.g. the overlay).
export const accentRgb = "26, 159, 255";
export const accentRgba = (alpha: number): string => `rgba(${accentRgb}, ${alpha})`;

// Spacing scale - px (4-based), aligned with SDH-Ludusavi's px spacing.
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// Type scale - px, matching the reference (12 / 13 / 14 / 16 / 20).
export const fontSize = {
  xs: 12,
  sm: 13,
  md: 14,
  lg: 16,
  xl: 20,
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  heavy: 800,
} as const;

// Steam's UI face; Gaming Mode already uses it, set explicitly for parity/Desktop.
export const fontFamily = '"Motiva Sans", Arial, sans-serif';

export type StatusKind = "active" | "success" | "warning" | "error" | "idle";

export const statusColor = (kind: StatusKind): string => ({
  active: colors.accent,
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
  idle: colors.textSecondary,
}[kind]);

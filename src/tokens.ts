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

export type StatusKind = "active" | "success" | "warning" | "error" | "idle";

export const statusColor = (kind: StatusKind): string => ({
  active: colors.accent,
  success: colors.success,
  warning: colors.warning,
  error: colors.error,
  idle: colors.textSecondary,
}[kind]);

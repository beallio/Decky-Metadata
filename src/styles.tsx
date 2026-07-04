import { DialogButton, Spinner } from "@decky/ui";
import {
  colors,
  fontFamily,
  fontSize,
  fontWeight,
  space,
  statusColor,
  type StatusKind,
} from "./tokens";

export const FocusableButton = (props: any) => (
  <DialogButton focusable={true} {...props} />
);

export const pageStyle = {
  padding: 24,
  paddingTop: 48,
  paddingBottom: 120,
  minHeight: "100vh",
  boxSizing: "border-box",
  fontFamily,
} as const;

export const pageTitleStyle = {
  width: "100%",
  fontSize: fontSize.xl,
  fontWeight: fontWeight.bold,
  paddingBottom: space.md,
  outline: "none",
  // Keep the title clear of the SteamOS top bar when the controller scrolls to it.
  scrollMarginTop: 90,
} as const;

export const toggleGridStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  columnGap: space.md,
  width: "100%",
  minWidth: 0,
} as const;

export const qamPanelStyle = {
  width: "100%",
  fontFamily,
} as const;

export const rowStackStyle = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  gap: space.md,
} as const;

export const buttonRowStyle = {
  display: "flex",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  gap: space.sm,
  alignItems: "center",
  flexWrap: "wrap",
} as const;

export const spacedButtonRowStyle = {
  ...buttonRowStyle,
  marginTop: space.sm,
} as const;

export const actionButtonStackStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: space.sm,
  flex: "1 1 208px",
  minWidth: 0,
} as const;

export const resultsStackStyle = {
  ...rowStackStyle,
  marginTop: 20,
} as const;

export const fieldStyle = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
} as const;

export const flexFieldStyle = {
  ...fieldStyle,
  flex: "1 1 224px",
} as const;

export const compactTextStyle = {
  color: colors.textSecondary,
  fontSize: fontSize.sm,
  lineHeight: 1.35,
} as const;

export const inlineStatusBaseStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  ...compactTextStyle,
} as const;

export const inlineStatusStyle = (kind: StatusKind) => ({
  ...inlineStatusBaseStyle,
  color: statusColor(kind),
});

export const busySpinnerStyle = {
  width: "18px",
  height: "18px",
  color: colors.accent,
} as const;

export const buttonLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "10px",
  minWidth: 136,
} as const;

export const sectionHeadingStyle = {
  width: "100%",
  paddingTop: space.md,
  fontWeight: fontWeight.bold,
  fontSize: fontSize.lg,
} as const;

export const diagnosticsGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space.md,
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
} as const;

export const diagnosticsRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: space.xs,
  alignItems: "start",
  padding: `${space.xxs}px 0`,
  ...compactTextStyle,
} as const;

export const diagnosticsValueStyle = {
  minWidth: 0,
  overflowWrap: "anywhere",
  color: colors.textSecondary,
} as const;

export const focusableBlockStyle = {
  display: "block",
  width: "100%",
  minWidth: 0,
} as const;

export const BusySpinner = () => (
  <Spinner style={busySpinnerStyle} />
);

export const ButtonLabel = ({ children, busy = false }: { children: string; busy?: boolean }) => (
  <span style={buttonLabelStyle}>
    {busy ? <BusySpinner /> : null}
    {children}
  </span>
);

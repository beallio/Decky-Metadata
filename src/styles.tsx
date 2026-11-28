import { DialogButton, Spinner } from "@decky/ui";
import { colors, fontFamily, fontSize, fontWeight, space, statusColor, type StatusKind } from "./tokens";

export const FocusableButton = (props: any) => (
  <DialogButton focusable={!props.disabled} {...props} />
);




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


export const fieldStyle = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
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


export const BusySpinner = () => (
  <Spinner style={busySpinnerStyle} />
);

export const ButtonLabel = ({ children, busy = false }: { children: string; busy?: boolean }) => (
  <span style={buttonLabelStyle}>
    {busy ? <BusySpinner /> : null}
    {children}
  </span>
);

import { accentRgba, colors, fontSize } from "./tokens";

export const editorRootClassName = "decky-metadata-editor";
export const editorFocusTargetClassName = "decky-metadata-editor__focus-target";

export const editorSearchRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(112px, max-content)",
  alignItems: "center",
  gap: 8,
  width: "100%",
  minWidth: 0,
} as const;

export const editorSearchInputRowSpacingStyle = {
  marginTop: 12,
} as const;

export const editorSearchResultsSpacingStyle = {
  marginTop: 12,
} as const;

export const editorSearchButtonStyle = {
  width: "100%",
  minWidth: 112,
  whiteSpace: "nowrap",
} as const;

export const editorSteamMatchCardStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 12,
  width: "100%",
  minWidth: 0,
  textAlign: "left",
  whiteSpace: "normal",
} as const;

export const editorSteamMatchImageStyle = {
  width: 138,
  height: 52,
  flexShrink: 0,
  objectFit: "cover",
  borderRadius: 4,
} as const;

export const editorSteamMatchPreviewStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minWidth: 0,
  padding: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 4,
} as const;

export const editorRowStyle = {
  background: "rgb(35, 38, 46)",
  borderRadius: 2,
  padding: 12,
  minWidth: 0,
} as const;

export const editorLabeledRowStyle = {
  ...editorRowStyle,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)",
  alignItems: "center",
  gap: 12,
} as const;

export const editorStackedRowStyle = {
  ...editorRowStyle,
  display: "flex",
  flexDirection: "column",
  gap: 8,
} as const;

export const editorRowLabelStyle = {
  color: "rgb(139, 146, 154)",
  fontSize: fontSize.md,
  overflowWrap: "anywhere",
} as const;

export const editorSubheadingStyle = {
  margin: 0,
  fontSize: fontSize.lg,
  fontWeight: 500,
} as const;

export const editorNoticeStyle = {
  background: accentRgba(0.07),
  border: `1px solid ${accentRgba(0.25)}`,
  borderRadius: 4,
  padding: "8px 12px",
  color: "#cfe3f5",
  fontSize: fontSize.sm,
  lineHeight: "18px",
} as const;

export const editorAppIdRowStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 8,
  width: "100%",
  minWidth: 0,
} as const;

export const editorAppIdButtonStyle = {
  width: "auto",
  minWidth: 0,
  paddingLeft: 24,
  paddingRight: 24,
  whiteSpace: "nowrap",
} as const;

export const editorRowActionStyle = {
  ...editorAppIdButtonStyle,
  maxWidth: "100%",
  justifySelf: "end",
  whiteSpace: "normal",
  overflowWrap: "anywhere",
} as const;

export const editorFieldMarkerBaseStyle = {
  borderLeft: "3px solid transparent",
  paddingLeft: 12,
} as const;

export const editorFieldEditedStyle = {
  ...editorFieldMarkerBaseStyle,
  borderLeftColor: colors.accent,
} as const;

export const editorFieldPreviewStyle = {
  ...editorFieldMarkerBaseStyle,
  borderLeftColor: colors.warning,
} as const;

export const editorFieldEditedLabelStyle = {
  color: colors.accent,
} as const;

export const editorFieldPreviewLabelStyle = {
  color: colors.warning,
} as const;

export const editorFieldMarkerTagStyle = {
  marginLeft: 8,
  fontSize: 12,
  fontWeight: 600,
} as const;

export const editorScopedCss = `
.decky-metadata-editor .decky-metadata-editor__focus-target {
  scroll-margin-block: 12px;
}

/* Keep search-result text readable instead of filling the focused row. */
.decky-metadata-editor .decky-metadata-editor__result:focus-visible,
.decky-metadata-editor .decky-metadata-editor__result.gpfocus {
  background: transparent !important;
  color: white !important;
  outline: 3px solid white !important;
  outline-offset: 2px;
  box-shadow: 0 0 0 5px #1a9fff !important;
}
`;

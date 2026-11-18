import { colors } from "./tokens";

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


export const editorSteamMatchImageStyle = {
  width: 138,
  height: 52,
  flexShrink: 0,
  objectFit: "cover",
  borderRadius: 4,
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
`;

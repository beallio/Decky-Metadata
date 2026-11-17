import { colors } from "./tokens";

export const editorRootClassName = "decky-metadata-editor";
export const editorFocusTargetClassName = "decky-metadata-editor__focus-target";
export const editorToolbarClearance = 104;
export const editorScrollViewportStyle = {
  scrollPaddingTop: editorToolbarClearance,
  scrollPaddingBottom: 39,
} as const;

export const editorActionBarStyle = {
  position: "sticky",
  top: 40,
  zIndex: 20,
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  width: "100%",
  minWidth: 0,
  margin: "-4px 0 0",
  padding: "8px 16px",
  boxSizing: "border-box",
  background: "rgba(14, 20, 27, 0.96)",
  backdropFilter: "blur(8px)",
} as const;

export const editorActionButtonStyle = {
  width: "100%",
  minWidth: 0,
  whiteSpace: "nowrap",
} as const;

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

export const editorSourceStackStyle = {
  width: "100%",
  minWidth: 0,
} as const;

export const editorSourceFieldStyle = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  padding: "0 12px",
  background: "transparent",
  boxSizing: "border-box",
} as const;

export const editorLabelStyle = {
  display: "block",
  marginBottom: 7,
} as const;

export const editorDescriptionFieldStyle = {
  ...editorSourceFieldStyle,
  marginTop: 16,
} as const;

export const editorSourceGroupStyle = {
  ...editorSourceFieldStyle,
  marginTop: 14,
} as const;

export const editorReleaseRatingRowStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  marginTop: 14,
  padding: "0 12px",
  boxSizing: "border-box",
} as const;

export const editorCategoryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  columnGap: 12,
  rowGap: 6,
  width: "100%",
  minWidth: 0,
} as const;

export const editorCategoryRowMetrics = {
  minHeight: 36,
  padding: "4px 12px",
  margin: 0,
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

export const editorActionBarNativeStyle = {
  ...editorActionBarStyle,
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) 72px",
} as const;

export const editorMoreButtonStyle = {
  width: "100%",
  minWidth: 0,
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
.decky-metadata-editor .decky-metadata-editor__focus-target,
.decky-metadata-editor .decky-metadata-editor__category-grid > div,
.decky-metadata-editor .decky-metadata-editor__category-grid > div [role="checkbox"] {
  scroll-margin-top: ${editorToolbarClearance}px;
  scroll-margin-bottom: 24px;
}

.decky-metadata-editor .decky-metadata-editor__action--save:disabled {
  opacity: 0.55;
  filter: saturate(0.45);
}

.decky-metadata-editor .decky-metadata-editor__category-grid > div {
  display: flex;
  align-items: center;
  min-height: ${editorCategoryRowMetrics.minHeight}px !important;
  padding: ${editorCategoryRowMetrics.padding} !important;
  margin: ${editorCategoryRowMetrics.margin} !important;
  box-sizing: border-box;
}

.decky-metadata-editor .decky-metadata-editor__shortcut-name {
  background: transparent !important;
}

/*
 * Keep search results and shortcut-name text readable with a border-only
 * focus highlight instead of Steam's default filled background.
 */
.decky-metadata-editor .decky-metadata-editor__result:focus-visible,
.decky-metadata-editor .decky-metadata-editor__result.gpfocus,
.decky-metadata-editor .decky-metadata-editor__shortcut-name:focus-visible,
.decky-metadata-editor .decky-metadata-editor__shortcut-name.gpfocus {
  background: transparent !important;
  color: white !important;
  outline: 3px solid white !important;
  outline-offset: 2px;
  box-shadow: 0 0 0 5px #1a9fff !important;
}
`;

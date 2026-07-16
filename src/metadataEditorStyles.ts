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

export const editorSaveButtonStyle = {
  ...editorActionButtonStyle,
  color: "white",
  background: "linear-gradient(180deg, #75b022 0%, #588a1b 100%)",
} as const;

export const editorRemoveButtonStyle = {
  ...editorActionButtonStyle,
  color: "white",
  background: "linear-gradient(180deg, #d94b43 0%, #a92f2a 100%)",
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

export const editorScopedCss = `
.decky-metadata-editor .decky-metadata-editor__focus-target,
.decky-metadata-editor .decky-metadata-editor__category-grid > div,
.decky-metadata-editor .decky-metadata-editor__category-grid > div [role="checkbox"] {
  scroll-margin-top: ${editorToolbarClearance}px;
  scroll-margin-bottom: 24px;
}

.decky-metadata-editor .decky-metadata-editor__action--save:hover {
  color: white !important;
  background: #75b022 !important;
}

.decky-metadata-editor .decky-metadata-editor__action--remove:hover {
  color: white !important;
  background: #d94b43 !important;
}

.decky-metadata-editor .decky-metadata-editor__action--save:focus-visible,
.decky-metadata-editor .decky-metadata-editor__action--save.gpfocus,
.decky-metadata-editor .decky-metadata-editor__action--remove:focus-visible,
.decky-metadata-editor .decky-metadata-editor__action--remove.gpfocus {
  color: white !important;
  outline: 3px solid white !important;
  outline-offset: 2px;
  box-shadow: 0 0 0 5px #1a9fff !important;
}

.decky-metadata-editor .decky-metadata-editor__action--save:focus-visible,
.decky-metadata-editor .decky-metadata-editor__action--save.gpfocus {
  background: #75b022 !important;
}

.decky-metadata-editor .decky-metadata-editor__action--remove:focus-visible,
.decky-metadata-editor .decky-metadata-editor__action--remove.gpfocus {
  background: #d94b43 !important;
}

.decky-metadata-editor .decky-metadata-editor__action--save:disabled,
.decky-metadata-editor .decky-metadata-editor__action--remove:disabled {
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
`;

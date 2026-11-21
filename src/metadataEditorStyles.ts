import { colors } from "./tokens";

export const editorRootClassName = "decky-metadata-editor";
export const editorFocusTargetClassName = "decky-metadata-editor__focus-target";

export const editorSearchRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
} as const;

export const editorSearchInputStyle = {
  flex: "1 1 auto",
  minWidth: 0,
} as const;


export const editorSearchButtonStyle = {
  flex: "0 0 auto",
  // DialogButton is width:100% natively, which squeezed the input to nothing.
  width: "auto",
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

// Mirrors Steam's Properties > Shortcut > Launch Options block (AppProperties SectionTopLine/TopGap, Title, input row).
export const editorNativeInputSectionStyle = {
  marginTop: 20,
  paddingTop: 20,
  borderTop: "1px solid rgba(59, 63, 72, 0.5)",
} as const;

// The first stacked field on a page has no separator line above it.
export const editorNativeInputFirstStyle = {
  marginBottom: 20,
} as const;

export const editorNativeInputGapStyle = {
  marginTop: 10,
  marginBottom: 20,
} as const;

export const editorNativeInputTitleStyle = {
  color: "#8b929a",
  fontSize: 15,
  fontWeight: 500,
  letterSpacing: "0.5px",
  textTransform: "uppercase",
} as const;

// Block-level row lets Steam's flex input wrapper take the full width.
export const editorNativeInputRowStyle = {
  marginTop: 6,
} as const;

// Steam's Custom Sort Name input keeps this width beside its inline label.
export const editorInlineInputStyle = {
  minWidth: "20vw",
} as const;

export const editorScopedCss = `
.decky-metadata-editor .decky-metadata-editor__focus-target {
  scroll-margin-block: 12px;
}

/* Steam drops its white focus look when the on-screen keyboard takes focus; keep it while the box holds the cursor. */
.decky-metadata-editor input.DialogInput.decky-metadata-editor__input-active:not(:disabled) {
  background-color: #fff;
  color: #000;
}
`;

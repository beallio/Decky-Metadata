import { describe, expect, it } from "vitest";
import {
  editorAppIdRowStyle,
  editorFieldEditedStyle,
  editorFieldMarkerBaseStyle,
  editorFieldMarkerTagStyle,
  editorFieldPreviewStyle,
  editorRowActionStyle,
  editorScopedCss,
  editorSearchInputRowSpacingStyle,
  editorSearchResultsSpacingStyle,
  editorSearchRowStyle,
  editorSteamMatchImageStyle,
} from "./metadataEditorStyles";

describe("metadata editor native-row contract", () => {
  it("keeps search and App ID controls on fluid native rows", () => {
    expect(editorSearchRowStyle.gridTemplateColumns).toBe(
      "minmax(0, 1fr) minmax(112px, max-content)"
    );
    expect(editorAppIdRowStyle.gridTemplateColumns).toBe("minmax(0, 1fr) auto");
    expect(editorSearchInputRowSpacingStyle.marginTop).toBe(12);
    expect(editorSearchResultsSpacingStyle.marginTop).toBe(12);
  });

  it("keeps field edit markers visible in Field labels", () => {
    expect(editorFieldMarkerBaseStyle).toMatchObject({ borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: "transparent" });
    expect(editorFieldEditedStyle.borderLeftColor).toBe("#1a9fff");
    expect(editorFieldPreviewStyle.borderLeftColor).toBe("#f59e0b");
    expect(editorFieldMarkerTagStyle.fontSize).toBe(12);
  });

  it("keeps cover images sized for native match rows", () => {
    expect(editorSteamMatchImageStyle).toMatchObject({ width: 138, height: 52 });
  });

  it("lets long Load from Steam labels wrap inside the row", () => {
    expect(editorRowActionStyle).toMatchObject({
      maxWidth: "100%",
      minWidth: 0,
      whiteSpace: "normal",
    });
  });

  it("keeps a small pane scroll margin and uses native focus styling", () => {
    expect(editorScopedCss).toContain("scroll-margin-block: 12px");
    expect(editorScopedCss).not.toContain(".decky-metadata-editor__result:focus-visible");
  });
});

import { describe, expect, it } from "vitest";
import {
  editorAppIdRowStyle,
  editorLabeledRowStyle,
  editorRowActionStyle,
  editorRowLabelStyle,
  editorRowStyle,
  editorScopedCss,
  editorSearchInputRowSpacingStyle,
  editorSearchResultsSpacingStyle,
  editorSearchRowStyle,
  editorStackedRowStyle,
} from "./metadataEditorStyles";

describe("metadata editor layout contract", () => {
  it("uses native row cards for paired controls and stacked fields", () => {
    expect(editorRowStyle).toMatchObject({
      background: "rgb(35, 38, 46)",
      borderRadius: 2,
      padding: 12,
    });
    expect(editorRowLabelStyle).toMatchObject({ color: "rgb(139, 146, 154)", fontSize: 14 });
    expect(editorLabeledRowStyle).toMatchObject({
      ...editorRowStyle,
      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)",
    });
    expect(editorStackedRowStyle).toMatchObject({ ...editorRowStyle, flexDirection: "column" });
  });

  it("keeps the search and App ID controls on fluid input/action rows", () => {
    expect(editorSearchRowStyle.gridTemplateColumns).toBe(
      "minmax(0, 1fr) minmax(112px, max-content)"
    );
    expect(editorAppIdRowStyle.gridTemplateColumns).toBe("minmax(0, 1fr) auto");
    expect(editorSearchRowStyle.display).toBe("grid");
    expect(editorAppIdRowStyle.display).toBe("grid");
    expect(editorSearchInputRowSpacingStyle.marginTop).toBe(12);
    expect(editorSearchResultsSpacingStyle.marginTop).toBe(12);
  });

  it("lets long Load from Steam labels wrap inside the row", () => {
    expect(editorRowActionStyle).toMatchObject({
      maxWidth: "100%",
      minWidth: 0,
      whiteSpace: "normal",
    });
  });

  it("keeps a small pane scroll margin and readable search-result focus", () => {
    expect(editorScopedCss).toContain("scroll-margin-block: 12px");
    expect(editorScopedCss).toContain(".decky-metadata-editor__result:focus-visible");
    expect(editorScopedCss).toContain(".decky-metadata-editor__result.gpfocus");
  });
});

import { describe, expect, it } from "vitest";
import {
  editorActionBarStyle,
  editorActionButtonStyle,
  editorAppIdRowStyle,
  editorCategoryGridStyle,
  editorCategoryRowMetrics,
  editorDescriptionFieldStyle,
  editorLabelStyle,
  editorReleaseRatingRowStyle,
  editorRemoveButtonStyle,
  editorSaveButtonStyle,
  editorScopedCss,
  editorScrollViewportStyle,
  editorSearchInputRowSpacingStyle,
  editorSearchResultsSpacingStyle,
  editorSearchRowStyle,
  editorSourceFieldStyle,
  editorSourceGroupStyle,
  editorToolbarClearance,
} from "./metadataEditorStyles";

describe("metadata editor layout contract", () => {
  it("keeps the action bar sticky below Steam's header with equal columns", () => {
    expect(editorActionBarStyle).toMatchObject({
      position: "sticky",
      top: 40,
      display: "grid",
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: 8,
      padding: "8px 16px",
    });
    expect(editorActionBarStyle.zIndex).toBeGreaterThan(0);
    expect(editorActionButtonStyle.width).toBe("100%");
    expect(editorToolbarClearance).toBeGreaterThanOrEqual(104);
    expect(editorScrollViewportStyle).toEqual({
      scrollPaddingTop: editorToolbarClearance,
      scrollPaddingBottom: 39,
    });
  });

  it("gives Save and Remove their approved semantic treatments", () => {
    expect(editorSaveButtonStyle).toMatchObject({
      color: "white",
      background: "linear-gradient(180deg, #75b022 0%, #588a1b 100%)",
    });
    expect(editorRemoveButtonStyle).toMatchObject({
      color: "white",
      background: "linear-gradient(180deg, #d94b43 0%, #a92f2a 100%)",
    });
    expect(editorScopedCss).toContain(":focus-visible");
    expect(editorScopedCss).toContain(":disabled");
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

  it("aligns source fields and preserves the approved vertical rhythm", () => {
    expect(editorSourceFieldStyle).toMatchObject({
      width: "100%",
      padding: "0 12px",
      background: "transparent",
      boxSizing: "border-box",
    });
    expect(editorLabelStyle.marginBottom).toBe(7);
    expect(editorDescriptionFieldStyle.marginTop).toBe(16);
    expect(editorSourceGroupStyle.marginTop).toBe(14);
    expect(editorReleaseRatingRowStyle).toMatchObject({
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: 8,
      padding: "0 12px",
    });
  });

  it("locks the dense two-column native category layout", () => {
    expect(editorCategoryGridStyle).toMatchObject({
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      columnGap: 12,
      rowGap: 6,
    });
    expect(editorCategoryRowMetrics).toEqual({
      minHeight: 36,
      padding: "4px 12px",
      margin: 0,
    });
    expect(editorScopedCss).toContain(".decky-metadata-editor__category-grid > div");
    expect(editorScopedCss).toMatch(
      /\.decky-metadata-editor__category-grid > div \{[^}]*display: flex;[^}]*align-items: center;/s
    );
  });
});

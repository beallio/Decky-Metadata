import { describe, expect, it } from "vitest";
import {
  editorFieldMarkerTagStyle,
  editorScopedCss,
  editorSearchButtonStyle,
  editorSearchRowStyle,
  editorSteamMatchImageStyle,
} from "./metadataEditorStyles";

describe("metadata editor native-row contract", () => {
  it("keeps search controls on flexible native rows", () => {
    expect(editorSearchRowStyle.display).toBe("flex");
    expect(editorSearchButtonStyle).toMatchObject({ minWidth: 112, whiteSpace: "nowrap" });
  });

  it("keeps field marker tags readable", () => {
    expect(editorFieldMarkerTagStyle.fontSize).toBe(12);
  });

  it("keeps cover images sized for native match rows", () => {
    expect(editorSteamMatchImageStyle).toMatchObject({ width: 138, height: 52 });
  });

  it("keeps a small pane scroll margin", () => {
    expect(editorScopedCss).toContain("scroll-margin-block: 12px");
  });
});

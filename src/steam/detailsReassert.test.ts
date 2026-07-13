import { describe, expect, it } from "vitest";
import { hasMatchedSteamAppId, reassertMatchedAppData } from "./detailsReassert";

const metadata = {
  title: "Matched Game",
  description: "Full matched description",
  short_description: "Short description",
  developers: [{ name: "Developer", url: "https://example.com/developer" }],
  publishers: [{ name: "Publisher", url: "https://example.com/publisher" }],
};

describe("reassertMatchedAppData", () => {
  it("identifies only metadata records with a real matched Steam app id", () => {
    expect(hasMatchedSteamAppId({ ...metadata, steam_appid: 338930 } as any)).toBe(true);
    expect(hasMatchedSteamAppId({ ...metadata, steam_appid: null } as any)).toBe(false);
    expect(hasMatchedSteamAppId({ ...metadata, steam_appid: 0 } as any)).toBe(false);
    expect(hasMatchedSteamAppId(undefined)).toBe(false);
  });

  it("repopulates a rebuilt details object before SteamUI receives it", () => {
    const screenshots = [{ id: "shot-1" }];
    const appData: any = {
      details: {
        unAppID: 123,
        strFullDescription: "",
        strSnippet: "",
        vecScreenShots: [],
      },
      descriptionsData: { strFullDescription: "", strSnippet: "" },
      associationData: { rgDevelopers: [], rgPublishers: [], rgFranchises: [] },
    };

    expect(reassertMatchedAppData(appData, metadata as any, screenshots)).toBe(true);
    expect(appData.details).toMatchObject({
      strFullDescription: "Full matched description",
      strSnippet: "Full matched description",
      rgDevelopers: [{ strName: "Developer", strURL: "https://example.com/developer" }],
      rgPublishers: [{ strName: "Publisher", strURL: "https://example.com/publisher" }],
      rgFranchises: [],
      nScreenshots: 1,
      vecScreenShots: screenshots,
    });
    expect(appData.descriptionsData).toEqual({
      strFullDescription: "Full matched description",
      strSnippet: "Full matched description",
    });
    expect(appData.associationData).toEqual({
      rgDevelopers: [{ strName: "Developer", strURL: "https://example.com/developer" }],
      rgPublishers: [{ strName: "Publisher", strURL: "https://example.com/publisher" }],
      rgFranchises: [],
    });
  });

  it("falls back to the short description and leaves screenshot fields alone when empty", () => {
    const appData: any = { details: { strFullDescription: "native", nScreenshots: 4 } };

    expect(
      reassertMatchedAppData(
        appData,
        { ...metadata, description: "", developers: undefined, publishers: undefined } as any,
        []
      )
    ).toBe(true);
    expect(appData.details).toMatchObject({
      strFullDescription: "Short description",
      strSnippet: "Short description",
      nScreenshots: 4,
    });
    expect(appData.descriptionsData.strFullDescription).toBe("Short description");
    expect(appData.associationData).toEqual({
      rgDevelopers: [],
      rgPublishers: [],
      rgFranchises: [],
    });
  });

  it("does nothing until Steam has created a native details object", () => {
    const appData = { descriptionsData: { strFullDescription: "native" } };

    expect(reassertMatchedAppData(appData, metadata as any, [])).toBe(false);
    expect(appData).toEqual({ descriptionsData: { strFullDescription: "native" } });
  });
});

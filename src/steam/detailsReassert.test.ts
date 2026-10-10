import { describe, expect, it } from "vitest";
import { autorun, observable, runInAction } from "mobx";
import { hasMatchedSteamAppId, reassertMatchedAppData } from "./detailsReassert";

const metadata = {
  title: "Matched Game",
  description: "Full matched description",
  short_description: "Short description",
  developers: [{ name: "Developer", url: "https://example.com/developer" }],
  publishers: [{ name: "Publisher", url: "https://example.com/publisher" }],
};

describe("reassertMatchedAppData", () => {
  it("identifies only metadata records with a positive safe Steam app id", () => {
    expect(hasMatchedSteamAppId({ ...metadata, steam_appid: 338930 } as any)).toBe(true);
    expect(hasMatchedSteamAppId({ ...metadata, steam_appid: "338930" } as any)).toBe(true);
    expect(hasMatchedSteamAppId({ ...metadata, steam_appid: null } as any)).toBe(false);
    expect(hasMatchedSteamAppId({ ...metadata, steam_appid: 0 } as any)).toBe(false);
    expect(hasMatchedSteamAppId({ ...metadata, steam_appid: true } as any)).toBe(false);
    expect(hasMatchedSteamAppId({ ...metadata, steam_appid: 1.5 } as any)).toBe(false);
    expect(hasMatchedSteamAppId({ ...metadata, steam_appid: Infinity } as any)).toBe(false);
    expect(hasMatchedSteamAppId({ ...metadata, steam_appid: Number.MAX_SAFE_INTEGER + 1 } as any)).toBe(false);
    expect(hasMatchedSteamAppId({ ...metadata, steam_appid: "not-an-id" } as any)).toBe(false);
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
      strFullDescription: "Short description",
      strSnippet: "Short description",
      rgDevelopers: [{ strName: "Developer", strURL: "https://example.com/developer" }],
      rgPublishers: [{ strName: "Publisher", strURL: "https://example.com/publisher" }],
      rgFranchises: [],
      nScreenshots: 1,
      vecScreenShots: screenshots,
    });
    expect(appData.descriptionsData).toEqual({
      strFullDescription: "Short description",
      strSnippet: "Short description",
    });
    expect(appData.associationData).toEqual({
      rgDevelopers: [{ strName: "Developer", strURL: "https://example.com/developer" }],
      rgPublishers: [{ strName: "Publisher", strURL: "https://example.com/publisher" }],
      rgFranchises: [],
    });
  });

  it("suppresses synthetic Community Market presence only for matched shortcuts", () => {
    const matchedAppData: any = { details: { bCommunityMarketPresence: true } };
    const unmatchedAppData: any = { details: { bCommunityMarketPresence: true } };

    expect(reassertMatchedAppData(
      matchedAppData,
      { ...metadata, steam_appid: 338930 } as any,
      [],
    )).toBe(true);
    expect(reassertMatchedAppData(unmatchedAppData, metadata as any, [])).toBe(true);

    expect(matchedAppData.details.bCommunityMarketPresence).toBe(false);
    expect(unmatchedAppData.details.bCommunityMarketPresence).toBe(true);
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

  it("uses a long fallback when the saved short field is whitespace only", () => {
    const appData: any = { details: {} };
    reassertMatchedAppData(appData, { ...metadata, short_description: " \n " } as any, []);
    expect(appData.details.strFullDescription).toBe("Full matched description");
    expect(appData.details.strSnippet).toBe("Full matched description");
  });

  it("settles detail-page renders when a peer copies observable details inside Steam's DLC autorun", () => {
    const appData = observable({
      details: {
        strFullDescription: "Native description",
        strSnippet: "Native snippet",
        rgDevelopers: [],
        rgPublishers: [],
        rgFranchises: [],
        vecDLC: [],
      },
      descriptionsData: { strFullDescription: "Native description", strSnippet: "Native snippet" },
      associationData: { rgDevelopers: [], rgPublishers: [], rgFranchises: [] },
    });
    const featuredDlc = observable.box<unknown[]>([]);
    let pendingRenders = 0;
    const stopDlc = autorun(() => {
      // Unifideck's borrowed-details getter reads every observable own field.
      const borrowedDetails = { ...appData.details };
      runInAction(() => featuredDlc.set([...borrowedDetails.vecDLC]));
    });
    const stopRender = autorun(() => {
      featuredDlc.get();
      pendingRenders += 1;
    });
    let applications = 0;
    try {
      // Model Metadata's fulfilled-cache promise after each native page render.
      // A bounded drain reports the feedback bug instead of hanging the suite.
      while (pendingRenders > 0 && applications < 12) {
        pendingRenders -= 1;
        applications += 1;
        runInAction(() => reassertMatchedAppData(appData, metadata as any, []));
      }
      expect(pendingRenders).toBe(0);
      expect(applications).toBeLessThanOrEqual(2);
      expect(appData.details.strFullDescription).toBe("Short description");
    } finally {
      stopRender();
      stopDlc();
    }
  });

  it("keeps observable detail readers quiet for freshly allocated equivalent metadata and screenshots", () => {
    const appData: any = observable({ details: {} as Record<string, any> });
    const screenshots = [{ id: "shot-1", strImageURL: "https://example.com/shot.png", nWidth: 1280 }];
    runInAction(() => reassertMatchedAppData(appData, metadata as any, screenshots));
    const displayedMetadata: unknown[] = [];
    const stop = autorun(() => {
      const borrowedDetails = { ...appData.details };
      displayedMetadata.push({
        description: borrowedDetails.strFullDescription,
        cachedDescription: appData.descriptionsData.strFullDescription,
        publisher: appData.associationData.rgPublishers[0].strName,
        screenshot: appData.screenshots.rgScreenshots[0].strImageURL,
      });
    });
    try {
      runInAction(() => reassertMatchedAppData(
        appData,
        { ...metadata, developers: metadata.developers.map((person) => ({ ...person })), publishers: metadata.publishers.map((person) => ({ ...person })) } as any,
        screenshots.map((image) => ({ ...image })),
      ));
      expect(displayedMetadata).toEqual([{
        description: "Short description",
        cachedDescription: "Short description",
        publisher: "Publisher",
        screenshot: "https://example.com/shot.png",
      }]);
    } finally {
      stop();
    }
  });

  it("updates changed metadata and repopulates a new native details object without changing the shortcut identity", () => {
    const appData: any = {
      details: { unAppID: 123, strShortcutExe: "/games/shortcut", vecDLC: [{ appid: 456 }] },
    };
    reassertMatchedAppData(appData, metadata as any, []);
    const updated = {
      ...metadata,
      short_description: "Saved description",
      developers: [{ name: "Saved developer", url: "" }],
      publishers: [],
    };
    reassertMatchedAppData(appData, updated as any, []);
    expect(appData.details).toMatchObject({
      unAppID: 123,
      strShortcutExe: "/games/shortcut",
      vecDLC: [{ appid: 456 }],
      strFullDescription: "Saved description",
      rgDevelopers: [{ strName: "Saved developer", strURL: "" }],
      rgPublishers: [],
    });

    appData.details = { unAppID: 123, strShortcutExe: "/games/shortcut", vecDLC: [{ appid: 456 }] };
    reassertMatchedAppData(appData, updated as any, []);
    expect(appData.details).toMatchObject({
      unAppID: 123,
      strShortcutExe: "/games/shortcut",
      vecDLC: [{ appid: 456 }],
      strFullDescription: "Saved description",
      rgDevelopers: [{ strName: "Saved developer", strURL: "" }],
      rgPublishers: [],
    });
  });

  it("updates visible gallery data when screenshot content changes", () => {
    const appData: any = observable({ details: {} as Record<string, any> });
    const before = [{ id: "shot-1", strImageURL: "https://example.com/old.png", strCaption: "Old", nWidth: 1280 }];
    const after = [{ id: "shot-1", strImageURL: "https://example.com/new.png", strCaption: "New", nWidth: 1920 }];
    runInAction(() => reassertMatchedAppData(appData, metadata as any, before));
    const galleryFrames: unknown[] = [];
    const stop = autorun(() => {
      const image = appData.screenshots.rgScreenshots[0];
      galleryFrames.push({ url: image.strImageURL, caption: image.strCaption, width: image.nWidth });
    });
    try {
      runInAction(() => reassertMatchedAppData(appData, metadata as any, after));
      expect(galleryFrames).toEqual([
        { url: "https://example.com/old.png", caption: "Old", width: 1280 },
        { url: "https://example.com/new.png", caption: "New", width: 1920 },
      ]);
      expect(appData.details.vecScreenShots[0]).toMatchObject(after[0]);
    } finally {
      stop();
    }
  });

  it("does nothing until Steam has created a native details object", () => {
    const appData = { descriptionsData: { strFullDescription: "native" } };

    expect(reassertMatchedAppData(appData, metadata as any, [])).toBe(false);
    expect(appData).toEqual({ descriptionsData: { strFullDescription: "native" } });
  });
});

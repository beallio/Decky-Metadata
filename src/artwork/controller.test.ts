import { describe, expect, it, vi } from "vitest";
import type { ArtworkSettings, ArtworkSlot, FetchedArtworkAsset, GameArtworkState } from "../types";

vi.mock("../backend", () => ({
  clearLocalArtworkFile: vi.fn(),
  fetchSteamArtworkAsset: vi.fn(),
  getAllArtworkLocks: vi.fn(),
  getArtworkSettings: vi.fn(),
  getArtworkSummary: vi.fn(),
  getGameArtworkState: vi.fn(),
  getSgdbKeyStatus: vi.fn(),
  getTransparentArtworkAsset: vi.fn(),
  readLocalArtworkFile: vi.fn(),
  saveLocalArtworkIcon: vi.fn().mockResolvedValue("/tmp/icon.jpg"),
  setArtworkLocked: vi.fn(),
  setArtworkSettings: vi.fn(),
  sgdbFetchAsset: vi.fn(),
}));
vi.mock("../steam/core", () => ({ metadataCache: {} }));
vi.mock("../toast", () => ({ toastSuccess: vi.fn(), toastError: vi.fn() }));
vi.mock("../i18n", () => ({
  t: (key: string) => key,
  translateBackendError: (error: unknown) => String(error),
}));
vi.mock("../pluginConflicts", () => ({
  pluginConflicts: {
    isPluginActive: () => false,
    subscribe: () => () => undefined,
  },
}));

import {
  ArtworkController,
  DEFAULT_ARTWORK_SETTINGS,
  type ArtworkControllerDeps,
} from "./controller";

const makeGameState = (
  appId: number,
  steamAppId: number,
  overrides?: Partial<{ locked: boolean; present: Partial<Record<ArtworkSlot, boolean>>; avail: Partial<Record<ArtworkSlot, boolean>> }>,
): GameArtworkState => ({
  app_id: appId,
  steam_appid: steamAppId,
  locked: overrides?.locked ?? false,
  slots: {
    cover: {
      present: overrides?.present?.cover ?? false,
      preview_data_url: null,
      steam_url: "https://shared.steamstatic.com/cover.jpg",
      available: overrides?.avail?.cover ?? true,
    },
    wide: {
      present: overrides?.present?.wide ?? false,
      preview_data_url: null,
      steam_url: "https://shared.steamstatic.com/wide.jpg",
      available: overrides?.avail?.wide ?? true,
    },
    hero: {
      present: overrides?.present?.hero ?? false,
      preview_data_url: null,
      steam_url: "https://shared.steamstatic.com/hero.jpg",
      available: overrides?.avail?.hero ?? true,
    },
    logo: {
      present: overrides?.present?.logo ?? false,
      preview_data_url: null,
      steam_url: "https://shared.steamstatic.com/logo.png",
      available: overrides?.avail?.logo ?? true,
    },
    icon: {
      present: overrides?.present?.icon ?? false,
      preview_data_url: null,
      steam_url: "https://shared.steamstatic.com/icon.jpg",
      available: overrides?.avail?.icon ?? true,
    },
  },
});

const makeDeps = (settings: Partial<ArtworkSettings> = DEFAULT_ARTWORK_SETTINGS): ArtworkControllerDeps => ({
  getArtworkSettings: vi.fn().mockResolvedValue({ ...DEFAULT_ARTWORK_SETTINGS, ...settings }),
  setArtworkSettings: vi.fn().mockImplementation(async (next) => next),
  getSgdbKeyStatus: vi.fn().mockResolvedValue({ hasUserKey: false, hasBuiltInKey: true, configured: true }),
  getArtworkSummary: vi.fn().mockResolvedValue({
    matched: 2,
    complete: 1,
    missing_games: 1,
    missing_slots: 3,
    existing_enabled_slots: 2,
    locked_games: 1,
  }),
  getAllArtworkLocks: vi.fn().mockResolvedValue({ "1002": true }),
  setArtworkLocked: vi.fn().mockImplementation(async (_id, locked) => locked),
  getGameArtworkState: vi.fn().mockResolvedValue(
    makeGameState(1001, 1145350, {
      present: { cover: true },
      avail: { logo: false },
    }),
  ),
  fetchSteamArtworkAsset: vi.fn().mockImplementation(async (_appId, _steamId, slot) => ({
    slot,
    base64: "AA==",
    ext: "jpg",
    mime: "image/jpeg",
    file_path: null,
  })),
  sgdbFetchAsset: vi.fn().mockImplementation(async (_appId, slot) => ({
    slot,
    base64: "SGDB==",
    ext: "png",
    mime: "image/png",
    file_path: null,
  })),
  readLocalArtworkFile: vi.fn().mockImplementation(async (_appId, slot) => ({
    slot,
    base64: "LOCAL==",
    ext: "png",
    mime: "image/png",
    file_path: null,
  })),
  getTransparentArtworkAsset: vi.fn().mockImplementation(async (_appId, slot) => ({
    slot,
    base64: "TRANS==",
    ext: "png",
    mime: "image/png",
    file_path: null,
  })),
  saveLocalArtworkIcon: vi.fn().mockResolvedValue("/tmp/icon.jpg"),
  clearLocalArtworkFile: vi.fn().mockResolvedValue({ ok: true, removed: true }),
  applySteamArtworkSlot: vi.fn().mockResolvedValue(undefined),
  clearSteamArtworkSlot: vi.fn().mockResolvedValue(undefined),
  getMetadataCache: () => ({
    "1001": { title: "Hades II", id: 1001, description: "", store_categories: [], steam_dlc_appids: [], has_points_shop: false, steam_appid: 1145350 },
    "1002": { title: "Celeste", id: 1002, description: "", store_categories: [], steam_dlc_appids: [], has_points_shop: false, steam_appid: 504230 },
  }),
  isSteamGridDbActive: vi.fn().mockReturnValue(true),
  subscribePluginConflicts: vi.fn().mockReturnValue(() => undefined),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
});

describe("ArtworkController", () => {
  it("preserves existing slots and skips unavailable or disabled slots in fill-missing mode", async () => {
    const deps = makeDeps({
      autoApply: true,
      preserveExisting: true,
      slots: { cover: true, wide: false, hero: true, logo: true, icon: true },
    });
    const ctrl = new ArtworkController(deps);

    const result = await ctrl.applyForGame(1001, 1145350, "fill-missing");
    expect(result).toEqual({ applied: 2, failed: 0, skippedLocked: false });
    // Cover is already present, wide is disabled globally, logo is unavailable on Steam -> only hero & icon applied.
    expect(deps.applySteamArtworkSlot).toHaveBeenCalledTimes(2);
    expect(deps.applySteamArtworkSlot).toHaveBeenCalledWith(1001, "hero", expect.any(Object));
    expect(deps.applySteamArtworkSlot).toHaveBeenCalledWith(1001, "icon", expect.any(Object));
  });

  it("replaces existing enabled slots in replace-all mode while skipping locked games in bulk runs", async () => {
    const deps = makeDeps({
      autoApply: false,
      preserveExisting: true,
      slots: { cover: true, wide: true, hero: false, logo: false, icon: false },
    });
    const ctrl = new ArtworkController(deps);

    await ctrl.runBulk(
      [
        { appid: 1001, name: "Hades II" },
        { appid: 1002, name: "Celeste" },
      ],
      "replace-all",
    );

    // 1002 is locked and skipped; 1001 has cover (replaced) and wide (filled).
    expect(deps.getGameArtworkState).toHaveBeenCalledTimes(1);
    expect(deps.getGameArtworkState).toHaveBeenCalledWith(1001, 1145350);
    expect(deps.applySteamArtworkSlot).toHaveBeenCalledTimes(2);
    expect(deps.toastSuccess).toHaveBeenCalled();
  });

  it("still skips locked games when the lock list fails to load", async () => {
    const deps = makeDeps();
    vi.mocked(deps.getAllArtworkLocks).mockRejectedValue(new Error("rpc down"));
    vi.mocked(deps.getGameArtworkState).mockResolvedValue(makeGameState(1002, 504230, { locked: true }));
    const ctrl = new ArtworkController(deps);

    await ctrl.runBulk([{ appid: 1002, name: "Celeste" }], "replace-all");
    expect(deps.applySteamArtworkSlot).not.toHaveBeenCalled();
  });

  it("ignores a second bulk run that starts while the first is loading", async () => {
    const deps = makeDeps({ autoApply: true, preserveExisting: false, slots: { cover: true, wide: false, hero: false, logo: false, icon: false } });
    let releaseLocks!: (locks: Record<string, boolean>) => void;
    vi.mocked(deps.getAllArtworkLocks).mockReturnValue(new Promise((resolve) => (releaseLocks = resolve)));
    const ctrl = new ArtworkController(deps);
    const games = [{ appid: 1001, name: "Hades II" }];

    const first = ctrl.runBulk(games, "auto");
    const second = ctrl.runBulk(games, "replace-all");
    await Promise.resolve();
    releaseLocks({});
    await Promise.all([first, second]);
    expect(deps.applySteamArtworkSlot).toHaveBeenCalledTimes(1);
  });

  it("does not run auto-apply when autoApply setting is off", async () => {
    const deps = makeDeps(DEFAULT_ARTWORK_SETTINGS);
    const ctrl = new ArtworkController(deps);

    await ctrl.autoApplyForMatchedGame(1001, 1145350, "Hades II");
    await ctrl.runBulk([{ appid: 1001, name: "Hades II" }], "auto");
    expect(deps.applySteamArtworkSlot).not.toHaveBeenCalled();
  });

  it("allows manual single-slot apply and clear regardless of global slot toggles", async () => {
    const deps = makeDeps({
      autoApply: false,
      preserveExisting: true,
      slots: { cover: false, wide: false, hero: false, logo: false, icon: false },
    });
    const ctrl = new ArtworkController(deps);

    await ctrl.applySingleSlot(1001, 1145350, "cover");
    expect(deps.applySteamArtworkSlot).toHaveBeenCalledWith(1001, "cover", expect.any(Object));

    await ctrl.clearSingleSlot(1001, "cover");
    expect(deps.clearSteamArtworkSlot).toHaveBeenCalledWith(1001, "cover");
    expect(deps.clearLocalArtworkFile).toHaveBeenCalledWith(1001, "cover");
  });

  it("applies SteamGridDB, local file, and transparent assets and persists per-slot filters globally", async () => {
    const deps = makeDeps();
    const ctrl = new ArtworkController(deps);

    await ctrl.applySgdbAsset(1091500, "hero", "https://cdn2.steamgriddb.com/hero/1.png");
    expect(deps.sgdbFetchAsset).toHaveBeenCalledWith(1091500, "hero", "https://cdn2.steamgriddb.com/hero/1.png");
    expect(deps.applySteamArtworkSlot).toHaveBeenCalledWith(1091500, "hero", expect.objectContaining({ base64: "SGDB==" }));

    await ctrl.applyLocalFile(1091500, "cover", "/home/deck/Downloads/poster.png");
    expect(deps.readLocalArtworkFile).toHaveBeenCalledWith(1091500, "cover", "/home/deck/Downloads/poster.png");

    await ctrl.applyTransparentSlot(1091500, "logo");
    expect(deps.getTransparentArtworkAsset).toHaveBeenCalledWith(1091500, "logo");

    const ok = await ctrl.updateSlotFilter("cover", {
      ...DEFAULT_ARTWORK_SETTINGS.filters.cover,
      nsfw: true,
    });
    expect(ok).toBe(true);
    expect(ctrl.getSnapshot().settings.filters.cover.nsfw).toBe(true);
  });

  it("saves overlapping settings changes in order so the newest change wins", async () => {
    const deps = makeDeps();
    const ctrl = new ArtworkController(deps);
    await ctrl.ensureSettingsLoaded();
    const first = Promise.withResolvers<ArtworkSettings>();
    vi.mocked(deps.setArtworkSettings)
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async (next) => next);

    const typed = ctrl.setSettings({ ...ctrl.getSnapshot().settings, sgdbApiKey: "typed" });
    const cleared = ctrl.setSettings({ ...ctrl.getSnapshot().settings, sgdbApiKey: "" });
    expect(deps.setArtworkSettings).toHaveBeenCalledTimes(1); // the second save waits for the first
    first.resolve({ ...DEFAULT_ARTWORK_SETTINGS, sgdbApiKey: "typed" });

    await expect(Promise.all([typed, cleared])).resolves.toEqual([true, true]);
    const saves = vi.mocked(deps.setArtworkSettings).mock.calls;
    expect(saves[saves.length - 1][0].sgdbApiKey).toBe("");
    expect(ctrl.getSnapshot().settings.sgdbApiKey).toBe("");
  });

  it("still saves a newer change when the save before it fails, and rolls back only the last failure", async () => {
    const deps = makeDeps();
    const ctrl = new ArtworkController(deps);
    await ctrl.ensureSettingsLoaded();
    const first = Promise.withResolvers<ArtworkSettings>();
    vi.mocked(deps.setArtworkSettings)
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async (next) => next);

    const typed = ctrl.setSettings({ ...ctrl.getSnapshot().settings, sgdbApiKey: "typed" });
    const cleared = ctrl.setSettings({ ...ctrl.getSnapshot().settings, sgdbApiKey: "" });
    first.reject(new Error("disk full"));

    await expect(Promise.all([typed, cleared])).resolves.toEqual([false, true]);
    expect(deps.setArtworkSettings).toHaveBeenCalledTimes(2);
    expect(ctrl.getSnapshot().settings.sgdbApiKey).toBe("");
    expect(ctrl.getSnapshot().settingsError).toBe("");

    // With nothing newer queued, a failure restores the last confirmed settings.
    vi.mocked(deps.setArtworkSettings).mockRejectedValueOnce(new Error("disk full"));
    await expect(ctrl.setSettings({ ...ctrl.getSnapshot().settings, sgdbApiKey: "lost" })).resolves.toBe(false);
    expect(ctrl.getSnapshot().settings.sgdbApiKey).toBe("");
    expect(ctrl.getSnapshot().settingsError).not.toBe("");
  });
  it("does not save settings when the initial settings load fails", async () => {
    const deps = makeDeps();
    vi.mocked(deps.getArtworkSettings).mockRejectedValue(new Error("rpc down"));
    const ctrl = new ArtworkController(deps);

    await expect(ctrl.updateSlotFilter("cover", DEFAULT_ARTWORK_SETTINGS.filters.cover)).resolves.toBe(false);
    await expect(ctrl.setSettings(DEFAULT_ARTWORK_SETTINGS)).resolves.toBe(false);
    expect(deps.setArtworkSettings).not.toHaveBeenCalled();
    expect(ctrl.getSnapshot().settingsError).not.toBe("");
  });

  it("does not let a late automatic write replace a manual clear", async () => {
    const deps = makeDeps({
      autoApply: true,
      preserveExisting: false,
      slots: { cover: true, wide: false, hero: false, logo: false, icon: false },
    });
    const requested = Promise.withResolvers<void>();
    const autoAsset = Promise.withResolvers<FetchedArtworkAsset>();
    vi.mocked(deps.fetchSteamArtworkAsset).mockImplementationOnce(async () => {
      requested.resolve();
      return autoAsset.promise;
    });
    const ctrl = new ArtworkController(deps);
    const automatic = ctrl.autoApplyForMatchedGame(1001, 1145350, "Hades II");

    await requested.promise;
    await ctrl.clearSingleSlot(1001, "cover");
    autoAsset.resolve({ slot: "cover", base64: "AUTO==", ext: "jpg", mime: "image/jpeg", file_path: null });
    await automatic;

    expect(deps.clearSteamArtworkSlot).toHaveBeenCalledWith(1001, "cover");
    expect(deps.applySteamArtworkSlot).not.toHaveBeenCalled();
  });
  it("writes an automatic shortcut icon only after its generation remains current", async () => {
    const appId = 0x80000001;
    const deps = makeDeps({
      autoApply: true,
      preserveExisting: false,
      slots: { cover: false, wide: false, hero: false, logo: false, icon: true },
    });
    const ctrl = new ArtworkController(deps);

    await ctrl.autoApplyForMatchedGame(appId, 1145350, "Hades II");

    expect(deps.saveLocalArtworkIcon).toHaveBeenCalledWith(appId, "jpg", "AA==");
    expect(deps.applySteamArtworkSlot).toHaveBeenCalledWith(
      appId,
      "icon",
      expect.objectContaining({ file_path: "/tmp/icon.jpg" }),
    );
  });

  it("applies a manual clear after an automatic shortcut icon save already in flight", async () => {
    const appId = 0x80000001;
    const deps = makeDeps({
      autoApply: true,
      preserveExisting: false,
      slots: { cover: false, wide: false, hero: false, logo: false, icon: true },
    });
    const saveStarted = Promise.withResolvers<void>();
    const saveResult = Promise.withResolvers<string | null>();
    let localIcon: string | null = null;
    vi.mocked(deps.saveLocalArtworkIcon).mockImplementationOnce(async () => {
      saveStarted.resolve();
      const filePath = await saveResult.promise;
      localIcon = "automatic";
      return filePath;
    });
    vi.mocked(deps.applySteamArtworkSlot).mockImplementation(async (_appId, _slot, asset) => {
      localIcon = asset.file_path ? "automatic" : null;
    });
    vi.mocked(deps.clearLocalArtworkFile).mockImplementation(async () => {
      localIcon = null;
      return { ok: true, removed: true };
    });
    const ctrl = new ArtworkController(deps);
    const automatic = ctrl.autoApplyForMatchedGame(appId, 1145350, "Hades II");

    await saveStarted.promise;
    const manual = ctrl.clearSingleSlot(appId, "icon");
    expect(deps.clearLocalArtworkFile).not.toHaveBeenCalled();
    saveResult.resolve("/tmp/icon.jpg");
    await Promise.all([automatic, manual]);

    expect(localIcon).toBeNull();
    expect(deps.clearLocalArtworkFile).toHaveBeenCalledWith(appId, "icon");
  });

  it("queues a manual SteamGridDB icon behind an automatic shortcut icon save", async () => {
    const appId = 0x80000001;
    const deps = makeDeps({
      autoApply: true,
      preserveExisting: false,
      slots: { cover: false, wide: false, hero: false, logo: false, icon: true },
    });
    const autoSaveStarted = Promise.withResolvers<void>();
    const finishAutoSave = Promise.withResolvers<string | null>();
    let finalIcon: string | null = null;
    const commits: string[] = [];
    vi.mocked(deps.saveLocalArtworkIcon).mockImplementation(async (_id, _ext, base64) => {
      if (base64 === "AA==") {
        autoSaveStarted.resolve();
        const filePath = await finishAutoSave.promise;
        commits.push("save-automatic");
        finalIcon = "automatic";
        return filePath;
      }
      commits.push("save-manual");
      return "/tmp/manual.png";
    });
    vi.mocked(deps.applySteamArtworkSlot).mockImplementation(async (_id, _slot, asset) => {
      const icon = asset.base64 === "SGDB==" ? "manual" : "automatic";
      commits.push(`apply-${icon}`);
      finalIcon = icon;
    });
    vi.mocked(deps.sgdbFetchAsset).mockImplementationOnce(async (_id, slot) => ({
      slot,
      base64: "SGDB==",
      ext: "png",
      mime: "image/png",
      file_path: null,
    }));
    const ctrl = new ArtworkController(deps);
    const automatic = ctrl.autoApplyForMatchedGame(appId, 1145350, "Hades II");

    await autoSaveStarted.promise;
    const manual = ctrl.applySgdbAsset(appId, "icon", "https://cdn2.steamgriddb.com/icon/1.png");
    await Promise.resolve();
    expect(deps.saveLocalArtworkIcon).toHaveBeenCalledTimes(1);
    finishAutoSave.resolve("/tmp/automatic.jpg");
    await Promise.all([automatic, manual]);

    expect(commits).toEqual([
      "save-automatic",
      "apply-automatic",
      "save-manual",
      "apply-manual",
    ]);
    expect(finalIcon).toBe("manual");
    expect(deps.saveLocalArtworkIcon).toHaveBeenNthCalledWith(2, appId, "png", "SGDB==");
  });

  it("does not persist or apply an automatic shortcut icon after a manual clear during fetch", async () => {
    const appId = 0x80000001;
    const deps = makeDeps({
      autoApply: true,
      preserveExisting: false,
      slots: { cover: false, wide: false, hero: false, logo: false, icon: true },
    });
    const requested = Promise.withResolvers<void>();
    const autoAsset = Promise.withResolvers<FetchedArtworkAsset>();
    vi.mocked(deps.fetchSteamArtworkAsset).mockImplementationOnce(async () => {
      requested.resolve();
      return autoAsset.promise;
    });
    const ctrl = new ArtworkController(deps);
    const automatic = ctrl.autoApplyForMatchedGame(appId, 1145350, "Hades II");

    await requested.promise;
    await ctrl.clearSingleSlot(appId, "icon");
    autoAsset.resolve({ slot: "icon", base64: "AUTO==", ext: "jpg", mime: "image/jpeg", file_path: null });
    await automatic;

    expect(deps.clearLocalArtworkFile).toHaveBeenCalledWith(appId, "icon");
    expect(deps.saveLocalArtworkIcon).not.toHaveBeenCalled();
    expect(deps.applySteamArtworkSlot).not.toHaveBeenCalled();
  });

  it("does not start an automatic fetch after the slot changes while artwork state loads", async () => {
    const appId = 0x80000001;
    const deps = makeDeps({
      autoApply: true,
      preserveExisting: false,
      slots: { cover: false, wide: false, hero: false, logo: false, icon: true },
    });
    const requested = Promise.withResolvers<void>();
    const artworkState = Promise.withResolvers<GameArtworkState>();
    vi.mocked(deps.getGameArtworkState).mockImplementationOnce(async () => {
      requested.resolve();
      return artworkState.promise;
    });
    const ctrl = new ArtworkController(deps);
    const automatic = ctrl.autoApplyForMatchedGame(appId, 1145350, "Hades II");

    await requested.promise;
    await ctrl.clearSingleSlot(appId, "icon");
    artworkState.resolve(makeGameState(appId, 1145350));
    await automatic;

    expect(deps.fetchSteamArtworkAsset).not.toHaveBeenCalled();
    expect(deps.saveLocalArtworkIcon).not.toHaveBeenCalled();
    expect(deps.applySteamArtworkSlot).not.toHaveBeenCalled();
  });
  it("does not let a late automatic write replace a manual single-slot apply", async () => {
    const deps = makeDeps({
      autoApply: true,
      preserveExisting: false,
      slots: { cover: true, wide: false, hero: false, logo: false, icon: false },
    });
    const requested = Promise.withResolvers<void>();
    const autoAsset = Promise.withResolvers<FetchedArtworkAsset>();
    vi.mocked(deps.fetchSteamArtworkAsset).mockImplementationOnce(async () => {
      requested.resolve();
      return autoAsset.promise;
    });
    const ctrl = new ArtworkController(deps);
    const automatic = ctrl.autoApplyForMatchedGame(1001, 1145350, "Hades II");

    await requested.promise;
    await ctrl.applySingleSlot(1001, 1145350, "cover");
    autoAsset.resolve({ slot: "cover", base64: "AUTO==", ext: "jpg", mime: "image/jpeg", file_path: null });
    await automatic;

    expect(deps.applySteamArtworkSlot).toHaveBeenCalledTimes(1);
    expect(deps.applySteamArtworkSlot).toHaveBeenCalledWith(
      1001,
      "cover",
      expect.objectContaining({ base64: "AA==" }),
    );
  });

  it("propagates local artwork clear failures", async () => {
    const deps = makeDeps();
    const failure = new Error("file could not be removed");
    vi.mocked(deps.clearLocalArtworkFile).mockRejectedValueOnce(failure);
    const ctrl = new ArtworkController(deps);

    await expect(ctrl.clearSingleSlot(1001, "cover")).rejects.toBe(failure);
  });
});

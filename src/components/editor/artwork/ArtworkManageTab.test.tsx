import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@decky/api", () => ({ callable: () => vi.fn(), openFilePicker: vi.fn() }));
vi.mock("@decky/ui", () => ({
  ButtonItem: "ButtonItem",
  ConfirmModal: "ConfirmModal",
  DialogButton: "DialogButton",
  DialogControlsSection: "DialogControlsSection",
  DialogControlsSectionHeader: "DialogControlsSectionHeader",
  Field: "Field",
  Focusable: "Focusable",
  showModal: vi.fn(),
  ToggleField: "ToggleField",
}));
vi.mock("../../../artwork/controller", () => ({ artworkController: {} }));
vi.mock("../../../i18n", () => ({ useT: () => (key: string) => key, translateBackendError: String }));
vi.mock("../../../steam/customArtwork", () => ({
  ARTWORK_SLOT_ORDER: ["cover", "wide", "hero", "logo", "icon"],
  clearCustomLogoPosition: vi.fn(),
  hasLogoPositionApi: () => false,
}));
vi.mock("../../../toast", () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("./LogoPositionerModal", () => ({ LogoPositionerModal: "LogoPositionerModal" }));

import type { GameArtworkState } from "../../../types";
import { ArtworkManageTab } from "./ArtworkManageTab";

type Node = { type?: unknown; props?: Record<string, any> };
const nodes = (node: unknown): Node[] => {
  if (node == null || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  const el = node as Node;
  return [el, ...nodes(el.props?.children)];
};

const OFFICIAL = "https://shared.steamstatic.com/hero.jpg";
const empty = { present: false, preview_data_url: null, steam_url: null, available: false };

const heroPreview = (isSteamGame: boolean, hero: GameArtworkState["slots"]["hero"]) => {
  const state = {
    locked: false,
    slots: { cover: empty, wide: empty, hero, logo: empty, icon: empty },
  } as unknown as GameArtworkState;
  const root = ArtworkManageTab({
    appId: 7,
    gameName: "Game",
    isSteamGame,
    savedSteamAppId: isSteamGame ? 7 : null,
    unsavedSteamAppId: isSteamGame ? 7 : null,
    state,
    busy: false,
    onBusyChange: vi.fn(),
    onRefreshState: vi.fn(),
    onSelectSlotTab: vi.fn(),
    onGoToSteamMatch: vi.fn(),
    onSaveMatch: vi.fn(),
  }) as ReactElement;
  return nodes(root).filter((n) => n.type === "img").map((n) => n.props!.src);
};

describe("ArtworkManageTab current artwork", () => {
  it("shows Steam's official art for a Steam game slot with no custom file", () => {
    expect(heroPreview(true, { present: false, preview_data_url: null, steam_url: OFFICIAL, available: true })).toEqual([OFFICIAL]);
  });

  it("does not show official art over a custom file that has no preview", () => {
    // The backend omits previews for files over 4 MiB or in unknown formats.
    expect(heroPreview(true, { present: true, preview_data_url: null, steam_url: OFFICIAL, available: true })).toEqual([]);
  });

  it("does not show official art for a non-Steam game", () => {
    expect(heroPreview(false, { present: false, preview_data_url: null, steam_url: OFFICIAL, available: true })).toEqual([]);
  });
});

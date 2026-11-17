import { describe, expect, it } from "vitest";
import { changedDraftFields, changedFormFields, DraftFieldKey, DraftFormState } from "./metadataDraft";
import { MetadataData, StoreCategory } from "./types";

const savedMetadata = (overrides: Partial<MetadataData> = {}): MetadataData => ({
  title: "Game",
  id: 42,
  source: "Manual",
  source_url: "",
  description: "Long description",
  short_description: "",
  developers: [{ name: "Dev A", url: "" }],
  publishers: [{ name: "Pub A", url: "" }],
  release_date: "2024-03-10",
  rating: 80,
  store_categories: [StoreCategory.SinglePlayer, StoreCategory.MultiPlayer],
  genres: ["Action"],
  screenshots: [],
  steam_appid: 123,
  hltb_game_id: 55,
  steam_dlc_appids: [],
  has_points_shop: false,
  updated_at: 1,
  ...overrides,
});

const formFrom = (
  saved: MetadataData,
  overrides: Partial<DraftFormState> = {},
): DraftFormState => ({
  metadata: { ...saved },
  developerText: "Dev A",
  publisherText: "Pub A",
  releaseText: "2024-03-10",
  ratingText: "80",
  steamAppIdText: "123",
  hltbIdDraft: null,
  ...overrides,
});

describe("changedDraftFields", () => {
  it("reports nothing for an unchanged form and for an unloaded baseline", () => {
    const saved = savedMetadata();
    expect(changedDraftFields(saved, formFrom(saved))).toEqual([]);
    expect(changedDraftFields(null, formFrom(saved))).toEqual([]);
  });

  it("reports each visible field alone", () => {
    const saved = savedMetadata();
    const cases: Array<[DraftFieldKey, Partial<DraftFormState>]> = [
      ["title", { metadata: { ...saved, title: "Other" } }],
      ["description", { metadata: { ...saved, description: "New long" } }],
      ["developers", { developerText: "Dev B" }],
      ["publishers", { publisherText: "Pub B" }],
      ["releaseDate", { releaseText: "2024-03-11" }],
      ["rating", { ratingText: "81" }],
      ["categories", { metadata: { ...saved, store_categories: [StoreCategory.SinglePlayer] } }],
      ["compatibility", { metadata: { ...saved, deck_compat_override: 3 } }],
      ["steamAppId", { steamAppIdText: "456" }],
      ["hltb", { hltbIdDraft: "56" }],
    ];
    for (const [key, overrides] of cases) {
      expect(changedDraftFields(saved, formFrom(saved, overrides)), key).toEqual([key]);
    }
  });

  it("reports nothing after a change is reverted", () => {
    const saved = savedMetadata();
    const changed = formFrom(saved, {
      metadata: { ...saved, title: "Other", store_categories: [StoreCategory.MultiPlayer] },
      developerText: "Dev B",
    });
    expect(changedDraftFields(saved, changed)).toEqual([
      "title",
      "developers",
      "categories",
    ]);
    changed.metadata = { ...saved };
    changed.developerText = "Dev A";
    expect(changedDraftFields(saved, changed)).toEqual([]);
  });

  it("keeps result keys in DRAFT_FIELD_ORDER order", () => {
    const saved = savedMetadata();
    const changed = formFrom(saved, {
      metadata: { ...saved, store_categories: [StoreCategory.MultiPlayer], title: "Other" },
      ratingText: "1",
    });
    expect(changedDraftFields(saved, changed)).toEqual([
      "title",
      "rating",
      "categories",
    ]);
  });

  it("compares the displayed description, preferring short_description", () => {
    const saved = savedMetadata({ short_description: "Short", description: "Long" });
    // The full description is hidden behind the summary, but Save would still store it.
    expect(
      changedDraftFields(saved, formFrom(saved, {
        metadata: { ...saved, description: "Different long" },
      })),
    ).toEqual(["steamData"]);
    expect(
      changedDraftFields(saved, formFrom(saved, {
        metadata: { ...saved, short_description: "New short" },
      })),
    ).toEqual(["description"]);
  });

  it("treats category order as unchanged", () => {
    const saved = savedMetadata({
      store_categories: [StoreCategory.SinglePlayer, StoreCategory.MultiPlayer],
    });
    const form = formFrom(saved, {
      metadata: { ...saved, store_categories: [StoreCategory.MultiPlayer, StoreCategory.SinglePlayer] },
    });
    expect(changedDraftFields(saved, form)).toEqual([]);
  });

  it("counts both an unapplied app id text edit and an applied id change", () => {
    const saved = savedMetadata();
    expect(changedDraftFields(saved, formFrom(saved, { steamAppIdText: "456" }))).toEqual([
      "steamAppId",
    ]);
    expect(
      changedDraftFields(saved, formFrom(saved, {
        metadata: { ...saved, steam_appid: 456 },
      })),
    ).toEqual(["steamAppId"]);
    expect(
      changedDraftFields(saved, formFrom(saved, {
        metadata: { ...saved, steam_appid: null },
        steamAppIdText: "",
      })),
    ).toEqual(["steamAppId"]);
  });

  it("treats a store URL for the saved app as unchanged and unparsable text as changed", () => {
    const saved = savedMetadata();
    expect(
      changedDraftFields(saved, formFrom(saved, {
        steamAppIdText: "https://store.steampowered.com/app/123/Game/",
      })),
    ).toEqual([]);
    expect(changedDraftFields(saved, formFrom(saved, { steamAppIdText: "12a" }))).toEqual([
      "steamAppId",
    ]);
  });

  it("counts an HLTB draft only when it differs from the saved id", () => {
    const saved = savedMetadata();
    expect(changedDraftFields(saved, formFrom(saved, { hltbIdDraft: "55" }))).toEqual([]);
    expect(changedDraftFields(saved, formFrom(saved, { hltbIdDraft: "56" }))).toEqual([
      "hltb",
    ]);
    expect(
      changedDraftFields(saved, formFrom(saved, {
        metadata: { ...saved, hltb_game_id: null },
      })),
    ).toEqual(["hltb"]);
  });

  it("treats non-visible metadata differences as steamData changes", () => {
    const news = { id: "n1", title: "News", url: "https://example.com/n1", summary: "A" };
    const saved = savedMetadata({ steam_news: [news] });
    expect(
      changedDraftFields(saved, formFrom(saved, {
        metadata: { ...saved, steam_news: [{ ...news, summary: "B" }] },
      })),
    ).toEqual(["steamData"]);
    expect(
      changedDraftFields(saved, formFrom(saved, {
        metadata: {
          ...saved,
          screenshots: [{ url: "https://example.com/shot.jpg" }],
        },
      })),
    ).toEqual(["steamData"]);
  });

  it("counts a person URL change hidden by the visible developer text", () => {
    const saved = savedMetadata();
    expect(
      changedDraftFields(saved, formFrom(saved, {
        metadata: { ...saved, developers: [{ name: "Dev A", url: "https://example.com/dev" }] },
      })),
    ).toEqual(["steamData"]);
    expect(
      changedDraftFields(saved, formFrom(saved, {
        developerText: "Dev B",
        metadata: { ...saved, developers: [{ name: "Dev B", url: "" }] },
      })),
    ).toEqual(["developers"]);
  });

  it("ignores object key order and null-versus-missing values", () => {
    const saved = savedMetadata({
      steam_store_name: "Game Store",
      deck_compat_category: null,
      steam_news: [{ id: "n1", title: "News", url: "https://example.com/n1" }],
    });
    const reordered = Object.fromEntries(
      Object.entries(saved).reverse(),
    ) as MetadataData;
    expect(changedDraftFields(saved, formFrom(saved, { metadata: reordered }))).toEqual([]);

    const missing = { ...saved };
    delete missing.deck_compat_category;
    expect(changedDraftFields(saved, formFrom(saved, { metadata: missing }))).toEqual([]);
    expect(
      changedDraftFields(saved, formFrom(saved, {
        metadata: { ...saved, deck_compat_category: undefined },
      })),
    ).toEqual([]);
  });
});

describe("changedFormFields", () => {
  it("reports only the fields that differ between two form states", () => {
    const saved = savedMetadata();
    const before = formFrom(saved, { metadata: { ...saved, title: "Typed by user" } });
    const after = formFrom(saved, {
      metadata: { ...saved, title: "Typed by user", description: "From Steam" },
      developerText: "Steam Dev",
    });
    expect(changedFormFields(before, after)).toEqual(["description", "developers"]);
    expect(changedFormFields(before, before)).toEqual([]);
  });
});

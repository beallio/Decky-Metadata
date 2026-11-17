import { MetadataData } from "./types";
import { parseSteamAppId, personsToText } from "./metadataForm";

export type DraftFieldKey =
  | "title"
  | "description"
  | "developers"
  | "publishers"
  | "releaseDate"
  | "rating"
  | "categories"
  | "compatibility"
  | "steamAppId"
  | "hltb"
  | "steamData";

export interface DraftFormState {
  metadata: MetadataData;
  developerText: string;
  publisherText: string;
  releaseText: string;
  ratingText: string;
  steamAppIdText: string;
  hltbIdDraft: string | null;
}

export const DRAFT_FIELD_ORDER: readonly DraftFieldKey[] = [
  "title",
  "description",
  "developers",
  "publishers",
  "releaseDate",
  "rating",
  "categories",
  "compatibility",
  "steamAppId",
  "hltb",
  "steamData",
];

// Keys the editor shows or derives; everything else is Steam-owned persisted data.
const HIDDEN_KEYS: Record<string, true> = {
  title: true,
  description: true,
  short_description: true,
  developers: true,
  publishers: true,
  release_date: true,
  rating: true,
  store_categories: true,
  deck_compat_override: true,
  steam_appid: true,
  hltb_game_id: true,
  updated_at: true,
};

const displayedDescription = (metadata: MetadataData): string =>
  metadata.short_description?.trim()
    ? metadata.short_description
    : metadata.description || "";

const positiveAppId = (value: unknown): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const equalCategories = (a?: number[], b?: number[]): boolean => {
  const left = new Set(a ?? []);
  const right = new Set(b ?? []);
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
};

// Missing keys and explicit null/undefined all mean "no value".
const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => deepEqual(item, b[index]))
    );
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  return Object.keys({ ...left, ...right }).every((key) =>
    deepEqual(left[key], right[key]),
  );
};

const steamDataChanged = (form: MetadataData, saved: MetadataData): boolean => {
  const left = form as unknown as Record<string, unknown>;
  const right = saved as unknown as Record<string, unknown>;
  return Object.keys({ ...left, ...right }).some(
    (key) => HIDDEN_KEYS[key] !== true && !deepEqual(left[key], right[key]),
  );
};

export function changedDraftFields(
  saved: MetadataData | null,
  form: DraftFormState,
): DraftFieldKey[] {
  if (saved === null) return [];

  const formAppId = positiveAppId(form.metadata.steam_appid);
  const savedAppId = positiveAppId(saved.steam_appid);
  // A URL and a bare number for the same app are the same match; unparsable text is a change.
  const textAppIdText = form.steamAppIdText.trim();
  const textAppId = textAppIdText ? parseSteamAppId(textAppIdText) || NaN : null;
  const savedHltbText = saved.hltb_game_id == null ? "" : String(saved.hltb_game_id);

  const changed: Record<DraftFieldKey, boolean> = {
    title: (form.metadata.title ?? "") !== (saved.title ?? ""),
    description:
      displayedDescription(form.metadata) !== displayedDescription(saved),
    developers: form.developerText !== personsToText(saved.developers),
    publishers: form.publisherText !== personsToText(saved.publishers),
    releaseDate: form.releaseText !== (saved.release_date ?? ""),
    rating: form.ratingText !== (saved.rating == null ? "" : String(saved.rating)),
    categories: !equalCategories(
      form.metadata.store_categories,
      saved.store_categories,
    ),
    compatibility: !deepEqual(form.metadata.deck_compat_override, saved.deck_compat_override),
    steamAppId: formAppId !== savedAppId || textAppId !== savedAppId,
    hltb:
      (form.hltbIdDraft !== null &&
        form.hltbIdDraft.trim() !== savedHltbText) ||
      (form.metadata.hltb_game_id ?? null) !== (saved.hltb_game_id ?? null),
    steamData: steamDataChanged(form.metadata, saved),
  };
  // The visible fields hide the full description and person URLs; a change there is still a change.
  changed.steamData ||=
    (!changed.description &&
      (!deepEqual(form.metadata.description, saved.description) ||
        !deepEqual(form.metadata.short_description, saved.short_description))) ||
    (!changed.developers && !deepEqual(form.metadata.developers, saved.developers)) ||
    (!changed.publishers && !deepEqual(form.metadata.publishers, saved.publishers));

  return DRAFT_FIELD_ORDER.filter((key) => changed[key]);
}

/** Visible fields that differ between two form states, e.g. right before and after a preview merge. */
export function changedFormFields(before: DraftFormState, after: DraftFormState): DraftFieldKey[] {
  const a = before.metadata;
  const b = after.metadata;
  const changed: Record<DraftFieldKey, boolean> = {
    title: (a.title ?? "") !== (b.title ?? ""),
    description: displayedDescription(a) !== displayedDescription(b),
    developers: before.developerText !== after.developerText,
    publishers: before.publisherText !== after.publisherText,
    releaseDate: before.releaseText !== after.releaseText,
    rating: before.ratingText !== after.ratingText,
    categories: !equalCategories(a.store_categories, b.store_categories),
    compatibility: !deepEqual(a.deck_compat_override, b.deck_compat_override),
    steamAppId:
      positiveAppId(a.steam_appid) !== positiveAppId(b.steam_appid) ||
      before.steamAppIdText.trim() !== after.steamAppIdText.trim(),
    hltb:
      before.hltbIdDraft !== after.hltbIdDraft ||
      (a.hltb_game_id ?? null) !== (b.hltb_game_id ?? null),
    steamData: false,
  };
  return DRAFT_FIELD_ORDER.filter((key) => changed[key]);
}

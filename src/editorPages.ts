import type { DraftFieldKey } from "./metadataDraft";

/** Sidebar pages of the metadata editor, in rail order. */
export type EditorPageId =
  | "details"
  | "steam-match"
  | "artwork"
  | "hltb"
  | "compatibility"
  | "shortcut-name"
  | "advanced";

export const EDITOR_PAGE_ORDER: readonly EditorPageId[] = [
  "details",
  "steam-match",
  "artwork",
  "hltb",
  "compatibility",
  "shortcut-name",
  "advanced",
];

// Exhaustive: a new draft field fails typecheck until it has a page.
export const PAGE_OF_FIELD: Record<DraftFieldKey, EditorPageId> = {
  title: "details",
  description: "details",
  developers: "details",
  publishers: "details",
  releaseDate: "details",
  rating: "details",
  steamAppId: "steam-match",
  steamData: "steam-match",
  hltb: "hltb",
  compatibility: "compatibility",
  categories: "details",
};

/** Pages that hold at least one changed draft field. */
export function dirtyPages(changed: readonly DraftFieldKey[]): Set<EditorPageId> {
  return new Set(changed.map((key) => PAGE_OF_FIELD[key]));
}

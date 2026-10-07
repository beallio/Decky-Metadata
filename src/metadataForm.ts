import { MetadataData, StoreCategory } from "./types";

export const parseSteamAppId = (input: string): number => {
  const s = String(input || "").trim();
  if (!s) return 0;
  const match =
    (/^\d+$/.test(s) ? [s, s] : null) ||
    s.match(/(?:store\.steampowered\.com|steamcommunity\.com|steamdb\.info)\/app\/(\d+)/i) ||
    s.match(/[?&]appid=(\d+)/i) ||
    s.match(/\bapp\/(\d+)\b/i);
  const parsed = Number(match?.[1] || 0);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : 0;
};

export const metadataTemplate = (title: string): MetadataData => ({
  title,
  id: title,
  source: "Manual",
  source_url: "",
  description: "",
  short_description: "",
  developers: [],
  publishers: [],
  release_date: null,
  rating: null,
  store_categories: [StoreCategory.SinglePlayer],
  steam_dlc_appids: [],
  has_points_shop: false,
  genres: [],
  features: [],
  screenshots: [],
});

export const personsToText = (people?: { name: string }[]) =>
  (people || []).map((person) => person.name).join(", ");

export const textToPersons = (value: string) =>
  value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name, url: "" }));


export const normalizeReleaseDate = (value: string): string | null => {
  const text = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return text;
};

export const parseRating = (value: string) => {
  if (!value.trim()) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number)));
};

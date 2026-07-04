export type Person = {
  name: string;
  url: string;
};

export type MetadataData = {
  title: string;
  id: string | number;
  source?: string;
  source_url?: string;
  description: string;
  short_description?: string;
  developers?: Person[];
  publishers?: Person[];
  release_date?: number | null;
  rating?: number | null;
  store_categories: number[];
  genres?: string[];
  features?: string[];
  screenshots?: MetadataScreenshot[];
  steam_appid?: number | null;
  deck_compat_category?: number | null;
  steam_store_url?: string;
  steam_news?: MetadataNews[];
  steam_news_enriched_at?: number;
  updated_at?: number;
};

export type MetadataScreenshot = {
  id?: string;
  url: string;
  caption?: string;
  width?: number;
  height?: number;
  author?: string;
  link?: string;
};

export type MetadataSearchResult = {
  id?: string;
  slug: string;
  url: string;
  title: string;
  description: string;
  rating?: number | null;
};

export type MetadataNews = {
  id: string;
  title: string;
  url: string;
  summary?: string;
  image?: string;
  author?: string;
  feedLabel?: string;
  event_type?: number;
  type?: number;
  gid?: string;
  news_id?: string;
  announcement_gid?: string;
  event_gid?: string;
  body?: string;
  raw_body?: string;
  date?: number;
};

export type GameOption = {
  appid: number;
  name: string;
  exe?: string;
  start_dir?: string;
  launch_options?: string;
  shortcut_path?: string;
  icon?: string;
  isNonSteam?: boolean;
};

export type PlatformCapabilities = {
  platform: string;
  os_name: string;
  is_linux: boolean;
  is_steamos: boolean;
  steam_root: string;
  steam_roots: string[];
  supports_metadata: boolean;
  supports_steam_activity: boolean;
};

export type ScanProgress = {
  running: boolean;
  status: string;
  total: number;
  completed: number;
  assigned: number;
  failed: number;
  current: string;
  message: string;
  error?: string;
};

export enum StoreCategory {
  MultiPlayer = 1,
  SinglePlayer = 2,
  CoOp = 9,
  MMO = 20,
  Achievements = 22,
  SplitScreen = 24,
  FullController = 28,
  OnlineMultiPlayer = 36,
  LocalMultiPlayer = 37,
  OnlineCoOp = 38,
  LocalCoOp = 392,
}

export const CATEGORY_LABELS: Record<number, string> = {
  [StoreCategory.SinglePlayer]: "Single-player",
  [StoreCategory.MultiPlayer]: "Multiplayer",
  [StoreCategory.CoOp]: "Co-op",
  [StoreCategory.OnlineMultiPlayer]: "Online multiplayer",
  [StoreCategory.OnlineCoOp]: "Online co-op",
  [StoreCategory.LocalMultiPlayer]: "Local multiplayer",
  [StoreCategory.LocalCoOp]: "Local co-op",
  [StoreCategory.SplitScreen]: "Split screen",
  [StoreCategory.FullController]: "Full controller support",
  [StoreCategory.MMO]: "MMO",
  [StoreCategory.Achievements]: "Achievements",
};

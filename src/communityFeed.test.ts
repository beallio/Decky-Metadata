import { describe, expect, it, vi } from "vitest";
import {
  fallbackPageToNativeHub,
  nativeHubHasContent,
  requestedCommunityPage,
  resolveCommunityFeed,
  resolveCommunityRequest,
  syntheticCommunityId,
} from "./communityFeed";
import { CommunityFallbackPage } from "./types";

const fallback = (source: CommunityFallbackPage["source"] = "metadata"): CommunityFallbackPage => ({
  source,
  page: 2,
  items: [{ id: "x", title: "Shot", description: "Desc", image_url: "https://cdn.example/x.jpg", link: "https://www.ign.com/games/example", width: 640, height: 340, author: source === "steam-scrape" ? "Alice" : "IGN" }],
});

describe("community fallback helpers", () => {
  it("derives and clamps pages from POST bodies, cursors, and URLs", () => {
    expect(requestedCommunityPage("/feed", [{ data: { screenshotspage: 3 } }])).toBe(3);
    expect(requestedCommunityPage("/feed", [{ cursor: "page_4" }])).toBe(4);
    expect(requestedCommunityPage("/feed?p=999")).toBe(100);
    expect(requestedCommunityPage("/feed", [])).toBe(1);
  });

  it("detects only non-empty native hubs", () => {
    expect(nativeHubHasContent({ hub: [{}] })).toBe(true);
    expect(nativeHubHasContent({ hub: [] })).toBe(false);
    expect(nativeHubHasContent({ error: "No Content" })).toBe(false);
  });

  it("maps the complete provider-backed native card shape", () => {
    const result = fallbackPageToNativeHub(3156562597, fallback());
    expect(result.cached).toBe(true);
    const card = result.hub[0];
    expect(card.published_file_id).toBe(syntheticCommunityId(3156562597, 2, 0));
    expect(card.publishedfileid).toBe(card.published_file_id);
    expect(card.type).toBe(5);
    expect(card).not.toHaveProperty("youtube_video_id");
    expect(card.external_url).toBe("https://www.ign.com/games/example");
    expect(card.strURL).toBe("https://www.ign.com/games/example");
    expect(card.creator.steamid).not.toBe("0");
    expect(card.avatar).toMatch(/^data:image\/png;base64,/);
    expect(card.avatar_url).toBe(card.avatar);
    expect(card.creator_avatar_url).toBe(card.avatar);
    expect(card.author_avatar_url).toBe(card.avatar);
    expect(card.owner_avatar_url).toBe(card.avatar);
    expect(card.creator.avatar).toBe(card.avatar);
    expect(card.creator.avatar_url).toBe(card.avatar);
    expect(card.creator.avatar_medium).toBe(card.avatar);
    expect(card.creator.avatar_full).toBe(card.avatar);
    expect(card.creator.avatarFullURL).toBe(card.avatar);
    expect(card.spoiler_tag).toBe(false);
    expect(card.time_created).toBeTypeOf("number");
    expect(fallbackPageToNativeHub(1, fallback("steam-scrape")).hub[0].creator.name).toBe("Steam Community · Alice");
    expect(fallbackPageToNativeHub(1, { source: "none", page: 1, items: [] })).toEqual({ cached: false, hub: [] });
  });

  it("generates stable page-specific synthetic ids", () => {
    const first = syntheticCommunityId(42, 1, 0);
    expect(first).toMatch(/^90909\d+$/);
    expect(first).toBe(syntheticCommunityId(42, 1, 0));
    expect(first).not.toBe(syntheticCommunityId(42, 2, 0));
  });
});

describe("community feed decisions", () => {
  it("bypasses fallback for real Steam requests", async () => {
    const native = { cached: false, hub: [{ id: "native" }] };
    const nativeRequest = vi.fn(async () => native);
    const fallbackRequest = vi.fn();
    expect(await resolveCommunityRequest({
      isNonSteam: false,
      appId: 1,
      page: 1,
      originalArgs: ["original"],
      nativeRequest,
      fallbackRequest,
    })).toBe(native);
    expect(nativeRequest).toHaveBeenCalledOnce();
    expect(fallbackRequest).not.toHaveBeenCalled();
  });

  it("short-circuits fallback for native content", async () => {
    const native = { cached: false, hub: [{ id: "native" }] };
    const fallbackRequest = vi.fn();
    expect(await resolveCommunityFeed({ appId: 1, page: 1, originalArgs: ["original"], rewrittenArgs: ["steam"], nativeRequest: async () => native, fallbackRequest })).toBe(native);
    expect(fallbackRequest).not.toHaveBeenCalled();
  });

  it("uses fallback after native empty or rejection", async () => {
    for (const reject of [false, true]) {
      const result = await resolveCommunityFeed({ appId: 1, page: 2, originalArgs: ["original"], rewrittenArgs: ["steam"], nativeRequest: async () => reject ? Promise.reject(new Error("native")) : ({ cached: false, hub: [] }), fallbackRequest: async () => fallback() });
      expect((result as { hub: unknown[] }).hub).toHaveLength(1);
    }
  });

  it("preserves native empty and retries the shortcut after rewritten rejection", async () => {
    const empty = { cached: false, error: "No Content", hub: [] };
    expect(await resolveCommunityFeed({ appId: 1, page: 1, originalArgs: ["original"], nativeRequest: async () => empty, fallbackRequest: async () => ({ source: "none", page: 1, items: [] }) })).toBe(empty);
    const nativeRequest = vi.fn(async (args: unknown[]) => args[0] === "steam" ? Promise.reject(new Error("mapped")) : empty);
    expect(await resolveCommunityFeed({ appId: 1, page: 1, originalArgs: ["original"], rewrittenArgs: ["steam"], nativeRequest, fallbackRequest: async () => ({ source: "none", page: 1, items: [] }) })).toBe(empty);
    expect(nativeRequest).toHaveBeenCalledTimes(2);
  });

  it("reports a recoverable fallback RPC failure", async () => {
    const empty = { cached: false, hub: [] };
    const onFallbackError = vi.fn();
    expect(await resolveCommunityFeed({
      appId: 1,
      page: 1,
      originalArgs: ["original"],
      nativeRequest: async () => empty,
      fallbackRequest: async () => Promise.reject(new Error("rpc")),
      onFallbackError,
    })).toBe(empty);
    expect(onFallbackError).toHaveBeenCalledOnce();
  });
});

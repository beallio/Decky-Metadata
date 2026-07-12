import { describe, expect, it, vi } from "vitest";
import {
  fallbackPageToNativeHub,
  communityDetailFetcherMethodNames,
  nativeHubHasContent,
  requestedCommunityPage,
  resolveCommunityFeed,
  resolveCommunityRequest,
  shieldSyntheticCommunityCall,
  syntheticCommunityId,
} from "./communityFeed";
import { CommunityFallbackPage } from "./types";

const fallback = (source: CommunityFallbackPage["source"] = "metadata"): CommunityFallbackPage => ({
  source,
  page: 2,
  items: [{ id: "x", title: "Shot", description: "Desc", image_url: "https://cdn.example/x.jpg", width: 640, height: 340, author: source === "steam-scrape" ? "Alice" : "IGN" }],
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

  it("maps exact native visual fields and source labels", () => {
    expect(fallbackPageToNativeHub(3156562597, fallback())).toEqual({
      cached: true,
      hub: [{
        published_file_id: syntheticCommunityId(3156562597, 2, 0), type: 5, title: "Shot",
        preview_image_url: "https://cdn.example/x.jpg", full_image_url: "https://cdn.example/x.jpg",
        image_width: 640, image_height: 340, comment_count: 0, votes_for: 0,
        content_descriptorids: [], spoiler_tag: null, description: "Desc", rating_stars: 0,
        maybe_inappropriate_sex: 0, maybe_inappropriate_violence: 0, youtube_video_id: null,
        creator: { name: "IGN", steamid: "0", avatar: "", online_state: 0 }, reactions: [],
      }],
    });
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

it("shields all-synthetic batches but passes mixed batches through", async () => {
  const original = vi.fn(async () => ["native"]);
  await expect(shieldSyntheticCommunityCall(original, [["90909001", "90909002"]], Promise.resolve([]))).resolves.toEqual([]);
  expect(original).not.toHaveBeenCalled();
  await expect(shieldSyntheticCommunityCall(original, [["90909001", "123"]], Promise.resolve([]))).resolves.toEqual(["native"]);
  expect(original).toHaveBeenCalledOnce();
});

it("selects only published-file query fetchers and tolerates hostile exports", () => {
  class Message {}
  class PublishedFileMessage extends Message {
    static Init() { return new PublishedFileMessage(); }
    published_file_ids: string[] = [];
    detail = "message-data";
  }
  const module: Record<string, unknown> = {
    Message: PublishedFileMessage,
    newsScreenshots: function publishedFileNewsScreenshots() {
      return { published_file_ids: [], detail: "news-event" };
    },
    detailsQuery: function publishedFileDetailsQuery() {
      const protobuf = { Init: () => ({ published_file_ids: [] }) };
      return { queryFn: () => protobuf.Init(), detail: "fetch" };
    },
    commentsQuery: function publishedFileCommentsQuery() {
      const protobuf = { Init: () => ({ publishedfileids: [] }) };
      return { queryFn: () => protobuf.Init(), comments: "fetch" };
    },
    reactionsQuery: function publishedFileReactionsQuery() {
      const protobuf = { Init: () => ({ published_file_ids: [] }) };
      return { queryFn: () => protobuf.Init(), reactions: "fetch" };
    },
  };
  Object.defineProperty(module, "hostile", {
    enumerable: true,
    get() { throw new Error("hostile getter"); },
  });
  const revoked = Proxy.revocable(function publishedFileCommentsQuery() {
    return { Init: () => undefined, queryFn: () => undefined, comments: [] };
  }, {});
  module.revoked = revoked.proxy;
  revoked.revoke();

  expect(communityDetailFetcherMethodNames(module)).toEqual([
    "detailsQuery",
    "commentsQuery",
    "reactionsQuery",
  ]);
});

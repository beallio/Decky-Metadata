import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getContentLocale: vi.fn(),
  setContentLocale: vi.fn(),
  language: { value: "french" },
}));

vi.mock("./backend", () => ({
  getContentLocale: api.getContentLocale,
  setContentLocale: api.setContentLocale,
}));
vi.mock("./steamLanguage", () => ({
  currentSteamLanguage: () => api.language.value,
}));
vi.mock("./log", () => ({ warn: vi.fn() }));

import { consumeContentLocaleChange, resetContentLocaleSync, syncContentLocale } from "./contentLocale";

beforeEach(() => {
  vi.clearAllMocks();
  resetContentLocaleSync();
  api.language.value = "french";
});

describe("content locale sync", () => {
  it("switches the backend language once and reports the change", async () => {
    api.getContentLocale.mockResolvedValue({ content_locale: "english" });
    api.setContentLocale.mockResolvedValue({ ok: true, content_locale: "french" });

    expect(await syncContentLocale()).toBe(true);
    expect(api.setContentLocale).toHaveBeenCalledWith("french");

    // The cached language skips the second round trip.
    expect(await syncContentLocale()).toBe(false);
    expect(api.getContentLocale).toHaveBeenCalledTimes(1);
    expect(api.setContentLocale).toHaveBeenCalledTimes(1);
  });

  it("keeps a change pending until a panel consumes it", async () => {
    api.getContentLocale.mockResolvedValue({ content_locale: "english" });
    api.setContentLocale.mockResolvedValue({ ok: true, content_locale: "french" });

    expect(consumeContentLocaleChange()).toBe(false);
    await syncContentLocale();
    expect(consumeContentLocaleChange()).toBe(true);
    expect(consumeContentLocaleChange()).toBe(false);
  });

  it("does not queue a refresh when the language did not change", async () => {
    api.getContentLocale.mockResolvedValue({ content_locale: "french" });
    api.setContentLocale.mockResolvedValue({ ok: true, content_locale: "french" });

    await syncContentLocale();
    expect(consumeContentLocaleChange()).toBe(false);
  });

  it("reports no change when the backend already uses the language", async () => {
    api.getContentLocale.mockResolvedValue({ content_locale: "french" });
    api.setContentLocale.mockResolvedValue({ ok: true, content_locale: "french" });

    expect(await syncContentLocale()).toBe(false);
  });

  it("syncs again after the Steam language changes", async () => {
    api.getContentLocale.mockResolvedValue({ content_locale: "english" });
    api.setContentLocale.mockResolvedValue({ ok: true, content_locale: "french" });
    expect(await syncContentLocale()).toBe(true);

    api.language.value = "german";
    api.getContentLocale.mockResolvedValue({ content_locale: "french" });
    api.setContentLocale.mockResolvedValue({ ok: true, content_locale: "german" });
    expect(await syncContentLocale()).toBe(true);
    expect(api.setContentLocale).toHaveBeenLastCalledWith("german");
  });

  it("keeps the previous sync when the backend call fails", async () => {
    api.getContentLocale.mockRejectedValue(new Error("backend unavailable"));

    expect(await syncContentLocale()).toBe(false);
    expect(api.setContentLocale).not.toHaveBeenCalled();
  });
});

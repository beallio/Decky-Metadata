import { describe, expect, it } from "vitest";
import { parseHltbGameId } from "./gameId";

describe("parseHltbGameId", () => {
  it.each(["7231", "https://howlongtobeat.com/game/7231", "www.howlongtobeat.com/game/7231", "howlongtobeat.com/game/7231/more?x=1#stats"])("accepts %s", input => {
    expect(parseHltbGameId(input)).toBe(7231);
  });
  it.each(["", "0", "-1", "abc", "https://example.com/game/7231", "https://howlongtobeat.com.evil.com/game/7231", "https://howlongtobeat.com/game/0", "https://howlongtobeat.com/game/12abc", "http://howlongtobeat.com/game/1", "9007199254740992"])("rejects %s", input => {
    expect(parseHltbGameId(input)).toBe(0);
  });
});

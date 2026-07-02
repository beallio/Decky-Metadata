from __future__ import annotations

import subprocess
import textwrap


def test_community_feed_passthrough_rewrites_shortcut_appid_to_matched_steam_appid() -> None:
    script = textwrap.dedent(
        """
        import assert from "node:assert/strict";
        import { rewriteCommunityFeedUrlForSteamApp } from "./src/communityFeed.ts";

        assert.equal(
          rewriteCommunityFeedUrlForSteamApp(
            "https://steamloopback.host/library/appcommunityfeed/4294967295?cursor=abc",
            55150,
          ),
          "https://steamloopback.host/library/appcommunityfeed/55150?cursor=abc",
        );

        assert.equal(
          rewriteCommunityFeedUrlForSteamApp("/library/appcommunityfeed/4294967295", 55150),
          "/library/appcommunityfeed/55150",
        );

        assert.equal(
          rewriteCommunityFeedUrlForSteamApp("/library/appactivityfeed/4294967295", 55150),
          null,
        );

        assert.equal(
          rewriteCommunityFeedUrlForSteamApp("/library/appcommunityfeed/4294967295", 0),
          null,
        );
        """
    )

    subprocess.run(["node", "--input-type=module", "-e", script], check=True)

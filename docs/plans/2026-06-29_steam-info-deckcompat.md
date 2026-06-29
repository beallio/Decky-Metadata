# Plan: Steam info box and Deck compatibility (steam-info-deckcompat)

## Context

For a non-Steam shortcut that the plugin matches to a real Steam app (e.g. *Warhammer
40,000: Space Marine*), the game's **info box does not show the correct Steam data** and the
**Steam Deck compatibility badge never updates**. The user wants the matched app's real
Steam info reflected: developer, publisher, release date, genres, and the Deck compatibility
rating.

What already works (verified): the backend builds `developers`, `publishers`,
`release_date`, `genres`, `store_categories`, `steam_appid` into the metadata dict
(`_sanitize_metadata`, main.py:1561; `_metadata_with_steam_news_sync`, main.py:1601 resolves
`steam_appid`). The frontend patch (`src/steam.ts` ~line 280-358) injects description,
developer/publisher `associationData`, and screenshots into
`appDetailsStore.GetAppData(appId)`. **Gaps:**

1. **No Deck compatibility** anywhere — `steam_deck_compat_category` is never set (zero refs
   in our code). The Steam client reads the badge from the app overview field
   `steam_deck_compat_category` (confirmed: 28 refs in the Deck's own steamui bundle; values
   `0`=unknown, `1`=unsupported, `2`=playable, `3`=verified).
2. **No backend fetch** for Deck compatibility. Confirmed working public endpoint (tested
   from the Deck):
   `https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=<steam_appid>&l=english`
   returns `{"success":1,"results":{"resolved_category":<0..3>, ...}}`. `resolved_category`
   maps directly onto `steam_deck_compat_category`.
3. **Release date and genres are built but not injected** into the live client info box —
   the frontend patch only writes description/associations/screenshots.

**Intended outcome:** when the plugin has matched a shortcut to a `steam_appid`, the game's
info box shows the matched app's developer/publisher/release-date/genres and the correct
Steam Deck compatibility badge.

**Out of scope (separate plan `steam-community-store-links`):** wiring the Community Hub /
Discussions / Guides / Store buttons to the real Steam pages.

Relevant files / seams:

- `main.py`
  - `_metadata_with_steam_news_sync` (main.py:1601) — Steam-enrichment seam; `steam_appid`
    is resolved here (line 1609-1616). Add the Deck-compat fetch here, after `steam_appid`
    is known, writing `next_metadata["deck_compat_category"]`.
  - `_sanitize_metadata` (main.py:1515, returns dict at 1561) — must carry
    `deck_compat_category` through (clamp to 0..3, default `None`/omit when unknown).
  - HTTP helper `_http_json` (main.py:5017) and the existing Steam fetchers
    (`_steam_partner_events_for_appid`, main.py:1865) show the established request pattern —
    reuse it so TLS verification, header/redaction, timeouts and any cooldown behavior are
    identical. Do **not** introduce a new HTTP path that bypasses `_build_https_context` /
    `_redact`.
- `src/types.ts` — `MetadataData` (the `community_*`/`steam_*` fields live here); add
  `deck_compat_category?: number`.
- `src/steam.ts` — the overview/appdetails patch (~line 280-358, the function that reads
  `metadataCache[String(appId)]`, sets `overview.metacritic_score`, builds
  `appData.associationData`, etc.). Set `overview.steam_deck_compat_category` and inject
  release date + genres here.

**Slug used throughout this plan:** `steam-info-deckcompat`

---

## Orchestration Contract

**Slug:** `steam-info-deckcompat`

**Plan file:**

```text
docs/plans/2026-06-29_steam-info-deckcompat.md
```

**Implementation branch:**

```text
feat/steam-info-deckcompat
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/steam-info-deckcompat_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/steam-info-deckcompat_finalized
```

**Review notes:**

```text
docs/review/steam-info-deckcompat-review-*.md
```

Each review note ends with exactly one status trailer:

```text
STATUS: CHANGES_REQUESTED
```

or:

```text
STATUS: APPROVED
```

---

## Required Agent Protocol

1. Use the **implementer** skill.
2. Work from the repository root.
3. Branch from `dev`.
4. Commit this plan as the first commit on the implementation branch.
5. Follow TDD where behavior changes are testable.
6. Run quality gates before marking any round complete.
7. Do not write your own review.
8. Do not create files under `docs/review/`.
9. Do not delete files under `docs/review/`.
10. Review notes are durable audit records and must be committed.
11. Resolving a review note means:
    - implement the requested changes;
    - run quality gates;
    - commit the code/docs changes;
    - commit the review note itself if it is not already committed;
    - recreate the round-complete marker.
12. After finalization, stop polling and exit cleanly.

---

## Scope discipline

- Implement only the units the plan lists. Do not modify files outside the plan's scope.
- Do not change runtime behavior beyond what the plan specifies. A `refactor` or
  `cleanup` commit must preserve observable behavior.
- Never edit a test's expected value to make a behavior change pass. If a test
  legitimately must change, that change must be required by the plan or a review
  note, and you must record the rationale in the session log.
- If you spot an unrelated improvement, do not make it here — note it in the
  session log for a separate plan.

---

## Setup

Start from `dev`:

```bash
git checkout dev
# ORCH_LOCAL_ONLY: local trial branch, skipping origin pull
git checkout -b feat/steam-info-deckcompat
```

Commit this plan first:

```bash
git add docs/plans/2026-06-29_steam-info-deckcompat.md
git commit -m "docs(plan): add steam-info-deckcompat implementation plan"
```

---

## Implementation Tasks

Follow TDD for the backend (the fetch/parse/clamp logic is unit-testable with the harness).
The frontend client-store injection is verified on-device (deferred), but keep it guarded so
it never throws.

### Backend (`main.py`)

1. **Add a Deck-compatibility fetcher.** Add a method, e.g.
   `_steam_deck_compat_for_appid(self, steam_appid: int) -> int | None`, that:
   - returns `None` immediately for a non-positive `steam_appid`;
   - requests
     `https://store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=<steam_appid>&l=english`
     via the **existing** `_http_json` helper (same TLS context, headers, timeout, and
     redaction as `_steam_partner_events_for_appid`); do not hand-roll a new
     `urllib`/`ssl` path;
   - parses `results.resolved_category`, coerces to `int`, and returns it **only if** it is
     in `{0,1,2,3}`; otherwise returns `None`;
   - never raises — wrap network/parse in try/except and return `None` on any failure,
     logging via `_plog("steam", "deck compat fetch failed", level=logging.WARNING,
     exc=True, steam_appid=steam_appid)` (and a DEBUG success line with the resolved value).
     Reuse `_redact` through `_plog`; do not log raw URLs containing secrets (this endpoint
     has none, but keep the pattern).

2. **Call it from the Steam-enrichment seam.** In `_metadata_with_steam_news_sync`
   (main.py:1601), after `steam_appid` is resolved and assigned (around line 1615), when
   `steam_appid` is truthy fetch the category and store it:
   `category = self._steam_deck_compat_for_appid(steam_appid)` then
   `if category is not None: next_metadata["deck_compat_category"] = category`.
   Do not fetch when `steam_appid` is falsy.

3. **Carry the field through `_sanitize_metadata`** (main.py:1515). In the returned dict
   (main.py:1561), add a `"deck_compat_category"` key computed from
   `metadata.get("deck_compat_category")`: coerce to `int`, keep only if in `{0,1,2,3}`,
   else `None`. Mirror the existing `rating`/`release_date` clamp style already in this
   method. Ensure round-tripping metadata that already has the field preserves it.

4. **Tests** `tests/test_deck_compat.py` (harness; stub the HTTP layer — monkeypatch
   `_http_json` or the method's network call, do **not** hit the network):
   - a stubbed payload `{"success":1,"results":{"resolved_category":3}}` →
     `_steam_deck_compat_for_appid` returns `3`;
   - `resolved_category` of `0/1/2/3` round-trips; an out-of-range value (e.g. `7`) and a
     missing/malformed payload both yield `None`;
   - a raised exception in the HTTP layer yields `None` (no propagation);
   - `_sanitize_metadata` keeps a valid `deck_compat_category` and drops an invalid one;
   - `steam_appid <= 0` short-circuits and performs **no** HTTP call (assert the stub was
     not invoked).

### Frontend (`src/types.ts`, `src/steam.ts`)

5. **Type:** add `deck_compat_category?: number;` to `MetadataData` in `src/types.ts`
   (next to the other `steam_*` fields).

6. **Inject into the live client** in the `src/steam.ts` overview/appdetails patch
   (~line 280-358, the same function that sets `overview.metacritic_score` and builds
   `appData.associationData`). All writes must stay inside the existing `try/catch`
   (Steam objects are not always writable during bootstrap) and be no-ops when the value is
   absent:
   - **Deck badge:** when `typeof metadata.deck_compat_category === "number"` and it is
     `>= 1` (skip `0`/unknown so we never downgrade a real value to "unknown"), set
     `overview.steam_deck_compat_category = metadata.deck_compat_category`.
   - **Release date:** when `metadata.release_date` is a positive number (it is a unix
     timestamp, seconds), set it on the details so the info box shows it. Write to the
     established detail fields used by the client info box; set both
     `appData.details.unTimeReleased = metadata.release_date` and
     `appData.details.strReleaseDate` (a localized/printable string — derive from the
     timestamp, e.g. `new Date(metadata.release_date * 1000).toLocaleDateString()`), guarded
     for missing `appData.details`.
   - **Genres:** when `metadata.genres?.length`, expose them on the details in the shape the
     client uses for the genre list, e.g.
     `appData.details.vecGenres = metadata.genres` (array of strings) — guard for missing
     `appData.details`. (Confirm the exact field on-device; see Verification. If a different
     field name proves correct there, adjust and record it in the session log — this is the
     one field whose name is not yet hard-confirmed.)
   - Mirror the existing `appDetailsCache?.SetCachedDataForApp?.(...)` pattern only if the
     surrounding code already caches the corresponding section; do not invent new cache
     keys.

7. **Scope discipline:** do not change matching, discovery, the community-media/partner-event
   code, or control flow. Only add the deck-compat fetch + field plumbing + the three guarded
   client writes. Do not touch `from __future__ import annotations` or add npm deps.

8. Record a session log under `docs/agent_conversations/` per `AGENTS.md` §9, noting the
   red→green backend evidence and any genre-field-name finding deferred to on-device.

---

## Quality Gates

Run before marking any round complete:

```bash
scripts/orchestration/run-quality-gates
scripts/orchestration/check-review-notes-not-deleted
git status --short
```

The round is not complete unless:

1. all requested implementation work is done;
2. all relevant tests pass;
3. build/typecheck gates pass;
4. review notes have not been deleted;
5. the working tree is clean;
6. all code/docs changes are committed.

---

## Verification

Run and confirm:

```bash
export UV_CACHE_DIR=/tmp/Playhub-Metadata-local/.uv
uv run --with pytest -- pytest -q tests/test_deck_compat.py
scripts/orchestration/run-quality-gates    # tsc + build + py_compile + full pytest
git status --short                          # clean
```

Expected:

- `tests/test_deck_compat.py` passes: valid `resolved_category` (0..3) is parsed and
  round-trips through `_sanitize_metadata`; invalid/missing/exception cases yield `None`;
  `steam_appid <= 0` makes no HTTP call.
- Full quality gate passes (tsc/build/py_compile + pytest). Working tree clean.

Deferred verification (record in the session log; requires hardware — performed by the
human/orchestrator, not the implementer):

1. Rebuild the installer from `dev` and sideload on a real Steam Deck.
2. Open a matched non-Steam game that exists on Steam (e.g. *Warhammer 40,000: Space
   Marine*). Confirm the **Steam Deck compatibility badge** now reflects the matched app's
   rating, and the info box shows **release date** and **genres** (plus the already-working
   developer/publisher). Pull `playhub-metadata.log` and confirm a
   `[playhub:steam] deck compat` line with the resolved category and no errors.
3. If the genre list does not appear, capture the live `appDetailsStore.GetAppData(appId)`
   detail shape (the field the client actually reads for genres) and feed it back as a
   review note so the frontend uses the correct field name.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished steam-info-deckcompat
```

This writes:

```text
/tmp/Playhub-Metadata-local/steam-info-deckcompat_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer steam-info-deckcompat`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/steam-info-deckcompat-review-*.md
```

When a review note exists or a new review note appears:

1. Read the full review note.
2. If the note ends with:

   ```text
   STATUS: CHANGES_REQUESTED
   ```

   then resume work.

3. Clear the round-complete marker:

   ```bash
   scripts/orchestration/clear-finished steam-info-deckcompat
   ```

4. Address every requested change.
5. Run quality gates:

   ```bash
   scripts/orchestration/run-quality-gates
   scripts/orchestration/check-review-notes-not-deleted
   ```

6. Commit code/docs fixes.
7. Commit the review-note file itself if it is not already committed:

   ```bash
   git add docs/review/steam-info-deckcompat-review-*.md
   git commit -m "docs(review): record steam-info-deckcompat review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished steam-info-deckcompat
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer steam-info-deckcompat` after the next review note is created.

---

## Approval Handling

If the latest review note ends with:

```text
STATUS: APPROVED
```

then:

1. Confirm every previous review item has been addressed.
2. Confirm all review notes are committed:

   ```bash
   scripts/orchestration/check-review-notes-committed steam-info-deckcompat
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize steam-info-deckcompat
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/steam-info-deckcompat_finalized
   ```

6. Stop polling and exit cleanly.

---

## Review Rules

Do not write your own review.

Do not create files under:

```text
docs/review/
```

Do not delete files under:

```text
docs/review/
```

Only the orchestrator writes review notes. Your job is to read them, resolve them, commit them as audit records, and continue the loop.

---

## Finalization Rules

Only finalize after a review note with:

```text
STATUS: APPROVED
```

Finalization is performed with:

```bash
scripts/orchestration/finalize steam-info-deckcompat
```

Do not manually merge into `dev` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/steam-info-deckcompat_finished
/tmp/Playhub-Metadata-local/steam-info-deckcompat_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.

# Plan: Security: restore TLS verification and bound ROM hashing (security-tls-verification)

## Context

A security review of this fork found two backend issues this plan fixes. Both live in
`main.py`; no product feature changes, only the security posture of existing network and
file-hashing code.

**Issue 1 — TLS certificate verification is globally disabled (high).** `main.py` calls
`ssl._create_unverified_context()` for ~10 `urllib.request.urlopen` requests (verified at
lines 1957, 1991, 2046, 2164, 3004, 4614, 5769, 6081, 6374, 6588). Every metadata / Steam
news / RetroAchievements / OpenXBL / image fetch over HTTPS therefore skips certificate
validation, so a network attacker (public Wi-Fi, hostile router) can MITM the connections.
Fetched content is parsed as HTML/JSON, images are written to disk and loaded into the
Steam UI, and achievement/metadata data is rendered in Steam Big Picture — so MITM'd
content reaches the client. Worse, the **RetroAchievements and OpenXBL API keys are sent as
URL query params over these same unverified connections** (e.g. `{"y": api_key, ...}` near
line 6309 via `_ra_request_json`), so a MITM can steal the keys. The `curl` fallback at
line 3029 already verifies TLS by default; only the urllib paths are weak.

**Issue 2 — unbounded reads when hashing ROMs (medium, DoS / zip-bomb).**
`_zip_hash_candidates` (line ~7123) does `data = file.read()` on the largest matching zip
entry with no size cap, and `_md5_file` reads whole files into memory. A crafted zip
(tiny compressed, huge decompressed) or an oversized file can exhaust memory. There is no
`extractall`, so this is OOM/zip-bomb, not zip-slip.

Intended outcome: HTTPS requests validate certificates by default (keys and content no
longer interceptable), and ROM hashing cannot be driven to OOM, with **no regression** to
normal metadata/achievement behavior.

Key facts (verify before relying on them):

- Decky ships a Python runtime; `ssl.create_default_context()` loads system CAs
  (`/etc/ssl/...` on SteamOS/Linux, the Windows cert store on Windows). The original
  unverified context may have been a workaround for a missing CA bundle on some setup — so
  this fix must degrade to a *clear diagnostic*, never silently back to unverified.
- `certifi` is pure-Python and may or may not be importable in the Decky runtime. Prefer it
  when present (`certifi.where()`), else fall back to system CAs. Do **not** add `certifi`
  as a hard runtime dependency (Decky installs ship without a package manager); the
  `import certifi` must be wrapped in `try/except ImportError`.
- The native `hash`/`hash.exe` helper (line ~7095) is the preferred RA hasher; the Python
  fallback (`_bytes_hash_candidates` / `_md5_file` / `_zip_hash_candidates`) is what needs
  the size bounds.
- The test harness (`steamos-test-harness`) is available; the TLS-context construction and
  md5 streaming are unit-testable off-device. The actual network handshake is deferred to
  on-device testing.
- This plan file is already committed on base branch `dev`; a no-op "commit this plan
  first" is expected.

**Slug used throughout this plan:** `security-tls-verification`

---

## Orchestration Contract

**Slug:** `security-tls-verification`

**Plan file:**

```text
docs/plans/2026-06-28_security-tls-verification.md
```

**Implementation branch:**

```text
feat/security-tls-verification
```

**Round-complete marker:**

```text
/tmp/Playhub-Metadata-local/security-tls-verification_finished
```

**Finalized marker:**

```text
/tmp/Playhub-Metadata-local/security-tls-verification_finalized
```

**Review notes:**

```text
docs/review/security-tls-verification-review-*.md
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
git checkout -b feat/security-tls-verification
```

Commit this plan first:

```bash
git add docs/plans/2026-06-28_security-tls-verification.md
git commit -m "docs(plan): add security-tls-verification implementation plan"
```

---

## Implementation Tasks

### Part A — restore TLS verification

1. Add a module-level, cached verified-context builder near the top of `main.py` (after
   imports), so both instance and static call sites can use it:
   ```python
   import functools

   @functools.lru_cache(maxsize=1)
   def _build_https_context() -> ssl.SSLContext:
       try:
           import certifi
           ctx = ssl.create_default_context(cafile=certifi.where())
       except Exception:
           ctx = ssl.create_default_context()
       # defaults already set, but be explicit:
       ctx.check_hostname = True
       ctx.verify_mode = ssl.CERT_REQUIRED
       return ctx
   ```
   (`import ssl` already exists.)

2. Replace **every** `ssl._create_unverified_context()` occurrence (the ~10 sites listed in
   Context) with `_build_https_context()`. Do not leave any unverified context in `main.py`.
   Where a call site is a `@staticmethod`, the module-level function is directly callable.

3. Do **not** add a silent fallback to an unverified context anywhere. If a request fails
   with an `ssl.SSLCertVerificationError`, let it surface to the existing error handling /
   caller (which already tries alternate strategies such as `curl`), and log a clear,
   one-line diagnostic distinguishing "certificate verification failed" from a generic
   network error so the on-device cause (missing CA bundle) is obvious.

4. Leave the `curl` strategy (line ~3029) as-is — it already verifies. Do not weaken it.

### Part B — bound ROM hashing (DoS / zip-bomb)

5. Add a module-level constant, e.g. `MAX_ROM_HASH_BYTES = 4 * 1024 * 1024 * 1024` (4 GiB;
   comfortably above real ROMs, below memory-exhaustion territory). Make it easy to find.

6. Make `_md5_file` **stream** the file through `hashlib.md5` in fixed-size chunks (e.g.
   1 MiB) instead of reading the whole file into memory. This must not change the resulting
   digest for any file (verify in tests).

7. In `_zip_hash_candidates`: before selecting/reading an entry, skip any entry whose
   `entry.file_size` exceeds `MAX_ROM_HASH_BYTES` (do not `read()` it). For the chosen
   entry, guard the in-memory `file.read()` with the same cap (if it would exceed the cap,
   skip to the next candidate or fall back to `self._md5_file(path)` of the container). This
   prevents a tiny compressed zip from decompressing into an OOM. Preserve the existing
   behavior and returned candidates for normal-sized ROMs.

8. Apply the same upper-bound guard to any other path that loads an entire ROM into memory
   for hashing (audit `_file_hash_candidates` / `_bytes_hash_candidates` call sites). Do not
   change RA hash correctness for files within the cap.

### Tests (`tests/`, using the harness)

9. `tests/test_tls.py`:
   - assert `_build_https_context()` returns an `ssl.SSLContext` with
     `check_hostname is True` and `verify_mode == ssl.CERT_REQUIRED`;
   - **regression guard:** read `main.py` source and assert the string
     `_create_unverified_context` no longer appears (prevents silent reintroduction).

10. `tests/test_rom_hashing.py`:
    - assert `_md5_file` streams and matches `hashlib.md5(file_bytes).hexdigest()` for a
      small temp file (correctness preserved);
    - assert an entry/file reported larger than `MAX_ROM_HASH_BYTES` is skipped rather than
      read (construct a zip with a small entry and monkeypatch/inspect the size-guard, or
      test the guard helper directly). Build the instance with
      `main.Plugin.__new__(main.Plugin)`.

11. Record a session summary under `docs/agent_conversations/` per `AGENTS.md` §9, including
    the explicit note that on-device TLS verification is deferred (see Verification).

Scope note: backend `main.py` and tests only. Do not change frontend files or unrelated
network behavior.

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
uv run --with pytest -- pytest -q tests/test_tls.py tests/test_rom_hashing.py
grep -n "_create_unverified_context" main.py || echo "OK: no unverified TLS contexts remain"
scripts/orchestration/run-quality-gates    # full gate
git status --short                          # clean
```

Expected:

- `_build_https_context()` is verifying (`check_hostname=True`, `CERT_REQUIRED`).
- `grep` finds **no** `_create_unverified_context` in `main.py`.
- `_md5_file` digest is unchanged vs. `hashlib`; oversized entries/files are skipped, not
  read into memory.
- The full quality gate (tsc/build/py_compile/pytest) passes.

Deferred verification (record in the session log; requires a device and a network) —
**this is load-bearing for this plan:** on a real Steam Deck (SteamOS) and on Windows,
confirm that metadata search, Steam news/activity, RetroAchievements, and OpenXBL fetches
still succeed with verification enabled. If any fail with a certificate-verification error,
the runtime is missing a CA bundle: the remediation is to **vendor `certifi` into the
shipped plugin** (add it to the package payload in `scripts/package.mjs` /
`package-win.ps1` and ensure `import certifi` resolves on-device) rather than re-disabling
verification. Capture the failing host and error in the session log so this follow-up can be
scoped.

---

## Mark Round Complete

When the implementation round is complete and the working tree is clean, run:

```bash
scripts/orchestration/mark-finished security-tls-verification
```

This writes:

```text
/tmp/Playhub-Metadata-local/security-tls-verification_finished
```

Then exit cleanly. If this process exits, the orchestrator will resume you through
`scripts/orchestration/continue-implementer security-tls-verification`.

---

## Review Polling Loop

After marking the round complete, check existing review notes first, then poll for new review notes if you remain active:

```text
docs/review/security-tls-verification-review-*.md
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
   scripts/orchestration/clear-finished security-tls-verification
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
   git add docs/review/security-tls-verification-review-*.md
   git commit -m "docs(review): record security-tls-verification review notes"
   ```

8. Recreate the round-complete marker:

   ```bash
   scripts/orchestration/mark-finished security-tls-verification
   ```

9. Either continue polling or exit cleanly. If you exit, the orchestrator will resume you with `scripts/orchestration/continue-implementer security-tls-verification` after the next review note is created.

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
   scripts/orchestration/check-review-notes-committed security-tls-verification
   ```

3. Confirm the working tree is clean:

   ```bash
   git status --short
   ```

4. Finalize:

   ```bash
   scripts/orchestration/finalize security-tls-verification
   ```

5. Confirm the finalized marker exists:

   ```text
   /tmp/Playhub-Metadata-local/security-tls-verification_finalized
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
scripts/orchestration/finalize security-tls-verification
```

Do not manually merge into `main` unless the finalize script fails and the user/orchestrator explicitly instructs you to recover manually.

Leave both markers in place after finalization:

```text
/tmp/Playhub-Metadata-local/security-tls-verification_finished
/tmp/Playhub-Metadata-local/security-tls-verification_finalized
```

Any project-specific release step runs from the project's
`scripts/orchestration-hooks/finalize-release` hook, invoked by finalize.

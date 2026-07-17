# Contributing

Decky Metadata uses the repository workflow and safety contract in
[`AGENTS.md`](AGENTS.md). Work on a focused feature branch and keep temporary
artifacts and caches below `/tmp/Decky-Metadata`.

Before submitting a change, run the full local gate from the repository root:

```bash
scripts/orchestration/run-quality-gates
```

Local plugin packages are built with `npm run package`. Stable releases are
prepared on clean `main`, after the human-approved `dev` → `main` merge, with
`scripts/release.sh X.Y.Z`; the script creates local release artifacts and
prints, but never runs, the GitHub push commands. Pushed stable tags publish a
GitHub Release, while pushes to `dev` refresh the rolling dev prerelease.

# Contributing

Thanks for your interest in contributing! This document covers the essentials for getting set up and submitting changes.

## Prerequisites

- [Bun](https://bun.sh) — package manager, runtime, and test runner for this project. All app-side execution (dev server, scripts, tests, Vite) runs under Bun.
- [Node.js](https://nodejs.org) — required only for Playwright and the tsc/oxlint binaries.
- For end-to-end tests: run `bunx playwright install chromium` once after install.

## Setup

```sh
bun install
bun run dev        # Vite dev server with HMR + TinyBase sync over WebSocket
```

The dev store (`data-dev.db`) lives in the platform user-data dir, separate from the production store.

## Verifying your changes

Run these in order before opening a PR:

1. `bun run lint` — oxlint over the workspace.
2. `bun test` — unit + integration suites.
3. `bun run build` — typechecks both TS projects, then bundles.
4. `bun run smoke:bundle` — WS sync + SQLite persistence against the packaged daemon (`dist-bundle/localaction.js`); needs a fresh `build` first.
5. `bun run test:e2e` — Playwright; only needed when UI behavior changed.

`bun run smoke` boots the prod server on a throwaway DB and asserts WS sync plus SQLite persistence — a quick end-to-end sanity check.

A `pre-commit` hook runs the fast checks (`lint`, `bun test`, ~2s) on every commit, and a `pre-push` hook runs the full gate above on every push. `bun install` installs both automatically (via `postinstall`); existing clones run `bun run setup:hooks` once. Bypass in an emergency with `--no-verify`.

## Reporting issues

Open an issue on GitHub with a clear description, steps to reproduce, and expected vs. actual behavior. Screenshots help for UI issues.

# Contributing

Thanks for contributing!

## Prerequisites

- [Bun](https://bun.sh) — package manager, runtime, and test runner. All app-side execution runs under Bun.
- [Node.js](https://nodejs.org) — required only for Playwright and the tsc/oxlint binaries.
- For end-to-end tests: run `bunx playwright install chromium` once after install (on NixOS, use the system chromium — see AGENTS.md).

## Setup

```sh
bun install
bun run dev        # Vite dev server with HMR + TinyBase sync over WebSocket
```

## Verifying your changes

Run these in order before opening a PR (see AGENTS.md Verification order):

1. `bun run lint`
2. `bun test`
3. `bun run build`
4. `bun run test:e2e` — only when UI behavior changed.

## Reporting issues
Open a GitHub issue with repro steps and expected vs. actual behavior.

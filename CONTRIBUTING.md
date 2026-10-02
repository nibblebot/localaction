# Contributing

Thanks for contributing!

## Prerequisites

- [Bun](https://bun.sh) — package manager, runtime, and test runner. All app-side execution runs
  under Bun.
- [Node.js](https://nodejs.org) — required only for Playwright and the tsc/oxlint binaries.
- For end-to-end tests: run `bunx playwright install chromium` once after install (on NixOS, use the
  system chromium — see AGENTS.md).

## Setup

```sh
bun install
bun run dev        # Vite dev server with HMR + TinyBase sync over WebSocket
```

`bun install` installs the versioned Git hooks. Run `bun run setup:hooks` to refresh them in an
existing checkout.

## Code checks and formatting

- TypeScript 6 uses two referenced projects sharing `tsconfig.base.json`, with `strict` and
  `noUncheckedIndexedAccess` enabled. `bun run typecheck` checks all app code, tests, server,
  scripts, e2e files, and root Vite/Playwright configs without building assets. Keep app-side
  execution under Bun.
- `bun run lint` runs Oxlint, including curated JSX accessibility correctness and keyboard checks.
  Give controls accessible names, prefer native controls, and preserve meaningful focus and keyboard
  behavior; do not satisfy checks with fake key handlers or suppressions. This is not an all-rules
  accessibility policy or type-aware lint.
- `bun run format` writes Oxfmt formatting; `bun run format:check` checks it. The policy is 100
  columns, single-quoted code, and no import or package-field sorting. Markdown prose wraps at 100
  columns. Oxfmt respects `.gitignore` and excludes generated build, coverage, and report outputs.
- `.editorconfig` sets UTF-8, LF, two-space indentation, final newlines, and trimmed trailing
  whitespace; Markdown retains trailing spaces used for hard line breaks.

## Verifying your changes

Run these in order before opening a PR (see AGENTS.md Verification order):

1. `bun run lint`
2. `bun run format:check`
3. `bun test`
4. `bun run build` — runs `bun run typecheck` before the Vite and daemon builds.
5. `bun run smoke:bundle` — verifies the freshly built packaged daemon.
6. `bun run test:e2e` — only when UI behavior changed.

Pre-commit runs lint → format check → typecheck → tests. Pre-push runs lint → format check → tests →
build (including typecheck) → bundle smoke → regular e2e, regardless of whether UI behavior changed.
Deployment runs the same gate without e2e; normal commit/push hooks still apply.

## Reporting issues

Open a GitHub issue with repro steps and expected vs. actual behavior.

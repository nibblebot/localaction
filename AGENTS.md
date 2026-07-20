# AGENTS.md

## Stack
- Vite 8 + React 19 + TypeScript (~6), ESM (`"type": "module"`).
- Package manager: **pnpm** (lockfile: `pnpm-lock.yaml`). No `packageManager` pin. `scripts/` and `server/` run under `tsx` (in `devDependencies`); Vite is invoked directly as `vite`.
- Linter: **oxlint** (not eslint). Config: `.oxlintrc.json` — `react`, `typescript`, `oxc` plugins.
  - **vitest** (`vitest.config.ts`) drives all test files. Most runs use the `jsdom` environment (jsdom unit/component suites under `tests/data/`, `tests/markdown/`, `src/**/*.test.{ts,tsx}`, and `tests/router.test.ts`). The integration suite (`tests/integration/`) opts in to `node` via a `// @vitest-environment node` pragma at the top of the file.
  - **@playwright/test** (`playwright.config.ts`, real browser). Browser binaries are *not* committed — run `pnpm exec playwright install chromium` once after install.
- No state lib — `TinyBase` owns the store directly. No router — `src/router.ts` is hand-rolled.
- No `.nvmrc` and no `engines` field; Node version is unpinned.
- Stack versions are bleeding-edge; generic tutorials may target older majors.

## Commands
- **Agent server port rule:** Agents MUST NOT use the default port (`5173`) — and MUST NOT use the URL `localhost:5173` / `http://localhost:5173` — for any dev, preview, production, browser-test, or ad hoc test server invocation. Always pass an explicit, non-default, currently unused port; use `--strictPort` or the equivalent fail-on-conflict option where supported so the process never silently falls back to another port. Any URL the agent constructs afterwards (browser navigation, `fetch`, `/ws` endpoints, smoke assertions) MUST use that actual port — never a hardcoded `localhost:5173`. Bare `pnpm dev`, `pnpm preview`, and `pnpm start` server invocations are prohibited for agents. Commands such as `pnpm smoke` and `pnpm test:e2e` satisfy this rule when their scripts/configuration allocate or declare a non-default port.
- `pnpm dev` — Vite dev server with HMR (also attaches the TinyBase sync WS via `attachSyncServer`). Launched through `scripts/dev.ts`, which adds `--db <path>` (Vite's own `--port` is passed through).
- `pnpm build` — runs `tsc -b` (both tsconfig projects via references) then `vite build`. TS errors fail the build.
- `pnpm lint` — `oxlint` over the workspace.
- `pnpm preview` — serve the built `dist/` (same WS handler as dev).
- `pnpm start` — boot the unified prod server (`server/index.ts`). Port: `--port` flag (default `5173`). DB path: `--db` flag (default `./data/data.db`). `tsx` runs the TS entry.
- `pnpm smoke` — boots the prod server on a random port and asserts (a) WS sync between two TinyBase clients, (b) the SQLite persister round-trips area/sub-area/project rows. Run with `pnpm smoke`; it passes an explicit `port`/`dbPath`.
- `pnpm test` — `vitest run` (full suite: jsdom unit/component + node integration).
- `pnpm test:unit` — vitest run-once (jsdom suites only; integration runs in `pnpm test` too).
- `pnpm test:integration` — vitest run focused on `tests/integration/`.
- `pnpm test:watch` — vitest in watch mode.
- `pnpm test:e2e` — Playwright (assumes `pnpm exec playwright install chromium` has been run).
- `pnpm test:e2e:headed` — Playwright with the browser visible.

## Repo layout
- `index.html` → `src/main.tsx` → `src/App.tsx` is the only entry chain. `main.tsx` wraps the tree in `<StrictMode>` (dev-time double render).
- `tsconfig.node.json` covers Node-side config files: `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`. `tsconfig.app.json` covers `src/` and `tests/` (data, integration, markdown suites + the loose `tests/router.test.ts`).
- `tsconfig.app.json` declares `"types": ["vite/client", "node"]`. `@types/node` is intentionally scoped to `tsconfig.node.json` — `src/` and `tests/` keep Node types out of their app build.
- `public/` holds static assets served at root: `favicon.svg`, `icons.svg`, `fonts/`. The `icons.svg` sprite is consumed via `<use href="/icons.svg#NAME-icon" />` from `src/components/*.tsx` and `src/components/appearance/*.tsx` (never from `App.tsx` itself).
- `src/assets/` holds images imported by TS (e.g. `hero.png`, `react.svg`).
- `data/` (repo root, gitignored) — runtime SQLite drop location for the prod server. Default `./data/data.db`; override it with the `--db` CLI flag (`pnpm dev` / `pnpm start`).
- `dist/` is build output (gitignored). Do not hand-edit.
- `src/data/` — the data-layer seam (TinyBase MergeableStore, OPFS-backed persister, WS sync, `DataLayerProvider`). Data APIs go through `src/data/index.ts`; UI bindings like `Provider`/`useRowIds` from `tinybase/ui-react*` and `Inspector` from `tinybase/ui-react-inspector` are allowed at consumer sites.
- `server/` — prod-server entry (`server/index.ts`) and SQLite handle (`server/db.ts`). Serves `dist/` and upgrades `/ws`. Re-exports `attachSyncServer` so Vite's `configureServer` / `configurePreviewServer` reuse the same handler in dev/preview.
- `scripts/` — `scripts/dev.ts` (the `pnpm dev` launcher) and `scripts/smoke.ts`. Run via `tsx`.
- `tests/` — single vitest tree (one config, per-file environment via pragma):
  - `tests/data/` — data-layer unit tests (mirror `src/data/`'s surface).
  - `tests/markdown/` — markdown rendering unit tests.
  - `tests/router.test.ts` — loose vitest file at the top level.
  - `tests/integration/` — vitest with `@vitest-environment node`; sync + persistence round-trip.
- `e2e/` — Playwright end-to-end suites, one `*.spec.ts` per user-visible journey.
- `docs/architecture.md` — high-level system shape (client/server/sync/data model, runtime modes, testing strategy).
- `docs/ux.md` — high-level user-experience overview (shell, navigation, views, appearance, interaction patterns).
- `docs/glossary.md` — domain vocabulary / ubiquitous language. Trust `package.json` and `src/` for behavior; trust this file for the vocabulary; trust inline JSDoc for the rest.
## Quirks
- **React Compiler is enabled**
- TS is configured with `verbatimModuleSyntax`, `erasableSyntaxOnly`, `allowImportingTsExtensions`, `moduleResolution: bundler`. Use `import type` for type-only imports; keep `.tsx` extensions in TS imports (e.g. `src/main.tsx:4`).
- `verbatimModuleSyntax` also means no `import React from 'react'` — rely on the automatic JSX runtime (`jsx: "react-jsx"`).
- `erasableSyntaxOnly` forbids enums and namespaces.
- `tsc -b` uses project references, so TS errors in `vite.config.ts`/`vitest.config.ts`/`playwright.config.ts` block the build even though they're not under `src/`.
- **Test runners split by environment, not by tool.** vitest (single config) drives all suites; the integration suite uses `// @vitest-environment node` to opt out of jsdom and run against real `ws`/`sqlite3` Node modules. There is no separate runner config — pick the env per file.
- **Playwright config** auto-starts `pnpm dev` on a non-default port (`5180`) via `webServer.command`; `reuseExistingServer: false`. Tests never share the default Vite/prod-server port (`5173`) so a manual `pnpm dev` session can run in parallel without conflict. Tests depend on the `/ws` handshake succeeding.
- **Test databases live in `data/` but never use the default name.** Any dev/preview/smoke run that doesn't need the user's real store must point `--db` at a `test-*.db` path (e.g. `data/test-e2e.db`, `data/test-smoke-1234.db`). The wildcard `*` keeps simultaneous runs from clobbering each other. Clean every `data/test-*.db` up when you're done — Playwright e2e suites are expected to spin up and tear down their own DB; manual `pnpm dev` sessions that needed isolation should `rm data/test-*.db` before yielding.
- **Real data is NEVER wiped without an explicit user prompt gate.** The user's store (`data/data.db` or any non-`test-*.db` SQLite file, plus the browser's OPFS snapshot) must never be deleted, overwritten, or invalidated by an agent without asking the user first. This binds two ways: (a) directly — no `rm`/`mv`/truncation of non-test DB files, no clearing of OPFS outside throwaway browser profiles; and (b) indirectly — bumping `SCHEMA_VERSION` in `src/data/schema.ts` triggers `reconcileSchemaVersion`'s clean-cutover wipe of every persisted store on next load, so a version bump requires prior user approval too (state the data loss explicitly when asking). Test databases (`data/test-*.db`) and e2e browser profiles are exempt — those are always safe to wipe.
## Conventions
- Components are default-exported function components returning `React.JSX.Element` (or `React.JSX.Element | null`). See `src/components/Sidebar.tsx` for the canonical shape; `src/App.tsx` follows the same pattern.
- Library seams (e.g. `src/data/`) export named functions and types. Components are the only default-exports in `src/`.
- Icons: prefer adding a new `<symbol id="x-icon">` to `public/icons.svg` and referencing it with `<use href="/icons.svg#x-icon" />` from the appropriate component (never inline an `<svg>` for an existing icon).
- Styles: `src/index.css` (global tokens, light/dark, density, fonts) and `src/App.css` (shell + every component's scoped rules — `.app-shell`, `.sidebar*`, `.main*`, `.modal*`, `.sortable-*`, `.appearance-*`, etc.).
- Lint rules in force: `react/rules-of-hooks` (error), `react/only-export-components` (warn, allows constant exports). Type-aware mode is **not** enabled (`oxlint-tsgolint` not installed).

## Verification order for changes
1. `pnpm lint`
2. `pnpm test` (vitest run-once — fast, blocks on regressions)
3. `pnpm build` (covers TS typecheck of both projects + bundle)
4. `pnpm test:e2e` (Playwright — only when UI behavior touched)

Tests should exercise **external behavior**, not implementation. The data layer is the seam: tests should use the typed hooks / sync protocol, not reach inside TinyBase.

## Agent skills

### Issue tracker

Local markdown — issues live under `.scratch/<feature>/issues/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) recorded as `Status:` lines. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — vocabulary lives in `docs/glossary.md` (not a root `CONTEXT.md`); no ADRs yet (`docs/adr/` is absent). The skill convention (`docs/agents/domain.md`) still describes where it *would* look; if it can't find those files it proceeds silently.
# AGENTS.md

## Stack
- Vite 8 + React 19 + TypeScript (~6), ESM (`"type": "module"`).
- Package manager: **bun** (lockfile: `bun.lock`). No `packageManager` pin. Bun runs `.ts` files natively, so `scripts/` and `server/` have no `tsx` runtime needed; Vite's optional peer may still pull `tsx` into `node_modules` but nothing in our code imports it.
- Linter: **oxlint** (not eslint). Config: `.oxlintrc.json` — `react`, `typescript`, `oxc` plugins.
- Unit / integration tests: **vitest** (`vitest.config.ts`, jsdom env for React-side tests).
- End-to-end tests: **@playwright/test** (`playwright.config.ts`, real browser). Browser binaries are *not* committed — run `bun x playwright install chromium` once after install.
- No state lib, no router — install explicitly when needed.
- No `.nvmrc` and no `engines` field; Node version is unpinned.
- Stack versions are bleeding-edge; generic tutorials may target older majors.

## Commands
- `bun run dev` — Vite dev server with HMR (also spins up the TinyBase sync WS).
- `bun run build` — runs `tsc -b` (both tsconfig projects via references) then `vite build`. TS errors fail the build.
- `bun run lint` — `oxlint` over the workspace.
- `bun run preview` — serve the built `dist/` (same WS handler as dev).
- `bun run start` — boot the unified prod server (`server/index.ts`) on `LOCALACTION_PORT`. Bun runs the TS entry directly.
- `bun run smoke` — boot the server and assert the TinyBase sync round-trip.
- `bun run test` — vitest in run-once mode (CI-shaped).
- `bun run test:watch` — vitest in watch mode.
- `bun run test:e2e` — Playwright (assumes `bun x playwright install chromium` has been run).
- `bun run test:e2e:headed` — Playwright with the browser visible.

## Repo layout
- `index.html` → `src/main.tsx` → `src/App.tsx` is the only entry chain. `main.tsx` wraps the tree in `<StrictMode>` (dev-time double render).
- `vite.config.ts` is the only file covered by `tsconfig.node.json`; everything under `src/` is covered by `tsconfig.app.json`.
- `tsconfig.app.json` includes `types: ["vite/client"]` only — `@types/node` is intentionally out of scope inside `src/`.
- `public/` holds static assets served at root: `favicon.svg` and the `icons.svg` sprite referenced via `<use href="/icons.svg#NAME-icon" />` (see `src/App.tsx:38`).
- `src/assets/` holds images imported by TS (e.g. `hero.png`).
- `dist/` is build output (gitignored). Do not hand-edit.
- `src/data/` — the single seam (TinyBase MergeableStore, IndexedDB persister, WS sync, `DataLayerProvider`). Anything outside it should import from its public surface, never from `tinybase` directly. See `docs/adr/0001-tinybase.md`.
- `server/` — Node entry that serves `dist/` and upgrades `/ws` for production (`bun run start`). Vite reuses `attachSyncServer` in dev/preview.
- `scripts/` — Node-runnable tooling (smoke test). `scripts/*.ts` are executed directly by bun (`bun run smoke`) — no separate TS loader needed.
- `tests/` (optional) — vitest unit and integration suites. Component tests for React live here and use jsdom.
- `e2e/` — Playwright end-to-end suites, one `*.spec.ts` per user-visible journey.
- `README.md` is the unmodified Vite scaffold template — not project documentation. Trust `package.json` and `src/` over it.

## Quirks
- **React Compiler is enabled** via `babel-plugin-react-compiler` (see `vite.config.ts`). Per README this slows dev/build. Code must stay compiler-clean — no mutation of props/hooks patterns the compiler cannot reason about.
- TS is configured with `verbatimModuleSyntax`, `erasableSyntaxOnly`, `allowImportingTsExtensions`, `moduleResolution: bundler`. Use `import type` for type-only imports; keep `.tsx` extensions in TS imports (e.g. `src/main.tsx:4`).
- `verbatimModuleSyntax` also means no `import React from 'react'` — rely on the automatic JSX runtime (`jsx: "react-jsx"`).
- `erasableSyntaxOnly` forbids enums and namespaces.
- `tsc -b` uses project references, so TS errors in `vite.config.ts` block the build even though it's not under `src/`.
- **vitest env split**: `vitest.config.ts` runs React-side suites in jsdom and Node-side suites (e.g. `scripts/`, `server/`) in the `node` env. Defaults pick the env from file extension.
- **Playwright config** auto-starts `bun run dev` on port 5173 if it isn't already running. Tests expect the data layer's `/ws` handshake to succeed.

## Conventions
- Components are default-exported function components (see `src/App.tsx`).
- Library seams (e.g. `src/data/`) export named functions and types — only `App.tsx` uses default export.
- Icons: prefer adding a new `<symbol id="x-icon">` to `public/icons.svg` and referencing it with `<use href="/icons.svg#x-icon" />`.
- Styles: `src/index.css` (global tokens, light/dark), `src/App.css` (component scopes).
- Lint rules in force: `react/rules-of-hooks` (error), `react/only-export-components` (warn, allows constant exports). Type-aware mode is **not** enabled (`oxlint-tsgolint` not installed).

## Verification order for changes
1. `bun run lint`
2. `bun run test` (vitest, run-once — fast, blocks on regressions)
3. `bun run build` (covers TS typecheck of both projects + bundle)
4. `bun run test:e2e` (Playwright — only when UI behavior touched)

Tests should exercise **external behavior**, not implementation. The data layer is the seam: tests should use the typed hooks / sync protocol, not reach inside TinyBase.

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature>/`. No external PRs as a triage surface (no remote configured). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at root + `docs/adr/`. See `docs/agents/domain.md`.


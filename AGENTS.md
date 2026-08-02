# AGENTS.md

## Stack
- Vite 8 + React 19 + TypeScript (~6), ESM. **Bun** is the package manager and runtime for everything app-side (`server/`, `scripts/`, Vite); the SQLite driver is `bun:sqlite`, so any process loading `server/db.ts` (server, scripts, Vite config, tests) MUST run under Bun.
- Linter: **oxlint** (`.oxlintrc.json`). Unit/integration: **bun test** rooted at `tests/` (no DOM env; stub `globalThis.window` where needed). E2E: **@playwright/test** — run `bunx playwright install chromium` once after install.
- No state lib — TinyBase owns the store. No router — `src/router.ts` is hand-rolled.
- Node is unpinned and only needed for Playwright/tsc/oxlint binaries. Stack versions are bleeding-edge; generic tutorials may target older majors.

## Commands
- **Agent port rule:** never use the default ports (`5173`, `7373`) or their URLs for any server invocation. Always pass an explicit, currently unused port with `--strictPort` (or equivalent) and use that actual port in every URL you construct. Bare `bun run dev`/`preview`/`start` are prohibited; `bun run smoke` and `bun run test:e2e` satisfy the rule (their configs allocate non-default ports).
- **Agent process-kill rule:** never kill a process you didn't start — even an apparently orphaned server may be the user's live session. Pick another explicit non-default port or ask the user to stop it. Clean up processes you spawned when done.
- `bun run dev` — Vite dev + HMR + TinyBase sync WS; `scripts/dev.ts` injects `--db` (default `defaultDevDbPath()`, kept separate from the prod store).
- `bun run build` — `tsc -b` (both tsconfig projects) + `bun --bun vite build`; TS errors fail the build.
- `bun run lint` — oxlint. `bun test` / `test:unit` / `test:integration` / `test:watch`.
- `bun run preview` — serve `dist/` (same WS handler as dev). `bun run start` — prod server (`server/index.ts`): `--port` (default 7373), `--db` (default `defaultProdDbPath()`).
- `bun run smoke` — WS sync between two TinyBase clients + SQLite persister round-trip, on a random port/DB.
- `bun run backup-db` / `bun run benchmark-size` — online `VACUUM INTO` backup; DB size-growth benchmark against a throwaway store.
- `bun run test:e2e` / `:headed` / `:offline` — Playwright; offline builds first, then previews on port 5181 (the SW registers only in prod builds).

## Repo layout
- Entry chain: `index.html` → `src/main.tsx` (StrictMode double-render in dev) → `src/App.tsx`.
- `src/data/` — data-layer seam (TinyBase MergeableStore, OPFS persister, WS sync, `DataLayerProvider`). Data APIs via `src/data/index.ts`; TinyBase UI bindings are allowed at consumer sites.
- `src/components/` — component tree by domain; `MainPane.tsx` dispatches routes, one branch per pane.
- `server/` — prod server + `bun:sqlite` handle; re-exports `attachSyncServer` so Vite dev/preview reuse the same WS handler.
- `scripts/` - scripts
- `tests/` — bun-test tree: `data/`, `markdown/`, `integration/`, `router.test.ts`. `e2e/` — Playwright, one spec per user journey.
- `public/` — static assets; `dist/` is build output; never hand-edit.
- `docs/architecture.md`, `docs/ux.md`, `docs/glossary.md` — system shape, UX, vocabulary. Trust code for behavior, the glossary for vocabulary.
- tsconfigs: `tsconfig.app.json` covers `src/` + `tests/`; `tsconfig.node.json` covers `vite.config.ts` / `playwright.config.ts`. `@types/bun` provides `bun:sqlite` / `bun:test` types.

## Quirks
- React Compiler is enabled.
- TS: `verbatimModuleSyntax` (use `import type`; automatic JSX runtime — no `import React`), `erasableSyntaxOnly` (no enums/namespaces), keep `.tsx` extensions in TS imports.
- `tsc -b` uses project references — TS errors in `vite.config.ts` / `playwright.config.ts` block the build.
- Every Vite invocation must be `bun --bun vite ...` — never bare `vite`. Dev/preview must also pass `--configLoader runner`: Vite's default rolldown config loader breaks `ws` upgrade handling under Bun. Also, Bun's `node:http` keeps upgraded WS sockets tracked, so `attachSyncServer.close()` destroys them from an explicit socket set or `httpServer.close()` never fires. Both are pinned in the scripts — do not remove.
- `bun test` shares one module registry across all files in a run — never `mock.module` app modules (registrations leak into later files). Inject fakes through option seams instead (e.g. `startSync`'s `synchronizerImpl`).
- Playwright auto-starts `bun run dev` on port 5180 (`reuseExistingServer: false`); tests depend on the `/ws` handshake.
- **Test DBs live in `os.tmpdir()`** — unique throwaway path per run (`e2e/test-db-path.ts` is the canonical helper). Never let an experimental run fall through to `defaultDevDbPath()`.
- **Real data is NEVER wiped without an explicit user prompt gate** — no deleting/overwriting user data SQLite files, no clearing OPFS outside throwaway browser profiles. Tmp test DBs and e2e profiles are exempt.

## Conventions
- Components: default-exported function components returning `React.JSX.Element` (canonical: `src/components/sidebar/Sidebar.tsx`). Library seams export named functions/types; only components default-export.
- Icons: add a `<symbol id="x-icon">` to `public/icons.svg` and reference it with `<use>`; never inline an existing icon.
- Styles: `src/index.css` (tokens, light/dark, density, fonts) + `src/App.css` (shell + scoped component rules).
- Commits: Conventional Commits — `type(scope): concise imperative description` (e.g. `feat(projects): add collapsible project cards`); lowercase, focused scope.

### Mobile layout & touch
Behavioral rules; DESIGN.md stays normative for visual tokens.
- **Layout:** single column, 360px floor, ≤75ch measure, never horizontal scroll (`overflow-x: clip`). Full-height regions use `svh`/`dvh`, never `100vh`. Fixed chrome pads with `env(safe-area-inset-*)`. NEVER set `maximum-scale`/`user-scalable=no` — pinch-zoom is required.
- **Touch:** interactive elements ≥32px with ≥8px gaps; primary actions in the bottom thumb zone; `touch-action: manipulation`; immediate `:active` feedback; nothing gated behind hover; honor `prefers-reduced-motion` for every animation.

## Verification order
1. `bun run lint`
2. `bun test`
3. `bun run build`
4. `bun run test:e2e` — only when UI behavior changed

Tests exercise external behavior through the data-layer seam (typed hooks / sync protocol), never TinyBase internals.

## Design context
`PRODUCT.md` (positioning, brand personality), `DESIGN.md` (visual system), `.impeccable/design.json` (machine-readable tokens). Consult before UI work; normative for design decisions.

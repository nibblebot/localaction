# AGENTS.md

## Stack
- Vite 8 + React 19 + TypeScript (~6), ESM (`"type": "module"`).
- Package manager + runtime: **Bun** (lockfile: `bun.lock`, config: `bunfig.toml`). `scripts/` and `server/` run under `bun` directly. The server-side SQLite driver is **`bun:sqlite`** — every process that loads `server/db.ts` (server, scripts, Vite config, tests) MUST run under the Bun runtime.
- Linter: **oxlint** (not eslint). Config: `.oxlintrc.json` — `react`, `typescript`, `oxc` plugins.
  - **bun test** drives all unit/integration suites under `tests/` (`bunfig.toml` sets `[test] root = "tests"` so the Playwright specs in `e2e/` are never picked up). No DOM environment: tests stub `globalThis.window` where needed.
  - **@playwright/test** (`playwright.config.ts`, real browser). Browser binaries are *not* committed — run `bunx playwright install chromium` once after install.
- No state lib — `TinyBase` owns the store directly. No router — `src/router.ts` is hand-rolled.
- No `.nvmrc` and no `engines` field; Node version is unpinned. Node is still required for Playwright and tsc/oxlint binaries, but all app-side Node execution (server, scripts, Vite) runs under Bun.
- Stack versions are bleeding-edge; generic tutorials may target older majors.

## Commands
- **Agent server port rule:** Agents MUST NOT use the default ports (`5173` for Vite dev/preview, `7373` for the prod server) — and MUST NOT use the URLs `localhost:5173` / `localhost:7373` — for any dev, preview, production, browser-test, or ad hoc test server invocation. Always pass an explicit, non-default, currently unused port; use `--strictPort` or the equivalent fail-on-conflict option where supported so the process never silently falls back to another port. Any URL the agent constructs afterwards (browser navigation, `fetch`, `/ws` endpoints, smoke assertions) MUST use that actual port — never a hardcoded `localhost:5173` or `localhost:7373`. Bare `bun run dev`, `bun run preview`, and `bun run start` server invocations are prohibited for agents. Commands such as `bun run smoke` and `bun run test:e2e` satisfy this rule when their scripts/configuration allocate or declare a non-default port.
- `bun run dev` — Vite dev server with HMR (also attaches the TinyBase sync WS via `attachSyncServer`). Launched through `scripts/dev.ts`, which adds `--db <path>` (injecting `defaultDevDbPath()` when the user passes none — the dev store `data-dev.db` in the platform user-data dir, kept separate from the production store). Vite's own `--port` is passed through. Vite is spawned as `bun --bun vite --configLoader runner` (see Quirks).
- `bun run build` — runs `tsc -b` (both tsconfig projects via references) then `bun --bun vite build`. TS errors fail the build.
- `bun run lint` — `oxlint` over the workspace.
- `bun run preview` — serve the built `dist/` (same WS handler as dev; `bun --bun vite preview --configLoader runner`).
- `bun run start` — boot the unified prod server (`server/index.ts`) under Bun. Port: `--port` flag (default `7373`). DB path: `--db` flag (default `defaultProdDbPath()` from `server/db.ts` — the platform user-data dir via `env-paths`, e.g. `~/.local/share/localaction/data-prod.db` on Linux).
- `bun run smoke` — boots the prod server on a random port and asserts (a) WS sync between two TinyBase clients, (b) the SQLite persister round-trips area/sub-area/project rows. Run with `bun run smoke`; it passes an explicit `port`/`dbPath`.
- `bun run backup-db` — online backup of the SQLite store via `VACUUM INTO` (`scripts/backup-db.ts`): consistent snapshot while a server is running, source opened read-only, never overwrites an existing backup. Flags: `--db` (default `defaultProdDbPath()`), `--out` (default: timestamped sibling).
- `bun run benchmark-size` — DB size-growth benchmark (`scripts/benchmark-size.ts`): seeds area/project/task rows through the app's creators, deletes half via the cascade deleters, and snapshots file size / page stats / row counts against a throwaway `os.tmpdir()` store.
- `bun test` (or `bun run test`) — full unit + integration suite under `tests/`.
- `bun run test:unit` — unit suites only (`tests/data`, `tests/markdown`, `tests/router.test.ts`).
- `bun run test:integration` — focused on `tests/integration/`.
- `bun run test:watch` — `bun test --watch`.
- `bun run test:e2e` — Playwright (assumes `bunx playwright install chromium` has been run).
- `bun run test:e2e:headed` — Playwright with the browser visible.
- `bun run test:e2e:offline` — offline (service-worker) e2e against the production build: chains `bun run build`, then Playwright with `playwright.offline.config.ts` (`bun run preview` on port `5181` — the SW only registers in prod builds).

## Repo layout
- `index.html` → `src/main.tsx` → `src/App.tsx` is the only entry chain. `main.tsx` wraps the tree in `<StrictMode>` (dev-time double render).
- `tsconfig.node.json` covers Node-side config files: `vite.config.ts`, `playwright.config.ts`. `tsconfig.app.json` covers `src/` and `tests/` (data, integration, markdown suites + the loose `tests/router.test.ts`).
- `tsconfig.app.json` declares `"types": ["vite/client", "node", "bun"]`; `tsconfig.node.json` declares `"types": ["node", "bun"]`. `@types/bun` provides `bun:sqlite` / `bun:test` types where tests reach the server modules.
- `public/` holds static assets served at root: `favicon.svg`, `icons.svg`, `fonts/`. The `icons.svg` sprite is consumed via `<use href="/icons.svg#NAME-icon" />` from `src/App.tsx` and `src/components/**/*.tsx` (including `src/components/appearance/`).
- `dist/` is build output (gitignored). Do not hand-edit.
- `src/data/` — the data-layer seam (TinyBase MergeableStore, OPFS-backed persister, WS sync, `DataLayerProvider`). Data APIs go through `src/data/index.ts`; UI bindings like `Provider`/`useRowIds` from `tinybase/ui-react*` and `Inspector` from `tinybase/ui-react-inspector` are allowed at consumer sites.
- `server/` — prod-server entry (`server/index.ts`) and SQLite handle (`server/db.ts`, `bun:sqlite`). Serves `dist/` and upgrades `/ws`. Re-exports `attachSyncServer` so Vite's `configureServer` / `configurePreviewServer` reuse the same handler in dev/preview.
- `scripts/` — `scripts/dev.ts` (the `bun run dev` launcher), `scripts/smoke.ts`, plus `backup-db.ts` / `benchmark-size.ts` / `seed-layout.ts`. Run via `bun`.
- `tests/` — single `bun test` tree (no config file; `bunfig.toml` roots the scan at `tests/`):
  - `tests/data/` — data-layer unit tests (mirror `src/data/`'s surface).
  - `tests/markdown/` — markdown rendering unit tests.
  - `tests/router.test.ts` — loose test file at the top level.
  - `tests/integration/` — sync + persistence round-trip against the real server (`bun:sqlite`, `ws`).
- `e2e/` — Playwright end-to-end suites, one `*.spec.ts` per user-visible journey.
- `docs/architecture.md` — high-level system shape (client/server/sync/data model, runtime modes, testing strategy).
- `docs/ux.md` — high-level user-experience overview (shell, navigation, views, appearance, interaction patterns).
- `docs/glossary.md` — domain vocabulary / ubiquitous language. Trust `package.json` and `src/` for behavior; trust this file for the vocabulary; trust inline JSDoc for the rest.
## Quirks
- **React Compiler is enabled**
- TS is configured with `verbatimModuleSyntax`, `erasableSyntaxOnly`, `allowImportingTsExtensions`, `moduleResolution: bundler`. Use `import type` for type-only imports; keep `.tsx` extensions in TS imports (e.g. `src/main.tsx:4`).
- `verbatimModuleSyntax` also means no `import React from 'react'` — rely on the automatic JSX runtime (`jsx: "react-jsx"`).
- `erasableSyntaxOnly` forbids enums and namespaces.
- `tsc -b` uses project references, so TS errors in `vite.config.ts`/`playwright.config.ts` block the build even though they're not under `src/`.
- **Bun runtime everywhere app-side.** `bun:sqlite` only resolves under Bun, and `vite.config.ts` statically imports `server/index.ts` → `server/db.ts`, so EVERY Vite invocation (dev/build/preview) must be `bun --bun vite ...`, never bare `vite`. Two Bun-specific landmines, both fixed and documented inline: (a) Vite dev/preview must pass `--configLoader runner` — Vite's default rolldown config BUNDLER breaks `ws` upgrade handling under Bun (the 101 response never reaches the wire); `scripts/dev.ts` and the `preview` script pin this — do not remove it. (b) Bun's `node:http` keeps upgraded WS sockets tracked, so `attachSyncServer.close()` destroys them from an explicit socket set or `httpServer.close()` never fires.
- **`bun test` shares one module registry across all test files in a run**, and `mock.module` registrations leak into later files (their static imports resolve at evaluation time, before any `afterAll` restore can run). Never use `mock.module` for app modules — inject fakes through option seams instead (e.g. `startSync`'s `synchronizerImpl`, used by `tests/data/sync.strictmode.test.ts`).
- **Playwright config** auto-starts `bun run dev` on a non-default port (`5180`) via `webServer.command`; `reuseExistingServer: false`. Tests never share the default Vite (`5173`) or prod-server (`7373`) ports so a manual `bun run dev` session can run in parallel without conflict. Tests depend on the `/ws` handshake succeeding.
- **Test databases live in the OS temp dir (`os.tmpdir()`), never in the repo.** Any dev/preview/smoke run that doesn't need the user's real store must point `--db` at a unique throwaway path under tmp (e.g. `join(tmpdir(), \`localaction-test-<purpose>-${Date.now()}-${process.pid}.db\`)` — `e2e/test-db-path.ts` is the canonical helper). The unique name keeps simultaneous runs from clobbering each other. No cleanup ritual: the OS reaps tmp, and Playwright e2e additionally removes its own DB via global setup/teardown. For an isolated manual `bun run dev` session, pass `--db "<tmp path>"` explicitly — never let an experimental run fall through to `defaultDevDbPath()`. The user's real stores live in the platform user-data dir (`defaultDevDbPath()`/`defaultProdDbPath()` in `server/db.ts`); `bun run dev` and `bun run start` pass them explicitly, and `ServerOptions.dbPath` is required so nothing falls back to a repo-relative path.
- **Real data is NEVER wiped without an explicit user prompt gate.** The user's store (`defaultDevDbPath()`/`defaultProdDbPath()` — e.g. `~/.local/share/localaction/data-dev.db` and `data-prod.db` on Linux — the pre-split `data.db` from older versions, or any non-`test-*.db` SQLite file, plus the browser's OPFS snapshot) must never be deleted, overwritten, or invalidated by an agent without asking the user first. No `rm`/`mv`/truncation of non-test DB files, no clearing of OPFS outside throwaway browser profiles. Test databases (throwaway paths under `os.tmpdir()`) and e2e browser profiles are exempt — those are always safe to wipe.
## Conventions
- Components are default-exported function components returning `React.JSX.Element` (or `React.JSX.Element | null`). See `src/components/Sidebar.tsx` for the canonical shape; `src/App.tsx` follows the same pattern.
- Library seams (e.g. `src/data/`) export named functions and types. Components are the only default-exports in `src/`.
- Icons: prefer adding a new `<symbol id="x-icon">` to `public/icons.svg` and referencing it with `<use href="/icons.svg#x-icon" />` from the appropriate component (never inline an `<svg>` for an existing icon).
- Styles: `src/index.css` (global tokens, light/dark, density, fonts) and `src/App.css` (shell + every component's scoped rules — `.app-shell`, `.sidebar*`, `.main*`, `.modal*`, `.sortable-*`, `.appearance-*`, etc.).
- Lint rules in force: `react/rules-of-hooks` (error), `react/only-export-components` (warn, allows constant exports). Type-aware mode is **not** enabled (`oxlint-tsgolint` not installed).
- Commit messages follow Conventional Commits: use `type(scope): concise imperative description` (for example, `feat(projects): add collapsible project cards`). Use a lowercase, focused scope naming the affected area or subsystem; keep the subject brief and specific. Common types in this repository include `feat`, `fix`, `refactor`, `test`, `style`, `docs`, and `chore`.

### Mobile layout & touch
Behavioral layout/interaction rules — distinct from the DESIGN.md visual-token system, which stays normative for brand decisions.
- **Layout & viewport:** mobile-first single column with a 360px floor; readable measure ≤75ch; never allow horizontal scroll (`overflow-x: clip`, WCAG 1.4.10 reflow). Size full-height regions with `svh`/`dvh`, never `100vh` (mobile URL bar bug). The viewport meta keeps `viewport-fit=cover` + `interactive-widget=resizes-content`; fixed/sticky chrome (header, tab bar, sheets) pads with `env(safe-area-inset-*)` for the notch and home indicator. NEVER set `maximum-scale`/`user-scalable=no` — pinch-zoom is an accessibility requirement (WCAG 1.4.4).
- **Touch & interaction:** all interactive elements are ≥44px (Apple HIG 44pt; PRODUCT.md documents 44px under coarse pointer) with ≥8px gaps. Note: 48px (Material 48dp) is the stricter general mobile standard and the WCAG 2.2 SC 2.5.8 AA floor is 24×24 CSS px, but this project deliberately ships 44px — use 44px. Primary actions live in the bottom thumb zone (tab bar / bottom sheets), not the top third. Use `touch-action: manipulation` (kills the 300ms tap delay), give immediate `:active` feedback, and never gate functionality behind hover. Honor `prefers-reduced-motion` for every animation.

## Verification order for changes
1. `bun run lint`
2. `bun test` (run-once — fast, blocks on regressions)
3. `bun run build` (covers TS typecheck of both projects + bundle)
4. `bun run test:e2e` (Playwright — only when UI behavior touched)

Tests should exercise **external behavior**, not implementation. The data layer is the seam: tests should use the typed hooks / sync protocol, not reach inside TinyBase.

## Design context

`PRODUCT.md` (root) — register (`product`), platform (`web`), users, positioning, brand personality ("calm precision", reference: Things), anti-references. `DESIGN.md` (root) — the visual system: "The Quiet Instrument" north star, Iris accent (#7c3aed, ≤10% per screen), violet-tinted neutral ladder, tonal elevation (no shadows at rest), DM Sans, density-as-user-knob. `.impeccable/design.json` — machine-readable sidecar (tonal ramps, component snippets). Consult these before UI work; they are normative for design decisions.

# AGENTS.md

## Stack

- Vite 8 + React 19 + TypeScript (~6), ESM. **Bun** is the package manager and runtime for
  everything app-side (`server/`, `scripts/`, Vite); the SQLite driver is `bun:sqlite`, so any
  process loading `server/db.ts` (server, scripts, Vite config, tests) MUST run under Bun.
- Linter: **oxlint** (`.oxlintrc.json`). Unit/integration: **bun test** rooted at `tests/` (no DOM
  env; stub `globalThis.window` where needed). E2E: **@playwright/test** — chromium is installed by
  the `postinstall` script; `scripts/e2e.ts` also self-heals a missing browser before each run. On
  NixOS neither happens (the downloaded build cannot execute there); the configs instead resolve the
  system chromium from PATH via `systemChromiumPath` in `e2e/infra.ts` — install it with nix
  (`chromium` in `environment.systemPackages` or `nix profile add nixpkgs#chromium`).
- Formatter: **Oxfmt** (`.oxfmtrc.json`) and `.editorconfig`; see formatting conventions below.
- No state lib — TinyBase owns the store. No router — `src/router.ts` is hand-rolled.
- Node is unpinned and only needed for Playwright/tsc/oxlint binaries. Stack versions are
  bleeding-edge; generic tutorials may target older majors.

## Commands

- **Agent port rule:** never use the default ports (`5173`, `7373`) or their URLs for any server
  invocation. Always pass an explicit, currently unused port with `--strictPort` (or equivalent) and
  use that actual port in every URL you construct. Bare `bun run dev`/`prod`/`preview` are
  prohibited; `bun run smoke` and `bun run test:e2e` satisfy the rule (their configs allocate
  non-default ports). Hardcoding ports (e.g. `5199`) is prohibited for e2e — `scripts/e2e.ts`
  allocates a free port per run (`getFreePort()`) and hands it to the Playwright configs via
  `LOCALACTION_E2E_PORT`; always go through the wrapper.
- **Agent process-kill rule:** never kill a process you didn't start — even an apparently orphaned
  server may be the user's live session. Pick another explicit non-default port or ask the user to
  stop it. Clean up processes you spawned when done.
- `bun run dev` — Vite dev + HMR + TinyBase sync WS; `scripts/dev.ts` injects `--db` (default
  `defaultDevDbPath()`, kept separate from the prod store).
- `bun run typecheck` — `tsc -b` checks both referenced projects without building assets.
- `bun run build` — `bun run typecheck` + `bun --bun vite build` +
  `bun scripts/build-localaction.ts` (daemon bundle `dist-bundle/localaction.js` with embedded
  assets); TS errors fail the build.
- `bun run lint` — Oxlint, including curated JSX accessibility correctness/keyboard checks.
- `bun run format` / `bun run format:check` — write/check Oxfmt formatting.
- `bun test` / `test:unit` / `test:integration` / `test:watch`.
- `bun run prod` — prod server (`server/index.ts`): `--port` (default 7373), `--db` (default
  `defaultProdDbPath()`). `bun run preview` — same server in preview mode (port 7474,
  `defaultPreviewDbPath()`).
- `bun run smoke` — WS sync between two TinyBase clients + SQLite persister round-trip against
  source `startServer`, on a random port/DB. `bun run smoke:bundle` — same assertions plus
  embedded-asset serving against the packaged daemon (`dist-bundle/localaction.js`); pre-push gate,
  needs a fresh `bun run build` first.
- `bun run backup-db` / `bun run benchmark-size` — online `VACUUM INTO` backup; DB size-growth
  benchmark against a throwaway store.
- `bun run test:e2e` / `:headed` / `:offline` — Playwright via `scripts/e2e.ts`: reaps orphaned e2e
  servers, verifies chromium is installed, then runs on a free port allocated per run. `:offline`
  builds first, then runs against the prod server (the SW registers only in prod builds). Extra args
  pass through (`bun scripts/e2e.ts e2e/app-boot.spec.ts --grep foo`).

## Repo layout

- Entry chain: `index.html` → `src/main.tsx` (StrictMode double-render in dev) → `src/App.tsx`.
- `src/data/` — data-layer seam (TinyBase MergeableStore, OPFS persister, WS sync,
  `DataLayerProvider`). Data APIs via `src/data/index.ts`; TinyBase UI bindings are allowed at
  consumer sites.
- `src/components/` — component tree by domain; `MainPane.tsx` dispatches routes, one branch per
  pane.
- `server/` — prod server + `bun:sqlite` handle; re-exports `attachSyncServer` so Vite dev/preview
  reuse the same WS handler.
- `scripts/` — `dev.ts` (Vite dev entry), `build-localaction.ts` (daemon bundle), `e2e.ts`
  (Playwright wrapper), `smoke.ts` (WS/SQLite round-trip), `backup-db.ts`, `benchmark-size.ts`,
  `seed-layout.ts`, `postinstall.ts` (Playwright chromium).
- `tests/` — bun-test tree rooted at `tests/`: `data/`, `markdown/`, `integration/`, plus top-level
  suites (`router`, `dates`, `syncLogFormat`, drop). `e2e/` — Playwright, one spec per user journey.
- `public/` — static assets; `dist/` (Vite) and `dist-bundle/` (daemon bundle) are build output;
  never hand-edit.
- `docs/architecture.md`, `docs/ux.md`, `docs/glossary.md` — system shape, UX, vocabulary. Trust
  code for behavior, the glossary for vocabulary.
- tsconfigs: `tsconfig.json` references two projects sharing policy in `tsconfig.base.json`.
  `tsconfig.app.json` covers all `src/` + `tests/`; `tsconfig.node.json` covers `vite.config.ts`,
  both `playwright*.config.ts`, and all `server/`, `scripts/`, and `e2e/`. The tooling project
  retains DOM/JSX/Vite types because e2e helpers import app data APIs. `@types/bun` provides
  `bun:sqlite` / `bun:test` types.

## Quirks

- React Compiler is enabled.
- TS6: shared `strict: true` and `noUncheckedIndexedAccess: true`; narrow nullable/indexed values or
  use assertions only where an invariant proves them. `verbatimModuleSyntax` (use `import type`;
  automatic JSX runtime — no `import React`), `erasableSyntaxOnly` (no enums/namespaces), keep
  `.tsx` extensions in TS imports.
- `bun run typecheck` uses project references; errors anywhere in the complete source/test/tooling
  coverage block the build. Oxlint is not type-aware.
- Every Vite invocation must be `bun --bun vite ...` — never bare `vite`. Dev (`scripts/dev.ts`)
  must also pass `--configLoader runner`: Vite's default rolldown config loader breaks `ws` upgrade
  handling under Bun. Also, Bun's `node:http` keeps upgraded WS sockets tracked, so
  `attachSyncServer.close()` destroys them from an explicit socket set or `httpServer.close()` never
  fires. Both are pinned in the scripts — do not remove.
- `bun test` shares one module registry across all files in a run — never `mock.module` app modules
  (registrations leak into later files). Inject fakes through option seams instead (e.g.
  `startSync`'s `synchronizerImpl`).
- Playwright auto-starts `bun run dev` (or `bun run prod` for the offline suite) on a **free port
  allocated per run** (by `scripts/e2e.ts`, passed to the configs as `LOCALACTION_E2E_PORT` — the
  config file is re-loaded per worker process, so the port cannot be rolled per config load;
  `reuseExistingServer: false`); tests depend on the `/ws` handshake. E2e-spawned servers arm an
  owner watchdog (`LOCALACTION_OWNER_PID` + `startOwnerWatchdog()`) that exits the server within
  ~0.5s when the Playwright runner dies, and `scripts/e2e.ts` reaps any leftovers before each run
  (registry in `tmpdir()/localaction-e2e-servers` plus a `/proc` scan for throwaway-DB argv
  markers).
- **Test DBs live in `os.tmpdir()`** — unique throwaway path per run (`e2e/test-db-path.ts` is the
  canonical helper). Never let an experimental run fall through to `defaultDevDbPath()`.
- **Real data is NEVER wiped without an explicit user prompt gate** — no deleting/overwriting user
  data SQLite files, no clearing OPFS outside throwaway browser profiles. Tmp test DBs and e2e
  profiles are exempt.

## Conventions

- Components: default-exported function components returning `React.JSX.Element` (canonical:
  `src/components/sidebar/Sidebar.tsx`). Library seams export named functions/types; only components
  default-export.
- Icons: add a `<symbol id="x-icon">` to `public/icons.svg` and reference it with `<use>`; never
  inline an existing icon.
- Styles: `src/index.css` (tokens, light/dark, density, fonts) + `src/App.css` (shell + scoped
  component rules).
- Commits: Conventional Commits — `type(scope): concise imperative description` (e.g.
  `feat(projects): add collapsible project cards`); lowercase, focused scope.
- Formatting: Oxfmt uses 100 columns and single-quoted code, without import or package-field
  sorting. Markdown prose wraps at 100 columns. Respect automatic `.gitignore` and generated-output
  exclusions. EditorConfig uses UTF-8/LF, two spaces, final newlines, and trimmed trailing
  whitespace except in Markdown, where hard-break spaces are preserved.
- Accessibility: Oxlint retains React/TypeScript/Oxc checks and adds curated JSX naming, ARIA,
  focusability, and keyboard rules, including input/textarea labels. Prefer native controls and
  explicit accessible names with meaningful keyboard paths; never add fake key handlers or suppress
  errors merely to satisfy lint. This is not blanket all-rules enforcement; intentional autofocus
  and valid widget roles are not prohibited.

### Mobile layout & touch

Behavioral rules; DESIGN.md stays normative for visual tokens.

- **Layout:** single column, 360px floor, ≤75ch measure, never horizontal scroll
  (`overflow-x: clip`). Full-height regions use `svh`/`dvh`, never `100vh`. Fixed chrome pads with
  `env(safe-area-inset-*)`. NEVER set `maximum-scale`/`user-scalable=no` — pinch-zoom is required.
- **Touch:** interactive elements ≥32px with ≥8px gaps; primary actions in the bottom thumb zone;
  `touch-action: manipulation`; immediate `:active` feedback; nothing gated behind hover; honor
  `prefers-reduced-motion` for every animation.

## Verification order

1. `bun run lint`
2. `bun run format:check`
3. `bun test`
4. `bun run build` — includes `bun run typecheck`
5. `bun run smoke:bundle` — requires the fresh build
6. `bun run test:e2e` — only when UI behavior changed

Tests exercise external behavior through the data-layer seam (typed hooks / sync protocol), never
TinyBase internals.

Versioned hooks in `scripts/githooks/` are installed by `bun install`; refresh existing copies with
`bun run setup:hooks`. Pre-commit runs lint → format check → typecheck → tests. Pre-push runs lint →
format check → tests → build (including typecheck) → bundle smoke → regular e2e, even without UI
changes. Emergency bypasses remain `git commit --no-verify` / `git push --no-verify`.

## NixOS service deploy

- Service `localaction` (`nix/module.nix` → `systemd.services.localaction`) runs flake
  `packages.x86_64-linux.localaction`. Host `nixos-server` (`/etc/nixos`), `127.0.0.1:7374` behind
  caddy, input tracks `?ref=main`.
- Workflow: `bun run deploy` (`scripts/deploy.ts`): gate (`lint`, `format:check`, `test`, `build`,
  `smoke:bundle`) → `nix build .#localaction` → commit if dirty (`git add -A`) →
  `git push forgejo main` → `nix flake update localaction` in `/etc/nixos` (push alone deploys
  nothing — the lockfile pins the rev) → `nh os switch` (no sudo — `nh` elevates) → assert the unit
  is active. `--skip-checks` skips the gate and pushes `--no-verify`; `--dry-run` prints the steps.
- Local iteration: `nh os switch --override-input localaction path:/home/joshua/repos/localaction`.
- Deps changed → derive `bunDeps.outputHash` from a source-only snapshot containing
  `git ls-files --cached --others --exclude-standard` files, then paste the got-hash from the build
  error and rebuild that snapshot. Do not derive the hash from `path:.` in a populated working tree:
  ignored `node_modules` can mask an empty dependency cache and a broken offline install.
- Verify: `systemctl status localaction`, `journalctl -u localaction --since -5min`. DB
  (`/var/lib/localaction/localaction.sqlite`, `StateDirectory`) survives rebuilds.

## Design context

`PRODUCT.md` (positioning), `DESIGN.md` (visuals, normative) — consult before UI work.

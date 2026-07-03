# AGENTS.md

## Stack
- Vite 8 + React 19 + TypeScript (~6), ESM (`"type": "module"`).
- Package manager: **pnpm** (lockfile: `pnpm-lock.yaml`). No `packageManager` pin.
- Linter: **oxlint** (not eslint). Config: `.oxlintrc.json` — `react`, `typescript`, `oxc` plugins.
- No test framework. No `test` script, no fixtures, no CI. No state lib, no router — install explicitly when needed.
- No `.nvmrc` and no `engines` field; Node version is unpinned.
- Stack versions are bleeding-edge; generic tutorials may target older majors.

## Commands
- `pnpm dev` — Vite dev server with HMR.
- `pnpm build` — runs `tsc -b` (both tsconfig projects via references) then `vite build`. TS errors fail the build.
- `pnpm lint` — `oxlint` over the workspace.
- `pnpm preview` — serve the built `dist/`.

## Repo layout
- `index.html` → `src/main.tsx` → `src/App.tsx` is the only entry chain. `main.tsx` wraps the tree in `<StrictMode>` (dev-time double render).
- `vite.config.ts` is the only file covered by `tsconfig.node.json`; everything under `src/` is covered by `tsconfig.app.json`.
- `tsconfig.app.json` includes `types: ["vite/client"]` only — `@types/node` is intentionally out of scope inside `src/`.
- `public/` holds static assets served at root: `favicon.svg` and the `icons.svg` sprite referenced via `<use href="/icons.svg#NAME-icon">` (see `src/App.tsx:38`).
- `src/assets/` holds images imported by TS (e.g. `hero.png`).
- `dist/` is build output (gitignored). Do not hand-edit.
- `README.md` is the unmodified Vite scaffold template — not project documentation. Trust `package.json` and `src/` over it.

## Quirks
- **React Compiler is enabled** via `babel-plugin-react-compiler` (see `vite.config.ts`). Per README this slows dev/build. Code must stay compiler-clean — no mutation of props/hooks patterns the compiler cannot reason about.
- TS is configured with `verbatimModuleSyntax`, `erasableSyntaxOnly`, `allowImportingTsExtensions`, `moduleResolution: bundler`. Use `import type` for type-only imports; keep `.tsx` extensions in TS imports (e.g. `src/main.tsx:4`).
- `verbatimModuleSyntax` also means no `import React from 'react'` — rely on the automatic JSX runtime (`jsx: "react-jsx"`).
- `erasableSyntaxOnly` forbids enums and namespaces.
- `tsc -b` uses project references, so TS errors in `vite.config.ts` block the build even though it's not under `src/`.

## Conventions
- Components are default-exported function components (see `src/App.tsx`).
- Icons: prefer adding a new `<symbol id="x-icon">` to `public/icons.svg` and referencing it with `<use href="/icons.svg#x-icon" />`.
- Styles: `src/index.css` (global tokens, light/dark), `src/App.css` (component scopes).
- Lint rules in force: `react/rules-of-hooks` (error), `react/only-export-components` (warn, allows constant exports). Type-aware mode is **not** enabled (`oxlint-tsgolint` not installed).

## Verification order for changes
1. `pnpm lint`
2. `pnpm build` (covers TS typecheck of both projects + bundle)

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature>/`. No external PRs as a triage surface (no remote configured). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at root + `docs/adr/`. See `docs/agents/domain.md`.


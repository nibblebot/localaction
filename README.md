# LocalAction

**Offline-first, self-hosted task manager with multi-device sync.**

Perists work locally for offline use and syncs w/ server for automatic conflict resolution.

OPFS storage in browser, websocket sync and SQLite persistence on the server. 

Intended for multi-device use with no authorization logic.

<!-- gif loop and images -->

## Features

### UX

- **Areas** — ongoing spheres of responsibility, with recursive sub-areas as deep as you need.
- **Projects** — bounded goals inside areas, grouped Active/Backlog/Done; Done is derived from task completion, never stored.
- **Sections** — group tasks within a project.
- **Tasks** — arbitrarily nested sub-tasks.
- **Drag and Drop Trees**: reorder, nest, and unnest in one flattened drag surface.
- **Inbox / Today / Week views** with recursive open-task rollups across area subtrees.
- **Themes** (light/dark/system), five fonts, three densities; per-device view state stays out of sync.

## Data sync & persistence

- **Offline-first.** The entire app runs against an in-browser store persisted to OPFS — no account, no login, works without a network.
- **Self-hosted.** The entire backend is a single Bun process — static files, WebSocket sync, and one SQLite DB file. Nothing else to deploy, and your data never leaves machines you control.
- **Multi-device sync.** Clients converge over WebSocket via CRDT-style merge (per-cell HLC timestamps, last-writer-wins) — no conflict dialogs. A sidebar badge shows sync state (Local only → Syncing… → Synced).


The client keeps all state in a [TinyBase](https://tinybase.org/) **MergeableStore** persisted to OPFS in the browser. A `WsSynchronizer` merges it with the server's authoritative SQLite copy, so edits on multiple devices converge automatically. The same sync handler serves dev and prod.

```text
Browser                        Server                            Browser
┌────────────────────┐         ┌───────────────────────────┐       ┌────────────────────┐
│ React SPA          │         │ static file server        │       │ React SPA          │
│ MergeableStore ◄───┼── /ws ──┤► sync (createWsServer)   ◄┼─ /ws ─┼──► MergeableStore  │
│ OPFS persister     │         │ persist (SQLite)          │       │ OPFS persister     │
└────────────────────┘         └───────────────────────────┘       └────────────────────┘
```

## Quick start

Requires [Bun](https://bun.sh/) (package manager *and* runtime — the server uses `bun:sqlite`).

```bash
bun install
bun run dev     # Vite dev server + sync WS (http://localhost:5173)
```

Production:

```bash
bun run build
bun run start   # port 7373, SQLite in the platform user-data dir
```

`bun run start` accepts `--port <n>` and `--db <path>`; `--help` prints defaults.

**Multi-device sync:** run `bun run start` on a reachable host and point every client at that host. No auth at the moment.

## Stack & testing

- Vite 8 · React 19 (Compiler) · TypeScript · TinyBase 9 · SQLite (`bun:sqlite`) · `ws` · dnd-kit · markdown-it
- `bun test` — unit + integration suites; `bun run smoke` — WS/SQLite round-trip; Playwright e2e (`bun run test:e2e`)

## Docs

- [`docs/architecture.md`](docs/architecture.md) — client/server/sync/data model, runtime modes, testing strategy
- [`docs/ux.md`](docs/ux.md) — shell, navigation, views, appearance, interaction patterns
- [`docs/glossary.md`](docs/glossary.md) — domain vocabulary (areas, projects, sections, tasks, notes…)
- [`PRODUCT.md`](PRODUCT.md) / [`DESIGN.md`](DESIGN.md) — positioning and the visual system

## License

AGPL-3.0-or-later

# LocalAction

**A calm, self-owned place for everything that matters.**

LocalAction is an offline-first personal productivity app with genuine GTD depth — areas, sub-areas, projects, sections, nested sub-tasks, and notes — backed by storage you actually own: SQLite on your disk, OPFS in your browser, and a sync server you run yourself.

<!-- TODO: hero demo — add a short screen recording of the core loop:
     create an area → add a project → drag tasks → watch the sync badge flip to Synced -->

## Why LocalAction

Most productivity tools make you choose: serious structure **or** data ownership. LocalAction refuses the trade.

| | Typical SaaS tools | Local-first notes apps | **LocalAction** |
| --- | --- | --- | --- |
| Works fully offline | ✗ | ✓ | ✓ |
| Data you own (SQLite file, no export dance) | ✗ | ✓ | ✓ |
| Multi-device sync you run yourself | — | partial | ✓ |
| GTD depth (areas → projects → sections → sub-tasks) | partial | ✗ | ✓ |
| Live rollups across deep trees | ✗ | ✗ | ✓ |

- **Offline-first by construction.** The entire app runs against an in-browser MergeableStore persisted to OPFS. No network, no account, no login wall — open the tab and work.
- **Multi-device sync you self-host.** A small Bun server holds the authoritative SQLite copy and converges every connected client over WebSocket via CRDT-style merge (per-cell HLC timestamps, last-writer-wins). No conflict dialogs, no manual merges — edit on two devices and they converge.
- **Real GTD structure.** Ongoing *areas* with recursive *sub-areas*, bounded *projects* grouped Active/Backlog/Done, *sections* inside projects, and tasks that nest as deep as you need. Markdown notes attach at every level.
- **Depth that stays legible.** Recursive open-task counts on every sidebar row, rollups across whole area subtrees, and a Today/Week view that groups due work by area — deep structure, readable at a glance.
- **Sync you can see.** The sidebar's sync badge (*Local only → Syncing… → Synced*) makes ownership legible instead of hidden. Local-first is a feature, not an implementation detail.
- **Calm precision.** One accent color, quiet surfaces, instant interaction feedback — designed for solo power users who live in the tool all day. Full keyboard support, drag-anywhere trees, `Shift+A` quick-add.

## Feature tour

<!-- TODO: one short clip per flow below; see "Showcasing demos" notes or docs/assets/ -->
- **Drag-anywhere trees** — reorder, nest, and unnest areas and tasks in one flattened drag surface; horizontal drag intent reparents.
- **Inbox / Today / Week** — unassociated tasks land in the Inbox; due work groups under area headings with collapsible Overdue and Done sections.
- **Projects with real states** — drag a project to Backlog to shelve it; Done is derived from task completion (every task done), never stored — an empty project stays Active.
- **Markdown notes everywhere** — attach notes to areas, projects, or tasks; area views roll up every note in the subtree.
- **Your workspace, your way** — light/dark/system themes, five fonts, three densities; per-device view state that never pollutes sync.

## Quick start

Requires [Bun](https://bun.sh/) — the package manager *and* the runtime (the server and all scripts run on Bun's built-in SQLite driver).

```bash
bun install
bun run dev     # Vite dev server + sync WS (http://localhost:5173)
```

Production:

```bash
bun run build
bun run start
```

Without flags, `bun run start` listens on port 7373 and stores its SQLite file in the platform user-data dir (e.g. `~/.local/share/localaction/data-prod.db` on Linux). Pass `--port <n>` and `--db <path>` to override either; `--help` prints the defaults.

Sync between devices: run `bun run start` on a machine reachable from your other devices, set `LOCALACTION_SYNC_SECRET` on the server (and `VITE_LOCALACTION_SYNC_SECRET` for the client build), and point every client at the same host. An empty secret means open access on your network.

## How it works

The client is a single-page React 19 app whose state lives in a [TinyBase](https://tinybase.org/) **MergeableStore**, persisted locally to OPFS. A `WsSynchronizer` keeps it convergent with a Bun server that holds the authoritative SQLite copy — the same sync handler serves dev, preview, and prod, so behavior never drifts between modes.

```text
Browser                          Server
┌───────────────────────┐        ┌────────────────────────┐
│ React 19 (Compiler)   │        │ static file server     │
│ MergeableStore  ◄─────┼── WS ──┼► createWsServer        │
│ OPFS persister        │  /ws   │ SQLite persister       │
└───────────────────────┘        └────────────────────────┘
```

- **Stack:** Vite 8 · React 19 (Compiler enabled) · TypeScript · TinyBase 9 · SQLite (`bun:sqlite`) · `ws` · dnd-kit · markdown-it
- **Tooling:** Bun (package manager + runtime) · oxlint · Playwright
- **Testing:** `bun test` (data-layer, markdown, and router unit suites + Node integration against the real server), Playwright e2e, a WS/SQLite smoke script (`bun run smoke`)

## Docs

- [`docs/architecture.md`](docs/architecture.md) — client/server/sync/data model, runtime modes, testing strategy
- [`docs/ux.md`](docs/ux.md) — shell, navigation, views, appearance, interaction patterns
- [`docs/glossary.md`](docs/glossary.md) — domain vocabulary (areas, projects, sections, tasks, notes…)
- [`PRODUCT.md`](PRODUCT.md) / [`DESIGN.md`](DESIGN.md) — positioning and the visual system

## License

<!-- TODO: pick a license before making the repo public -->
TBD

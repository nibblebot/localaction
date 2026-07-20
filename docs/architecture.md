# Architecture

High-level system shape for LocalAction: client, server, sync, and data model.
For the user-facing experience, see [`ux.md`](./ux.md). For domain vocabulary,
see [`glossary.md`](./glossary.md).

## At a glance

LocalAction is a single-page React app whose state lives in an in-browser
[TinyBase](https://tinybase.org/) **MergeableStore**. The same store is
persisted locally (OPFS) **and** kept in sync over a WebSocket with a small
Node server that holds the authoritative SQLite copy. Three runtime modes —
Vite dev, Vite preview, and the prod server (`tsx server/index.ts`) — all share one sync handler
so behaviour never drifts between them.

**Person facet.** Every entity (Area, Project, Task) carries an M:N set of
Persons — a crosscutting facet orthogonal to the Area trie. The app's own
user is the distinguished `Self` Person. See
[glossary.md](./glossary.md#person) for the vocabulary and
[§ Data model](#data-model) for the storage shape.

```mermaid
  subgraph Browser["Browser (client)"]
    UI["React 19 app\n(Sidebar / MainPane)"]
    Store[("MergeableStore\n(in-memory)")]
    OPFS[("OPFS\nlocalaction.json")]
    SyncC["WsSynchronizer\n(client)"]
    UI --> Store
    Store <--> OPFS
    Store <--> SyncC
  end
  subgraph Server["Server (Node)"]
    WS["WebSocketServer\n/ws"]
    Tiny["createWsServer\n(per-pathId store)"]
    SQLite[("SQLite\nsqlite3 (npm)")]
    Static["Static file server\n(dist/, SPA fallback)"]
    WS --> Tiny
    Tiny <--> SQLite
  end
  SyncC <-. WebSocket .-> WS
```

## Entry chain & provider stack

`index.html` → `src/main.tsx` → `src/App.tsx` is the only entry. `main.tsx`
renders `<App />` inside `<StrictMode>` (dev-time double render — every
singleton below is engineered to survive it).

`App.tsx` wraps the tree in a fixed provider order (outer → inner):

1. `tinybase/ui-react` **`Provider store={store}`** — binds the React reconciler
   to the store so `useRow` / `useRowIds` / `useTables` subscriptions fire.
2. `AppearanceProvider` — theme / font / density (see [ux.md](./ux.md)).
3. `DataLayerProvider` — boots persistence + sync, exposes them via context.
4. `SelectionProvider` — the current hash-route selection + `navigate()`.

Inside sit the shell: `Sidebar`, `MainPane`, the dev-only TinyBase `Inspector`,
and `AppearanceMenu`.

## Data layer (`src/data/`)

The seam between React and TinyBase. Everything is re-exported from
`src/data/index.ts`; consumers never import TinyBase primitives for entity data
(except the allowed `tinybase/ui-react*` hooks and `Inspector`).

- **Store** — `store.ts` holds a process-wide `createMergeableStore()` singleton
  (`getStore()`). A MergeableStore tracks per-cell HLC timestamps, which is what
  makes conflict-free sync possible.
- **Schema** — `schema.ts` defines eight tables and their column keys as
  `const` maps (`TABLES`, `COLUMNS`), plus the `TASK_STATUS` (`open` / `done`),
  `NOTE_ENTITY_TYPE` (`area` / `project` / `task`), and
  `TOMBSTONE_ENTITY_TYPE` (those three + `section`) enums-as-objects, and
  the `SELF_PERSON_ID` literal (`"self"`).
- **CRUD + hooks** — one module per entity (`areas.ts`, `projects.ts`,
  `sections.ts`, `tasks.ts`, `notes.ts`, `persons.ts`, `personLinks.ts`). Each exposes
  imperative mutators/readers (`createX` / `updateX` / `deleteX` / `getX`)
  **and** a React hook (`useX`) built on `tinybase/ui-react`'s
  `useRow` / `useRowIds`. IDs are `crypto.randomUUID()` except for the
  `Self` row which uses the fixed literal `"self"` (idempotent bootstrap
  in `DataLayerProvider`); timestamps are ISO 8601.
- **Selectors** — `selectors.ts` derives rollups (`useAreaCounts`,
  `useProjectRollups`, `useNotesForAreaTree`). Each `get*` takes an optional
  `_version` dependency token so React Compiler can memoise the derived output.
  `personSelectors.ts` derives the people of any entity
  (`{Self} ∪ (storedSet ∩ persons_present)` — the read-time presence
  intersection is what makes deletion non-destructive and revivable).
  `personFilter.ts`
  exposes `areaHasMatch` + `useDimmedAreaIds` for the sidebar filter dim.
- **Ordering** — `order.ts` (see [Ordering](#ordering) below).
- **Helpers** — `colors.ts` (the area palette), `slug.ts` (note slugs),
  `internal.ts` (`newId`, `nowIso`, `row`, `useStoreVersion`).

### Data model

```mermaid
erDiagram
  areas ||--o{ areas : "parentId (self-ref tree)"
  areas ||--o{ projects : "areaId"
  areas ||--o{ notes : "entityType=area"
  projects ||--o{ sections : "projectId"
  projects ||--o{ tasks : "placement=project:<id>"
  sections ||--o{ tasks : "placement=section:<id>"
  projects ||--o{ notes : "entityType=project"
  tasks ||--o{ tasks : "placement=task:<id> (self-ref)"
  tasks ||--o{ notes : "entityType=task"
  areas { string id PK }
  areas { string name }
  areas { string parentId FK "nullable; null = top-level" }
  areas { string color "AreaColorId" }
  areas { float order }
  projects { string id PK }
  projects { string areaId FK "nullable" }
  projects { string dueDate "optional; YYYY-MM-DD" }
  projects { float order }
  sections { string id PK }
  sections { string name }
  sections { string projectId FK }
  sections { float order }
  tasks { string id PK }
  tasks { string title }
  tasks { string placement "project:<id>|section:<id>|area:<id>|task:<id>; absent = Inbox" }
  tasks { string status "open|done" }
  tasks { string dueDate "optional; YYYY-MM-DD" }
  tasks { float order }
  notes { string id PK }
  notes { string slug }
  notes { string title }
  notes { string body "markdown" }
  notes { string entityType "area|project|task" }
  notes { string entityId FK "polymorphic" }
  persons { string id PK "literal 'self' for Self" }
  persons { string name }
  persons { string color "free hex" }
  person_links { string id PK "composite: {type}:{id}:{personId}" }
  person_links { string personId FK "never Self" }
  person_links { string entityType "area|project|task" }
  person_links { string entityId FK "polymorphic" }
  areas ||--o{ person_links : "entityType=area"
  projects ||--o{ person_links : "entityType=project"
  tasks ||--o{ person_links : "entityType=task"
  persons ||--o{ person_links : "personId"
```

- **Note** — markdown body attached to exactly one entity via the
  (`entityType`, `entityId`) pair, addressed by `slug`.
- **Person** — first-class entity; id is the literal `"self"` for the
  app's own user, otherwise a UUID. Carries a `name` and a free-hex
  `color`. The avatar is derived from the name (no stored column).
- **person_links** — polymorphic link table mirroring `notes`. One
  row per non-Self membership, row id `${entityType}:${entityId}:${personId}`
  (deterministic composite so two devices adding the same person
  converge to one row). Self is never stored; it is force-unioned at
  read time. The people of any entity are derived at read time as
  `{Self} ∪ (storedSet ∩ persons_present)` — each entity's set stands
  alone (no inheritance or narrowing), and a deleted person drops out
  of every association without mutating the stored rows.
  No `order`, no timestamp cells on links (HLC carries the merge metadata).
### Ordering

Drag-to-reorder spans the whole tree: one flattened `SortableTree`
(dnd-kit) derives a `(parent, before)` drop from vertical position plus
horizontal (nest/unnest) intent, and the move helpers write parent +
order in one transaction. Each ordered table (`areas`, `projects`,
`sections`, `tasks`) has an `order` key. `order.ts`:

- Appends new rows at `lastSiblingOrder + 1000`.
- On a drag, `computeInsertOrder` takes the midpoint between neighbours; when
  the gap drops below `MIN_GAP` the whole sibling group is **renormalised** to
  evenly-spaced integers from `RENORMALIZE_SPACING` (1000), in one transaction.
- `backfillOrder()` seeds missing `order` cells (from `idHash(id)` + timestamps)
  on boot — idempotent, run after OPFS loads.
- Move helpers (`moveArea` / `moveTask` / `moveSection`) reorder within a
  sibling group AND (areas/tasks) reparent in a single write (parent cell +
  `order` + `updatedAt`). Both refuse moves that would create a cycle (a
  row under itself or one of its own descendants) or target a missing
  parent. `moveSection` and `reorderProject` stay sibling-scoped
  (sections never leave their project; projects have no tree UI).

## Persistence

Two independent persisters bracket the same in-memory store:

- **Client (OPFS)** — `persistence.ts` uses
  `tinybase/persisters/persister-browser`'s `createOpfsPersister` against
  `localaction.json` in the origin's OPFS directory. On boot it `load()`s the
  snapshot, runs `backfillOrder()`, then `startAutoSave()`s. If OPFS / the File
  System Access API is unavailable, persistence is disabled (warned, non-fatal).
- **Server (SQLite)** — `server/db.ts` opens a connection via the `sqlite3` npm
  package and hands it straight to TinyBase's `createSqlite3Persister` — the
  package already exposes the `sqlite3#Database`-shaped API
  (`all`/`get`/`run`/`exec`/`close` plus the `EventEmitter` listener surface)
  the persister expects. One DB connection is shared process-wide (see
  `server/index.ts`). Loaded via `createRequire` in `db.ts` because `sqlite3`
  is CommonJS-only under our `verbatimModuleSyntax` config.

## Sync

TinyBase's `synchronizer-ws` keeps every connected store convergent via the
HLC metadata in the MergeableStore — last-writer-wins per cell, no manual
conflict code.

```mermaid
sequenceDiagram
  participant C as Client (WsSynchronizer)
  participant H as HTTP server
  participant T as createWsServer
  participant DB as SQLite persister
  C->>H: WS upgrade /ws?secret=…
  H->>T: handleUpgrade (pathId)
  T->>DB: createMergeableStore() + persister(store, db)
  loop until convergence
    C-->>T: store deltas
    T-->>DB: persist
    T-->>C: store deltas
  end
```

- **Client** — `sync.ts` builds a `SyncClient` (a module singleton via
  `getSyncClient()`). `createWsSynchronizer(store, ws)` connects to
  `${ws|wss}://<host>/ws`. It is **StrictMode-safe**: the singleton is created
  once and is *not* destroyed on the fake unmount — only on `beforeunload`
  (`destroySyncClient`). Reconnect uses exponential backoff, 500 ms base →
  15 s cap. Status is a discriminated union surfaced through `SyncStatusBadge`.
- **Server** — `attachSyncServer` (in `server/index.ts`) creates a
  `WebSocketServer({ noServer: true })` and hands it to TinyBase's
  `createWsServer` with a persister factory: for each incoming `pathId` it makes
  a fresh `MergeableStore` + `createSqlite3Persister(store, db)` over the shared
  connection. The HTTP `upgrade` event only claims `/ws` (so Vite's HMR socket
  is left alone).
- **Secret gate** — `LOCALACTION_SYNC_SECRET` (server, env or `--secret`)
  checked against the `?secret=` query param. The client sends it from
  `VITE_LOCALACTION_SYNC_SECRET`. An empty secret = open (warned in the log).

## Server (`server/`)

One unified server serves both static assets and the sync socket:

- `createStaticFileServer(dist)` — reads files from `dist/`, with an SPA
  fallback to `index.html`, a path-traversal guard (`..` / `\0` rejected,
  `target.startsWith(root)` enforced), and a `426` short-response for `/ws`
  over plain HTTP. MIME lookup from a small allow-list; `cache-control: no-cache`.
- `attachSyncServer(httpServer, opts)` — the sync handler above. Reused by every
  runtime mode so there is one source of truth.
- `startServer(opts)` — wires static + sync onto one `http.Server` and listens.

**Three entrypoints, one handler:**

| Mode | Command | Sync wired by |
| --- | --- | --- |
| dev | `pnpm dev` (`scripts/dev.ts` → `vite`) | `vite.config.ts` plugin → `configureServer` |
| preview | `pnpm preview` | same plugin → `configurePreviewServer` |
| prod | `pnpm start` (`tsx server/index.ts`) | `startServer` directly (module `isMain`) |

Flag precedence by mode:
- prod (`pnpm start`): `--port` > `5173`; `--db` > `./data/data.db`.
- dev (`pnpm dev`): `--db <path>` is moved past Vite's `--` separator by `scripts/dev.ts` and read from `argv` by `vite.config.ts`; `--port` is Vite-native (the WS rides on that HTTP port).
- preview (`pnpm preview`): `--db <path>` works via the `--` escape (e.g. `pnpm preview -- --db X`); `--port` is Vite-native.

## Build & toolchain

- `pnpm build` = `tsc -b` (project references: `tsconfig.app.json` for
  `src/` + `tests/`, `tsconfig.node.json` for config files) then `vite build`.
  TS errors anywhere — including config files — fail the build.
- **React Compiler** is on (`babel-plugin-react-compiler` via
  `@rolldown/plugin-babel`); code must stay compiler-clean.
- TS quirks: `verbatimModuleSyntax` (use `import type`, no default React
- `moduleResolution: bundler`. For CJS-only packages (e.g. `sqlite3`) loaded
  from Node TS, use `node:module`'s `createRequire(import.meta.url)` — preserves
  `verbatimModuleSyntax` and avoids default-import surprise.
- Everything runs under Node; `.ts` in `scripts/` and `server/` is run by
  `tsx` (a devDependency). `vite` is invoked directly.

## Testing strategy

Runners split by environment, not by tool. vitest drives all suites; the
integration suite opts in to a Node environment via per-file pragma.

- **vitest** — `tests/data/` (data-layer unit suite), `tests/markdown/`,
  `tests/router.test.ts`, and any `src/**/*.test.{ts,tsx}` run in jsdom.
- **vitest (`@vitest-environment node`)** — `tests/integration/sync-roundtrip.test.ts`:
  a real two-client ↔ one-server WebSocket round-trip with the shared SQLite
  connection.
- **Playwright** (`e2e/`) — one spec per user journey; auto-starts `pnpm dev`
  on a non-default port (`5180`) so a manual `pnpm dev` session on `5173` can run in parallel; depends on the `/ws` handshake.
- **`scripts/smoke.ts`** — boots the prod server on a random port and asserts
  WS sync between two clients plus a SQLite persistence round-trip.

Tests exercise the data-layer seam (typed hooks + sync protocol), never TinyBase
internals.

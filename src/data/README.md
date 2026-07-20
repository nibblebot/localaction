# `src/data/` — the data-layer seam

The rest of the app reads and writes entities through this folder. Nothing
under `src/components/` should `import 'tinybase'` directly — that's the
discipline this seam enforces.

## What lives here

| File                    | Purpose                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `schema.ts`             | Table / column / value-name constants. Single source of truth for shapes. |
| `store.ts`              | The lazy singleton `MergeableStore`.                                       |
| `persistence.ts`        | OPFS persister (origin private file system) — runs in the browser.          |
| `sync.ts`               | WebSocket synchroniser + reconnect loop with status stream.                |
| `DataLayerProvider.tsx` | React context that wires the above together and exposes `useDataLayer()`. |
| `index.ts`              | Public surface re-exported by callers.                                     |

## Architectural decisions

- **ADR-0001** (`docs/adr/0001-tinybase.md`) — TinyBase powers the store,
  persistence and sync client, with a self-hosted Node sync server behind a
  single WebSocket endpoint.
- **ADR-0002** (`docs/adr/0002-row-level-lww.md`) — Conflict resolution is
  row-level last-write-wins, which is what the `MergeableStore` + sync protocol
  do out of the box.
- **ADR-0003** (`docs/adr/0003-opfs-persister.md`) — Client persistence uses
  TinyBase's built-in OPFS persister (sync-compatible), replacing a hand-rolled
  IndexedDB custom persister.

## Lifecycle

1. App boots → `main.tsx` mounts `<DataLayerProvider>`.
2. Provider's effect starts the IndexedDB persister and the WebSocket synchroniser.
3. Children call `useDataLayer()` to read the store / status.
4. CRUD hooks (added in later issues, e.g. `useAreas`, `createArea`) live in
   sibling files and re-export from `index.ts`.

## Server counterpart

`server/index.ts` is the matching Node process. In dev, Vite attaches its own
WS handler to the same Vite middleware via `configureServer`. In prod, the
same Node server serves `dist/` and upgrades `/ws`. SQLite persistence is
mirrored from the server side, so two devices converge through TinyBase's
sync protocol.

## Schema versioning

There are no row migrations (ADR-0001 clean cutover). `SCHEMA_VERSION`
(currently 3) is stamped into the store as a value; on load,
`reconcileSchemaVersion` wipes every table when the stored version
differs. When the schema evolves:

1. Bump `SCHEMA_VERSION`.
2. Update `TABLES` / `COLUMNS` for the new shape.
3. Existing persisted stores (OPFS + server SQLite) are wiped on next load.

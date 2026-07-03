# ADR-0001: TinyBase for local-first storage and sync

## Status

Accepted.

## Context

We need a local-first stack that gives us: a reactive in-memory store, IndexedDB persistence in the browser, multi-device sync, and minimal infrastructure on the server side. The sync server should be small — ideally a single Node process with nothing else to manage.

Options considered:

- **TinyBase v4+** — row-store with a sync protocol; ships an IndexedDB persister; sync server runs in any Node host. Reactive via `useStore` / `useRow` / `useTable`. Last-write-wins per cell.
- **RxDB** — richer conflict handlers; bigger bundle; more licensing complexity.
- **PowerSync** — SQL-first sync; great when you anticipate complex queries; heavyweight infra dependency.
- **Electric SQL** — SQL-first sync at the row level; pairs well with Postgres as the source of truth.

## Decision

TinyBase for the client and sync layer, with a self-hosted Node sync server that persists to a single SQLite file.

## Consequences

- (+) Tiny dep footprint; no SaaS dependency; batteries-included sync protocol.
- (+) Reactive API plays well with React (`useStore`, `useRow`, `useTable`).
- (−) Conflicts merge last-write-wins per cell — no field-level CRDT merging. For a single-user personal app this is acceptable.
- (−) Row-oriented store: complex joins across entities are awkward. Mitigated by keeping all entity reads inside `src/data/` (the single seam).
- (−) Sync protocol is TinyBase-specific. Migrating later means re-implementing the sync shim behind the data layer.

## Notes

If we ever want SQL-first sync, the data layer's interface is the seam to swap. Hide TinyBase from the rest of the app.

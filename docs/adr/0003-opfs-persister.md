# ADR-0003: OPFS persister for client persistence (replacing hand-rolled IndexedDB)

## Status

Accepted.

## Context

`ADR-0001` chose TinyBase for the client store, persistence, and sync. The
client store is a `MergeableStore` because the TinyBase sync protocol only
runs against mergeable stores (`ADR-0002`).

The persistence layer has a constraint:

- TinyBase's built-in `createIndexedDbPersister` is documented as **Store
  only** — it does not understand the mergeable-content (HLC-tagged) shape
  that `MergeableStore` produces. Persisting a `MergeableStore` through it
  loses HLC metadata and silently corrupts sync.
- To work around that, `src/data/persistence.ts` previously hand-rolled a
  `createCustomPersister` that flipped `Persists.StoreOrMergeableStore` (3)
  and wrote the whole `getMergeableContent()` blob into a single IndexedDB
  key. That worked, but:
  - It reimplemented what TinyBase now ships.
  - It only ever called `startAutoSave()`. The persisted blob was never
    reloaded on boot — rehydration depended entirely on the sync server
    (see the old comment in `git log -- src/data/persistence.ts`).

As of TinyBase v6.7.0, `tinybase/persisters/persister-browser` ships
`createOpfsPersister`, which:

- Is documented to support both `Store` and `MergeableStore` (`Persists.StoreOrMergeableStore`).
- Persists to the **origin private file system (OPFS)** — a sandboxed,
  per-origin file area exposed by the File System Access API
  (`navigator.storage.getDirectory()`).
- Handles the mergeable-content JSON shape itself, so sync + persistence
  compose cleanly.

Options considered:

- **Keep the custom IndexedDB persister** and add a `load()` call. Works,
  but maintains a bespoke blob and blocks no longer-needed complexity in
  the seam.
- **Switch to `createOpfsPersister`** (chosen). Official, sync-compatible,
  smaller seam, and fixes the never-rehydrate bug for free.

## Decision

Use `createOpfsPersister` from `tinybase/persisters/persister-browser`
against a single OPFS file, `OPFS_FILE_NAME = 'localaction.json'`. On boot
the data-layer provider awaits `persister.load()` (rehydrating from disk
before first paint-relevant reads) and then starts `startAutoSave()`.

We deliberately do **not** call `startAutoPersist()` / `startAutoLoad()`
(which would wire a `FileSystemObserver` for live cross-tab reactivity).
The observer is Chromium 134+ only and adds risk for marginal benefit in a
single-user app. Single-tab reload persistence — the property tests care
about — is fully covered by the explicit `load()` + `startAutoSave()`
pair. Cross-device convergence remains the job of the sync server.

If the File System Access API or OPFS is unavailable (private mode, ancient
browser, SSR/Node), `startLocalPersistence` rejects with a clear message;
the provider keeps `persistenceReady=false` and the app still runs against
the in-memory store.

## Consequences

- (+) Single officially-supported persistence path that composes with sync.
- (+) Rehydration on boot — fixes the pre-existing never-load bug; a tab
  now sees its own prior offline writes even before the WS handshake lands.
- (+) Smaller seam: the bespoke IDB helpers and the `Persists` literal pin
  go away.
- (−) OPFS is Chromium-recognised but not universal (older Safari, private
  mode). Mitigated by the graceful-degradation fallback above.
- (−) Tests/automation that want to inspect persistence must use a real
  browser context (Playwright), since OPFS is not polyfilled in jsdom. The
  new `e2e/opfs-persistence.spec.ts` covers this.
- (−) Cross-tab live reactivity is not provided out of the box; if it
  becomes needed later, wire `startAutoPersist()` behind a feature flag.

## Notes

The dev-only `window.__LOCALACTION` hook (see `DataLayerProvider.tsx`)
exists so Playwright can read/write the live `MergeableStore` from
`page.evaluate` without going through unbuilt UI. It is gated on
`import.meta.env.DEV` and is inert in production builds.
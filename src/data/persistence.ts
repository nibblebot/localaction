/**
 * Browser-side persistence for the local-first store, using TinyBase's
 * built-in OPFS persister.
 *
 * ## Why OPFS
 *
 * TinyBase's IndexedDB persister (`createIndexedDbPersister`) does **not**
 * support `MergeableStore`, and `MergeableStore` is what the sync protocol
 * requires (see ADR-0001, ADR-0003). Before this file existed we hand-rolled
 * a `createCustomPersister` that shunted the JSON into a single IndexedDB
 * key; that worked but reimplemented what TinyBase now ships, and it never
 * rehydrated on boot — the persisted blob was written by `startAutoSave`
 * but `load()` was never called, so rehydration relied entirely on the
 * sync server.
 *
 * `createOpfsPersister` (from `tinybase/persisters/persister-browser`, since
 * v6.7.0) officially supports both `Store` and `MergeableStore` and writes
 * to the **origin private file system** — a sandboxed, sync-compatible
 * per-origin file area exposed by the File System Access API. We now:
 *
 *   1. Resolve the OPFS directory and a file handle for `OPFS_FILE_NAME`.
 *   2. Build the persister against the singleton `MergeableStore`.
 *   3. `await persister.load()` so a newly-booted tab rehydrates from disk
 *      immediately (fixes the pre-OPFS never-load bug).
 *   4. `startAutoSave()` so subsequent writes are persisted asynchronously.
 *
 * We do **not** call `startAutoLoad()` / `startAutoPersist()` (which would
 * register a `FileSystemObserver` for live cross-tab reactivity). The
 * observer is Chromium 134+ only and adds risk; single-tab reload
 * persistence — the property tests care about — is fully covered by the
 * explicit `load()` + `startAutoSave()` pair. Cross-device convergence stays
 * the job of the sync server (see `sync.ts`).
 *
 * If the File System Access API or OPFS is unavailable (private mode, ancient
 * browser, Node), `startLocalPersistence` rejects with a clear message; the
 * `DataLayerProvider` keeps `persistenceReady=false` and the app still runs
 * against the in-memory store.
 *
 * See `https://tinybase.org/api/persisters/persister-browser/functions/creation/createopfspersister/`.
 */

import { createOpfsPersister } from 'tinybase/persisters/persister-browser';
import type { OpfsPersister } from 'tinybase/persisters/persister-browser';
import { getStore } from './store.ts';

export const OPFS_FILE_NAME = 'localaction.json';

const onError = (err: unknown): void => {
  console.warn('[localaction] OPFS persister ignored error', err);
};

let started: Promise<OpfsPersister> | undefined;

/**
 * Start browser-side persistence. Idempotent: the first caller wins and
 * subsequent callers await the same in-flight promise.
 *
 * Resolves with the persister once the store has been rehydrated from disk
 * and autosave is running. The caller (the data-layer provider) treats
 * resolution as "persistenceReady".
 */
export function startLocalPersistence(): Promise<OpfsPersister> {
  if (started) return started;
  started = (async () => {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
      throw new Error(
        'OPFS / File System Access API unavailable — persistence disabled',
      );
    }
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(OPFS_FILE_NAME, { create: true });
    const persister = createOpfsPersister(getStore(), handle, onError);
    await persister.load();
    void persister.startAutoSave();
    return persister;
  })();
  return started;
}
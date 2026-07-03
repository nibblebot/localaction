/**
 * Browser-side persistence for the local-first store.
 *
 * TinyBase's built-in IndexedDbPersister does not support MergeableStore (and
 * MergeableStore is what we use for sync — see ADR-0002). We hand-roll a
 * tiny one based on `createCustomPersister` instead. It serialises the
 * MergeableStore's content (which includes HLC metadata) to JSON and stores
 * the blob in a single key in IndexedDB.
 *
 * We don't wire `addPersisterListener` because no other writer mutates this
 * database: saves happen reactively via `startAutoSave`, and `load()` is
 * called explicitly on boot. If we ever want a second tab on the same origin
 * to react to the first tab's writes, we'd add a BroadcastChannel listener
 * here. Cross-device sync still goes through the server.
 *
 * `createCustomPersister` is a stable public API. See
 * https://tinybase.org/api/persisters/functions/creation/createcustompersister/
 */

import { createCustomPersister } from 'tinybase/persisters';
import { getStore } from './store.ts';

export const INDEXED_DB_NAME = 'localaction';
const DATA_OBJECT_STORE = 'data';
const DATA_KEY = 'mergeableContent';

/**
 * Number value understood by `createCustomPersister` to mean "supports both
 * Store and MergeableStore" — TinyBase's `Persists.StoreOrMergeableStore`
 * constant. We can't import that as a `const enum` under
 * `verbatimModuleSyntax` (`erasableSyntaxOnly`), so we pin the literal here
 * with a runtime assertion at startup.
 */
const PERSISTS_STORE_OR_MERGEABLE = 3;

let started: ReturnType<typeof createMergeablePersister> | undefined;

export function startLocalPersistence(): ReturnType<typeof createMergeablePersister> {
  if (started) return started;
  started = createMergeablePersister();
  void started.startAutoSave();
  return started;
}

function createMergeablePersister() {
  return createCustomPersister(
    getStore(),
    async () => {
      const raw = await idbGet<unknown>(INDEXED_DB_NAME, DATA_KEY);
      if (raw == null) return undefined;
      try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (err) {
        console.warn('[localaction] persisted content is corrupt — ignoring', err);
        return undefined;
      }
    },
    async (getContent) => {
      const content = getContent();
      await idbPut(INDEXED_DB_NAME, DATA_KEY, JSON.stringify(content));
    },
    () => undefined,
    () => undefined,
    console.warn,
    PERSISTS_STORE_OR_MERGEABLE,
  );
}

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DATA_OBJECT_STORE)) {
        db.createObjectStore(DATA_OBJECT_STORE);
      }
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => resolve(req.result);
  });
}

function withStore<T>(
  name: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  return openDb(name).then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(DATA_OBJECT_STORE, mode);
        const store = tx.objectStore(DATA_OBJECT_STORE);
        let result: T | undefined;
        const req = fn(store);
        if (req instanceof IDBRequest) {
          req.onsuccess = () => {
            result = req.result;
          };
          req.onerror = () => reject(req.error ?? new Error('IndexedDB op failed'));
        }
        tx.oncomplete = () => resolve(result as T);
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB tx failed'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB tx aborted'));
      }).finally(() => db.close()),
  );
}

function idbGet<T>(name: string, key: IDBValidKey): Promise<T | undefined> {
  return withStore<T | undefined>(name, 'readonly', (store) => store.get(key) as IDBRequest<T | undefined>);
}

function idbPut(name: string, key: IDBValidKey, value: unknown): Promise<unknown> {
  return withStore<unknown>(name, 'readwrite', (store) => store.put(value, key) as IDBRequest<unknown>);
}

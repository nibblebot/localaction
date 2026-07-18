import type { MergeableStore } from 'tinybase';
import { SCHEMA_VERSION, SCHEMA_VERSION_VALUE_ID } from './schema.ts';

/**
 * Clean-cutover wipe (ADR-0001). After a persister loads a snapshot into
 * the store, compare the recorded schema version to the current one. On
 * mismatch — including a brand-new (unversioned) snapshot — drop every
 * table and stamp the new version. There is no row migration; existing
 * databases are intentionally wiped. Runs in one transaction so
 * subscribers (and the auto-save) observe a single cutover.
 *
 * Returns true when a wipe was applied.
 */
export function reconcileSchemaVersion(store: MergeableStore): boolean {
  const stored = store.getValue(SCHEMA_VERSION_VALUE_ID);
  if (stored === SCHEMA_VERSION) return false;
  // ADR-0001 mandates a row-only wipe. `delValues()` would also nuke
  // future TinyBase values; we stamp the current version and leave
  // any non-version values untouched.
  store.transaction(() => {
    store.delTables();
    store.setValue(SCHEMA_VERSION_VALUE_ID, SCHEMA_VERSION);
  });
  return true;
}

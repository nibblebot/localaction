/**
 * Singleton TinyBase MergeableStore for the app.
 *
 * Why a MergeableStore (not a regular Store): the sync protocol only runs on
 * mergeable stores (TinyBase v5+). Switching back to a plain Store means
 * re-implementing the sync shim. See ADR-0001 for the broader rationale and
 * ADR-0002 for why row-level LWW (the mergeable store's default) is the right
 * conflict strategy for a single-user personal app.
 */

import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';

let singleton: MergeableStore | undefined;

export function getStore(): MergeableStore {
  if (!singleton) {
    singleton = createMergeableStore();
  }
  return singleton;
}

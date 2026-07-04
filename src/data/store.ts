import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';

let singleton: MergeableStore | undefined;

export function getStore(): MergeableStore {
  if (!singleton) {
    singleton = createMergeableStore();
  }
  return singleton;
}

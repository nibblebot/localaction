import { createOpfsPersister } from 'tinybase/persisters/persister-browser';
import type { OpfsPersister } from 'tinybase/persisters/persister-browser';
import { getStore } from './store.ts';
import { reconcileSchemaVersion } from './schemaVersion.ts';
export const OPFS_FILE_NAME = 'localaction.json';

const onError = (err: unknown): void => {
  console.warn('[localaction] OPFS persister ignored error', err);
};

let started: Promise<OpfsPersister> | undefined;

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
    reconcileSchemaVersion(getStore());
    void persister.startAutoSave();
    return persister;
  })();
  return started;
}
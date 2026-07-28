import { createOpfsPersister } from 'tinybase/persisters/persister-browser';
import type { OpfsPersister } from 'tinybase/persisters/persister-browser';
import { getStore } from './store.ts';
import { logInfo, logWarn } from '../log.ts';
export const OPFS_FILE_NAME = 'localaction.json';

const onError = (err: unknown): void => {
  logWarn('persistence', `OPFS persister error: ${err instanceof Error ? err.message : String(err)}`);
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
    logInfo('persistence', `loading OPFS snapshot (${OPFS_FILE_NAME})`);
    const t0 = performance.now();
    await persister.load();
    logInfo(
      'persistence',
      `loaded OPFS snapshot in ${Math.round(performance.now() - t0)}ms (${getStore().getTableIds().length} tables)`,
    );
    void persister.startAutoSave();
    logInfo('persistence', 'autosave started');
    return persister;
  })();
  return started;
}
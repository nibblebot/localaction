import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Throwaway SQLite file for the offline Playwright run (see test-db-path.ts). */
export const OFFLINE_TEST_DB_PATH = join(
  tmpdir(),
  `localaction-test-e2e-offline-${Date.now()}-${process.pid}.db`,
);

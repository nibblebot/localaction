import { rmSync } from 'node:fs';
import { OFFLINE_TEST_DB_PATH } from './offline-test-db-path.ts';

export default function globalTeardown(): void {
  rmSync(OFFLINE_TEST_DB_PATH, { force: true });
}

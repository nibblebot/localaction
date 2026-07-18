import { rmSync } from 'node:fs';
import { TEST_DB_PATH } from './test-db-path.ts';

export default function globalTeardown(): void {
  rmSync(TEST_DB_PATH, { force: true });
}

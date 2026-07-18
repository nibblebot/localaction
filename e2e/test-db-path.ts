import { resolve } from 'node:path';

export const TEST_DB_PATH = resolve(
  process.cwd(),
  `data/test-e2e-${Date.now()}-${process.pid}.db`,
);

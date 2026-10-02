import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Throwaway SQLite file for the Playwright run. Lives in the OS temp dir —
 * never in the repo. `bun:sqlite` accepts any OS path here, including
 * Windows tmp paths with spaces/unicode/backslashes. The only caller-side
 * obligation is shell embedding: `playwright.config.ts` double-quotes it in
 * `webServer.command`.
 * Don't shell-quote it a second time out of habit.
 */
export const TEST_DB_PATH = join(tmpdir(), `localaction-test-e2e-${Date.now()}-${process.pid}.db`);

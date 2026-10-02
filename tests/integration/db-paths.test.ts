/**
 * Default db-path derivation tests: the preview store must live next to the
 * prod store in the same user-data directory, under a `data-preview.db`
 * basename.
 */
import { describe, expect, it } from 'bun:test';
import { basename, dirname } from 'node:path';
import { defaultPreviewDbPath, defaultProdDbPath } from '../../server/db.ts';

describe('default preview db path', () => {
  it('uses the `data-preview.db` basename', () => {
    expect(basename(defaultPreviewDbPath())).toBe('data-preview.db');
  });

  it('shares the prod store directory', () => {
    expect(dirname(defaultPreviewDbPath())).toBe(dirname(defaultProdDbPath()));
  });
});

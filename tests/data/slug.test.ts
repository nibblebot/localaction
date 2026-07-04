import { describe, expect, it } from 'vitest';
import { slugify } from '../../src/data/slug.ts';

describe('slugify', () => {
  it('lowercases and kebab-cases titles', () => {
    expect(slugify('Meeting Notes')).toBe('meeting-notes');
    expect(slugify('Weekly Sync!')).toBe('weekly-sync');
  });

  it('collapses runs of separators and trims dashes', () => {
    expect(slugify('  x   y  ')).toBe('x-y');
    expect(slugify('a---b')).toBe('a-b');
  });

  it('replaces non-alphanumeric characters with a single dash', () => {
    expect(slugify('A & B @ C')).toBe('a-b-c');
  });

  it('returns empty string for purely non-alphanumeric input', () => {
    expect(slugify('!!!')).toBe('');
  });

  it('preserves digits and accented letters as their base form when possible', () => {
    // We don't promise full ICU transliteration; we promise ASCII-safe slugs.
    expect(slugify('Café 2026')).toBe('cafe-2026');
  });
});
/**
 * Pure slug derivation for Notes.
 *
 * A slug is a URL-safe, lowercase, kebab-cased identifier derived from the
 * Note's title. Phase 0 keeps it ASCII-only: accents are normalised via
 * `String.prototype.normalize('NFKD')` and non-ASCII letters that don't
 * decompose are dropped (we don't promise full ICU transliteration). Empty
 * titles fall back to a non-empty placeholder in the action creator, so this
 * function may legitimately return `''` for purely non-alphanumeric input.
 *
 * Keep this pure and side-effect-free so it can be unit-tested in isolation
 * and reused by the wiki-link parser when it needs to compare an in-body
 * `[[Some Title]]` link against the slug index (see `src/markdown/`).
 */

export function slugify(title: string): string {
  return (
    (title ?? '')
      // NFKD splits accented letters into base + combining diacritic.
      .normalize('NFKD')
      // Drop the combining diacritics so 'é' → 'e'.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // Replace any non-[a-z0-9] run with a single dash.
      .replace(/[^a-z0-9]+/g, '-')
      // Trim leading/trailing dashes.
      .replace(/^-+|-+$/g, '')
  );
}
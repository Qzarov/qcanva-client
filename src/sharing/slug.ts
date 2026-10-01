/**
 * Custom-link (slug) FORMAT check, mirroring the backend's normalizeSlug
 * rules (common/slug.util.ts, back repo) for instant feedback while typing -
 * format only: the reserved-word list and uniqueness are the server's call.
 * An empty value is valid: it clears the custom link back to the id.
 */
const SLUG_FORMAT_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function slugFormatIsValid(input: string): boolean {
  const value = input.trim().toLowerCase();
  if (!value) return true;
  if (value.length < 2 || value.length > 64) return false;
  if (value.includes('--')) return false;
  return SLUG_FORMAT_RE.test(value);
}

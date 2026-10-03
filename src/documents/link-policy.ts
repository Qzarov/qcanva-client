/**
 * Which link destinations the editor itself may render.
 *
 * A collaborator's Yjs update reaches the editor WITHOUT passing through the
 * backend's html renderer, so `sanitizeUrl` never sees it — the editor loads the
 * shared fragment directly. This is the only filter on a link mark's href on
 * that path.
 *
 * TipTap already refuses `javascript:`, `data:` and `vbscript:` in its own
 * `renderHTML` guard, including the obfuscations (mixed case, leading space, and
 * a tab, newline or NUL inside the scheme) — verified against the installed
 * 2.27.2. What it still allows is an off-origin destination written to look
 * local: `//host` and `/\host`. The WHATWG URL parser treats a backslash as a
 * slash for http(s), so `/\evil.tld/x` resolves to `https://evil.tld/x`. The
 * backend's `sanitizeUrl` rejects both; this keeps the editor to the same rule,
 * so a planted link cannot pose as an internal path.
 *
 * Ordinary absolute links stay allowed: a document legitimately links out.
 */
export function isRenderableHref(
  href: string | undefined,
  defaultValidate: (url: string) => boolean,
): boolean {
  const url = href?.trim();
  if (!url) return false;
  // `//host` and `/\host` both resolve off-origin while reading as a local path.
  if (/^\/[/\\]/.test(url)) return false;
  return defaultValidate(url);
}

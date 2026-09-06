import { clampCollapsed } from './document-nodes';

/**
 * The document's heading outline, and the anchor each heading is given.
 *
 * The twin of canvas-server-back's `slugifyHeading` / `collectHeadings` in
 * src/text-documents/projection/render-html.ts, and it must agree with them:
 * the backend derives the `id` it writes on every rendered heading with
 * exactly this rule, and the table of contents in the STORED html links to
 * those ids. If this copy drifted, the outline this editor shows would name
 * anchors the projected html does not have.
 *
 * The id is DERIVED, in both repositories. It is deliberately not an attribute
 * in the shared inventory: it is a function of the whole document (it is
 * de-duplicated against every other heading), so storing it per node would
 * let two headings claim one anchor and would need migrating every time a
 * heading was retitled.
 */

/** Longest slug kept before de-duplication, so an id stays readable. */
const SLUG_MAX_LENGTH = 64;

/**
 * Turn heading text into an html id.
 *
 * Safe BY CONSTRUCTION rather than by escaping: everything that is not a
 * letter or a digit collapses to `-`, so no quote, angle bracket, ampersand or
 * space can survive into an attribute.
 *
 * Unicode letters and digits are kept rather than ascii only, because this
 * product's documents are largely in Russian: stripping to `[a-z0-9]` would
 * make every Cyrillic heading's slug empty, and an outline of `heading-2`,
 * `heading-3` is one nobody can read.
 */
export function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    // The slice can leave a trailing dash behind.
    .replace(/-+$/g, '');

  return slug || 'heading';
}

/** One heading in the outline: what it says, how deep it is, where it sits. */
export type HeadingOutlineEntry = {
  /** The anchor the backend will render on this heading. */
  id: string;
  text: string;
  /** 1-6, already bounded. */
  level: number;
  /** Whether the heading is folded. */
  collapsed: boolean;
  /** Document position of the heading node, so the editor can scroll to it. */
  pos: number;
};

/** What `headingOutline` needs to know about one heading, in document order. */
export type RawHeading = {
  text: string;
  level: unknown;
  collapsed: unknown;
  pos: number;
};

/**
 * Assign each heading its anchor.
 *
 * De-duplication appends `-2`, `-3` and so on and checks the result is free
 * rather than assuming it: a document holding "Plan", "Plan" and "Plan 2"
 * would otherwise hand two headings the id `plan-2`. Identical rule to the
 * backend's, which is what makes the ids agree.
 */
export function headingOutline(headings: RawHeading[]): HeadingOutlineEntry[] {
  const used = new Set<string>();

  const take = (base: string): string => {
    if (!used.has(base)) {
      used.add(base);

      return base;
    }
    let suffix = 2;
    while (used.has(`${base}-${suffix}`)) suffix += 1;
    const id = `${base}-${suffix}`;
    used.add(id);

    return id;
  };

  return headings.map((heading) => ({
    id: take(slugifyHeading(heading.text)),
    text: heading.text,
    level: clampHeadingLevel(heading.level),
    collapsed: clampCollapsed(heading.collapsed),
    pos: heading.pos,
  }));
}

/**
 * Bound a heading level to the tags that exist: h1-h6.
 *
 * The twin of the backend's `clampLevel`, here for the same reason
 * `clampCollapsed` is: the level decides which headings a fold reaches, and a
 * collaborator's Yjs update can put anything in it.
 */
export function clampHeadingLevel(value: unknown): number {
  const level = Number(value);
  if (!Number.isFinite(level)) return 1;

  return Math.min(6, Math.max(1, Math.round(level)));
}

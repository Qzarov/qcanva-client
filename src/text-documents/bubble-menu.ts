import type { EditorState } from '@tiptap/pm/state';
import { isAllowedUri } from '@tiptap/extension-link';
import { isRenderableHref } from '../documents/link-policy';
import { EDITOR_GLYPHS, lucideIcon } from './editor-icons';
import { isInCodeContext } from './slash-menu';
import type { messages } from '../composables/useI18n';

/**
 * The selection bubble menu.
 *
 * The popup itself is @tiptap/vue-3's exported `BubbleMenu` component, which
 * needs no new dependency. What lives here is the part worth asserting on its
 * own: WHEN the bubble may appear, and WHICH hrefs its link action accepts.
 */

export type BubbleMarkButton = {
  /** The mark's name in the schema. Also the test handle and the DOM key. */
  mark: string;
  labelKey: keyof typeof messages.en;
  /** Inline Lucide-style svg, 24x24, stroke-width 2. Never an emoji. */
  icon: string;
};

export const BUBBLE_MARK_BUTTONS: BubbleMarkButton[] = [
  { mark: 'bold', labelKey: 'markBold', icon: lucideIcon(EDITOR_GLYPHS.bold) },
  { mark: 'italic', labelKey: 'markItalic', icon: lucideIcon(EDITOR_GLYPHS.italic) },
  { mark: 'underline', labelKey: 'markUnderline', icon: lucideIcon(EDITOR_GLYPHS.underline) },
  { mark: 'strike', labelKey: 'markStrike', icon: lucideIcon(EDITOR_GLYPHS.strikethrough) },
  { mark: 'code', labelKey: 'markInlineCode', icon: lucideIcon(EDITOR_GLYPHS.code) },
];

export const LINK_ICON = lucideIcon(EDITOR_GLYPHS.link);
export const UNLINK_ICON = lucideIcon(EDITOR_GLYPHS.unlink);

/**
 * Whether the bubble may appear over the current selection.
 *
 * Two refusals, both of which a bare `!selection.empty` would get wrong:
 *
 *  - NO TEXT SELECTED. A collapsed caret is the obvious case, but a selected
 *    image is the one that bites: `empty` is false there, and a bubble
 *    offering Bold over an `<img>` does nothing whatever the user clicks. The
 *    rule is therefore "the selection contains non-whitespace text", which
 *    covers both.
 *  - INSIDE CODE. `**bold**` in a code block is content, not formatting, and a
 *    bold mark is not even in the code block's content expression. Shares
 *    `isInCodeContext` with the slash menu, so "what counts as code" is
 *    decided in one place.
 */
export function shouldShowBubbleMenu(state: EditorState, from: number, to: number): boolean {
  if (from === to) return false;
  if (!state.doc.textBetween(from, to, ' ', ' ').trim()) return false;
  if (isInCodeContext(state, from)) return false;

  return true;
}

/**
 * The href the link action is allowed to write, or null when the input is not
 * one we will render.
 *
 * Routed through the project's `isRenderableHref` policy rather than taking
 * the typed text: that policy is what keeps `//host` and `/\host` - which
 * resolve off-origin while reading as a local path - out of the document, and
 * a collaborator receives this mark through Yjs without the backend renderer
 * ever seeing it. `isAllowedUri` is the very function the Link extension
 * builds its own `defaultValidate` from (with the default empty `protocols`),
 * so the bubble menu and the mark's own guard apply the same scheme rule.
 */
export function resolveLinkHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;

  return isRenderableHref(href, (url) => !!isAllowedUri(url)) ? href : null;
}

import { Node, escapeForRegEx, mergeAttributes, wrappingInputRule, type CommandProps } from '@tiptap/core';
import { CALLOUT_VARIANTS, clampCalloutVariant, nodeSpec } from '../documents/document-nodes';

/**
 * The callout block: an `<aside data-variant="...">` holding arbitrary block
 * content, like a blockquote.
 *
 * Both halves of its shape come from the SHARED node inventory
 * (`documents/document-nodes.ts`, mirrored byte-for-byte in canvas-server-back
 * and pinned by the canonical schema string), not from literals here:
 *
 * - the tag, so this editor's html and the backend's projection cannot
 *   disagree about which element a callout is;
 * - the variant's closed value set, through `clampCalloutVariant`, so a
 *   variant this editor writes is one the backend will render rather than
 *   silently rewrite to "info".
 *
 * The ICON is deliberately not part of the node's html. `renderHTML` emits
 * only `data-variant`, so the html the backend stores, serves for canvas
 * previews and hands to MCP clients carries no per-callout svg. The icon is
 * drawn by the node view below, which exists only in a live editor's DOM.
 */

const TAG = nodeSpec('callout')?.tag ?? 'aside';

/**
 * Lucide-style glyphs: 24x24 on a 0 0 24 24 viewBox, stroke-width 2, no fill -
 * the same shape as every other icon in this project. Never emoji.
 *
 * `info`          -> lucide "info"
 * `warning`       -> lucide "triangle-alert"
 * `success`       -> lucide "circle-check"
 * `danger`        -> lucide "octagon-alert"
 */
const ICON_PATHS = {
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  warning:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  success: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  danger:
    '<path d="M12 16h.01"/><path d="M12 8v4"/><path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"/>',
} as const;

/** The inline svg for a variant. Bounded first, so an unknown one still draws. */
export function calloutIconSvg(variant: unknown): string {
  const bounded = clampCalloutVariant(variant);
  // A variant added to the inventory without a glyph here still draws the
  // neutral one rather than an empty <svg>.
  const paths = ICON_PATHS[bounded as keyof typeof ICON_PATHS] ?? ICON_PATHS.info;

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"' +
    ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"' +
    ` stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
  );
}

/**
 * The markdown-ish trigger: `:::` at the start of a block, optionally naming a
 * variant, then a space. `::: ` gives the neutral callout; `:::warning ` gives
 * a warning one.
 *
 * WHY `:::` and not something else:
 *
 *  - It is the container-directive fence that Docusaurus, VitePress and
 *    MkDocs-material all use for exactly this block (`:::info`, `:::warning`),
 *    so it is the syntax a user who writes docs elsewhere already has in their
 *    fingers.
 *  - It is the only common admonition syntax that carries the VARIANT in the
 *    same token, so one rule covers all four - and the alternation below is
 *    built from CALLOUT_VARIANTS, so a variant added to the shared inventory
 *    gets its trigger for free instead of needing a fifth rule.
 *  - GitHub's `> [!NOTE]` was rejected because it can never fire: StarterKit's
 *    blockquote rule is live and consumes `> ` first, turning the block into a
 *    blockquote before this rule could ever see the text.
 *  - MkDocs' `!!! ` was rejected because it is plausible prose ("Wow!!! "). A
 *    trigger that can fire while someone is just typing is worse than one that
 *    cannot, and `:::` never begins an English or a Russian sentence.
 *  - It collides with none of the rules already live in this editor: `# `,
 *    `- `, `1. `, `> `, the triple backtick and `---`.
 *
 * An UNDECLARED variant deliberately does not match (`:::purple ` stays text)
 * rather than matching and being bounded to "info": silently turning a typo
 * into a neutral callout hides the typo.
 */
export const CALLOUT_INPUT_RULE = new RegExp(
  `^:::(${CALLOUT_VARIANTS.map(escapeForRegEx).join('|')})?\\s$`,
);

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** Wrap the selection in a callout, or lift it back out of one. */
      toggleCallout: (variant?: string) => ReturnType;
      /** Change the variant of the callout the selection sits in. */
      setCalloutVariant: (variant: string) => ReturnType;
    };
  }
}

/** Visible names of the callout kinds, plus the kind menu's own name. */
export type CalloutLabels = Record<string, string> & { choose: string };

export interface CalloutOptions {
  labels: CalloutLabels;
}

export const Callout = Node.create<CalloutOptions>({
  addOptions() {
    return {
      labels: { info: 'Info', warning: 'Warning', success: 'Success', danger: 'Danger', choose: 'Callout kind' },
    };
  },

  name: 'callout',
  group: 'block',
  // Block content, like a blockquote: a callout is not a leaf.
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: CALLOUT_VARIANTS[0],
        // Bounded on the way in as well as out. A collaborator's Yjs update
        // reaches this editor without passing the backend's renderer, and
        // pasted html is not trusted either, so an unrecognised variant must
        // become "info" here rather than reaching the document and then being
        // rewritten by the projection.
        parseHTML: (element) => clampCalloutVariant(element.getAttribute('data-variant')),
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-variant': clampCalloutVariant(attributes.variant),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: TAG }];
  },

  renderHTML({ HTMLAttributes }) {
    // No icon markup: see the file comment. 0 is the content hole.
    return [TAG, mergeAttributes(HTMLAttributes), 0];
  },

  /**
   * One rule, consistent with the ones StarterKit already ships for heading,
   * list, blockquote, code block and horizontal rule - and, like all of them,
   * prosemirror-inputrules refuses to run it inside a node whose spec says
   * `code`, so `::: ` typed in a code block stays literal text.
   */
  addInputRules() {
    return [
      wrappingInputRule({
        find: CALLOUT_INPUT_RULE,
        type: this.type,
        getAttributes: (match) => ({ variant: clampCalloutVariant(match[1]) }),
      }),
    ];
  },

  addCommands() {
    return {
      toggleCallout:
        (variant?: string) =>
        ({ commands }: CommandProps) =>
          commands.toggleWrap(this.name, {
            variant: clampCalloutVariant(variant),
          }),
      setCalloutVariant:
        (variant: string) =>
        ({ commands }: CommandProps) =>
          commands.updateAttributes(this.name, {
            variant: clampCalloutVariant(variant),
          }),
    };
  },

  /**
   * The icon lives here and only here: a node view is DOM the editor draws
   * around the node's content, so it never reaches `editor.getHTML()`, the Yjs
   * document or therefore the stored projection.
   */
  addNodeView() {
    const labels = this.options.labels;
    return ({ node, editor, getPos }) => {
      let current = node;
      const dom = document.createElement(TAG);
      dom.className = 'text-doc-callout';
      // The icon is also the way to change the callout's kind (its icon and
      // colour together - that pair IS the variant the shared schema
      // stores). A <button> for keyboard/screen readers; not editable and
      // not part of the document, so the caret skips it.
      const icon = document.createElement('button');
      icon.type = 'button';
      icon.className = 'text-doc-callout-icon';
      icon.setAttribute('contenteditable', 'false');
      icon.setAttribute('aria-haspopup', 'menu');
      const body = document.createElement('div');
      body.className = 'text-doc-callout-body';
      let menu: HTMLElement | null = null;

      const paint = (variant: unknown) => {
        const bounded = clampCalloutVariant(variant);
        dom.setAttribute('data-variant', bounded);
        icon.innerHTML = calloutIconSvg(bounded);
        const label = labels.choose;
        icon.title = label;
        icon.setAttribute('aria-label', label);
        icon.tabIndex = editor.isEditable ? 0 : -1;
      };

      const closeMenu = () => {
        if (!menu) return;
        menu.remove();
        menu = null;
        icon.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', onOutside, true);
        document.removeEventListener('keydown', onKey, true);
      };
      const onOutside = (event: Event) => {
        if (menu && !menu.contains(event.target as HTMLElement) && !icon.contains(event.target as HTMLElement)) closeMenu();
      };
      const onKey = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        icon.focus();
      };
      const choose = (variant: string) => {
        closeMenu();
        const pos = typeof getPos === 'function' ? getPos() : undefined;
        if (typeof pos !== 'number' || !editor.isEditable) return;
        if (clampCalloutVariant(current.attrs.variant) === variant) return;
        editor.view.dispatch(
          editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, variant: clampCalloutVariant(variant) }),
        );
      };
      const openMenu = () => {
        if (menu || !editor.isEditable) return;
        const active = clampCalloutVariant(current.attrs.variant);
        menu = document.createElement('div');
        menu.className = 'text-doc-callout-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', labels.choose);
        menu.dataset.calloutVariantMenu = '';
        menu.setAttribute('contenteditable', 'false');
        for (const variant of CALLOUT_VARIANTS) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'text-doc-callout-menu-item';
          item.dataset.calloutVariant = variant;
          item.dataset.variant = variant;
          item.setAttribute('role', 'menuitemradio');
          item.setAttribute('aria-checked', String(variant === active));
          item.innerHTML = `<span class="text-doc-callout-menu-icon">${calloutIconSvg(variant)}</span>`;
          const text = document.createElement('span');
          text.textContent = labels[variant] ?? variant;
          item.appendChild(text);
          item.addEventListener('click', (event) => {
            event.preventDefault();
            choose(variant);
          });
          menu.appendChild(item);
        }
        dom.insertBefore(menu, body);
        icon.setAttribute('aria-expanded', 'true');
        document.addEventListener('pointerdown', onOutside, true);
        document.addEventListener('keydown', onKey, true);
      };

      icon.addEventListener('mousedown', (event) => event.preventDefault());
      icon.addEventListener('click', (event) => {
        event.preventDefault();
        if (menu) closeMenu();
        else openMenu();
      });

      paint(node.attrs.variant);
      dom.append(icon, body);

      return {
        dom,
        contentDOM: body,
        update: (updated) => {
          if (updated.type.name !== 'callout') return false;
          current = updated;
          paint(updated.attrs.variant);

          return true;
        },
        // Icon and menu are chrome, not content: ProseMirror must neither read
        // their mutations back into the document nor handle their events.
        // Opening/closing the menu is a childList mutation whose TARGET is
        // the <aside> itself (the menu's parent), so it must be recognised
        // by what was added/removed - missed, ProseMirror re-created the node
        // view and the fresh menu vanished with the old DOM.
        ignoreMutation: (mutation) => {
          if (mutation.type === 'selection') return false;
          if (icon.contains(mutation.target) || (!!menu && menu.contains(mutation.target))) return true;
          if (mutation.type !== 'childList' || mutation.target !== dom) return false;
          const changed = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
          return changed.length > 0 && changed.every(
            (n) => n instanceof HTMLElement && n.classList.contains('text-doc-callout-menu'),
          );
        },
        stopEvent: (event) => icon.contains(event.target as HTMLElement) || (!!menu && menu.contains(event.target as HTMLElement)),
        destroy: closeMenu,
      };
    };
  },
});

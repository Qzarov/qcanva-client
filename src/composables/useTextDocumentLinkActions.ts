import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { Editor } from '@tiptap/core';

type ToastKind = 'success' | 'error';

type UseTextDocumentLinkActionsOptions = {
  getEditor: () => Editor | null | undefined;
  canEdit: () => boolean;
  showToast: (message: string, kind?: ToastKind) => void;
  copySuccessMessage: () => string;
  copyFailureMessage: () => string;
  openLinkEditor: () => void;
};

export function useTextDocumentLinkActions(options: UseTextDocumentLinkActionsOptions) {
  const { getEditor, canEdit, showToast, copySuccessMessage, copyFailureMessage, openLinkEditor } = options;
  const linkActionOpen = ref(false);
  const linkActionHref = ref('');
  const linkActionRect = ref<{ top?: number; bottom?: number; left: number } | null>(null);
  const linkActionMenuEl = ref<HTMLElement | null>(null);
  const LINK_MENU_EDGE = 12;

  const linkActionMenuStyle = computed(() => {
    const rect = linkActionRect.value;
    if (!rect) return undefined;
    return {
      left: `${rect.left}px`,
      ...(rect.bottom !== undefined ? { bottom: `${rect.bottom}px` } : { top: `${rect.top ?? 0}px` }),
    };
  });

  const keepLinkActionMenuOnScreen = () => {
    const element = linkActionMenuEl.value;
    const current = linkActionRect.value;
    if (!element || !current) return;
    const width = element.getBoundingClientRect().width;
    const maxLeft = Math.max(LINK_MENU_EDGE, window.innerWidth - width - LINK_MENU_EDGE);
    const left = Math.min(Math.max(LINK_MENU_EDGE, current.left), maxLeft);
    if (left !== current.left) linkActionRect.value = { ...current, left };
  };

  const closeLinkActionMenu = () => {
    linkActionOpen.value = false;
    linkActionHref.value = '';
    linkActionRect.value = null;
  };

  const onLinkActionEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeLinkActionMenu();
  };

  watch([linkActionOpen, linkActionHref], ([open]) => {
    if (open) void nextTick(keepLinkActionMenuOnScreen);
  });
  watch(linkActionOpen, (open) => {
    if (open) window.addEventListener('keydown', onLinkActionEscape);
    else window.removeEventListener('keydown', onLinkActionEscape);
  });

  async function copyLinkActionHref() {
    try {
      await navigator.clipboard.writeText(linkActionHref.value);
      showToast(copySuccessMessage(), 'success');
    } catch {
      showToast(copyFailureMessage(), 'error');
    }
    closeLinkActionMenu();
  }

  function openLinkActionHref() {
    window.open(linkActionHref.value, '_blank', 'noopener,noreferrer');
    closeLinkActionMenu();
  }

  function removeLinkAction() {
    closeLinkActionMenu();
    getEditor()?.chain().focus(undefined, { scrollIntoView: false }).extendMarkRange('link').unsetLink().run();
  }

  function editLinkAction() {
    closeLinkActionMenu();
    getEditor()?.chain().extendMarkRange('link').run();
    openLinkEditor();
  }

  function handleEditorLinkClick(event: MouseEvent): boolean {
    if (!canEdit()) return false;
    const anchor = (event.target as HTMLElement | null)?.closest?.('a');
    if (!anchor) {
      closeLinkActionMenu();
      return false;
    }
    const href = anchor.getAttribute('href') || '';
    if (!href) return false;
    const rect = anchor.getBoundingClientRect();
    const ESTIMATED_MENU_HEIGHT = 56;
    const opensBelow = rect.top - 6 - ESTIMATED_MENU_HEIGHT < 8;
    linkActionHref.value = href;
    linkActionRect.value = {
      ...(opensBelow ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - (rect.top - 6) }),
      left: rect.left,
    };
    linkActionOpen.value = true;
    return false;
  }

  onBeforeUnmount(() => window.removeEventListener('keydown', onLinkActionEscape));

  return {
    linkActionOpen,
    linkActionHref,
    linkActionMenuStyle,
    linkActionMenuEl,
    closeLinkActionMenu,
    copyLinkActionHref,
    openLinkActionHref,
    editLinkAction,
    removeLinkAction,
    handleEditorLinkClick,
  };
}

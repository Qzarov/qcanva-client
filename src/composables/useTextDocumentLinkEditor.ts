import { nextTick, ref } from 'vue';
import type { Editor } from '@tiptap/core';
import { resolveLinkHref } from '../text-documents/bubble-menu';
import { trackRange } from '../text-documents/preserve-range';

type ToastKind = 'success' | 'error';

type UseTextDocumentLinkEditorOptions = {
  getEditor: () => Editor | null | undefined;
  isMobileLayout: () => boolean;
  showToast: (message: string, kind?: ToastKind) => void;
  rejectedMessage: () => string;
};

export function useTextDocumentLinkEditor(options: UseTextDocumentLinkEditorOptions) {
  const { getEditor, isMobileLayout, showToast, rejectedMessage } = options;
  const linkEditorOpen = ref(false);
  const linkInput = ref('');
  const linkEditorHadLink = ref(false);
  let linkRangeTracker: ReturnType<typeof trackRange> | null = null;

  const openLinkEditor = () => {
    const editor = getEditor();
    linkInput.value = editor?.getAttributes('link').href || '';
    linkEditorHadLink.value = editor?.isActive('link') ?? false;
    if (editor) {
      const { from, to } = editor.state.selection;
      linkRangeTracker = trackRange(editor, { from, to });
    }
    linkEditorOpen.value = true;
    if (!isMobileLayout()) {
      void nextTick(() => {
        if (!linkEditorOpen.value) return;
        (document.querySelector('[data-bubble-link-input]') as HTMLInputElement | null)?.focus();
      });
    }
  };

  const closeLinkEditor = () => {
    linkEditorOpen.value = false;
    linkInput.value = '';
    linkEditorHadLink.value = false;
    linkRangeTracker?.stop();
    linkRangeTracker = null;
  };

  const closeLinkEditorOnDocumentInput = () => {
    if (linkEditorOpen.value && !isMobileLayout()) closeLinkEditor();
  };

  const restoreLinkSelection = () => {
    const editor = getEditor();
    if (!editor || !linkRangeTracker) return;
    const range = linkRangeTracker.resolve();
    editor.chain().focus().setTextSelection(range).run();
  };

  const removeLink = () => {
    const editor = getEditor();
    restoreLinkSelection();
    editor?.chain().focus(undefined, { scrollIntoView: false }).extendMarkRange('link').unsetLink().run();
    closeLinkEditor();
  };

  const applyLink = () => {
    if (!linkInput.value.trim()) {
      removeLink();
      return;
    }
    const href = resolveLinkHref(linkInput.value);
    if (!href) {
      showToast(rejectedMessage(), 'error');
      return;
    }
    const editor = getEditor();
    restoreLinkSelection();
    editor?.chain().focus(undefined, { scrollIntoView: false }).extendMarkRange('link').setLink({ href }).run();
    closeLinkEditor();
  };

  return {
    linkEditorOpen,
    linkInput,
    linkEditorHadLink,
    openLinkEditor,
    closeLinkEditor,
    closeLinkEditorOnDocumentInput,
    applyLink,
    removeLink,
  };
}

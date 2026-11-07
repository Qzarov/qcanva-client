import { computed, nextTick, ref, watch } from 'vue';
import type {
  MentionMenuController,
  MentionMenuItem,
  MentionMenuRender,
} from '../text-documents/mention-menu';

export function useTextDocumentMentionMenu() {
  const mentionOpen = ref(false);
  const mentionItems = ref<MentionMenuItem[]>([]);
  const mentionIndex = ref(0);
  const mentionRect = ref<{ top: number; left: number } | null>(null);
  let mentionCommand: ((item: MentionMenuItem) => void) | null = null;
  let mentionDismissed = false;
  let mentionQuery: string | null = null;

  const mentionMenuStyle = computed(() =>
    mentionRect.value
      ? { top: `${mentionRect.value.top}px`, left: `${mentionRect.value.left}px` }
      : undefined,
  );

  const applyMentionRender = (render: MentionMenuRender) => {
    mentionItems.value = render.items;
    const sameQuery = render.query === mentionQuery;
    mentionQuery = render.query;
    mentionIndex.value = sameQuery ? Math.min(mentionIndex.value, Math.max(0, render.items.length - 1)) : 0;
    mentionCommand = render.command;
    mentionRect.value = render.rect
      ? { top: render.rect.bottom + 6, left: render.rect.left }
      : null;
    mentionOpen.value = !mentionDismissed;
  };

  const closeMentionMenu = () => {
    mentionOpen.value = false;
    mentionItems.value = [];
    mentionIndex.value = 0;
    mentionQuery = null;
    mentionCommand = null;
  };

  const cancelMentionMenu = () => {
    mentionDismissed = true;
    closeMentionMenu();
  };

  const selectMentionItem = (index: number) => {
    const item = mentionItems.value[index];
    if (!item || !mentionCommand) return;
    mentionCommand(item);
  };

  const mentionController: MentionMenuController = {
    onOpen: (render) => {
      mentionDismissed = false;
      applyMentionRender(render);
    },
    onUpdate: (render) => applyMentionRender(render),
    onClose: () => {
      mentionDismissed = false;
      closeMentionMenu();
    },
    onKeyDown: (event) => {
      if (!mentionOpen.value) return false;
      const total = mentionItems.value.length;
      if (event.key === 'Escape') {
        mentionDismissed = true;
        closeMentionMenu();
        return true;
      }
      if (event.key === 'ArrowDown') {
        if (total) mentionIndex.value = (mentionIndex.value + 1) % total;
        return true;
      }
      if (event.key === 'ArrowUp') {
        if (total) mentionIndex.value = (mentionIndex.value - 1 + total) % total;
        return true;
      }
      if (event.key === 'Enter') {
        selectMentionItem(mentionIndex.value);
        return true;
      }
      return false;
    },
  };

  watch(mentionIndex, async () => {
    const item = mentionItems.value[mentionIndex.value];
    if (!item) return;
    const value = item.kind === 'document' ? item.id : item.kind === 'heading' ? `h-${item.headingId}` : 'create';
    await nextTick();
    document.querySelector(`[data-mention-item="${value}"]`)?.scrollIntoView({ block: 'nearest' });
  });

  return {
    mentionOpen,
    mentionItems,
    mentionIndex,
    mentionMenuStyle,
    mentionController,
    selectMentionItem,
    closeMentionMenu,
    cancelMentionMenu,
  };
}

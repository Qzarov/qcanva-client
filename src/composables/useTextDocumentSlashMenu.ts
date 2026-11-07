import { computed, nextTick, ref, watch } from 'vue';
import type { Editor } from '@tiptap/core';
import {
  SLASH_MENU_ITEMS,
  type SlashMenuController,
  type SlashMenuItem,
  type SlashMenuRender,
} from '../text-documents/slash-menu';

type UseTextDocumentSlashMenuOptions = {
  getEditor: () => Editor | null | undefined;
  t: (key: SlashMenuItem['labelKey']) => string;
  isMobileLayout: () => boolean;
};

export function useTextDocumentSlashMenu(options: UseTextDocumentSlashMenuOptions) {
  const { getEditor, t, isMobileLayout } = options;
  const slashOpen = ref(false);
  const slashItems = ref<SlashMenuItem[]>([]);
  const slashIndex = ref(0);
  const slashRect = ref<{ top: number; left: number } | null>(null);
  let slashCommand: ((item: SlashMenuItem) => void) | null = null;
  let slashDismissed = false;

  const slashLabel = (item: SlashMenuItem) => t(item.labelKey);
  const slashMenuStyle = computed(() =>
    slashRect.value
      ? { top: `${slashRect.value.top}px`, left: `${slashRect.value.left}px` }
      : undefined,
  );

  const applySlashRender = (render: SlashMenuRender) => {
    slashItems.value = render.items;
    slashIndex.value = 0;
    slashCommand = render.command;
    slashRect.value = render.rect
      ? { top: render.rect.bottom + 6, left: render.rect.left }
      : null;
    slashOpen.value = !slashDismissed;
  };

  const closeSlashMenu = () => {
    slashOpen.value = false;
    slashItems.value = [];
    slashIndex.value = 0;
    slashCommand = null;
  };

  const cancelSlashMenu = () => {
    slashDismissed = true;
    closeSlashMenu();
  };

  const selectSlashItem = (index: number) => {
    const item = slashItems.value[index];
    if (!item || !slashCommand) return;
    slashCommand(item);
  };

  const slashController: SlashMenuController = {
    onOpen: (render) => {
      slashDismissed = false;
      applySlashRender(render);
      if (isMobileLayout()) getEditor()?.view.dom.blur();
    },
    onUpdate: (render) => applySlashRender(render),
    onClose: () => {
      slashDismissed = false;
      closeSlashMenu();
    },
    onKeyDown: (event) => {
      if (!slashOpen.value) return false;
      const total = slashItems.value.length;
      if (event.key === 'Escape') {
        slashDismissed = true;
        closeSlashMenu();
        return true;
      }
      if (event.key === 'ArrowDown') {
        if (total) slashIndex.value = (slashIndex.value + 1) % total;
        return true;
      }
      if (event.key === 'ArrowUp') {
        if (total) slashIndex.value = (slashIndex.value - 1 + total) % total;
        return true;
      }
      if (event.key === 'Enter') {
        selectSlashItem(slashIndex.value);
        return true;
      }
      return false;
    },
  };

  watch(slashIndex, async () => {
    const item = slashItems.value[slashIndex.value];
    if (!item) return;
    await nextTick();
    document.querySelector(`[data-slash-item="${item.id}"]`)?.scrollIntoView({ block: 'nearest' });
  });

  return {
    slashOpen,
    slashItems,
    slashIndex,
    slashMenuStyle,
    slashLabel,
    slashController,
    selectSlashItem,
    cancelSlashMenu,
    closeSlashMenu,
    SLASH_MENU_ITEMS,
  };
}

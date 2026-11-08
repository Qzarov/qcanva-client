import { onBeforeUnmount, ref, watch } from 'vue';

interface TextDocumentTopbarMenuOptions {
  toggleShare: () => void;
  toggleHistory: () => void | Promise<void>;
  copyLink: () => void | Promise<void>;
  toggleOutline: () => void;
}

export function useTextDocumentTopbarMenu(options: TextDocumentTopbarMenuOptions) {
  const docMenuOpen = ref(false);
  const docMenuStyle = ref<Record<string, string> | null>(null);

  const closeDocMenu = () => {
    docMenuOpen.value = false;
    docMenuStyle.value = null;
  };

  const toggleDocMenu = (event?: Event) => {
    if (docMenuOpen.value) {
      closeDocMenu();
      return;
    }
    const trigger = event?.currentTarget as HTMLElement | undefined;
    const rect = trigger?.getBoundingClientRect();
    docMenuStyle.value = rect
      ? { position: 'fixed', top: `${Math.round(rect.bottom + 6)}px`, right: `${Math.round(window.innerWidth - rect.right)}px` }
      : null;
    docMenuOpen.value = true;
  };

  const openAccessFromDocMenu = () => {
    closeDocMenu();
    options.toggleShare();
  };
  const openHistoryFromDocMenu = () => {
    closeDocMenu();
    void options.toggleHistory();
  };
  const copyDocumentLinkFromDocMenu = () => {
    closeDocMenu();
    void options.copyLink();
  };
  const toggleOutlinePanelFromDocMenu = () => {
    closeDocMenu();
    options.toggleOutline();
  };

  const onDocMenuEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeDocMenu();
  };
  watch(docMenuOpen, (open) => {
    if (open) window.addEventListener('keydown', onDocMenuEscape);
    else window.removeEventListener('keydown', onDocMenuEscape);
  });
  onBeforeUnmount(() => window.removeEventListener('keydown', onDocMenuEscape));

  return {
    docMenuOpen,
    docMenuStyle,
    toggleDocMenu,
    closeDocMenu,
    openAccessFromDocMenu,
    openHistoryFromDocMenu,
    copyDocumentLinkFromDocMenu,
    toggleOutlinePanelFromDocMenu,
  };
}

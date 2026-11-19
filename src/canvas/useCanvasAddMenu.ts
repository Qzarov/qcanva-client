import { computed, ref } from 'vue';

export interface CanvasAddMenuEntry {
  key: 'text' | 'group' | 'image' | 'canvas' | 'document';
  label: string;
  icon: string;
}

interface CanvasAddMenuOptions {
  t: (key: string) => string;
  rulerActive: () => boolean;
  exitRuler: () => void;
  addText: () => void;
  addGroup: () => void;
  openImage: () => void;
  openCanvas: () => void;
  openDocument: () => void;
}

const ADD_MENU_ICONS: Record<CanvasAddMenuEntry['key'], string> = {
  text: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h7"/></svg>',
  group: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  image: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  canvas: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>',
  document: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
};

export function useCanvasAddMenu(options: CanvasAddMenuOptions) {
  const addMenuOpen = ref(false);
  const addMenuWrap = ref<HTMLElement | null>(null);
  const addMenuEntries = computed<CanvasAddMenuEntry[]>(() => [
    { key: 'text', label: options.t('addTextNode'), icon: ADD_MENU_ICONS.text },
    { key: 'group', label: options.t('addGroupNode'), icon: ADD_MENU_ICONS.group },
    { key: 'image', label: options.t('addImage'), icon: ADD_MENU_ICONS.image },
    { key: 'canvas', label: options.t('addCanvasEmbed'), icon: ADD_MENU_ICONS.canvas },
    { key: 'document', label: options.t('addDocumentEmbed'), icon: ADD_MENU_ICONS.document },
  ]);

  const closeAddMenu = () => {
    addMenuOpen.value = false;
  };

  const toggleAddMenu = () => {
    if (options.rulerActive()) options.exitRuler();
    addMenuOpen.value = !addMenuOpen.value;
  };

  const runAddMenuEntry = (key: CanvasAddMenuEntry['key']) => {
    closeAddMenu();
    if (key === 'text') return options.addText();
    if (key === 'group') return options.addGroup();
    if (key === 'image') return options.openImage();
    if (key === 'canvas') return options.openCanvas();
    return options.openDocument();
  };

  const onDocumentPointerDown = (event: PointerEvent) => {
    if (!addMenuOpen.value) return;
    const target = event.target as Node | null;
    if (target && addMenuWrap.value?.contains(target)) return;
    closeAddMenu();
  };

  return { addMenuOpen, addMenuWrap, addMenuEntries, closeAddMenu, toggleAddMenu, runAddMenuEntry, onDocumentPointerDown };
}

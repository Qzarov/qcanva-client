import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { Editor } from '@tiptap/core';
import { BREAKPOINTS } from './layoutMedia';
import type { MessageKey } from './useI18n';
import { documentOutline, focusHeading } from '../text-documents/table-of-contents';
import { buildOutlineTree, clampOutlineWidth, collectCollapsibleIds, flattenVisibleOutline, headingIdAtReadingLine } from '../text-documents/outline-tree';

export type TextDocumentOutlineLabels = {
  title: string;
  empty: string;
  toggle: string;
  hide: string;
  show: string;
  collapseSection: string;
  expandSection: string;
  expandAll: string;
  collapseAll: string;
};

type UseTextDocumentOutlineOptions = {
  getEditor: () => Editor | null | undefined;
  pageRef: Ref<HTMLElement | null>;
  editorTransactionTick: Ref<number>;
  t: (key: MessageKey) => string;
};

const OUTLINE_COLLAPSED_STORAGE_KEY = 'qcanva-outline-collapsed';
const OUTLINE_WIDTH_STORAGE_KEY = 'qcanva-outline-width';
const OUTLINE_DEFAULT_WIDTH = 240;
const OUTLINE_MIN_WIDTH = 220;
const OUTLINE_MAX_WIDTH = 480;

export function useTextDocumentOutline(options: UseTextDocumentOutlineOptions) {
  const { getEditor, pageRef, editorTransactionTick, t } = options;
  const outlineIsDesktop = ref(typeof window !== 'undefined' ? window.innerWidth >= BREAKPOINTS.outlineDocked : true);
  const outlineCollapsedPref = ref(readOutlineCollapsedPref());
  const outlineMobileOpen = ref(false);
  const outlineWidth = ref(readOutlineWidth());
  const outlineResizing = ref(false);
  const activeOutlineHeadingId = ref<string | null>(null);
  const outlineCollapsedSections = ref<Set<string>>(new Set());

  function readOutlineCollapsedPref(): boolean {
    try {
      return localStorage.getItem(OUTLINE_COLLAPSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function writeOutlineCollapsedPref(collapsed: boolean): void {
    try {
      localStorage.setItem(OUTLINE_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // A blocked localStorage must not break the toggle itself.
    }
  }

  function readOutlineWidth(): number {
    try {
      const raw = localStorage.getItem(OUTLINE_WIDTH_STORAGE_KEY);
      const parsed = raw === null ? NaN : Number(raw);
      return Number.isFinite(parsed) ? clampOutlineWidth(parsed, OUTLINE_MIN_WIDTH, OUTLINE_MAX_WIDTH) : OUTLINE_DEFAULT_WIDTH;
    } catch {
      return OUTLINE_DEFAULT_WIDTH;
    }
  }

  function writeOutlineWidth(width: number): void {
    try {
      localStorage.setItem(OUTLINE_WIDTH_STORAGE_KEY, String(width));
    } catch {
      // Best effort only.
    }
  }

  function updateOutlineIsDesktop(): void {
    outlineIsDesktop.value = window.innerWidth >= BREAKPOINTS.outlineDocked;
  }
  if (typeof window !== 'undefined') window.addEventListener('resize', updateOutlineIsDesktop);

  const outlinePanelOpen = computed(() => (outlineIsDesktop.value ? !outlineCollapsedPref.value : outlineMobileOpen.value));

  function toggleOutlinePanel(): void {
    if (outlineIsDesktop.value) {
      outlineCollapsedPref.value = !outlineCollapsedPref.value;
      writeOutlineCollapsedPref(outlineCollapsedPref.value);
      return;
    }
    outlineMobileOpen.value = !outlineMobileOpen.value;
  }

  function closeOutlineMobile(): void {
    outlineMobileOpen.value = false;
  }

  const onOutlineMobileEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeOutlineMobile();
  };

  watch(outlineMobileOpen, (open) => {
    if (open) window.addEventListener('keydown', onOutlineMobileEscape);
    else window.removeEventListener('keydown', onOutlineMobileEscape);
    if (open) {
      const editor = getEditor();
      if (editor) syncActiveOutlineHeading(editor);
      const activeId = activeOutlineHeadingId.value;
      if (activeId) void nextTick(() => scrollOutlineItemIntoView('.text-doc-outline-drawer', activeId));
    }
  });

  let outlineResizeStartX = 0;
  let outlineResizeStartWidth = 0;

  function onOutlineResizeMove(event: MouseEvent): void {
    const delta = event.clientX - outlineResizeStartX;
    outlineWidth.value = clampOutlineWidth(outlineResizeStartWidth + delta, OUTLINE_MIN_WIDTH, OUTLINE_MAX_WIDTH);
  }

  function stopOutlineResize(): void {
    outlineResizing.value = false;
    document.body.classList.remove('text-doc-outline-resizing');
    window.removeEventListener('mousemove', onOutlineResizeMove);
    window.removeEventListener('mouseup', stopOutlineResize);
    writeOutlineWidth(outlineWidth.value);
  }

  function startOutlineResize(event: MouseEvent): void {
    event.preventDefault();
    outlineResizeStartX = event.clientX;
    outlineResizeStartWidth = outlineWidth.value;
    outlineResizing.value = true;
    document.body.classList.add('text-doc-outline-resizing');
    window.addEventListener('mousemove', onOutlineResizeMove);
    window.addEventListener('mouseup', stopOutlineResize);
  }

  function resetOutlineWidth(): void {
    outlineWidth.value = OUTLINE_DEFAULT_WIDTH;
    writeOutlineWidth(OUTLINE_DEFAULT_WIDTH);
  }

  const outlineEntries = computed(() => {
    void editorTransactionTick.value;
    const editor = getEditor();
    return editor?.state?.doc ? documentOutline(editor.state.doc) : [];
  });
  const outlineTree = computed(() => buildOutlineTree(outlineEntries.value));
  const outlineVisibleRows = computed(() => flattenVisibleOutline(outlineTree.value, outlineCollapsedSections.value));

  function toggleOutlineSection(id: string): void {
    const next = new Set(outlineCollapsedSections.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    outlineCollapsedSections.value = next;
  }

  const allCollapsibleOutlineIds = computed(() => collectCollapsibleIds(outlineTree.value));
  const hasCollapsibleOutline = computed(() => allCollapsibleOutlineIds.value.length > 0);
  const allOutlineSectionsCollapsed = computed(() =>
    hasCollapsibleOutline.value && allCollapsibleOutlineIds.value.every((id) => outlineCollapsedSections.value.has(id)),
  );

  function toggleAllOutlineSections(): void {
    outlineCollapsedSections.value = allOutlineSectionsCollapsed.value
      ? new Set()
      : new Set(allCollapsibleOutlineIds.value);
  }

  function headingIdInView(editor: Editor): string | null {
    const page = pageRef.value;
    if (!page) return null;
    const pageTop = page.getBoundingClientRect().top;
    const line = pageTop + Math.min(120, page.clientHeight * 0.25);
    const headings = documentOutline(editor.state.doc).flatMap((entry) => {
      const dom = editor.view.nodeDOM(entry.pos);
      if (!(dom instanceof HTMLElement) || dom.getClientRects().length === 0) return [];
      return [{ id: entry.id, top: dom.getBoundingClientRect().top }];
    });
    const reading = headingIdAtReadingLine(headings, line);
    if (reading) return reading;
    const screenBottom = pageTop + page.clientHeight;
    return headings.find((heading) => heading.top < screenBottom)?.id ?? null;
  }

  function syncActiveOutlineHeading(editor: Editor): void {
    const id = headingIdInView(editor);
    if (id === activeOutlineHeadingId.value) return;
    activeOutlineHeadingId.value = id;
    if (id && outlineIsDesktop.value) void nextTick(() => scrollOutlineItemIntoView('.text-doc-outline-panel-inner', id));
  }

  function scrollOutlineItemIntoView(containerSelector: string, headingId: string): void {
    const container = document.querySelector(containerSelector);
    const item = Array.from(container?.querySelectorAll<HTMLElement>('[data-outline-item]') ?? [])
      .find((el) => el.dataset.outlineItem === headingId);
    if (!(container instanceof HTMLElement) || !(item instanceof HTMLElement)) return;
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    if (itemTop < container.scrollTop) container.scrollTop = itemTop;
    else if (itemBottom > container.scrollTop + container.clientHeight) container.scrollTop = itemBottom - container.clientHeight;
  }

  function navigateFromOutline(position: number, headingId?: string): void {
    const editor = getEditor();
    if (!editor) return;
    focusHeading(editor, position);
    activeOutlineHeadingId.value = headingId ?? null;
    if (!outlineIsDesktop.value) {
      outlineMobileOpen.value = false;
      return;
    }
    if (headingId) void nextTick(() => scrollOutlineItemIntoView('.text-doc-outline-panel-inner', headingId));
  }

  function onOutlineLinkHover(event: MouseEvent): void {
    const link = event.currentTarget as HTMLElement;
    link.title = link.scrollWidth > link.clientWidth ? link.textContent?.trim() ?? '' : '';
  }

  const outlineLabels = computed<TextDocumentOutlineLabels>(() => ({
    title: t('outlineTitle'),
    empty: t('outlineEmpty'),
    toggle: t('outlineToggle'),
    hide: t('outlineHide'),
    show: t('outlineShow'),
    collapseSection: t('outlineCollapseSection'),
    expandSection: t('outlineExpandSection'),
    expandAll: t('outlineExpandAll'),
    collapseAll: t('outlineCollapseAll'),
  }));

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', updateOutlineIsDesktop);
      window.removeEventListener('keydown', onOutlineMobileEscape);
      window.removeEventListener('mousemove', onOutlineResizeMove);
      window.removeEventListener('mouseup', stopOutlineResize);
    }
    document.body.classList.remove('text-doc-outline-resizing');
  });

  return {
    outlineIsDesktop,
    outlineMobileOpen,
    outlinePanelOpen,
    outlineWidth,
    outlineResizing,
    outlineEntries,
    outlineVisibleRows,
    outlineCollapsedSections,
    activeOutlineHeadingId,
    outlineLabels,
    allOutlineSectionsCollapsed,
    hasCollapsibleOutline,
    toggleOutlinePanel,
    closeOutlineMobile,
    navigateFromOutline,
    toggleOutlineSection,
    toggleAllOutlineSections,
    startOutlineResize,
    stopOutlineResize,
    resetOutlineWidth,
    onOutlineLinkHover,
    syncActiveOutlineHeading,
  };
}

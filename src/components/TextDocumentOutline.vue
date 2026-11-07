<template>
  <aside
    v-if="isDesktop"
    class="text-doc-outline-panel"
    :class="{ 'text-doc-outline-panel-collapsed': !panelOpen, 'text-doc-outline-panel-resizing': resizing }"
    :style="panelOpen ? { width: width + 'px', flexBasis: width + 'px' } : {}"
    :aria-label="labels.title"
  >
    <div v-if="panelOpen" class="text-doc-outline-panel-inner">
      <div class="text-doc-outline-panel-title">
        <span class="text-doc-outline-panel-title-text">{{ labels.title }}</span>
        <button
          v-if="hasCollapsible"
          type="button"
          class="btn-ghost text-doc-outline-expand-all"
          :title="allSectionsCollapsed ? labels.expandAll : labels.collapseAll"
          :aria-label="allSectionsCollapsed ? labels.expandAll : labels.collapseAll"
          @click="emit('toggle-all')"
        ><ChevronsUpDown v-if="allSectionsCollapsed" :size="15" aria-hidden="true" /><ChevronsDownUp v-else :size="15" aria-hidden="true" /></button>
      </div>
      <ol v-if="visibleRows.length" class="text-doc-outline-list">
        <li
          v-for="row in visibleRows"
          :key="row.entry.id"
          class="text-doc-outline-item"
          :class="{ 'text-doc-outline-item-active': row.entry.id === activeHeadingId }"
          :data-level="row.entry.level"
          :data-outline-item="row.entry.id"
        >
          <button
            v-if="row.hasChildren"
            type="button"
            class="text-doc-outline-chevron"
            :title="collapsedSections.has(row.entry.id) ? labels.expandSection : labels.collapseSection"
            :aria-label="collapsedSections.has(row.entry.id) ? labels.expandSection : labels.collapseSection"
            :aria-expanded="!collapsedSections.has(row.entry.id)"
            @mousedown.stop.prevent
            @click="emit('toggle-section', row.entry.id)"
          ><ChevronRight v-if="collapsedSections.has(row.entry.id)" :size="13" aria-hidden="true" /><ChevronDown v-else :size="13" aria-hidden="true" /></button>
          <span v-else class="text-doc-outline-chevron-spacer" aria-hidden="true"></span>
          <button
            type="button"
            class="text-doc-outline-link"
            @mousedown.prevent
            @click="emit('navigate', row.entry.pos, row.entry.id)"
            @mouseenter="emit('outline-link-hover', $event)"
          >
            {{ row.entry.text || labels.empty }}
          </button>
        </li>
      </ol>
      <div v-else class="text-doc-outline-empty">{{ labels.empty }}</div>
    </div>
    <div
      v-if="panelOpen"
      class="text-doc-outline-resize-handle"
      @mousedown="emit('start-resize', $event)"
      @dblclick="emit('reset-width')"
    ></div>
    <button
      type="button"
      class="text-doc-outline-collapse-toggle"
      :title="panelOpen ? labels.hide : labels.show"
      :aria-label="panelOpen ? labels.hide : labels.show"
      :aria-pressed="!panelOpen"
      @click="emit('toggle-panel')"
    ><PanelLeftClose v-if="panelOpen" :size="16" aria-hidden="true" /><PanelLeftOpen v-else :size="16" aria-hidden="true" /></button>
  </aside>

  <Teleport to="body">
    <div v-if="!isDesktop && mobileOpen" class="text-doc-outline-drawer-backdrop" @click="emit('close-mobile')"></div>
    <div v-if="!isDesktop && mobileOpen" class="text-doc-outline-drawer" role="dialog" :aria-label="labels.title">
      <div class="text-doc-outline-drawer-title">{{ labels.title }}</div>
      <ol v-if="entries.length" class="text-doc-outline-list">
        <li
          v-for="entry in entries"
          :key="entry.id"
          class="text-doc-outline-item"
          :class="{ 'text-doc-outline-item-active': entry.id === activeHeadingId }"
          :data-level="entry.level"
          :data-outline-item="entry.id"
          :aria-current="entry.id === activeHeadingId ? 'location' : undefined"
        >
          <button type="button" class="text-doc-outline-link" @mousedown.prevent @click="emit('navigate', entry.pos, entry.id)">
            {{ entry.text || labels.empty }}
          </button>
        </li>
      </ol>
      <div v-else class="text-doc-outline-empty">{{ labels.empty }}</div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { PropType } from 'vue';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, PanelLeftClose, PanelLeftOpen } from '@lucide/vue';
import type { HeadingOutlineEntry } from '../documents/heading-anchors';
import type { OutlineVisibleRow } from '../text-documents/outline-tree';
import type { TextDocumentOutlineLabels } from '../composables/useTextDocumentOutline';

defineProps({
  isDesktop: { type: Boolean, required: true },
  panelOpen: { type: Boolean, required: true },
  mobileOpen: { type: Boolean, required: true },
  resizing: { type: Boolean, required: true },
  width: { type: Number, required: true },
  labels: { type: Object as PropType<TextDocumentOutlineLabels>, required: true },
  entries: { type: Array as PropType<HeadingOutlineEntry[]>, required: true },
  visibleRows: { type: Array as PropType<OutlineVisibleRow[]>, required: true },
  collapsedSections: { type: Object as PropType<ReadonlySet<string>>, required: true },
  activeHeadingId: { type: String as PropType<string | null>, default: null },
  allSectionsCollapsed: { type: Boolean, required: true },
  hasCollapsible: { type: Boolean, required: true },
});

const emit = defineEmits<{
  (event: 'toggle-panel'): void;
  (event: 'close-mobile'): void;
  (event: 'navigate', position: number, headingId: string): void;
  (event: 'toggle-section', headingId: string): void;
  (event: 'toggle-all'): void;
  (event: 'start-resize', mouseEvent: MouseEvent): void;
  (event: 'reset-width'): void;
  (event: 'outline-link-hover', mouseEvent: MouseEvent): void;
}>();
</script>

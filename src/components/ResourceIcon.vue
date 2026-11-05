<template>
  <!-- One icon per kind of resource, everywhere a resource is listed (cards,
       sidebar, Drive, filters, the Add dialog). Canvas / document / HTML use
       the Add dialog's own icons, so "what I create" and "what I see" match;
       each template kind has its own icon instead of an emoji. Colour per
       kind comes from --resource-icon-* (style.css, both themes). -->
  <span class="resource-title-icon resource-icon" :data-resource-kind="key">
    <component :is="icon" :size="size" :stroke-width="1.9" aria-hidden="true" />
  </span>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import { File as FileIcon, FileCode2, FilePlus2, FileText, LayoutTemplate, SquareKanban, Swords } from '@lucide/vue';
import { resourceIconKey, type ResourceIconKey } from './resource-icon';

const props = withDefaults(
  defineProps<{
    /** canvas | text-document | html-document | interactive-template | board | sheet | file */
    kind: string | null | undefined;
    /** For an interactive template: trello-board / dnd-character. */
    templateType?: string | null;
    size?: number;
  }>(),
  { templateType: null, size: 16 },
);

const ICONS: Record<ResourceIconKey, Component> = {
  canvas: FilePlus2,
  'text-document': FileText,
  'html-document': FileCode2,
  board: SquareKanban,
  sheet: Swords,
  template: LayoutTemplate,
  file: FileIcon,
};

const key = computed(() => resourceIconKey(props.kind, props.templateType));
const icon = computed(() => ICONS[key.value]);
</script>

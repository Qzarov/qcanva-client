<template>
  <div
    v-if="open"
    class="text-doc-mention-menu"
    :style="style"
    role="listbox"
    :aria-label="t('mentionMenu')"
  >
    <button
      v-for="(item, index) in items"
      :key="itemKey(item)"
      class="text-doc-mention-item"
      :class="{ active: index === activeIndex }"
      :data-mention-item="itemKey(item)"
      role="option"
      :aria-selected="index === activeIndex"
      type="button"
      @mousedown.prevent="emit('select', index)"
      @mouseenter="emit('hover', index)"
    >
      <template v-if="item.kind === 'document'">
        <span class="text-doc-mention-item-icon" v-html="documentIcon"></span>
        <span class="text-doc-mention-item-label">{{ item.title }}</span>
      </template>
      <template v-else-if="item.kind === 'heading'">
        <span class="text-doc-mention-item-icon" v-html="headingIcon"></span>
        <span class="text-doc-mention-item-label">{{ item.label || t('untitledHeading') }}</span>
      </template>
      <template v-else>
        <span class="text-doc-mention-item-icon" v-html="createIcon"></span>
        <span class="text-doc-mention-item-label">{{ item.query.trim() ? `${t('mentionCreatePagePrefix')} "${item.query}"` : t('mentionCreateBlankPage') }}</span>
      </template>
    </button>
    <div v-if="!items.length" class="text-doc-mention-empty">{{ t('mentionNoResults') }}</div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '../composables/useI18n';
import type { MentionMenuItem } from '../text-documents/mention-menu';

defineProps<{
  open: boolean;
  items: readonly MentionMenuItem[];
  activeIndex: number;
  style?: Record<string, string>;
  documentIcon: string;
  headingIcon: string;
  createIcon: string;
}>();

const emit = defineEmits<{
  select: [index: number];
  hover: [index: number];
}>();

const { t } = useI18n();
const itemKey = (item: MentionMenuItem) => item.kind === 'document' ? item.id : item.kind === 'heading' ? `h-${item.headingId}` : 'create';
</script>

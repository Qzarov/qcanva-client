<template>
  <div
    v-if="open"
    class="text-doc-slash-menu"
    :style="style"
    role="listbox"
    :aria-label="t('slashMenu')"
  >
    <button
      v-for="(item, index) in items"
      :key="item.id"
      class="text-doc-slash-item"
      :class="{ active: index === activeIndex }"
      :data-slash-item="item.id"
      role="option"
      :aria-selected="index === activeIndex"
      type="button"
      @mousedown.prevent="emit('select', index)"
      @mouseenter="emit('hover', index)"
    >
      <span class="text-doc-slash-icon" v-html="item.icon"></span>
      <span class="text-doc-slash-label">{{ t(item.labelKey) }}</span>
    </button>
    <div v-if="!items.length" class="text-doc-slash-empty">{{ t('slashNoResults') }}</div>
  </div>

  <Teleport to="body">
    <div v-if="open" class="text-doc-slash-sheet-backdrop" @click="emit('cancel')"></div>
    <div v-if="open" class="text-doc-slash-sheet" role="listbox" :aria-label="t('slashMenu')">
      <div class="text-doc-slash-sheet-title">
        {{ t('slashMenu') }}
        <button type="button" class="text-doc-slash-sheet-close" :aria-label="t('close')" @click="emit('cancel')">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
      <div class="text-doc-slash-sheet-list">
        <button
          v-for="(item, index) in items"
          :key="item.id"
          class="text-doc-slash-item text-doc-slash-sheet-item"
          :class="{ active: index === activeIndex }"
          :data-slash-item="item.id"
          role="option"
          :aria-selected="index === activeIndex"
          type="button"
          @click="emit('select', index)"
        >
          <span class="text-doc-slash-icon" v-html="item.icon"></span>
          <span class="text-doc-slash-label">{{ t(item.labelKey) }}</span>
        </button>
        <div v-if="!items.length" class="text-doc-slash-empty">{{ t('slashNoResults') }}</div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from '@lucide/vue';
import { useI18n } from '../composables/useI18n';
import type { SlashMenuItem } from '../text-documents/slash-menu';

defineProps<{
  open: boolean;
  items: readonly SlashMenuItem[];
  activeIndex: number;
  style?: Record<string, string>;
}>();

const emit = defineEmits<{
  select: [index: number];
  cancel: [];
  hover: [index: number];
}>();

const { t } = useI18n();
</script>

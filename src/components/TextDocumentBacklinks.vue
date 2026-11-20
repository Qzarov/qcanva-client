<template>
  <section v-if="loaded" class="text-doc-backlinks">
    <button
      type="button"
      class="text-doc-backlinks-head"
      :aria-expanded="expanded"
      aria-controls="text-doc-backlinks-panel"
      @click="emit('toggle')"
    >
      <span class="text-doc-backlinks-icon" v-html="backlinksIcon" aria-hidden="true"></span>
      <span class="text-doc-backlinks-title">{{ t('backlinksTitle') }}</span>
      <span class="text-doc-backlinks-count" data-backlinks-count>{{ items.length }}</span>
      <ChevronDown v-if="expanded" class="text-doc-backlinks-chevron" :size="16" aria-hidden="true" />
      <ChevronRight v-else class="text-doc-backlinks-chevron" :size="16" aria-hidden="true" />
    </button>
    <div v-if="expanded" id="text-doc-backlinks-panel" class="text-doc-backlinks-panel">
      <p class="text-doc-backlinks-hint">{{ t('backlinksDelayHint') }}</p>
      <ul v-if="items.length" class="text-doc-backlinks-list">
        <li v-for="item in items" :key="item.id">
          <button
            type="button"
            class="text-doc-backlink-item"
            :class="{ 'text-doc-backlink-item-inaccessible': !item.accessible }"
            :data-backlink-id="item.id"
            :data-backlink-state="item.accessible ? 'accessible' : 'inaccessible'"
            @click="emit('open', item)"
          >
            <span class="text-doc-backlink-item-icon" v-html="mentionDocumentIcon" aria-hidden="true"></span>
            <span class="text-doc-backlink-item-label">{{ item.title }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="text-doc-backlinks-empty">{{ t('backlinksEmpty') }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ChevronDown, ChevronRight } from '@lucide/vue';
import { useI18n } from '../composables/useI18n';
import type { BacklinkItem } from '../api/client';

defineProps<{
  loaded: boolean;
  expanded: boolean;
  items: readonly BacklinkItem[];
  backlinksIcon: string;
  mentionDocumentIcon: string;
}>();

const emit = defineEmits<{
  toggle: [];
  open: [item: BacklinkItem];
}>();

const { t } = useI18n();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="text-doc-share-backdrop" @click="emit('close')"></div>
    <section v-if="open" class="html-history-panel text-doc-history-panel" role="dialog" aria-modal="true" :aria-label="labels.title" @click.stop>
      <div class="html-history-list">
        <div class="html-history-head">
          <strong>{{ labels.title }}</strong>
          <button class="btn-ghost btn-sm" @click="emit('close')">x</button>
        </div>
        <div v-if="loading" class="html-history-empty">{{ labels.loading }}</div>
        <button v-for="entry in items" :key="entry.id" class="html-history-item" :class="{ active: selected?.id === entry.id }" @click="emit('select', entry)">
          <span>{{ labels.revision }} {{ entry.revision }}</span>
          <small>{{ new Date(entry.createdAt).toLocaleString() }}</small>
        </button>
        <div v-if="!loading && !items.length" class="html-history-empty">{{ labels.empty }}</div>
      </div>
      <div class="html-history-preview">
        <div v-if="!selected" class="html-history-empty">{{ labels.select }}</div>
        <template v-else>
          <div class="html-history-preview-head">
            <div>
              <strong>{{ labels.revision }} {{ selected.revision }}</strong>
              <small>{{ selected.plainText || labels.snapshot }}</small>
            </div>
            <button v-if="canEdit" class="btn-ghost btn-sm" :disabled="restoring" @click="emit('restore')">
              {{ restoring ? labels.restoring : labels.restore }}
            </button>
          </div>
          <div class="text-doc-history-preview" v-html="selected.html"></div>
        </template>
      </div>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import type { PropType } from 'vue';

export type TextDocumentHistoryEntry = {
  id: string;
  revision: number;
  createdAt: string;
};

export type TextDocumentHistorySnapshot = {
  id?: string;
  revision: number;
  plainText?: string;
  html: string;
};

export type TextDocumentHistoryLabels = {
  title: string;
  loading: string;
  revision: string;
  empty: string;
  select: string;
  snapshot: string;
  restore: string;
  restoring: string;
};

defineProps({
  open: { type: Boolean, required: true },
  loading: { type: Boolean, required: true },
  items: { type: Array as PropType<TextDocumentHistoryEntry[]>, required: true },
  selected: { type: Object as PropType<TextDocumentHistorySnapshot | null>, default: null },
  canEdit: { type: Boolean, required: true },
  restoring: { type: Boolean, required: true },
  labels: { type: Object as PropType<TextDocumentHistoryLabels>, required: true },
});

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'select', entry: TextDocumentHistoryEntry): void;
  (event: 'restore'): void;
}>();
</script>

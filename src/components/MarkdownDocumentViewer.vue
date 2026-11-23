<template>
  <div
    ref="rootEl"
    class="text-doc-page markdown-doc-viewer"
    role="dialog"
    aria-modal="true"
    :aria-label="item.name"
    tabindex="-1"
    data-markdown-viewer
    @keydown="onKeydown"
  >
    <header class="text-doc-topbar markdown-doc-topbar">
      <div class="markdown-doc-topbar-left">
        <button
          type="button"
          class="btn-ghost back-btn"
          :aria-label="t('back')"
          :title="t('back')"
          data-md-close
          @click="close"
        >
          <ArrowLeft :size="16" aria-hidden="true" />
          <span class="back-btn-label">{{ t('back') }}</span>
        </button>
        <button
          v-if="mode === 'preview' && rendered.headings.length > 0"
          type="button"
          class="btn-ghost text-doc-outline-btn"
          :class="{ active: outlineOpen }"
          :title="outlineOpen ? t('outlineHide') : t('outlineShow')"
          :aria-label="outlineOpen ? t('outlineHide') : t('outlineShow')"
          :aria-pressed="outlineOpen"
          data-md-outline-toggle
          @click="outlineOpen = !outlineOpen"
        >
          <ListTree :size="17" aria-hidden="true" />
        </button>
      </div>

      <div class="text-doc-topbar-actions markdown-doc-topbar-actions">
        <div class="markdown-doc-modes" role="group">
          <button
            type="button"
            class="btn-ghost markdown-doc-icon-btn"
            :class="{ active: mode === 'preview' }"
            :title="t('previewTab')"
            :aria-label="t('previewTab')"
            :aria-pressed="mode === 'preview'"
            data-md-mode="preview"
            @click="setMode('preview')"
          >
            <Eye :size="17" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="btn-ghost markdown-doc-icon-btn"
            :class="{ active: mode === 'source' }"
            :title="t('sourceTab')"
            :aria-label="t('sourceTab')"
            :aria-pressed="mode === 'source'"
            data-md-mode="source"
            @click="setMode('source')"
          >
            <Code2 :size="17" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          class="btn-ghost text-doc-fullscreen-btn markdown-doc-desktop-only"
          :class="{ active: fullscreen }"
          :title="fullscreen ? t('docFullscreenExit') : t('docFullscreen')"
          :aria-label="fullscreen ? t('docFullscreenExit') : t('docFullscreen')"
          :aria-pressed="fullscreen"
          data-md-fullscreen
          @click="fullscreen = !fullscreen"
        >
          <Minimize2 v-if="fullscreen" :size="17" aria-hidden="true" />
          <Maximize2 v-else :size="17" aria-hidden="true" />
        </button>

        <button
          v-if="item.openAsDocument"
          type="button"
          class="btn-ghost btn-sm markdown-doc-action-btn"
          :disabled="loading || Boolean(loadError) || converting || saving"
          :title="t('markdownOpenAsDoc')"
          :aria-label="t('markdownOpenAsDoc')"
          data-md-open-as-doc
          @click="onOpenAsDocument"
        >
          <FileText :size="16" aria-hidden="true" />
          <span class="markdown-doc-action-label">{{ t('markdownOpenAsDoc') }}</span>
        </button>

        <button
          v-if="item.save && (mode === 'source' || isDirty)"
          type="button"
          class="btn-primary btn-sm markdown-doc-action-btn"
          :disabled="loading || Boolean(loadError) || saving || !isDirty"
          :title="t('driveSave')"
          :aria-label="t('driveSave')"
          data-md-save
          @click="onSave"
        >
          <Save :size="16" aria-hidden="true" />
          <span class="markdown-doc-action-label">{{ t('driveSave') }}</span>
        </button>

        <button
          type="button"
          class="btn-ghost markdown-doc-icon-btn"
          :title="t('download')"
          :aria-label="t('download')"
          data-md-download
          @click="onDownload"
        >
          <Download :size="17" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div class="text-doc-body markdown-doc-body">
      <aside
        v-if="mode === 'preview' && rendered.headings.length > 0 && outlineOpen"
        class="markdown-doc-outline"
        :aria-label="t('outlineTitle')"
        data-md-outline
      >
        <div class="markdown-doc-outline-head">
          <strong>{{ t('outlineTitle') }}</strong>
        </div>
        <nav class="markdown-doc-outline-list" :aria-label="t('outlineTitle')">
          <button
            v-for="heading in rendered.headings"
            :key="heading.id"
            type="button"
            class="markdown-doc-outline-item"
            :class="{ active: activeHeadingId === heading.id }"
            :style="{ '--md-heading-level': Math.max(1, heading.level) }"
            :data-md-outline-item="heading.id"
            @click="scrollToHeading(heading.id)"
          >
            {{ heading.text }}
          </button>
        </nav>
      </aside>

      <main class="text-doc-editor-shell" :class="{ 'text-doc-editor-shell--full': fullscreen }">
        <article
          class="text-doc-paper markdown-doc-paper"
          :class="{ readonly: mode === 'preview' }"
          data-md-paper
        >
          <div class="markdown-doc-meta">
            <ResourceIcon kind="text-document" :size="15" aria-hidden="true" />
            <span class="folder-file-ext">{{ extensionLabel }}</span>
            <span class="markdown-doc-filename" data-md-filename>{{ item.name }}</span>
            <span v-if="dateLabel" class="markdown-doc-date" data-md-date>{{ dateLabel }}</span>
          </div>

          <h1 class="text-doc-title-page-readonly" data-md-title>{{ displayTitle }}</h1>

          <p v-if="actionError" class="markdown-doc-alert" role="alert" data-md-action-error>
            {{ actionError }}
          </p>

          <div v-if="loading" class="markdown-doc-status" data-md-loading>
            {{ t('driveLoading') }}
          </div>

          <div v-else-if="loadError" class="markdown-doc-error" role="alert" data-md-error>
            <p class="markdown-doc-error-text">{{ loadError }}</p>
            <div class="markdown-doc-error-actions">
              <button type="button" class="btn-ghost btn-sm" data-md-retry @click="load">
                {{ t('retry') }}
              </button>
              <button type="button" class="btn-ghost btn-sm" data-md-error-download @click="onDownload">
                {{ t('download') }}
              </button>
            </div>
          </div>

          <textarea
            v-else-if="mode === 'source'"
            ref="sourceEl"
            v-model="draftContent"
            class="markdown-doc-source"
            :aria-label="item.name"
            spellcheck="false"
            data-md-source
          ></textarea>

          <div
            v-else-if="rendered.html"
            class="ProseMirror markdown-doc-content"
            data-md-content
            v-html="rendered.html"
          ></div>

          <p v-else class="markdown-doc-empty" data-md-empty>
            {{ t('markdownEmpty') }}
          </p>
        </article>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import {
  ArrowLeft,
  Code2,
  Download,
  Eye,
  FileText,
  ListTree,
  Maximize2,
  Minimize2,
  Save,
} from '@lucide/vue';
import ResourceIcon from './ResourceIcon.vue';
import { getFileExtension } from '../api/drive';
import { useBackHandler } from '../composables/useBackHandler';
import { useI18n } from '../composables/useI18n';
import { importTitle } from '../dashboard/import-files';
import { downloadMarkdownBlob, renderMarkdownDocument } from '../documents/markdown-viewer';

export type MarkdownViewerItem = {
  key: string;
  name: string;
  date?: string | null;
  loadText: () => Promise<string>;
  download: () => void | Promise<void>;
  save?: (content: string) => Promise<void>;
  openAsDocument?: (content: string, title: string) => Promise<void>;
};

const props = defineProps<{ item: MarkdownViewerItem }>();
const emit = defineEmits<{ close: [] }>();
const { t, locale } = useI18n();

const rootEl = ref<HTMLElement | null>(null);
const sourceEl = ref<HTMLTextAreaElement | null>(null);
const mode = ref<'preview' | 'source'>('preview');
const fullscreen = ref(false);
const outlineOpen = ref(typeof window !== 'undefined' ? window.innerWidth >= 960 : true);
const activeHeadingId = ref<string | null>(null);

const loading = ref(false);
const loadError = ref('');
const actionError = ref('');
const saving = ref(false);
const converting = ref(false);

const savedContent = ref('');
const draftContent = ref('');
const hasLoaded = ref(false);

const isDirty = computed(() => hasLoaded.value && draftContent.value !== savedContent.value);
const displayTitle = computed(() => importTitle(props.item.name) || props.item.name || t('untitled'));
const extensionLabel = computed(() => getFileExtension(props.item.name));
const rendered = computed(() => renderMarkdownDocument(draftContent.value));

const dateLabel = computed(() => {
  const value = props.item.date;
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
});

let loadSeq = 0;
async function load() {
  const currentSeq = ++loadSeq;
  loading.value = true;
  loadError.value = '';
  actionError.value = '';
  hasLoaded.value = false;
  try {
    const text = await props.item.loadText();
    if (currentSeq !== loadSeq) return;
    savedContent.value = text;
    draftContent.value = text;
    hasLoaded.value = true;
    activeHeadingId.value = renderMarkdownDocument(text).headings[0]?.id ?? null;
  } catch (err) {
    if (currentSeq !== loadSeq) return;
    loadError.value = err instanceof Error && err.message ? err.message : t('markdownLoadFailed');
  } finally {
    if (currentSeq === loadSeq) {
      loading.value = false;
    }
  }
}

watch(
  () => props.item.key,
  () => {
    mode.value = 'preview';
    void load();
  },
);

function setMode(next: 'preview' | 'source') {
  mode.value = next;
  if (next === 'source') {
    void nextTick(() => sourceEl.value?.focus());
  }
}

function scrollToHeading(id: string) {
  activeHeadingId.value = id;
  const target = rootEl.value?.querySelector<HTMLElement>(`[id="${id}"]`) ?? document.getElementById(id);
  target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

async function onDownload() {
  actionError.value = '';
  if (hasLoaded.value && isDirty.value) {
    downloadMarkdownBlob(draftContent.value, props.item.name);
    return;
  }
  try {
    await props.item.download();
  } catch (err) {
    actionError.value = err instanceof Error && err.message ? err.message : t('driveDownloadLinkFailed');
  }
}

async function onSave() {
  if (!props.item.save || saving.value || !isDirty.value) return;
  saving.value = true;
  actionError.value = '';
  try {
    await props.item.save(draftContent.value);
    savedContent.value = draftContent.value;
  } catch (err) {
    actionError.value = err instanceof Error && err.message ? err.message : t('markdownSaveFailed');
  } finally {
    saving.value = false;
  }
}

async function onOpenAsDocument() {
  if (!props.item.openAsDocument || converting.value) return;
  converting.value = true;
  actionError.value = '';
  try {
    await props.item.openAsDocument(draftContent.value, displayTitle.value);
    close();
  } catch (err) {
    actionError.value = err instanceof Error && err.message ? err.message : t('markdownOpenAsDocFailed');
  } finally {
    converting.value = false;
  }
}

function close() {
  loadSeq += 1;
  emit('close');
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (event.target instanceof HTMLTextAreaElement && mode.value === 'source') {
      mode.value = 'preview';
      event.preventDefault();
      void nextTick(() => rootEl.value?.focus());
      return;
    }
    event.preventDefault();
    close();
  }
}

useBackHandler(() => {
  close();
  return true;
});

onMounted(async () => {
  void load();
  await nextTick();
  rootEl.value?.focus();
});
</script>

<style scoped>
.markdown-doc-viewer {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  outline: none;
}

.markdown-doc-topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.markdown-doc-modes {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--ui-glass-border, var(--ui-border));
  background: var(--ui-surface-subtle);
}

.markdown-doc-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
}

.markdown-doc-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 12px;
  font-weight: 600;
}

.markdown-doc-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.markdown-doc-outline {
  width: 240px;
  flex-shrink: 0;
  border-right: 1px solid var(--ui-glass-border, var(--ui-border));
  padding: 20px 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.markdown-doc-outline-head {
  padding: 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted);
}

.markdown-doc-outline-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.markdown-doc-outline-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 8px;
  padding-left: calc(8px + (var(--md-heading-level, 1) - 1) * 12px);
  border: none;
  border-radius: var(--radius-sm, 6px);
  background: transparent;
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 13px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.markdown-doc-outline-item:hover,
.markdown-doc-outline-item.active {
  background: var(--ui-surface-subtle);
  color: var(--ui-text);
}

.markdown-doc-outline-item.active {
  color: var(--ui-accent-strong);
  font-weight: 600;
}

.markdown-doc-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--ui-text-muted);
}

.markdown-doc-filename {
  font-family: 'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: var(--ui-text-secondary);
}

.markdown-doc-date {
  margin-left: auto;
}

.markdown-doc-status,
.markdown-doc-empty {
  padding: 24px 0;
  color: var(--ui-text-muted);
  font-size: 15px;
}

.markdown-doc-alert,
.markdown-doc-error {
  margin: 12px 0 18px;
  padding: 12px 14px;
  border-radius: var(--radius-md, 10px);
  border: 1px solid color-mix(in srgb, var(--ui-danger, #ef4444) 40%, transparent);
  background: var(--ui-danger-soft, rgba(239, 68, 68, 0.1));
  color: var(--ui-danger-foreground, #fca5a5);
  font-size: 14px;
}

.markdown-doc-error-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.markdown-doc-source {
  display: block;
  width: 100%;
  min-height: 58vh;
  padding: 14px 16px;
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--ui-glass-border, var(--ui-border));
  background: var(--ui-surface-subtle);
  color: var(--ui-text);
  font-family: 'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 14px;
  line-height: 1.65;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}

.markdown-doc-source:focus {
  border-color: var(--ui-accent-strong);
}

.markdown-doc-content {
  cursor: default;
}

.markdown-doc-content :deep(pre) {
  padding: 14px 16px;
  border-radius: var(--radius-md, 10px);
  background: var(--ui-surface-subtle);
  border: 1px solid var(--ui-glass-border, var(--ui-border));
  overflow-x: auto;
  font-family: 'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13.5px;
  line-height: 1.55;
  margin: 0.9em 0;
}

.markdown-doc-content :deep(code) {
  font-family: 'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.9em;
  padding: 0.15em 0.4em;
  border-radius: 5px;
  background: var(--ui-surface-subtle);
}

.markdown-doc-content :deep(pre code) {
  padding: 0;
  background: transparent;
  font-size: inherit;
}

.markdown-doc-content :deep(blockquote) {
  margin: 0.9em 0;
  padding: 8px 14px;
  border-left: 3px solid var(--ui-accent-strong);
  background: var(--ui-surface-subtle);
  border-radius: 0 var(--radius-sm, 6px) var(--radius-sm, 6px) 0;
}

.markdown-doc-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
}

.markdown-doc-content :deep(th),
.markdown-doc-content :deep(td) {
  padding: 8px 12px;
  border: 1px solid var(--content-document-border, var(--ui-border));
  text-align: left;
}

.markdown-doc-content :deep(th) {
  background: var(--ui-surface-subtle);
  font-weight: 600;
}

.markdown-doc-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius-sm, 6px);
}

@media (max-width: 760px) {
  .markdown-doc-desktop-only,
  .markdown-doc-action-label {
    display: none;
  }

  .markdown-doc-action-btn {
    width: 36px;
    padding: 0;
    justify-content: center;
  }

  .markdown-doc-body {
    flex-direction: column;
  }

  .markdown-doc-outline {
    width: 100%;
    max-height: 200px;
    border-right: none;
    border-bottom: 1px solid var(--ui-glass-border, var(--ui-border));
    box-sizing: border-box;
  }
}
</style>

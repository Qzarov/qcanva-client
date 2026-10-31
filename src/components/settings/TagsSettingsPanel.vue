<template>
  <!-- Every tag of the user's resources: rename it, recolour it, delete it.
       Used to be the dashboard's "Manage tags" dialog. -->
  <section class="settings-card tags-settings" data-settings-tags>
    <p v-if="loading" class="tags-settings-note">{{ t('loadingDots') }}</p>
    <p v-else-if="loadFailed" class="tags-settings-note tags-settings-note--error" role="alert">{{ t('tagsLoadFailed') }}</p>
    <p v-else-if="!items.length" class="tags-settings-note" data-tags-empty>{{ t('tagsEmpty') }}</p>
    <ul v-else class="tags-settings-list">
      <li v-for="tag in items" :key="tag.originalName" class="tags-settings-row" :data-tag-row="tag.originalName">
        <span class="tags-settings-swatch" :style="{ background: tag.color }" aria-hidden="true"></span>
        <input
          v-model.trim="tag.name"
          class="dashboard-modal-input tags-settings-name"
          :aria-label="t('tagName')"
          :placeholder="t('tagName')"
          :disabled="busy"
          @keydown.enter="save(tag)"
        />
        <div class="tags-settings-colors" role="radiogroup" :aria-label="t('tagColor')">
          <button
            v-for="color in TAG_COLORS"
            :key="color"
            type="button"
            role="radio"
            class="tags-settings-color"
            :class="{ active: tag.color === color }"
            :aria-checked="tag.color === color"
            :aria-label="color"
            :style="{ background: color }"
            :disabled="busy"
            @click="tag.color = color"
          ></button>
        </div>
        <span class="tags-settings-count">{{ t('tagUses').replace('{count}', String(tag.totalCount)) }}</span>
        <div class="tags-settings-actions">
          <button type="button" class="btn-ghost btn-sm" data-tag-save :disabled="busy || !tag.name || !changed(tag)" @click="save(tag)">{{ t('save') }}</button>
          <button type="button" class="btn-ghost btn-sm danger" data-tag-delete :disabled="busy" @click="remove(tag)">{{ t('delete') }}</button>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { tags as tagsApi, type ResourceTagSummary } from '../../api/client';
import { alertFailure, confirmDelete } from '../../composables/appDialog';
import { useToast } from '../../composables/useToast';
import { useI18n } from '../../composables/useI18n';
import { TAG_COLORS } from '../../dashboard/tag-colors';


type EditedTag = ResourceTagSummary & { originalName: string; originalColor: string };

const { t } = useI18n();
const { show: showToast } = useToast();
const items = ref<EditedTag[]>([]);
const loading = ref(true);
const loadFailed = ref(false);
const busy = ref(false);

const fill = (list: ResourceTagSummary[]) => {
  items.value = list.map((tag) => ({ ...tag, originalName: tag.name, originalColor: tag.color }));
};
const changed = (tag: EditedTag) => tag.name !== tag.originalName || tag.color !== tag.originalColor;

async function load() {
  loading.value = true;
  loadFailed.value = false;
  try {
    fill((await tagsApi.list()).tags);
  } catch {
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
}

async function save(tag: EditedTag) {
  if (busy.value || !tag.name || !changed(tag)) return;
  busy.value = true;
  try {
    fill((await tagsApi.update(tag.originalName, { name: tag.name, color: tag.color })).tags);
    showToast(t('tagSaved'), 'success');
  } catch (error) {
    await alertFailure('tagSaveFailed', error);
  } finally {
    busy.value = false;
  }
}

async function remove(tag: EditedTag) {
  if (busy.value) return;
  if (!(await confirmDelete('deleteTagTitle', tag.originalName, 'deleteTagNote'))) return;
  busy.value = true;
  try {
    fill((await tagsApi.delete(tag.originalName)).tags);
    showToast(t('tagDeleted'), 'success');
  } catch (error) {
    await alertFailure('tagDeleteFailed', error);
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.tags-settings { display: grid; gap: 4px; }
.tags-settings-note { margin: 0; color: var(--ui-text-secondary); font-size: 14px; }
.tags-settings-note--error { color: var(--ui-danger-foreground); }
.tags-settings-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.tags-settings-row {
  display: grid;
  grid-template-columns: 14px minmax(140px, 1fr) auto auto auto;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--ui-border);
}
.tags-settings-row:last-child { border-bottom: 0; }
.tags-settings-swatch { width: 14px; height: 14px; border-radius: 50%; }
.tags-settings-name { min-width: 0; margin: 0; }
.tags-settings-colors { display: flex; flex-wrap: wrap; gap: 4px; }
.tags-settings-color {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
}
.tags-settings-color.active { border-color: var(--ui-text); box-shadow: 0 0 0 2px var(--ui-surface); }
.tags-settings-color:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
.tags-settings-count { color: var(--ui-text-secondary); font-size: 12px; white-space: nowrap; }
.tags-settings-actions { display: flex; gap: 6px; }

/* A phone: name on its own line, then the colours, then the count and buttons. */
@media (max-width: 760px) {
  .tags-settings-row {
    grid-template-columns: 14px minmax(0, 1fr);
    row-gap: 8px;
  }
  .tags-settings-colors,
  .tags-settings-count,
  .tags-settings-actions { grid-column: 2; }
  .tags-settings-color { width: 28px; height: 28px; }
}
</style>

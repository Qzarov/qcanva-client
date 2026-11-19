<template>
  <!-- Add one of one's own QCanva folders to a shared space: the members then
       see everything in it, however deep, read-only. -->
  <Transition name="yandex-picker" appear @after-leave="emit('close')">
    <div v-if="visible" class="dashboard-modal-backdrop" data-space-folder-dialog @click.self="close">
      <div class="dashboard-modal">
        <div class="dashboard-modal-head">
          <h3>{{ t('spaceAddFolder') }}</h3>
          <button class="dashboard-modal-close" :aria-label="t('cancel')" @click="close">x</button>
        </div>
        <div class="folder-parent-list" data-space-folder-options>
          <p v-if="!folders.length" class="dashboard-modal-note">{{ t('spaceNoOwnFolders') }}</p>
          <button
            v-for="folder in folders"
            :key="folder.id"
            type="button"
            class="folder-parent-option folder-destination"
            :class="{ active: picked === folder.id }"
            :disabled="taken.includes(folder.id)"
            :style="{ paddingLeft: 12 + folder.depth * 16 + 'px' }"
            :data-space-folder-option="folder.id"
            @click="picked = folder.id"
          >
            <span class="folder-destination-name">
              <span v-if="folder.depth" class="folder-destination-branch" aria-hidden="true">└</span>
              {{ folder.name }}
            </span>
            <span class="folder-destination-path">{{ folder.path || t('inRoot') }}</span>
          </button>
        </div>
        <div class="dashboard-modal-actions dashboard-modal-actions-row">
          <button class="btn-ghost" :disabled="busy" @click="close">{{ t('cancel') }}</button>
          <button class="btn-primary" :disabled="busy || !picked" data-space-folder-confirm @click="picked && emit('confirm', picked)">{{ t('spaceAdd') }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from '../../composables/useI18n';

defineProps<{
  /** The user's own folders (only those can be added). */
  folders: ReadonlyArray<{ id: string; name: string; depth: number; path: string }>;
  /** Folders already in the space. */
  taken: readonly string[];
  busy?: boolean;
}>();
const emit = defineEmits<{ confirm: [folderId: string]; close: [] }>();
const { t } = useI18n();

const visible = ref(true);
const picked = ref<string | null>(null);

function close() {
  visible.value = false;
}
defineExpose({ close });
</script>

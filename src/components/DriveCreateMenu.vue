<template>
  <div class="drive-create-dropdown-container">
    <button
      type="button"
      class="drive-btn drive-btn-secondary"
      aria-haspopup="menu"
      :aria-expanded="open"
      data-create-button
      @click="emit('toggle')"
    >
      <Plus :size="16" aria-hidden="true" />
      <span>{{ t('driveCreate') }}</span>
    </button>
    <div v-if="open" class="drive-create-menu" role="menu" :aria-label="t('driveCreateMenuAria')" data-create-menu>
      <button type="button" role="menuitem" class="drive-create-menu-item" data-create-folder :aria-label="t('driveCreateFolder')" @click="emit('create-folder')">
        <FolderPlus :size="16" aria-hidden="true" />
        <span>{{ t('driveFolder') }}</span>
      </button>
      <button type="button" role="menuitem" class="drive-create-menu-item" data-create-canvas :aria-label="t('driveCreateCanvas')" @click="emit('create-canvas')">
        <ResourceIcon kind="canvas" aria-hidden="true" />
        <span>{{ t('driveCanvas') }}</span>
      </button>
      <button type="button" role="menuitem" class="drive-create-menu-item" data-create-doc :aria-label="t('driveCreateDocument')" @click="emit('create-document')">
        <ResourceIcon kind="text-document" aria-hidden="true" />
        <span>{{ t('driveDocument') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FolderPlus, Plus } from '@lucide/vue';
import ResourceIcon from './ResourceIcon.vue';
import { useI18n } from '../composables/useI18n';

defineProps<{ open: boolean }>();
const emit = defineEmits<{
  toggle: [];
  'create-folder': [];
  'create-canvas': [];
  'create-document': [];
}>();
const { t } = useI18n();
</script>

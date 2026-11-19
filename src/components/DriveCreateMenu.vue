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

<style scoped>
.drive-create-dropdown-container { position: relative; }

.drive-create-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  min-width: 170px;
  border-radius: 12px;
  background: var(--ui-surface-elevated, #1a201c);
  border: 1px solid var(--ui-border, #2a3a2e);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 100;
}

.drive-create-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  border: 0;
  background: transparent;
  color: var(--ui-text, #f8fff8);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.drive-create-menu-item:hover { background: rgba(255, 255, 255, 0.08); }
</style>

<template>
  <div :class="mobile ? 'drive-mobile-search-row' : 'drive-search-container'">
    <div class="drive-search-input-wrapper">
      <Search :size="16" class="drive-search-icon" aria-hidden="true" />
      <input
        :value="modelValue"
        type="search"
        class="drive-search-input"
        :placeholder="allDrive ? t('driveSearchAllDrive') : t('driveSearchCurrentFolder')"
        :data-drive-search="mobile ? undefined : ''"
        :data-drive-search-mobile="mobile ? '' : undefined"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button
        v-if="modelValue"
        type="button"
        class="drive-search-clear"
        :aria-label="t('driveClearSearch')"
        @click="emit('clear')"
      >
        <X :size="14" aria-hidden="true" />
      </button>
    </div>
    <label class="drive-scope-checkbox-label" :title="mobile ? undefined : t('driveScopeAllDriveTitle')">
      <input
        :checked="allDrive"
        type="checkbox"
        :data-search-scope-toggle="mobile ? undefined : ''"
        :data-search-scope-toggle-mobile="mobile ? '' : undefined"
        @change="emit('update:allDrive', ($event.target as HTMLInputElement).checked)"
      />
      <span>{{ t('driveScopeAllDrive') }}</span>
    </label>
  </div>
</template>

<script setup lang="ts">
import { Search, X } from '@lucide/vue';
import { useI18n } from '../composables/useI18n';

withDefaults(defineProps<{
  modelValue: string;
  allDrive: boolean;
  mobile?: boolean;
}>(), { mobile: false });

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:allDrive': [value: boolean];
  clear: [];
}>();

const { t } = useI18n();
</script>

<style scoped>
.drive-search-container {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drive-mobile-search-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 8px;
}

.drive-search-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 12px;
  border-radius: 12px;
  background: var(--ui-surface-subtle, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--ui-border, #2a3a2e);
  color: var(--ui-text-muted, #a8c6a8);
  width: 260px;
}

.drive-search-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  outline: none;
  color: var(--ui-text, #f8fff8);
  font: inherit;
  font-size: 13px;
}

.drive-search-clear {
  border: 0;
  background: transparent;
  color: var(--ui-text-muted, #a8c6a8);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
}

.drive-scope-checkbox-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ui-text-muted, #a8c6a8);
  cursor: pointer;
  user-select: none;
}
</style>

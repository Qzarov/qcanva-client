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

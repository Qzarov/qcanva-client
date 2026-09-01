<template>
  <div class="theme-selector" role="radiogroup" :aria-label="t('theme')">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      class="theme-selector-option"
      :class="{ active: preference === option.value }"
      :aria-checked="preference === option.value"
      :data-theme-choice="option.value"
      :aria-label="option.label"
      @click="setPreference(option.value)"
    >
      <span aria-hidden="true">{{ option.icon }}</span>
      <span v-if="!compact">{{ option.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from '../composables/useI18n';
import { useTheme } from '../composables/useTheme';
import type { ThemePreference } from '../theme/theme';

defineProps<{ compact?: boolean }>();

const { t } = useI18n();
const { preference, setPreference } = useTheme();
const options = computed(() => [
  { value: 'system' as ThemePreference, icon: '◐', label: t('themeSystem') },
  { value: 'light' as ThemePreference, icon: '☀', label: t('themeLight') },
  { value: 'dark' as ThemePreference, icon: '☾', label: t('themeDark') },
]);
</script>

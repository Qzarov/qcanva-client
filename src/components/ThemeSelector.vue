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

<style scoped>
.theme-selector {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

.theme-selector-option {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--ui-text-secondary);
  background: transparent;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
}

.theme-selector-option:hover {
  color: var(--ui-text);
  background: var(--ui-surface-subtle);
}

.theme-selector-option.active {
  border-color: var(--ui-border);
  color: var(--ui-text);
  background: var(--ui-brand-soft);
}

@media (prefers-reduced-motion: reduce) {
  .theme-selector-option {
    transition: none;
  }
}
</style>

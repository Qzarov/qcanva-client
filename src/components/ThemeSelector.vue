<template>
  <div class="theme-selector" role="radiogroup" :aria-label="t('theme')">
    <button
      v-for="(option, index) in options"
      :key="option.value"
      type="button"
      role="radio"
      class="theme-selector-option"
      :class="{ active: preference === option.value }"
      :aria-checked="preference === option.value"
      :tabindex="preference === option.value ? 0 : -1"
      :data-theme-choice="option.value"
      :aria-label="option.label"
      :ref="(element) => setOptionRef(element, index)"
      @click="setPreference(option.value)"
      @keydown="onKeydown($event, index)"
    >
      <span aria-hidden="true">{{ option.icon }}</span>
      <span v-if="!props.compact">{{ option.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, type ComponentPublicInstance } from 'vue';
import { useI18n } from '../composables/useI18n';
import { useTheme } from '../composables/useTheme';
import type { ThemePreference } from '../theme/theme';

const props = defineProps<{ compact?: boolean }>();

const { t } = useI18n();
const { preference, setPreference } = useTheme();
const options = computed(() => [
  { value: 'system' as ThemePreference, icon: '◐', label: t('themeSystem') },
  { value: 'light' as ThemePreference, icon: '☀', label: t('themeLight') },
  { value: 'dark' as ThemePreference, icon: '☾', label: t('themeDark') },
]);
const optionRefs = ref<(HTMLButtonElement | null)[]>([]);

const setOptionRef = (element: Element | ComponentPublicInstance | null, index: number) => {
  optionRefs.value[index] = element instanceof HTMLButtonElement ? element : null;
};

const focusOption = (index: number) => {
  optionRefs.value[index]?.focus();
};

const focusFirstChoice = () => {
  const activeIndex = options.value.findIndex((option) => option.value === preference.value);
  focusOption(activeIndex >= 0 ? activeIndex : 0);
};

const selectByIndex = (index: number) => {
  const option = options.value[index];
  if (!option) return;
  setPreference(option.value);
  void nextTick(() => focusOption(index));
};

const onKeydown = (event: KeyboardEvent, index: number) => {
  let targetIndex = index;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    targetIndex = (index + 1) % options.value.length;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    targetIndex = (index - 1 + options.value.length) % options.value.length;
  } else {
    return;
  }

  event.preventDefault();
  selectByIndex(targetIndex);
};

defineExpose({ focusFirstChoice });
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

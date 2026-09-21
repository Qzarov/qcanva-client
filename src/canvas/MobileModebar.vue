<template>
  <div class="mobile-modebar" role="toolbar" :aria-label="t('modeBar')">
    <button
      class="mobile-modebar-btn"
      :class="{ active: mode === 'hand' }"
      :aria-pressed="mode === 'hand'"
      :title="t('handMode')"
      :aria-label="t('handMode')"
      @click="setMode('hand')"
    >
      <!-- Hand / pan icon -->
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M18 11V8a2 2 0 0 0-4 0v3"/>
        <path d="M14 10V6a2 2 0 0 0-4 0v4"/>
        <path d="M10 9.5V4a2 2 0 0 0-4 0v9.5"/>
        <path d="M6 15l-.5-.5A3.5 3.5 0 0 0 2 18v1a5 5 0 0 0 5 5h6a5 5 0 0 0 5-5v-3a2 2 0 0 0-4 0"/>
      </svg>
      <span class="mobile-modebar-label">{{ t('handMode') }}</span>
    </button>
    <button
      class="mobile-modebar-btn"
      :class="{ active: mode === 'cursor' }"
      :aria-pressed="mode === 'cursor'"
      :title="t('cursorMode')"
      :aria-label="t('cursorMode')"
      @click="setMode('cursor')"
    >
      <!-- Cursor / select icon -->
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M5 3l14 9-7 1-4 7L5 3z"/>
      </svg>
      <span class="mobile-modebar-label">{{ t('cursorMode') }}</span>
    </button>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useMobileCanvasMode } from '../composables/useMobileCanvasMode';
import { useI18n } from '../composables/useI18n';

export default defineComponent({
  name: 'MobileModebar',
  setup() {
    const { mode, setMode } = useMobileCanvasMode();
    const { t } = useI18n();
    return { mode, setMode, t };
  },
});
</script>

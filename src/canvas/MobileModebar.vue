<template>
  <div class="mobile-modebar" role="toolbar" :aria-label="t('modeBar')">
    <button
      class="mobile-modebar-btn"
      :class="{ active: mode === 'hand' }"
      :aria-pressed="mode === 'hand'"
      :aria-label="t('handMode')"
      @touchstart.passive="lp.onTouchStart(t('handMode'), $event)"
      @touchmove.passive="lp.onTouchMove($event)"
      @touchend="lp.onTouchEnd()"
      @click="handleClick('hand')"
    >
      <!-- Hand / pan icon -->
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M18 11V8a2 2 0 0 0-4 0v3"/>
        <path d="M14 10V6a2 2 0 0 0-4 0v4"/>
        <path d="M10 9.5V4a2 2 0 0 0-4 0v9.5"/>
        <path d="M6 15l-.5-.5A3.5 3.5 0 0 0 2 18v1a5 5 0 0 0 5 5h6a5 5 0 0 0 5-5v-3a2 2 0 0 0-4 0"/>
      </svg>
    </button>
    <button
      class="mobile-modebar-btn"
      :class="{ active: mode === 'cursor' }"
      :aria-pressed="mode === 'cursor'"
      :aria-label="t('cursorMode')"
      @touchstart.passive="lp.onTouchStart(t('cursorMode'), $event)"
      @touchmove.passive="lp.onTouchMove($event)"
      @touchend="lp.onTouchEnd()"
      @click="handleClick('cursor')"
    >
      <!-- Cursor / select icon -->
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M5 3l14 9-7 1-4 7L5 3z"/>
      </svg>
    </button>
    <button
      class="mobile-modebar-btn"
      :class="{ active: mode === 'draw' }"
      :aria-pressed="mode === 'draw'"
      :aria-label="t('drawMode')"
      @touchstart.passive="lp.onTouchStart(t('drawMode'), $event)"
      @touchmove.passive="lp.onTouchMove($event)"
      @touchend="lp.onTouchEnd()"
      @click="handleClick('draw')"
    >
      <!-- Pencil / draw icon -->
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
      </svg>
    </button>

    <!-- Add button: action (not a mode), opens the create sheet -->
    <button
      class="mobile-modebar-btn mobile-modebar-add"
      :aria-label="t('add')"
      @touchstart.passive="lp.onTouchStart(t('add'), $event)"
      @touchmove.passive="lp.onTouchMove($event)"
      @touchend="lp.onTouchEnd()"
      @click="handleAdd"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </button>

    <!-- Long-press tooltip -->
    <div v-if="lp.tooltip.visible" class="mobile-modebar-tooltip" aria-hidden="true">
      {{ lp.tooltip.text }}
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { useMobileCanvasMode, type MobileCanvasMode } from '../composables/useMobileCanvasMode';
import { useI18n } from '../composables/useI18n';
import { useLongPressTooltip } from './useLongPressTooltip';

export default defineComponent({
  name: 'MobileModebar',
  emits: ['add'],
  setup(_, { emit }) {
    const { mode, setMode } = useMobileCanvasMode();
    const { t } = useI18n();
    const lp = useLongPressTooltip();

    function handleClick(m: MobileCanvasMode) {
      if (lp.wasConsumed()) return;
      setMode(m);
    }

    function handleAdd() {
      if (lp.wasConsumed()) return;
      emit('add');
    }

    return { mode, handleClick, handleAdd, t, lp };
  },
});
</script>

<template>
  <span ref="root" class="sheet-status" :class="'is-' + kind">
    <!-- Wide screens: the words, as before. They sit left of the buttons, so appearing and disappearing moves nothing. -->
    <span v-if="text" class="template-save-status sheet-status-text" :class="{ 'is-warning': kind === 'danger' || kind === 'notice' }">{{ text }}</span>
    <!-- Phones: a dot that is always there, so the header never jumps; the words are one tap away. -->
    <button type="button" class="sheet-status-dot" :aria-label="'Состояние листа: ' + hint" :aria-expanded="Boolean(open)" :aria-describedby="open ? tooltipId : undefined" @click="toggle('hint', $event)">
      <span aria-hidden="true"></span>
    </button>
    <Teleport to="body">
      <p v-if="open" :id="tooltipId" ref="popup" role="tooltip" class="sheet-status-hint" :class="'is-' + kind" :style="hintStyle">{{ hint }}</p>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { useSheetPopup } from '../composables/useSheetPopup';

/**
 * The sheet's connection and save state in the page header. On a phone the
 * text used to push the header's buttons around every time it changed; there
 * it is a coloured dot of fixed size, with the text in a hint.
 */
/** `notice` is a problem said once; `message` confirms an action ("Выбран режим: «Игра»"). Both pass by themselves. */
export type SheetStatusKind = 'ok' | 'saving' | 'info' | 'danger' | 'notice' | 'message';
const props = defineProps<{
  /** What to say; empty when everything is saved. */
  text: string;
  kind: SheetStatusKind;
}>();

const hint = computed(() => props.text || 'Все изменения сохранены');
const { root, popup, open, toggle, close } = useSheetPopup();
const tooltipId = useId();

const position = ref<{ left: number; top: number } | null>(null);
const hintStyle = computed(() => position.value
  ? { left: `${position.value.left}px`, top: `${position.value.top}px` }
  : { visibility: 'hidden' as const });
const place = () => {
  const dot = root.value?.querySelector<HTMLElement>('.sheet-status-dot');
  const bounds = popup.value?.getBoundingClientRect();
  if (!dot || !bounds) return;
  const anchor = dot.getBoundingClientRect();
  const margin = 12;
  position.value = {
    left: Math.max(margin, Math.min(window.innerWidth - margin - bounds.width, anchor.left + anchor.width / 2 - bounds.width / 2)),
    top: anchor.bottom + 6,
  };
};

const HINT_MS = 4000;
let timer: ReturnType<typeof setTimeout> | null = null;
const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
watch(open, async (value) => {
  clearTimer();
  position.value = null;
  if (!value) return;
  timer = setTimeout(() => close(), HINT_MS);
  await nextTick();
  place();
});
// The text can change under an open hint (saving -> saved): keep it where it belongs.
watch(hint, () => { if (open.value) void nextTick(place); });

// A notice is a message, not a state: on a phone nobody would see it behind a
// dot, so it opens the hint by itself for as long as it lasts.
const isPhone = () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 760px)').matches;
watch(() => (props.kind === 'notice' || props.kind === 'message' ? props.text : ''), (message) => {
  if (!message || !isPhone()) return;
  if (open.value) {
    clearTimer();
    timer = setTimeout(() => close(), HINT_MS);
    return;
  }
  open.value = 'hint';
});

onMounted(() => {
  window.addEventListener('resize', place);
  document.addEventListener('scroll', place, true);
});
onBeforeUnmount(() => {
  clearTimer();
  window.removeEventListener('resize', place);
  document.removeEventListener('scroll', place, true);
});
</script>

<style scoped>
.sheet-status { display: inline-flex; align-items: center; min-width: 0; }
.sheet-status-text { min-width: 0; color: var(--ui-text-secondary); font-size: 13px; }
.sheet-status-text.is-warning { color: var(--ui-danger-foreground); }
.sheet-status-dot { display: none; }

@media (max-width: 760px) {
  .sheet-status-text { display: none; }
  /* A fixed slot: whatever the state, the buttons next to it stay put. */
  .sheet-status-dot { display: inline-grid; place-items: center; flex: none; width: 24px; height: 36px; padding: 0; border: 0; background: transparent; cursor: pointer; }
  .sheet-status-dot span { width: 10px; height: 10px; border-radius: 50%; background: var(--ui-glass-accent-text); transition: background-color 150ms ease; }
  .sheet-status-dot:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: -2px; border-radius: 999px; }
  .is-saving .sheet-status-dot span { background: var(--ui-warning-foreground); }
  .is-info .sheet-status-dot span { background: var(--ui-text-muted); }
  .is-message .sheet-status-dot span { background: var(--ui-glass-accent-text); }
  .is-danger .sheet-status-dot span, .is-notice .sheet-status-dot span { background: var(--ui-danger-foreground); }
}

/* Teleported: the app's glass tokens, like the other tap hints. */
.sheet-status-hint { position: fixed; z-index: 1000; margin: 0; width: max-content; max-width: min(280px, calc(100vw - 24px)); box-sizing: border-box; padding: 8px 12px; border: 1px solid var(--ui-glass-border); border-radius: 14px; background: var(--ui-glass-tint), var(--ui-surface-solid); box-shadow: var(--ui-glass-shadow); color: var(--ui-text); font-size: 12px; line-height: 1.35; text-align: center; }
.sheet-status-hint.is-danger, .sheet-status-hint.is-notice { border-color: color-mix(in srgb, var(--ui-danger-foreground) 45%, transparent); }
</style>

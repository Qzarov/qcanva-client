<template>
  <Teleport to="body">
    <Transition name="dnd-mode-toast">
      <div v-if="text" :key="text" class="dnd-mode-toast" role="status" aria-live="polite">{{ text }}</div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * "Выбран режим: «Настройка»" - said once in the middle of the screen when the
 * sheet's mode is switched, then gone. It floats above the page and takes no
 * room in it: nothing on the sheet or in the header moves because of it.
 */
defineProps<{ text: string }>();
</script>

<style scoped>
.dnd-mode-toast {
  position: fixed; left: 50%; top: 50%; z-index: 3200; transform: translate(-50%, -50%);
  max-width: calc(100vw - 32px); box-sizing: border-box; padding: 12px 20px;
  border: 1px solid var(--ui-glass-accent-border); border-radius: 999px;
  background: var(--ui-glass-tint), var(--ui-glass-bg);
  box-shadow: inset 0 1px 0 var(--ui-glass-highlight), var(--ui-glass-shadow), var(--ui-glass-accent-glow);
  backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); -webkit-backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2);
  color: var(--ui-text); font-size: 15px; font-weight: 600; text-align: center; white-space: nowrap;
  /* A message, not a control: taps go through to the sheet under it. */
  pointer-events: none;
}
/* It floats in from a little below and fades out in place. */
.dnd-mode-toast-enter-active { transition: opacity 220ms ease, transform 260ms cubic-bezier(.2, .8, .2, 1); }
.dnd-mode-toast-leave-active { transition: opacity 200ms ease; }
.dnd-mode-toast-enter-from { opacity: 0; transform: translate(-50%, calc(-50% + 14px)); }
.dnd-mode-toast-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .dnd-mode-toast-enter-active, .dnd-mode-toast-leave-active { transition: none; }
}
</style>

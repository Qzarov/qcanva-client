<template>
  <Teleport to="body" :disabled="inline">
    <Transition name="canvas-color-menu">
      <div v-if="open" ref="menu" class="canvas-color-menu" :class="[menuClass, { 'canvas-control-menu': controls, 'canvas-color-menu-inline': inline }]" :style="inline ? undefined : position" role="group" :aria-label="label" @pointerdown.stop @click.stop @keydown="onKeydown">
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue';

const props = defineProps<{ open: boolean; anchor: HTMLElement | null; label: string; menuClass?: string; controls?: boolean; inline?: boolean; widthAnchor?: HTMLElement | null; above?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const menu = ref<HTMLElement | null>(null);
const position = ref<CSSProperties>({ left: '8px', top: '8px' });

function place() {
  if (props.inline || !props.open || !props.anchor || !menu.value) return;
  const anchor = (props.widthAnchor ?? props.anchor).getBoundingClientRect();
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
  // A reused popup must be measured without the previous panel's inline width.
  menu.value.style.width = '';
  // offset dimensions are not distorted by the opening scale animation.
  const panelWidth = props.widthAnchor ? Math.min(anchor.width, width - 16) : undefined;
  const menuWidth = panelWidth ?? menu.value.offsetWidth;
  const borderHeight = menu.value.offsetHeight - menu.value.clientHeight;
  const maxHeight = props.above ? Math.max(anchor.top - top - 16, 0)
    : props.widthAnchor ? Math.max(anchor.top - top - 16, top + height - anchor.bottom - 16, 0) : height - 16;
  const menuHeight = Math.min(menu.value.scrollHeight + borderHeight, maxHeight);
  const above = anchor.top - menuHeight - 8;
  const fitsAbove = props.above || above >= top + 8;
  const fitsBelow = anchor.bottom + 8 + menuHeight <= top + height - 8;
  // On short/landscape screens a full vertical palette may fit on neither
  // side vertically. Move it beside the trigger so repeat-tap stays usable.
  const beside = !fitsAbove && !fitsBelow;
  const x = panelWidth !== undefined ? anchor.left : beside
    ? (anchor.right + 8 + menuWidth <= left + width - 8 ? anchor.right + 8 : anchor.left - menuWidth - 8)
    : anchor.left + anchor.width / 2 - menuWidth / 2;
  const y = fitsAbove ? above : beside ? anchor.bottom - menuHeight : anchor.bottom + 8;
  position.value = {
    left: `${Math.max(left + 8, Math.min(x, left + width - menuWidth - 8))}px`,
    top: `${Math.max(top + 8, Math.min(y, top + height - menuHeight - 8))}px`,
    width: panelWidth !== undefined ? `${panelWidth}px` : undefined,
    maxHeight: `${maxHeight}px`,
    transformOrigin: fitsAbove || beside ? 'bottom center' : 'top center',
  };
}

watch(() => [props.open, props.anchor, props.widthAnchor, props.above, props.menuClass, props.label], async () => { await nextTick(); place(); });
function outside(event: PointerEvent) {
  const target = event.target as Node | null;
  if (!props.inline && props.open && target && !menu.value?.contains(target) && !props.anchor?.contains(target)) emit('close');
}
function onKeydown(event: KeyboardEvent) {
  if ((event.target as HTMLElement).matches('input')) return;
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const buttons = Array.from(menu.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
}
function escape(event: KeyboardEvent) {
  if (props.inline || !props.open || event.key !== 'Escape') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  emit('close');
  props.anchor?.focus();
}
onMounted(() => {
  window.addEventListener('pointerdown', outside, true);
  window.addEventListener('keydown', escape, true);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  window.visualViewport?.addEventListener('resize', place);
  window.visualViewport?.addEventListener('scroll', place);
  void nextTick(place);
});
onUnmounted(() => {
  window.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('keydown', escape, true);
  window.removeEventListener('resize', place);
  window.removeEventListener('scroll', place, true);
  window.visualViewport?.removeEventListener('resize', place);
  window.visualViewport?.removeEventListener('scroll', place);
});
</script>

<style scoped>
.canvas-color-menu {
  position: fixed;
  z-index: 330;
  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
  box-sizing: border-box;
  width: 56px;
  padding: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--ui-glass-border);
  border-radius: 18px;
  color: var(--ui-text);
  background: var(--ui-glass-tint), var(--ui-glass-bg);
  box-shadow: inset 0 1px 0 var(--ui-glass-highlight), var(--ui-glass-shadow);
  backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2);
}
.canvas-color-menu :deep(button) {
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  border-radius: 50%;
  cursor: pointer;
}
.canvas-color-menu :deep(button:focus-visible) { outline: 2px solid var(--ui-focus); outline-offset: 1px; }
.canvas-control-menu { width: max-content; max-width: calc(100vw - 16px); }
.canvas-control-menu :deep(button) { width: 100%; height: auto; min-height: 36px; flex: none; padding: 6px 10px; border-radius: 10px; }
.canvas-color-menu.mobile-node-background-palette { width: max-content; max-width: calc(100vw - 16px); }
.canvas-color-menu :deep(.mobile-background-toggle) { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 10px; border-radius: 10px; font-size: 12px; white-space: nowrap; }
.canvas-color-menu-enter-active, .canvas-color-menu-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.canvas-color-menu-enter-from, .canvas-color-menu-leave-to { opacity: 0; transform: translateY(4px) scale(.92); }
.canvas-color-menu-leave-active { pointer-events: none; }
.canvas-color-menu-inline { position: static; width: 100%; max-width: 100%; max-height: calc(100dvh - var(--canvas-toolbar-height, 61px) - var(--canvas-topbar-height, 52px) - 90px); border: 0; border-radius: 0; background: transparent; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; }
.canvas-color-menu-inline :deep(button) { display: flex; align-items: center; justify-content: flex-start; gap: 10px; flex: none; width: 100%; height: auto; min-height: 40px; padding: 6px 10px; border: 0; border-radius: 10px; color: var(--ui-text); background: transparent; text-align: left; font: inherit; font-size: 12px; }
.canvas-color-menu-inline :deep(.canvas-palette-swatch) { flex-shrink: 0; width: 24px; height: 24px; border-radius: 50%; border: 1px solid var(--ui-border); }
.canvas-color-menu-inline :deep(button.active) { background: color-mix(in srgb, var(--ui-accent-strong) 14%, transparent); }
.canvas-color-menu-inline.canvas-color-menu-leave-active { display: none; transition: none; }
@media (prefers-reduced-motion: reduce) {
  .canvas-color-menu-enter-active, .canvas-color-menu-leave-active { transition: none; }
}
</style>

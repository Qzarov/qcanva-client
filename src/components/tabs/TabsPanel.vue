<template>
  <Teleport to="body">
    <div class="tabs-panel-backdrop" :class="{ 'is-open': shown }" @click.self="dismiss">
      <section
        ref="panel"
        class="tabs-panel"
        :class="{ 'is-dragging': dragging }"
        :style="dragStyle"
        role="dialog"
        aria-modal="true"
        aria-label="Открытые вкладки"
        @keydown.esc.prevent.stop="dismiss"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
        @touchcancel="onTouchEnd"
      >
        <div class="tabs-panel-handle" aria-hidden="true"></div>
        <ul class="tabs-panel-list">
          <li>
            <button ref="first" type="button" class="tabs-panel-item tabs-panel-home" @click="goDashboard">
              <span class="tabs-panel-icon" aria-hidden="true">⌂</span>
              <span class="tabs-panel-title">Дашборд</span>
            </button>
          </li>
          <li v-for="tab in tabs" :key="tab.key" :class="{ 'is-current': tab.key === activeTabKey }">
            <button type="button" class="tabs-panel-item" :aria-current="tab.key === activeTabKey ? 'page' : undefined" @click="switchTo(tab)">
              <span class="tabs-panel-icon" aria-hidden="true">{{ ICONS[tab.type] }}</span>
              <span class="tabs-panel-title">{{ tab.title || TYPE_LABEL[tab.type] }}</span>
              <span v-if="tab.unsent" class="tabs-panel-unsent" title="Есть неотправленные изменения">не отправлено</span>
              <span class="tabs-panel-dot" :class="'is-' + tab.status" :title="STATUS_LABEL[tab.status]" :aria-label="STATUS_LABEL[tab.status]"></span>
            </button>
            <button type="button" class="tabs-panel-close" :aria-label="`Закрыть вкладку: ${tab.title || TYPE_LABEL[tab.type]}`" @click="close(tab)">×</button>
          </li>
        </ul>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { confirmDialog } from '../../composables/appDialog';
import { useRouter } from 'vue-router';
import { activeTabKey, closeTab, tabs, type Tab, type TabStatus, type TabType } from '../../tabs/registry';
import { forgetHost } from '../../tabs/TabHost';
import { useBackHandler } from '../../composables/useBackHandler';

/** The bottom sheet of open tabs (docs/app-tabs-plan.md, "Кнопка и панель"). */
const emit = defineEmits<{ close: [] }>();
const router = useRouter();
const first = ref<HTMLButtonElement | null>(null);

const ICONS: Record<TabType, string> = { canvas: '▦', doc: '¶', html: '⟨⟩', template: '◈' };
const TYPE_LABEL: Record<TabType, string> = { canvas: 'Канвас', doc: 'Документ', html: 'HTML-документ', template: 'Шаблон' };
const STATUS_LABEL: Record<TabStatus, string> = { online: 'На связи', reconnecting: 'Переподключается', offline: 'Нет связи' };

const switchTo = (tab: Tab) => {
  emit('close');
  if (tab.key !== activeTabKey.value) void router.push(tab.path);
};
const goDashboard = () => {
  emit('close');
  void router.push({ name: 'dashboard' });
};
const close = async (tab: Tab) => {
  if (tab.unsent && !(await confirmDialog({ title: 'Закрыть вкладку?', message: 'На ней есть неотправленные изменения.', confirmLabel: 'Закрыть', cancelLabel: 'Отмена' }))) return;
  if (tab.key === activeTabKey.value) {
    // The current tab goes: leave it first (to the most recent other one, or
    // the dashboard). Dropping it while still on screen would make the shell
    // mount a fresh page for it just before navigating away.
    const next = tabs.value.find((other) => other.key !== tab.key);
    emit('close');
    await router.push(next ? next.path : { name: 'dashboard' });
  }
  closeTab(tab.key);
  forgetHost(tab.key);
};

// ===== Sliding in and out, and closing with a swipe down =====
// The panel is a bottom sheet: it slides up from the edge and can be pulled
// back down with a finger. Switching to a tab does not wait for the slide -
// the page under the panel is already leaving.
const CLOSE_MS = 240;
const animated = import.meta.env.MODE !== 'test'
  && typeof window.matchMedia === 'function'
  && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const shown = ref(!animated);
const panel = ref<HTMLElement | null>(null);
let closeTimer: ReturnType<typeof setTimeout> | null = null;
const dismiss = () => {
  if (!animated) { emit('close'); return; }
  if (closeTimer) return;
  drag.value = 0;
  dragging.value = false;
  shown.value = false;
  closeTimer = setTimeout(() => emit('close'), CLOSE_MS);
};

const drag = ref(0);
const dragging = ref(false);
const dragStyle = computed(() => (drag.value > 0 ? { transform: `translateY(${drag.value}px)` } : undefined));
let touch: { y: number; at: number; pulling: boolean } | null = null;
const onTouchStart = (event: TouchEvent) => {
  if (event.touches.length !== 1) { touch = null; return; }
  touch = { y: event.touches[0]!.clientY, at: Date.now(), pulling: false };
};
const onTouchMove = (event: TouchEvent) => {
  if (!touch) return;
  const dy = event.touches[0]!.clientY - touch.y;
  // Only a pull down from the top of the list drags the sheet; otherwise the list scrolls.
  if (!touch.pulling) {
    if (dy <= 6 || (panel.value?.scrollTop ?? 0) > 0) return;
    touch.pulling = true;
    dragging.value = true;
  }
  if (event.cancelable) event.preventDefault();
  drag.value = Math.max(0, dy);
};
const onTouchEnd = () => {
  if (!touch?.pulling) { touch = null; return; }
  const speed = drag.value / Math.max(1, Date.now() - touch.at); // px per ms
  touch = null;
  dragging.value = false;
  // Far enough, or flicked: let it go. Otherwise it settles back.
  // A flick still has to travel: a twitch of a few pixels must not close the panel.
  if (drag.value > 90 || (speed > 0.6 && drag.value > 48)) dismiss();
  else drag.value = 0;
};

useBackHandler(() => { dismiss(); return true; });
onMounted(() => {
  void nextTick(() => {
    first.value?.focus({ preventScroll: true });
    // The next frame, so the closed position is painted first and the slide has somewhere to start.
    if (animated) requestAnimationFrame(() => { shown.value = true; });
  });
});
onBeforeUnmount(() => { if (closeTimer) clearTimeout(closeTimer); });
</script>

<style scoped>
.tabs-panel-backdrop { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: flex-end; justify-content: center; background: rgba(0, 0, 0, .45); opacity: 0; transition: opacity 240ms ease; }
.tabs-panel-backdrop.is-open { opacity: 1; }
/* A bottom sheet: it slides up from the edge and follows the finger when pulled down. */
.tabs-panel { transform: translateY(100%); transition: transform 260ms cubic-bezier(.2, .8, .2, 1); will-change: transform; overscroll-behavior: contain; }
.tabs-panel-backdrop.is-open .tabs-panel { transform: none; }
.tabs-panel.is-dragging { transition: none; }
@media (prefers-reduced-motion: reduce) {
  .tabs-panel-backdrop, .tabs-panel { transition: none; }
}
.tabs-panel { width: min(520px, 100%); max-height: 75dvh; overflow-y: auto; padding: 8px 12px calc(12px + env(safe-area-inset-bottom)); box-sizing: border-box; border-radius: 18px 18px 0 0; border: 1px solid var(--ui-border); border-bottom: 0; background: var(--ui-surface-solid); color: var(--ui-text); box-shadow: var(--ui-glass-shadow); }
.tabs-panel-handle { width: 40px; height: 4px; margin: 4px auto 10px; border-radius: 999px; background: var(--ui-text-muted); opacity: .6; }
.tabs-panel-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.tabs-panel-list > li { display: flex; align-items: center; gap: 4px; border-radius: 12px; }
.tabs-panel-list > li.is-current { background: var(--ui-glass-accent-bg); }
.tabs-panel-item { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; min-height: 48px; padding: 6px 10px; border: 0; border-radius: 12px; background: transparent; color: var(--ui-text); font: inherit; text-align: left; cursor: pointer; }
.tabs-panel-item:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: -2px; }
.tabs-panel-icon { flex: none; width: 24px; text-align: center; color: var(--ui-text-secondary); }
.tabs-panel-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tabs-panel-home .tabs-panel-title { font-weight: 600; }
.tabs-panel-unsent { flex: none; font-size: 11px; color: var(--ui-danger-foreground); }
.tabs-panel-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--ui-glass-accent-text); }
.tabs-panel-dot.is-reconnecting { background: #d49a00; }
.tabs-panel-dot.is-offline { background: var(--ui-danger-foreground); }
.tabs-panel-close { flex: none; width: 44px; height: 44px; border: 0; border-radius: 12px; background: transparent; color: var(--ui-text-secondary); font-size: 20px; cursor: pointer; }
.tabs-panel-close:hover, .tabs-panel-close:focus-visible { color: var(--ui-text); background: var(--ui-surface-subtle); }
</style>

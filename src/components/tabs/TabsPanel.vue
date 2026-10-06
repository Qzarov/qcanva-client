<template>
  <Teleport to="body">
    <div class="tabs-panel-backdrop" @click.self="emit('close')">
      <section class="tabs-panel" role="dialog" aria-modal="true" aria-label="Открытые вкладки" @keydown.esc.prevent.stop="emit('close')">
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
import { nextTick, onMounted, ref } from 'vue';
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
const close = (tab: Tab) => {
  if (tab.unsent && !window.confirm('На этой вкладке есть неотправленные изменения. Закрыть её?')) return;
  const wasCurrent = tab.key === activeTabKey.value;
  closeTab(tab.key);
  forgetHost(tab.key);
  if (!wasCurrent) return;
  // The current tab went: show the most recent other one, or the dashboard.
  const next = tabs.value[0];
  emit('close');
  void router.push(next ? next.path : { name: 'dashboard' });
};

useBackHandler(() => { emit('close'); return true; });
onMounted(() => { void nextTick(() => first.value?.focus()); });
</script>

<style scoped>
.tabs-panel-backdrop { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: flex-end; justify-content: center; background: rgba(0, 0, 0, .45); }
.tabs-panel { width: min(520px, 100%); max-height: 75dvh; overflow-y: auto; padding: 8px 12px calc(12px + env(safe-area-inset-bottom)); box-sizing: border-box; border-radius: 18px 18px 0 0; border: 1px solid var(--ui-border); border-bottom: 0; background: var(--ui-surface-solid); color: var(--ui-text); box-shadow: var(--ui-glass-shadow); }
.tabs-panel-handle { width: 40px; height: 4px; margin: 4px auto 10px; border-radius: 999px; background: var(--ui-border); }
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

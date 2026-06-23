<!-- src/views/PluginsView.vue -->
<template>
  <div class="plugins-page">
    <header class="plugins-head">
      <router-link to="/" class="plugins-back" title="На дашборд">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
        <span>Назад</span>
      </router-link>
      <h1 class="plugins-title">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.5 7.5V5a2 2 0 0 0-2-2h-1a2 2 0 0 1-4 0h-1a2 2 0 0 0-2 2v3H2.5a2 2 0 0 0 0 4H4v3a2 2 0 0 0 2 2h3a2 2 0 0 1 4 0h3a2 2 0 0 0 2-2v-3h2.5a2 2 0 0 0 0-4z"/></svg>
        Plugins
      </h1>
    </header>

    <p v-if="error" class="plugins-error">{{ error }}</p>

    <div class="plugins-list">
      <div v-for="p in items" :key="p.id" class="plugin-card">
        <div class="plugin-info">
          <div class="plugin-name">{{ p.name }}</div>
          <div class="plugin-desc">{{ p.description }}</div>
          <span class="plugin-surface">{{ surfaceLabel(p.surface) }}</span>
        </div>
        <button
          class="plugin-toggle"
          :class="{ on: p.enabled }"
          :disabled="busyId === p.id"
          role="switch"
          :aria-checked="p.enabled"
          @click="toggle(p)"
        >
          <span class="plugin-toggle-knob"></span>
        </button>
      </div>
      <div v-if="!items.length && !error" class="plugins-empty">Плагинов пока нет</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { plugins as pluginsApi } from '../api/client';
import { usePlugins } from '../composables/usePlugins';

interface PluginItem { id: string; name: string; description: string; surface: string; enabled: boolean }

const items = ref<PluginItem[]>([]);
const error = ref('');
const busyId = ref('');
const { setEnabled } = usePlugins();

const surfaceLabel = (s: string) =>
  s === 'canvas-chat' ? 'Чат канваса' : s === 'document' ? 'Документ' : s === 'html' ? 'HTML' : s;

const load = async () => {
  try {
    items.value = await pluginsApi.list();
  } catch (e: any) {
    error.value = e?.message || 'Не удалось загрузить плагины';
  }
};

const toggle = async (p: PluginItem) => {
  const next = !p.enabled;
  busyId.value = p.id;
  try {
    await setEnabled(p.id, next);
    p.enabled = next;
  } catch (e: any) {
    error.value = e?.message || 'Не удалось сохранить';
  } finally {
    busyId.value = '';
  }
};

onMounted(load);
</script>

<style scoped>
.plugins-page { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
.plugins-head { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.plugins-back { display: inline-flex; align-items: center; gap: 6px; color: var(--dark-text-muted, #98a2b3); text-decoration: none; font-size: 13px; }
.plugins-back:hover { color: #fff; }
.plugins-title { display: flex; align-items: center; gap: 8px; font-size: 22px; margin: 0; }
.plugins-error { color: #ff9da1; font-size: 13px; margin-bottom: 12px; }
.plugins-list { display: flex; flex-direction: column; gap: 12px; }
.plugin-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px; border: 1px solid var(--dark-neutral-border, #313442); border-radius: 12px; background: var(--dark-input-bg, rgba(255,255,255,0.03)); }
.plugin-info { min-width: 0; }
.plugin-name { font-weight: 600; font-size: 15px; }
.plugin-desc { font-size: 13px; opacity: 0.7; margin-top: 2px; }
.plugin-surface { display: inline-block; margin-top: 8px; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--dark-neutral-border, #313442); opacity: 0.8; }
.plugin-toggle { flex-shrink: 0; width: 46px; height: 26px; border-radius: 999px; border: 1px solid var(--dark-neutral-border, #313442); background: rgba(255,255,255,0.08); position: relative; cursor: pointer; transition: background 0.15s; }
.plugin-toggle.on { background: var(--color-brands, #4dabf7); }
.plugin-toggle:disabled { opacity: 0.5; cursor: default; }
.plugin-toggle-knob { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform 0.15s; }
.plugin-toggle.on .plugin-toggle-knob { transform: translateX(20px); }
.plugins-empty { opacity: 0.6; font-size: 13px; text-align: center; padding: 24px; }
</style>

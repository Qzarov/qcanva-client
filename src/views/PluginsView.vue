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
      <AccountMenu class="plugins-account-menu" />
    </header>

    <p class="plugins-empty">Плагины теперь настраиваются в конкретном канвасе или документе — так они не включаются для всех ваших ресурсов сразу.</p>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import AccountMenu from '../components/AccountMenu.vue';

export default defineComponent({
  components: { AccountMenu },
});
</script>

<style scoped>
.plugins-page { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
.plugins-head { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.plugins-back { display: inline-flex; align-items: center; gap: 6px; color: var(--ui-text-secondary); text-decoration: none; font-size: 13px; }
.plugins-back:hover { color: var(--ui-text); }
.plugins-title { display: flex; align-items: center; gap: 8px; font-size: 22px; margin: 0; }
.plugins-account-menu { margin-left: auto; }
.plugins-error { color: var(--ui-danger-foreground); font-size: 13px; margin-bottom: 12px; }
.plugins-list { display: flex; flex-direction: column; gap: 12px; }
.plugin-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px; border: 1px solid var(--ui-border); border-radius: 12px; background: var(--ui-surface-subtle); }
.plugin-info { min-width: 0; }
.plugin-name { font-weight: 600; font-size: 15px; }
.plugin-desc { font-size: 13px; opacity: 0.7; margin-top: 2px; }
.plugin-surface { display: inline-block; margin-top: 8px; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--ui-border); opacity: 0.8; }
.plugin-toggle { flex-shrink: 0; width: 46px; height: 26px; border-radius: 999px; border: 1px solid var(--ui-border); background: var(--ui-surface-subtle); position: relative; cursor: pointer; transition: background 0.15s; }
.plugin-toggle.on { background: var(--color-brands); }
.plugin-toggle:disabled { opacity: 0.5; cursor: default; }
.plugin-toggle-knob { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: var(--ui-surface-elevated); transition: transform 0.15s; }
.plugin-toggle.on .plugin-toggle-knob { transform: translateX(20px); }
.plugins-empty { opacity: 0.6; font-size: 13px; text-align: center; padding: 24px; }
</style>

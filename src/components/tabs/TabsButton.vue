<template>
  <button v-if="enabled" ref="trigger" type="button" class="tabs-button" :aria-label="`Открытые вкладки: ${tabs.length}`" aria-haspopup="dialog" @click="open = true">
    <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="4.5" width="9" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M5.5 2.5h6a2 2 0 0 1 2 2v6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
    <span class="tabs-button-count">{{ tabs.length }}</span>
  </button>
  <TabsPanel v-if="enabled && open && onScreen" @close="close" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { tabsEnabled } from '../../tabs/flag';
import { tabs } from '../../tabs/registry';
import { useViewActivity } from '../../composables/useViewActivity';
import TabsPanel from './TabsPanel.vue';

/**
 * The tabs button in a page header, next to Back (tab mode only): how many
 * resources are open, and the panel to switch between them.
 */
const enabled = tabsEnabled();
const open = ref(false);
const trigger = ref<HTMLButtonElement | null>(null);
const { active: onScreen } = useViewActivity({ onHide: () => { open.value = false; } });
const close = () => { open.value = false; trigger.value?.focus(); };
</script>

<style scoped>
.tabs-button { position: relative; display: inline-flex; align-items: center; justify-content: center; flex: none; width: 36px; height: 36px; padding: 0; border: 1px solid var(--ui-glass-border); border-radius: 999px; background: var(--ui-glass-tint), var(--ui-glass-bg); box-shadow: inset 0 1px 0 var(--ui-glass-highlight), var(--ui-glass-shadow); backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); -webkit-backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2); color: var(--ui-text); cursor: pointer; }
.tabs-button:focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 2px; }
.tabs-button svg { width: 16px; height: 16px; }
.tabs-button-count { position: absolute; right: -4px; top: -4px; min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 999px; background: var(--ui-glass-accent-text); color: var(--ui-surface-solid); font-size: 10px; font-weight: 700; line-height: 16px; text-align: center; }
</style>

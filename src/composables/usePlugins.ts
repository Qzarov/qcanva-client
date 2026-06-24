// src/composables/usePlugins.ts
import { ref } from 'vue';
import { plugins as pluginsApi } from '../api/client';

const enabledPluginIds = ref<Set<string>>(new Set());
let loaded = false;
let inflight: Promise<void> | null = null;

export function usePlugins() {
  async function loadPlugins(): Promise<void> {
    const list = await pluginsApi.list();
    enabledPluginIds.value = new Set(list.filter((p) => p.enabled).map((p) => p.id));
    loaded = true;
  }

  function ensureLoaded(): Promise<void> {
    if (loaded) return Promise.resolve();
    if (!inflight) {
      inflight = loadPlugins().catch(() => {}).finally(() => {
        inflight = null;
      });
    }
    return inflight;
  }

  function isEnabled(id: string): boolean {
    return enabledPluginIds.value.has(id);
  }

  async function setEnabled(id: string, enabled: boolean): Promise<void> {
    const next = new Set(enabledPluginIds.value);
    if (enabled) next.add(id);
    else next.delete(id);
    enabledPluginIds.value = next;
    try {
      await pluginsApi.setEnabled(id, enabled);
    } catch (e) {
      const rollback = new Set(enabledPluginIds.value);
      if (enabled) rollback.delete(id);
      else rollback.add(id);
      enabledPluginIds.value = rollback;
      throw e;
    }
  }

  function reset(): void {
    enabledPluginIds.value = new Set();
    loaded = false;
    inflight = null;
  }

  return { enabledPluginIds, isEnabled, loadPlugins, ensureLoaded, setEnabled, reset };
}

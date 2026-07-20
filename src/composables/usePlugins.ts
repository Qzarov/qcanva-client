// src/composables/usePlugins.ts
import { ref } from 'vue';
import { plugins as pluginsApi } from '../api/client';

const enabledPluginIds = ref<Set<string>>(new Set());
const pluginItems = ref<Array<{ id: string; name: string; description: string; surface: string; enabled: boolean }>>([]);
let loaded = false;
let inflight: Promise<void> | null = null;
let loadedResourceKey = '';

export function usePlugins() {
  async function loadPlugins(resourceType: 'canvas' | 'html-document' | 'text-document', resourceId: string): Promise<void> {
    const list = await pluginsApi.list(resourceType, resourceId);
    pluginItems.value = list;
    enabledPluginIds.value = new Set(list.filter((p) => p.enabled).map((p) => p.id));
    loaded = true;
    loadedResourceKey = `${resourceType}:${resourceId}`;
  }

  function ensureLoaded(resourceType: 'canvas' | 'html-document' | 'text-document', resourceId: string): Promise<void> {
    const key = `${resourceType}:${resourceId}`;
    if (loaded && loadedResourceKey === key) return Promise.resolve();
    if (!inflight) {
      inflight = loadPlugins(resourceType, resourceId).catch(() => {}).finally(() => {
        inflight = null;
      });
    }
    return inflight;
  }

  function isEnabled(id: string): boolean {
    return enabledPluginIds.value.has(id);
  }

  async function setEnabled(resourceType: 'canvas' | 'html-document' | 'text-document', resourceId: string, id: string, enabled: boolean): Promise<void> {
    const next = new Set(enabledPluginIds.value);
    if (enabled) next.add(id);
    else next.delete(id);
    enabledPluginIds.value = next;
    try {
      await pluginsApi.setEnabled(resourceType, resourceId, id, enabled);
      pluginItems.value = pluginItems.value.map((plugin) => plugin.id === id ? { ...plugin, enabled } : plugin);
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
    pluginItems.value = [];
    loaded = false;
    inflight = null;
    loadedResourceKey = '';
  }

  return { enabledPluginIds, pluginItems, isEnabled, loadPlugins, ensureLoaded, setEnabled, reset };
}

<template>
  <div class="dashboard">
    <header class="dash-header">
      <div>
        <h1>HTML Settings</h1>
        <p class="dash-subtitle">OpenRouter credentials for document generation.</p>
      </div>
      <div class="dash-actions">
        <router-link to="/html-docs" class="btn-ghost">Back</router-link>
      </div>
    </header>
    <section class="settings-panel">
      <label>
        <span>Model</span>
        <input v-model.trim="model" class="dashboard-modal-input" placeholder="openai/gpt-4.1-mini" />
      </label>
      <label>
        <span>OpenRouter API key</span>
        <input v-model.trim="openRouterKey" class="dashboard-modal-input" type="password" :placeholder="hasOpenRouterKey ? 'Key is saved' : 'sk-or-...'" />
      </label>
      <button class="btn-primary" @click="save">Save settings</button>
      <p v-if="saved" class="dash-subtitle">Saved.</p>
    </section>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';
import { htmlDocuments } from '../api/client';

export default defineComponent({
  setup() {
    const model = ref('');
    const openRouterKey = ref('');
    const hasOpenRouterKey = ref(false);
    const saved = ref(false);

    async function load() {
      const settings = await htmlDocuments.settings();
      model.value = settings.model;
      hasOpenRouterKey.value = settings.hasOpenRouterKey;
    }

    async function save() {
      await htmlDocuments.updateSettings({
        model: model.value,
        openRouterKey: openRouterKey.value || undefined,
      });
      openRouterKey.value = '';
      saved.value = true;
      await load();
    }

    onMounted(load);
    return { model, openRouterKey, hasOpenRouterKey, saved, save };
  },
});
</script>

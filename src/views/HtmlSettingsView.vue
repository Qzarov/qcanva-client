<template>
  <div class="dashboard">
    <header class="dash-header">
      <div>
        <h1>HTML Settings</h1>
        <p class="dash-subtitle">OpenRouter credentials for document generation.</p>
      </div>
      <div class="dash-actions">
        <router-link :to="{ name: 'dashboard', query: { type: 'html' } }" class="btn-ghost">Back</router-link>
        <AccountMenu />
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
    <section class="settings-panel">
      <h2>MCP access</h2>
      <p class="dash-subtitle">Use this token in the Authorization header for Canvas MCP clients.</p>
      <div class="settings-actions">
        <button class="btn-primary" @click="copyMcpToken" :disabled="!hasToken">Copy MCP token</button>
        <button class="btn-ghost" @click="refreshMcpToken" :disabled="refreshingToken">
          {{ refreshingToken ? 'Refreshing...' : 'Refresh token' }}
        </button>
      </div>
      <p v-if="tokenMessage" class="dash-subtitle">{{ tokenMessage }}</p>
    </section>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';
import { auth, getAccessToken, htmlDocuments, setToken } from '../api/client';
import AccountMenu from '../components/AccountMenu.vue';

export default defineComponent({
  components: { AccountMenu },
  setup() {
    const model = ref('');
    const openRouterKey = ref('');
    const hasOpenRouterKey = ref(false);
    const saved = ref(false);
    const hasToken = ref(Boolean(getAccessToken()));
    const refreshingToken = ref(false);
    const tokenMessage = ref('');

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

    async function writeClipboard(text: string) {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    async function copyMcpToken() {
      const token = getAccessToken();
      if (!token) {
        hasToken.value = false;
        tokenMessage.value = 'No active token. Log in again to create one.';
        return;
      }
      await writeClipboard(token);
      tokenMessage.value = 'MCP token copied.';
    }

    async function refreshMcpToken() {
      refreshingToken.value = true;
      tokenMessage.value = '';
      try {
        const res = await auth.refreshToken();
        setToken(res.token, res.user?.role, res.user?.accessMode || 'user', res.user);
        hasToken.value = true;
        await writeClipboard(res.token);
        tokenMessage.value = 'New MCP token issued and copied.';
      } finally {
        refreshingToken.value = false;
      }
    }

    onMounted(load);
    return {
      model,
      openRouterKey,
      hasOpenRouterKey,
      saved,
      hasToken,
      refreshingToken,
      tokenMessage,
      save,
      copyMcpToken,
      refreshMcpToken,
    };
  },
});
</script>

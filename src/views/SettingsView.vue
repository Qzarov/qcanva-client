<template>
  <div class="settings-page">
    <header class="settings-topbar">
      <router-link :to="{ name: 'dashboard' }" class="btn-ghost settings-back" :aria-label="t('back')" :title="t('back')" data-settings-back>
        <ArrowLeft :size="18" aria-hidden="true" />
      </router-link>
      <h1>{{ t('settings') }}</h1>
      <AccountMenu glass :show-plugins="false" class="settings-account" />
    </header>

    <div class="settings-layout">
      <nav class="settings-nav" :aria-label="t('settings')">
        <button
          v-for="item in SECTIONS"
          :key="item.key"
          type="button"
          class="settings-nav-item"
          :class="{ active: section === item.key }"
          :aria-current="section === item.key ? 'page' : undefined"
          :data-settings-section="item.key"
          @click="select(item.key)"
        >
          <component :is="item.icon" :size="18" aria-hidden="true" />
          <span class="settings-nav-label">{{ t(item.label) }}</span>
          <span class="settings-nav-short" aria-hidden="true">{{ item.short ?? t(item.label) }}</span>
        </button>
      </nav>

      <main class="settings-content">
        <template v-if="section === 'general'">
          <section class="settings-card" data-settings-account>
            <h2>{{ t('settingsAccount') }}</h2>
            <div class="settings-account-row">
              <span class="settings-avatar" aria-hidden="true">{{ avatarLabel }}</span>
              <div class="settings-account-text">
                <strong>{{ user?.name || user?.email || '—' }}</strong>
                <span v-if="user?.email && user.email !== user?.name">{{ user.email }}</span>
              </div>
            </div>
          </section>
          <section class="settings-card">
            <h2>{{ t('settingsAppearance') }}</h2>
            <div class="settings-row">
              <span class="settings-row-label">{{ t('theme') }}</span>
              <ThemeSelector class="settings-theme" />
            </div>
            <div class="settings-row">
              <span class="settings-row-label">{{ t('settingsLanguage') }}</span>
              <div class="settings-segments" role="radiogroup" :aria-label="t('settingsLanguage')">
                <button
                  v-for="option in LANGUAGES"
                  :key="option.value"
                  type="button"
                  role="radio"
                  :aria-checked="locale === option.value"
                  :class="{ active: locale === option.value }"
                  :data-settings-language="option.value"
                  @click="setLocale(option.value)"
                >{{ option.label }}</button>
              </div>
            </div>
          </section>
          <section
            v-if="isHubOverrideAllowed()"
            class="settings-card"
            data-settings-hub
          >
            <h2>Хаб (отладка)</h2>
            <HubOverrideField />
          </section>
        </template>

        <template v-else-if="section === 'mcp'">
          <section class="settings-intro">
            <h2>{{ t('mcpTokensTitle') }}</h2>
            <p>{{ t('mcpTokensLead') }}</p>
          </section>
          <McpTokensPanel />
        </template>

        <template v-else>
          <section class="settings-intro">
            <h2>{{ t('settingsHtmlGeneration') }}</h2>
            <p>{{ t('settingsHtmlLead') }}</p>
          </section>
          <form class="settings-card" data-settings-html @submit.prevent="saveHtml">
            <label class="settings-field">
              <span class="settings-row-label">{{ t('settingsModel') }}</span>
              <input v-model.trim="model" class="dashboard-modal-input" placeholder="openai/gpt-4.1-mini" />
            </label>
            <label class="settings-field">
              <span class="settings-row-label">{{ t('settingsOpenRouterKey') }}</span>
              <input
                v-model.trim="openRouterKey"
                class="dashboard-modal-input"
                type="password"
                autocomplete="off"
                :placeholder="hasOpenRouterKey ? t('settingsKeySaved') : 'sk-or-...'"
              />
            </label>
            <div class="settings-actions">
              <span v-if="saved" class="settings-saved" role="status">{{ t('settingsSaved') }}</span>
              <button type="submit" class="btn-primary" :disabled="saving">{{ t('settingsSave') }}</button>
            </div>
          </form>
        </template>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeft, FileCode2, KeyRound, SlidersHorizontal } from '@lucide/vue';
import AccountMenu from '../components/AccountMenu.vue';
import ThemeSelector from '../components/ThemeSelector.vue';
import HubOverrideField from '../components/HubOverrideField.vue';
import McpTokensPanel from '../components/settings/McpTokensPanel.vue';
import { getCurrentUser, htmlDocuments } from '../api/client';
import { isHubOverrideAllowed } from '../api/hubOverride';
import { useI18n, type UiLocale } from '../composables/useI18n';

type SectionKey = 'general' | 'mcp' | 'html';
type MessageKey = Parameters<ReturnType<typeof useI18n>['t']>[0];

/** `short`: the label on a phone, where the three share one pill. */
const SECTIONS: { key: SectionKey; label: MessageKey; short?: string; icon: Component }[] = [
  { key: 'general', label: 'settingsGeneral', icon: SlidersHorizontal },
  { key: 'mcp', label: 'mcpTokensTitle', short: 'MCP', icon: KeyRound },
  { key: 'html', label: 'settingsHtmlGeneration', short: 'HTML', icon: FileCode2 },
];
const LANGUAGES: { value: UiLocale; label: string }[] = [
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
];

const { t, locale, setLocale } = useI18n();
const route = useRoute();
const router = useRouter();

/** The open section lives in ?section=, so /mcp and /html-settings can link straight to theirs. */
const section = computed<SectionKey>(() => {
  const value = route.query.section;
  return value === 'mcp' || value === 'html' ? value : 'general';
});
const select = (key: SectionKey) => {
  void router.replace({ query: { ...route.query, section: key === 'general' ? undefined : key } });
};

const user = getCurrentUser() as { name?: string; email?: string } | null;
const avatarLabel = computed(() => (user?.name || user?.email || '?').trim().charAt(0).toUpperCase());

const model = ref('');
const openRouterKey = ref('');
const hasOpenRouterKey = ref(false);
const saving = ref(false);
const saved = ref(false);
let htmlLoaded = false;

async function loadHtml() {
  const settings = await htmlDocuments.settings();
  model.value = settings.model;
  hasOpenRouterKey.value = settings.hasOpenRouterKey;
  htmlLoaded = true;
}

async function saveHtml() {
  saving.value = true;
  try {
    await htmlDocuments.updateSettings({ model: model.value, openRouterKey: openRouterKey.value || undefined });
    openRouterKey.value = '';
    saved.value = true;
    await loadHtml();
  } finally {
    saving.value = false;
  }
}

watch(section, (value) => {
  saved.value = false;
  if (value === 'html' && !htmlLoaded) void loadHtml().catch(() => undefined);
}, { immediate: true });
</script>

<style scoped>
.settings-page {
  min-height: 100dvh;
  color: var(--ui-text);
}
.settings-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px max(16px, env(safe-area-inset-left));
  border-bottom: 1px solid var(--ui-glass-border);
}
.settings-topbar h1 { flex: 1; margin: 0; font-size: 18px; }
.settings-back { width: 38px; height: 38px; display: inline-grid; place-items: center; padding: 0; border-radius: 999px; }
.settings-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 24px;
  width: min(1040px, 100%);
  margin: 0 auto;
  padding: 24px 16px 48px;
}
.settings-nav {
  position: sticky;
  top: 82px;
  align-self: start;
  display: grid;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 20px;
}
.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.settings-nav-item:hover:not(.active) { background: var(--ui-glass-btn-hover); color: var(--ui-text); }
.settings-nav-item.active {
  border-color: var(--ui-glass-accent-border);
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.02)), var(--ui-glass-accent-bg);
  box-shadow: inset 0 1px 0 var(--ui-glass-highlight), var(--ui-glass-accent-glow);
  color: var(--ui-glass-accent-text);
}
.settings-nav-short { display: none; }
.settings-content { display: grid; gap: 16px; align-content: start; min-width: 0; }
.settings-intro h2 { margin: 0 0 4px; font-size: 22px; }
.settings-intro p { margin: 0; max-width: 640px; color: var(--ui-text-secondary); line-height: 1.5; }
.settings-card {
  display: grid;
  gap: 14px;
  padding: 18px 20px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 20px;
  background: var(--ui-glass-tint), var(--ui-glass-card-bg);
  box-shadow: inset 0 1px 0 var(--ui-glass-highlight), 0 6px 20px rgba(0, 0, 0, 0.12);
}
.settings-card h2 { margin: 0; font-size: 16px; }
.settings-account-row { display: flex; align-items: center; gap: 14px; min-width: 0; }
.settings-avatar {
  flex: none;
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border: 1px solid var(--ui-glass-accent-border);
  border-radius: 999px;
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
  font-size: 20px;
  font-weight: 700;
}
.settings-account-text { display: grid; gap: 2px; min-width: 0; }
.settings-account-text strong, .settings-account-text span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.settings-account-text span { color: var(--ui-text-secondary); font-size: 13px; }
.settings-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; }
.settings-row-label { font-size: 11px; font-weight: 600; color: var(--ui-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
.settings-field { display: grid; gap: 6px; }
.settings-segments,
.settings-theme {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 999px;
  background: var(--ui-glass-btn-bg);
  box-shadow: inset 0 1px 0 var(--ui-glass-highlight);
}
.settings-segments button,
.settings-theme :deep(.theme-selector-option) {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.settings-segments button:hover:not(.active),
.settings-theme :deep(.theme-selector-option:hover:not(.active)) { background: var(--ui-glass-btn-hover); }
.settings-segments button.active,
.settings-theme :deep(.theme-selector-option.active) {
  border-color: var(--ui-glass-accent-border);
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
  box-shadow: var(--ui-glass-accent-glow);
}
.settings-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
.settings-saved { color: var(--ui-glass-accent-text); font-size: 13px; }

@media (max-width: 760px) {
  .settings-layout { grid-template-columns: 1fr; gap: 16px; padding-top: 14px; }
  /* The sections become one glass pill across the top. */
  .settings-nav {
    position: static;
    display: flex;
    overflow-x: auto;
    padding: 4px;
    border-radius: 999px;
    scrollbar-width: none;
  }
  .settings-nav-item { flex: 1 1 0; justify-content: center; gap: 6px; min-height: 38px; padding: 0 8px; border-radius: 999px; font-size: 13px; }
  .settings-nav-label { display: none; }
  .settings-nav-short { display: inline; }
  .settings-card { padding: 16px; }
  .settings-intro h2 { font-size: 20px; }
}
</style>

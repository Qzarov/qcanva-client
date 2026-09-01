<template>
  <div
    class="account-menu"
    :class="[`account-menu--${placement}`, { 'account-menu--compact': compact }]"
    @keydown.esc.stop="close"
  >
    <button
      type="button"
      class="account-menu-trigger current-user-badge"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="userLabel"
      :title="userTitle"
      data-account-menu-trigger
      @click.stop="open = !open"
    >
      <span class="current-user-icon" aria-hidden="true">{{ avatarLabel }}</span>
      <span v-if="!compact">{{ userLabel }}</span>
    </button>
    <div
      v-if="open"
      class="account-menu-backdrop"
      data-account-menu-backdrop
      aria-hidden="true"
      @click="close"
    ></div>
    <div v-if="open" class="account-menu-popover" role="menu" data-account-menu @click.stop>
      <div class="account-menu-identity">
        <strong>{{ userLabel }}</strong>
        <span v-if="currentUser?.email && currentUser.email !== userLabel">{{ currentUser.email }}</span>
      </div>
      <div class="account-menu-theme">
        <span>{{ t('theme') }}</span>
        <ThemeSelector />
      </div>
      <nav class="account-menu-links" :aria-label="userLabel">
        <router-link to="/plugins" class="account-menu-item" role="menuitem" @click="close">
          <span aria-hidden="true">◇</span>{{ t('plugins') }}
        </router-link>
        <router-link to="/html-settings" class="account-menu-item" role="menuitem" @click="close">
          <span aria-hidden="true">⚙</span>{{ t('settings') }}
        </router-link>
        <button type="button" class="account-menu-item account-menu-sign-out" role="menuitem" data-account-menu-sign-out @click="signOut">
          <span aria-hidden="true">↪</span>{{ t('signOut') }}
        </button>
      </nav>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { clearToken, getCurrentUser } from '../api/client';
import { useI18n } from '../composables/useI18n';
import { usePlugins } from '../composables/usePlugins';
import ThemeSelector from './ThemeSelector.vue';

const props = withDefaults(defineProps<{
  compact?: boolean;
  placement?: 'header' | 'sidebar';
}>(), {
  compact: false,
  placement: 'header',
});

const router = useRouter();
const { t } = useI18n();
const { reset: resetPlugins } = usePlugins();
const open = ref(false);
const currentUser = getCurrentUser();
const userLabel = computed(() => currentUser?.name || currentUser?.email || 'User');
const userTitle = computed(() => currentUser?.email || currentUser?.name || userLabel.value);
const avatarLabel = computed(() => userLabel.value.trim().slice(0, 1).toUpperCase() || 'U');
const compact = computed(() => props.compact);
const placement = computed(() => props.placement);

const close = () => { open.value = false; };
const signOut = () => {
  close();
  resetPlugins();
  clearToken();
  void router.push({ name: 'landing' });
};
</script>

<style scoped>
.account-menu {
  position: relative;
  display: inline-flex;
}
.account-menu-trigger {
  position: relative;
  z-index: 402;
}
.account-menu--compact .account-menu-trigger {
  width: 38px;
  justify-content: center;
  padding-inline: 7px;
}
.account-menu-backdrop {
  position: fixed;
  z-index: 400;
  inset: 0;
}
.account-menu-popover {
  position: absolute;
  z-index: 403;
  top: calc(100% + 8px);
  right: 0;
  width: min(260px, calc(100vw - 24px));
  padding: 8px;
  border: 1px solid var(--ui-border);
  border-radius: var(--radius-md);
  color: var(--ui-text);
  background: var(--ui-surface-elevated);
  box-shadow: var(--ui-shadow);
  backdrop-filter: blur(12px);
  transition: opacity var(--transition-fast), transform var(--transition-fast);
}
.account-menu--sidebar .account-menu-popover {
  top: auto;
  right: auto;
  bottom: 0;
  left: calc(100% + 8px);
}
.account-menu-identity {
  display: grid;
  gap: 2px;
  padding: 8px 10px 10px;
  border-bottom: 1px solid var(--ui-border);
}
.account-menu-identity strong,
.account-menu-identity span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.account-menu-identity strong {
  font-size: 13px;
}
.account-menu-identity span,
.account-menu-theme > span {
  color: var(--ui-text-muted);
  font-size: 11px;
}
.account-menu-theme {
  display: grid;
  gap: 7px;
  padding: 10px;
  border-bottom: 1px solid var(--ui-border);
}
.account-menu-links {
  display: grid;
  padding-top: 6px;
}
.account-menu-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--ui-text);
  background: transparent;
  font: inherit;
  font-size: 13px;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.account-menu-item:hover,
.account-menu-item:focus-visible {
  background: var(--ui-surface-subtle);
}
.account-menu-item > span {
  display: inline-grid;
  place-items: center;
  width: 18px;
  color: var(--ui-text-muted);
}
.account-menu-sign-out {
  color: var(--accent-red);
}

@media (prefers-reduced-motion: reduce) {
  .account-menu-popover {
    transition: none;
  }
}
@media (max-width: 520px) {
  .account-menu--sidebar .account-menu-popover {
    top: calc(100% + 8px);
    right: 0;
    bottom: auto;
    left: auto;
  }
}
</style>

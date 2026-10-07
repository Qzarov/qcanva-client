<template>
  <div
    class="account-menu"
    :class="[`account-menu--${placement}`, { 'account-menu--compact': compact, 'account-menu--glass': glass }]"
    @keydown.esc.stop="close(true)"
  >
    <button
      ref="triggerRef"
      type="button"
      class="account-menu-trigger current-user-badge"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-label="userLabel"
      :aria-controls="open ? popoverId : undefined"
      :title="userTitle"
      data-account-menu-trigger
      @click.stop="toggleFromClick"
      @keydown.down.prevent.stop="openFromKeyboard"
    >
      <span class="current-user-icon" aria-hidden="true">{{ avatarLabel }}</span>
      <span v-if="!compact">{{ userLabel }}</span>
    </button>
    <div
      v-if="open"
      class="account-menu-backdrop"
      data-account-menu-backdrop
      aria-hidden="true"
      @click="close(false)"
    ></div>
    <div
      v-if="open"
      :id="popoverId"
      ref="popoverRef"
      class="account-menu-popover"
      role="dialog"
      :aria-label="userLabel"
      data-account-menu
      @click.stop
    >
      <div class="account-menu-identity">
        <strong>{{ userLabel }}</strong>
        <span v-if="currentUser?.email && currentUser.email !== userLabel">{{ currentUser.email }}</span>
      </div>
      <div class="account-menu-theme">
        <span>{{ t('theme') }}</span>
        <ThemeSelector ref="selectorRef" />
      </div>
      <!-- What the open page adds to the menu (the character sheet: its canvas connection). -->
      <div v-if="$slots.page" class="account-menu-page">
        <slot name="page" :close="close" />
      </div>
      <nav class="account-menu-links" :aria-label="userLabel">
        <router-link v-if="showPlugins" to="/plugins" class="account-menu-item" @click="close(false)">
          <Puzzle :size="17" aria-hidden="true" />{{ t('plugins') }}
        </router-link>
        <router-link to="/html-settings" class="account-menu-item" @click="close(false)">
          <Settings :size="17" aria-hidden="true" />{{ t('settings') }}
        </router-link>
        <button type="button" class="account-menu-item account-menu-sign-out" data-account-menu-sign-out @click="signOut">
          <LogOut :size="17" aria-hidden="true" />{{ t('signOut') }}
        </button>
      </nav>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useViewActivity } from '../composables/useViewActivity';
import { LogOut, Puzzle, Settings } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { clearToken, getCurrentUser } from '../api/client';
import { useI18n } from '../composables/useI18n';
import { usePlugins } from '../composables/usePlugins';
import ThemeSelector from './ThemeSelector.vue';

const emit = defineEmits<{ opened: [] }>();

const props = withDefaults(defineProps<{
  compact?: boolean;
  placement?: 'header' | 'sidebar';
  /** Plugins only exist for canvases so far: off where they'd lead nowhere useful. */
  showPlugins?: boolean;
  /**
   * The Liquid Glass look of the menu. Opt-in while it is rolled out page by
   * page (the character sheet first); once every page has it, this becomes
   * the only look and the prop goes away.
   */
  glass?: boolean;
}>(), {
  compact: false,
  placement: 'header',
  showPlugins: true,
  glass: false,
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
const showPlugins = computed(() => props.showPlugins);
const glass = computed(() => props.glass);
const triggerRef = ref<HTMLButtonElement | null>(null);
const popoverRef = ref<HTMLDivElement | null>(null);
const selectorRef = ref<InstanceType<typeof ThemeSelector> | null>(null);
const popoverId = 'account-menu-popover';

const focusTrigger = () => {
  triggerRef.value?.focus();
};

const openMenu = async (focusTheme = false) => {
  emit('opened');
  open.value = true;
  if (!focusTheme) return;
  await nextTick();
  selectorRef.value?.focusFirstChoice();
};

const close = (restoreFocus = false) => {
  open.value = false;
  if (restoreFocus) {
    void nextTick(() => focusTrigger());
  }
};

// Outside-click close. The transparent .account-menu-backdrop alone is not
// enough: in a topbar with backdrop-filter (the canvas / text-doc headers) that
// backdrop's `position: fixed` is contained by the topbar's own box, so it only
// covers the header strip - a click down in the document never reached it and
// the menu stayed open (reported bug). A document-level pointerdown closes it
// wherever the click lands, except on the trigger (its own @click toggles) or
// inside the popover.
const onDocumentPointerDown = (event: PointerEvent) => {
  if (!open.value) return;
  const target = event.target as Node | null;
  if (!target) return;
  if (triggerRef.value?.contains(target) || popoverRef.value?.contains(target)) return;
  close(false);
};
watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('pointerdown', onDocumentPointerDown, true);
  else document.removeEventListener('pointerdown', onDocumentPointerDown, true);
});
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown, true));
// A page going to sleep in a background tab takes its open menu down with it.
useViewActivity({ onHide: () => { open.value = false; } });

const toggleFromClick = () => {
  if (open.value) {
    close(false);
    return;
  }
  void openMenu(false);
};

const openFromKeyboard = () => {
  void openMenu(true);
};

const signOut = () => {
  close(false);
  resetPlugins();
  clearToken();
  void router.push({ name: 'landing' });
};

defineExpose({ close });
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
  color: var(--ui-text-secondary);
  font-size: 11px;
}
.account-menu-theme {
  display: grid;
  gap: 7px;
  padding: 10px;
  border-bottom: 1px solid var(--ui-border);
}
.account-menu-page {
  display: grid;
  padding: 6px 0;
  border-bottom: 1px solid var(--ui-border);
}
.account-menu--glass .account-menu-page {
  border-bottom-color: var(--ui-glass-border);
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
  color: var(--ui-text-secondary);
}
.account-menu-sign-out {
  color: var(--accent-red);
}

/* ===== Liquid Glass (opt-in, see the `glass` prop) =====
   One translucent, blurred surface for the whole menu; inside it nothing is
   blurred again. Colours are the app's glass tokens, so both themes follow. */
.account-menu--glass .account-menu-popover {
  width: min(280px, calc(100vw - 24px));
  padding: 10px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 20px;
  background: var(--ui-glass-tint), var(--ui-glass-bg);
  box-shadow: inset 0 1px 0 var(--ui-glass-highlight), var(--ui-glass-shadow);
  backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2);
}
.account-menu--glass .account-menu-identity,
.account-menu--glass .account-menu-theme {
  border-bottom-color: var(--ui-glass-border);
}
.account-menu--glass .account-menu-identity strong {
  font-size: 14px;
}
.account-menu--glass .account-menu-identity span,
.account-menu--glass .account-menu-theme > span {
  font-size: 12px;
}
.account-menu--glass .account-menu-theme > span {
  letter-spacing: .04em;
  text-transform: uppercase;
  font-size: 10px;
}
/* The theme choice as one glass pill with the chosen segment lit, like the sheet's roll-mode switch. */
.account-menu--glass :deep(.theme-selector) {
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 999px;
  background: var(--ui-glass-btn-bg);
}
.account-menu--glass :deep(.theme-selector-option) {
  min-height: 32px;
  border-radius: 999px;
}
.account-menu--glass :deep(.theme-selector-option:hover:not(.active)) {
  background: var(--ui-glass-btn-hover);
}
.account-menu--glass :deep(.theme-selector-option.active) {
  border-color: var(--ui-glass-accent-border);
  color: var(--ui-glass-accent-text);
  background: var(--ui-glass-accent-bg);
  box-shadow: var(--ui-glass-accent-glow);
}
.account-menu--glass .account-menu-links {
  gap: 2px;
  padding-top: 8px;
}
.account-menu--glass .account-menu-item {
  min-height: 40px;
  border-radius: 12px;
  transition: background-color 150ms ease;
}
.account-menu--glass .account-menu-item:hover,
.account-menu--glass .account-menu-item:focus-visible {
  background: var(--ui-glass-btn-hover);
}
.account-menu--glass .account-menu-item:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: -2px;
}
.account-menu--glass .account-menu-item svg {
  color: var(--ui-text-secondary);
}
.account-menu--glass .account-menu-sign-out,
.account-menu--glass .account-menu-sign-out svg {
  color: var(--ui-danger-foreground);
}
@media (max-width: 760px) {
  /* Tapped with a thumb: full touch targets. */
  .account-menu--glass .account-menu-item { min-height: 44px; }
  .account-menu--glass :deep(.theme-selector-option) { min-height: 40px; }
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

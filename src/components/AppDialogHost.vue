<template>
  <div v-if="entry" :key="entry.id" class="app-dialog-backdrop" @click.self="dismissAppDialog">
    <section
      ref="dialog"
      class="app-dialog"
      :role="entry.kind === 'prompt' ? 'dialog' : 'alertdialog'"
      aria-modal="true"
      aria-labelledby="app-dialog-title"
      :aria-describedby="entry.message ? 'app-dialog-message' : undefined"
      :data-app-dialog="entry.kind"
      @keydown.esc.prevent.stop="dismissAppDialog"
      @keydown.tab="trapTab"
    >
      <form @submit.prevent="confirm">
        <h2 id="app-dialog-title">{{ entry.title }}</h2>
        <p v-if="entry.message" id="app-dialog-message">{{ entry.message }}</p>
        <input
          v-if="entry.kind === 'prompt'"
          ref="field"
          v-model="text"
          class="app-dialog-field"
          type="text"
          :placeholder="entry.placeholder"
          :maxlength="entry.maxLength"
          :aria-label="entry.title"
          autocomplete="off"
        />
        <div class="app-dialog-actions">
          <button v-if="entry.kind !== 'alert'" ref="cancelButton" type="button" class="btn-ghost" data-app-dialog-cancel @click="dismissAppDialog">
            {{ entry.cancelLabel || t('cancel') }}
          </button>
          <button
            ref="confirmButton"
            type="submit"
            class="btn-primary"
            :class="{ 'app-dialog-danger': entry.danger }"
            data-app-dialog-confirm
            :disabled="entry.kind === 'prompt' && !text.trim()"
          >{{ entry.confirmLabel || t('dialogOk') }}</button>
        </div>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { currentAppDialog as entry, dismissAppDialog } from '../composables/appDialog';
import { registerBackHandler } from '../composables/useBackHandler';
import { useI18n } from '../composables/useI18n';

/**
 * Draws the app's confirm / alert / prompt (see composables/appDialog.ts).
 * Looks and behaves like the character sheet's dialogs: a solid window in the
 * middle of the screen, closed by Esc, the backdrop and the system Back.
 */
const { t } = useI18n();
const text = ref('');
const dialog = ref<HTMLElement | null>(null);
const field = ref<HTMLInputElement | null>(null);
const cancelButton = ref<HTMLButtonElement | null>(null);
const confirmButton = ref<HTMLButtonElement | null>(null);

const confirm = () => {
  const open = entry.value;
  if (!open) return;
  if (open.kind !== 'prompt') open.settle(true);
  else if (text.value.trim()) open.settle(text.value.trim());
};

let previousFocus: HTMLElement | null = null;
let releaseBack: (() => void) | null = null;
watch(entry, async (open, previous) => {
  if (open && !previous) {
    previousFocus = document.activeElement as HTMLElement | null;
    // The dialog answers the system Back before the page under it does.
    releaseBack = registerBackHandler(dismissAppDialog);
  }
  if (!open) {
    releaseBack?.();
    releaseBack = null;
    if (previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
    return;
  }
  text.value = open.value ?? '';
  await nextTick();
  if (open.kind === 'prompt') { field.value?.focus(); field.value?.select(); }
  // Enter must not delete anything by itself: a destructive question starts on "Cancel".
  else if (open.danger) cancelButton.value?.focus();
  else confirmButton.value?.focus();
}, { immediate: true, flush: 'post' });
onBeforeUnmount(() => releaseBack?.());

const trapTab = (event: KeyboardEvent) => {
  const elements = Array.from(dialog.value?.querySelectorAll<HTMLElement>('input, button:not(:disabled)') ?? []);
  const first = elements[0], last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
};
</script>

<style scoped>
/* Above every other window of the app: a question may be asked from inside a dialog. */
.app-dialog-backdrop { position: fixed; inset: 0; z-index: 12000; display: grid; place-items: center; padding: 16px; background: rgba(0, 0, 0, .45); }
.app-dialog { width: min(380px, 100%); max-height: 90dvh; overflow-y: auto; box-sizing: border-box; padding: 20px; border-radius: 16px; border: 1px solid var(--ui-border); background: var(--ui-surface-solid); color: var(--ui-text); box-shadow: var(--ui-glass-shadow); }
.app-dialog form { display: grid; gap: 12px; }
.app-dialog h2 { margin: 0; font-size: 18px; line-height: 1.3; overflow-wrap: anywhere; }
.app-dialog p { margin: 0; font-size: 14px; line-height: 1.45; color: var(--ui-text-secondary); overflow-wrap: anywhere; white-space: pre-line; }
.app-dialog-field { width: 100%; box-sizing: border-box; min-height: 40px; padding: 8px 10px; font: inherit; font-size: 16px; color: var(--ui-text); border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-surface-subtle); outline: none; transition: border-color .15s, box-shadow .15s; }
.app-dialog-field:focus { border-color: var(--ui-glass-accent-border); box-shadow: 0 0 0 3px var(--ui-glass-accent-bg); }
.app-dialog-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 4px; }
/* width:auto - the app's phone rule stretches .btn-primary / .btn-ghost to 100%. */
.app-dialog-actions button { display: inline-flex; align-items: center; justify-content: center; text-align: center; flex: 0 1 auto; width: auto; min-width: 96px; min-height: 40px; }
.app-dialog-actions button:disabled { opacity: .45; cursor: default; }
.app-dialog-actions button:focus-visible { outline: 2px solid var(--ui-glass-accent-border); outline-offset: 2px; }
.app-dialog-actions .app-dialog-danger { background: var(--ui-danger); color: var(--ui-danger-on); border-color: transparent; }
.app-dialog-actions .app-dialog-danger:hover { border-color: var(--ui-danger-foreground); }
.app-dialog-actions .app-dialog-danger:focus-visible { outline-color: var(--ui-danger-foreground); }
</style>

/**
 * The app's own confirm / alert / prompt, in place of the browser's.
 *
 * A system dialog cannot be styled, blocks the whole WebView and on Android
 * shows the page's address as its title. These three return a promise and
 * are drawn by `AppDialogHost` (mounted once in App.vue) in the app's style.
 *
 * Dialogs queue: a second one asked while the first is open waits its turn.
 */
import { computed, shallowRef } from 'vue';
import { useI18n } from './useI18n';

export type AppDialogOptions = {
  title: string;
  /** A line under the title: what will happen, or why. */
  message?: string;
  /** The main button names the action ("Удалить"), never "OK" for a question. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** A destructive action: the main button is red and the focus starts on "Cancel". */
  danger?: boolean;
};
export type AppPromptOptions = AppDialogOptions & { value?: string; placeholder?: string; maxLength?: number };

export type AppDialogEntry = AppPromptOptions & {
  id: number;
  kind: 'confirm' | 'alert' | 'prompt';
  /** Settles the dialog: `true`/`false` for a confirm, the text or `null` for a prompt. */
  settle: (result: boolean | string | null) => void;
};

const queue = shallowRef<AppDialogEntry[]>([]);
let nextId = 0;

/** The dialog on screen, if any. */
export const currentAppDialog = computed<AppDialogEntry | null>(() => queue.value[0] ?? null);

function open<T extends boolean | string | null>(kind: AppDialogEntry['kind'], options: AppPromptOptions): Promise<T> {
  return new Promise<T>((resolve) => {
    const id = (nextId += 1);
    const entry: AppDialogEntry = {
      ...options, id, kind,
      settle: (result) => {
        if (!queue.value.some((item) => item.id === id)) return;
        queue.value = queue.value.filter((item) => item.id !== id);
        resolve(result as T);
      },
    };
    queue.value = [...queue.value, entry];
  });
}

/** Resolves `true` when confirmed; closing the dialog any other way is `false`. */
export const confirmDialog = (options: AppDialogOptions) => open<boolean>('confirm', options);
/** A message with one button. Resolves when it is closed. */
export const alertDialog = (options: AppDialogOptions) => open<boolean>('alert', options).then(() => undefined);
/** Resolves the entered text (trimmed), or `null` when cancelled. */
export const promptDialog = (options: AppPromptOptions) => open<string | null>('prompt', options);

/** Answers the dialog on screen as closing it does (Esc, backdrop, system Back). */
export function dismissAppDialog(): boolean {
  const entry = currentAppDialog.value;
  if (!entry) return false;
  entry.settle(entry.kind === 'prompt' ? null : entry.kind === 'alert');
  return true;
}

/** Tests only: drops every open dialog as dismissed. */
export function resetAppDialogs() {
  while (dismissAppDialog());
}

// ----- the app's usual questions, worded once

type MessageKey = Parameters<ReturnType<typeof useI18n>['t']>[0];
const named = (key: MessageKey, name: string | number) => useI18n().t(key).replace('{name}', String(name));

/** "Удалить канвас «План»?" - a red "Удалить", an optional line on what else happens. */
export const confirmDelete = (titleKey: MessageKey, name: string, noteKey?: MessageKey) => {
  const { t } = useI18n();
  return confirmDialog({ title: named(titleKey, name), message: noteKey ? t(noteKey) : undefined, confirmLabel: t('delete'), danger: true });
};

export const confirmRestoreRevision = (revision: number | string) => {
  const { t } = useI18n();
  return confirmDialog({ title: named('restoreRevisionTitle', revision), message: t('restoreRevisionNote'), confirmLabel: t('restoreRevisionAction') });
};

export const promptText = (titleKey: MessageKey, confirmKey: MessageKey, value = '') => {
  const { t } = useI18n();
  return promptDialog({ title: t(titleKey), confirmLabel: t(confirmKey), value, maxLength: 200 });
};

/** Something failed and the user has to know: the server's reason if there is one. */
export const alertFailure = (titleKey: MessageKey, error: unknown) => {
  const { t } = useI18n();
  return alertDialog({ title: t(titleKey), message: error instanceof Error && error.message ? error.message : t('tryAgainNote') });
};

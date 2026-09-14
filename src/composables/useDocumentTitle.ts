import { watch, type Ref } from 'vue';

const APP_NAME = 'QCanva';

/**
 * Keeps the browser tab title in sync with a reactive value: "<value> ·
 * QCanva", or bare "QCanva" while the value is empty (e.g. a document whose
 * title has not loaded yet).
 */
export function useDocumentTitle(title: Ref<string>) {
  watch(
    title,
    (value) => {
      document.title = value ? `${value} · ${APP_NAME}` : APP_NAME;
    },
    { immediate: true },
  );
}

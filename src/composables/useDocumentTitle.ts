import { getCurrentInstance, watch, type Ref } from 'vue';
import { useViewActivity } from './useViewActivity';
import { useTab } from '../tabs/tabContext';

const APP_NAME = 'QCanva';

/**
 * Keeps the browser tab title in sync with a reactive value: "<value> ·
 * QCanva", or bare "QCanva" while the value is empty (e.g. a document whose
 * title has not loaded yet).
 */
export function useDocumentTitle(title: Ref<string>) {
  // A page asleep in a background tab must not retitle the one on screen; it
  // still names its own tab in the tabs panel.
  const apply = () => { document.title = title.value ? `${title.value} · ${APP_NAME}` : APP_NAME; };
  if (!getCurrentInstance()) {
    // Outside a component (a bare effect scope): no tab, always on screen.
    watch(title, apply, { immediate: true });
    return;
  }
  const tab = useTab();
  const { active } = useViewActivity({ onShow: apply });
  watch(
    title,
    (value) => {
      tab.setTitle(value);
      if (active.value || !tab.key) apply();
    },
    { immediate: true },
  );
}

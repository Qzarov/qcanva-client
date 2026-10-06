import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue';

/**
 * "This page is on screen" for code that must not run behind it: window and
 * document listeners, Back handlers, classes on <html>/<body>, the document
 * title (docs/app-tabs-plan.md, "Сон и пробуждение").
 *
 * In tab mode a page is kept alive while hidden: onActivated / onDeactivated.
 * Everywhere else it is created and destroyed: onMounted / onBeforeUnmount.
 * Both pairs are wired and the callbacks run once per transition, so the same
 * code is right in both worlds - and on the web it is exactly "mounted /
 * unmounted", as before.
 */
export function useViewActivity(callbacks: { onShow?: () => void; onHide?: () => void } = {}) {
  const active = ref(false);
  const show = () => {
    if (active.value) return;
    active.value = true;
    callbacks.onShow?.();
  };
  const hide = () => {
    if (!active.value) return;
    active.value = false;
    callbacks.onHide?.();
  };
  onMounted(show);
  onActivated(show);
  onDeactivated(hide);
  onBeforeUnmount(hide);
  return { active };
}

/** Adds a window/document listener only while the page is on screen. */
export function useActiveListener<K extends keyof WindowEventMap>(
  target: Window | Document,
  type: K | string,
  listener: (event: any) => void,
  options?: boolean | AddEventListenerOptions,
) {
  return useViewActivity({
    onShow: () => target.addEventListener(type, listener, options),
    onHide: () => target.removeEventListener(type, listener, options),
  });
}

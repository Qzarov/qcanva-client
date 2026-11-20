import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from 'vue';

export function useDashboardMobileSidebar(options: {
  open: Ref<boolean>;
  opener: Ref<HTMLElement | null>;
  desktopQuery: string;
}) {
  let previousBodyOverflow: string | null = null;
  let desktopMedia: MediaQueryList | null = null;

  const focusWithoutScroll = (element: HTMLElement) => {
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
  };

  const isVisibleFocusTarget = (element: HTMLElement | null): element is HTMLElement => {
    if (!element?.isConnected || element.tabIndex < 0 || element.getAttribute('aria-hidden') === 'true') return false;
    let current: HTMLElement | null = element;
    while (current) {
      if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      current = current.parentElement;
    }
    return true;
  };

  const restoreCloseFocus = () => {
    if (isVisibleFocusTarget(options.opener.value)) {
      focusWithoutScroll(options.opener.value);
      return;
    }
    const fallback = [
      document.querySelector<HTMLElement>('.dashboard-sidebar [aria-current="page"]'),
      document.querySelector<HTMLElement>('.dashboard-sidebar [data-home-disclosure]'),
      document.querySelector<HTMLElement>('.dashboard-sidebar [data-sidebar-width-toggle]'),
      document.querySelector<HTMLElement>('.dashboard [data-dashboard-view]'),
    ].find(isVisibleFocusTarget) ?? null;
    if (isVisibleFocusTarget(fallback)) focusWithoutScroll(fallback);
  };

  const restoreBodyOverflow = () => {
    if (typeof document === 'undefined' || previousBodyOverflow === null) return;
    document.body.style.overflow = previousBodyOverflow;
    previousBodyOverflow = null;
  };

  const closeOnDesktop = () => {
    if (desktopMedia?.matches) options.open.value = false;
  };

  const removeDesktopListener = () => {
    if (!desktopMedia) return;
    if (typeof desktopMedia.removeEventListener === 'function') {
      desktopMedia.removeEventListener('change', closeOnDesktop);
    } else if (typeof desktopMedia.removeListener === 'function') {
      desktopMedia.removeListener(closeOnDesktop);
    }
    desktopMedia = null;
  };

  watch(options.open, async (open, _previous, onCleanup) => {
    if (typeof document === 'undefined') return;
    let cancelled = false;
    onCleanup(() => { cancelled = true; });

    if (open) {
      if (previousBodyOverflow === null) previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      await nextTick();
      if (!cancelled && options.open.value) {
        const closeButton = document.querySelector<HTMLElement>('.dashboard-sidebar.mobile-open [data-sidebar-close]');
        if (closeButton) focusWithoutScroll(closeButton);
      }
      return;
    }

    restoreBodyOverflow();
    await nextTick();
    if (!cancelled && !options.open.value) restoreCloseFocus();
  });

  onMounted(() => {
    try {
      desktopMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(options.desktopQuery)
        : null;
    } catch {
      desktopMedia = null;
    }
    if (!desktopMedia) return;
    if (typeof desktopMedia.addEventListener === 'function') {
      desktopMedia.addEventListener('change', closeOnDesktop);
    } else if (typeof desktopMedia.addListener === 'function') {
      desktopMedia.addListener(closeOnDesktop);
    }
    closeOnDesktop();
  });

  onBeforeUnmount(() => {
    removeDesktopListener();
    restoreBodyOverflow();
  });

  const open = (event?: Event) => {
    const eventTarget = event?.currentTarget;
    options.opener.value = eventTarget instanceof HTMLElement
      ? eventTarget
      : typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    options.open.value = true;
  };

  const close = () => {
    options.open.value = false;
  };

  return { open, close, closeOnDesktop };
}

import { onBeforeUnmount, onMounted } from 'vue';

const DEFAULT_FRAME_SELECTORS = [
  '.app-layout.dashboard-view',
  '.dashboard-app-shell',
  '.dashboard-central-shell',
];

export function useDashboardFramePinning(selectors = DEFAULT_FRAME_SELECTORS) {
  let frameBoxes: HTMLElement[] = [];

  const pinFrame = () => {
    for (const box of frameBoxes) {
      if (box.scrollTop || box.scrollLeft) {
        box.scrollTop = 0;
        box.scrollLeft = 0;
      }
    }
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
  };

  const pinFrameUnlessTyping = () => {
    const active = document.activeElement as HTMLElement | null;
    if (active?.matches('input, textarea, select, [contenteditable="true"]')) return;
    pinFrame();
  };

  const pinFrameAfterTyping = () => { setTimeout(pinFrameUnlessTyping, 50); };

  onMounted(() => {
    frameBoxes = selectors
      .map((selector) => document.querySelector(selector) as HTMLElement | null)
      .filter((box): box is HTMLElement => Boolean(box));
    for (const box of frameBoxes) box.addEventListener('scroll', pinFrameUnlessTyping, { passive: true });
    window.addEventListener('scroll', pinFrameUnlessTyping, { passive: true });
    document.addEventListener('focusout', pinFrameAfterTyping);
    window.visualViewport?.addEventListener('resize', pinFrameUnlessTyping);
  });

  onBeforeUnmount(() => {
    for (const box of frameBoxes) box.removeEventListener('scroll', pinFrameUnlessTyping);
    window.removeEventListener('scroll', pinFrameUnlessTyping);
    document.removeEventListener('focusout', pinFrameAfterTyping);
    window.visualViewport?.removeEventListener('resize', pinFrameUnlessTyping);
  });

  return { pinFrame, pinFrameUnlessTyping };
}

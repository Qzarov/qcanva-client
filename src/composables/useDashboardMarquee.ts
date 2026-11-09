import { onBeforeUnmount, ref, type Ref } from 'vue';
import { selectAll } from '../dashboard/selection';

export type DashboardMarqueeRect = { left: number; top: number; width: number; height: number };

const MARQUEE_IGNORE = [
  '[data-select-key]', 'button', 'a', 'input', 'select', 'textarea', 'label',
  '[draggable="true"]', '.card-menu', '.mobile-action-popover', '.subfolder-card',
  '.dashboard-modal-backdrop', '[contenteditable="true"]',
].join(',');

export function useDashboardMarquee(options: {
  enabled: boolean;
  dashboardShell: Ref<HTMLElement | null>;
  selectedKeys: Ref<string[]>;
}) {
  const marquee = ref<DashboardMarqueeRect | null>(null);
  let marqueeStart: { x: number; y: number; base: string[] } | null = null;

  const onMarqueeMove = (event: PointerEvent) => {
    if (!marqueeStart) return;
    const dx = event.clientX - marqueeStart.x;
    const dy = event.clientY - marqueeStart.y;
    if (!marquee.value && Math.hypot(dx, dy) < 5) return;
    event.preventDefault();
    window.getSelection?.()?.removeAllRanges();
    const left = Math.min(event.clientX, marqueeStart.x);
    const top = Math.min(event.clientY, marqueeStart.y);
    const right = Math.max(event.clientX, marqueeStart.x);
    const bottom = Math.max(event.clientY, marqueeStart.y);
    marquee.value = { left, top, width: right - left, height: bottom - top };
    const touched = Array.from(options.dashboardShell.value?.querySelectorAll<HTMLElement>('[data-select-key]') || [])
      .filter((card) => {
        const box = card.getBoundingClientRect();
        return box.right >= left && box.left <= right && box.bottom >= top && box.top <= bottom;
      })
      .map((card) => card.dataset.selectKey!)
      .filter(Boolean);
    options.selectedKeys.value = selectAll(marqueeStart.base, touched);
  };

  const endMarquee = () => {
    window.removeEventListener('pointermove', onMarqueeMove);
    window.removeEventListener('pointerup', endMarquee);
    window.removeEventListener('pointercancel', endMarquee);
    marqueeStart = null;
    marquee.value = null;
  };

  const startMarquee = (event: PointerEvent) => {
    if (!options.enabled || event.pointerType !== 'mouse' || event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (!target || target.closest(MARQUEE_IGNORE)) return;
    endMarquee();
    const adding = event.shiftKey || event.metaKey || event.ctrlKey;
    marqueeStart = { x: event.clientX, y: event.clientY, base: adding ? [...options.selectedKeys.value] : [] };
    window.addEventListener('pointermove', onMarqueeMove);
    window.addEventListener('pointerup', endMarquee);
    window.addEventListener('pointercancel', endMarquee);
  };

  onBeforeUnmount(endMarquee);
  return { marquee, startMarquee, endMarquee };
}

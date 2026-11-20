import { nextTick, onBeforeUnmount, watch, type Ref, type WatchSource } from 'vue';

/**
 * A sliding highlight for a segmented control: the container's `::before`
 * sits under the active button and glides to the next one. The position goes
 * into `--thumb-x` / `--thumb-w`; `has-thumb` is set only once it is measured,
 * so until then (and wherever layout is unknown) the active button keeps its
 * own highlight. The container may come and go (v-if): it is re-measured
 * whenever it appears.
 */
export function useSegmentThumb(container: Ref<HTMLElement | null>, active: WatchSource<unknown>) {
  let observer: ResizeObserver | null = null;

  const measure = () => {
    const el = container.value;
    if (!el) return;
    const button = el.querySelector<HTMLElement>('button.active');
    if (!button || !button.offsetWidth) {
      el.classList.remove('has-thumb');
      return;
    }
    el.style.setProperty('--thumb-x', `${button.offsetLeft}px`);
    el.style.setProperty('--thumb-w', `${button.offsetWidth}px`);
    el.classList.add('has-thumb');
  };

  watch(container, (el) => {
    observer?.disconnect();
    observer = null;
    if (!el) return;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }
    void nextTick(measure);
  }, { immediate: true, flush: 'post' });
  watch(active, () => { void nextTick(measure); });
  onBeforeUnmount(() => observer?.disconnect());
}

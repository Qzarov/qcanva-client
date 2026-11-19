import { nextTick } from 'vue';

/**
 * Dashboard motion: height reveals for the sidebar tree and the feed's
 * "Show all / Show less". Web Animations only, so nothing is left behind in
 * inline styles, and nothing moves for prefers-reduced-motion.
 */
export const MOTION_DURATION = 240;
export const MOTION_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

export function prefersReducedMotion(): boolean {
  try {
    return typeof window === 'undefined'
      || typeof window.matchMedia !== 'function'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

const canAnimate = (el: Element): el is HTMLElement => (
  el instanceof HTMLElement && typeof el.animate === 'function' && !prefersReducedMotion()
);

/**
 * JS hooks for <Transition :css="false"> / <TransitionGroup :css="false">:
 * the element grows from nothing to its own height on enter and shrinks back
 * on leave, fading as it goes.
 */
export const heightTransitionHooks = {
  onEnter(el: Element, done: () => void) {
    if (!canAnimate(el)) return done();
    const height = el.scrollHeight;
    el.style.overflow = 'hidden';
    const animation = el.animate(
      [{ height: '0px', opacity: 0 }, { height: `${height}px`, opacity: 1 }],
      { duration: MOTION_DURATION, easing: MOTION_EASING },
    );
    animation.onfinish = animation.oncancel = () => {
      el.style.overflow = '';
      done();
    };
  },
  onLeave(el: Element, done: () => void) {
    if (!canAnimate(el)) return done();
    const height = el.getBoundingClientRect().height;
    el.style.overflow = 'hidden';
    const animation = el.animate(
      [{ height: `${height}px`, opacity: 1 }, { height: '0px', opacity: 0 }],
      { duration: MOTION_DURATION, easing: MOTION_EASING, fill: 'forwards' },
    );
    animation.onfinish = animation.oncancel = () => done();
  },
};

/**
 * Animate `el` from its current height to the one `change` leaves it at.
 * Growing: `change` runs first and the new content is revealed. Shrinking
 * (`collapseTo` given): the content stays while the box closes down to
 * `collapseTo`, and only then does `change` remove it.
 */
export async function animateHeight(
  el: HTMLElement | null | undefined,
  change: () => void,
  options: { collapseTo?: number } = {},
): Promise<void> {
  if (!el || !canAnimate(el)) {
    change();
    return;
  }
  const from = el.getBoundingClientRect().height;
  const previousOverflow = el.style.overflow;
  el.style.overflow = 'hidden';
  const run = (to: number) => new Promise<void>((resolve) => {
    const animation = el.animate(
      [{ height: `${from}px` }, { height: `${to}px` }],
      { duration: MOTION_DURATION + 60, easing: MOTION_EASING },
    );
    animation.onfinish = animation.oncancel = () => resolve();
  });

  if (options.collapseTo !== undefined && options.collapseTo < from) {
    // Hold the closed height until Vue has removed the extra items.
    el.style.height = `${options.collapseTo}px`;
    await run(options.collapseTo);
    change();
    await nextTick();
    el.style.height = '';
  } else {
    change();
    await nextTick();
    const to = el.getBoundingClientRect().height;
    if (Math.abs(to - from) >= 1) await run(to);
  }
  el.style.overflow = previousOverflow;
}

/** Height `el` keeps once only its first `count` children remain. */
export function heightOfFirstChildren(el: HTMLElement, count: number): number | undefined {
  const last = el.children[count - 1];
  if (!(last instanceof HTMLElement)) return undefined;
  return last.getBoundingClientRect().bottom - el.getBoundingClientRect().top;
}

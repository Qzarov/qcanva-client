/**
 * v-hint="label": a small tooltip with an icon button's name - the name
 * only, nothing else.
 *
 * - Mouse: shown after a short hover, gone when the pointer leaves or presses.
 * - Keyboard: shown while the button has keyboard focus.
 * - Touch: shown by pressing and holding; the hold does NOT also run the
 *   button's action (the click that follows the hold is swallowed), and the
 *   hint stays up a moment after the finger lifts so it can be read.
 *
 * One tooltip element for the whole page, kept in <body> (never clipped by a
 * toolbar's overflow), placed under the button - or above it when there is
 * no room below. It fades and slides in/out (style.css `.ui-hint`), like
 * every popup in the app.
 */

import type { Directive } from 'vue';

export const HINT_HOVER_DELAY_MS = 350;
export const HINT_HOLD_MS = 450;
export const HINT_TOUCH_LINGER_MS = 1200;
const GAP = 8;

type HintState = {
  text: string;
  hoverTimer: ReturnType<typeof setTimeout> | null;
  holdTimer: ReturnType<typeof setTimeout> | null;
  swallowClick: boolean;
  cleanup: () => void;
};

const states = new WeakMap<HTMLElement, HintState>();
let tip: HTMLDivElement | null = null;
let owner: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function tipElement(): HTMLDivElement {
  if (tip && tip.isConnected) return tip;
  tip = document.createElement('div');
  tip.className = 'ui-hint';
  tip.setAttribute('role', 'tooltip');
  tip.id = 'ui-hint';
  document.body.appendChild(tip);
  return tip;
}

function place(el: HTMLElement, box: HTMLDivElement) {
  const rect = el.getBoundingClientRect();
  const width = box.offsetWidth;
  const height = box.offsetHeight;
  const below = rect.bottom + GAP + height <= window.innerHeight;
  const top = below ? rect.bottom + GAP : rect.top - GAP - height;
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
  box.style.top = `${Math.max(8, top)}px`;
  box.style.left = `${left}px`;
  box.dataset.side = below ? 'bottom' : 'top';
}

export function showHint(el: HTMLElement) {
  const state = states.get(el);
  if (!state || !state.text) return;
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  const box = tipElement();
  box.textContent = state.text;
  owner = el;
  el.setAttribute('aria-describedby', box.id);
  place(el, box);
  // Next frame, so the entry transition runs from the hidden state.
  requestAnimationFrame(() => {
    if (owner === el) box.classList.add('visible');
  });
}

export function hideHint(el?: HTMLElement) {
  if (el && owner !== el) return;
  if (owner) owner.removeAttribute('aria-describedby');
  owner = null;
  tip?.classList.remove('visible');
}

function clearTimers(state: HintState) {
  if (state.hoverTimer) clearTimeout(state.hoverTimer);
  if (state.holdTimer) clearTimeout(state.holdTimer);
  state.hoverTimer = null;
  state.holdTimer = null;
}

export const vHint: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    const state: HintState = { text: binding.value || '', hoverTimer: null, holdTimer: null, swallowClick: false, cleanup: () => undefined };
    states.set(el, state);

    const onEnter = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      clearTimers(state);
      state.hoverTimer = setTimeout(() => showHint(el), HINT_HOVER_DELAY_MS);
    };
    const onLeave = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      clearTimers(state);
      hideHint(el);
    };
    const onDown = (event: PointerEvent) => {
      clearTimers(state);
      if (event.pointerType === 'mouse') {
        hideHint(el);
        return;
      }
      state.swallowClick = false;
      state.holdTimer = setTimeout(() => {
        state.swallowClick = true;
        showHint(el);
      }, HINT_HOLD_MS);
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      if (state.holdTimer) clearTimeout(state.holdTimer);
      state.holdTimer = null;
      if (state.swallowClick) {
        hideTimer = setTimeout(() => hideHint(el), HINT_TOUCH_LINGER_MS);
      }
    };
    const onCancel = () => {
      clearTimers(state);
      hideHint(el);
    };
    // Capturing, so the hold's own click never reaches the button's handler.
    const onClick = (event: MouseEvent) => {
      if (!state.swallowClick) return;
      state.swallowClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onContextMenu = (event: Event) => {
      if (state.swallowClick || state.holdTimer) event.preventDefault();
    };
    const onFocus = () => {
      if (el.matches(':focus-visible')) showHint(el);
    };
    const onBlur = () => hideHint(el);

    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('click', onClick, true);
    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('focus', onFocus);
    el.addEventListener('blur', onBlur);
    state.cleanup = () => {
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('click', onClick, true);
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('focus', onFocus);
      el.removeEventListener('blur', onBlur);
    };
  },
  updated(el, binding) {
    const state = states.get(el);
    if (!state) return;
    state.text = binding.value || '';
    if (owner === el && tip) tip.textContent = state.text;
  },
  unmounted(el) {
    const state = states.get(el);
    if (!state) return;
    clearTimers(state);
    state.cleanup();
    hideHint(el);
    states.delete(el);
  },
};

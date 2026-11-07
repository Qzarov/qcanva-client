/**
 * v-file-info="{ title, rows }": the card of a file shows, on hover, its full
 * name and what is known about it (size, type, dates) in a small panel.
 *
 * Mouse only: on a phone a long press ticks the card, so there is no hover
 * there and no hold to borrow. Shown after a short hover, gone when the
 * pointer leaves, presses or the page scrolls. One panel for the whole page,
 * kept in <body>, placed under the card or above it when there is no room;
 * it fades in and out (style.css `.ui-file-info`), like every popup here.
 */

import type { Directive } from 'vue';

export type FileInfo = {
  title: string;
  /** [label, value] pairs; empty values are left out. */
  rows: Array<[string, string | null | undefined]>;
};

export const FILE_INFO_DELAY_MS = 450;
const GAP = 6;

const infos = new WeakMap<HTMLElement, { info: FileInfo | null; timer: ReturnType<typeof setTimeout> | null; cleanup: () => void }>();
let panel: HTMLDivElement | null = null;
let owner: HTMLElement | null = null;

function panelElement(): HTMLDivElement {
  if (panel && panel.isConnected) return panel;
  panel = document.createElement('div');
  panel.className = 'ui-file-info';
  panel.setAttribute('role', 'tooltip');
  panel.id = 'ui-file-info';
  panel.dataset.fileInfo = '';
  document.body.appendChild(panel);
  return panel;
}

function render(box: HTMLDivElement, info: FileInfo) {
  box.replaceChildren();
  const title = document.createElement('div');
  title.className = 'ui-file-info-title';
  title.textContent = info.title;
  box.appendChild(title);
  const rows = info.rows.filter(([, value]) => value);
  if (!rows.length) return;
  const list = document.createElement('dl');
  list.className = 'ui-file-info-rows';
  for (const [label, value] of rows) {
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = value!;
    list.append(term, detail);
  }
  box.appendChild(list);
}

function place(el: HTMLElement, box: HTMLDivElement) {
  const rect = el.getBoundingClientRect();
  const width = box.offsetWidth;
  const height = box.offsetHeight;
  const below = rect.bottom + GAP + height <= window.innerHeight;
  const top = below ? rect.bottom + GAP : rect.top - GAP - height;
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  box.style.top = `${Math.max(8, top)}px`;
  box.style.left = `${left}px`;
  box.dataset.side = below ? 'bottom' : 'top';
}

function show(el: HTMLElement) {
  const state = infos.get(el);
  if (!state?.info) return;
  const box = panelElement();
  render(box, state.info);
  owner = el;
  el.setAttribute('aria-describedby', box.id);
  place(el, box);
  requestAnimationFrame(() => {
    if (owner === el) box.classList.add('visible');
  });
}

function hide(el?: HTMLElement) {
  if (el && owner !== el) return;
  owner?.removeAttribute('aria-describedby');
  owner = null;
  panel?.classList.remove('visible');
}

const onScroll = () => hide();

export const vFileInfo: Directive<HTMLElement, FileInfo | null> = {
  mounted(el, binding) {
    const state = { info: binding.value ?? null, timer: null as ReturnType<typeof setTimeout> | null, cleanup: () => undefined };
    infos.set(el, state);
    const clear = () => {
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
    };
    const onEnter = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      clear();
      state.timer = setTimeout(() => show(el), FILE_INFO_DELAY_MS);
    };
    const onLeave = () => {
      clear();
      hide(el);
    };
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointerdown', onLeave);
    window.addEventListener('scroll', onScroll, true);
    state.cleanup = () => {
      clear();
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerdown', onLeave);
      window.removeEventListener('scroll', onScroll, true);
    };
  },
  updated(el, binding) {
    const state = infos.get(el);
    if (!state) return;
    state.info = binding.value ?? null;
    if (owner === el && panel && state.info) render(panel, state.info);
  },
  unmounted(el) {
    const state = infos.get(el);
    if (!state) return;
    state.cleanup();
    hide(el);
    infos.delete(el);
  },
};

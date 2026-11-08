<template>
  <Transition :name="backdropTransition">
    <div
      v-if="mobileOpen"
      :class="backdropClass"
      data-sidebar-backdrop
      aria-hidden="true"
      @click="emit('close-mobile')"
    ></div>
  </Transition>

  <aside
    ref="sidebarRef"
    v-bind="$attrs"
    :aria-label="ariaLabel || undefined"
    :role="mobileOpen ? 'dialog' : undefined"
    :aria-modal="mobileOpen ? 'true' : undefined"
    @keydown.esc.stop="emit('close-mobile')"
    @keydown.tab="trapMobileFocus"
  >
    <slot name="header" />
    <slot />
    <slot name="footer" />
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineOptions({ inheritAttrs: false });

withDefaults(defineProps<{
  mobileOpen?: boolean;
  ariaLabel?: string;
  backdropClass?: string;
  backdropTransition?: string;
}>(), {
  mobileOpen: false,
  ariaLabel: '',
  backdropClass: 'sidebar-shell-backdrop',
  backdropTransition: 'sidebar-shell-backdrop',
});

const emit = defineEmits<{ 'close-mobile': [] }>();
const sidebarRef = ref<HTMLElement | null>(null);
const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const isVisibleFocusable = (element: HTMLElement, boundary: HTMLElement) => {
  if (element.tabIndex < 0 || element.getAttribute('aria-hidden') === 'true') return false;
  let current: HTMLElement | null = element;
  while (current && current !== boundary) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    current = current.parentElement;
  }
  return true;
};

const trapMobileFocus = (event: KeyboardEvent) => {
  const props = (event.currentTarget as HTMLElement | null)?.getAttribute('aria-modal');
  if (props !== 'true') return;
  const sidebar = sidebarRef.value;
  if (!sidebar) return;
  const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => isVisibleFocusable(element, sidebar));
  if (!focusable.length) {
    event.preventDefault();
    return;
  }
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !sidebar.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !sidebar.contains(active))) {
    event.preventDefault();
    first.focus();
  }
};
</script>

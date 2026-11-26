<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from '../../composables/useI18n';

export type ScrubGroup = {
  key: string;
  count: number;
  /** Full label (tooltip, and the visible label for non-date groups). */
  label: string;
  /** Date groups: short label shown on the rail (the year); repeated values are skipped. */
  short?: string | null;
};

const props = defineProps<{
  groups: ScrubGroup[];
  kind: 'date' | 'other';
  /** Current place: group key and fraction (0..1) inside it. */
  current: { key: string; frac: number } | null;
  /** Tooltip text for a pointer position; defaults to the group label. */
  hoverLabel?: (key: string, frac: number) => string;
}>();

const emit = defineEmits<{ (e: 'jump', key: string, frac: number): void }>();

const { t } = useI18n();
const FALLBACK_HEIGHT = 600;
const root = ref<HTMLElement | null>(null);
const height = ref(0);
const dragging = ref(false);
const hover = ref<{ y: number; label: string } | null>(null);

const total = computed(() => props.groups.reduce((s, g) => s + g.count, 0) || 1);

/** Start/size of every group as fractions of the rail. */
const spans = computed(() => {
  let acc = 0;
  return props.groups.map((g) => {
    const start = acc / total.value;
    acc += g.count;
    return { key: g.key, start, size: g.count / total.value };
  });
});

const railHeight = computed(() => height.value || FALLBACK_HEIGHT);

const marks = computed(() => {
  const maxN = Math.max(...props.groups.map((g) => g.count), 1);
  const out: Array<{
    key: string;
    top: number;
    width: number;
    label: string | null;
    title: string;
    fold: boolean;
  }> = [];
  let lastShort: string | null = null;
  let lastLabelY = -99;
  props.groups.forEach((g, i) => {
    const sp = spans.value[i]!;
    const y = sp.start * railHeight.value;
    let label: string | null = null;
    let fold = false;
    if (props.kind === 'date') {
      const short = g.short ?? null;
      if (short && short !== lastShort && y - lastLabelY > 16) {
        label = short;
        lastLabelY = y;
      }
      if (short) lastShort = short;
    } else if (y - lastLabelY > 26) {
      label = g.label;
      fold = true;
      lastLabelY = y;
    }
    out.push({
      key: g.key,
      top: sp.start * 100,
      width: props.kind === 'date' ? 4 + (10 * g.count) / maxN : 14,
      label,
      title: g.label,
      fold,
    });
  });
  return out;
});

const nowTop = computed(() => {
  const cur = props.current;
  if (!cur) return null;
  const sp = spans.value.find((s) => s.key === cur.key);
  if (!sp) return null;
  return (sp.start + Math.min(Math.max(cur.frac, 0), 1) * sp.size) * 100;
});

const currentIndex = computed(() => {
  const i = props.groups.findIndex((g) => g.key === props.current?.key);
  return i < 0 ? 0 : i;
});
const valueText = computed(() => props.groups[currentIndex.value]?.label ?? '');

const PAGE_STEP = 5;

function onKey(e: KeyboardEvent): void {
  const n = props.groups.length;
  if (n === 0) return;
  const i = currentIndex.value;
  let to: number;
  switch (e.key) {
    case 'ArrowUp':
      to = i - 1;
      break;
    case 'ArrowDown':
      to = i + 1;
      break;
    case 'PageUp':
      to = i - PAGE_STEP;
      break;
    case 'PageDown':
      to = i + PAGE_STEP;
      break;
    case 'Home':
      to = 0;
      break;
    case 'End':
      to = n - 1;
      break;
    default:
      return;
  }
  e.preventDefault();
  to = Math.min(Math.max(to, 0), n - 1);
  const g = props.groups[to];
  if (g) emit('jump', g.key, 0);
}

function measure(): void {
  const el = root.value;
  if (!el) return;
  height.value = el.getBoundingClientRect().height || el.clientHeight || 0;
}

function labelFor(key: string, frac: number): string {
  if (props.hoverLabel) return props.hoverLabel(key, frac);
  return props.groups.find((g) => g.key === key)?.label ?? '';
}

function move(e: PointerEvent, jump: boolean): void {
  const el = root.value;
  if (!el || props.groups.length === 0) return;
  const r = el.getBoundingClientRect();
  const h = r.height || 1;
  const y = Math.min(Math.max(e.clientY - r.top, 0), h - 1);
  const yf = y / h;
  let idx = 0;
  for (let i = 0; i < spans.value.length; i++) {
    if (spans.value[i]!.start <= yf) idx = i;
  }
  const sp = spans.value[idx]!;
  const frac = Math.min(Math.max((yf - sp.start) / (sp.size || 1), 0), 0.999);
  hover.value = { y, label: labelFor(sp.key, frac) };
  if (jump) emit('jump', sp.key, frac);
}

function onDown(e: PointerEvent): void {
  dragging.value = true;
  const el = root.value;
  if (el && typeof el.setPointerCapture === 'function' && e.pointerId !== undefined) {
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Capture is best effort (synthetic events have no active pointer).
    }
  }
  move(e, true);
}

function onMove(e: PointerEvent): void {
  move(e, dragging.value);
}

function onUp(): void {
  dragging.value = false;
}

function onLeave(): void {
  if (!dragging.value) hover.value = null;
}

let ro: ResizeObserver | null = null;
let roRaf = 0;

function scheduleMeasure(): void {
  if (typeof requestAnimationFrame !== 'function') {
    measure();
    return;
  }
  if (roRaf) cancelAnimationFrame(roRaf);
  roRaf = requestAnimationFrame(() => {
    roRaf = 0;
    measure();
  });
}

onMounted(() => {
  measure();
  if (typeof ResizeObserver !== 'undefined' && root.value) {
    ro = new ResizeObserver(scheduleMeasure);
    ro.observe(root.value);
  }
  window.addEventListener('resize', measure);
});
onBeforeUnmount(() => {
  if (roRaf && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(roRaf);
    roRaf = 0;
  }
  ro?.disconnect();
  window.removeEventListener('resize', measure);
});
</script>

<template>
  <div
    ref="root"
    class="scrub"
    :class="{ drag: dragging }"
    data-testid="scrubber"
    role="slider"
    tabindex="0"
    aria-orientation="vertical"
    :aria-label="t('photosScrubberLabel')"
    :aria-valuemin="0"
    :aria-valuemax="Math.max(0, groups.length - 1)"
    :aria-valuenow="currentIndex"
    :aria-valuetext="valueText"
    @keydown="onKey"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @pointerleave="onLeave"
  >
    <template v-for="m in marks" :key="m.key">
      <span v-if="m.label" class="scrub-year" :class="{ fold: m.fold }" :style="{ top: `${m.top}%` }" :title="m.title">{{ m.label }}</span>
      <span class="scrub-tick" :class="{ other: kind === 'other' }" :style="{ top: `${m.top}%`, width: `${m.width}px` }"></span>
    </template>
    <span v-if="hover" class="scrub-line" :style="{ top: `${hover.y}px` }"></span>
    <span v-if="hover" class="scrub-hover" data-testid="scrub-hover" :style="{ top: `${hover.y}px` }">{{ hover.label }}</span>
    <span v-if="nowTop !== null" class="scrub-now" data-testid="scrub-now" :style="{ top: `${nowTop}%` }"></span>
  </div>
</template>

<style scoped>
.scrub {
  position: relative;
  width: 56px;
  flex: none;
  margin: 14px 6px 14px 0;
  cursor: ns-resize;
  user-select: none;
  touch-action: none;
}
.scrub:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
  border-radius: 4px;
}
.scrub-tick {
  position: absolute;
  right: 8px;
  height: 2px;
  border-radius: 1px;
  background: color-mix(in srgb, var(--ui-text-muted) 40%, transparent);
}
.scrub-tick.other {
  background: color-mix(in srgb, var(--ui-accent-strong) 55%, transparent);
}
.scrub-year {
  position: absolute;
  right: 16px;
  transform: translateY(-50%);
  font-size: 11px;
  font-weight: 600;
  color: var(--ui-text-muted);
  white-space: nowrap;
}
.scrub-year.fold {
  font-weight: 500;
  max-width: 40px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.scrub-now {
  position: absolute;
  right: 2px;
  left: auto;
  width: 3px;
  height: 18px;
  border-radius: 999px;
  transform: translateY(-50%);
  background: var(--ui-brand);
  box-shadow: 0 0 10px color-mix(in srgb, var(--ui-brand) 60%, transparent);
  pointer-events: none;
}
.scrub-line {
  position: absolute;
  left: 6px;
  right: 0;
  height: 1px;
  background: color-mix(in srgb, var(--ui-accent-strong) 50%, transparent);
  pointer-events: none;
}
.scrub-hover {
  position: absolute;
  right: calc(100% + 6px);
  transform: translateY(-50%);
  padding: 5px 10px;
  border-radius: 8px;
  background: var(--ui-glass-bg);
  border: 1px solid var(--ui-glass-border);
  backdrop-filter: blur(var(--ui-glass-blur, 18px));
  color: var(--ui-text);
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
  z-index: 5;
}
:root[data-theme='light'] .scrub-hover {
  background: rgba(255, 255, 255, 0.92);
  border-color: rgba(20, 91, 37, 0.22);
  color: var(--ui-text);
}
</style>

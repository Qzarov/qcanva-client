<template>
  <aside
    v-if="visible"
    ref="asideRef"
    class="activity-journal"
    :class="{
      'is-expanded': expanded,
      'is-running': summary.running > 0,
      'is-error': summary.running === 0 && summary.error > 0,
      'is-dragging': isDragging,
      'is-android-app': isAndroidApp,
    }"
    :style="asideStyle"
    data-activity-journal
    :aria-label="t('activityJournalAria')"
  >
    <Transition name="activity-journal-pop" mode="out-in">
      <div v-if="!expanded" key="pill" class="activity-journal-pill-wrap">
        <button
          type="button"
          class="activity-journal-pill"
          data-activity-pill
          :aria-label="pillAriaLabel"
          aria-expanded="false"
          @pointerdown="onDragPointerDown"
          @click="onPillClick"
        >
          <span class="activity-journal-ring" :class="{ 'is-indeterminate': summary.running > 0 && summary.percent === null }" aria-hidden="true">
            <svg class="activity-journal-ring-svg" viewBox="0 0 36 36">
              <circle class="activity-journal-ring-track" cx="18" cy="18" r="15.5" />
              <circle
                v-if="summary.running > 0"
                class="activity-journal-ring-fill"
                cx="18"
                cy="18"
                r="15.5"
                :stroke-dasharray="RING_CIRCUMFERENCE"
                :stroke-dashoffset="ringDashOffset"
              />
            </svg>
            <LoaderCircle v-if="summary.running > 0" class="activity-journal-spinner" :size="15" />
            <CircleAlert v-else-if="summary.error > 0" :size="15" />
            <Check v-else :size="15" />
          </span>
          <span class="activity-journal-pill-label" data-activity-pill-label>{{ pillLabel }}</span>
          <span v-if="summary.running > 0 && summary.percent !== null" class="activity-journal-pill-percent" data-activity-pill-percent>{{ summary.percent }}%</span>
          <ChevronUp :size="15" class="activity-journal-pill-chevron" aria-hidden="true" />
        </button>
        <button
          v-if="summary.running === 0"
          type="button"
          class="activity-journal-dismiss"
          data-activity-dismiss
          :aria-label="t('activityJournalDismiss')"
          :title="t('activityJournalDismiss')"
          @click="dismiss()"
        >
          <X :size="14" aria-hidden="true" />
        </button>
      </div>

      <section v-else key="drawer" class="activity-journal-drawer" data-activity-drawer>
        <header
          class="activity-journal-head"
          data-activity-head
          @pointerdown="onDragPointerDown"
        >
          <div class="activity-journal-head-title" :data-activity-state="headerState">
            <LoaderCircle v-if="summary.running > 0" class="activity-journal-spinner" :size="16" aria-hidden="true" />
            <CircleAlert v-else-if="summary.error > 0" :size="16" aria-hidden="true" />
            <Check v-else :size="16" aria-hidden="true" />
            <span data-activity-head-title>{{ headerTitle }}</span>
            <span v-if="summary.running > 0 && summary.percent !== null" class="activity-journal-head-percent" data-activity-head-percent>{{ summary.percent }}%</span>
          </div>
          <div class="activity-journal-head-actions">
            <button
              v-if="summary.settled > 0"
              type="button"
              class="activity-journal-clear"
              data-activity-clear
              @click="clearCompleted()"
            >
              {{ t('activityJournalClearCompleted') }}
            </button>
            <button
              type="button"
              class="activity-journal-collapse"
              data-activity-collapse
              :aria-label="t('activityJournalCollapse')"
              :title="t('activityJournalCollapse')"
              aria-expanded="true"
              @click="setExpanded(false)"
            >
              <ChevronDown :size="16" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div v-if="summary.running > 0" class="activity-journal-aggregate" aria-hidden="true">
          <div
            class="activity-journal-aggregate-fill"
            :class="{ 'is-indeterminate': summary.percent === null }"
            :style="summary.percent !== null ? { width: `${summary.percent}%` } : undefined"
          ></div>
        </div>

        <ul class="activity-journal-list" data-activity-list>
          <li
            v-for="task in tasks"
            :key="task.id"
            class="activity-journal-item"
            :class="`is-${task.status}`"
            :data-activity-item="task.id"
            :data-activity-status="task.status"
            :data-activity-kind="task.kind"
          >
            <div class="activity-journal-item-row">
              <span class="activity-journal-kind-icon" aria-hidden="true">
                <component :is="kindIcon(task.kind)" :size="15" />
              </span>
              <div class="activity-journal-item-main">
                <div class="activity-journal-item-top">
                  <span class="activity-journal-item-title" :title="task.title">{{ task.title }}</span>
                  <span class="activity-journal-badge" :class="`is-${task.status}`" data-activity-status-badge>{{ statusLabel(task.status) }}</span>
                </div>
                <div v-if="task.detail || (task.status === 'running' && task.progress !== null)" class="activity-journal-item-meta">
                  <span v-if="task.detail" class="activity-journal-item-detail" :title="task.detail" data-activity-detail>{{ task.detail }}</span>
                  <span v-if="task.status === 'running' && task.progress !== null" class="activity-journal-item-percent" data-activity-item-percent>{{ task.progress }}%</span>
                </div>
              </div>
              <button
                v-if="task.status === 'running' && task.cancellable"
                type="button"
                class="activity-journal-cancel"
                :data-activity-cancel="task.id"
                :aria-label="t('activityJournalCancelTask')"
                :title="t('activityJournalCancelTask')"
                @click="cancelTask(task.id)"
              >
                <X :size="14" aria-hidden="true" />
              </button>
            </div>
            <div v-if="task.status === 'running'" class="activity-journal-track" aria-hidden="true">
              <div
                class="activity-journal-fill"
                :class="{ 'is-indeterminate': task.progress === null }"
                :style="task.progress !== null ? { width: `${task.progress}%` } : undefined"
              ></div>
            </div>
          </li>
        </ul>
      </section>
    </Transition>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Capacitor } from '@capacitor/core';
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Download,
  Film,
  Layers,
  LoaderCircle,
  RefreshCw,
  Upload,
  X,
} from '@lucide/vue';
import {
  useActivityJournal,
  useActivityJournalHost,
  type ActivityKind,
  type ActivityStatus,
} from '../composables/useActivityJournal';
import { useExplorerLayoutPrefs } from '../composables/useExplorerLayoutPrefs';
import { useI18n } from '../composables/useI18n';

const RING_RADIUS = 15.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const DRAG_THRESHOLD_PX = 5;
const VIEWPORT_PADDING_PX = 8;

useActivityJournalHost();
const { t } = useI18n();
const isAndroidApp = computed(() => Capacitor.isNativePlatform());
const { tasks, expanded, visible, summary, cancelTask, clearCompleted, dismiss, setExpanded } = useActivityJournal();
const { activityJournalPos, setActivityJournalPos } = useExplorerLayoutPrefs();

const asideRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const dragPos = ref<{ x: number; y: number } | null>(null);
const viewportSize = ref({
  w: typeof window !== 'undefined' ? window.innerWidth : 1280,
  h: typeof window !== 'undefined' ? window.innerHeight : 720,
});

interface DragState {
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  moved: boolean;
}

let dragState: DragState | null = null;
let suppressNextClick = false;

function clampPos(rawX: number, rawY: number): { x: number; y: number } {
  const el = asideRef.value;
  const rect = el?.getBoundingClientRect();
  const w = (rect && rect.width > 0 ? rect.width : el?.offsetWidth) || (expanded.value ? 340 : 180);
  const h = (rect && rect.height > 0 ? rect.height : el?.offsetHeight) || (expanded.value ? 220 : 42);
  const vw = viewportSize.value.w || 1280;
  const vh = viewportSize.value.h || 720;
  const maxX = Math.max(VIEWPORT_PADDING_PX, vw - w - VIEWPORT_PADDING_PX);
  const maxY = Math.max(VIEWPORT_PADDING_PX, vh - h - VIEWPORT_PADDING_PX);
  return {
    x: Math.round(Math.max(VIEWPORT_PADDING_PX, Math.min(maxX, rawX))),
    y: Math.round(Math.max(VIEWPORT_PADDING_PX, Math.min(maxY, rawY))),
  };
}

const activePos = computed(() => {
  const pos = dragPos.value ?? activityJournalPos.value;
  if (!pos) return null;
  return clampPos(pos.x, pos.y);
});

const asideStyle = computed(() => {
  if (!activePos.value) return undefined;
  return {
    left: `${activePos.value.x}px`,
    top: `${activePos.value.y}px`,
    right: 'auto',
    bottom: 'auto',
  };
});

function onWindowPointerMove(event: PointerEvent) {
  if (!dragState) return;
  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;
  if (!dragState.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
  dragState.moved = true;
  isDragging.value = true;
  dragPos.value = clampPos(dragState.startLeft + dx, dragState.startTop + dy);
}

function stopDragListeners() {
  window.removeEventListener('pointermove', onWindowPointerMove);
  window.removeEventListener('pointerup', onWindowPointerUp);
  window.removeEventListener('pointercancel', onWindowPointerUp);
}

function onWindowPointerUp(event: PointerEvent) {
  if (!dragState) return;
  stopDragListeners();
  if (dragState.moved) {
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    const finalPos = clampPos(dragState.startLeft + dx, dragState.startTop + dy);
    setActivityJournalPos(finalPos);
    suppressNextClick = true;
    setTimeout(() => {
      suppressNextClick = false;
    }, 0);
  }
  dragPos.value = null;
  isDragging.value = false;
  dragState = null;
}

function onDragPointerDown(event: PointerEvent) {
  if (event.button !== undefined && event.button !== 0) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('.activity-journal-clear, .activity-journal-collapse, .activity-journal-dismiss')) return;

  const existing = activePos.value;
  const rect = asideRef.value?.getBoundingClientRect();
  const startLeft = existing
    ? existing.x
    : (rect && (rect.width > 0 || rect.left > 0) ? rect.left : Math.max(VIEWPORT_PADDING_PX, viewportSize.value.w - 220));
  const startTop = existing
    ? existing.y
    : (rect && (rect.height > 0 || rect.top > 0) ? rect.top : Math.max(VIEWPORT_PADDING_PX, viewportSize.value.h - 70));

  dragState = {
    startX: event.clientX,
    startY: event.clientY,
    startLeft,
    startTop,
    moved: false,
  };

  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', onWindowPointerMove);
  window.addEventListener('pointerup', onWindowPointerUp);
  window.addEventListener('pointercancel', onWindowPointerUp);
}

function onPillClick() {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  setExpanded(true);
}

function onWindowResize() {
  viewportSize.value = { w: window.innerWidth, h: window.innerHeight };
}

onMounted(() => {
  window.addEventListener('resize', onWindowResize);
});

onBeforeUnmount(() => {
  stopDragListeners();
  window.removeEventListener('resize', onWindowResize);
});

const headerState = computed<'running' | 'error' | 'done'>(() => {
  if (summary.value.running > 0) return 'running';
  if (summary.value.error > 0) return 'error';
  return 'done';
});

const headerTitle = computed(() => {
  const s = summary.value;
  if (s.running > 0) return t('activityJournalRunning').replace('{n}', String(s.running));
  if (s.error > 0) return t('activityJournalError').replace('{n}', String(s.error));
  if (s.done > 0) return t('activityJournalDone').replace('{n}', String(s.done));
  return t('activityJournalTitle');
});

const pillLabel = computed(() => {
  const s = summary.value;
  if (s.running > 0) return t('activityJournalPillRunning').replace('{n}', String(s.running));
  if (s.error > 0) return t('activityJournalPillError').replace('{n}', String(s.error));
  return t('activityJournalPillDone').replace('{n}', String(s.done || s.total));
});

const pillAriaLabel = computed(() => {
  const parts = [t('activityJournalExpand'), pillLabel.value];
  if (summary.value.running > 0 && summary.value.percent !== null) {
    parts.push(`${summary.value.percent}%`);
  }
  return parts.join(' — ');
});

const ringDashOffset = computed(() => {
  const pct = summary.value.percent;
  if (pct === null) return RING_CIRCUMFERENCE * 0.72;
  return RING_CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, pct)) / 100);
});

function kindIcon(kind: ActivityKind) {
  switch (kind) {
    case 'upload': return Upload;
    case 'download': return Download;
    case 'bulk': return Layers;
    case 'sync': return RefreshCw;
    case 'media': return Film;
  }
}

function statusLabel(status: ActivityStatus): string {
  switch (status) {
    case 'running': return t('activityJournalStatusRunning');
    case 'done': return t('activityJournalStatusDone');
    case 'error': return t('activityJournalStatusError');
    case 'cancelled': return t('activityJournalStatusCancelled');
  }
}
</script>

<style scoped>
.activity-journal {
  position: fixed;
  right: 80px;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  z-index: 335;
  pointer-events: none;
  color: var(--ui-text);
}

.activity-journal-pill-wrap,
.activity-journal-drawer {
  pointer-events: auto;
}

.activity-journal-pill-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.activity-journal-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px 5px 5px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 999px;
  background: var(--ui-glass-tint), var(--ui-glass-bg);
  box-shadow: var(--ui-glass-surface-shadow);
  backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2);
  color: var(--ui-text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  touch-action: none;
  transition: background-color 0.15s ease, transform 0.15s ease;
}

.activity-journal-pill:hover {
  background: var(--ui-glass-btn-hover), var(--ui-glass-bg);
}

.activity-journal-pill:active {
  transform: scale(0.98);
}

.activity-journal-pill:focus-visible,
.activity-journal-dismiss:focus-visible,
.activity-journal-clear:focus-visible,
.activity-journal-collapse:focus-visible,
.activity-journal-cancel:focus-visible {
  outline: 2px solid var(--ui-focus);
  outline-offset: 2px;
}

.activity-journal-dismiss {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--ui-glass-border);
  border-radius: 999px;
  background: var(--ui-glass-tint), var(--ui-glass-bg);
  box-shadow: var(--ui-glass-surface-shadow);
  backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2);
  color: var(--ui-text-secondary);
  cursor: pointer;
}

.activity-journal-dismiss:hover {
  background: var(--ui-glass-btn-hover), var(--ui-glass-bg);
  color: var(--ui-text);
}

.activity-journal-ring {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: var(--ui-brand);
}

.activity-journal.is-error .activity-journal-ring {
  color: var(--ui-danger);
}

.activity-journal.is-running .activity-journal-ring {
  color: var(--ui-accent-strong);
}

.activity-journal-ring-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.activity-journal-ring.is-indeterminate .activity-journal-ring-svg {
  animation: activity-journal-spin 1.1s linear infinite;
}

.activity-journal-ring-track,
.activity-journal-ring-fill {
  fill: none;
  stroke-width: 3;
}

.activity-journal-ring-track {
  stroke: var(--ui-surface-subtle);
}

.activity-journal-ring-fill {
  stroke: currentColor;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.3s ease;
}

.activity-journal-pill-percent {
  color: var(--ui-text-secondary);
  font-variant-numeric: tabular-nums;
}

.activity-journal-pill-chevron {
  color: var(--ui-text-muted);
}

.activity-journal-spinner {
  animation: activity-journal-spin 1s linear infinite;
}

@keyframes activity-journal-spin {
  to { transform: rotate(360deg); }
}

.activity-journal-drawer {
  display: flex;
  flex-direction: column;
  width: min(380px, calc(100vw - 32px));
  max-height: min(440px, 62vh);
  overflow: hidden;
  border: 1px solid var(--ui-glass-border);
  border-radius: 18px;
  background: var(--ui-glass-tint), var(--ui-glass-bg);
  box-shadow: var(--ui-glass-surface-shadow);
  backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2);
  -webkit-backdrop-filter: blur(var(--ui-glass-blur)) saturate(1.2);
}

.activity-journal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--ui-glass-border);
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.activity-journal.is-dragging .activity-journal-head,
.activity-journal.is-dragging .activity-journal-pill {
  cursor: grabbing;
}

.activity-journal-head-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
}

.activity-journal-head-title[data-activity-state='running'] > svg,
.activity-journal-head-title[data-activity-state='done'] > svg {
  color: var(--ui-accent-strong);
}

.activity-journal-head-title[data-activity-state='error'] > svg {
  color: var(--ui-danger);
}

.activity-journal-head-percent {
  color: var(--ui-text-secondary);
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.activity-journal-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.activity-journal-clear {
  padding: 4px 10px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 999px;
  background: var(--ui-glass-btn-bg);
  box-shadow: var(--ui-glass-inset-highlight);
  color: var(--ui-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.activity-journal-clear:hover {
  background: var(--ui-glass-btn-hover);
}

.activity-journal-collapse {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--ui-glass-border);
  border-radius: 50%;
  background: var(--ui-glass-btn-bg);
  color: var(--ui-text-secondary);
  cursor: pointer;
}

.activity-journal-collapse:hover {
  background: var(--ui-glass-btn-hover);
  color: var(--ui-text);
}

.activity-journal-aggregate {
  height: 3px;
  width: 100%;
  overflow: hidden;
  background: var(--ui-surface-subtle);
}

.activity-journal-aggregate-fill {
  height: 100%;
  background: var(--ui-brand);
  transition: width 0.25s ease;
}

.activity-journal-aggregate-fill.is-indeterminate {
  width: 40%;
  animation: activity-journal-indeterminate 1.3s ease-in-out infinite;
}

.activity-journal-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 10px;
  overflow-y: auto;
  list-style: none;
}

.activity-journal-item {
  display: grid;
  gap: 6px;
  padding: 9px 10px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 12px;
  background: var(--ui-glass-btn-bg);
}

.activity-journal-item.is-error {
  border-color: color-mix(in srgb, var(--ui-danger) 45%, var(--ui-glass-border));
}

.activity-journal-item-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.activity-journal-kind-icon {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--ui-surface-subtle);
  color: var(--ui-text-secondary);
}

.activity-journal-item-main {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
}

.activity-journal-item-top,
.activity-journal-item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.activity-journal-item-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}

.activity-journal-badge {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: var(--ui-surface-subtle);
  color: var(--ui-text-secondary);
}

.activity-journal-badge.is-running {
  background: var(--ui-brand-soft);
  color: var(--ui-accent-strong);
}

.activity-journal-badge.is-done {
  background: var(--ui-success-soft);
  color: var(--ui-success-foreground);
}

.activity-journal-badge.is-error {
  background: var(--ui-danger-soft);
  color: var(--ui-danger-foreground);
}

.activity-journal-badge.is-cancelled {
  color: var(--ui-text-muted);
}

.activity-journal-item-detail {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ui-text-muted);
  font-size: 11.5px;
}

.activity-journal-item-percent {
  flex-shrink: 0;
  color: var(--ui-text-secondary);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}

.activity-journal-cancel {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ui-text-secondary);
  cursor: pointer;
}

.activity-journal-cancel:hover {
  background: var(--ui-glass-btn-hover);
  color: var(--ui-text);
}

.activity-journal-track {
  position: relative;
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--ui-surface-subtle);
}

.activity-journal-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--ui-brand);
  transition: width 0.2s ease;
}

.activity-journal-fill.is-indeterminate {
  width: 40%;
  animation: activity-journal-indeterminate 1.3s ease-in-out infinite;
}

@keyframes activity-journal-indeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}

.activity-journal-pop-enter-active,
.activity-journal-pop-leave-active {
  transition: opacity 0.18s ease, transform 0.2s cubic-bezier(0.2, 0, 0, 1);
}

.activity-journal-pop-enter-from,
.activity-journal-pop-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}

@media (max-width: 768px) {
  .activity-journal.is-android-app {
    right: 74px;
    bottom: calc(76px + env(safe-area-inset-bottom, 0px));
  }

  .activity-journal.is-android-app.is-expanded {
    left: 12px;
  }

  .activity-journal:not(.is-android-app).is-expanded {
    left: 62px;
    right: 16px;
  }

  .activity-journal-drawer {
    width: auto;
    max-height: 56vh;
  }
}

@media (prefers-reduced-motion: reduce) {
  .activity-journal-pop-enter-active,
  .activity-journal-pop-leave-active,
  .activity-journal-ring-fill,
  .activity-journal-aggregate-fill,
  .activity-journal-fill {
    transition: none;
  }

  .activity-journal-spinner,
  .activity-journal-ring.is-indeterminate .activity-journal-ring-svg,
  .activity-journal-aggregate-fill.is-indeterminate,
  .activity-journal-fill.is-indeterminate {
    animation: none;
  }
}
</style>

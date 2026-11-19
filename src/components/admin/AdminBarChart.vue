<template>
  <!-- One measure by day: thin bars on a baseline in one colour, the peak and
       the last day labelled, the day under the pointer read out above. -->
  <figure class="admin-chart" :data-admin-chart="title" @mouseleave="hover = null">
    <figcaption class="admin-chart-head">
      <span class="admin-chart-title">{{ title }}</span>
      <span class="admin-chart-readout" data-admin-chart-readout>{{ readout }}</span>
    </figcaption>
    <div class="admin-chart-plot" role="img" :aria-label="`${title}: ${total}`">
      <span
        v-for="(point, index) in points"
        :key="point.day"
        class="admin-chart-slot"
        :class="{ 'is-hover': hover === index }"
        @mouseenter="hover = index"
        @click="hover = index"
      >
        <span class="admin-chart-bar" :style="{ height: barHeight(point.value) }"></span>
      </span>
    </div>
    <div class="admin-chart-axis" aria-hidden="true">
      <span>{{ shortDay(points[0]?.day) }}</span>
      <span>{{ shortDay(points[points.length - 1]?.day) }}</span>
    </div>
  </figure>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '../../composables/useI18n';

const props = defineProps<{
  title: string;
  points: Array<{ day: string; value: number }>;
  /** How a value reads; plain numbers by default. */
  format?: (value: number) => string;
  /** The headline when nothing is hovered: the total, or the latest for a level. */
  headline?: 'total' | 'last';
}>();

const { locale } = useI18n();
const hover = ref<number | null>(null);
const show = (value: number) => (props.format ? props.format(value) : value.toLocaleString(locale.value === 'ru' ? 'ru-RU' : 'en-US'));
const max = computed(() => Math.max(1, ...props.points.map((point) => point.value)));
const total = computed(() => {
  if (props.headline === 'last') return show(props.points[props.points.length - 1]?.value ?? 0);
  return show(props.points.reduce((sum, point) => sum + point.value, 0));
});
const shortDay = (day?: string) => (day ? new Date(`${day}T00:00:00`).toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' }) : '');
const readout = computed(() => {
  const point = hover.value === null ? null : props.points[hover.value];
  return point ? `${shortDay(point.day)}: ${show(point.value)}` : total.value;
});
/** Anything above zero stays visible; zero is the bare baseline. */
const barHeight = (value: number) => (value > 0 ? `max(3px, ${(value / max.value) * 100}%)` : '0');
</script>

<style scoped>
.admin-chart { display: grid; gap: 6px; min-width: 0; margin: 0; }
.admin-chart-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.admin-chart-title { color: var(--ui-text-secondary); font-size: 13px; }
.admin-chart-readout { font-size: 15px; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap; }
.admin-chart-plot { display: flex; align-items: flex-end; gap: 2px; height: 96px; border-bottom: 1px solid var(--ui-border); }
.admin-chart-slot { display: flex; flex: 1 1 0; align-items: flex-end; justify-content: center; min-width: 0; height: 100%; cursor: default; }
.admin-chart-bar { display: block; width: 100%; max-width: 14px; border-radius: 4px 4px 0 0; background: var(--color-brands); opacity: 0.85; transition: opacity 0.12s ease; }
.admin-chart-slot.is-hover .admin-chart-bar { opacity: 1; }
.admin-chart-plot:hover .admin-chart-slot:not(.is-hover) .admin-chart-bar { opacity: 0.45; }
.admin-chart-axis { display: flex; justify-content: space-between; color: var(--ui-text-muted); font-size: 11px; }
</style>

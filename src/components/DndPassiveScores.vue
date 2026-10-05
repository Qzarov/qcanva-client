<template>
  <section ref="root" class="dnd-cs-passives dnd-glass" aria-label="Пассивные характеристики">
    <div class="dnd-cs-passive-row">
      <button v-for="item in items" :key="item.key" type="button" class="dnd-cs-passive" :aria-label="item.ariaLabel" :aria-expanded="open === item.key" :aria-describedby="open === item.key ? tooltipId : undefined" @click="toggle(item.key, $event)">
        <strong>{{ item.value }}</strong><span>{{ item.label }}</span>
      </button>
    </div>
    <Teleport to="body">
      <p v-if="selected" :id="tooltipId" ref="hint" role="tooltip" class="mobile-modebar-tap-hint dnd-cs-passive-help" :style="hintStyle">Пассивная характеристика: {{ selected.help }}</p>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { useSheetPopup } from '../composables/useSheetPopup';
const props = defineProps<{ items: { key: string; label: string; value: number; ariaLabel: string; help: string }[] }>();
const { root, open, toggle, close } = useSheetPopup();
const tooltipId = useId();
const selected = computed(() => props.items.find(item => item.key === open.value));
const hint = ref<HTMLElement | null>(null);
const position = ref<{ left: number; top: number } | null>(null);
const hintStyle = computed(() => position.value
  ? { left: `${position.value.left}px`, top: `${position.value.top}px` }
  : { visibility: 'hidden' as const });
const HINT_DURATION_MS = 3000;
let timer: ReturnType<typeof setTimeout> | null = null;
const clearTimer = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
const positionHint = () => {
  const button = root.value?.querySelector<HTMLElement>('[aria-expanded="true"]');
  if (!button || !hint.value) return;
  const anchor = button.getBoundingClientRect();
  const bounds = hint.value.getBoundingClientRect();
  const margin = 12;
  position.value = {
    left: Math.max(margin + bounds.width / 2, Math.min(window.innerWidth - margin - bounds.width / 2, anchor.left + anchor.width / 2)),
    top: Math.max(margin, anchor.top - bounds.height - 8),
  };
};
watch(open, async key => {
  clearTimer(); position.value = null;
  if (!key) return;
  timer = setTimeout(() => { timer = null; close(); }, HINT_DURATION_MS);
  await nextTick();
  if (open.value === key) positionHint();
});
onMounted(() => {
  window.addEventListener('resize', positionHint);
  // Capture also sees scrolling in the character page's own scroll container.
  document.addEventListener('scroll', positionHint, true);
});
onBeforeUnmount(() => {
  clearTimer();
  window.removeEventListener('resize', positionHint);
  document.removeEventListener('scroll', positionHint, true);
});
</script>

<style scoped>
.dnd-cs-passives { position:relative; padding:12px; }
.dnd-cs-passive-row { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); }
.dnd-cs-passive { display:flex; flex-direction:row; justify-content:center; align-items:center; text-align:center; gap:8px; min-width:0; padding:0 4px; border:0; background:none; font:inherit; cursor:pointer; }
.dnd-cs-passive + .dnd-cs-passive { border-left:1px solid var(--dnd-glass-border); }
.dnd-cs-passive strong { font-size:17px; line-height:1.2; font-weight:800; color:var(--dnd-glass-accent); font-variant-numeric:tabular-nums; }
.dnd-cs-passive span { font-size:11px; line-height:1.2; color:var(--dnd-text-dim); overflow-wrap:anywhere; }
.dnd-cs-passive-help { position:fixed; bottom:auto; z-index:1000; width:max-content; max-width:min(320px,calc(100vw - 24px)); box-sizing:border-box; margin:0; white-space:normal; text-align:center; border-radius:14px; }
@media (max-width:760px) {
  .dnd-cs-passives { padding:6px 12px; }
  .dnd-cs-passive { flex-direction:column; gap:2px; }
  .dnd-cs-passive span { font-size:clamp(9px,2.5vw,11px); }
}
</style>

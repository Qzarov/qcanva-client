<template>
  <section ref="root" class="dnd-cs-passives dnd-glass" aria-label="Пассивные характеристики">
    <div class="dnd-cs-passive-row">
      <button v-for="item in items" :key="item.key" type="button" class="dnd-cs-passive" :aria-label="item.ariaLabel" :aria-expanded="open === item.key" :aria-describedby="open === item.key ? tooltipId : undefined" @click="toggle(item.key, $event)">
        <span>{{ item.label }}</span><strong>{{ item.value }}</strong>
      </button>
    </div>
    <p v-if="selected" :id="tooltipId" role="tooltip" class="dnd-cs-passive-help">Пассивная характеристика: {{ selected.help }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import { useSheetPopup } from '../composables/useSheetPopup';
const props = defineProps<{ items: { key: string; label: string; value: number; ariaLabel: string; help: string }[] }>();
const { root, open, toggle } = useSheetPopup();
const tooltipId = useId();
const selected = computed(() => props.items.find(item => item.key === open.value));
</script>

<style scoped>
.dnd-cs-passives { position:relative; padding:12px; }
.dnd-cs-passive-row { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); }
.dnd-cs-passive { display:flex; flex-direction:row; justify-content:center; align-items:center; text-align:center; gap:8px; min-width:0; padding:0 4px; border:0; background:none; font:inherit; cursor:pointer; }
.dnd-cs-passive + .dnd-cs-passive { border-left:1px solid var(--dnd-glass-border); }
.dnd-cs-passive strong { font-size:17px; font-weight:800; color:var(--dnd-glass-accent); font-variant-numeric:tabular-nums; }
.dnd-cs-passive span { font-size:11px; color:var(--dnd-text-dim); overflow-wrap:anywhere; }
.dnd-cs-passive-help { position:absolute; top:calc(100% + 6px); left:0; right:0; z-index:40; margin:0; padding:12px; border:1px solid var(--dnd-glass-border); border-radius:12px; background:var(--ui-surface-solid); box-shadow:var(--ui-glass-shadow); color:var(--ui-text); font-size:13px; }
@media (max-width:760px) {
  .dnd-cs-passive { flex-direction:column-reverse; gap:4px; }
  .dnd-cs-passive span { font-size:clamp(9px,2.5vw,11px); }
}
</style>

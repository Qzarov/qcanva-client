<template>
  <section ref="root" class="dnd-cs-states dnd-glass" aria-label="Состояния">
    <div class="dnd-cs-state-list">
      <button type="button" class="dnd-cs-toggle" :class="{ on: combat.inspiration }" :disabled="readonly" :aria-pressed="combat.inspiration" @click="toggleInspiration">✦ Вдохновение</button>
      <button v-for="condition in combat.conditions" :key="condition" type="button" class="dnd-cs-condition" :disabled="readonly" :aria-label="'Удалить состояние: ' + conditionLabel(condition)" @click="remove(condition)">
        {{ conditionLabel(condition) }} <span aria-hidden="true">×</span>
      </button>
      <button type="button" class="dnd-cs-add-condition" aria-label="Добавить состояние" :aria-expanded="Boolean(open)" :disabled="readonly || !available.length" @click="toggleMenu">+ состояние</button>
    </div>
    <Teleport to="body">
      <div v-if="open && !readonly" ref="popup" class="dnd-cs-condition-menu" :style="menuStyle" role="group" aria-label="Доступные состояния">
        <button v-for="condition in available" :key="condition.key" type="button" :aria-label="'Добавить: ' + condition.label" @click="add(condition.key)">{{ condition.label }}</button>
      </div>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useSheetPopup } from '../composables/useSheetPopup';
import { conditionLabel, DND_CONDITIONS } from '../dnd/conditions';
import type { DndCharacterSheetData } from '../dnd/characterSheet';
const props = defineProps<{ combat: DndCharacterSheetData['combat']; readonly: boolean }>();
const emit = defineEmits<{ change: [] }>();
const { root, popup, open, toggle, close } = useSheetPopup();
const toggleMenu = async (event: MouseEvent) => {
  toggle('conditions', event);
  if (!open.value || event.detail !== 0) return;
  await nextTick();
  positionMenu();
  // The initial measurement uses a hidden menu; wait for visible styles to render.
  await nextTick();
  // Teleported options no longer follow the trigger in the document's Tab order.
  if (open.value) popup.value?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
};
const position = ref<{ left: number; top: number } | null>(null);
const menuStyle = computed(() => position.value
  ? { left: `${position.value.left}px`, top: `${position.value.top}px` }
  : { visibility: 'hidden' as const });
const positionMenu = () => {
  const button = root.value?.querySelector<HTMLElement>('.dnd-cs-add-condition');
  if (!open.value || !button || !popup.value) return;
  const anchor = button.getBoundingClientRect();
  const menu = popup.value.getBoundingClientRect();
  const margin = 12;
  const below = anchor.bottom + 6;
  const preferredTop = below + menu.height <= window.innerHeight - margin
    ? below : anchor.top - menu.height - 6;
  position.value = {
    left: Math.max(margin, Math.min(anchor.left, window.innerWidth - menu.width - margin)),
    top: Math.max(margin, Math.min(preferredTop, window.innerHeight - menu.height - margin)),
  };
};
watch(open, async key => {
  position.value = null;
  if (!key) return;
  await nextTick();
  if (open.value === key) positionMenu();
});
onMounted(() => {
  window.addEventListener('resize', positionMenu);
  document.addEventListener('scroll', positionMenu, true);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', positionMenu);
  document.removeEventListener('scroll', positionMenu, true);
});
const available = computed(() => DND_CONDITIONS.filter(condition => !props.combat.conditions.includes(condition.key)));
const add = (key: string) => {
  if (props.readonly || !available.value.some(condition => condition.key === key)) return;
  props.combat.conditions.push(key);
  close(true); emit('change');
};
const remove = (key: string) => {
  if (props.readonly || !props.combat.conditions.includes(key)) return;
  props.combat.conditions = props.combat.conditions.filter(condition => condition !== key);
  emit('change');
};
const toggleInspiration = () => { if (!props.readonly) { props.combat.inspiration = !props.combat.inspiration; emit('change'); } };
watch(() => props.readonly, value => { if (value) close(); });
</script>

<style scoped>
.dnd-cs-states { position:relative; padding:12px; display:flex; align-items:center; min-width:0; }
.dnd-cs-state-list { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
.dnd-cs-state-list button { display:inline-flex; align-items:center; gap:6px; padding:7px 11px; border:1px solid var(--dnd-glass-border); border-radius:999px; background:rgba(255,255,255,.04); color:var(--dnd-text-dim); font:inherit; font-size:12px; cursor:pointer; max-width:100%; overflow-wrap:anywhere; }
.dnd-cs-state-list button:disabled { opacity:.5; cursor:default; }
.dnd-cs-state-list .on, .dnd-cs-state-list .dnd-cs-condition { color:var(--dnd-glass-accent); background:var(--dnd-glass-accent-soft); }
.dnd-cs-condition-menu { position:fixed; z-index:1000; display:grid; gap:2px; width:min(240px,calc(100vw - 24px)); max-height:min(280px,calc(100dvh - 24px)); box-sizing:border-box; overflow-y:auto; padding:6px; border:1px solid var(--ui-border); border-radius:12px; background:var(--ui-surface-solid); box-shadow:var(--ui-glass-shadow); }
.dnd-cs-condition-menu button { padding:10px 12px; border:0; border-radius:8px; text-align:left; font:inherit; font-size:13px; color:var(--ui-text); background:transparent; cursor:pointer; }
.dnd-cs-condition-menu button:hover, .dnd-cs-condition-menu button:focus-visible { background:var(--ui-brand-soft); }
</style>

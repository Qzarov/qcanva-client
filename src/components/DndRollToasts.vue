<template>
  <!-- Bottom-left, glass, auto-dismissed. Teleported to body so the page's
       scroll container never clips them. -->
  <Teleport to="body">
    <div class="dnd-cs-toasts" aria-live="polite">
      <transition-group name="dnd-cs-toast">
        <div v-for="roll in visible" :key="roll.id" class="dnd-cs-toast" :class="toastClass(roll)">
          <button type="button" class="dnd-cs-toast-close" aria-label="Закрыть" @click="emit('dismiss', roll.id)">×</button>
          <div class="dnd-cs-toast-head">{{ head(roll) }}</div>
          <div class="dnd-cs-toast-formula">{{ describeRoll(roll) }} = <strong>{{ roll.total }}</strong></div>
          <div v-if="awaitsDamage(roll)" class="dnd-cs-toast-actions">
            <button v-for="(option, index) in roll.damage" :key="index" type="button" @click="emit('damage', roll.id, index)">
              {{ roll.natural === 'max' ? 'Крит' : 'Урон' }}{{ roll.damage!.length > 1 ? ' · ' + option.label.toLowerCase() : '' }}: {{ option.formula.text }}
            </button>
          </div>
        </div>
      </transition-group>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { awaitsDamage, describeRoll, ROLL_KIND_LABEL, ROLL_MODE_LABEL, type SheetRoll } from '../dnd/useSheetRolls';

const props = defineProps<{ history: SheetRoll[]; toasts: string[] }>();
const emit = defineEmits<{ dismiss: [id: string]; damage: [rollId: string, option: number] }>();

// Attacks still waiting for damage come first: the list stacks bottom-up, and
// on phones only the first two are shown, so they must not be pushed out of
// view by later checks.
const visible = computed(() => {
  const rolls = props.toasts.map((id) => props.history.find((roll) => roll.id === id)).filter((roll): roll is SheetRoll => Boolean(roll));
  return [...rolls.filter(awaitsDamage), ...rolls.filter((roll) => !awaitsDamage(roll))];
});
const toastClass = (roll: SheetRoll) => (roll.natural === 'max' ? 'crit-max' : roll.natural === 'min' ? 'crit-min' : '');
const head = (roll: SheetRoll) => {
  const mode = roll.d20 && roll.d20.mode !== 'normal' ? ` · ${ROLL_MODE_LABEL[roll.d20.mode].toLowerCase()}` : '';
  const type = roll.damageType ? ` · ${roll.damageType}` : '';
  return `${ROLL_KIND_LABEL[roll.kind]} · ${roll.label}${mode}${type}`;
};
</script>

<style scoped>
/* ===== Roll toasts (Teleported to body: literal colours, not .dnd-cs tokens) ===== */
.dnd-cs-toasts {
  position: fixed; left: 16px; bottom: 16px; z-index: 3000;
  display: flex; flex-direction: column-reverse; gap: 8px;
  max-width: min(330px, calc(100vw - 32px)); pointer-events: none;
}
.dnd-cs-toast {
  position: relative; pointer-events: auto;
  padding: 10px 30px 10px 13px; border-radius: 14px;
  background: linear-gradient(160deg, rgba(22, 30, 24, 0.93), rgba(9, 13, 10, 0.93));
  border: 1px solid rgba(0, 255, 0, 0.30);
  box-shadow: 0 0 20px rgba(0, 255, 0, 0.14), 0 12px 32px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.09);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  color: #eaf6ee;
}
.dnd-cs-toast-head { font-size: 11px; letter-spacing: .05em; text-transform: uppercase; color: #8fe0a4; margin-bottom: 3px; }
.dnd-cs-toast-formula { font-size: 15px; font-variant-numeric: tabular-nums; }
.dnd-cs-toast-formula b { color: #d3ecda; font-weight: 700; }
.dnd-cs-toast-formula strong { color: #00ff00; font-size: 18px; font-weight: 800; }
.dnd-cs-toast.crit-max { border-color: rgba(0, 255, 0, 0.65); box-shadow: 0 0 30px rgba(0, 255, 0, 0.4), 0 12px 32px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.09); }
.dnd-cs-toast.crit-max .dnd-cs-toast-formula strong { text-shadow: 0 0 12px rgba(0, 255, 0, 0.7); }
.dnd-cs-toast.crit-min { border-color: rgba(255, 90, 90, 0.55); box-shadow: 0 0 22px rgba(255, 70, 70, 0.28), 0 12px 32px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.09); }
.dnd-cs-toast.crit-min .dnd-cs-toast-formula strong { color: #ff6b6b; }
.dnd-cs-toast-close { position: absolute; top: 5px; right: 8px; padding: 0; width: 18px; height: 18px; border: 0; background: transparent; color: #8fe0a4; cursor: pointer; font-size: 15px; line-height: 1; }
.dnd-cs-toast-close:hover { color: #eaf6ee; }
.dnd-cs-toast-enter-active, .dnd-cs-toast-leave-active { transition: opacity 220ms ease, transform 220ms ease; }
.dnd-cs-toast-enter-from, .dnd-cs-toast-leave-to { opacity: 0; transform: translateX(-18px); }
.dnd-cs-toast-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
.dnd-cs-toast-actions button { padding:6px 10px; border:1px solid rgba(130,210,155,.4); border-radius:8px; background:rgba(0,255,0,.12); color:#eaf6ee; font:inherit; font-size:12px; cursor:pointer; }
.dnd-cs-toast-actions button:hover { background:rgba(0,255,0,.2); }
/* Phones: two toasts at most, so rolls do not bury the sheet; the log keeps them all. */
@media (max-width: 760px) {
  .dnd-cs-toasts { left: 12px; bottom: 12px; max-width: calc(100vw - 24px); }
  .dnd-cs-toast:nth-child(n+3) { display: none; }
  .dnd-cs-toast { padding: 8px 28px 8px 11px; }
  .dnd-cs-toast-actions button { padding: 5px 8px; }
}
</style>

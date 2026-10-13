<template>
  <section class="dnd-weapon-attacks" aria-label="Экипированное оружие">
    <h4 ref="root">
      <button type="button" class="dnd-weapon-attacks-help" :aria-expanded="Boolean(open)" :aria-describedby="open ? tooltipId : undefined" @click="toggle('help', $event)">
        Экипированное оружие <Info class="dnd-weapon-attacks-help-icon" :size="15" :stroke-width="2" aria-hidden="true" />
      </button>
    </h4>
    <p v-if="!attacks.length" class="dnd-weapon-attacks-empty">Нет экипированного оружия</p>
    <Teleport to="body">
      <p v-if="open" :id="tooltipId" ref="popup" role="tooltip" class="ui-explain-hint" :style="hintStyle">
        Отметьте оружие во вкладке «{{ equipmentLabel }}» как экипированное — оно появится здесь с готовыми бросками атаки и урона.
      </p>
    </Teleport>
    <div v-for="attack in attacks" :key="attack.itemId" class="dnd-weapon-attack">
      <div class="dnd-weapon-attack-name">
        <strong>{{ attack.name }}</strong>
        <span>{{ attack.abilityLabel }}{{ attack.proficient ? ' · владение' : ' · без владения' }}<template v-if="attack.weapon.damageType"> · {{ attack.weapon.damageType }}</template></span>
      </div>
      <div class="dnd-weapon-attack-rolls">
        <button type="button" class="dnd-weapon-attack-roll" :aria-label="'Атака: ' + attack.name" @click="emit('attack', attack)">Атака <b>{{ formatSigned(attack.attackBonus) }}</b></button>
        <DndFormulaButton
          v-for="(entry, index) in attack.damage"
          :key="index"
          :formula="entry.formula"
          :source="index === 0 ? attack.weapon.damage : attack.weapon.versatile"
          :prefix="attack.damage.length > 1 ? entry.label : 'Урон'"
          @roll="emit('damage', attack, index)"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useId } from 'vue';
import { Info } from '@lucide/vue';
import { formatSigned } from '../dnd/dice';
import { useSheetPopup } from '../composables/useSheetPopup';
import { useAnchoredHint } from '../composables/useAnchoredHint';
import type { WeaponAttack } from '../dnd/weapons';
import DndFormulaButton from './DndFormulaButton.vue';

withDefaults(defineProps<{ attacks: WeaponAttack[]; /** The equipment tab's name as the user sees it now. */ equipmentLabel?: string }>(), { equipmentLabel: 'Снаряжение' });
const emit = defineEmits<{ attack: [attack: WeaponAttack]; damage: [attack: WeaponAttack, index: number] }>();

// How a weapon gets here: a hint behind the heading, not a paragraph on every visit.
const { root, popup, open, toggle, close } = useSheetPopup();
const tooltipId = useId();
const { hintStyle } = useAnchoredHint({ anchor: () => root.value?.querySelector('button'), popup, open, close });
</script>

<style scoped>
.dnd-weapon-attacks { display:flex; flex-direction:column; gap:8px; margin-bottom:12px; }
.dnd-weapon-attacks h4 { margin:0; }
.dnd-weapon-attacks-help { display:inline-flex; align-items:center; gap:6px; min-height:28px; padding:0; border:0; background:none; font:inherit; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--dnd-text-dim); cursor:pointer; }
.dnd-weapon-attacks-help:hover, .dnd-weapon-attacks-help[aria-expanded="true"] { color:var(--ui-text); }
.dnd-weapon-attacks-help:focus-visible { outline:2px solid var(--ui-focus); outline-offset:2px; border-radius:6px; }

.dnd-weapon-attacks-empty { margin:0; font-size:13px; color:var(--dnd-text-dim); }
.dnd-weapon-attack { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border:1px solid var(--dnd-glass-border); border-radius:12px; background:rgba(var(--dnd-fill-rgb, 255, 255, 255), .05); }
.dnd-weapon-attack-name { display:flex; flex-direction:column; min-width:0; }
.dnd-weapon-attack-name strong { overflow-wrap:anywhere; }
.dnd-weapon-attack-name span { font-size:12px; color:var(--dnd-text-dim); }
.dnd-weapon-attack-rolls { display:flex; flex-wrap:wrap; gap:6px; }
.dnd-weapon-attack-roll { min-height:30px; padding:4px 10px; border:1px solid var(--dnd-glass-accent); border-radius:8px; background:var(--dnd-glass-accent-soft); color:var(--ui-text); font:inherit; font-size:12px; cursor:pointer; }
.dnd-weapon-attack-roll b { font-variant-numeric:tabular-nums; }
/* Rolled every turn: a full touch target on phones. */
@media (max-width:760px) {
  .dnd-weapon-attack-roll { min-height:44px; padding-inline:12px; }
  .dnd-weapon-attacks-help { min-height:44px; }
}
</style>

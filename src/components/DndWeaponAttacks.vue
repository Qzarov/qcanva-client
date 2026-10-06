<template>
  <section class="dnd-weapon-attacks" aria-label="Экипированное оружие">
    <h4>Экипированное оружие</h4>
    <p v-if="!attacks.length" class="dnd-weapon-attacks-empty">Отметьте оружие во вкладке «Снаряжение» как экипированное — оно появится здесь с готовыми бросками.</p>
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
import { formatSigned } from '../dnd/dice';
import type { WeaponAttack } from '../dnd/weapons';
import DndFormulaButton from './DndFormulaButton.vue';

defineProps<{ attacks: WeaponAttack[] }>();
const emit = defineEmits<{ attack: [attack: WeaponAttack]; damage: [attack: WeaponAttack, index: number] }>();
</script>

<style scoped>
.dnd-weapon-attacks { display:flex; flex-direction:column; gap:8px; margin-bottom:12px; }
.dnd-weapon-attacks h4 { margin:0; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--dnd-text-dim); }
.dnd-weapon-attacks-empty { margin:0; font-size:13px; color:var(--dnd-text-dim); }
.dnd-weapon-attack { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; padding:8px 10px; border:1px solid var(--dnd-glass-border); border-radius:12px; background:rgba(var(--dnd-fill-rgb, 255, 255, 255), .05); }
.dnd-weapon-attack-name { display:flex; flex-direction:column; min-width:0; }
.dnd-weapon-attack-name strong { overflow-wrap:anywhere; }
.dnd-weapon-attack-name span { font-size:12px; color:var(--dnd-text-dim); }
.dnd-weapon-attack-rolls { display:flex; flex-wrap:wrap; gap:6px; }
.dnd-weapon-attack-roll { min-height:30px; padding:4px 10px; border:1px solid var(--dnd-glass-accent); border-radius:8px; background:var(--dnd-glass-accent-soft); color:var(--ui-text); font:inherit; font-size:12px; cursor:pointer; }
.dnd-weapon-attack-roll b { font-variant-numeric:tabular-nums; }
</style>

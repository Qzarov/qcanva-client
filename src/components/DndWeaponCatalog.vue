<template>
  <Teleport to="body">
    <div class="dnd-catalog-backdrop" @click.self="emit('close')">
      <section class="dnd-catalog" role="dialog" aria-modal="true" aria-label="Оружие из списка" @keydown.esc.prevent.stop="emit('close')">
        <header>
          <h2>Оружие из списка</h2>
          <button ref="closeButton" type="button" class="dnd-catalog-close" aria-label="Закрыть список оружия" @click="emit('close')">×</button>
        </header>
        <input ref="search" v-model="query" type="search" class="dnd-catalog-search" placeholder="Поиск: меч, лук, рубящий…" aria-label="Поиск оружия" autocomplete="off" />
        <p v-if="!groups.length" class="dnd-catalog-empty">Ничего не нашлось. Оружие можно добавить и вручную: обычный предмет + кнопка ⚔.</p>
        <section v-for="group in groups" :key="group.title" class="dnd-catalog-group">
          <h3>{{ group.title }}</h3>
          <button v-for="weapon in group.weapons" :key="weapon.key" type="button" class="dnd-catalog-item" :aria-label="'Добавить: ' + weapon.name" @click="emit('pick', weapon)">
            <span class="dnd-catalog-name">{{ weapon.name }}</span>
            <span class="dnd-catalog-damage">{{ weapon.damage }} {{ weapon.damageType }}</span>
            <span v-if="weapon.properties" class="dnd-catalog-props">{{ weapon.properties }}</span>
          </button>
        </section>
        <p class="dnd-catalog-note">Оружие «Книги игрока» D&amp;D 5e. Добавленное можно поправить в снаряжении.</p>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { searchWeaponCatalog, type CatalogWeapon } from '../dnd/weaponCatalog';
import { useBackHandler } from '../composables/useBackHandler';
import { isCoarsePointer } from '../composables/pointer';

const emit = defineEmits<{ close: []; pick: [weapon: CatalogWeapon] }>();
const query = ref('');
const groups = computed(() => searchWeaponCatalog(query.value));
const search = ref<HTMLInputElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const previousFocus = document.activeElement as HTMLElement | null;
// On a touch screen focusing the search would raise the keyboard over the list.
onMounted(() => (isCoarsePointer() ? closeButton.value : search.value)?.focus());
onBeforeUnmount(() => previousFocus?.isConnected && previousFocus.focus());
useBackHandler(() => { emit('close'); return true; });
</script>

<style scoped>
.dnd-catalog-backdrop { position:fixed; inset:0; z-index:10000; display:grid; place-items:center; padding:16px; background:rgba(0,0,0,.45); }
.dnd-catalog { width:min(480px,100%); max-height:85dvh; overflow-y:auto; padding:18px; border-radius:16px; border:1px solid var(--ui-border); background:var(--ui-surface-solid); color:var(--ui-text); box-shadow:var(--ui-glass-shadow); box-sizing:border-box; }
.dnd-catalog header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.dnd-catalog h2 { margin:0; font-size:18px; }
.dnd-catalog-close { width:36px; height:36px; border:0; border-radius:999px; background:var(--ui-surface-subtle); color:var(--ui-text); font-size:18px; cursor:pointer; }
.dnd-catalog-search { width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid var(--ui-border); border-radius:10px; background:var(--ui-surface-subtle); color:var(--ui-text); font:inherit; }
.dnd-catalog-group h3 { margin:14px 0 6px; font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--ui-text-secondary); }
.dnd-catalog-item { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:2px 10px; width:100%; min-height:44px; padding:8px 10px; border:0; border-radius:10px; background:transparent; color:var(--ui-text); font:inherit; text-align:left; cursor:pointer; }
.dnd-catalog-item:hover, .dnd-catalog-item:focus-visible { background:var(--ui-surface-subtle); }
.dnd-catalog-name { font-weight:600; overflow-wrap:anywhere; }
.dnd-catalog-damage { font-size:13px; color:var(--ui-text-secondary); white-space:nowrap; font-variant-numeric:tabular-nums; }
.dnd-catalog-props { grid-column:1 / -1; font-size:12px; color:var(--ui-text-secondary); }
.dnd-catalog-empty, .dnd-catalog-note { font-size:13px; color:var(--ui-text-secondary); }
.dnd-catalog-note { margin:14px 0 0; }
</style>

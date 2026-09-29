<template>
  <div class="dnd-cs" :class="{ 'dnd-cs-readonly': readonly }">
    <!-- ===== HEADER ===== -->
    <header class="dnd-cs-header">
      <div class="dnd-cs-portrait" :class="{ empty: !data.identity.portraitUrl }">
        <img v-if="data.identity.portraitUrl" :src="data.identity.portraitUrl" alt="Портрет персонажа" />
        <span v-else>{{ initial }}</span>
        <div v-if="!readonly" class="dnd-cs-portrait-actions">
          <button type="button" title="Загрузить портрет" aria-label="Загрузить портрет" @click="$emit('request-portrait')">▣</button>
          <button v-if="data.identity.portraitUrl" type="button" title="Удалить портрет" aria-label="Удалить портрет" @click="$emit('remove-portrait')">×</button>
        </div>
      </div>

      <div class="dnd-cs-identity">
        <input class="dnd-cs-name" :readonly="readonly" :value="data.identity.name" placeholder="Имя персонажа" aria-label="Имя персонажа" @change="setIdentity('name', $ev($event))" />
        <div class="dnd-cs-subline">
          <input :readonly="readonly" :value="data.identity.race" placeholder="Раса" aria-label="Раса" @change="setIdentity('race', $ev($event))" />
          <span class="dnd-cs-dot">—</span>
          <input :readonly="readonly" :value="data.identity.className" placeholder="Класс" aria-label="Класс" @change="setIdentity('className', $ev($event))" />
        </div>
        <div class="dnd-cs-xp">
          <label class="dnd-cs-level">Уровень <input type="number" min="1" max="20" :readonly="readonly" :value="data.identity.level" aria-label="Уровень" @change="setNumber(data.identity, 'level', $ev($event), 1, 20)" /></label>
          <label class="dnd-cs-xp-field">XP <input type="number" min="0" :readonly="readonly" :value="data.identity.experience" aria-label="Опыт" @change="setNumber(data.identity, 'experience', $ev($event), 0)" /></label>
          <span class="dnd-cs-xp-next">/ {{ data.identity.nextLevelExperience || '—' }}
            <input type="number" min="0" :readonly="readonly" :value="data.identity.nextLevelExperience" aria-label="Опыт до следующего уровня" @change="setNumber(data.identity, 'nextLevelExperience', $ev($event), 0)" />
          </span>
          <div class="dnd-cs-xp-bar" role="progressbar" :aria-valuenow="xpPercent" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: xpPercent + '%' }"></span></div>
        </div>
      </div>
    </header>

    <!-- ===== COMBAT STRIP ===== -->
    <div class="dnd-cs-combat">
      <div class="dnd-cs-stat"><span>КД</span><input type="number" min="0" :readonly="readonly" :value="data.combat.armorClass" aria-label="Класс доспеха" @change="setNumber(data.combat, 'armorClass', $ev($event), 0)" /></div>
      <div class="dnd-cs-stat"><span>Скорость</span><input type="number" min="0" :readonly="readonly" :value="data.combat.speed" aria-label="Скорость" @change="setNumber(data.combat, 'speed', $ev($event), 0)" /></div>
      <div class="dnd-cs-stat readonly-stat"><span>Мастерство</span><strong>{{ formatModifier(proficiencyBonus) }}</strong></div>
      <div class="dnd-cs-stat readonly-stat"><span>Инициатива</span><strong>{{ formatModifier(initiative) }}</strong>
        <input v-if="!readonly" class="dnd-cs-init-bonus" type="number" :value="data.combat.customInitiativeBonus" aria-label="Бонус инициативы" title="Доп. бонус инициативы" @change="setNumber(data.combat, 'customInitiativeBonus', $ev($event))" /></div>
      <div class="dnd-cs-stat dnd-cs-hp">
        <span>HP</span>
        <button type="button" class="dnd-cs-hp-btn" :disabled="readonly" aria-label="Убрать HP" @click="changeHp(-1)">−</button>
        <input type="number" min="0" :readonly="readonly" :value="data.combat.currentHp" aria-label="Текущие HP" @change="setNumber(data.combat, 'currentHp', $ev($event), 0)" />
        <b>/</b>
        <input type="number" min="1" :readonly="readonly" :value="data.combat.maxHp" aria-label="Максимум HP" @change="setNumber(data.combat, 'maxHp', $ev($event), 1)" />
        <button type="button" class="dnd-cs-hp-btn" :disabled="readonly" aria-label="Добавить HP" @click="changeHp(1)">+</button>
      </div>
      <div class="dnd-cs-stat"><span>Врем. HP</span><input type="number" min="0" :readonly="readonly" :value="data.combat.temporaryHp" aria-label="Временные HP" @change="setNumber(data.combat, 'temporaryHp', $ev($event), 0)" /></div>
      <button type="button" class="dnd-cs-toggle" :class="{ on: data.combat.inspiration }" :disabled="readonly" :aria-pressed="data.combat.inspiration" @click="toggleInspiration">✦ Вдохновение</button>
      <div class="dnd-cs-stat dnd-cs-exhaustion"><span>Истощение</span>
        <button type="button" class="dnd-cs-hp-btn" :disabled="readonly" aria-label="Меньше истощения" @click="changeExhaustion(-1)">−</button>
        <strong>{{ data.combat.exhaustion }}</strong>
        <button type="button" class="dnd-cs-hp-btn" :disabled="readonly" aria-label="Больше истощения" @click="changeExhaustion(1)">+</button>
      </div>
    </div>

    <!-- ===== BODY: abilities+skills (left) | tabs (right) ===== -->
    <div class="dnd-cs-body">
      <div class="dnd-cs-left">
        <!-- Abilities + their skills -->
        <section class="dnd-cs-abilities">
          <article v-for="ability in abilities" :key="ability.key" class="dnd-cs-ability">
            <header class="dnd-cs-ability-head">
              <div class="dnd-cs-ability-score">
                <span class="dnd-cs-ability-name">{{ ability.short }}</span>
                <input type="number" min="1" max="30" :readonly="readonly" :value="data.abilities[ability.key].score" :aria-label="ability.label" @change="setAbilityScore(ability.key, $ev($event))" />
                <em class="dnd-cs-ability-mod">{{ formatModifier(abilityModifier(data.abilities[ability.key].score)) }}</em>
              </div>
              <button type="button" class="dnd-cs-save" :class="{ prof: data.abilities[ability.key].savingThrowProficient }" :disabled="readonly" :aria-pressed="data.abilities[ability.key].savingThrowProficient" :title="'Спасбросок ' + ability.label" @click="toggleSave(ability.key)">
                <span class="dnd-cs-pip" :class="{ on: data.abilities[ability.key].savingThrowProficient }"></span>
                Спас {{ formatModifier(savingThrow(ability.key)) }}
              </button>
            </header>
            <ul class="dnd-cs-skills">
              <li v-for="skill in skillsByAbility[ability.key]" :key="skill.key">
                <button type="button" class="dnd-cs-skill-pip" :class="skillProf(skill.key)" :disabled="readonly" :title="skillProfTitle(skill.key)" @click="cycleSkill(skill.key)">
                  <span class="dnd-cs-pip" :class="skillProf(skill.key)"></span>
                </button>
                <span class="dnd-cs-skill-name">{{ skill.label }}</span>
                <span class="dnd-cs-skill-mod">{{ formatModifier(skillMod(skill.key)) }}</span>
              </li>
            </ul>
          </article>
        </section>

        <!-- Passive scores -->
        <section class="dnd-cs-passives">
          <div v-for="p in passives" :key="p.key" class="dnd-cs-passive">
            <strong>{{ p.value }}</strong>
            <span>{{ p.label }}</span>
          </div>
        </section>

        <!-- Proficiencies -->
        <section class="dnd-cs-proficiencies">
          <h4>Владения</h4>
          <div class="dnd-cs-prof-group">
            <span class="dnd-cs-prof-label">Доспехи</span>
            <label v-for="opt in armorOptions" :key="opt"><input type="checkbox" :checked="data.proficiencies.armor.includes(opt)" :disabled="readonly" @change="toggleProf('armor', opt)" /> {{ opt }}</label>
          </div>
          <div class="dnd-cs-prof-group">
            <span class="dnd-cs-prof-label">Оружие</span>
            <label v-for="opt in weaponOptions" :key="opt"><input type="checkbox" :checked="data.proficiencies.weapons.includes(opt)" :disabled="readonly" @change="toggleProf('weapons', opt)" /> {{ opt }}</label>
          </div>
          <div class="dnd-cs-prof-list">
            <span class="dnd-cs-prof-label">Языки и прочее</span>
            <div v-for="(val, i) in data.proficiencies.languages" :key="'lang' + i" class="dnd-cs-prof-row">
              <input :readonly="readonly" :value="val" placeholder="Язык / владение" @change="setProfListItem('languages', i, $ev($event))" />
              <button v-if="!readonly" type="button" aria-label="Удалить" @click="removeProfListItem('languages', i)">×</button>
            </div>
            <button v-if="!readonly" type="button" class="dnd-cs-add-sm" @click="addProfListItem('languages')">+ Добавить</button>
          </div>
        </section>
      </div>

      <!-- ===== TABS ===== -->
      <div class="dnd-cs-right">
        <nav class="dnd-cs-tabs" role="tablist">
          <button v-for="tab in tabs" :key="tab.key" type="button" role="tab" :class="{ active: data.activeTab === tab.key }" :aria-selected="data.activeTab === tab.key" @click="setTab(tab.key)">{{ tab.label }}</button>
        </nav>

        <div class="dnd-cs-tab-panel" role="tabpanel">
          <!-- Attacks -->
          <template v-if="data.activeTab === 'attacks'">
            <div class="dnd-cs-attack-head"><span>Название</span><span>Бонус</span><span>Урон</span><span>Тип</span><span></span></div>
            <div v-for="item in data.attacks" :key="item.id" class="dnd-cs-attack-row">
              <input :readonly="readonly" :value="item.name" placeholder="Название" aria-label="Название атаки" @change="setItem('attacks', item.id, 'name', $ev($event))" />
              <input :readonly="readonly" :value="item.attackBonus || ''" placeholder="+5" aria-label="Бонус атаки" @change="setItem('attacks', item.id, 'attackBonus', $ev($event))" />
              <input :readonly="readonly" :value="item.damage || ''" placeholder="1d8+3" aria-label="Урон" @change="setItem('attacks', item.id, 'damage', $ev($event))" />
              <input :readonly="readonly" :value="item.damageType || ''" placeholder="колющий" aria-label="Тип урона" @change="setItem('attacks', item.id, 'damageType', $ev($event))" />
              <button v-if="!readonly" type="button" class="dnd-cs-row-remove" aria-label="Удалить атаку" @click="removeItem('attacks', item.id)">×</button>
            </div>
            <button v-if="!readonly" type="button" class="dnd-cs-add" @click="addItem('attacks')">+ Добавить атаку</button>
            <label class="dnd-cs-freetext">Атаки и заклинания
              <textarea :readonly="readonly" :value="data.attacksNotes" placeholder="Свободные заметки по атакам и заклинаниям" @change="setField('attacksNotes', $ev($event))"></textarea>
            </label>
          </template>

          <!-- Features -->
          <template v-else-if="data.activeTab === 'features'">
            <div v-for="item in data.features" :key="item.id" class="dnd-cs-feature-row">
              <div class="dnd-cs-feature-main">
                <input :readonly="readonly" :value="item.name" placeholder="Название" aria-label="Название умения" @change="setItem('features', item.id, 'name', $ev($event))" />
                <div class="dnd-cs-uses">
                  <button type="button" class="dnd-cs-hp-btn" :disabled="readonly || !item.maxUses" aria-label="Использовать" @click="changeUses(item.id, -1)">−</button>
                  <span>{{ item.currentUses || 0 }}/<input type="number" min="0" :readonly="readonly" :value="item.maxUses || 0" aria-label="Максимум использований" @change="setItemNumber('features', item.id, 'maxUses', $ev($event))" /></span>
                  <button type="button" class="dnd-cs-hp-btn" :disabled="readonly || !item.maxUses" aria-label="Восстановить" @click="changeUses(item.id, 1)">+</button>
                </div>
                <button v-if="!readonly" type="button" class="dnd-cs-row-remove" aria-label="Удалить умение" @click="removeItem('features', item.id)">×</button>
              </div>
              <textarea :readonly="readonly" :value="item.description || ''" placeholder="Описание" aria-label="Описание умения" @change="setItem('features', item.id, 'description', $ev($event))"></textarea>
            </div>
            <button v-if="!readonly" type="button" class="dnd-cs-add" @click="addItem('features')">+ Добавить умение</button>
          </template>

          <!-- Equipment -->
          <template v-else-if="data.activeTab === 'equipment'">
            <div v-for="item in data.equipment" :key="item.id" class="dnd-cs-equip-row">
              <label class="dnd-cs-equip-check"><input type="checkbox" :checked="item.equipped" :disabled="readonly" aria-label="Экипировано" @change="toggleItem('equipment', item.id, 'equipped')" /></label>
              <input :readonly="readonly" :value="item.name" placeholder="Предмет" aria-label="Название предмета" @change="setItem('equipment', item.id, 'name', $ev($event))" />
              <input class="dnd-cs-qty" type="number" min="0" :readonly="readonly" :value="item.quantity || 1" aria-label="Количество" @change="setItemNumber('equipment', item.id, 'quantity', $ev($event))" />
              <input :readonly="readonly" :value="item.description || ''" placeholder="Заметки" aria-label="Заметки" @change="setItem('equipment', item.id, 'description', $ev($event))" />
              <button v-if="!readonly" type="button" class="dnd-cs-row-remove" aria-label="Удалить предмет" @click="removeItem('equipment', item.id)">×</button>
            </div>
            <button v-if="!readonly" type="button" class="dnd-cs-add" @click="addItem('equipment')">+ Добавить предмет</button>
          </template>

          <!-- Personality -->
          <template v-else-if="data.activeTab === 'personality'">
            <label v-for="field in personalityFields" :key="field.key" class="dnd-cs-freetext">{{ field.label }}
              <textarea :readonly="readonly" :value="data.personality[field.key]" :aria-label="field.label" @change="setPersonality(field.key, $ev($event))"></textarea>
            </label>
          </template>

          <!-- Goals -->
          <template v-else-if="data.activeTab === 'goals'">
            <div v-for="item in data.goals" :key="item.id" class="dnd-cs-goal-row">
              <label class="dnd-cs-equip-check"><input type="checkbox" :checked="item.completed" :disabled="readonly" aria-label="Выполнено" @change="toggleItem('goals', item.id, 'completed')" /></label>
              <div class="dnd-cs-goal-main">
                <input :class="{ done: item.completed }" :readonly="readonly" :value="item.name" placeholder="Цель" aria-label="Название цели" @change="setItem('goals', item.id, 'name', $ev($event))" />
                <input :readonly="readonly" :value="item.description || ''" placeholder="Описание" aria-label="Описание цели" @change="setItem('goals', item.id, 'description', $ev($event))" />
              </div>
              <button v-if="!readonly" type="button" class="dnd-cs-row-remove" aria-label="Удалить цель" @click="removeItem('goals', item.id)">×</button>
            </div>
            <button v-if="!readonly" type="button" class="dnd-cs-add" @click="addItem('goals')">+ Добавить цель</button>
          </template>

          <!-- Notes -->
          <template v-else-if="data.activeTab === 'notes'">
            <textarea class="dnd-cs-notes" :readonly="readonly" :value="data.notes" placeholder="Заметки персонажа" aria-label="Заметки персонажа" @change="setField('notes', $ev($event))"></textarea>
          </template>

          <!-- Spells -->
          <template v-else-if="data.activeTab === 'spells'">
            <div class="dnd-cs-spell-head"><span></span><span>Заклинание</span><span>Ур.</span><span></span></div>
            <div v-for="item in data.spells" :key="item.id" class="dnd-cs-spell-row">
              <label class="dnd-cs-equip-check"><input type="checkbox" :checked="item.prepared" :disabled="readonly" aria-label="Подготовлено" @change="toggleItem('spells', item.id, 'prepared')" /></label>
              <input :readonly="readonly" :value="item.name" placeholder="Название" aria-label="Название заклинания" @change="setItem('spells', item.id, 'name', $ev($event))" />
              <input class="dnd-cs-qty" type="number" min="0" max="9" :readonly="readonly" :value="item.level || 0" aria-label="Уровень заклинания" @change="setItemNumber('spells', item.id, 'level', $ev($event))" />
              <button v-if="!readonly" type="button" class="dnd-cs-row-remove" aria-label="Удалить заклинание" @click="removeItem('spells', item.id)">×</button>
              <input class="dnd-cs-spell-notes" :readonly="readonly" :value="item.description || ''" placeholder="Заметки" aria-label="Заметки заклинания" @change="setItem('spells', item.id, 'description', $ev($event))" />
            </div>
            <button v-if="!readonly" type="button" class="dnd-cs-add" @click="addItem('spells')">+ Добавить заклинание</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, type PropType } from 'vue';
import {
  DND_ABILITIES, DND_SKILLS,
  abilityModifier, formatModifier, savingThrowBonus, skillModifier,
  proficiencyBonusForLevel, passiveScore, initiativeBonus,
  type DndAbilityKey, type DndCharacterSheetData, type DndListItem, type DndSkillKey, type DndTab, type SkillProficiency,
} from '../dnd/characterSheet';

type ListKey = 'attacks' | 'features' | 'equipment' | 'goals' | 'spells';

const newId = () => Math.random().toString(36).slice(2, 10);

export default defineComponent({
  name: 'DndCharacterSheet',
  props: {
    data: { type: Object as PropType<DndCharacterSheetData>, required: true },
    readonly: { type: Boolean, default: false },
  },
  emits: ['change', 'request-portrait', 'remove-portrait'],
  setup(props, { emit }) {
    const change = () => emit('change');
    // `<input @change>` gives a buffered value (fires on blur), matching the
    // parent's own buffered autosave - no per-keystroke saves.
    const $ev = (event: Event) => (event.target as HTMLInputElement | HTMLTextAreaElement).value;

    const proficiencyBonus = computed(() => proficiencyBonusForLevel(props.data.identity.level));
    const initiative = computed(() => initiativeBonus(props.data));
    const initial = computed(() => (props.data.identity.name || '?').slice(0, 1).toUpperCase());
    const xpPercent = computed(() => {
      const next = props.data.identity.nextLevelExperience;
      if (!next || next <= 0) return 0;
      return Math.max(0, Math.min(100, Math.round((props.data.identity.experience / next) * 100)));
    });

    const skillsByAbility = computed(() => {
      const map: Record<DndAbilityKey, typeof DND_SKILLS[number][]> = { strength: [], dexterity: [], constitution: [], intelligence: [], wisdom: [], charisma: [] };
      for (const skill of DND_SKILLS) map[skill.ability].push(skill);
      return map;
    });

    const passives = computed(() => [
      { key: 'perception', label: 'Пас. Восприятие', value: passiveScore(skillModifier(props.data, 'perception', proficiencyBonus.value), props.data.passiveBonuses.perception) },
      { key: 'investigation', label: 'Пас. Анализ', value: passiveScore(skillModifier(props.data, 'investigation', proficiencyBonus.value), props.data.passiveBonuses.investigation) },
      { key: 'insight', label: 'Пас. Проницательность', value: passiveScore(skillModifier(props.data, 'insight', proficiencyBonus.value), props.data.passiveBonuses.insight) },
    ]);

    const clamp = (n: number, min: number, max = Number.MAX_SAFE_INTEGER) => Math.min(max, Math.max(min, n));

    const setIdentity = (key: 'name' | 'race' | 'className', value: string) => { props.data.identity[key] = value; change(); };
    const setNumber = (target: Record<string, any>, key: string, value: string, min = -Infinity, max = Infinity) => {
      const n = Number(value); target[key] = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : target[key]; change();
    };
    const setField = (key: 'attacksNotes' | 'notes', value: string) => { props.data[key] = value; change(); };
    const setPersonality = (key: keyof DndCharacterSheetData['personality'], value: string) => { props.data.personality[key] = value; change(); };

    const setAbilityScore = (key: DndAbilityKey, value: string) => { props.data.abilities[key].score = clamp(Number(value) || 10, 1, 30); change(); };
    const toggleSave = (key: DndAbilityKey) => { props.data.abilities[key].savingThrowProficient = !props.data.abilities[key].savingThrowProficient; change(); };
    const savingThrow = (key: DndAbilityKey) => savingThrowBonus(props.data.abilities[key], proficiencyBonus.value);

    const skillMod = (key: DndSkillKey) => skillModifier(props.data, key, proficiencyBonus.value);
    const skillProf = (key: DndSkillKey): SkillProficiency => props.data.skills[key]?.proficiency || 'none';
    const skillProfTitle = (key: DndSkillKey) => ({ none: 'Нет владения', half: 'Половина', proficient: 'Владение', expertise: 'Компетентность' }[skillProf(key)]);
    const cycleSkill = (key: DndSkillKey) => {
      const order: SkillProficiency[] = ['none', 'proficient', 'expertise'];
      const current = skillProf(key);
      const next = order[(order.indexOf(current === 'half' ? 'none' : current) + 1) % order.length] ?? 'none';
      props.data.skills[key] = { proficiency: next, customBonus: props.data.skills[key]?.customBonus || 0 };
      change();
    };

    const changeHp = (delta: number) => { props.data.combat.currentHp = Math.max(0, props.data.combat.currentHp + delta); change(); };
    const changeExhaustion = (delta: number) => { props.data.combat.exhaustion = clamp(props.data.combat.exhaustion + delta, 0, 6); change(); };
    const toggleInspiration = () => { props.data.combat.inspiration = !props.data.combat.inspiration; change(); };

    const toggleProf = (group: 'armor' | 'weapons', value: string) => {
      const list = props.data.proficiencies[group];
      const idx = list.indexOf(value);
      if (idx >= 0) list.splice(idx, 1); else list.push(value);
      change();
    };
    const setProfListItem = (group: 'languages', i: number, value: string) => { props.data.proficiencies[group][i] = value; change(); };
    const addProfListItem = (group: 'languages') => { props.data.proficiencies[group].push(''); change(); };
    const removeProfListItem = (group: 'languages', i: number) => { props.data.proficiencies[group].splice(i, 1); change(); };

    const listOf = (key: ListKey) => props.data[key] as DndListItem[];
    const addItem = (key: ListKey) => { listOf(key).push({ id: newId(), name: '' }); change(); };
    const removeItem = (key: ListKey, id: string) => { const l = listOf(key); const i = l.findIndex((x) => x.id === id); if (i >= 0) l.splice(i, 1); change(); };
    const setItem = (key: ListKey, id: string, field: keyof DndListItem, value: string) => { const it = listOf(key).find((x) => x.id === id); if (it) (it as any)[field] = value; change(); };
    const setItemNumber = (key: ListKey, id: string, field: keyof DndListItem, value: string) => { const it = listOf(key).find((x) => x.id === id); if (it) (it as any)[field] = Math.max(0, Number(value) || 0); change(); };
    const toggleItem = (key: ListKey, id: string, field: 'equipped' | 'completed' | 'prepared') => { const it = listOf(key).find((x) => x.id === id); if (it) (it as any)[field] = !it[field]; change(); };
    const changeUses = (id: string, delta: number) => {
      const it = props.data.features.find((x) => x.id === id); if (!it || !it.maxUses) return;
      it.currentUses = clamp((it.currentUses || 0) + delta, 0, it.maxUses); change();
    };

    const setTab = (tab: DndTab) => { props.data.activeTab = tab; change(); };

    return {
      abilities: DND_ABILITIES,
      tabs: [
        { key: 'attacks', label: 'Атаки' }, { key: 'features', label: 'Умения' }, { key: 'equipment', label: 'Снаряжение' },
        { key: 'personality', label: 'Характер' }, { key: 'goals', label: 'Цели' }, { key: 'notes', label: 'Заметки' }, { key: 'spells', label: 'Заклинания' },
      ] as { key: DndTab; label: string }[],
      personalityFields: [
        { key: 'traits', label: 'Черты характера' }, { key: 'ideals', label: 'Идеалы' }, { key: 'bonds', label: 'Привязанности' }, { key: 'flaws', label: 'Слабости' },
      ] as { key: keyof DndCharacterSheetData['personality']; label: string }[],
      armorOptions: ['Лёгкие', 'Средние', 'Тяжёлые', 'Щиты'],
      weaponOptions: ['Простое', 'Воинское'],
      proficiencyBonus, initiative, initial, xpPercent, skillsByAbility, passives,
      abilityModifier, formatModifier,
      $ev, setIdentity, setNumber, setField, setPersonality,
      setAbilityScore, toggleSave, savingThrow,
      skillMod, skillProf, skillProfTitle, cycleSkill,
      changeHp, changeExhaustion, toggleInspiration,
      toggleProf, setProfListItem, addProfListItem, removeProfListItem,
      addItem, removeItem, setItem, setItemNumber, toggleItem, changeUses, setTab,
    };
  },
});
</script>

<style scoped>
.dnd-cs { display: flex; flex-direction: column; gap: 14px; color: var(--ui-text); }
.dnd-cs input, .dnd-cs textarea { color: var(--ui-text); background: var(--ui-surface-subtle); border: 1px solid var(--ui-border); border-radius: 6px; padding: 6px 8px; font: inherit; box-sizing: border-box; }
.dnd-cs input:focus, .dnd-cs textarea:focus { outline: none; border-color: var(--ui-accent-strong, var(--ui-brand-soft-on)); }
.dnd-cs textarea { width: 100%; min-height: 64px; resize: vertical; }
.dnd-cs input[type='number'] { width: 100%; }
.dnd-cs h4 { margin: 0 0 8px; font-size: 13px; color: var(--ui-text-secondary); }

/* Header */
.dnd-cs-header { display: flex; gap: 14px; align-items: flex-start; }
.dnd-cs-portrait { position: relative; flex: 0 0 64px; display: grid; place-items: center; width: 64px; height: 64px; border: 1px solid var(--ui-border); border-radius: 50%; overflow: visible; background: var(--ui-brand-soft); color: var(--ui-brand-soft-on); font-size: 24px; font-weight: 700; }
.dnd-cs-portrait img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
.dnd-cs-portrait-actions { position: absolute; right: -6px; bottom: -4px; display: flex; gap: 2px; }
.dnd-cs-portrait-actions button { width: 20px; height: 20px; padding: 0; border: 1px solid var(--ui-border); border-radius: 50%; background: var(--ui-surface-elevated); color: var(--ui-text); cursor: pointer; }
.dnd-cs-identity { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.dnd-cs-name { font-size: 20px; font-weight: 700; background: transparent; border-color: transparent; padding-left: 0; }
.dnd-cs-subline { display: flex; align-items: center; gap: 6px; }
.dnd-cs-subline input { flex: 1; min-width: 0; }
.dnd-cs-dot { color: var(--ui-text-secondary); }
.dnd-cs-xp { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--ui-text-secondary); }
.dnd-cs-level input, .dnd-cs-xp-field input { width: 62px; }
.dnd-cs-xp-next { display: inline-flex; align-items: center; gap: 4px; }
.dnd-cs-xp-next input { width: 72px; }
.dnd-cs-xp-bar { flex: 1 1 120px; min-width: 100px; height: 6px; border-radius: 999px; background: var(--ui-surface-subtle); overflow: hidden; }
.dnd-cs-xp-bar span { display: block; height: 100%; background: var(--ui-brand-soft-on, #44cf6e); }

/* Combat strip */
.dnd-cs-combat { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px; border: 1px solid var(--ui-border); border-radius: 10px; background: var(--ui-surface-subtle); }
.dnd-cs-stat { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ui-text-secondary); }
.dnd-cs-stat span { white-space: nowrap; }
.dnd-cs-stat input { width: 56px; }
.dnd-cs-stat.readonly-stat strong { color: var(--ui-text); font-size: 15px; }
.dnd-cs-init-bonus { width: 44px !important; }
.dnd-cs-hp input { width: 52px; }
.dnd-cs-hp-btn { width: 26px; height: 26px; flex: 0 0 26px; padding: 0; border: 1px solid var(--ui-border); border-radius: 6px; background: var(--ui-surface-elevated); color: var(--ui-text); cursor: pointer; font-size: 15px; line-height: 1; }
.dnd-cs-hp-btn:disabled { opacity: .5; cursor: default; }
.dnd-cs-toggle { padding: 6px 10px; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-surface-elevated); color: var(--ui-text-secondary); cursor: pointer; }
.dnd-cs-toggle.on { border-color: var(--ui-brand-soft-on, #44cf6e); color: var(--ui-brand-soft-on, #44cf6e); background: var(--ui-brand-soft); }
.dnd-cs-exhaustion strong { min-width: 14px; text-align: center; color: var(--ui-text); }

/* Body layout */
.dnd-cs-body { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.dnd-cs-left { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dnd-cs-right { min-width: 0; }

/* Abilities + skills */
.dnd-cs-abilities { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.dnd-cs-ability { border: 1px solid var(--ui-border); border-radius: 10px; padding: 8px; background: var(--ui-surface-subtle); }
.dnd-cs-ability-head { display: flex; flex-direction: column; gap: 6px; margin-bottom: 6px; }
.dnd-cs-ability-score { display: flex; align-items: center; gap: 6px; }
.dnd-cs-ability-name { font-weight: 700; font-size: 12px; width: 34px; color: var(--ui-text-secondary); }
.dnd-cs-ability-score input { width: 52px; font-weight: 700; text-align: center; }
.dnd-cs-ability-mod { font-weight: 700; color: var(--ui-text); font-style: normal; }
.dnd-cs-save { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border: 1px solid var(--ui-border); border-radius: 6px; background: var(--ui-surface-elevated); color: var(--ui-text-secondary); font-size: 12px; cursor: pointer; }
.dnd-cs-save.prof { color: var(--ui-text); }
.dnd-cs-skills { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.dnd-cs-skills li { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.dnd-cs-skill-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ui-text-secondary); }
.dnd-cs-skill-mod { font-weight: 600; color: var(--ui-text); }
.dnd-cs-skill-pip { padding: 0; border: 0; background: transparent; cursor: pointer; }
.dnd-cs-pip { display: inline-block; width: 11px; height: 11px; border-radius: 50%; border: 1.5px solid var(--ui-border); box-sizing: border-box; }
.dnd-cs-pip.proficient { background: var(--ui-brand-soft-on, #44cf6e); border-color: var(--ui-brand-soft-on, #44cf6e); }
.dnd-cs-pip.expertise { background: var(--ui-brand-soft-on, #44cf6e); border-color: var(--ui-brand-soft-on, #44cf6e); box-shadow: 0 0 0 2px var(--ui-brand-soft); }
.dnd-cs-pip.half { background: var(--ui-text-secondary); border-color: var(--ui-text-secondary); }

/* Passives */
.dnd-cs-passives { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.dnd-cs-passive { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-surface-subtle); text-align: center; }
.dnd-cs-passive strong { font-size: 18px; }
.dnd-cs-passive span { font-size: 11px; color: var(--ui-text-secondary); }

/* Proficiencies */
.dnd-cs-proficiencies { border: 1px solid var(--ui-border); border-radius: 10px; padding: 10px; }
.dnd-cs-prof-group, .dnd-cs-prof-list { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; }
.dnd-cs-prof-label { flex: 0 0 100%; color: var(--ui-text-secondary); font-size: 11px; }
.dnd-cs-prof-group label { display: inline-flex; align-items: center; gap: 4px; }
.dnd-cs-prof-row { display: flex; gap: 4px; width: 100%; }
.dnd-cs-prof-row input { flex: 1; }
.dnd-cs-prof-row button, .dnd-cs-row-remove { flex: 0 0 26px; width: 26px; height: 26px; padding: 0; border: 1px solid var(--ui-border); border-radius: 6px; background: var(--ui-surface-elevated); color: var(--ui-text-secondary); cursor: pointer; }
.dnd-cs-add, .dnd-cs-add-sm { align-self: flex-start; padding: 6px 10px; border: 1px dashed var(--ui-border); border-radius: 8px; background: transparent; color: var(--ui-text-secondary); cursor: pointer; font-size: 12px; }
.dnd-cs-add { margin-top: 8px; }

/* Tabs */
.dnd-cs-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; }
.dnd-cs-tabs button { padding: 6px 10px; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-surface-subtle); color: var(--ui-text-secondary); cursor: pointer; font-size: 12px; }
.dnd-cs-tabs button.active { border-color: var(--ui-brand-soft-on, #44cf6e); color: var(--ui-text); background: var(--ui-brand-soft); }
.dnd-cs-tab-panel { border: 1px solid var(--ui-border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 8px; min-height: 160px; }

/* Attack / spell / equipment rows */
.dnd-cs-attack-head, .dnd-cs-spell-head { display: grid; gap: 6px; font-size: 11px; color: var(--ui-text-secondary); }
.dnd-cs-attack-head { grid-template-columns: 2fr 1fr 1.2fr 1.2fr 26px; }
.dnd-cs-attack-row { display: grid; grid-template-columns: 2fr 1fr 1.2fr 1.2fr 26px; gap: 6px; align-items: center; }
.dnd-cs-spell-head { grid-template-columns: 30px 1fr 52px 26px; }
.dnd-cs-spell-row { display: grid; grid-template-columns: 30px 1fr 52px 26px; gap: 6px; align-items: center; }
.dnd-cs-spell-notes { grid-column: 1 / -1; }
.dnd-cs-equip-row { display: grid; grid-template-columns: 28px 2fr 60px 2fr 26px; gap: 6px; align-items: center; }
.dnd-cs-goal-row { display: grid; grid-template-columns: 28px 1fr 26px; gap: 6px; align-items: start; }
.dnd-cs-goal-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dnd-cs-goal-main input.done { text-decoration: line-through; color: var(--ui-text-secondary); }
.dnd-cs-equip-check { display: grid; place-items: center; }
.dnd-cs-qty { text-align: center; }
.dnd-cs-feature-row { display: flex; flex-direction: column; gap: 4px; padding-bottom: 8px; border-bottom: 1px solid var(--ui-border); }
.dnd-cs-feature-main { display: flex; align-items: center; gap: 6px; }
.dnd-cs-feature-main > input { flex: 1; min-width: 0; }
.dnd-cs-uses { display: flex; align-items: center; gap: 4px; white-space: nowrap; font-size: 12px; }
.dnd-cs-uses input { width: 44px; }
.dnd-cs-freetext { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--ui-text-secondary); }
.dnd-cs-notes { min-height: 220px; }

/* ===== Mobile ===== */
@media (max-width: 760px) {
  .dnd-cs-body { grid-template-columns: 1fr; }
  .dnd-cs-abilities { grid-template-columns: 1fr; }
  .dnd-cs-combat { gap: 6px; }
  .dnd-cs-stat input { width: 48px; }
  .dnd-cs-attack-head { display: none; }
  .dnd-cs-attack-row { grid-template-columns: 1fr 1fr; }
  .dnd-cs-attack-row .dnd-cs-row-remove { grid-column: 2; justify-self: end; }
  .dnd-cs-equip-row { grid-template-columns: 28px 1fr 52px 26px; }
  .dnd-cs-equip-row input[aria-label='Заметки'] { grid-column: 2 / -1; }
}
</style>

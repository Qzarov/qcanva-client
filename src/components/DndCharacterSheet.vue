<template>
  <div class="dnd-cs" :class="{ 'dnd-cs-readonly': readonly }">
    <!-- ===== TOP CARD: identity + combat ===== -->
    <section class="dnd-cs-topcard dnd-glass">
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
        <div class="dnd-cs-identity-line" :class="{ 'is-multiline': nameMultiline }">
          <span ref="nameMeasure" class="dnd-cs-name-measure" aria-hidden="true"></span>
          <textarea ref="nameInput" v-model="nameDraft" class="dnd-cs-name" rows="1" :readonly="readonly" placeholder="Имя персонажа" aria-label="Имя персонажа" @input="resizeName" @change="setIdentity('name', evVal($event))"></textarea>
          <div class="dnd-cs-subline">
            <input :readonly="readonly" :value="data.identity.race" placeholder="Раса" aria-label="Раса" @change="setIdentity('race', evVal($event))" />
            <span class="dnd-cs-dot">—</span>
            <input :readonly="readonly" :value="data.identity.className" placeholder="Класс" aria-label="Класс" @change="setIdentity('className', evVal($event))" />
          </div>
        </div>
      </div>
      <div class="dnd-cs-xp">
        <label class="dnd-cs-level"><span>Ур.</span> <input type="number" min="1" max="20" :readonly="readonly" :value="data.identity.level" aria-label="Уровень" @change="setNumber(data.identity, 'level', evVal($event), 1, 20)" /></label>
        <div class="dnd-cs-xp-bar" role="progressbar" aria-label="Прогресс опыта" :aria-valuenow="xpPercent" aria-valuemin="0" aria-valuemax="100">
          <span class="dnd-cs-xp-fill" :style="{ width: xpPercent + '%' }"></span>
          <div class="dnd-cs-xp-values">
            <input type="number" min="0" :readonly="readonly" :value="data.identity.experience" aria-label="Опыт" @change="setNumber(data.identity, 'experience', evVal($event), 0)" />
            <b>/</b>
            <input type="number" min="0" :readonly="readonly" :value="data.identity.nextLevelExperience" aria-label="Опыт до следующего уровня" @change="setNumber(data.identity, 'nextLevelExperience', evVal($event), 0)" />
          </div>
        </div>
      </div>
    </header>

    <!-- ===== COMBAT STRIP ===== -->
    <div class="dnd-cs-combat">
      <div class="dnd-cs-stat dnd-cs-hp">
        <span>HP</span>
        <input type="number" min="0" :readonly="readonly" :value="data.combat.currentHp" aria-label="Текущие HP" @change="setNumber(data.combat, 'currentHp', evVal($event), 0)" />
        <b>/</b>
        <input type="number" min="1" :readonly="readonly" :value="data.combat.maxHp" aria-label="Максимум HP" @change="setNumber(data.combat, 'maxHp', evVal($event), 1)" />
        <label class="dnd-cs-temp-hp">(+<input type="number" min="0" :readonly="readonly" :value="data.combat.temporaryHp" aria-label="Временные HP" @change="setNumber(data.combat, 'temporaryHp', evVal($event), 0)" /><span>врем.</span>)</label>
      </div>
      <div class="dnd-cs-hp-bar" role="progressbar" :aria-valuenow="hpPercent" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: hpPercent + '%' }"></span></div>
      <div v-if="deathStatus !== 'none'" class="dnd-cs-death" role="group" aria-label="Спасброски от смерти">
        <div class="dnd-cs-death-track">
          <span>Успехи</span>
          <button v-for="n in 3" :key="'s' + n" type="button" class="dnd-cs-pip-btn" :disabled="readonly" :aria-pressed="data.combat.deathSaves.successes >= n" :aria-label="'Успех ' + n + ' из 3'" @click="setDeathSaves('successes', n)"><span class="dnd-cs-pip" :class="{ on: data.combat.deathSaves.successes >= n }"></span></button>
        </div>
        <div class="dnd-cs-death-track is-failures">
          <span>Провалы</span>
          <button v-for="n in 3" :key="'f' + n" type="button" class="dnd-cs-pip-btn" :disabled="readonly" :aria-pressed="data.combat.deathSaves.failures >= n" :aria-label="'Провал ' + n + ' из 3'" @click="setDeathSaves('failures', n)"><span class="dnd-cs-pip" :class="{ on: data.combat.deathSaves.failures >= n }"></span></button>
        </div>
        <button v-if="deathStatus === 'dying'" type="button" class="dnd-cs-roll dnd-cs-death-roll" :disabled="readonly" title="Спасбросок от смерти: d20, 10 и выше — успех" @click="rollDeathSave">Спасбросок от смерти</button>
        <strong v-else class="dnd-cs-death-result" :class="{ 'is-dead': deathStatus === 'dead' }" aria-live="polite">{{ deathStatus === 'dead' ? 'Мёртв' : 'Стабилен' }}</strong>
      </div>
      <div class="dnd-cs-hp-actions">
        <button type="button" :disabled="readonly" aria-label="Лечение" @click="hpMode = 'heal'">Лечение</button>
        <button type="button" :disabled="readonly" aria-label="Урон" @click="hpMode = 'damage'">Урон</button>
      </div>
      <div class="dnd-cs-hp-actions dnd-cs-rest-actions">
        <button type="button" :disabled="readonly" :title="'Кости хитов: ' + hitDiceLeft + ' из ' + data.identity.level" @click="restKind = 'short'">Короткий отдых</button>
        <button type="button" :disabled="readonly" @click="restKind = 'long'">Длинный отдых</button>
      </div>
      <div class="dnd-cs-combat-stats">
        <div class="dnd-cs-stat"><span>КД</span><input type="number" min="0" :readonly="readonly" :value="data.combat.armorClass" aria-label="Класс доспеха" @change="setNumber(data.combat, 'armorClass', evVal($event), 0)" /></div>
        <div class="dnd-cs-stat"><span>Скорость</span><input type="number" min="0" :readonly="readonly" :value="data.combat.speed" aria-label="Скорость" @change="setNumber(data.combat, 'speed', evVal($event), 0)" /></div>
        <div class="dnd-cs-stat readonly-stat"><span>Мастерство</span><strong>{{ formatModifier(proficiencyBonus) }}</strong></div>
        <button type="button" class="dnd-cs-stat readonly-stat dnd-cs-initiative" aria-label="Бросить инициативу" title="Бросить инициативу: d20 + модификатор" @click="roll('initiative', 'Инициатива', initiative)"><span>Инициатива</span><strong>{{ formatModifier(initiative) }}</strong></button>
      </div>
      <DndRollBar class="dnd-cs-roll-bar" :mode="rollMode" :weapons="weaponAttacks" :history-count="rollHistory.length" @set-mode="setRollMode" @attack="attackWithWeapon" @open-log="rollLogOpen = true" />
    </div>
    </section>

    <!-- ===== PASSIVE SCORES (compact, up top) ===== -->
    <div class="dnd-cs-status-row">
      <DndPassiveScores :items="passives" />
      <DndCharacterStates :combat="data.combat" :readonly="readonly" @change="change" />
    </div>

    <!-- ===== BODY: abilities+skills (left) | tabs (right) ===== -->
    <div class="dnd-cs-body">
      <div class="dnd-cs-left">
        <!-- Abilities + their skills -->
        <section class="dnd-cs-abilities">
          <article v-for="ability in abilities" :key="ability.key" class="dnd-cs-ability">
            <header class="dnd-cs-ability-head">
              <span class="dnd-cs-ability-name">{{ ability.label }}</span>
              <input class="dnd-cs-ability-score" type="number" min="1" max="30" :readonly="readonly" :value="data.abilities[ability.key].score" :aria-label="ability.label" @change="setAbilityScore(ability.key, evVal($event))" />
            </header>
            <div class="dnd-cs-roll-row">
              <button type="button" class="dnd-cs-roll" :title="'Проверка: ' + ability.label" @click="roll('check', ability.label, abilityModifier(data.abilities[ability.key].score))">Проверка <b>{{ formatModifier(abilityModifier(data.abilities[ability.key].score)) }}</b></button>
              <div class="dnd-cs-save-cell">
                <button type="button" class="dnd-cs-pip-btn" :class="{ on: data.abilities[ability.key].savingThrowProficient }" :disabled="readonly" :aria-pressed="data.abilities[ability.key].savingThrowProficient" :title="data.abilities[ability.key].savingThrowProficient ? 'Владение спасброском' : 'Нет владения спасброском'" @click="toggleSave(ability.key)"><span class="dnd-cs-pip" :class="{ on: data.abilities[ability.key].savingThrowProficient }"></span></button>
                <button type="button" class="dnd-cs-roll" :title="'Спасбросок: ' + ability.label" @click="roll('save', ability.label, savingThrow(ability.key))">Спас <b>{{ formatModifier(savingThrow(ability.key)) }}</b></button>
              </div>
            </div>
            <ul class="dnd-cs-skills">
              <li v-for="skill in skillsByAbility[ability.key]" :key="skill.key">
                <button type="button" class="dnd-cs-skill-pip" :class="skillProf(skill.key)" :disabled="readonly" :title="skillProfTitle(skill.key)" @click="cycleSkill(skill.key)">
                  <span class="dnd-cs-pip" :class="skillProf(skill.key)"></span>
                </button>
                <button type="button" class="dnd-cs-skill-roll" :title="'Проверка: ' + skill.label" @click="roll('skill', skill.label, skillMod(skill.key))">
                  <span class="dnd-cs-skill-name">{{ skill.label }}</span>
                  <span class="dnd-cs-skill-mod">{{ formatModifier(skillMod(skill.key)) }}</span>
                </button>
              </li>
            </ul>
          </article>
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
              <input :readonly="readonly" :value="val" placeholder="Язык / владение" @change="setProfListItem('languages', i, evVal($event))" />
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

        <div class="dnd-cs-tab-panel dnd-glass" role="tabpanel">
          <!-- Attacks -->
          <template v-if="data.activeTab === 'attacks'">
            <DndWeaponAttacks :attacks="weaponAttacks" @attack="attackWithWeapon" @damage="weaponDamage" />
            <h4 class="dnd-cs-subheading">Другие атаки</h4>
            <div v-for="item in data.attacks" :key="item.id" class="dnd-cs-attack-row">
              <div class="dnd-cs-attack-top">
                <input class="dnd-cs-attack-name" :readonly="readonly" :value="item.name" placeholder="Название атаки" aria-label="Название атаки" @change="setItem('attacks', item.id, 'name', evVal($event))" />
                <button v-if="!readonly" type="button" class="dnd-cs-row-remove" aria-label="Удалить атаку" @click="removeItem('attacks', item.id)">×</button>
              </div>
              <div class="dnd-cs-attack-fields">
                <input :readonly="readonly" :value="item.attackBonus || ''" placeholder="Бонус +5" aria-label="Бонус атаки" @change="setItem('attacks', item.id, 'attackBonus', evVal($event))" />
                <input :readonly="readonly" :value="item.damage || ''" placeholder="Урон 1d8+3" aria-label="Урон" @change="setItem('attacks', item.id, 'damage', evVal($event))" />
                <input :readonly="readonly" :value="item.damageType || ''" placeholder="Тип: колющий" aria-label="Тип урона" @change="setItem('attacks', item.id, 'damageType', evVal($event))" />
              </div>
              <div class="dnd-cs-attack-rolls">
                <DndFormulaButton :formula="parseAttackBonus(item.attackBonus)" :source="item.attackBonus" prefix="Атака" :label="attackBonusText(item.attackBonus)" @roll="attackWithCustom(item)" />
                <DndFormulaButton v-if="item.damage?.trim()" :formula="parseFormula(item.damage)" :source="item.damage" prefix="Урон" @roll="customDamage(item)" />
              </div>
            </div>
            <button v-if="!readonly" type="button" class="dnd-cs-add" @click="addItem('attacks')">+ Добавить атаку</button>
            <label class="dnd-cs-freetext">Атаки и заклинания
              <textarea :readonly="readonly" :value="data.attacksNotes" placeholder="Свободные заметки по атакам и заклинаниям" @change="setField('attacksNotes', evVal($event))"></textarea>
            </label>
          </template>

          <!-- Features -->
          <template v-else-if="data.activeTab === 'features'">
            <div v-for="item in data.features" :key="item.id" class="dnd-cs-feature-row">
              <div class="dnd-cs-feature-main">
                <input :readonly="readonly" :value="item.name" placeholder="Название" aria-label="Название умения" @change="setItem('features', item.id, 'name', evVal($event))" />
                <div class="dnd-cs-uses">
                  <button type="button" class="dnd-cs-hp-btn" :disabled="readonly || !item.maxUses" aria-label="Использовать" @click="changeUses(item.id, -1)">−</button>
                  <span>{{ item.currentUses || 0 }}/<input type="number" min="0" :readonly="readonly" :value="item.maxUses || 0" aria-label="Максимум использований" @change="setItemNumber('features', item.id, 'maxUses', evVal($event))" /></span>
                  <button type="button" class="dnd-cs-hp-btn" :disabled="readonly || !item.maxUses" aria-label="Восстановить" @click="changeUses(item.id, 1)">+</button>
                </div>
                <button v-if="!readonly" type="button" class="dnd-cs-row-remove" aria-label="Удалить умение" @click="removeItem('features', item.id)">×</button>
              </div>
              <textarea :readonly="readonly" :value="item.description || ''" placeholder="Описание" aria-label="Описание умения" @change="setItem('features', item.id, 'description', evVal($event))"></textarea>
              <label v-if="item.maxUses" class="dnd-cs-recharge">Заряды возвращает
                <select :value="item.recharge || ''" :disabled="readonly" aria-label="Когда восстанавливаются заряды" @change="setItem('features', item.id, 'recharge', evVal($event))">
                  <option v-for="option in rechargeOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </label>
            </div>
            <button v-if="!readonly" type="button" class="dnd-cs-add" @click="addItem('features')">+ Добавить умение</button>
          </template>

          <!-- Equipment -->
          <template v-else-if="data.activeTab === 'equipment'">
            <div v-for="item in data.equipment" :key="item.id" class="dnd-cs-equip-row">
              <label class="dnd-cs-equip-check"><input type="checkbox" :checked="item.equipped" :disabled="readonly" aria-label="Экипировано" @change="toggleItem('equipment', item.id, 'equipped')" /></label>
              <input :readonly="readonly" :value="item.name" placeholder="Предмет" aria-label="Название предмета" @change="setItem('equipment', item.id, 'name', evVal($event))" />
              <input class="dnd-cs-qty" type="number" min="0" :readonly="readonly" :value="item.quantity || 1" aria-label="Количество" @change="setItemNumber('equipment', item.id, 'quantity', evVal($event))" />
              <input :readonly="readonly" :value="item.description || ''" placeholder="Заметки" aria-label="Заметки" @change="setItem('equipment', item.id, 'description', evVal($event))" />
              <button type="button" class="dnd-cs-weapon-toggle" :class="{ on: isWeapon(item) }" :disabled="readonly" :aria-pressed="isWeapon(item)" :aria-label="isWeapon(item) ? 'Это оружие: убрать боевые параметры' : 'Сделать оружием'" :title="isWeapon(item) ? 'Оружие' : 'Сделать оружием'" @click="toggleWeapon(item)">⚔</button>
              <button v-if="!readonly" type="button" class="dnd-cs-row-remove" aria-label="Удалить предмет" @click="removeItem('equipment', item.id)">×</button>
              <DndWeaponFields v-if="isWeapon(item)" :item="item" :sheet="data" :readonly="readonly" @change="change" />
            </div>
            <div v-if="!readonly" class="dnd-cs-add-row">
              <button type="button" class="dnd-cs-add" @click="addItem('equipment')">+ Добавить предмет</button>
              <button type="button" class="dnd-cs-add" @click="weaponCatalogOpen = true">+ Оружие из списка</button>
            </div>
          </template>

          <!-- Personality -->
          <template v-else-if="data.activeTab === 'personality'">
            <label v-for="field in personalityFields" :key="field.key" class="dnd-cs-freetext">{{ field.label }}
              <textarea :readonly="readonly" :value="data.personality[field.key]" :aria-label="field.label" @change="setPersonality(field.key, evVal($event))"></textarea>
            </label>
          </template>

          <!-- Goals -->
          <template v-else-if="data.activeTab === 'goals'">
            <div v-for="item in data.goals" :key="item.id" class="dnd-cs-goal-row">
              <label class="dnd-cs-equip-check"><input type="checkbox" :checked="item.completed" :disabled="readonly" aria-label="Выполнено" @change="toggleItem('goals', item.id, 'completed')" /></label>
              <div class="dnd-cs-goal-main">
                <input :class="{ done: item.completed }" :readonly="readonly" :value="item.name" placeholder="Цель" aria-label="Название цели" @change="setItem('goals', item.id, 'name', evVal($event))" />
                <input :readonly="readonly" :value="item.description || ''" placeholder="Описание" aria-label="Описание цели" @change="setItem('goals', item.id, 'description', evVal($event))" />
              </div>
              <button v-if="!readonly" type="button" class="dnd-cs-row-remove" aria-label="Удалить цель" @click="removeItem('goals', item.id)">×</button>
            </div>
            <button v-if="!readonly" type="button" class="dnd-cs-add" @click="addItem('goals')">+ Добавить цель</button>
          </template>

          <!-- Notes -->
          <template v-else-if="data.activeTab === 'notes'">
            <textarea class="dnd-cs-notes" :readonly="readonly" :value="data.notes" placeholder="Заметки персонажа" aria-label="Заметки персонажа" @change="setField('notes', evVal($event))"></textarea>
          </template>

          <!-- Spells -->
          <template v-else-if="data.activeTab === 'spells'">
            <div class="dnd-cs-spell-summary">
              <label class="dnd-cs-recharge">Класс
                <select :value="data.spellcasting.casterClass" :disabled="readonly" aria-label="Заклинательный класс" @change="setCasterClass(evVal($event))">
                  <option value="">Не выбран</option>
                  <option v-for="caster in casterClasses" :key="caster.key" :value="caster.key">{{ caster.label }}</option>
                </select>
              </label>
              <label class="dnd-cs-recharge">Характеристика
                <select :value="data.spellcasting.ability" :disabled="readonly" aria-label="Заклинательная характеристика" @change="setSpellAbility(evVal($event))">
                  <option value="">Не выбрана</option>
                  <option v-for="ability in abilities" :key="ability.key" :value="ability.key">{{ ability.label }}</option>
                </select>
              </label>
              <div class="dnd-cs-stat readonly-stat" :title="spellDc === null ? 'Выберите заклинательную характеристику' : 'Сложность спасброска: 8 + мастерство + модификатор'"><span>Сл спасброска</span><strong>{{ spellDc ?? '—' }}</strong></div>
              <button type="button" class="dnd-cs-roll" :disabled="spellAttack === null" :title="spellAttack === null ? 'Выберите заклинательную характеристику' : 'Атака заклинанием: d20 + мастерство + модификатор'" @click="rollSpellAttack()">Атака заклинанием <b>{{ spellAttack === null ? '—' : formatModifier(spellAttack) }}</b></button>
              <span v-if="showPrepared && (preparedCount || preparedMax !== null)" class="dnd-cs-spell-prepared" :class="{ 'is-over': preparedMax !== null && preparedCount > preparedMax }">Подготовлено: {{ preparedCount }}<template v-if="preparedMax !== null"> из {{ preparedMax }}</template></span>
              <button v-if="!readonly && slotsOutdated" type="button" class="dnd-cs-add-sm" title="Проставить число ячеек по таблице класса для текущего уровня" @click="fillClassSlots">Ячейки по уровню {{ data.identity.level }}</button>
            </div>
            <template v-for="group in spellGroups" :key="group.level">
              <div class="dnd-cs-spell-level">
                <h4 class="dnd-cs-subheading">{{ spellLevelLabel(group.level) }}</h4>
                <div v-if="group.level" class="dnd-cs-uses" role="group" :aria-label="'Ячейки ' + group.level + ' уровня'">
                  <span>Ячейки</span>
                  <button type="button" class="dnd-cs-hp-btn" :disabled="readonly || !slotsOf(group.level).remaining" :aria-label="'Потратить ячейку ' + group.level + ' уровня'" @click="changeSlot(group.level, 1)">−</button>
                  <span>{{ slotsOf(group.level).remaining }}/<input type="number" min="0" max="99" :readonly="readonly" :value="slotsOf(group.level).max" :aria-label="'Всего ячеек ' + group.level + ' уровня'" @change="setSlotMax(group.level, evVal($event))" /></span>
                  <button type="button" class="dnd-cs-hp-btn" :disabled="readonly || !slotsOf(group.level).spent" :aria-label="'Вернуть ячейку ' + group.level + ' уровня'" @click="changeSlot(group.level, -1)">+</button>
                </div>
              </div>
              <div v-for="item in group.spells" :key="item.id" class="dnd-cs-spell-row">
                <label v-if="group.level && showPrepared" class="dnd-cs-equip-check"><input type="checkbox" :checked="item.prepared" :disabled="readonly" aria-label="Подготовлено" @change="toggleItem('spells', item.id, 'prepared')" /></label>
                <span v-else aria-hidden="true"></span>
                <input :readonly="readonly" :value="item.name" placeholder="Название" aria-label="Название заклинания" @change="setItem('spells', item.id, 'name', evVal($event))" />
                <input class="dnd-cs-qty" type="number" min="0" max="9" :readonly="readonly" :value="item.level || 0" aria-label="Уровень заклинания" title="Уровень заклинания, 0 — заговор" @change="setSpellLevel(item.id, evVal($event))" />
                <button type="button" class="dnd-cs-weapon-toggle" :class="{ on: openSpells.has(item.id) }" :aria-expanded="openSpells.has(item.id)" aria-label="Бросок и урон заклинания" title="Бросок и урон" @click="toggleSpell(item.id)">✦</button>
                <button v-if="!readonly" type="button" class="dnd-cs-row-remove" aria-label="Удалить заклинание" @click="removeItem('spells', item.id)">×</button>
                <div v-if="spellRollKind(item) || item.damage?.trim()" class="dnd-cs-attack-rolls dnd-cs-spell-notes">
                  <DndFormulaButton v-if="spellRollKind(item) === 'attack' && spellAttack !== null" :formula="parseAttackBonus(formatModifier(spellAttack))" prefix="Атака" :label="formatModifier(spellAttack)" @roll="castSpellAttack(item)" />
                  <span v-if="spellRollKind(item) === 'save'" class="dnd-cs-spell-dc">Сл {{ spellDc ?? '—' }}<template v-if="spellSaveAbility(item)"> · {{ abilityShort(spellSaveAbility(item)) }}</template></span>
                  <DndFormulaButton v-if="item.damage?.trim()" :formula="parseFormula(item.damage)" :source="item.damage" :prefix="spellRollKind(item) || item.damageType?.trim() ? 'Урон' : 'Бросок'" @roll="spellDamage(item)" />
                </div>
                <DndSpellFields v-if="openSpells.has(item.id)" :item="item" :has-ability="Boolean(data.spellcasting.ability)" :readonly="readonly" @change="change" />
                <input class="dnd-cs-spell-notes" :readonly="readonly" :value="item.description || ''" placeholder="Заметки" aria-label="Заметки заклинания" @change="setItem('spells', item.id, 'description', evVal($event))" />
              </div>
            </template>
            <div v-if="!readonly" class="dnd-cs-add-row">
              <button type="button" class="dnd-cs-add" @click="spellCatalogOpen = true">+ Из списка заклинаний</button>
              <button type="button" class="dnd-cs-add" @click="addSpell(1)">+ Добавить заклинание</button>
              <button type="button" class="dnd-cs-add" @click="addSpell(0)">+ Добавить заговор</button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <DndHpDialog v-if="hpMode && !readonly" :mode="hpMode" :combat="data.combat" @close="hpMode = null" @apply="applyHpAmount" />
    <DndRestDialog v-if="restKind && !readonly" :kind="restKind" :data="data" @close="restKind = null" @apply="applyRest" @spend-hit-die="spendHitDie" @set-hit-die="setHitDie" />

    <DndRollToasts :history="rollHistory" :toasts="rollToasts" @dismiss="dismissRoll" @damage="damageFromToast" />
    <DndSpellCatalog v-if="spellCatalogOpen && !readonly" :sheet="data" @close="spellCatalogOpen = false" @pick="addCatalogSpell" />
    <DndWeaponCatalog v-if="weaponCatalogOpen && !readonly" @close="weaponCatalogOpen = false" @pick="addCatalogWeapon" />
    <DndRollLog v-if="rollLogOpen" :history="rollHistory" @close="rollLogOpen = false" @damage="damageFromToast" />
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch, type PropType } from 'vue';
import {
  DND_ABILITIES, DND_SKILLS,
  abilityModifier, formatModifier, savingThrowBonus, skillModifier,
  proficiencyBonusForLevel, passiveScore, initiativeBonus, isHpAmount,
  FEATURE_RECHARGE_OPTIONS, HIT_DICE, deathSaveStatus, hitDiceRemaining, spellSlotKey, type RestKind,
  type DndAbilityKey, type DndCharacterSheetData, type DndListItem, type DndSkillKey, type DndTab, type SkillProficiency,
} from '../dnd/characterSheet';
import DndHpDialog from './DndHpDialog.vue';
import DndRestDialog from './DndRestDialog.vue';
import DndPassiveScores from './DndPassiveScores.vue';
import DndCharacterStates from './DndCharacterStates.vue';
import DndFormulaButton from './DndFormulaButton.vue';
import DndRollBar from './DndRollBar.vue';
import DndRollLog from './DndRollLog.vue';
import DndRollToasts from './DndRollToasts.vue';
import DndWeaponAttacks from './DndWeaponAttacks.vue';
import DndWeaponFields from './DndWeaponFields.vue';
import DndSpellFields from './DndSpellFields.vue';
import DndSpellCatalog from './DndSpellCatalog.vue';
import DndWeaponCatalog from './DndWeaponCatalog.vue';
import { catalogEquipmentItem, type CatalogWeapon } from '../dnd/weaponCatalog';
import { formatSigned, parseFormula } from '../dnd/dice';
import { useSheetRolls, type DamageOption } from '../dnd/useSheetRolls';
import {
  abilityShort, preparedSpellCount, spellAttackBonus, spellGroups as groupSpells, spellLevelLabel, spellRollKind,
  spellSaveAbility, spellSaveDc, spellSlots,
} from '../dnd/spells';
import {
  SPELLCASTER_CLASSES, catalogSpellItem, classSlots, preparedLimit, preparesSpells, slotsDifferFromClass, spellcasterClass,
  type CatalogSpell,
} from '../dnd/spellCatalog';
import { createWeapon, equippedWeaponAttacks, isWeapon, parseAttackBonus, type WeaponAttack } from '../dnd/weapons';

type ListKey = 'attacks' | 'features' | 'equipment' | 'goals' | 'spells';
type RollKind = 'check' | 'save' | 'skill' | 'initiative';

const newId = () => Math.random().toString(36).slice(2, 10);

export default defineComponent({
  name: 'DndCharacterSheet',
  components: { DndHpDialog, DndRestDialog, DndPassiveScores, DndCharacterStates, DndFormulaButton, DndRollBar, DndRollLog, DndRollToasts, DndWeaponAttacks, DndWeaponFields, DndSpellFields, DndSpellCatalog, DndWeaponCatalog },
  props: {
    data: { type: Object as PropType<DndCharacterSheetData>, required: true },
    readonly: { type: Boolean, default: false },
  },
  // `op` carries changes that must merge with other people's as deltas (HP,
  // feature uses) or that touch several fields at once (rests, hit dice, death
  // saves) instead of being diffed into absolute values on `change`.
  emits: ['change', 'op', 'request-portrait', 'remove-portrait'],
  setup(props, { emit }) {
    const change = () => emit('change');
    // `<input @change>` gives a buffered value (fires on blur), matching the
    // parent's own buffered autosave - no per-keystroke saves.
    const evVal = (event: Event) => (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    const nameInput = ref<HTMLTextAreaElement | null>(null);
    const nameDraft = ref(props.data.identity.name);
    const nameMeasure = ref<HTMLSpanElement | null>(null);
    const nameMultiline = ref(false);
    const resizeName = () => {
      const input = nameInput.value;
      if (!input) return;
      if (nameMeasure.value && input.parentElement) {
        nameMeasure.value.textContent = input.value;
        // Measure against the NORMAL layout so switching to the wider stacked
        // layout never oscillates between one and two lines near the boundary.
        const normalWidth = (input.parentElement.clientWidth - 6) * 1.4 / 2.4 - 10;
        const multiline = input.value.includes('\n') || (normalWidth > 0 && nameMeasure.value.scrollWidth > normalWidth);
        if (nameMultiline.value !== multiline) {
          nameMultiline.value = multiline;
          void nextTick(resizeName);
        }
      }
      // Measure at the normal font first. Always reset it so shortening a
      // name or widening the viewport restores the original size.
      const baseSize = parseFloat(getComputedStyle(nameMeasure.value || input).fontSize);
      const minimumSize = Math.min(baseSize, baseSize <= 20 ? 14 : 16);
      let fontSize = baseSize;
      input.style.fontSize = `${fontSize}px`;
      input.style.height = 'auto';
      while (fontSize > minimumSize && input.scrollHeight > fontSize * 1.25 * 2 + 5) {
        fontSize -= 1;
        input.style.fontSize = `${fontSize}px`;
      }
      input.style.height = `${input.scrollHeight + 2}px`;
    };
    let nameObserver: ResizeObserver | undefined;
    onMounted(() => {
      resizeName();
      if (typeof ResizeObserver !== 'undefined' && nameInput.value?.parentElement) {
        nameObserver = new ResizeObserver(resizeName);
        nameObserver.observe(nameInput.value.parentElement);
        // The name's intrinsic metrics can change when a web font loads,
        // without changing the fixed-height textarea or its parent.
        if (nameMeasure.value) nameObserver.observe(nameMeasure.value);
      }
    });
    watch(() => props.data.identity.name, value => { nameDraft.value = value; }, { flush: 'post' });
    watch(nameDraft, () => { void nextTick(resizeName); }, { flush: 'post' });
    onBeforeUnmount(() => nameObserver?.disconnect());

    const proficiencyBonus = computed(() => proficiencyBonusForLevel(props.data.identity.level));
    const initiative = computed(() => initiativeBonus(props.data));
    const initial = computed(() => (props.data.identity.name || '?').slice(0, 1).toUpperCase());
    const xpPercent = computed(() => {
      const next = props.data.identity.nextLevelExperience;
      if (!next || next <= 0) return 0;
      return Math.max(0, Math.min(100, Math.round((props.data.identity.experience / next) * 100)));
    });
    const hpPercent = computed(() => {
      const max = props.data.combat.maxHp;
      if (!max || max <= 0) return 0;
      return Math.max(0, Math.min(100, Math.round((props.data.combat.currentHp / max) * 100)));
    });

    const skillsByAbility = computed(() => {
      const map: Record<DndAbilityKey, typeof DND_SKILLS[number][]> = { strength: [], dexterity: [], constitution: [], intelligence: [], wisdom: [], charisma: [] };
      for (const skill of DND_SKILLS) map[skill.ability].push(skill);
      return map;
    });

    const passives = computed(() => [
      { key: 'perception', label: 'Восприятие', ariaLabel: 'О пассивном восприятии', help: 'замечать скрытое без броска.', value: passiveScore(skillModifier(props.data, 'perception', proficiencyBonus.value), props.data.passiveBonuses.perception) },
      { key: 'investigation', label: 'Анализ', ariaLabel: 'О пассивном анализе', help: 'находить закономерности и подсказки без броска.', value: passiveScore(skillModifier(props.data, 'investigation', proficiencyBonus.value), props.data.passiveBonuses.investigation) },
      { key: 'insight', label: 'Проницательность', ariaLabel: 'О пассивной проницательности', help: 'понимать намерения и эмоции без броска.', value: passiveScore(skillModifier(props.data, 'insight', proficiencyBonus.value), props.data.passiveBonuses.insight) },
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

    const hpMode = ref<'heal' | 'damage' | null>(null);
    const applyHpAmount = (amount: number) => {
      if (props.readonly || !hpMode.value || !isHpAmount(amount)) return;
      emit('op', { type: 'hp-change', mode: hpMode.value, amount });
      hpMode.value = null;
    };
    watch(() => props.readonly, value => { if (value) { hpMode.value = null; restKind.value = null; spellCatalogOpen.value = false; } });

    // ===== Death saves, hit dice, rests =====
    const deathStatus = computed(() => deathSaveStatus(props.data.combat));
    /** Tapping the n-th pip sets the count to n; tapping the last filled one clears it. */
    const setDeathSaves = (key: 'successes' | 'failures', n: number) => {
      if (props.readonly) return;
      const saves = props.data.combat.deathSaves;
      saves[key] = saves[key] === n ? n - 1 : n;
      change();
    };
    const restKind = ref<RestKind | null>(null);
    const hitDiceLeft = computed(() => hitDiceRemaining(props.data));
    const applyRest = () => {
      if (props.readonly || !restKind.value) return;
      emit('op', { type: 'rest', kind: restKind.value });
      restKind.value = null;
    };
    const setHitDie = (sides: number) => {
      if (props.readonly || !(HIT_DICE as readonly number[]).includes(sides)) return;
      props.data.combat.hitDie = sides;
      change();
    };

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
      emit('op', { type: 'uses-change', itemId: id, delta });
    };

    const setTab = (tab: DndTab) => { props.data.activeTab = tab; change(); };

    // ===== Dice rolls =====
    const rolls = useSheetRolls();
    const rollLogOpen = ref(false);
    const roll = (kind: RollKind, name: string, modifier: number) => { rolls.rollCheck(kind, name, modifier); };
    const rollDeathSave = () => {
      if (props.readonly || deathStatus.value !== 'dying') return;
      emit('op', { type: 'death-save', outcome: rolls.rollDeathSave() });
    };
    const spendHitDie = () => {
      if (props.readonly || !hitDiceLeft.value) return;
      const heal = rolls.rollHitDie(props.data.combat.hitDie, abilityModifier(props.data.abilities.constitution.score));
      emit('op', { type: 'hit-die', heal });
    };
    const weaponAttacks = computed(() => equippedWeaponAttacks(props.data));
    const damageOptions = (attack: WeaponAttack): DamageOption[] =>
      attack.damage.flatMap((entry) => (entry.formula.ok ? [{ label: entry.label, formula: entry.formula, type: entry.type }] : []));
    const attackWithWeapon = (attack: WeaponAttack) => { rolls.rollAttack(attack.name, attack.attackBonus, damageOptions(attack)); };
    const weaponDamage = (attack: WeaponAttack, index: number) => {
      const entry = attack.damage[index];
      if (entry?.formula.ok) rolls.rollDamage(attack.name, { label: entry.label, formula: entry.formula, type: entry.type });
    };
    const attackBonusText = (text: string | undefined) => {
      const parsed = parseAttackBonus(text);
      return parsed.ok && !parsed.dice.length ? formatSigned(parsed.modifier) : undefined;
    };
    const attackWithCustom = (item: DndListItem) => {
      const bonus = parseAttackBonus(item.attackBonus);
      if (!bonus.ok) return;
      const damage = parseFormula(item.damage || '');
      const options = damage.ok ? [{ label: 'Урон', formula: damage, type: item.damageType || '' }] : [];
      rolls.rollAttack(item.name.trim() || 'Атака', bonus, options);
    };
    const customDamage = (item: DndListItem) => {
      const damage = parseFormula(item.damage || '');
      if (damage.ok) rolls.rollDamage(item.name.trim() || 'Атака', { label: 'Урон', formula: damage, type: item.damageType || '' });
    };
    /** "Урон"/"Крит" on an attack (toast or log): a natural 20 doubles the dice; once per attack. */
    const damageFromToast = (rollId: string, index: number) => { rolls.rollAttackDamage(rollId, index); };
    // ===== Spells =====
    const spellAttack = computed(() => spellAttackBonus(props.data));
    const spellDc = computed(() => spellSaveDc(props.data));
    const spellGroups = computed(() => groupSpells(props.data));
    const preparedCount = computed(() => preparedSpellCount(props.data));
    const slotsOf = (level: number) => spellSlots(props.data, level);
    const setSpellAbility = (value: string) => {
      props.data.spellcasting.ability = DND_ABILITIES.some((ability) => ability.key === value) ? value as DndAbilityKey : '';
      change();
    };
    const setSlotMax = (level: number, value: string) => {
      const slot = props.data.spellcasting.slots[spellSlotKey(level)];
      slot.max = clamp(Math.trunc(Number(value) || 0), 0, 99);
      slot.spent = Math.min(slot.spent, slot.max);
      change();
    };
    // Spending a slot is a delta, like feature uses: two casters at once add up.
    const changeSlot = (level: number, delta: number) => {
      if (props.readonly) return;
      emit('op', { type: 'slot-change', level, delta });
    };
    // Choosing a class sets what follows from it: the ability and the slots for the current level.
    const fillClassSlots = () => {
      const caster = spellcasterClass(props.data.spellcasting.casterClass);
      if (!caster) return;
      classSlots(caster.key, props.data.identity.level).forEach((max, index) => {
        const slot = props.data.spellcasting.slots[spellSlotKey(index + 1)];
        slot.max = max;
        slot.spent = Math.min(slot.spent, max);
      });
      change();
    };
    const setCasterClass = (value: string) => {
      const caster = spellcasterClass(value);
      props.data.spellcasting.casterClass = caster?.key ?? '';
      if (caster) {
        props.data.spellcasting.ability = caster.ability;
        fillClassSlots();
      } else change();
    };
    const slotsOutdated = computed(() => slotsDifferFromClass(props.data));
    const preparedMax = computed(() => preparedLimit(props.data));
    const showPrepared = computed(() => preparesSpells(props.data));
    const spellCatalogOpen = ref(false);
    const addCatalogSpell = (spell: CatalogSpell) => {
      if (props.readonly || props.data.spells.some((entry) => entry.catalogKey === spell.key)) return;
      props.data.spells.push(catalogSpellItem(spell, newId(), props.data));
      change();
    };
    const addSpell = (level: number) => { props.data.spells.push({ id: newId(), name: '', level }); change(); };
    const setSpellLevel = (id: string, value: string) => {
      const spell = props.data.spells.find((entry) => entry.id === id);
      if (spell) spell.level = clamp(Math.trunc(Number(value) || 0), 0, 9);
      change();
    };
    // Which spells show their roll settings: a view choice, not part of the sheet.
    const openSpells = ref(new Set<string>());
    const toggleSpell = (id: string) => {
      const next = new Set(openSpells.value);
      if (!next.delete(id)) next.add(id);
      openSpells.value = next;
    };
    const spellName = (item: DndListItem) => item.name.trim() || 'Заклинание';
    const spellDamageOption = (item: DndListItem): DamageOption[] => {
      const damage = parseFormula(item.damage || '');
      return damage.ok ? [{ label: 'Урон', formula: damage, type: item.damageType || '' }] : [];
    };
    const rollSpellAttack = () => { if (spellAttack.value !== null) rolls.rollAttack('Заклинание', spellAttack.value); };
    const castSpellAttack = (item: DndListItem) => {
      if (spellAttack.value !== null) rolls.rollAttack(spellName(item), spellAttack.value, spellDamageOption(item));
    };
    const spellDamage = (item: DndListItem) => {
      const [option] = spellDamageOption(item);
      if (option) rolls.rollDamage(spellName(item), option);
    };
    const weaponCatalogOpen = ref(false);
    const addCatalogWeapon = (weapon: CatalogWeapon) => {
      props.data.equipment.push(catalogEquipmentItem(weapon, newId()));
      weaponCatalogOpen.value = false;
      change();
    };
    const toggleWeapon = (item: DndListItem) => {
      // null, not delete: the sync diff only sends keys that are present.
      const target = item as DndListItem & { weapon?: unknown };
      target.weapon = target.weapon ? null : createWeapon();
      change();
    };
    return {
      // Display order groups the two SHORTEST cards (STR: 1 skill, CON: 0) into
      // the first grid row so they sit together and stay compact, instead of
      // each being stretched to a tall neighbour's height.
      abilities: (['strength', 'constitution', 'dexterity', 'intelligence', 'wisdom', 'charisma'] as const)
        .map((k) => DND_ABILITIES.find((a) => a.key === k)!),
      tabs: [
        { key: 'attacks', label: 'Атаки' }, { key: 'features', label: 'Умения' }, { key: 'equipment', label: 'Снаряжение' },
        { key: 'personality', label: 'Характер' }, { key: 'goals', label: 'Цели' }, { key: 'notes', label: 'Заметки' }, { key: 'spells', label: 'Заклинания' },
      ] as { key: DndTab; label: string }[],
      personalityFields: [
        { key: 'traits', label: 'Черты характера' }, { key: 'ideals', label: 'Идеалы' }, { key: 'bonds', label: 'Привязанности' }, { key: 'flaws', label: 'Слабости' },
      ] as { key: keyof DndCharacterSheetData['personality']; label: string }[],
      armorOptions: ['Лёгкие', 'Средние', 'Тяжёлые', 'Щиты'],
      weaponOptions: ['Простое', 'Воинское'],
      proficiencyBonus, initiative, initial, xpPercent, hpPercent, skillsByAbility, passives,
      abilityModifier, formatModifier,
      nameInput, nameDraft, nameMeasure, nameMultiline, resizeName, evVal, setIdentity, setNumber, setField, setPersonality,
      setAbilityScore, toggleSave, savingThrow,
      skillMod, skillProf, skillProfTitle, cycleSkill,
      hpMode, applyHpAmount, change,
      deathStatus, setDeathSaves, rollDeathSave, restKind, hitDiceLeft, applyRest, setHitDie, spendHitDie,
      rechargeOptions: FEATURE_RECHARGE_OPTIONS,
      spellAttack, spellDc, spellGroups, preparedCount, slotsOf, setSpellAbility, setSlotMax, changeSlot, addSpell, setSpellLevel,
      openSpells, toggleSpell, rollSpellAttack, castSpellAttack, spellDamage,
      casterClasses: SPELLCASTER_CLASSES, setCasterClass, fillClassSlots, slotsOutdated, preparedMax, showPrepared,
      spellCatalogOpen, addCatalogSpell,
      spellLevelLabel, spellRollKind, spellSaveAbility, abilityShort,
      toggleProf, setProfListItem, addProfListItem, removeProfListItem,
      addItem, removeItem, setItem, setItemNumber, toggleItem, changeUses, setTab,
      roll, rollLogOpen, weaponAttacks, attackWithWeapon, weaponDamage, attackWithCustom, customDamage, damageFromToast,
      attackBonusText, parseAttackBonus, parseFormula, isWeapon, toggleWeapon, weaponCatalogOpen, addCatalogWeapon,
      rollMode: rolls.mode, setRollMode: rolls.setMode, rollHistory: rolls.history, rollToasts: rolls.toasts, dismissRoll: rolls.dismiss,
    };
  },
});
</script>

<style scoped>
/* ===== Liquid Glass visual tokens (develop the style from here) ===== */
.dnd-cs {
  --dnd-glass-bg: rgba(13, 17, 14, 0.72);
  --dnd-glass-tint: linear-gradient(160deg, rgba(255, 255, 255, 0.055), rgba(255, 255, 255, 0.006));
  --dnd-glass-border: rgba(130, 210, 155, 0.28);
  --dnd-glass-highlight: rgba(255, 255, 255, 0.10);
  --dnd-glass-sheen: rgba(255, 255, 255, 0.08);
  --dnd-glass-shadow: 0 10px 34px rgba(0, 0, 0, 0.38);
  --dnd-glass-accent: #00ff00;
  --dnd-glass-accent-soft: rgba(0, 255, 0, 0.16);
  --dnd-glass-accent-glow: rgba(0, 255, 0, 0.36);
  --dnd-glass-radius: 20px;
  --dnd-text-dim: #a7c8b4;
  /* Inner cards (abilities, proficiencies): no blur, so their own backing. */
  --dnd-card-bg: linear-gradient(160deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.02)), rgba(10, 14, 11, 0.5);
  /* Tint of rows, chips and buttons: rgba(var(--dnd-fill-rgb), <step>). */
  --dnd-fill-rgb: 255, 255, 255;
  /* Sunken surfaces: bar tracks, the focused field, the portrait's shade. */
  --dnd-well: rgba(0, 0, 0, 0.45);
  --dnd-field-focus-bg: rgba(0, 0, 0, 0.28);
  --dnd-portrait-shade: rgba(0, 0, 0, 0.25);
  --dnd-solid: rgba(10, 14, 11, 0.85);
  --dnd-danger: #ff6b6b;

  display: flex;
  flex-direction: column;
  gap: 14px;
  color: var(--ui-text);
}

/* Light theme: the same roles, taken from the app's light glass tokens. */
:root[data-theme='light'] .dnd-cs {
  --dnd-glass-bg: var(--ui-glass-bg);
  --dnd-glass-tint: var(--ui-glass-tint);
  --dnd-glass-border: var(--ui-glass-border);
  --dnd-glass-highlight: var(--ui-glass-highlight);
  --dnd-glass-sheen: var(--ui-glass-sheen);
  --dnd-glass-shadow: var(--ui-glass-shadow);
  --dnd-glass-accent: var(--ui-accent-strong);
  --dnd-glass-accent-soft: var(--ui-glass-accent-bg);
  --dnd-glass-accent-glow: rgba(32, 207, 69, 0.28);
  --dnd-text-dim: var(--ui-text-secondary);
  --dnd-card-bg: var(--ui-glass-card-bg);
  --dnd-fill-rgb: 20, 91, 37;
  --dnd-well: rgba(20, 91, 37, 0.12);
  --dnd-field-focus-bg: rgba(255, 255, 255, 0.9);
  --dnd-portrait-shade: rgba(20, 91, 37, 0.08);
  --dnd-solid: var(--ui-surface-solid);
  --dnd-danger: var(--ui-danger-foreground);
}

/* Big translucent surface WITH blur - used only on the few large panels
   (top card, tab panel) so we never stack backdrop-filter on dozens of rows. */
.dnd-glass {
  position: relative;
  background: var(--dnd-glass-tint), var(--dnd-glass-bg);
  border: 1px solid var(--dnd-glass-border);
  border-radius: var(--dnd-glass-radius);
  backdrop-filter: blur(18px) saturate(1.15);
  -webkit-backdrop-filter: blur(18px) saturate(1.15);
  box-shadow: inset 0 1px 0 var(--dnd-glass-highlight), var(--dnd-glass-shadow);
}
/* Soft highlight along the top edge (the "liquid" sheen). */
.dnd-glass::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(180deg, var(--dnd-glass-sheen), transparent 42%);
}
.dnd-glass > * { position: relative; z-index: 1; }

/* Smaller inner cards: translucent + bordered, NO blur (kept cheap). */
.dnd-cs-ability,
.dnd-cs-proficiencies {
  background: var(--dnd-card-bg);
  border: 1px solid var(--dnd-glass-border);
  border-radius: 14px;
  box-shadow: inset 0 1px 0 var(--dnd-glass-sheen);
}

/* ===== Inputs: read as plain values in idle, reveal edit affordance on hover/focus ===== */
.dnd-cs input,
.dnd-cs textarea {
  color: var(--ui-text);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 4px 6px;
  font: inherit;
  box-sizing: border-box;
  transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
}
.dnd-cs textarea { width: 100%; min-height: 60px; resize: vertical; line-height: 1.5; }
.dnd-cs input[type='number'] { width: 100%; }
.dnd-cs input:hover:not([readonly]):not(:focus),
.dnd-cs textarea:hover:not([readonly]):not(:focus) {
  background: rgba(var(--dnd-fill-rgb), 0.045);
  border-color: var(--dnd-glass-border);
}
.dnd-cs input:focus,
.dnd-cs textarea:focus {
  outline: none;
  background: var(--dnd-field-focus-bg);
  border-color: color-mix(in srgb, var(--dnd-glass-accent) 55%, transparent);
  box-shadow: 0 0 0 3px var(--dnd-glass-accent-soft);
}
.dnd-cs input::placeholder,
.dnd-cs textarea::placeholder { color: color-mix(in srgb, var(--dnd-text-dim) 75%, transparent); }
.dnd-cs h4 { margin: 0 0 8px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: var(--dnd-text-dim); }

/* Small round +/- glass buttons, reused for HP / exhaustion / uses. */
.dnd-cs-hp-btn {
  width: 24px; height: 24px; flex: 0 0 24px; padding: 0;
  border: 1px solid var(--dnd-glass-border); border-radius: 8px;
  background: rgba(var(--dnd-fill-rgb), 0.05); color: var(--ui-text);
  cursor: pointer; font-size: 15px; line-height: 1;
  transition: background 150ms, border-color 150ms, color 150ms;
}
.dnd-cs-hp-btn:hover:not(:disabled) { background: var(--dnd-glass-accent-soft); border-color: color-mix(in srgb, var(--dnd-glass-accent) 45%, transparent); color: var(--dnd-glass-accent); }
.dnd-cs-hp-btn:disabled { opacity: .45; cursor: default; }

/* ===== TOP CARD (identity + combat as one compact block) ===== */
.dnd-cs-topcard { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, .8fr); gap: 12px 20px; padding: 13px 16px; }
.dnd-cs-header { display: grid; grid-template-columns:76px minmax(0,1fr); gap:8px 14px; align-items:start; min-width:0; }
.dnd-cs-portrait {
  position: relative; flex: 0 0 76px; display: grid; place-items: center;
  width: 76px; height: 76px; border-radius: 22px; overflow: visible;
  background: radial-gradient(120% 120% at 30% 20%, var(--dnd-glass-accent-soft), var(--dnd-portrait-shade));
  border: 1px solid color-mix(in srgb, var(--dnd-glass-accent) 30%, transparent);
  color: var(--dnd-glass-accent); font-size: 30px; font-weight: 800;
  box-shadow: 0 0 22px rgba(0, 255, 0, 0.10), inset 0 1px 0 var(--dnd-glass-highlight);
}
.dnd-cs-portrait img { width: 100%; height: 100%; border-radius: 21px; object-fit: cover; }
.dnd-cs-portrait-actions { position: absolute; right: -6px; bottom: -6px; display: flex; gap: 2px; }
.dnd-cs-portrait-actions button { width: 22px; height: 22px; padding: 0; border: 1px solid var(--dnd-glass-border); border-radius: 50%; background: var(--dnd-solid); color: var(--ui-text); cursor: pointer; }
.dnd-cs-identity { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.dnd-cs-identity-line { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); align-items: start; gap: 6px; }
.dnd-cs-identity-line.is-multiline { grid-template-columns: minmax(0, 1fr) minmax(0, 90px); }
.dnd-cs-identity-line.is-multiline .dnd-cs-subline { grid-template-columns: minmax(0, 1fr); }
.dnd-cs-name-measure { position: absolute; visibility: hidden; pointer-events: none; white-space: pre; width: max-content; font-size: 24px; line-height: 1.25; font-weight: 800; letter-spacing: -.01em; }
.dnd-cs textarea.dnd-cs-name { min-height: 0; resize: none; overflow: hidden; font-size: 24px; line-height: 1.25; font-weight: 800; letter-spacing: -.01em; padding: 2px 4px; overflow-wrap: anywhere; }
.dnd-cs-subline { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; gap: 4px; padding-top: 6px; color: var(--dnd-text-dim); font-size: 13px; }
.dnd-cs-subline input { width: 100%; min-width: 0; color: var(--dnd-text-dim); }
.dnd-cs-dot { display: none; }
.dnd-cs-xp { grid-column:1 / -1; display:flex; align-items:stretch; gap:0; font-size:11px; color:var(--dnd-text-dim); }
.dnd-cs-level { display: flex; flex: 0 0 auto; align-items: center; gap: 2px; padding: 1px 5px; border: 1px solid var(--dnd-glass-border); border-radius: 12px 0 0 12px; font-weight: 700; color: var(--ui-text); background: var(--dnd-glass-accent-soft); }
.dnd-cs-level input[type='number'] { width: 34px; min-width: 0; padding: 1px; text-align: center; }
.dnd-cs-xp-bar { position: relative; flex: 1; min-width: 0; border: 1px solid var(--dnd-glass-border); border-left: 0; border-radius: 0 12px 12px 0; overflow: hidden; background: var(--dnd-well); }
.dnd-cs-xp-fill { position: absolute; inset: 0 auto 0 0; background: var(--dnd-glass-accent-soft); transition: width 200ms ease; pointer-events: none; }
.dnd-cs-xp-values { position: relative; display: flex; align-items: center; justify-content: center; height: 100%; gap: 2px; }
.dnd-cs-xp-values input[type='number'] { width: 50%; min-width: 0; max-width: 100px; padding: 1px; text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }
.dnd-cs-xp-values b { flex: 0 0 auto; }
.dnd-cs-xp input[type='number'] { appearance: textfield; -moz-appearance: textfield; }
.dnd-cs-xp input::-webkit-inner-spin-button, .dnd-cs-xp input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }

/* HP progress: dark track, acid-green fill with glow. */
.dnd-cs-hp-bar {
  flex: 1 1 120px; min-width: 90px; height: 7px; border-radius: 999px;
  background: var(--dnd-well); overflow: hidden; border: 1px solid var(--dnd-glass-border);
}
.dnd-cs-hp-bar span {
  display: block; height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--dnd-glass-accent) 70%, #0a7a2e), var(--dnd-glass-accent));
  box-shadow: 0 0 10px var(--dnd-glass-accent-glow);
  transition: width 200ms ease;
}
.dnd-cs-hp-bar { flex: none; height: 8px; }

/* Combat values sit right of identity on desktop and below it on mobile. */
.dnd-cs-combat { display: flex; flex-direction: column; gap: 8px; align-items: stretch; align-self: start; min-width: 0; }
.dnd-cs-combat-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.dnd-cs-combat-stats .dnd-cs-stat { flex-direction: column; justify-content: space-between; gap: 4px; min-width: 0; text-align: center; padding: 5px 0; }
.dnd-cs-combat-stats .dnd-cs-stat span { white-space: normal; overflow-wrap: anywhere; font-size: 9px; line-height: 1.2; letter-spacing: 0; text-transform: none; }
.dnd-cs-combat-stats input[type='number'] { width: 100%; min-width: 0; text-align: center; appearance: textfield; -moz-appearance: textfield; }
.dnd-cs-combat-stats input::-webkit-inner-spin-button, .dnd-cs-combat-stats input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.dnd-cs-initiative { border: 1px solid var(--dnd-glass-border); border-radius: 8px; background: rgba(var(--dnd-fill-rgb), .04); font: inherit; cursor: pointer; transition: background 150ms, border-color 150ms; }
.dnd-cs-initiative:hover, .dnd-cs-initiative:focus-visible { background: var(--dnd-glass-accent-soft); border-color: var(--dnd-glass-accent); }
.dnd-cs-initiative:focus-visible { outline: 2px solid var(--dnd-glass-accent); outline-offset: 2px; }
.dnd-cs-stat { display: flex; align-items: center; gap: 6px; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--dnd-text-dim); }
.dnd-cs-stat span { white-space: nowrap; }
.dnd-cs-stat input { width: 50px; font-size: 14px; font-weight: 700; color: var(--ui-text); text-transform: none; letter-spacing: 0; }
.dnd-cs-stat.readonly-stat strong { color: var(--ui-text); font-size: 16px; font-weight: 800; }
.dnd-cs-hp { gap: 8px; }
.dnd-cs-hp > span:first-child { font-size: 11px; }
.dnd-cs-temp-hp { display:flex; align-items:center; gap:1px; color:var(--dnd-text-dim); font-size:11px; text-transform:none; letter-spacing:0; white-space:nowrap; }
.dnd-cs-hp .dnd-cs-temp-hp input[type='number'] { flex:none; width:34px; padding:2px 0; font-size:14px; appearance:textfield; -moz-appearance:textfield; }
.dnd-cs-temp-hp input::-webkit-inner-spin-button, .dnd-cs-temp-hp input::-webkit-outer-spin-button { -webkit-appearance:none; margin:0; }
.dnd-cs-hp-actions { display:flex; gap:8px; }
.dnd-cs-hp-actions button { flex:1; padding:7px 10px; border:1px solid var(--dnd-glass-border); border-radius:8px; font:inherit; font-size:12px; background:var(--dnd-glass-accent-soft); color:var(--ui-text); cursor:pointer; }
.dnd-cs-hp-actions button:disabled { opacity:.45; cursor:default; }
/* Rests: the same action buttons, one step quieter than heal / damage. */
.dnd-cs-rest-actions button { background: rgba(var(--dnd-fill-rgb), 0.05); color: var(--dnd-text-dim); }
.dnd-cs-rest-actions button:hover:not(:disabled) { background: var(--dnd-glass-accent-soft); color: var(--ui-text); }
/* Death saves: shown only at 0 HP, inside the combat column (no panel of its own). */
.dnd-cs-death { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--dnd-danger) 40%, transparent); border-radius: 12px; background: rgba(var(--dnd-fill-rgb), 0.04); }
.dnd-cs-death-track { display: flex; align-items: center; gap: 2px; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--dnd-text-dim); }
.dnd-cs-death-track > span { margin-right: 4px; }
.dnd-cs-death-track.is-failures .dnd-cs-pip.on { background: var(--dnd-danger); border-color: var(--dnd-danger); box-shadow: 0 0 8px color-mix(in srgb, var(--dnd-danger) 45%, transparent); }
.dnd-cs-death .dnd-cs-pip-btn:disabled { cursor: default; }
.dnd-cs-death-roll { margin-left: auto; color: var(--ui-text); }
.dnd-cs-death-roll:disabled { opacity: .45; cursor: default; }
.dnd-cs-death-result { margin-left: auto; font-size: 13px; font-weight: 800; color: var(--dnd-glass-accent); }
.dnd-cs-death-result.is-dead { color: var(--dnd-danger); }
.dnd-cs-hp input[type='number'] { flex: 1; min-width: 0; width: 58px; font-size: 20px; font-weight: 800; text-align: center; }
.dnd-cs-hp b { color: var(--dnd-text-dim); font-size: 18px; }

/* ===== BODY ===== */
.dnd-cs-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.92fr); gap: 14px; align-items: start; }
.dnd-cs-status-row { display:grid; grid-template-columns:minmax(0,1.3fr) minmax(0,1fr); gap:14px; align-items:stretch; }
.dnd-cs-left { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.dnd-cs-right { min-width: 0; }

/* Abilities + skills */
.dnd-cs-abilities { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.dnd-cs-ability { padding: 10px; }
.dnd-cs-ability-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.dnd-cs-ability-name { font-weight: 800; font-size: 12px; color: var(--ui-text); flex: 1; min-width: 0; overflow-wrap: anywhere; }
.dnd-cs-ability-score { width: 46px !important; flex: 0 0 46px; font-weight: 800; font-size: 18px; text-align: center; padding: 2px; }
/* Check + save roll row under the ability title. */
.dnd-cs-roll-row { display: flex; gap: 6px; margin-bottom: 8px; }
.dnd-cs-save-cell { display: flex; align-items: center; gap: 4px; }
.dnd-cs-roll {
  display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px;
  border: 1px solid var(--dnd-glass-border); border-radius: 999px;
  background: rgba(var(--dnd-fill-rgb), 0.05); color: var(--dnd-text-dim);
  font-size: 11px; cursor: pointer; white-space: nowrap;
  transition: all 140ms ease;
}
.dnd-cs-roll b { color: var(--ui-text); font-size: 12px; font-variant-numeric: tabular-nums; }
.dnd-cs-roll:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--dnd-glass-accent) 55%, transparent);
  color: var(--dnd-glass-accent); background: var(--dnd-glass-accent-soft);
  box-shadow: 0 0 12px var(--dnd-glass-accent-glow);
}
.dnd-cs-roll:hover:not(:disabled) b { color: var(--dnd-glass-accent); }
.dnd-cs-roll:active:not(:disabled) { transform: translateY(1px); }
.dnd-cs-pip-btn { padding: 3px; border: 0; background: transparent; cursor: pointer; display: inline-flex; line-height: 0; }
.dnd-cs-skills { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
.dnd-cs-skills li { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.dnd-cs-skill-roll {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px;
  padding: 3px 8px; border: 1px solid transparent; border-radius: 8px;
  background: transparent; color: var(--dnd-text-dim); cursor: pointer; font: inherit;
  transition: all 130ms ease;
}
.dnd-cs-skill-roll:hover:not(:disabled) { background: var(--dnd-glass-accent-soft); border-color: color-mix(in srgb, var(--dnd-glass-accent) 40%, transparent); color: var(--dnd-glass-accent); }
.dnd-cs-skill-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
.dnd-cs-skill-mod { font-weight: 700; color: var(--ui-text); font-variant-numeric: tabular-nums; }
.dnd-cs-skill-roll:hover:not(:disabled) .dnd-cs-skill-mod { color: var(--dnd-glass-accent); }
.dnd-cs-skill-pip { padding: 0; border: 0; background: transparent; cursor: pointer; display: inline-flex; line-height: 0; }
/* Proficiency ring: idle empty ring, proficient filled green, expertise double ring. */
.dnd-cs-pip { display: inline-block; width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid var(--dnd-glass-border); box-sizing: border-box; transition: all 150ms ease; }
.dnd-cs-pip.on,
.dnd-cs-pip.proficient { background: var(--dnd-glass-accent); border-color: var(--dnd-glass-accent); box-shadow: 0 0 8px var(--dnd-glass-accent-glow); }
.dnd-cs-pip.expertise { background: radial-gradient(circle, transparent 30%, var(--dnd-glass-accent) 34%); border-color: var(--dnd-glass-accent); box-shadow: 0 0 8px var(--dnd-glass-accent-glow); }
.dnd-cs-pip.half { background: var(--dnd-text-dim); border-color: var(--dnd-text-dim); }

/* Proficiencies */
.dnd-cs-proficiencies { padding: 12px; }
.dnd-cs-prof-group, .dnd-cs-prof-list { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 10px; font-size: 12px; }
.dnd-cs-prof-label { flex: 0 0 100%; color: var(--dnd-text-dim); font-size: 10px; letter-spacing: .05em; text-transform: uppercase; }
/* Proficiency options as glass chips. */
.dnd-cs-prof-group label {
  display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px;
  border: 1px solid var(--dnd-glass-border); border-radius: 999px;
  background: rgba(var(--dnd-fill-rgb), 0.03); cursor: pointer; user-select: none;
}
.dnd-cs-prof-group label:has(input:checked) {
  border-color: color-mix(in srgb, var(--dnd-glass-accent) 50%, transparent);
  background: var(--dnd-glass-accent-soft); color: var(--dnd-glass-accent);
}
.dnd-cs-prof-group input { width: auto; accent-color: var(--dnd-glass-accent); }
.dnd-cs-prof-row { display: flex; gap: 4px; width: 100%; }
.dnd-cs-prof-row input { flex: 1; }
.dnd-cs-prof-row button, .dnd-cs-row-remove {
  flex: 0 0 26px; width: 26px; height: 26px; padding: 0;
  border: 1px solid var(--dnd-glass-border); border-radius: 8px;
  background: rgba(var(--dnd-fill-rgb), 0.04); color: var(--dnd-text-dim); cursor: pointer;
  transition: all 150ms ease;
}
.dnd-cs-row-remove:hover { color: var(--dnd-danger); border-color: color-mix(in srgb, var(--dnd-danger) 40%, transparent); }
.dnd-cs-add, .dnd-cs-add-sm {
  align-self: flex-start; padding: 7px 12px; border: 1px dashed var(--dnd-glass-border); border-radius: 12px;
  background: rgba(var(--dnd-fill-rgb), 0.02); color: var(--dnd-text-dim); cursor: pointer; font-size: 12px;
  transition: all 150ms ease;
}
.dnd-cs-add:hover, .dnd-cs-add-sm:hover { border-color: color-mix(in srgb, var(--dnd-glass-accent) 40%, transparent); color: var(--dnd-glass-accent); background: var(--dnd-glass-accent-soft); }
.dnd-cs-add { margin-top: 6px; }

/* ===== TABS ===== */
.dnd-cs-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.dnd-cs-tabs button {
  padding: 7px 14px; border: 1px solid var(--dnd-glass-border); border-radius: 999px;
  background: rgba(var(--dnd-fill-rgb), 0.03); color: var(--dnd-text-dim); cursor: pointer; font-size: 12px;
  transition: all 160ms ease;
}
.dnd-cs-tabs button:hover { color: var(--ui-text); }
.dnd-cs-tabs button.active {
  border-color: color-mix(in srgb, var(--dnd-glass-accent) 55%, transparent);
  color: var(--dnd-glass-accent); background: var(--dnd-glass-accent-soft);
  box-shadow: 0 0 16px var(--dnd-glass-accent-glow), inset 0 1px 0 var(--dnd-glass-highlight);
}
.dnd-cs-tab-panel { padding: 16px; display: flex; flex-direction: column; gap: 8px; min-height: 200px; }

/* Rows */
.dnd-cs-spell-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
.dnd-cs-spell-summary .dnd-cs-roll:disabled { opacity: .45; cursor: default; }
.dnd-cs-spell-prepared { font-size: 12px; color: var(--dnd-text-dim); font-variant-numeric: tabular-nums; }
.dnd-cs-spell-prepared.is-over { color: var(--dnd-danger); font-weight: 700; }
.dnd-cs-spell-level { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 10px; margin-top: 6px; }
.dnd-cs-spell-level .dnd-cs-subheading { margin: 0; }
.dnd-cs-spell-dc { display: inline-flex; align-items: center; min-height: 30px; box-sizing: border-box; padding: 4px 9px; border: 1px solid var(--dnd-glass-border); border-radius: 8px; font-size: 12px; color: var(--dnd-text-dim); font-variant-numeric: tabular-nums; white-space: nowrap; }
.dnd-cs-attack-row, .dnd-cs-spell-row, .dnd-cs-equip-row, .dnd-cs-goal-row { border: 1px solid var(--dnd-glass-border); border-radius: 12px; background: rgba(var(--dnd-fill-rgb), 0.04); padding: 8px; transition: border-color 150ms, background 150ms; }
.dnd-cs-attack-row:hover, .dnd-cs-spell-row:hover, .dnd-cs-equip-row:hover, .dnd-cs-goal-row:hover, .dnd-cs-feature-row:hover { background: rgba(var(--dnd-fill-rgb), 0.06); }
/* Attack card: name row on top, bonus/damage/type wrap below - never overflows. */
.dnd-cs-attack-row { display: flex; flex-direction: column; gap: 6px; }
.dnd-cs-attack-top { display: flex; align-items: center; gap: 6px; }
.dnd-cs-attack-name { flex: 1; min-width: 0; font-weight: 600; }
.dnd-cs-attack-fields { display: flex; flex-wrap: wrap; gap: 6px; }
.dnd-cs-attack-fields input { flex: 1 1 90px; min-width: 0; }
.dnd-cs-spell-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) 52px 30px 26px; gap: 6px; align-items: center; }
.dnd-cs-spell-row > input { width: 100%; min-width: 0; }
.dnd-cs-spell-notes { grid-column: 1 / -1; }
.dnd-cs-equip-row { display: grid; grid-template-columns: 28px minmax(0, 2fr) 60px minmax(0, 2fr) 30px 26px; gap: 6px; align-items: center; }
.dnd-cs-equip-row > input { width: 100%; min-width: 0; }
.dnd-cs-add-row { display: flex; flex-wrap: wrap; gap: 8px; }
.dnd-cs-add-row .dnd-cs-add { flex: 1 1 160px; }
.dnd-cs-weapon-toggle { width: 30px; height: 30px; padding: 0; border: 1px solid var(--dnd-glass-border); border-radius: 8px; background: transparent; color: var(--dnd-text-dim); cursor: pointer; font-size: 14px; }
.dnd-cs-weapon-toggle.on { background: var(--dnd-glass-accent-soft); border-color: var(--dnd-glass-accent); color: var(--ui-text); }
.dnd-cs-weapon-toggle:disabled { cursor: default; }
.dnd-cs-attack-rolls { display: flex; flex-wrap: wrap; gap: 6px; }
.dnd-cs-subheading { margin: 4px 0 0; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--dnd-text-dim); }
.dnd-cs-roll-bar { margin-top: 2px; }
.dnd-cs-goal-row { display: grid; grid-template-columns: 28px 1fr 26px; gap: 6px; align-items: start; }
.dnd-cs-goal-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.dnd-cs-goal-main input.done { text-decoration: line-through; color: var(--dnd-text-dim); }
.dnd-cs-equip-check { display: grid; place-items: center; }
.dnd-cs-equip-check input { accent-color: var(--dnd-glass-accent); }
.dnd-cs-qty { text-align: center; }
.dnd-cs-feature-row { display: flex; flex-direction: column; gap: 4px; padding: 8px; border: 1px solid var(--dnd-glass-border); border-radius: 12px; background: rgba(var(--dnd-fill-rgb), 0.025); }
.dnd-cs-feature-main { display: flex; align-items: center; gap: 6px; }
.dnd-cs-feature-main > input { flex: 1; min-width: 0; font-weight: 600; }
.dnd-cs-uses { display: flex; align-items: center; gap: 4px; white-space: nowrap; font-size: 12px; color: var(--dnd-text-dim); }
.dnd-cs-uses input { width: 40px; }
.dnd-cs-recharge { display: flex; align-items: center; gap: 8px; font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: var(--dnd-text-dim); }
.dnd-cs-recharge select { flex: 0 1 auto; min-width: 0; padding: 5px 7px; border: 1px solid var(--dnd-glass-border); border-radius: 8px; background: rgba(var(--dnd-fill-rgb), 0.045); color: var(--ui-text); font: inherit; font-size: 13px; text-transform: none; letter-spacing: 0; }
.dnd-cs-recharge select:focus { outline: none; border-color: color-mix(in srgb, var(--dnd-glass-accent) 55%, transparent); box-shadow: 0 0 0 3px var(--dnd-glass-accent-soft); }
.dnd-cs-recharge select:disabled { background: transparent; }
/* The popup follows the theme (same as the app's share form): tokens, not a literal. */
.dnd-cs-recharge select option { background: var(--ui-surface-solid); color: var(--ui-text); }
.dnd-cs-freetext { display: flex; flex-direction: column; gap: 5px; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: var(--dnd-text-dim); }
.dnd-cs-notes { min-height: 240px; text-transform: none; }


/* ===== Mobile ===== */
@media (max-width: 760px) {
  .dnd-cs-status-row { grid-template-columns:minmax(0,1fr); }
  .dnd-cs-topcard { padding: 12px; grid-template-columns: minmax(0, 1fr); }
  .dnd-cs-header { grid-template-columns:48px minmax(0,1fr); gap:8px; }
  .dnd-cs-portrait { flex-basis: 48px; width: 48px; height: 48px; border-radius: 14px; font-size: 24px; }
  .dnd-cs-portrait img { border-radius: 13px; }
  .dnd-cs textarea.dnd-cs-name { font-size: 20px; }
  .dnd-cs-name-measure { font-size:20px; }
  .dnd-cs-identity-line.is-multiline { grid-template-columns:minmax(0,1fr) minmax(0,70px); }
  .dnd-cs-subline { font-size: 12px; gap: 2px; }
  .dnd-cs-subline input { padding-inline: 1px; }
  .dnd-cs-body { grid-template-columns: 1fr; }
  .dnd-cs-abilities { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .dnd-cs-ability { padding: 6px; min-width: 0; }
  .dnd-cs-ability-head { gap: 3px; flex-direction:row; align-items:center; }
  .dnd-cs-ability-name { line-height: 1.25; font-size:12px; }
  .dnd-cs-ability-score { width:26px !important; flex:0 0 26px; font-size:14px; appearance:textfield; -moz-appearance:textfield; }
  .dnd-cs-ability-score[type='number'] { padding:2px 0; font-size:14px; font-weight:800; }
  .dnd-cs-ability-score::-webkit-inner-spin-button, .dnd-cs-ability-score::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .dnd-cs-roll-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); align-items:stretch; gap:3px; }
  .dnd-cs-roll { justify-content:center; min-width:0; min-height:32px; padding:8px 3px; gap:2px; font-size:9px; }
  .dnd-cs-roll b { font-size:10px; }
  .dnd-cs-save-cell { position:relative; min-width:0; gap:0; }
  .dnd-cs-save-cell .dnd-cs-pip-btn { position:absolute; left:4px; top:50%; transform:translateY(-50%); z-index:1; padding:2px; }
  .dnd-cs-save-cell .dnd-cs-pip { width:9px; height:9px; }
  .dnd-cs-save-cell .dnd-cs-roll { flex:1; min-width:0; padding-left:16px; }
  .dnd-cs-skills li { gap: 3px; }
  .dnd-cs-skill-roll { padding-inline: 3px; gap: 3px; }
  .dnd-cs-combat { gap: 8px; }
  /* Used every turn at 0 HP / every rest: full touch targets. */
  .dnd-cs-rest-actions button, .dnd-cs-death-roll { min-height: 44px; }
  .dnd-cs-death { justify-content: space-between; }
  .dnd-cs-death-roll { flex: 1 1 100%; justify-content: center; margin-left: 0; font-size: 12px; }
  .dnd-cs-death-result { flex: 1 1 100%; margin-left: 0; text-align: center; }
  .dnd-cs-death .dnd-cs-pip-btn { padding: 8px 5px; }
  .dnd-cs-death .dnd-cs-pip { width: 14px; height: 14px; }
  /* Spell slots are spent every turn: full touch targets. */
  .dnd-cs-spell-level .dnd-cs-hp-btn { width: 44px; height: 44px; flex-basis: 44px; }
  .dnd-cs-spell-summary .dnd-cs-roll { min-height: 44px; padding-inline: 12px; font-size: 12px; }
  .dnd-cs-spell-summary .dnd-cs-roll b { font-size: 12px; }
  /* Room for the spell's name: narrower side columns, slightly smaller text. */
  .dnd-cs-spell-row { grid-template-columns: 22px minmax(0, 1fr) 30px 30px 26px; gap: 4px; }
  .dnd-cs-spell-row > input:not(.dnd-cs-spell-notes) { font-size: 14px; padding-inline: 3px; }
  .dnd-cs-spell-row > .dnd-cs-qty { appearance: textfield; -moz-appearance: textfield; }
  .dnd-cs-spell-row > .dnd-cs-qty::-webkit-inner-spin-button, .dnd-cs-spell-row > .dnd-cs-qty::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .dnd-cs-stat input { width: 46px; }
  .dnd-cs-attack-head { display: none; }
  .dnd-cs-attack-row { grid-template-columns: 1fr 1fr; }
  .dnd-cs-attack-row .dnd-cs-row-remove { grid-column: 2; justify-self: end; }
  .dnd-cs-equip-row { grid-template-columns: 28px minmax(0, 1fr) 52px 30px 26px; }
  .dnd-cs-equip-row input[aria-label='Заметки'] { grid-column: 2 / -1; grid-row: 2; }
}
</style>

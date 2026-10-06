#!/usr/bin/env python3
"""Builds src/dnd/spellCatalog.data.ts from the SRD 5.1 spell list.

Mechanics (level, school, casting time, range, components, duration, classes,
damage, saving throw) come from the open dataset 5e-bits/5e-database (MIT),
which carries the SRD 5.1 content (CC-BY-4.0). Russian names and the one-line
summaries come from ru.txt next to this script. No SRD description text is
copied: only the mechanics.

Usage:
  curl -o /tmp/spells.json \\
    https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2014/en/5e-SRD-Spells.json
  python3 -I scripts/spell-catalog/build.py /tmp/spells.json
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'src', 'dnd', 'spellCatalog.data.ts')

SCHOOLS = {
    'abjuration': 'Ограждение', 'conjuration': 'Вызов', 'divination': 'Прорицание', 'enchantment': 'Очарование',
    'evocation': 'Воплощение', 'illusion': 'Иллюзия', 'necromancy': 'Некромантия', 'transmutation': 'Преобразование',
}
TIMES = {
    '1 action': '1 действие', '1 bonus action': '1 бонусное действие', '1 reaction': '1 реакция',
    '1 minute': '1 минута', '10 minutes': '10 минут', '1 hour': '1 час', '8 hours': '8 часов',
    '12 hours': '12 часов', '24 hours': '24 часа',
}
RANGES = {
    'Touch': 'Касание', 'Self': 'На себя', 'Sight': 'В пределах видимости', 'Special': 'Особая',
    'Unlimited': 'Неограниченная', '1 mile': '1 миля', '500 miles': '500 миль',
}
AREAS = {'cone': 'конус', 'sphere': 'сфера', 'cube': 'куб', 'line': 'линия', 'cylinder': 'цилиндр'}
# (nominative, genitive after "до")
DURATIONS = {
    'Instantaneous': ('Мгновенная', ''), 'Until dispelled': ('Пока не рассеется', ''), 'Special': ('Особая', ''),
    '1 round': ('1 раунд', '1 раунда'), '1 minute': ('1 минута', '1 минуты'), '10 minutes': ('10 минут', '10 минут'),
    '1 hour': ('1 час', '1 часа'), '2 hours': ('2 часа', '2 часов'), '8 hours': ('8 часов', '8 часов'),
    '24 hours': ('24 часа', '24 часов'), '7 days': ('7 дней', '7 дней'), '10 days': ('10 дней', '10 дней'),
    '30 days': ('30 дней', '30 дней'),
}
COMPONENTS = {'V': 'В', 'S': 'С', 'M': 'М'}
DAMAGE_TYPES = {
    'acid': 'кислота', 'bludgeoning': 'дробящий', 'cold': 'холод', 'fire': 'огонь', 'force': 'силовое поле',
    'lightning': 'электричество', 'necrotic': 'некротическая энергия', 'piercing': 'колющий', 'poison': 'яд',
    'psychic': 'психическая энергия', 'radiant': 'излучение', 'slashing': 'рубящий', 'thunder': 'звук',
}
ABILITIES = {'str': 'strength', 'dex': 'dexterity', 'con': 'constitution', 'int': 'intelligence', 'wis': 'wisdom', 'cha': 'charisma'}
CLASSES = ['bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard']


def read_ru():
    table = {}
    for line in open(os.path.join(HERE, 'ru.txt'), encoding='utf-8'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        key, name, summary = [part.strip() for part in line.split(' | ')]
        assert key not in table, f'duplicate {key}'
        table[key] = (name, summary)
    return table


def formula(value):
    """'8d6' / '1d8 + MOD' / '1d4 + 1' / '2d8 OR 2d12' -> a formula the sheet can roll."""
    value = value.split(' OR ')[0].strip()
    value = re.sub(r'\s*\+\s*', '+', value)
    assert re.fullmatch(r'\d+(d\d+)?(\+(\d+|MOD))?', value), value
    return value


def feet(text):
    match = re.fullmatch(r'(\d+) feet', text)
    return f'{match.group(1)} футов' if match else None


def build(spell, ru):
    name, summary = ru[spell['index']]
    level = spell['level']
    entry = {'key': spell['index'], 'name': name, 'en': spell['name'], 'level': level, 'school': SCHOOLS[spell['school']['index']]}
    entry['time'] = TIMES[spell['casting_time']]
    distance = RANGES.get(spell['range']) or feet(spell['range'])
    assert distance, spell['range']
    area = spell.get('area_of_effect')
    if area and spell['range'] == 'Self':
        distance += f" ({AREAS[area['type']]} {area['size']} футов)"
    entry['range'] = distance
    entry['components'] = ', '.join(COMPONENTS[c] for c in spell['components'])
    duration = spell['duration']
    concentration = bool(spell.get('concentration'))
    if duration.startswith('Up to '):
        entry['duration'] = 'Концентрация, до ' + DURATIONS[duration[len('Up to '):]][1]
    else:
        entry['duration'] = DURATIONS[duration][0]
    if concentration:
        entry['concentration'] = True
    if spell.get('ritual'):
        entry['ritual'] = True
    entry['classes'] = [c for c in CLASSES if any(item['index'] == c for item in spell['classes'])]
    assert entry['classes'], spell['index']

    if spell.get('attack_type'):
        entry['rollKind'] = 'attack'
    elif spell.get('dc'):
        entry['rollKind'] = 'save'
        entry['saveAbility'] = ABILITIES[spell['dc']['dc_type']['index']]

    damage = spell.get('damage') or []
    if isinstance(damage, dict):
        damage = [damage]
    parts, types, scale = [], [], None
    for item in damage:
        by_slot = item.get('damage_at_slot_level')
        by_level = item.get('damage_at_character_level')
        if by_slot and str(level) in by_slot:
            parts.append(formula(by_slot[str(level)]))
        elif by_level:
            scale = {int(k): formula(v) for k, v in by_level.items()}
            parts.append(scale[min(scale)])
        else:
            continue
        kind = (item.get('damage_type') or {}).get('index')
        if kind:
            types.append(DAMAGE_TYPES[kind])
    if parts:
        entry['damage'] = '+'.join(parts)
        if scale and len(scale) > 1:
            entry['scale'] = scale
        if types:
            entry['damageType'] = ' и '.join(dict.fromkeys(types))
    heal = spell.get('heal_at_slot_level')
    if heal and str(level) in heal and not parts:
        entry['damage'] = formula(heal[str(level)])
        entry['heal'] = True
    entry['summary'] = summary
    return entry


def ts(value):
    if isinstance(value, dict):
        return '{ ' + ', '.join(f'{k}: {ts(v)}' for k, v in value.items()) + ' }'
    if isinstance(value, list):
        return '[' + ', '.join(ts(v) for v in value) + ']'
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, int):
        return str(value)
    return "'" + value.replace('\\', '\\\\').replace("'", "\\'") + "'"


def main():
    spells = json.load(open(sys.argv[1], encoding='utf-8'))
    ru = read_ru()
    keys = {spell['index'] for spell in spells}
    assert keys == set(ru), (sorted(keys - set(ru)), sorted(set(ru) - keys))
    entries = [build(spell, ru) for spell in spells]
    entries.sort(key=lambda e: (e['level'], e['name']))
    lines = [
        '// Generated by scripts/spell-catalog/build.py - do not edit by hand.',
        '//',
        '// This work includes material taken from the System Reference Document 5.1',
        '// ("SRD 5.1") by Wizards of the Coast LLC and available at',
        '// https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is',
        '// licensed under the Creative Commons Attribution 4.0 International License',
        '// available at https://creativecommons.org/licenses/by/4.0/legalcode.',
        '//',
        '// Mechanics only (taken via the MIT-licensed 5e-bits/5e-database); the Russian',
        '// names and one-line summaries are this project\'s own.',
        "import type { CatalogSpell } from './spellCatalog';",
        '',
        'export const SPELL_CATALOG: CatalogSpell[] = [',
    ]
    lines += [f'  {ts(entry)},' for entry in entries]
    lines += ['];', '']
    with open(OUT, 'w', encoding='utf-8') as out:
        out.write('\n'.join(lines))
    print(len(entries), 'spells ->', os.path.relpath(OUT))


if __name__ == '__main__':
    main()

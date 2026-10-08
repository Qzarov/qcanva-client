import { DND_ABILITIES, DND_SKILLS, FEATURE_RECHARGE_OPTIONS } from './characterSheet';
import { conditionLabel } from './conditions';
import { COINS } from './coins';
import { spellcasterClass } from './spellCatalog';
import type { SheetHistoryEntry } from '../api/client';

/**
 * The history's text: one line per change, in words a player reads at the
 * table ("HP 27 → 19 (урон 8)", "Класс: Жрец → Волшебник", "Добавлено
 * заклинание: Огненный шар"), from the operation and its target before and
 * after (as the server stored them).
 */
type Op = Record<string, any>;

const LIST_NOUN: Record<string, [added: string, removed: string, noun: string]> = {
  attacks: ['Добавлена атака', 'Удалена атака', 'Атака'],
  features: ['Добавлено умение', 'Удалено умение', 'Умение'],
  equipment: ['Добавлен предмет', 'Удалён предмет', 'Предмет'],
  spells: ['Добавлено заклинание', 'Удалено заклинание', 'Заклинание'],
  goals: ['Добавлена цель', 'Удалена цель', 'Цель'],
};

const ITEM_FIELD: Record<string, string> = {
  name: 'название', description: 'описание', level: 'уровень', maxUses: 'максимум зарядов',
  currentUses: 'заряды', recharge: 'восстановление', quantity: 'количество', equipped: 'экипировано',
  prepared: 'подготовлено', completed: 'выполнено', attackBonus: 'бонус атаки', damage: 'урон',
  damageType: 'тип урона', weapon: 'параметры оружия',
};

const SKILL_PROFICIENCY: Record<string, string> = { none: 'нет', half: 'половина', proficient: 'владение', expertise: 'компетентность' };
const ability = (key: string) => DND_ABILITIES.find((entry) => entry.key === key)?.label ?? key;

function fieldLabel(path: string[]): string | null {
  const [root, a, b, c] = path;
  const key = path.join('.');
  const simple: Record<string, string> = {
    'identity.name': 'Имя', 'identity.race': 'Раса', 'identity.className': 'Класс', 'identity.subclass': 'Подкласс',
    'identity.level': 'Уровень', 'identity.portraitUrl': 'Портрет', 'identity.experience': 'Опыт',
    'identity.nextLevelExperience': 'Опыт до уровня', 'identity.background': 'Предыстория', 'identity.alignment': 'Мировоззрение',
    'combat.armorClass': 'КД', 'combat.speed': 'Скорость', 'combat.hitDie': 'Кость хитов', 'combat.currentHp': 'HP',
    'combat.maxHp': 'Максимум HP', 'combat.temporaryHp': 'Временные HP', 'combat.inspiration': 'Вдохновение',
    'combat.exhaustion': 'Истощение', 'combat.initiativeMode': 'Инициатива', 'combat.customInitiativeBonus': 'Бонус инициативы',
    'spellcasting.casterClass': 'Заклинательный класс', 'spellcasting.ability': 'Заклинательная характеристика',
    'proficiencies.languages': 'Языки и прочее', 'proficiencies.tools': 'Инструменты', 'proficiencies.other': 'Прочие владения',
    notes: 'Заметки', attacksNotes: 'Заметки об атаках', 'campaign.canvasId': 'Доска для бросков',
    'personality.traits': 'Черты характера', 'personality.ideals': 'Идеалы', 'personality.bonds': 'Привязанности', 'personality.flaws': 'Слабости',
  };
  if (simple[key]) return simple[key]!;
  if (root === 'abilities' && b === 'score') return ability(a!);
  if (root === 'abilities' && b === 'savingThrowProficient') return `Владение спасброском: ${ability(a!)}`;
  if (root === 'skills') return `Навык: ${DND_SKILLS.find((skill) => skill.key === a)?.label ?? a}`;
  if (root === 'spellcasting' && a === 'slots' && c === 'max') return `Ячейки ${b!.slice(1)} уровня`;
  if (root === 'spellcasting' && a === 'slots' && c === 'spent') return `Потрачено ячеек ${b!.slice(1)} уровня`;
  if (root === 'passiveBonuses') return 'Бонус пассивной характеристики';
  if (root === 'coins') return a ? `${COINS.find((coin) => coin.key === a)?.label ?? a} монеты` : 'Монеты';
  return null;
}

function show(value: unknown, path?: string[]): string {
  const key = path?.join('.');
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'да' : 'нет';
  if (key === 'spellcasting.casterClass' && typeof value === 'string') return spellcasterClass(value)?.label ?? value;
  if (key === 'spellcasting.ability' && typeof value === 'string') return ability(value);
  if (key === 'combat.hitDie' && typeof value === 'number') return `к${value}`;
  if (path?.[0] === 'skills' && typeof value === 'object') return SKILL_PROFICIENCY[(value as { proficiency?: string }).proficiency ?? 'none'] ?? '—';
  if (path?.[0] === 'skills' && typeof value === 'string') return SKILL_PROFICIENCY[value] ?? value;
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === 'string' && entry.trim()).join(', ') || '—';
  if (typeof value === 'object') return 'изменено';
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

const quoted = (name: unknown) => (typeof name === 'string' && name.trim() ? `«${name.trim()}»` : '');

function describeOp(op: Op, before: any, after: any): string | null {
  switch (op.type) {
    case 'set': {
      const label = fieldLabel(op.path) ?? op.path.join('.');
      if (op.path.join('.') === 'identity.portraitUrl') return after ? 'Новый портрет' : 'Портрет удалён';
      if (['notes', 'attacksNotes'].includes(op.path[0]) || op.path[0] === 'personality') return `${label}: изменено`;
      return `${label}: ${show(before, op.path)} → ${show(after, op.path)}`;
    }
    case 'set-add':
    case 'set-remove': {
      const sign = op.type === 'set-add' ? '+' : '−';
      if (op.path.join('.') === 'combat.conditions') return `Состояние: ${sign} ${conditionLabel(op.value)}`;
      const group = op.path[1] === 'armor' ? 'доспехами' : op.path[1] === 'weapons' ? 'оружием' : '';
      return `Владение ${group}: ${sign} ${op.value}`.replace('Владение : ', 'Владение: ');
    }
    case 'list-add':
      return `${LIST_NOUN[op.list]?.[0] ?? 'Добавлено'}: ${show(op.item?.name) === '—' ? 'без названия' : show(op.item?.name)}`;
    case 'list-remove':
      return `${LIST_NOUN[op.list]?.[1] ?? 'Удалено'}: ${before?.name ? show(before.name) : 'без названия'}`;
    case 'list-update': {
      const noun = LIST_NOUN[op.list]?.[2] ?? 'Строка';
      const changes = Object.keys(op.changes ?? {}).map((key) => {
        const field = ITEM_FIELD[key] ?? key;
        if (key === 'description' || key === 'weapon') return `${field} изменено`;
        if (key === 'recharge') return `${field}: ${FEATURE_RECHARGE_OPTIONS.find((o) => o.value === (before?.[key] ?? ''))?.label ?? '—'} → ${FEATURE_RECHARGE_OPTIONS.find((o) => o.value === (after?.[key] ?? ''))?.label ?? '—'}`;
        return `${field}: ${show(before?.[key])} → ${show(after?.[key])}`;
      });
      const name = after?.name ?? before?.name;
      return `${noun}${name && !('name' in (op.changes ?? {})) ? ` ${quoted(name)}` : ''}: ${changes.join(', ')}`;
    }
    case 'hp-change': {
      const word = op.mode === 'heal' ? 'лечение' : 'урон';
      return `HP ${show(before?.currentHp)} → ${show(after?.currentHp)} (${word} ${op.amount})`;
    }
    case 'uses-change':
      return `${quoted(after?.name ?? before?.name) || 'Умение'}: заряды ${show(before?.currentUses)} → ${show(after?.currentUses)}`;
    case 'slot-change':
      return `Ячейки ${op.level} уровня: ${op.delta > 0 ? 'потрачена' : 'возвращена'} (потрачено ${show(before?.spent)} → ${show(after?.spent)})`;
    case 'rest':
      return op.kind === 'long' ? 'Длинный отдых' : 'Короткий отдых';
    case 'hit-die':
      return `Кость хитов: HP ${show(before?.currentHp)} → ${show(after?.currentHp)}`;
    case 'death-save':
      return `Спасбросок от смерти: ${({ success: 'успех', failure: 'провал', 'critical-success': '20 — встаёт с 1 HP', 'critical-failure': '1 — два провала' } as Record<string, string>)[op.outcome] ?? op.outcome}`;
    case 'replace':
      return 'Лист перезаписан целиком (старая версия приложения)';
    default:
      return null;
  }
}

export const HISTORY_NOTE_LABEL: Record<string, string> = {
  undo: 'Отмена', redo: 'Возврат', restore: 'Восстановление настройки', replace: 'Перезапись',
};

/** The lines of one history entry (one user action). */
export function describeHistoryEntry(entry: Pick<SheetHistoryEntry, 'ops'>): string[] {
  const lines = entry.ops
    .map(({ op, before, after }) => describeOp((op ?? {}) as Op, before, after))
    .filter((line): line is string => Boolean(line));
  return lines.length ? [...new Set(lines)] : ['Изменение листа'];
}

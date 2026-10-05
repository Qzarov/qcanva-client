// Standard 5e condition names. These are manual markers, not roll automation.
// https://www.dndbeyond.com/sources/dnd/basic-rules-2014/appendix-a-conditions
export const DND_CONDITIONS = [
  { key: 'unconscious', label: 'Без сознания' },
  { key: 'incapacitated', label: 'Недееспособен' },
  { key: 'deafened', label: 'Оглохший' },
  { key: 'stunned', label: 'Ошеломлён' },
  { key: 'frightened', label: 'Испуган' },
  { key: 'exhaustion', label: 'Истощение' },
  { key: 'invisible', label: 'Невидимый' },
  { key: 'petrified', label: 'Окаменевший' },
  { key: 'blinded', label: 'Ослеплён' },
  { key: 'poisoned', label: 'Отравлен' },
  { key: 'charmed', label: 'Очарован' },
  { key: 'paralyzed', label: 'Парализован' },
  { key: 'prone', label: 'Сбит с ног' },
  { key: 'restrained', label: 'Опутан' },
  { key: 'grappled', label: 'Схвачен' },
] as const;

export const conditionLabel = (key: string) => DND_CONDITIONS.find(condition => condition.key === key)?.label ?? key;

import type { BillingPlans, PlanLimits } from '../../api/billing';

/** The admin's plans form: money in roubles and storage in megabytes; the server keeps kopecks and bytes. */
export type FormLimits = Record<keyof PlanLimits, number>;
export type PlansForm = { priceMonth: number; priceYear: number; graceDays: number; free: FormLimits; pro: FormLimits };

const MB = 1024 * 1024;
const whole = (value: unknown) => Math.max(0, Math.trunc(Number(value) || 0));

export const LIMIT_ROWS: Array<{ key: keyof PlanLimits; label: string }> = [
  { key: 'resources', label: 'Канвасы, документы и листы' },
  { key: 'storageBytes', label: 'Место под файлы, МБ' },
  { key: 'collaborators', label: 'Соавторы' },
  { key: 'mcpPerDay', label: 'Вызовы MCP в сутки' },
];

const toFormLimits = (limits: PlanLimits): FormLimits => ({ ...limits, storageBytes: Math.round(limits.storageBytes / MB) });
const fromFormLimits = (limits: FormLimits): PlanLimits => ({
  resources: whole(limits.resources),
  storageBytes: whole(limits.storageBytes) * MB,
  collaborators: whole(limits.collaborators),
  mcpPerDay: whole(limits.mcpPerDay),
});

export const toPlansForm = (plans: BillingPlans): PlansForm => ({
  priceMonth: plans.prices.month / 100,
  priceYear: plans.prices.year / 100,
  graceDays: plans.graceDays,
  free: toFormLimits(plans.free),
  pro: toFormLimits(plans.pro),
});

export const fromPlansForm = (form: PlansForm): BillingPlans => ({
  prices: {
    month: Math.round(Math.max(0, Number(form.priceMonth) || 0) * 100),
    year: Math.round(Math.max(0, Number(form.priceYear) || 0) * 100),
  },
  graceDays: Math.min(30, whole(form.graceDays)),
  free: fromFormLimits(form.free),
  pro: fromFormLimits(form.pro),
});

export { whole };

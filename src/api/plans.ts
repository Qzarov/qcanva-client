import { adminRequest } from './admin';
import { useI18n } from '../composables/useI18n';

export type PlanPeriod = 'month' | 'year';

export interface Plan {
  id: string;
  name: string;
  description: string;
  /** Kopecks. */
  priceCents: number;
  period: PlanPeriod;
  /** null: no limit. */
  maxResources: number | null;
  /** null: no limit. */
  maxStorageBytes: number | null;
  canCreateSpaces: boolean;
  isDefault: boolean;
  archived: boolean;
}

export type PlanInput = Pick<Plan, 'name' | 'description' | 'priceCents' | 'period' | 'maxResources' | 'maxStorageBytes' | 'canCreateSpaces'>;

export type GrantStatus = 'active' | 'suspended' | 'revoked' | 'replaced' | 'expired';
export type GrantAction = 'granted' | 'suspended' | 'resumed' | 'revoked' | 'replaced';

export interface PlanGrant {
  id: string;
  planId: string;
  planName: string;
  status: GrantStatus;
  priceCents: number;
  period: PlanPeriod;
  startsAt: string;
  endsAt: string | null;
  events: Array<{ action: GrantAction; actorName: string | null; note: string; at: string }>;
}

export interface UserPlanInfo {
  plan: (Plan & { grantId: string | null; endsAt: string | null }) | null;
  usage: { resources: number; storageBytes: number };
  history: PlanGrant[];
}

export interface PlanAssignment {
  userId: string;
  planId: string;
  planName: string;
  isDefault: boolean;
  endsAt: string | null;
}

export interface AnalyticsPerson {
  userId: string;
  email: string;
  name: string;
  planName: string;
  maxResources: number | null;
  maxStorageBytes: number | null;
  resources: number;
  storageBytes: number;
}

export interface PlanAnalytics {
  days: number;
  users: { total: number; active7: number; active30: number; signups: Array<{ day: string; count: number }> };
  plans: Array<{ planId: string; name: string; users: number; payingUsers: number; monthlyCents: number; storageBytes: number; resources: number }>;
  revenue: { monthlyCents: number; series: Array<{ day: string; monthlyCents: number }> };
  usage: { storageBytes: number; resources: number; topByStorage: AnalyticsPerson[]; topByResources: AnalyticsPerson[]; atLimit: AnalyticsPerson[]; atLimitCount: number };
  content: { series: Array<{ day: string; canvases: number; documents: number; html: number; templates: number; files: number; spaces: number }> };
}

const json = (body: unknown) => ({ body: JSON.stringify(body) });

export const plansApi = {
  list: () => adminRequest<Array<Plan & { users: number }>>('/admin/plans'),
  create: (input: PlanInput) => adminRequest<Plan>('/admin/plans', { method: 'POST', ...json(input) }),
  update: (id: string, input: PlanInput) => adminRequest<Plan>(`/admin/plans/${id}`, { method: 'PATCH', ...json(input) }),
  setArchived: (id: string, archived: boolean) => adminRequest<Plan>(`/admin/plans/${id}/archive`, { method: 'POST', ...json({ archived }) }),
  setDefault: (id: string) => adminRequest<Plan>(`/admin/plans/${id}/default`, { method: 'POST' }),
  assignments: () => adminRequest<PlanAssignment[]>('/admin/plan-assignments'),
  ofUser: (userId: string) => adminRequest<UserPlanInfo>(`/admin/users/${userId}/plans`),
  grant: (userId: string, input: { planId: string; endsAt?: string | null; note?: string }) =>
    adminRequest<PlanGrant>(`/admin/users/${userId}/plans`, { method: 'POST', ...json(input) }),
  act: (grantId: string, action: 'suspend' | 'resume' | 'revoke', note = '') =>
    adminRequest<PlanGrant>(`/admin/user-plans/${grantId}/${action}`, { method: 'POST', ...json({ note }) }),
  analytics: (days: number) => adminRequest<PlanAnalytics>(`/admin/analytics?days=${days}`),
  mine: () => adminRequest<UserPlanInfo>('/me/plan'),
};

/** A price as people read it: "500 ₽", "1 250,50 ₽". */
export function formatPrice(cents: number): string {
  const { locale } = useI18n();
  const value = cents / 100;
  return `${value.toLocaleString(locale.value === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 2 })} ₽`;
}

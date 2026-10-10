import { apiRequest } from './client';

export type BillingPeriod = 'month' | 'year';
export type PlanLimits = { resources: number; storageBytes: number; collaborators: number; mcpPerDay: number };
export type BillingPlans = { prices: Record<BillingPeriod, number>; graceDays: number; free: PlanLimits; pro: PlanLimits };

export type BillingStatus = {
  enabled: boolean;
  plan: 'free' | 'pro' | 'unlimited';
  limits: PlanLimits;
  usage: { resources: number; storageBytes: number; collaborators: number; mcpToday: number } | null;
  /** Kopecks. */
  prices: Record<BillingPeriod, number>;
  /** The terminal is set up: payments can be taken. */
  canPay: boolean;
  subscription: null | {
    status: 'active' | 'past_due' | 'canceled' | 'expired';
    period: BillingPeriod;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    source: 'tbank' | 'manual';
    renews: boolean;
  };
};

export type AdminSubscription = {
  userId: string; email: string | null; name: string | null;
  status: string; period: BillingPeriod; source: string; currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean; renews: boolean; failedAttempts: number; active: boolean;
};
export type AdminPayment = {
  id: string; orderId: string; userId: string; amount: number; period: BillingPeriod; kind: string;
  status: string; providerStatus: string | null; errorCode: string | null; createdAt: string;
};

export const billing = {
  config: () => apiRequest<{ enabled: boolean; prices?: Record<BillingPeriod, number>; free?: PlanLimits; pro?: PlanLimits }>('/billing/config'),
  me: () => apiRequest<BillingStatus>('/billing/me'),
  checkout: (period: BillingPeriod, consent: boolean) =>
    apiRequest<{ paymentUrl: string }>('/billing/checkout', { method: 'POST', body: JSON.stringify({ period, consent }) }),
  cancel: () => apiRequest<BillingStatus>('/billing/cancel', { method: 'POST' }),
  resume: () => apiRequest<BillingStatus>('/billing/resume', { method: 'POST' }),
};

export const adminBilling = {
  plans: () => apiRequest<{ plans: BillingPlans; defaults: BillingPlans }>('/admin/billing/plans'),
  savePlans: (plans: BillingPlans) =>
    apiRequest<{ plans: BillingPlans; defaults: BillingPlans }>('/admin/billing/plans', { method: 'PUT', body: JSON.stringify(plans) }),
  resetPlans: () => apiRequest<{ plans: BillingPlans; defaults: BillingPlans }>('/admin/billing/plans/reset', { method: 'POST' }),
  subscriptions: () => apiRequest<AdminSubscription[]>('/admin/billing/subscriptions'),
  payments: () => apiRequest<AdminPayment[]>('/admin/billing/payments'),
  grant: (email: string, days: number) =>
    apiRequest<{ userId: string; currentPeriodEnd: string }>('/admin/billing/grant', { method: 'POST', body: JSON.stringify({ email, days }) }),
  revoke: (userId: string) => apiRequest<{ revoked: boolean }>(`/admin/billing/subscriptions/${encodeURIComponent(userId)}/revoke`, { method: 'POST' }),
};

const MB = 1024 * 1024;
/** "299 ₽", "2 990 ₽". */
export const formatRub = (kopecks: number) =>
  `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(kopecks / 100)} ₽`;
export const formatMb = (bytes: number) => (bytes >= 1024 * MB ? `${+(bytes / 1024 / MB).toFixed(1)} ГБ` : `${Math.round(bytes / MB)} МБ`);

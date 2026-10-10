import { Capacitor } from '@capacitor/core';
import { ref } from 'vue';
import type { Router } from 'vue-router';
import { billing } from '../api/billing';
import { onPlanLimit, type PlanLimitBody } from '../api/planLimit';
import { alertDialog, confirmDialog } from './appDialog';

/**
 * Whether billing is on (asked once per session; off on any error, so a
 * missing endpoint simply hides everything about plans).
 */
const enabled = ref(false);
let asked: Promise<boolean> | null = null;

export function loadBillingEnabled(): Promise<boolean> {
  asked ??= Promise.resolve()
    .then(() => billing.config())
    .then((config) => (enabled.value = Boolean(config.enabled)), () => (enabled.value = false));
  return asked;
}

export function useBillingEnabled() {
  void loadBillingEnabled();
  return enabled;
}

/**
 * The Android app shows the plan but sells nothing: no prices, no payment
 * buttons and no links to them (Google Play's rules for digital goods).
 */
export const canBuyHere = () => !Capacitor.isNativePlatform();

const LIMIT_TEXT: Record<PlanLimitBody['limit'], string> = {
  resources: 'Бесплатный тариф позволяет до {max} канвасов, документов и листов. Чтобы создать новый, удалите ненужный или перейдите на Pro.',
  storage: 'Место под файлы на вашем тарифе закончилось.',
  collaborators: 'На бесплатном тарифе доступ можно дать не больше чем {max} людям.',
  mcp: 'На сегодня вызовы MCP на вашем тарифе закончились (до {max} в сутки).',
};

let showing = false;

/** Installed once at start-up: one dialog per refusal, never a stack of them. */
export function installPlanLimitDialog(router: Router) {
  onPlanLimit(async (body) => {
    if (showing) return;
    showing = true;
    try {
      const message = LIMIT_TEXT[body.limit]?.replace('{max}', String(body.max)) ?? body.message;
      if (canBuyHere()) {
        const go = await confirmDialog({ title: 'Лимит тарифа', message, confirmLabel: 'Посмотреть тарифы', cancelLabel: 'Закрыть' });
        if (go) await router.push({ name: 'billing' });
      } else {
        await alertDialog({ title: 'Лимит тарифа', message });
      }
    } finally {
      showing = false;
    }
  });
}

/** Tests only. */
export function resetBillingForTests() {
  asked = null;
  enabled.value = false;
  showing = false;
}

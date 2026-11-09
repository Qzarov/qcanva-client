import { useI18n } from '../composables/useI18n';

/** What the hub says when a plan stops something, in the reader's language; null for anything else. */
export function planErrorText(body: unknown): string | null {
  const code = (body as { code?: unknown } | null | undefined)?.code;
  const { t } = useI18n();
  if (code === 'plan_resource_limit') return t('planErrorResources');
  if (code === 'plan_storage_limit') return t('planErrorStorage');
  if (code === 'plan_spaces_forbidden') return t('planErrorSpaces');
  return null;
}

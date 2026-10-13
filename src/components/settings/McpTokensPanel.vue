<template>
  <div class="mcp-panel">
    <section class="mcp-endpoint">
      <span class="mcp-label">{{ t('mcpEndpoint') }}</span>
      <code data-mcp-endpoint>{{ endpoint }}</code>
      <button v-if="!form && !issued" type="button" class="btn-primary" data-mcp-issue-open @click="openForm">
        <Plus :size="16" aria-hidden="true" />{{ t('mcpIssueToken') }}
      </button>
    </section>

    <!-- The token itself: shown once, right after issuing. -->
    <section v-if="issued" class="mcp-card mcp-issued" data-mcp-issued>
      <h2>{{ issued.record.name }}</h2>
      <p class="mcp-warning">{{ t('mcpShownOnce') }}</p>
      <div class="mcp-secret">
        <code data-mcp-secret>{{ issued.token }}</code>
        <button type="button" class="btn-primary" data-mcp-copy-token @click="copy(issued.token)">
          <Copy :size="16" aria-hidden="true" />{{ t('mcpCopyToken') }}
        </button>
      </div>
      <span class="mcp-label">{{ t('mcpClientConfig') }}</span>
      <pre class="mcp-config" data-mcp-config>{{ clientConfig(issued.token) }}</pre>
      <div class="mcp-row-actions">
        <button type="button" class="btn-ghost" @click="copy(clientConfig(issued.token))">
          <Copy :size="16" aria-hidden="true" />{{ t('mcpCopyConfig') }}
        </button>
        <button type="button" class="btn-primary" data-mcp-issued-done @click="issued = null">{{ t('mcpDone') }}</button>
      </div>
    </section>

    <form v-if="form" class="mcp-card mcp-form" data-mcp-form @submit.prevent="issue">
      <h2>{{ t('mcpIssueToken') }}</h2>

      <label class="mcp-field">
        <span class="mcp-label">{{ t('mcpTokenName') }}</span>
        <input v-model="form.name" class="dashboard-modal-input" maxlength="80" :placeholder="t('mcpTokenNamePlaceholder')" data-mcp-name required />
      </label>

      <fieldset class="mcp-field">
        <legend class="mcp-label">{{ t('mcpActions') }}</legend>
        <label v-for="action in ACTIONS" :key="action.key" class="mcp-check">
          <input
            type="checkbox"
            :checked="action.key === 'read' || form.actions.includes(action.key)"
            :disabled="action.key === 'read'"
            :data-mcp-action="action.key"
            @change="toggleAction(action.key)"
          />
          <span>{{ t(action.label) }}</span>
          <small v-if="action.hint">{{ t(action.hint) }}</small>
        </label>
      </fieldset>

      <fieldset class="mcp-field">
        <legend class="mcp-label">{{ t('mcpScope') }}</legend>
        <label class="mcp-check">
          <input v-model="form.scopeKind" type="radio" value="all" data-mcp-scope="all" />
          <span>{{ t('mcpScopeAll') }}</span>
        </label>
        <label class="mcp-check">
          <input v-model="form.scopeKind" type="radio" value="limited" data-mcp-scope="limited" />
          <span>{{ t('mcpScopeLimited') }}</span>
        </label>
        <div v-if="form.scopeKind === 'limited'" class="mcp-scope-picker">
          <div class="mcp-scope-column">
            <span class="mcp-label">{{ t('mcpScopeFolders') }}</span>
            <small class="mcp-hint">{{ t('mcpScopeFoldersHint') }}</small>
            <div class="mcp-pick-list">
              <label v-for="folder in folderRows" :key="folder.id" class="mcp-check" :style="{ paddingLeft: `${folder.depth * 18}px` }">
                <input type="checkbox" :checked="form.folders.includes(folder.id)" :data-mcp-folder="folder.id" @change="toggle(form.folders, folder.id)" />
                <FolderIcon :size="15" aria-hidden="true" /><span>{{ folder.name }}</span>
              </label>
            </div>
          </div>
          <div class="mcp-scope-column">
            <span class="mcp-label">{{ t('mcpScopeResources') }}</span>
            <input v-model="resourceQuery" class="dashboard-modal-input" :placeholder="t('mcpScopeSearch')" data-mcp-resource-search />
            <div class="mcp-pick-list">
              <label v-for="resource in shownResources" :key="resource.key" class="mcp-check">
                <input type="checkbox" :checked="isPicked(resource)" :data-mcp-resource="resource.key" @change="toggleResource(resource)" />
                <span class="mcp-type">{{ typeLabel(resource) }}</span><span>{{ resource.title }}</span>
              </label>
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset class="mcp-field">
        <legend class="mcp-label">{{ t('mcpLifetime') }}</legend>
        <div class="mcp-segments" role="radiogroup">
          <button
            v-for="days in LIFETIMES"
            :key="days"
            type="button"
            role="radio"
            :aria-checked="form.days === days"
            :class="{ active: form.days === days }"
            :data-mcp-days="days"
            @click="form.days = days"
          >{{ days }} {{ t('mcpDays') }}</button>
        </div>
      </fieldset>

      <p v-if="formError" class="mcp-error" role="alert">{{ formError }}</p>
      <div class="mcp-row-actions">
        <button type="button" class="btn-ghost" @click="form = null">{{ t('cancel') }}</button>
        <button type="submit" class="btn-primary" :disabled="issuing" data-mcp-submit>{{ t('mcpCreate') }}</button>
      </div>
    </form>

    <section class="mcp-list">
      <p v-if="!tokens.length && !loading" class="mcp-empty">{{ t('mcpNoTokens') }}</p>
      <article v-for="token in tokens" :key="token.id" class="mcp-card mcp-token" :class="`is-${token.status}`" :data-mcp-token="token.id">
        <div class="mcp-token-head">
          <div class="mcp-token-title">
            <h3>{{ token.name }}</h3>
            <code>{{ token.tokenPrefix }}…</code>
          </div>
          <span class="mcp-status" :class="`is-${token.status}`">{{ t(STATUS_LABEL[token.status]) }}</span>
        </div>
        <div class="mcp-chips">
          <span v-for="action in token.actions" :key="action" class="mcp-chip">{{ t(actionLabel(action)) }}</span>
        </div>
        <p class="mcp-scope-line">
          <template v-if="token.scope.kind === 'all'">{{ t('mcpScopeAllShort') }}</template>
          <template v-else>
            <span v-for="folder in token.scope.folders" :key="folder.id" class="mcp-scope-item"><FolderIcon :size="14" aria-hidden="true" />{{ folder.name || folder.id }}</span>
            <span v-for="resource in token.scope.resources" :key="resource.id" class="mcp-scope-item"><FileText :size="14" aria-hidden="true" />{{ resource.title || resource.id }}</span>
          </template>
        </p>
        <p class="mcp-meta">
          <span>{{ t('mcpExpires') }} {{ formatDate(token.expiresAt) }}</span>
          <span>{{ token.lastUsedAt ? `${t('mcpLastUsed')} ${formatDateTime(token.lastUsedAt)}` : t('mcpNeverUsed') }}</span>
        </p>
        <div v-if="token.status === 'active'" class="mcp-row-actions">
          <button type="button" class="btn-ghost btn-sm" @click="rename(token)">{{ t('mcpRename') }}</button>
          <button type="button" class="btn-ghost btn-sm mcp-danger" :data-mcp-revoke="token.id" @click="revoke(token)">{{ t('mcpRevoke') }}</button>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Copy, FileText, Folder as FolderIcon, Plus } from '@lucide/vue';
import {
  canvas,
  htmlDocuments,
  interactiveTemplates,
  mcpTokens,
  resourceFolders,
  textDocuments,
  type McpTokenAction,
  type McpTokenRecord,
  type McpTokenResourceType,
  type ResourceFolderSummary,
} from '../../api/client';
import { getPublicOrigin } from '../../api/public-origin';
import { confirmDialog, promptDialog } from '../../composables/appDialog';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';

type MessageKey = Parameters<ReturnType<typeof useI18n>['t']>[0];
/** `templateType` tells a board from a character sheet: both are interactive templates to a token. */
type PickResource = { key: string; type: McpTokenResourceType; id: string; title: string; templateType?: string };

const ACTIONS: { key: McpTokenAction; label: MessageKey; hint?: MessageKey }[] = [
  { key: 'read', label: 'mcpActionRead', hint: 'mcpActionReadHint' },
  { key: 'edit', label: 'mcpActionEdit' },
  { key: 'create', label: 'mcpActionCreate' },
  { key: 'delete', label: 'mcpActionDelete', hint: 'mcpActionDeleteHint' },
  { key: 'share', label: 'mcpActionShare', hint: 'mcpActionShareHint' },
];
const LIFETIMES = [7, 30, 90, 365] as const;
const STATUS_LABEL: Record<McpTokenRecord['status'], MessageKey> = {
  active: 'mcpStatusActive',
  expired: 'mcpStatusExpired',
  revoked: 'mcpStatusRevoked',
};

const { t, locale } = useI18n();
const toast = useToast();

const tokens = ref<McpTokenRecord[]>([]);
const loading = ref(true);
const issued = ref<{ token: string; record: McpTokenRecord } | null>(null);
const issuing = ref(false);
const formError = ref('');
const form = ref<{
  name: string;
  actions: McpTokenAction[];
  scopeKind: 'all' | 'limited';
  folders: string[];
  resources: { type: McpTokenResourceType; id: string }[];
  days: number;
} | null>(null);

const folders = ref<ResourceFolderSummary[]>([]);
const resources = ref<PickResource[]>([]);
const resourceQuery = ref('');

const endpoint = `${getPublicOrigin()}/api/mcp`;

const clientConfig = (token: string) =>
  JSON.stringify(
    { mcpServers: { qcanva: { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2,
  );

/** Folders as a tree, parents first, with their depth. */
const folderRows = computed(() => {
  const all = folders.value;
  const ids = new Set(all.map((folder) => folder.id));
  const rows: { id: string; name: string; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of all
      .filter((entry) => (entry.parentId && ids.has(entry.parentId) ? entry.parentId : null) === parentId)
      .sort((a, b) => a.name.localeCompare(b.name))) {
      rows.push({ id: folder.id, name: folder.name, depth });
      walk(folder.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
});

const shownResources = computed(() => {
  const query = resourceQuery.value.trim().toLowerCase();
  const picked = resources.value.filter((resource) => isPicked(resource));
  const matches = query
    ? resources.value.filter((resource) => !isPicked(resource) && resource.title.toLowerCase().includes(query)).slice(0, 30)
    : [];
  return [...picked, ...matches];
});

const isPicked = (resource: PickResource) =>
  !!form.value?.resources.some((entry) => entry.type === resource.type && entry.id === resource.id);

function toggle(list: string[], value: string) {
  const index = list.indexOf(value);
  if (index >= 0) list.splice(index, 1);
  else list.push(value);
}

function toggleAction(action: McpTokenAction) {
  if (!form.value || action === 'read') return;
  toggle(form.value.actions, action);
}

function toggleResource(resource: PickResource) {
  if (!form.value) return;
  const index = form.value.resources.findIndex((entry) => entry.type === resource.type && entry.id === resource.id);
  if (index >= 0) form.value.resources.splice(index, 1);
  else form.value.resources.push({ type: resource.type, id: resource.id });
}

const actionLabel = (action: McpTokenAction) => ACTIONS.find((entry) => entry.key === action)?.label ?? 'mcpActionRead';
const typeLabel = (resource: PickResource) => {
  if (resource.type === 'canvas') return t('canvas');
  if (resource.type === 'html-document') return 'HTML';
  if (resource.type === 'interactive-template') return t(resource.templateType === 'trello-board' ? 'mcpTypeBoard' : 'mcpTypeSheet');
  return t('document');
};

const formatDate = (value: string) => new Date(value).toLocaleDateString(locale.value);
const formatDateTime = (value: string) =>
  new Date(value).toLocaleString(locale.value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

async function load() {
  loading.value = true;
  try {
    tokens.value = (await mcpTokens.list()).tokens;
  } finally {
    loading.value = false;
  }
}

async function loadPickers() {
  const [folderList, canvases, htmlList, textList, templateList] = await Promise.all([
    resourceFolders.list(),
    canvas.list(),
    htmlDocuments.list(),
    textDocuments.list(),
    // Boards and character sheets; a failure here must not empty the whole picker.
    interactiveTemplates.list().catch(() => ({ templates: [] as { id: string; title?: string; templateType?: string }[] })),
  ]);
  folders.value = [...folderList.own, ...folderList.shared];
  const entry = (type: McpTokenResourceType, item: { id: string; title?: string }) => ({
    key: `${type}:${item.id}`,
    type,
    id: item.id,
    title: item.title || item.id,
  });
  const seen = new Set<string>();
  resources.value = [
    ...[...canvases.own, ...canvases.shared].map((item) => entry('canvas', item)),
    ...htmlList.documents.map((item) => entry('html-document', item)),
    ...textList.documents.map((item) => entry('text-document', item)),
    ...templateList.templates.map((item) => ({ ...entry('interactive-template', item), templateType: item.templateType })),
  ].filter((item) => (seen.has(item.key) ? false : (seen.add(item.key), true)));
}

function openForm() {
  formError.value = '';
  form.value = { name: '', actions: ['edit', 'create'], scopeKind: 'all', folders: [], resources: [], days: 30 };
  void loadPickers().catch(() => undefined);
}

async function issue() {
  if (!form.value) return;
  const value = form.value;
  if (value.scopeKind === 'limited' && !value.folders.length && !value.resources.length) {
    formError.value = t('mcpScopeEmpty');
    return;
  }
  issuing.value = true;
  formError.value = '';
  try {
    issued.value = await mcpTokens.issue({
      name: value.name.trim(),
      actions: ['read', ...value.actions],
      scope:
        value.scopeKind === 'all'
          ? { kind: 'all' }
          : { kind: 'limited', folders: [...value.folders], resources: value.resources.map((r) => ({ ...r })) },
      expiresInDays: value.days,
    });
    form.value = null;
    await load();
  } catch (error) {
    formError.value = error instanceof Error && error.message ? error.message : t('mcpIssueFailed');
  } finally {
    issuing.value = false;
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.show(t('mcpCopied'), 'success');
  } catch {
    toast.show(text, 'info', 8000);
  }
}

async function revoke(token: McpTokenRecord) {
  const confirmed = await confirmDialog({
    title: t('mcpRevokeTitle').replace('{name}', token.name),
    message: t('mcpRevokeNote'),
    confirmLabel: t('mcpRevoke'),
    danger: true,
  });
  if (!confirmed) return;
  await mcpTokens.revoke(token.id);
  await load();
}

async function rename(token: McpTokenRecord) {
  const name = await promptDialog({ title: t('mcpRename'), value: token.name, maxLength: 80, confirmLabel: t('mcpRename') });
  if (!name?.trim() || name.trim() === token.name) return;
  await mcpTokens.rename(token.id, name.trim());
  await load();
}

onMounted(load);
</script>

<style scoped>
/* Liquid Glass, like the rest of the settings page: cards are glass without
   blur (the page header and the menus are the blurred layer), fields and
   pills are inset glass panes, the chosen segment is accent glass. */
.mcp-panel { display: grid; gap: 14px; }
.mcp-label { font-size: 11px; font-weight: 600; color: var(--ui-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }
.mcp-endpoint { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.mcp-endpoint code { padding: 5px 10px; border: 1px solid var(--ui-glass-border); border-radius: 10px; background: var(--ui-glass-btn-bg); box-shadow: inset 0 1px 0 var(--ui-glass-highlight); overflow-wrap: anywhere; font-size: 13px; }
.mcp-endpoint .btn-primary { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }
.mcp-card {
  display: grid; gap: 12px; padding: 16px 18px;
  border: 1px solid var(--ui-glass-border); border-radius: 18px;
  background: var(--ui-glass-tint), var(--ui-glass-card-bg);
  box-shadow: inset 0 1px 0 var(--ui-glass-highlight), 0 6px 20px rgba(0, 0, 0, 0.12);
}
.mcp-card h2, .mcp-card h3 { margin: 0; color: var(--ui-text); }
.mcp-card h2 { font-size: 17px; }
.mcp-card h3 { font-size: 15px; }
.mcp-field { display: grid; gap: 6px; margin: 0; padding: 0; border: 0; min-width: 0; }
.mcp-check { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 4px 0; cursor: pointer; color: var(--ui-text); }
.mcp-check input { accent-color: var(--color-brands); }
.mcp-check small, .mcp-hint { color: var(--ui-text-secondary); font-size: 12px; }
.mcp-scope-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-top: 6px; }
.mcp-scope-column { display: grid; gap: 6px; align-content: start; min-width: 0; }
.mcp-pick-list { max-height: 240px; overflow-y: auto; padding: 6px 10px; border: 1px solid var(--ui-glass-border); border-radius: 14px; background: var(--ui-glass-btn-bg); box-shadow: inset 0 1px 0 var(--ui-glass-highlight); }
.mcp-type { font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--ui-glass-border); color: var(--ui-text-secondary); }
.mcp-segments { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border: 1px solid var(--ui-glass-border); border-radius: 999px; background: var(--ui-glass-btn-bg); box-shadow: inset 0 1px 0 var(--ui-glass-highlight); width: fit-content; }
.mcp-segments button { min-height: 32px; padding: 0 14px; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--ui-text-secondary); font: inherit; font-size: 13px; cursor: pointer; }
.mcp-segments button:hover:not(.active) { background: var(--ui-glass-btn-hover); }
.mcp-segments button.active { border-color: var(--ui-glass-accent-border); background: var(--ui-glass-accent-bg); color: var(--ui-glass-accent-text); box-shadow: var(--ui-glass-accent-glow); }
.mcp-row-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.mcp-row-actions .btn-ghost, .mcp-row-actions .btn-primary { display: inline-flex; align-items: center; gap: 6px; }
.mcp-error { margin: 0; color: var(--ui-danger-foreground); }
.mcp-warning { margin: 0; padding: 10px 14px; border: 1px solid var(--ui-glass-accent-border); border-radius: 14px; background: var(--ui-glass-accent-bg); color: var(--ui-text); }
.mcp-secret { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.mcp-secret code { flex: 1 1 280px; padding: 9px 12px; border: 1px solid var(--ui-glass-border); border-radius: 12px; background: var(--ui-glass-btn-bg); font-size: 13px; overflow-wrap: anywhere; user-select: all; }
.mcp-config { margin: 0; padding: 12px 14px; border: 1px solid var(--ui-glass-border); border-radius: 14px; background: var(--ui-glass-btn-bg); font-size: 12px; overflow-x: auto; }
.mcp-list { display: grid; gap: 12px; }
.mcp-empty { margin: 0; padding: 18px; border: 1px dashed var(--ui-glass-border); border-radius: 18px; color: var(--ui-text-secondary); text-align: center; }
.mcp-token-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.mcp-token-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; min-width: 0; }
.mcp-token-title code { font-size: 12px; color: var(--ui-text-secondary); }
.mcp-status { flex: none; font-size: 12px; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--ui-glass-accent-border); background: var(--ui-glass-accent-bg); color: var(--ui-glass-accent-text); }
.mcp-status.is-expired, .mcp-status.is-revoked { border-color: var(--ui-glass-border); background: var(--ui-glass-btn-bg); color: var(--ui-text-secondary); }
.mcp-token.is-expired, .mcp-token.is-revoked { opacity: 0.68; }
.mcp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.mcp-chip { font-size: 12px; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--ui-glass-border); background: var(--ui-glass-btn-bg); color: var(--ui-text); }
.mcp-scope-line { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0; font-size: 14px; color: var(--ui-text); }
.mcp-scope-item { display: inline-flex; align-items: center; gap: 5px; }
.mcp-meta { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0; color: var(--ui-text-secondary); font-size: 13px; }
.mcp-danger { color: var(--ui-danger-foreground) !important; }
@media (max-width: 640px) {
  .mcp-endpoint .btn-primary { margin-left: 0; width: 100%; justify-content: center; }
  .mcp-row-actions > * { flex: 1; justify-content: center; }
}
</style>

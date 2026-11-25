<template>
  <Transition name="yandex-picker" appear @after-leave="emit('close')">
    <div
      v-if="visible"
      class="dashboard-modal-backdrop"
      data-album-share-dialog
      data-space-members
      @click.self="close"
      @keydown.esc.prevent.stop="close"
    >
      <div class="dashboard-modal space-members album-share-modal" role="dialog" aria-modal="true" :aria-label="modalTitle">
        <div class="dashboard-modal-head">
          <h3>{{ modalTitle }}</h3>
          <button type="button" class="dashboard-modal-close" :aria-label="t('cancel')" @click="close">
            <X :size="16" aria-hidden="true" />
          </button>
        </div>

        <p class="album-share-hint">{{ t('explorerAlbumSharedHint') }}</p>

        <div class="album-share-public-card">
          <div class="album-share-public-info">
            <div class="album-share-public-title">
              <Globe :size="15" aria-hidden="true" />
              <span>{{ t('explorerAlbumPublicLink') }}</span>
            </div>
            <div class="album-share-public-sub">{{ t('explorerAlbumPublicLinkHint') }}</div>
          </div>
          <button
            type="button"
            class="album-share-toggle"
            :class="{ active: publicLinkEnabled }"
            role="switch"
            :aria-checked="publicLinkEnabled"
            data-album-public-toggle
            @click="togglePublicLink"
          >
            {{ publicLinkEnabled ? 'ON' : 'OFF' }}
          </button>
        </div>

        <div v-if="publicLinkEnabled" class="album-share-url-row" data-album-public-url-row>
          <input
            type="text"
            readonly
            class="dashboard-modal-input album-share-url-input"
            :value="albumUrl"
            :aria-label="t('explorerAlbumPublicLink')"
            data-album-public-url
            @focus="($event.target as HTMLInputElement).select()"
          />
          <button
            type="button"
            class="btn-ghost btn-sm album-share-copy-btn"
            data-album-copy-link
            @click="copyAlbumUrl"
          >
            <Check v-if="copied" :size="14" aria-hidden="true" />
            <Copy v-else :size="14" aria-hidden="true" />
            <span>{{ copied ? t('explorerAlbumLinkCopied') : t('explorerAlbumCopyLink') }}</span>
          </button>
        </div>

        <form v-if="isOwner" class="space-invite" data-space-invite novalidate @submit.prevent="invite">
          <ContactEmailInput
            v-model.trim="email"
            class="dashboard-modal-input"
            :placeholder="t('spaceInviteEmail')"
            :aria-label="t('spaceInviteEmail')"
            :exclude="inSpaceEmails"
            data-space-invite-email
          />
          <select v-model="role" class="dashboard-modal-input space-member-select" :aria-label="t('spaceRole')" data-space-invite-role>
            <option value="editor">{{ t('spaceRoleEditor') }}</option>
            <option value="viewer">{{ t('spaceRoleViewer') }}</option>
          </select>
          <button type="submit" class="btn-primary" :disabled="busy || !email" data-space-invite-send>{{ t('spaceInvite') }}</button>
        </form>

        <div class="album-share-members-count">{{ t('explorerMembersCount').replace('{n}', String(space.members.length + 1)) }}</div>

        <ul class="space-members-list">
          <li class="space-member" data-space-member="owner">
            <span class="space-member-who">
              <span class="space-member-name">{{ space.owner.name || space.owner.email }}</span>
              <span class="space-member-email">{{ space.owner.email }}</span>
            </span>
            <span class="space-member-role">{{ t('spaceRoleOwner') }}</span>
          </li>
          <li v-for="member in space.members" :key="member.id" class="space-member" :data-space-member="member.email">
            <span class="space-member-who">
              <span class="space-member-name">{{ member.name || member.email }}</span>
              <span v-if="member.name" class="space-member-email">{{ member.email }}</span>
            </span>
            <select
              v-if="isOwner"
              class="dashboard-modal-input space-member-select"
              :value="member.role"
              :aria-label="t('spaceRole')"
              :disabled="busy"
              data-space-member-role
              @change="setRole(member.id, ($event.target as HTMLSelectElement).value as 'editor' | 'viewer')"
            >
              <option value="editor">{{ t('spaceRoleEditor') }}</option>
              <option value="viewer">{{ t('spaceRoleViewer') }}</option>
            </select>
            <span v-else class="space-member-role">{{ member.role === 'editor' ? t('spaceRoleEditor') : t('spaceRoleViewer') }}</span>
            <button
              v-if="isOwner"
              type="button"
              class="btn-ghost btn-sm danger"
              :disabled="busy"
              data-space-member-remove
              @click="remove(member)"
            >{{ t('delete') }}</button>
          </li>
        </ul>

        <p v-if="error" class="dashboard-modal-note space-members-error" role="alert">{{ error }}</p>

        <div class="dashboard-modal-actions dashboard-modal-actions-row">
          <button v-if="!isOwner" type="button" class="btn-ghost danger" :disabled="busy" data-space-leave @click="leave">{{ t('spaceLeave') }}</button>
          <button type="button" class="btn-primary" @click="close">{{ t('driveUploadDone') }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { Check, Copy, Globe, X } from '@lucide/vue';
import ContactEmailInput from '../ContactEmailInput.vue';
import { spacesApi, type SpaceDetails, type SpaceMember } from '../../api/spaces';
import { confirmDialog } from '../../composables/appDialog';
import { useI18n } from '../../composables/useI18n';

const props = defineProps<{
  space: SpaceDetails;
  meId: string;
  initialPublicLink?: boolean;
}>();

const emit = defineEmits<{
  changed: [space: SpaceDetails | null];
  close: [];
  'toggle-public': [enabled: boolean];
}>();

const { t } = useI18n();

const PUBLIC_LINK_KEY_PREFIX = 'qspace:albumPublicLink:';

function readStoredPublicLink(spaceId: string): boolean {
  if (props.initialPublicLink !== undefined) return props.initialPublicLink;
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(`${PUBLIC_LINK_KEY_PREFIX}${spaceId}`) === '1';
  } catch {
    return false;
  }
}

const visible = ref(true);
const busy = ref(false);
const error = ref('');
const email = ref('');
const role = ref<'editor' | 'viewer'>('editor');
const publicLinkEnabled = ref(readStoredPublicLink(props.space.id));
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

const isOwner = computed(() => props.space.role === 'owner');
const modalTitle = computed(() => t('explorerAlbumShareTitle').replace('{name}', props.space.name));
const albumUrl = computed(() => {
  const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
  return `${origin}/dashboard?section=space&spaceId=${encodeURIComponent(props.space.id)}`;
});
const inSpaceEmails = computed(() =>
  [props.space.owner.email, ...props.space.members.map((member) => member.email)].filter((item): item is string => Boolean(item)),
);

function togglePublicLink(): void {
  const next = !publicLinkEnabled.value;
  publicLinkEnabled.value = next;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${PUBLIC_LINK_KEY_PREFIX}${props.space.id}`, next ? '1' : '0');
    }
  } catch {
    // Ignore storage errors.
  }
  emit('toggle-public', next);
}

async function copyAlbumUrl(): Promise<void> {
  try {
    await navigator.clipboard?.writeText(albumUrl.value);
  } catch {
    // Fallback / non-clipboard test environments still show visual confirmation.
  }
  copied.value = true;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copied.value = false;
  }, 2200);
}

const errorText = (err: unknown) => {
  const code = (err as { body?: { code?: string } } | null)?.body?.code;
  if (code === 'space_user_not_found') return t('spaceUserNotFound');
  return err instanceof Error && err.message ? err.message : t('spaceActionFailed');
};

async function run(task: () => Promise<SpaceDetails | null>) {
  busy.value = true;
  error.value = '';
  try {
    emit('changed', await task());
    return true;
  } catch (err) {
    error.value = errorText(err);
    return false;
  } finally {
    busy.value = false;
  }
}

async function invite() {
  if (!email.value) return;
  if (await run(() => spacesApi.addMember(props.space.id, email.value, role.value))) email.value = '';
}

const setRole = (userId: string, next: 'editor' | 'viewer') => run(() => spacesApi.setRole(props.space.id, userId, next));

async function remove(member: SpaceMember) {
  const confirmed = await confirmDialog({
    title: t('spaceRemoveMemberTitle').replace('{name}', member.name || member.email),
    confirmLabel: t('delete'),
    cancelLabel: t('cancel'),
    danger: true,
  });
  if (!confirmed) return;
  await run(async () => {
    await spacesApi.removeMember(props.space.id, member.id);
    return spacesApi.get(props.space.id);
  });
}

async function leave() {
  const confirmed = await confirmDialog({
    title: t('spaceLeaveTitle').replace('{name}', props.space.name),
    confirmLabel: t('spaceLeave'),
    cancelLabel: t('cancel'),
    danger: true,
  });
  if (!confirmed) return;
  if (await run(async () => { await spacesApi.removeMember(props.space.id, props.meId); return null; })) close();
}

function close() {
  visible.value = false;
}

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<style scoped>
.album-share-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(500px, calc(100vw - 32px));
}
.album-share-hint {
  margin: 0;
  font-size: 12px;
  color: var(--ui-text-secondary);
}
.album-share-public-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--ui-glass-btn-bg, var(--ui-surface-subtle));
  border: 1px solid var(--ui-glass-border, var(--ui-border));
}
.album-share-public-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.album-share-public-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ui-text);
}
.album-share-public-sub {
  font-size: 11.5px;
  color: var(--ui-text-secondary);
}
.album-share-toggle {
  flex: none;
  min-width: 52px;
  height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--ui-glass-border, var(--ui-border));
  background: var(--ui-glass-card-bg, var(--ui-surface-subtle));
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
}
.album-share-toggle.active {
  background: var(--ui-glass-accent-tint, transparent), var(--ui-glass-accent-bg, color-mix(in srgb, var(--color-brands) 18%, transparent));
  border-color: var(--ui-glass-accent-border, var(--color-brands));
  color: var(--ui-glass-accent-text, var(--color-brands));
}
.album-share-url-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.album-share-url-input {
  flex: 1;
  min-width: 0;
  font-size: 12px;
}
.album-share-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
}
.album-share-members-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--ui-text-secondary);
}
</style>

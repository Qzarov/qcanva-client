<template>
  <!-- The people of a shared space: the owner invites by e-mail as editor or
       viewer, changes roles and removes; anyone else may leave. -->
  <Transition name="yandex-picker" appear @after-leave="emit('close')">
    <div v-if="visible" class="dashboard-modal-backdrop" data-space-members @click.self="close">
      <div class="dashboard-modal space-members">
        <div class="dashboard-modal-head">
          <h3>{{ t('spaceMembers') }}</h3>
          <button class="dashboard-modal-close" :aria-label="t('cancel')" @click="close">x</button>
        </div>
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
        <form v-if="isOwner" class="space-invite" data-space-invite @submit.prevent="invite">
          <!-- The contacts and potential contacts, as the share menus offer them. -->
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
import { computed, ref } from 'vue';
import ContactEmailInput from '../ContactEmailInput.vue';
import { spacesApi, type SpaceDetails, type SpaceMember } from '../../api/spaces';
import { confirmDialog } from '../../composables/appDialog';
import { useI18n } from '../../composables/useI18n';

const props = defineProps<{ space: SpaceDetails; meId: string }>();
const emit = defineEmits<{
  /** The space as it is now; null when the user left it. */
  changed: [space: SpaceDetails | null];
  close: [];
}>();
const { t } = useI18n();

const visible = ref(true);
const busy = ref(false);
const error = ref('');
const email = ref('');
const role = ref<'editor' | 'viewer'>('editor');
const isOwner = computed(() => props.space.role === 'owner');
/** Already in the space: not offered again. */
const inSpaceEmails = computed(() => [props.space.owner.email, ...props.space.members.map((member) => member.email)].filter((email): email is string => Boolean(email)));

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
</script>

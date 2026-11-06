<template>
  <!-- The user's contact book: suggested people from sharing to approve or decline,
       then the saved contacts - any email, registered or not. Later the share dialog
       will offer these addresses. -->
  <div class="contacts-settings">
    <section v-if="suggestions.length" class="settings-card" data-contacts-suggested>
      <h3>{{ t('contactsSuggested') }}</h3>
      <p class="contacts-note">{{ t('contactsSuggestedLead') }}</p>
      <ul class="contacts-list">
        <li v-for="item in suggestions" :key="item.email" class="contacts-row" :data-contact-suggestion="item.email">
          <span class="contacts-avatar" aria-hidden="true">{{ initial(item.userName || item.email) }}</span>
          <div class="contacts-who">
            <span class="contacts-label">{{ item.userName || item.email }}</span>
            <span class="contacts-sub">
              <template v-if="item.userName">{{ item.email }} · </template>{{ reasonText(item.reasons) }}
            </span>
          </div>
          <div class="contacts-actions">
            <button type="button" class="btn-ghost btn-sm" data-contact-dismiss :disabled="busy" @click="dismiss(item)">{{ t('contactDismiss') }}</button>
            <button type="button" class="btn-primary btn-sm" data-contact-accept :disabled="busy" @click="accept(item)">{{ t('contactAccept') }}</button>
          </div>
        </li>
      </ul>
    </section>

    <section class="settings-card" data-contacts-saved>
      <h3>{{ t('contactsSaved') }}</h3>
      <form class="contacts-form" data-contact-form @submit.prevent="add">
        <label class="contacts-field">
          <span>{{ t('contactEmail') }}</span>
          <input
            v-model.trim="email"
            type="email"
            class="dashboard-modal-input"
            autocomplete="email"
            :placeholder="t('contactEmailPlaceholder')"
            :disabled="busy"
            data-contact-email
            @input="formError = ''"
          />
        </label>
        <label class="contacts-field">
          <span>{{ t('contactName') }}</span>
          <input
            v-model.trim="name"
            class="dashboard-modal-input"
            maxlength="120"
            :placeholder="t('contactNamePlaceholder')"
            :disabled="busy"
            data-contact-name
          />
        </label>
        <button type="submit" class="btn-primary contacts-add" :disabled="busy || !email" data-contact-add>{{ t('contactAdd') }}</button>
        <!-- Reserved line: the error does not push the list down when it appears. -->
        <p class="contacts-form-error" role="alert" data-contact-error>{{ formError }}</p>
      </form>

      <p v-if="loading" class="contacts-note">{{ t('loadingDots') }}</p>
      <p v-else-if="loadFailed" class="contacts-note contacts-note--error" role="alert">{{ t('contactsLoadFailed') }}</p>
      <p v-else-if="!items.length" class="contacts-note" data-contacts-empty>{{ t('contactsEmpty') }}</p>
      <ul v-else class="contacts-list">
        <li v-for="contact in items" :key="contact.id" class="contacts-row" :data-contact-row="contact.email">
          <span class="contacts-avatar" aria-hidden="true">{{ initial(label(contact)) }}</span>
          <div class="contacts-who">
            <span class="contacts-label">{{ label(contact) }}</span>
            <span v-if="label(contact) !== contact.email" class="contacts-sub">{{ contact.email }}</span>
          </div>
          <div class="contacts-actions">
            <button type="button" class="btn-ghost btn-sm" data-contact-rename :disabled="busy" @click="rename(contact)">{{ t('contactRename') }}</button>
            <button type="button" class="btn-ghost btn-sm danger" data-contact-delete :disabled="busy" @click="remove(contact)">{{ t('delete') }}</button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  ApiError,
  contacts as contactsApi,
  type ContactSuggestion,
  type ContactSuggestionReason,
  type ContactView,
} from '../../api/client';
import { alertFailure, confirmDelete, promptText } from '../../composables/appDialog';
import { useToast } from '../../composables/useToast';
import { useI18n } from '../../composables/useI18n';

const { t } = useI18n();
const { show: showToast } = useToast();
const items = ref<ContactView[]>([]);
const suggestions = ref<ContactSuggestion[]>([]);
const loading = ref(true);
const loadFailed = ref(false);
const busy = ref(false);
const email = ref('');
const name = ref('');
const formError = ref('');

const label = (contact: ContactView) => contact.name || contact.userName || contact.email;
const initial = (text: string) => text.trim().charAt(0).toUpperCase() || '?';
const reasonText = (reasons: ContactSuggestionReason[]) =>
  reasons
    .map((reason) => t(reason === 'shared-by-me' ? 'contactReasonSharedByMe' : 'contactReasonSharedWithMe'))
    .join(' · ');

/** The hub answers with a code; the form shows it in words. */
const ERROR_TEXT: Record<string, Parameters<typeof t>[0]> = {
  contact_exists: 'contactExists',
  invalid_email: 'contactInvalidEmail',
  own_email: 'contactOwnEmail',
};

async function load() {
  loading.value = true;
  loadFailed.value = false;
  try {
    const [saved, suggested] = await Promise.all([contactsApi.list(), contactsApi.suggestions()]);
    items.value = saved.contacts;
    suggestions.value = suggested.suggestions;
  } catch {
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
}

async function add() {
  if (busy.value || !email.value) return;
  busy.value = true;
  formError.value = '';
  try {
    items.value = (await contactsApi.create({ email: email.value, name: name.value || null })).contacts;
    const added = email.value.toLowerCase();
    suggestions.value = suggestions.value.filter((item) => item.email !== added);
    email.value = '';
    name.value = '';
    showToast(t('contactAdded'), 'success');
  } catch (error) {
    const code = error instanceof ApiError ? ERROR_TEXT[error.message] : undefined;
    if (code) formError.value = t(code);
    else await alertFailure('contactAddFailed', error);
  } finally {
    busy.value = false;
  }
}

async function accept(item: ContactSuggestion) {
  if (busy.value) return;
  busy.value = true;
  try {
    items.value = (await contactsApi.accept(item.email)).contacts;
    suggestions.value = suggestions.value.filter((other) => other.email !== item.email);
    showToast(t('contactAdded'), 'success');
  } catch (error) {
    await alertFailure('contactAddFailed', error);
  } finally {
    busy.value = false;
  }
}

async function dismiss(item: ContactSuggestion) {
  if (busy.value) return;
  busy.value = true;
  try {
    suggestions.value = (await contactsApi.dismiss(item.email)).suggestions;
  } catch (error) {
    await alertFailure('contactDismissFailed', error);
  } finally {
    busy.value = false;
  }
}

async function rename(contact: ContactView) {
  if (busy.value) return;
  const next = await promptText('contactRenameTitle', 'save', contact.name ?? '');
  if (next === null || next.trim() === (contact.name ?? '')) return;
  busy.value = true;
  try {
    items.value = (await contactsApi.rename(contact.id, next.trim() || null)).contacts;
    showToast(t('contactRenamed'), 'success');
  } catch (error) {
    await alertFailure('contactRenameFailed', error);
  } finally {
    busy.value = false;
  }
}

async function remove(contact: ContactView) {
  if (busy.value) return;
  if (!(await confirmDelete('deleteContactTitle', label(contact)))) return;
  busy.value = true;
  try {
    items.value = (await contactsApi.delete(contact.id)).contacts;
    showToast(t('contactDeleted'), 'success');
  } catch (error) {
    await alertFailure('contactDeleteFailed', error);
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.contacts-settings { display: grid; gap: 16px; }
.contacts-settings h3 { margin: 0 0 4px; font-size: 15px; }
.contacts-note { margin: 0; color: var(--ui-text-secondary); font-size: 14px; }
.contacts-note--error { color: var(--ui-danger-foreground); }
.contacts-form {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) auto;
  align-items: end;
  gap: 10px;
  margin: 8px 0 4px;
}
.contacts-field { display: grid; gap: 4px; font-size: 12px; color: var(--ui-text-secondary); }
.contacts-field .dashboard-modal-input { margin: 0; }
.contacts-form-error {
  grid-column: 1 / -1;
  min-height: 18px;
  margin: 0;
  color: var(--ui-danger-foreground);
  font-size: 13px;
}
.contacts-list { display: grid; margin: 0; padding: 0; list-style: none; }
.contacts-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--ui-border);
}
.contacts-row:last-child { border-bottom: 0; }
.contacts-avatar {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--ui-surface-muted, var(--ui-border));
  color: var(--ui-text);
  font-size: 14px;
  font-weight: 600;
}
.contacts-who { display: grid; min-width: 0; }
.contacts-label,
.contacts-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.contacts-sub { color: var(--ui-text-secondary); font-size: 12px; }
.contacts-actions { display: flex; gap: 6px; }

/* A phone: the fields stack, the buttons go under the name. */
@media (max-width: 760px) {
  .contacts-form { grid-template-columns: minmax(0, 1fr); }
  .contacts-row { grid-template-columns: 32px minmax(0, 1fr); row-gap: 8px; }
  .contacts-actions { grid-column: 2; }
}
</style>

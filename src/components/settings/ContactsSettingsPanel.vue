<template>
  <!-- The user's contact book. Two tabs: the saved contacts (any email, registered or not)
       and the people suggested from sharing, to approve or decline. Later the share dialog
       will offer these addresses. -->
  <div class="contacts-settings">
    <header class="contacts-head">
      <h2>{{ t('settingsContacts') }}</h2>
      <button
        type="button"
        class="btn-ghost contacts-add-open"
        :aria-label="t('contactAddOpen')"
        :title="t('contactAddOpen')"
        :aria-expanded="adding"
        :disabled="loading"
        data-contact-add-open
        @click="openForm"
      >
        <Plus :size="18" aria-hidden="true" />
      </button>
    </header>

    <div class="contacts-tabs" role="tablist" :aria-label="t('contactsTabs')">
      <button
        v-for="item in TABS"
        :key="item.key"
        type="button"
        role="tab"
        :class="{ active: tab === item.key }"
        :aria-selected="tab === item.key"
        :data-contacts-tab="item.key"
        @click="tab = item.key"
      >
        {{ t(item.label) }}<span v-if="!loading && count(item.key)" class="contacts-tab-count">{{ count(item.key) }}</span>
      </button>
    </div>

    <p v-if="loading" class="contacts-note">{{ t('loadingDots') }}</p>
    <p v-else-if="loadFailed" class="contacts-note contacts-note--error" role="alert">{{ t('contactsLoadFailed') }}</p>

    <section v-else-if="tab === 'saved'" class="contacts-panel" role="tabpanel" data-contacts-saved>
      <form v-if="adding" class="contacts-form" data-contact-form @submit.prevent="add" @keydown.esc="closeForm">
        <label class="contacts-field">
          <span>{{ t('contactEmail') }}</span>
          <input
            ref="emailInput"
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
        <div class="contacts-form-actions">
          <button type="button" class="btn-ghost" :disabled="busy" data-contact-cancel @click="closeForm">{{ t('cancel') }}</button>
          <button type="submit" class="btn-primary" :disabled="busy || !email" data-contact-add>{{ t('contactAdd') }}</button>
        </div>
        <!-- Reserved line: the error does not push the list down when it appears. -->
        <p class="contacts-form-error" role="alert" data-contact-error>{{ formError }}</p>
      </form>

      <p v-if="!items.length" class="contacts-note" data-contacts-empty>{{ t('contactsEmpty') }}</p>
      <ul v-else class="contacts-grid">
        <li v-for="contact in items" :key="contact.id" class="contacts-card-item" :data-contact-row="contact.email">
          <span class="contacts-avatar" aria-hidden="true">{{ initial(label(contact)) }}</span>
          <div class="contacts-who">
            <span class="contacts-label" :title="label(contact)">{{ label(contact) }}</span>
            <span v-if="label(contact) !== contact.email" class="contacts-sub" :title="contact.email">{{ contact.email }}</span>
          </div>
          <div class="contacts-icon-actions">
            <button type="button" class="btn-ghost contacts-icon-btn" :aria-label="t('contactRenameTitle')" :title="t('contactRenameTitle')" data-contact-rename :disabled="busy" @click="rename(contact)">
              <Pencil :size="15" aria-hidden="true" />
            </button>
            <button type="button" class="btn-ghost contacts-icon-btn danger" :aria-label="t('delete')" :title="t('delete')" data-contact-delete :disabled="busy" @click="remove(contact)">
              <Trash2 :size="15" aria-hidden="true" />
            </button>
          </div>
        </li>
      </ul>
    </section>

    <section v-else class="contacts-panel" role="tabpanel" data-contacts-suggested>
      <p class="contacts-note">{{ t('contactsSuggestedLead') }}</p>
      <p v-if="!suggestions.length" class="contacts-note" data-contacts-suggested-empty>{{ t('contactsSuggestedEmpty') }}</p>
      <ul v-else class="contacts-grid">
        <li v-for="item in suggestions" :key="item.email" class="contacts-card-item contacts-card-item--suggested" :data-contact-suggestion="item.email">
          <span class="contacts-avatar" aria-hidden="true">{{ initial(item.userName || item.email) }}</span>
          <div class="contacts-who">
            <span class="contacts-label" :title="item.userName || item.email">{{ item.userName || item.email }}</span>
            <span v-if="item.userName" class="contacts-sub" :title="item.email">{{ item.email }}</span>
            <span class="contacts-sub">{{ reasonText(item.reasons) }}</span>
          </div>
          <div class="contacts-card-actions">
            <button type="button" class="btn-ghost btn-sm" data-contact-dismiss :disabled="busy" @click="dismiss(item)">{{ t('contactDismiss') }}</button>
            <button type="button" class="btn-primary btn-sm" data-contact-accept :disabled="busy" @click="accept(item)">{{ t('contactAccept') }}</button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { Pencil, Plus, Trash2 } from '@lucide/vue';
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

type TabKey = 'saved' | 'suggested';

const { t } = useI18n();
const { show: showToast } = useToast();

const TABS: { key: TabKey; label: Parameters<typeof t>[0] }[] = [
  { key: 'saved', label: 'contactsSaved' },
  { key: 'suggested', label: 'contactsSuggested' },
];

const items = ref<ContactView[]>([]);
const suggestions = ref<ContactSuggestion[]>([]);
const tab = ref<TabKey>('saved');
const loading = ref(true);
const loadFailed = ref(false);
const busy = ref(false);
const adding = ref(false);
const email = ref('');
const name = ref('');
const formError = ref('');
const emailInput = ref<HTMLInputElement | null>(null);

const count = (key: TabKey) => (key === 'saved' ? items.value.length : suggestions.value.length);
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
    // Opens on the contacts; with none saved yet, on whatever is suggested.
    tab.value = !items.value.length && suggestions.value.length ? 'suggested' : 'saved';
  } catch {
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
}

async function openForm() {
  tab.value = 'saved';
  adding.value = true;
  await nextTick();
  emailInput.value?.focus();
}

function closeForm() {
  adding.value = false;
  email.value = '';
  name.value = '';
  formError.value = '';
}

async function add() {
  if (busy.value || !email.value) return;
  busy.value = true;
  formError.value = '';
  try {
    items.value = (await contactsApi.create({ email: email.value, name: name.value || null })).contacts;
    const added = email.value.toLowerCase();
    suggestions.value = suggestions.value.filter((item) => item.email !== added);
    closeForm();
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
.contacts-settings { display: grid; gap: 14px; }
.contacts-head { display: flex; align-items: center; gap: 8px; }
.contacts-head h2 { margin: 0; font-size: 22px; }
.contacts-add-open {
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 50%;
}

/* The same pill as the language switch on General. */
.contacts-tabs {
  display: inline-flex;
  justify-self: start;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 999px;
  background: var(--ui-glass-btn-bg);
  box-shadow: inset 0 1px 0 var(--ui-glass-highlight);
}
.contacts-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--ui-text-secondary);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.contacts-tabs button:hover:not(.active) { background: var(--ui-glass-btn-hover); }
.contacts-tabs button.active {
  border-color: var(--ui-glass-accent-border);
  background: var(--ui-glass-accent-bg);
  color: var(--ui-glass-accent-text);
  box-shadow: var(--ui-glass-accent-glow);
}
.contacts-tab-count { font-size: 12px; opacity: 0.75; }

.contacts-panel { display: grid; gap: 12px; }
.contacts-note { margin: 0; color: var(--ui-text-secondary); font-size: 14px; }
.contacts-note--error { color: var(--ui-danger-foreground); }
/* The add form sits on a glass card, like the other settings sections. */
.contacts-form {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr) auto;
  align-items: end;
  gap: 10px;
  padding: 14px 16px 4px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 16px;
  background: var(--ui-glass-tint), var(--ui-glass-card-bg);
}
.contacts-field { display: grid; gap: 4px; font-size: 12px; color: var(--ui-text-secondary); }
.contacts-field .dashboard-modal-input { margin: 0; }
.contacts-form-actions { display: flex; gap: 6px; }
.contacts-form-error {
  grid-column: 1 / -1;
  min-height: 18px;
  margin: 0;
  color: var(--ui-danger-foreground);
  font-size: 13px;
}
.contacts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.contacts-card-item {
  position: relative;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 64px;
  padding: 12px 14px;
  border: 1px solid var(--ui-glass-border);
  border-radius: 14px;
  background: var(--ui-glass-tint), var(--ui-glass-card-bg);
  box-shadow: inset 0 1px 0 var(--ui-glass-highlight), 0 3px 10px rgba(0, 0, 0, 0.08);
}
.contacts-card-item--suggested { align-items: start; }
.contacts-avatar {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--ui-surface-muted, var(--ui-border));
  color: var(--ui-text);
  font-size: 15px;
  font-weight: 600;
}
.contacts-who { display: grid; min-width: 0; }
.contacts-label,
.contacts-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.contacts-label { font-size: 14px; font-weight: 500; }
.contacts-sub { color: var(--ui-text-secondary); font-size: 12px; }
.contacts-icon-actions {
  position: absolute;
  top: 50%;
  right: 8px;
  display: flex;
  gap: 2px;
  transform: translateY(-50%);
}
/* With a mouse the buttons appear over the text on hover or focus, so the card keeps its whole width
   for the name. On a touch screen there is no hover: the buttons stay and the text leaves them room. */
@media (hover: hover) {
  .contacts-icon-actions {
    padding-left: 18px;
    background: linear-gradient(to right, transparent, var(--ui-surface-solid) 18px);
    border-radius: 0 12px 12px 0;
    opacity: 0;
    transition: opacity 0.12s ease;
  }
  .contacts-card-item:hover .contacts-icon-actions,
  .contacts-card-item:focus-within .contacts-icon-actions { opacity: 1; }
}
@media (hover: none) {
  .contacts-card-item:not(.contacts-card-item--suggested) .contacts-who { padding-right: 64px; }
}
.contacts-icon-btn {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 8px;
}
.contacts-card-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

/* A phone: the fields stack, the buttons go under the name. */
@media (max-width: 760px) {
  .contacts-form { grid-template-columns: minmax(0, 1fr); }
  .contacts-form-actions { justify-content: flex-end; }
  .contacts-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>

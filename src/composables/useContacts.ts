import { ref } from 'vue';
import { contacts as contactsApi, type ContactSuggestion, type ContactView } from '../api/client';

/** How long a loaded contact list is trusted before a share field asks the hub again. */
const FRESH_MS = 30_000;

const list = ref<ContactView[]>([]);
/** Potential contacts: people the user shares with, or who share with them, not saved yet. */
const suggested = ref<ContactSuggestion[]>([]);
let loadedAt = 0;
let pending: Promise<void> | null = null;

/**
 * The signed-in user's contacts, shared by every email field that offers them.
 * Loaded on first use and refreshed when stale; a failed load leaves the list as it was,
 * so a share field simply offers nothing instead of failing.
 */
export function useContacts() {
  async function ensureLoaded(force = false) {
    if (!force && Date.now() - loadedAt < FRESH_MS) return;
    if (pending) return pending;
    pending = Promise.all([
      Promise.resolve().then(() => contactsApi.list()).then(({ contacts }) => { list.value = contacts; }),
      // A hub without suggestions (or a failed call) leaves just the contacts.
      Promise.resolve().then(() => contactsApi.suggestions()).then(({ suggestions }) => { suggested.value = suggestions; }).catch(() => undefined),
    ])
      .then(() => {
        loadedAt = Date.now();
      })
      .catch(() => undefined)
      .finally(() => {
        pending = null;
      });
    return pending;
  }

  return { contacts: list, suggestions: suggested, ensureLoaded };
}

/** For tests: forget the cached list. */
export function resetContactsCache() {
  list.value = [];
  suggested.value = [];
  loadedAt = 0;
  pending = null;
}

/**
 * What an email field offers: the contacts, then the potential contacts not
 * among them - one list, so the same matching and choosing serve both.
 */
export function contactOffers(saved: ContactView[], potential: ContactSuggestion[]): ContactView[] {
  const known = new Set(saved.map((contact) => contact.email));
  return [
    ...saved,
    ...potential
      .filter((person) => !known.has(person.email))
      .map((person) => ({ id: `suggested:${person.email}`, email: person.email, name: null, userName: person.userName, createdAt: '' })),
  ];
}

/** Contacts matching what is typed: by address, own label or the registered user's name. */
export function filterContacts(items: ContactView[], query: string, exclude: string[] = [], limit = 8) {
  const needle = query.trim().toLowerCase();
  const skip = new Set(exclude.map((email) => email.trim().toLowerCase()));
  return items
    .filter((contact) => !skip.has(contact.email))
    .filter(
      (contact) =>
        !needle ||
        contact.email.includes(needle) ||
        (contact.name ?? '').toLowerCase().includes(needle) ||
        (contact.userName ?? '').toLowerCase().includes(needle),
    )
    .slice(0, limit);
}

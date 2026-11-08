// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, ref } from 'vue';
import ContactEmailInput from './ContactEmailInput.vue';
import { contacts } from '../api/client';
import { filterContacts, resetContactsCache } from '../composables/useContacts';

vi.mock('../api/client', () => ({ contacts: { list: vi.fn(), suggestions: vi.fn() } }));

const contact = (email: string, extra: { name?: string | null; userName?: string | null } = {}) => ({
  id: `id-${email}`,
  email,
  name: extra.name ?? null,
  userName: extra.userName ?? null,
  createdAt: '2026-11-06T10:00:00.000Z',
});

const BOOK = [
  contact('ann@example.test', { userName: 'Ann' }),
  contact('bob@example.test', { name: 'Бухгалтерия' }),
  contact('plain@mail.test'),
];

const mounted: { unmount: () => void }[] = [];

/** The field inside a form, as the share dialogs use it. */
function mountField(exclude: string[] = []) {
  const submitted = vi.fn();
  const Host = defineComponent({
    components: { ContactEmailInput },
    setup: () => ({ email: ref(''), exclude, submitted }),
    template: `<form @submit.prevent="submitted(email)"><ContactEmailInput v-model.trim="email" :exclude="exclude" placeholder="Email" /></form>`,
  });
  const wrapper = mount(Host, { attachTo: document.body });
  mounted.push(wrapper);
  return { wrapper, submitted };
}

const options = () =>
  Array.from(document.querySelectorAll('[data-contact-email-option]')).map((el) => el.getAttribute('data-contact-email-option'));

describe('ContactEmailInput', () => {
  beforeEach(() => {
    resetContactsCache();
    vi.mocked(contacts.list).mockResolvedValue({ contacts: BOOK });
    vi.mocked(contacts.suggestions).mockResolvedValue({ suggestions: [] });
  });
  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount());
  });

  it('offers the potential contacts after the contacts, once each, as the share menus do', async () => {
    vi.mocked(contacts.suggestions).mockResolvedValue({
      suggestions: [
        { email: 'olga@example.test', userName: 'Ольга', reasons: ['shared-by-me'] },
        // Already a contact: offered once, as the contact.
        { email: 'ann@example.test', userName: 'Ann', reasons: ['shared-with-me'] },
      ],
    });
    const { wrapper } = mountField(['plain@mail.test']);
    await wrapper.get('input').trigger('focus');
    await flushPromises();
    expect(options()).toEqual(['ann@example.test', 'bob@example.test', 'olga@example.test']);
    // Found by the registered name too.
    await wrapper.get('input').setValue('ольг');
    await flushPromises();
    expect(options()).toEqual(['olga@example.test']);
  });

  it('still offers the contacts when the hub has no potential ones', async () => {
    vi.mocked(contacts.suggestions).mockRejectedValue(new Error('404'));
    const { wrapper } = mountField();
    await wrapper.get('input').trigger('focus');
    await flushPromises();
    expect(options()).toEqual(['ann@example.test', 'bob@example.test', 'plain@mail.test']);
  });

  it('opens the contacts when the field gets the cursor', async () => {
    const { wrapper } = mountField();
    expect(options()).toEqual([]);
    await wrapper.get('input').trigger('focus');
    await flushPromises();
    expect(options()).toEqual(['ann@example.test', 'bob@example.test', 'plain@mail.test']);
    expect(wrapper.get('input').attributes('aria-expanded')).toBe('true');
  });

  it('narrows the list as one types: by address, own label or user name', async () => {
    const { wrapper } = mountField();
    const input = wrapper.get('input');
    await input.trigger('focus');
    await flushPromises();
    await input.setValue('бух');
    expect(options()).toEqual(['bob@example.test']);
    await input.setValue('ANN');
    expect(options()).toEqual(['ann@example.test']);
    await input.setValue('mail.test');
    expect(options()).toEqual(['plain@mail.test']);
    await input.setValue('nobody');
    expect(document.querySelector('[data-contact-email-list]')).toBeNull();
  });

  it('a click fills the field with the address and closes the list', async () => {
    const { wrapper } = mountField();
    await wrapper.get('input').trigger('focus');
    await flushPromises();
    document.querySelector<HTMLElement>('[data-contact-email-option="bob@example.test"]')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flushPromises();
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('bob@example.test');
    expect(document.querySelector('[data-contact-email-list]')).toBeNull();
  });

  it('arrows and Enter pick a contact without submitting the form', async () => {
    const { wrapper, submitted } = mountField();
    const input = wrapper.get('input');
    await input.trigger('focus');
    await flushPromises();
    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect((input.element as HTMLInputElement).value).toBe('bob@example.test');
    expect(submitted).not.toHaveBeenCalled();
    // With the list closed, Enter submits as before.
    await wrapper.get('form').trigger('submit');
    expect(submitted).toHaveBeenCalledWith('bob@example.test');
  });

  it('Esc closes the list', async () => {
    const { wrapper } = mountField();
    const input = wrapper.get('input');
    await input.trigger('focus');
    await flushPromises();
    await input.trigger('keydown', { key: 'Escape' });
    expect(document.querySelector('[data-contact-email-list]')).toBeNull();
  });

  it('does not offer people who already have access', async () => {
    const { wrapper } = mountField(['Ann@Example.test']);
    await wrapper.get('input').trigger('focus');
    await flushPromises();
    expect(options()).toEqual(['bob@example.test', 'plain@mail.test']);
  });

  it('with no contacts, or when they fail to load, it is a plain email field', async () => {
    vi.mocked(contacts.list).mockRejectedValue(new Error('offline'));
    const { wrapper } = mountField();
    const input = wrapper.get('input');
    await input.trigger('focus');
    await flushPromises();
    expect(document.querySelector('[data-contact-email-list]')).toBeNull();
    await input.setValue('someone@else.test');
    expect((input.element as HTMLInputElement).value).toBe('someone@else.test');
  });
});

describe('filterContacts', () => {
  it('caps the list', () => {
    const many = Array.from({ length: 20 }, (_, i) => contact(`u${i}@x.test`));
    expect(filterContacts(many, '', [], 8)).toHaveLength(8);
  });
});

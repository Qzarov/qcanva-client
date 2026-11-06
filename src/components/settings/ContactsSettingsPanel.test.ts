// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ContactsSettingsPanel from './ContactsSettingsPanel.vue';
import { ApiError, contacts } from '../../api/client';
import { useI18n } from '../../composables/useI18n';

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ApiError: actual.ApiError,
    contacts: {
      list: vi.fn(),
      create: vi.fn(),
      rename: vi.fn(),
      delete: vi.fn(),
      suggestions: vi.fn(),
      accept: vi.fn(),
      dismiss: vi.fn(),
    },
  };
});
vi.mock('../../composables/appDialog', () => ({
  alertFailure: vi.fn(),
  confirmDelete: vi.fn().mockResolvedValue(true),
  promptText: vi.fn(),
}));
vi.mock('../../composables/useToast', () => ({ useToast: () => ({ show: vi.fn() }) }));

const saved = (email: string, extra: Partial<{ name: string | null; userName: string | null }> = {}) => ({
  id: `id-${email}`,
  email,
  name: null,
  userName: null,
  createdAt: '2026-11-06T10:00:00.000Z',
  ...extra,
});

describe('ContactsSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useI18n().setLocale('en');
    vi.mocked(contacts.list).mockResolvedValue({ contacts: [saved('ann@example.test', { userName: 'Ann' })] });
    vi.mocked(contacts.suggestions).mockResolvedValue({
      suggestions: [
        { email: 'bob@example.test', userName: 'Bob', reasons: ['shared-by-me'] },
        { email: 'eve@example.test', userName: 'Eve', reasons: ['shared-with-me'] },
      ],
    });
  });

  it('shows the suggestions with why they are suggested, and the saved contacts', async () => {
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    const bob = wrapper.get('[data-contact-suggestion="bob@example.test"]');
    expect(bob.text()).toContain('Bob');
    expect(bob.text()).toContain('You shared with this address');
    expect(wrapper.get('[data-contact-suggestion="eve@example.test"]').text()).toContain('Shared with you');
    const ann = wrapper.get('[data-contact-row="ann@example.test"]');
    expect(ann.text()).toContain('Ann');
    expect(ann.text()).toContain('ann@example.test');
  });

  it('an approved suggestion moves into the contacts', async () => {
    vi.mocked(contacts.accept).mockResolvedValue({
      contacts: [saved('ann@example.test', { userName: 'Ann' }), saved('bob@example.test', { userName: 'Bob' })],
    });
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    await wrapper.get('[data-contact-suggestion="bob@example.test"] [data-contact-accept]').trigger('click');
    await flushPromises();
    expect(contacts.accept).toHaveBeenCalledWith('bob@example.test');
    expect(wrapper.find('[data-contact-suggestion="bob@example.test"]').exists()).toBe(false);
    expect(wrapper.find('[data-contact-row="bob@example.test"]').exists()).toBe(true);
  });

  it('a declined suggestion disappears without becoming a contact', async () => {
    vi.mocked(contacts.dismiss).mockResolvedValue({
      suggestions: [{ email: 'bob@example.test', userName: 'Bob', reasons: ['shared-by-me'] }],
    });
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    await wrapper.get('[data-contact-suggestion="eve@example.test"] [data-contact-dismiss]').trigger('click');
    await flushPromises();
    expect(contacts.dismiss).toHaveBeenCalledWith('eve@example.test');
    expect(wrapper.find('[data-contact-suggestion="eve@example.test"]').exists()).toBe(false);
    expect(wrapper.find('[data-contact-row="eve@example.test"]').exists()).toBe(false);
  });

  it('hides the suggested block when there is nothing to suggest', async () => {
    vi.mocked(contacts.suggestions).mockResolvedValue({ suggestions: [] });
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    expect(wrapper.find('[data-contacts-suggested]').exists()).toBe(false);
  });

  it('adds any email with an optional label, and shows the label without repeating it', async () => {
    vi.mocked(contacts.create).mockResolvedValue({
      contacts: [saved('ann@example.test', { userName: 'Ann' }), saved('partner@mail.test', { name: 'Partner' })],
    });
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    await wrapper.get('[data-contact-email]').setValue('partner@mail.test');
    await wrapper.get('[data-contact-name]').setValue('Partner');
    await wrapper.get('[data-contact-form]').trigger('submit');
    await flushPromises();
    expect(contacts.create).toHaveBeenCalledWith({ email: 'partner@mail.test', name: 'Partner' });
    expect(wrapper.get('[data-contact-row="partner@mail.test"]').text()).toContain('Partner');
    expect((wrapper.get('[data-contact-email]').element as HTMLInputElement).value).toBe('');
  });

  it('an address without a name is shown once', async () => {
    vi.mocked(contacts.list).mockResolvedValue({ contacts: [saved('plain@mail.test')] });
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    const row = wrapper.get('[data-contact-row="plain@mail.test"]');
    expect(row.text().split('plain@mail.test').length - 1).toBe(1);
  });

  it('says in words why an address was not added', async () => {
    vi.mocked(contacts.create).mockRejectedValue(new ApiError(409, 'contact_exists'));
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    await wrapper.get('[data-contact-email]').setValue('ann@example.test');
    await wrapper.get('[data-contact-form]').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[data-contact-error]').text()).toBe('This address is already in your contacts');
  });
});

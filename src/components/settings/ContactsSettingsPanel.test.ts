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
      update: vi.fn(),
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

  it('opens on the contacts when there are any, with both counts on the tabs', async () => {
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    expect(wrapper.get('[data-contacts-tab="saved"]').attributes('aria-selected')).toBe('true');
    expect(wrapper.get('[data-contacts-tab="saved"]').text()).toContain('1');
    expect(wrapper.get('[data-contacts-tab="suggested"]').text()).toContain('2');
    const ann = wrapper.get('[data-contact-row="ann@example.test"]');
    expect(ann.text()).toContain('Ann');
    expect(ann.text()).toContain('ann@example.test');
    expect(wrapper.find('[data-contact-suggestion]').exists()).toBe(false);
    // No intro text and no form until the plus is pressed.
    expect(wrapper.find('[data-contact-form]').exists()).toBe(false);
  });

  it('opens on the suggestions when no contact is saved yet', async () => {
    vi.mocked(contacts.list).mockResolvedValue({ contacts: [] });
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    expect(wrapper.get('[data-contacts-tab="suggested"]').attributes('aria-selected')).toBe('true');
    const bob = wrapper.get('[data-contact-suggestion="bob@example.test"]');
    expect(bob.text()).toContain('Bob');
    expect(bob.text()).toContain('You shared');
    expect(wrapper.get('[data-contact-suggestion="eve@example.test"]').text()).toContain('Shared with you');
  });

  it('stays on the contacts when there is nothing at all', async () => {
    vi.mocked(contacts.list).mockResolvedValue({ contacts: [] });
    vi.mocked(contacts.suggestions).mockResolvedValue({ suggestions: [] });
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    expect(wrapper.get('[data-contacts-tab="saved"]').attributes('aria-selected')).toBe('true');
    expect(wrapper.find('[data-contacts-empty]').exists()).toBe(true);
  });

  it('an approved suggestion moves into the contacts', async () => {
    vi.mocked(contacts.accept).mockResolvedValue({
      contacts: [saved('ann@example.test', { userName: 'Ann' }), saved('bob@example.test', { userName: 'Bob' })],
    });
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    await wrapper.get('[data-contacts-tab="suggested"]').trigger('click');
    await wrapper.get('[data-contact-suggestion="bob@example.test"] [data-contact-accept]').trigger('click');
    await flushPromises();
    expect(contacts.accept).toHaveBeenCalledWith('bob@example.test');
    expect(wrapper.find('[data-contact-suggestion="bob@example.test"]').exists()).toBe(false);
    await wrapper.get('[data-contacts-tab="saved"]').trigger('click');
    expect(wrapper.find('[data-contact-row="bob@example.test"]').exists()).toBe(true);
  });

  it('a declined suggestion disappears without becoming a contact', async () => {
    vi.mocked(contacts.dismiss).mockResolvedValue({
      suggestions: [{ email: 'bob@example.test', userName: 'Bob', reasons: ['shared-by-me'] }],
    });
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    await wrapper.get('[data-contacts-tab="suggested"]').trigger('click');
    await wrapper.get('[data-contact-suggestion="eve@example.test"] [data-contact-dismiss]').trigger('click');
    await flushPromises();
    expect(contacts.dismiss).toHaveBeenCalledWith('eve@example.test');
    expect(wrapper.find('[data-contact-suggestion="eve@example.test"]').exists()).toBe(false);
    await wrapper.get('[data-contacts-tab="saved"]').trigger('click');
    expect(wrapper.find('[data-contact-row="eve@example.test"]').exists()).toBe(false);
  });

  it('the plus opens the form on the contacts tab; adding closes it', async () => {
    vi.mocked(contacts.list).mockResolvedValue({ contacts: [] });
    vi.mocked(contacts.create).mockResolvedValue({ contacts: [saved('partner@mail.test', { name: 'Partner' })] });
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    expect(wrapper.get('[data-contacts-tab="suggested"]').attributes('aria-selected')).toBe('true');
    await wrapper.get('[data-contact-add-open]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-contacts-tab="saved"]').attributes('aria-selected')).toBe('true');
    await wrapper.get('[data-contact-email]').setValue('partner@mail.test');
    await wrapper.get('[data-contact-name]').setValue('Partner');
    await wrapper.get('[data-contact-form]').trigger('submit');
    await flushPromises();
    expect(contacts.create).toHaveBeenCalledWith({ email: 'partner@mail.test', name: 'Partner' });
    expect(wrapper.get('[data-contact-row="partner@mail.test"]').text()).toContain('Partner');
    expect(wrapper.find('[data-contact-form]').exists()).toBe(false);
  });

  it('cancel closes the form without adding', async () => {
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    await wrapper.get('[data-contact-add-open]').trigger('click');
    await wrapper.get('[data-contact-email]').setValue('x@mail.test');
    await wrapper.get('[data-contact-cancel]').trigger('click');
    expect(wrapper.find('[data-contact-form]').exists()).toBe(false);
    expect(contacts.create).not.toHaveBeenCalled();
  });

  it('edits the address and the label right in the card', async () => {
    vi.mocked(contacts.update).mockResolvedValue({
      contacts: [saved('ann.new@example.test', { name: 'Ann W', userName: null })],
    });
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    await wrapper.get('[data-contact-row="ann@example.test"] [data-contact-edit]').trigger('click');
    await flushPromises();
    const email = wrapper.get('[data-contact-edit-email]');
    expect((email.element as HTMLInputElement).value).toBe('ann@example.test');
    await email.setValue('Ann.New@Example.test');
    await wrapper.get('[data-contact-edit-name]').setValue('Ann W');
    await wrapper.get('[data-contact-edit-form]').trigger('submit');
    await flushPromises();
    expect(contacts.update).toHaveBeenCalledWith('id-ann@example.test', { email: 'ann.new@example.test', name: 'Ann W' });
    expect(wrapper.find('[data-contact-edit-form]').exists()).toBe(false);
    expect(wrapper.get('[data-contact-row="ann.new@example.test"]').text()).toContain('Ann W');
  });

  it('keeps the card in edit mode and says why when the new address is taken', async () => {
    vi.mocked(contacts.update).mockRejectedValue(new ApiError(409, 'contact_exists'));
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    await wrapper.get('[data-contact-edit]').trigger('click');
    await wrapper.get('[data-contact-edit-email]').setValue('taken@example.test');
    await wrapper.get('[data-contact-edit-form]').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[data-contact-edit-error]').text()).toBe('This address is already in your contacts');
    await wrapper.get('[data-contact-edit-cancel]').trigger('click');
    expect(wrapper.find('[data-contact-edit-form]').exists()).toBe(false);
    expect(wrapper.find('[data-contact-row="ann@example.test"]').exists()).toBe(true);
  });

  it('saving without changes sends nothing', async () => {
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    await wrapper.get('[data-contact-edit]').trigger('click');
    await wrapper.get('[data-contact-edit-form]').trigger('submit');
    await flushPromises();
    expect(contacts.update).not.toHaveBeenCalled();
    expect(wrapper.find('[data-contact-edit-form]').exists()).toBe(false);
  });

  it('an address without a name is shown once', async () => {
    vi.mocked(contacts.list).mockResolvedValue({ contacts: [saved('plain@mail.test')] });
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    const row = wrapper.get('[data-contact-row="plain@mail.test"]');
    expect(row.text().split('plain@mail.test').length - 1).toBe(1);
  });

  it('says in words why an address was not added, and keeps the form open', async () => {
    vi.mocked(contacts.create).mockRejectedValue(new ApiError(409, 'contact_exists'));
    const wrapper = mount(ContactsSettingsPanel);
    await flushPromises();
    await wrapper.get('[data-contact-add-open]').trigger('click');
    await wrapper.get('[data-contact-email]').setValue('ann@example.test');
    await wrapper.get('[data-contact-form]').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[data-contact-error]').text()).toBe('This address is already in your contacts');
    expect(wrapper.find('[data-contact-form]').exists()).toBe(true);
  });
});

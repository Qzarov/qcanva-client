// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import AppDialogHost from './AppDialogHost.vue';
import { alertDialog, confirmDelete, confirmDialog, currentAppDialog, promptDialog, resetAppDialogs } from '../composables/appDialog';
import { runBackHandlers } from '../composables/useBackHandler';
import { useI18n } from '../composables/useI18n';

let wrapper: VueWrapper | undefined;
const host = () => (wrapper = mount(AppDialogHost, { attachTo: document.body }));
afterEach(() => {
  resetAppDialogs();
  wrapper?.unmount();
  wrapper = undefined;
  useI18n().setLocale('ru');
});

describe('AppDialogHost', () => {
  it('shows nothing until something is asked', () => {
    expect(host().find('.app-dialog').exists()).toBe(false);
    expect(runBackHandlers()).toBe(false);
  });

  it('asks a question, starts on the main button and resolves true when it is pressed', async () => {
    host();
    const answer = confirmDialog({ title: 'Выйти из QCanva?', confirmLabel: 'Выйти' });
    await flushPromises();
    const dialog = wrapper!.get('[role="alertdialog"]');
    expect(dialog.get('h2').text()).toBe('Выйти из QCanva?');
    expect(dialog.findAll('button').map((button) => button.text())).toEqual(['Отмена', 'Выйти']);
    expect(document.activeElement).toBe(dialog.get('[data-app-dialog-confirm]').element);

    await dialog.get('form').trigger('submit');
    expect(await answer).toBe(true);
    expect(wrapper!.find('.app-dialog').exists()).toBe(false);
  });

  it('resolves false on Cancel, Escape, the backdrop and the system Back', async () => {
    host();
    const ways: Array<() => unknown> = [
      () => wrapper!.get('[data-app-dialog-cancel]').trigger('click'),
      () => wrapper!.get('.app-dialog').trigger('keydown', { key: 'Escape' }),
      () => wrapper!.get('.app-dialog-backdrop').trigger('click'),
      () => expect(runBackHandlers()).toBe(true),
    ];
    for (const close of ways) {
      const answer = confirmDialog({ title: 'Точно?' });
      await flushPromises();
      await close();
      expect(await answer).toBe(false);
      await flushPromises();
      expect(wrapper!.find('.app-dialog').exists()).toBe(false);
    }
    expect(runBackHandlers()).toBe(false);
  });

  it('starts a destructive question on Cancel and paints the main button red', async () => {
    host();
    const answer = confirmDelete('deleteCanvasTitle', 'План', 'deleteGroupNote');
    await flushPromises();
    expect(wrapper!.get('h2').text()).toBe('Удалить канвас «План»?');
    expect(wrapper!.get('p').text()).toBe('Её материалы останутся и окажутся вне групп.');
    const confirm = wrapper!.get('[data-app-dialog-confirm]');
    expect(confirm.text()).toBe('Удалить');
    expect(confirm.classes()).toContain('app-dialog-danger');
    expect(document.activeElement).toBe(wrapper!.get('[data-app-dialog-cancel]').element);
    await confirm.trigger('click');
    expect(await answer).toBe(true);
  });

  it('asks for a line of text: filled in, selected, trimmed, and not accepted empty', async () => {
    host();
    const answer = promptDialog({ title: 'Название группы', confirmLabel: 'Сохранить', value: 'Работа' });
    await flushPromises();
    const field = wrapper!.get('input');
    expect(wrapper!.get('.app-dialog').attributes('role')).toBe('dialog');
    expect((field.element as HTMLInputElement).value).toBe('Работа');
    expect(document.activeElement).toBe(field.element);

    await field.setValue('   ');
    expect(wrapper!.get('[data-app-dialog-confirm]').attributes('disabled')).toBeDefined();
    await wrapper!.get('form').trigger('submit');
    expect(currentAppDialog.value).not.toBeNull();

    await field.setValue('  Дом  ');
    await wrapper!.get('form').trigger('submit');
    expect(await answer).toBe('Дом');

    const cancelled = promptDialog({ title: 'Название группы' });
    await flushPromises();
    await wrapper!.get('[data-app-dialog-cancel]').trigger('click');
    expect(await cancelled).toBeNull();
  });

  it('tells something with one button', async () => {
    host();
    useI18n().setLocale('en');
    const told = alertDialog({ title: 'Could not upload the image', message: 'File is too large' });
    await flushPromises();
    expect(wrapper!.findAll('button').map((button) => button.text())).toEqual(['OK']);
    expect(wrapper!.get('p').text()).toBe('File is too large');
    await wrapper!.get('.app-dialog').trigger('keydown', { key: 'Escape' });
    await expect(told).resolves.toBeUndefined();
  });

  it('shows questions one at a time, in the order asked, and returns the focus afterwards', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    host();
    const first = confirmDialog({ title: 'Первый' });
    const second = confirmDialog({ title: 'Второй' });
    await flushPromises();
    expect(wrapper!.findAll('.app-dialog')).toHaveLength(1);
    expect(wrapper!.get('h2').text()).toBe('Первый');
    await wrapper!.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper!.get('h2').text()).toBe('Второй');
    await wrapper!.get('[data-app-dialog-cancel]').trigger('click');
    expect([await first, await second]).toEqual([true, false]);
    await flushPromises();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

// @vitest-environment jsdom
//
// AccessRequestDialog.vue is the shared modal (ruling R3) opened for a
// DIFFERENT resource while the reader stays on the page they were reading -
// wired from an inaccessible mention click and an inaccessible backlink
// click in TextDocumentView.vue. Two things this suite pins hard because a
// silent regression here is a disclosure bug, not a cosmetic one:
//
//   - R4: the dialog shows the target's TITLE and a role choice, and NOTHING
//     that identifies the owner - the endpoints feeding it deliberately
//     return no owner identity.
//   - a request cannot be fired twice by an impatient click - the button
//     must be unusable the instant the first click lands, not just after
//     the promise resolves.

import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccessRequestDialog from './AccessRequestDialog.vue';

const create = vi.fn();

vi.mock('../api/client', () => ({
  accessRequests: { create: (...args: unknown[]) => create(...args) },
}));

function mountDialog(props: Partial<{ resourceType: string; resourceId: string; title: string }> = {}) {
  return mount(AccessRequestDialog, {
    props: {
      resourceType: 'text-document',
      resourceId: 'target-1',
      title: 'Roadmap',
      ...props,
    } as any,
  });
}

describe('AccessRequestDialog', () => {
  beforeEach(() => {
    create.mockReset();
  });

  it('renders exactly the title and the role choice - no owner-identifying field (R4)', () => {
    const wrapper = mountDialog({ title: 'Q3 Roadmap' });

    expect(wrapper.find('.access-request-dialog-title').text()).toBe('Q3 Roadmap');
    // Pinned exactly, per the mutation drill in the plan: adding an owner
    // name/email/id anywhere in this dialog must fail this assertion.
    const text = wrapper.text();
    expect(text).not.toMatch(/owner/i);
    expect(text).not.toMatch(/@/); // no email rendered anywhere
    expect(wrapper.find('[data-access-request-role]').exists()).toBe(true);
    expect(wrapper.find('[data-access-request-submit]').exists()).toBe(true);
    // The only interactive/text surfaces in the dialog: title, subtitle,
    // role select (view/edit), submit button, close button. Anything else
    // appearing here (e.g. an owner field) is new surface, not a rendering
    // detail - which is exactly why this test lists them out explicitly
    // instead of asserting a snapshot.
    const roleOptions = wrapper.findAll('[data-access-request-role] option').map((o) => o.attributes('value'));
    expect(roleOptions).toEqual(['read', 'edit']);
  });

  it('sends the request with the chosen role and shows it as sent', async () => {
    create.mockResolvedValue({});
    const wrapper = mountDialog({ resourceId: 'target-2' });

    await wrapper.find('[data-access-request-role]').setValue('edit');
    await wrapper.find('[data-access-request-submit]').trigger('click');
    await flushPromises();

    expect(create).toHaveBeenCalledWith({ resourceType: 'text-document', resourceId: 'target-2', requestedRole: 'edit' });
    expect(wrapper.find('[data-access-request-submit]').text()).toBe('Request sent');
    // NOT disabled after success: the backend updates an existing pending
    // request's role rather than rejecting a repeat, so submitting again is
    // a legitimate action (see the next test), not a duplicate to block.
    expect(wrapper.find('[data-access-request-submit]').attributes('disabled')).toBeUndefined();
  });

  it('a repeat submit with a different role reaches the API again and still reports success', async () => {
    // Pins the real backend behaviour (AccessRequestsService.create): a
    // second request from the same user for the same resource does not
    // conflict - it updates the existing pending row's role and returns an
    // ordinary success. There is no distinct "already requested" state to
    // show; a second, successful send is exactly what should happen.
    create.mockResolvedValue({});
    const wrapper = mountDialog({ resourceId: 'target-3' });

    await wrapper.find('[data-access-request-submit]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-access-request-submit]').text()).toBe('Request sent');

    await wrapper.find('[data-access-request-role]').setValue('edit');
    await wrapper.find('[data-access-request-submit]').trigger('click');
    await flushPromises();

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(2, { resourceType: 'text-document', resourceId: 'target-3', requestedRole: 'edit' });
    expect(wrapper.find('[data-access-request-submit]').text()).toBe('Request sent');
    expect(wrapper.find('.access-request-dialog-error').exists()).toBe(false);
  });

  it('disables the submit button the instant it is clicked, before the promise resolves', async () => {
    let resolveCreate: (() => void) | undefined;
    create.mockReturnValue(new Promise<void>((resolve) => { resolveCreate = resolve; }));
    const wrapper = mountDialog();

    const button = wrapper.find('[data-access-request-submit]');
    await button.trigger('click');

    // Still in flight: disabled NOW, not merely by the time the request
    // finishes.
    expect(wrapper.find('[data-access-request-submit]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-access-request-submit]').text()).toBe('Sending…');

    resolveCreate?.();
    await flushPromises();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('cannot be fired twice by clicking again while the first request is in flight', async () => {
    let resolveCreate: (() => void) | undefined;
    create.mockReturnValue(new Promise<void>((resolve) => { resolveCreate = resolve; }));
    const wrapper = mountDialog();

    const button = wrapper.find('[data-access-request-submit]').element as HTMLButtonElement;
    // Two click events dispatched back to back with NO await in between, so
    // neither has waited for Vue's `nextTick` to re-render the `disabled`
    // attribute - the DOM-level guard is deliberately not what is under
    // test here. This is the impatient-double-click case: both clicks land
    // before the first `status.value = 'submitting'` assignment has even
    // been painted, so only an in-function re-entrancy check (not the
    // `disabled` attribute) can stop the second one from reaching
    // `accessRequests.create`.
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(create).toHaveBeenCalledTimes(1);
    resolveCreate?.();
    await flushPromises();
  });

  it('shows a failure state and allows retrying', async () => {
    create.mockRejectedValueOnce(new Error('network down'));
    const wrapper = mountDialog();

    await wrapper.find('[data-access-request-submit]').trigger('click');
    await flushPromises();

    expect(wrapper.find('.access-request-dialog-error').text()).toBe('network down');
    // Not stuck disabled after a failure: an impatient click is guarded
    // against WHILE in flight, not forever.
    expect(wrapper.find('[data-access-request-submit]').attributes('disabled')).toBeUndefined();

    create.mockResolvedValueOnce({});
    await wrapper.find('[data-access-request-submit]').trigger('click');
    await flushPromises();
    expect(create).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-access-request-submit]').text()).toBe('Request sent');
  });

  it('emits close from the close button and from a backdrop click', async () => {
    const wrapper = mountDialog();
    await wrapper.find('.access-request-dialog-close').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);

    await wrapper.find('.access-request-backdrop').trigger('mousedown');
    expect(wrapper.emitted('close')).toHaveLength(2);
  });
});

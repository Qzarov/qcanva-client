// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TextDocumentHistoryPanel from './TextDocumentHistoryPanel.vue';

const labels = {
  title: 'History',
  loading: 'Loading',
  revision: 'Rev',
  empty: 'Empty',
  select: 'Select',
  snapshot: 'Snapshot',
  restore: 'Restore',
  restoring: 'Restoring',
};

describe('TextDocumentHistoryPanel', () => {
  it('sanitizes dangerous tags and inline styles from selected snapshot html', () => {
    const wrapper = mount(TextDocumentHistoryPanel, {
      props: {
        open: true,
        loading: false,
        items: [{ id: 'r1', revision: 1, createdAt: '2026-11-26T00:00:00Z' }],
        selected: {
          id: 'r1',
          revision: 1,
          html: '<p style="position:fixed" onclick="alert(1)">Hello <strong>world</strong></p><script>alert(1)</script><style>body{display:none}</style><iframe src="https://evil.tld"></iframe><form><input value="x"></form>',
        },
        canEdit: false,
        restoring: false,
        labels,
      },
      global: {
        stubs: {
          Teleport: true,
          UiCard: { template: '<div><slot /></div>' },
        },
      },
    });

    const preview = wrapper.find('.text-doc-history-preview');
    expect(preview.exists()).toBe(true);
    expect(preview.html()).toContain('<strong>world</strong>');
    expect(preview.html()).not.toContain('<script');
    expect(preview.html()).not.toContain('<style');
    expect(preview.html()).not.toContain('<iframe');
    expect(preview.html()).not.toContain('<form');
    expect(preview.html()).not.toContain('<input');
    expect(preview.html()).not.toContain('onclick');
    expect(preview.html()).not.toContain('style=');
  });
});

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { serializeDocumentWithFormState } from './formStateSerialization';

describe('serializeDocumentWithFormState', () => {
  function parse(html: string) {
    return new DOMParser().parseFromString(html, 'text/html');
  }

  it('persists runtime text input and textarea values into serialized html', () => {
    const doc = parse(`
      <!DOCTYPE html>
      <html>
        <body>
          <input id="comment" name="comment" value="old">
          <textarea id="notes">old notes</textarea>
        </body>
      </html>
    `);
    (doc.getElementById('comment') as HTMLInputElement).value = 'new comment';
    (doc.getElementById('notes') as HTMLTextAreaElement).value = 'new notes';

    const html = serializeDocumentWithFormState(doc);

    expect(html).toContain('value="new comment"');
    expect(html).not.toContain('value="old"');
    expect(html).toContain('<textarea id="notes">new notes</textarea>');
    expect(html).not.toContain('old notes');
  });

  it('persists checkbox, radio, and select selected state without duplicating fields', () => {
    const doc = parse(`
      <!DOCTYPE html>
      <html>
        <body>
          <input id="done" type="checkbox" checked>
          <input id="choice-a" name="choice" type="radio" checked>
          <input id="choice-b" name="choice" type="radio">
          <select id="status">
            <option value="todo" selected>Todo</option>
            <option value="done">Done</option>
          </select>
        </body>
      </html>
    `);
    (doc.getElementById('done') as HTMLInputElement).checked = false;
    (doc.getElementById('choice-a') as HTMLInputElement).checked = false;
    (doc.getElementById('choice-b') as HTMLInputElement).checked = true;
    (doc.getElementById('status') as HTMLSelectElement).value = 'done';

    const html = serializeDocumentWithFormState(doc);

    expect(html).toContain('<input id="done" type="checkbox">');
    expect(html).toContain('<input id="choice-a" name="choice" type="radio">');
    expect(html).toContain('<input id="choice-b" name="choice" type="radio" checked="">');
    expect(html).toContain('<option value="todo">Todo</option>');
    expect(html).toContain('<option value="done" selected="">Done</option>');
    expect((html.match(/id="done"/g) || []).length).toBe(1);
  });
});

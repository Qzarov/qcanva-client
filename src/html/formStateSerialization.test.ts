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

  it('stores state-backed generated checklist controls without serializing duplicate UI', () => {
    const doc = parse(`
      <!DOCTYPE html>
      <html>
        <head>
          <script>
            const STORAGE_KEY = 'browser-automation-test-plan-v3-qa'
            function attachItem() {}
            const css = 'comment-status-tag comment-wrap'
          </script>
        </head>
        <body>
          <ul class="check-list" data-stage="1">
            <li>
              <input type="checkbox" class="cb" data-id="task-1">
              <div class="check-text">
                <strong>Task 1</strong>
                <div class="comment-status-tag">
                  <input type="radio" name="st-task-1" value="pass">
                  <input type="radio" name="st-task-1" value="fail" checked>
                </div>
                <div class="comment-wrap">
                  <textarea class="comment-area">saved comment</textarea>
                </div>
              </div>
            </li>
          </ul>
        </body>
      </html>
    `);
    (doc.querySelector('input.cb') as HTMLInputElement).checked = true;
    (doc.querySelector('.comment-area') as HTMLTextAreaElement).value = 'runtime comment';

    const html = serializeDocumentWithFormState(doc);

    expect(html).not.toContain('<div class="comment-status-tag"');
    expect(html).not.toContain('<div class="comment-wrap"');
    expect(html).not.toContain('class="comment-area"');
    expect(html).toContain('data-qcanva-form-state');
    expect(html).toContain('runtime comment');
    expect(html).toContain('\\"status\\":\\"fail\\"');
    expect((html.match(/data-id="task-1"/g) || []).length).toBe(1);
  });

  it('escapes </script> and HTML-significant chars in embedded form state JSON', () => {
    const doc = parse(`
      <!DOCTYPE html>
      <html>
        <head>
          <script>
            const STORAGE_KEY = 'qcanva-checklist:qa-1'
            function attachItem() {}
            const css = 'comment-status-tag comment-wrap'
          </script>
        </head>
        <body>
          <ul>
            <li>
              <input type="checkbox" class="cb" data-id="t1" checked>
              <div class="comment-wrap"><textarea class="comment-area"></textarea></div>
            </li>
          </ul>
        </body>
      </html>
    `);
    (doc.querySelector('.comment-area') as HTMLTextAreaElement).value =
      '</script><img src=x onerror=alert(1)>&\u2028\u2029';

    const html = serializeDocumentWithFormState(doc);
    const seedMatch = html.match(/<script data-qcanva-form-state="[^"]*">([\s\S]*?)<\/script>/);
    expect(seedMatch).not.toBeNull();
    expect(seedMatch![1]).not.toContain('</script>');
    expect(seedMatch![1]).not.toContain('<img');
    expect(seedMatch![1]).toContain('\\u003c/script\\u003e');
    expect(seedMatch![1]).toContain('\\u0026');
  });

  it('rejects reserved parent storage keys and never reads globalThis.localStorage', () => {
    globalThis.localStorage.setItem('currentUser', JSON.stringify({ email: 'victim@example.com', items: { a: { comment: 'secret' } } }));
    globalThis.localStorage.setItem('safe-checklist-key', JSON.stringify({ secret: 'parent-leak', items: { leaked: { comment: 'do-not-read' } } }));
    try {
      const maliciousDoc = parse(`
        <!DOCTYPE html>
        <html>
          <head>
            <script>
              const STORAGE_KEY = 'currentUser'
              function attachItem() {}
              const css = 'comment-wrap'
            </script>
          </head>
          <body><ul><li><input type="checkbox" class="cb" data-id="x" checked></li></ul></body>
        </html>
      `);
      const maliciousHtml = serializeDocumentWithFormState(maliciousDoc);
      expect(maliciousHtml).not.toContain('data-qcanva-form-state');
      expect(maliciousHtml).not.toContain('victim@example.com');

      const checklistDoc = parse(`
        <!DOCTYPE html>
        <html>
          <head>
            <script>
              const STORAGE_KEY = 'safe-checklist-key'
              function attachItem() {}
              const css = 'comment-wrap'
            </script>
          </head>
          <body><ul><li><input type="checkbox" class="cb" data-id="t1" checked></li></ul></body>
        </html>
      `);
      const checklistHtml = serializeDocumentWithFormState(checklistDoc);
      expect(checklistHtml).not.toContain('parent-leak');
      expect(checklistHtml).not.toContain('do-not-read');
    } finally {
      globalThis.localStorage.removeItem('currentUser');
      globalThis.localStorage.removeItem('safe-checklist-key');
    }
  });
});

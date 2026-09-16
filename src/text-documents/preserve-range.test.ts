// @vitest-environment jsdom
//
// A real minimal TipTap editor (not a mock) so the mapping is exercised
// against actual ProseMirror transactions, the same way
// TextDocumentView.slashMenu.test.ts prefers the real editor over a stub.

import { Editor } from '@tiptap/core';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { describe, expect, it } from 'vitest';
import { trackRange } from './preserve-range';

function makeEditor(content: string) {
  return new Editor({ extensions: [Document, Paragraph, Text], content });
}

describe('trackRange', () => {
  it('returns the original range unchanged if nothing else happens', () => {
    const editor = makeEditor('<p>hello world</p>');
    const range = { from: 1, to: 6 }; // "hello"
    const tracker = trackRange(editor, range);
    expect(tracker.resolve()).toEqual({ from: 1, to: 6 });
    tracker.stop();
    editor.destroy();
  });

  it('shifts the range forward when text is inserted earlier in the document', () => {
    const editor = makeEditor('<p>hello world</p>');
    const range = { from: 7, to: 12 }; // "world"
    const tracker = trackRange(editor, range);

    // Simulate a collaborator inserting "XX " right at the start of the
    // paragraph, before the tracked range - this is exactly the case a
    // captured {from, to} pair alone would get wrong after an `await`.
    editor.chain().setTextSelection(1).insertContent('XX ').run();

    expect(tracker.resolve()).toEqual({ from: 10, to: 15 });
    tracker.stop();
    editor.destroy();
  });

  it('stops updating once stop() is called', () => {
    const editor = makeEditor('<p>hello world</p>');
    const range = { from: 7, to: 12 };
    const tracker = trackRange(editor, range);
    tracker.stop();

    editor.chain().setTextSelection(1).insertContent('XX ').run();

    // No longer tracking, so resolve() still reports the ORIGINAL numbers -
    // callers must call resolve() before stop().
    expect(tracker.resolve()).toEqual({ from: 7, to: 12 });
    editor.destroy();
  });
});

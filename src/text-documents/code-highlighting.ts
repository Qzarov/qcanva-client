// A fixed, small set of syntax-highlighting grammars for the text document
// code block. This view's chunk is already the largest in the app, so
// grammars are imported one at a time from highlight.js's own language
// files rather than pulling lowlight's "all" bundle (hundreds of KB more).
//
// Registering a language also registers its highlight.js aliases (e.g.
// "xml" also answers to "html", "javascript" also answers to "js"), so a
// code block whose language is one of those aliases still highlights.
import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';

export const lowlight = createLowlight();

lowlight.register({
  bash,
  css,
  javascript,
  json,
  python,
  sql,
  typescript,
  xml,
});

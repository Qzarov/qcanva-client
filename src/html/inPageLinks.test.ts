// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { bindInPageLinks } from './inPageLinks';

function documentWith(body: string): Document {
  const doc = document.implementation.createHTMLDocument('doc');
  doc.body.innerHTML = body;
  bindInPageLinks(doc);
  return doc;
}

function click(element: Element, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
  element.dispatchEvent(event);
  return event;
}

describe('bindInPageLinks', () => {
  it('scrolls to the anchor instead of navigating, also from inside the link', () => {
    const doc = documentWith('<a href="#in-progress"><span>В работе</span></a><h2 id="in-progress">В работе</h2>');
    const target = doc.getElementById('in-progress')!;
    target.scrollIntoView = vi.fn();

    const event = click(doc.querySelector('span')!);

    expect(event.defaultPrevented).toBe(true);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('finds a percent-encoded id and a named anchor', () => {
    const doc = documentWith('<a id="a" href="#%D1%80%D0%B0%D0%B7%D0%B4%D0%B5%D0%BB">x</a><a id="b" href="#old">y</a><h2 id="раздел"></h2><a name="old"></a>');
    const encoded = doc.getElementById('раздел')!;
    const named = doc.getElementsByName('old')[0]!;
    encoded.scrollIntoView = vi.fn();
    named.scrollIntoView = vi.fn();

    click(doc.getElementById('a')!);
    click(doc.getElementById('b')!);

    expect(encoded.scrollIntoView).toHaveBeenCalled();
    expect(named.scrollIntoView).toHaveBeenCalled();
  });

  it('leaves other links, and modified clicks, to the browser', () => {
    const doc = documentWith('<a id="out" href="https://example.com">out</a><a id="in" href="#x">in</a><h2 id="x"></h2>');

    expect(click(doc.getElementById('out')!).defaultPrevented).toBe(false);
    expect(click(doc.getElementById('in')!, { ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it('stays put for an anchor that names nothing', () => {
    const doc = documentWith('<a id="gone" href="#missing">gone</a>');

    expect(click(doc.getElementById('gone')!).defaultPrevented).toBe(true);
  });
});

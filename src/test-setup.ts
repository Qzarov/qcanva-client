// jsdom implements no layout, so it never defines Element.scrollIntoView at
// all (unlike a real browser, where it always exists). Any component that
// calls it - a popup keeping its highlighted item in view, for one - throws
// an unhandled rejection in every test that exercises that path, regardless
// of whether the test cares about scrolling. A no-op polyfill here fixes
// that globally; a test that DOES care can still `vi.spyOn` over it.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// Same gap, on Range this time: jsdom implements no layout, so
// Range.prototype.getClientRects/getBoundingClientRect don't exist at all
// (unlike a real browser, where they always exist and return zeroed rects
// for content with no layout box). ProseMirror's own coordsAtPos - used by
// any BubbleMenu's tippy positioning, not just one feature's - calls
// target.getClientRects() on a Range for a text position and throws
// "target.getClientRects is not a function" if it's missing. That throw
// happens inside popper's own async post-update loop, AFTER a test that
// opened a BubbleMenu has already finished and asserted - so it never fails
// the test itself, but it DOES surface as an unhandled rejection, which
// fails the overall `vitest run` exit code (and with it, this project's
// deploy script, which treats any non-zero exit from `npm run test:unit` as
// a failed release). A zeroed DOMRect/empty rect list is exactly what a real
// browser returns here, so this is a correctness fix, not a suppression.
if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
  const zeroRect = (): DOMRect => ({
    top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0,
    toJSON() { return this; },
  });
  Range.prototype.getClientRects = function getClientRects() {
    return [] as unknown as DOMRectList;
  };
  Range.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return zeroRect();
  };
}

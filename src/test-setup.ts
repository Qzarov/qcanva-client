// jsdom implements no layout, so it never defines Element.scrollIntoView at
// all (unlike a real browser, where it always exists). Any component that
// calls it - a popup keeping its highlighted item in view, for one - throws
// an unhandled rejection in every test that exercises that path, regardless
// of whether the test cares about scrolling. A no-op polyfill here fixes
// that globally; a test that DOES care can still `vi.spyOn` over it.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

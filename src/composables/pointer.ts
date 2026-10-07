/**
 * True when the main way in is a finger (a phone or a tablet). Dialogs use it
 * to decide where the focus goes when they open: on a touch screen, focusing a
 * text field raises the system keyboard over half the dialog before the person
 * has asked to type anything.
 */
export function isCoarsePointer(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

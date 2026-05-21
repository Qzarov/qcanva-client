export type FrameScrollPosition = {
  x: number;
  y: number;
};

export function captureFrameScroll(frame: HTMLIFrameElement | null): FrameScrollPosition | null {
  const win = frame?.contentWindow;
  const doc = frame?.contentDocument;
  if (!win && !doc) return null;

  return {
    x: win?.scrollX ?? doc?.documentElement?.scrollLeft ?? doc?.body?.scrollLeft ?? 0,
    y: win?.scrollY ?? doc?.documentElement?.scrollTop ?? doc?.body?.scrollTop ?? 0,
  };
}

export function restoreFrameScroll(frame: HTMLIFrameElement | null, position: FrameScrollPosition | null) {
  if (!frame || !position) return;

  const win = frame.contentWindow;
  if (win?.scrollTo) {
    win.scrollTo(position.x, position.y);
    return;
  }

  const doc = frame.contentDocument;
  if (doc?.documentElement) {
    doc.documentElement.scrollLeft = position.x;
    doc.documentElement.scrollTop = position.y;
  }
  if (doc?.body) {
    doc.body.scrollLeft = position.x;
    doc.body.scrollTop = position.y;
  }
}

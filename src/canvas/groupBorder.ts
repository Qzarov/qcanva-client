type GroupGeometry = { x: number; y: number; width: number; height: number; borderWidth?: number; shape?: string };

/** Centerline of the CSS border, in local coordinates of the outer border box. */
export function groupBorderRect(group: GroupGeometry) {
  const border = group.borderWidth || 1.5;
  const width = Math.max(0, group.width - border);
  const height = Math.max(0, group.height - border);
  const outerRadius = Math.min(group.width / 2, group.height / 2, group.shape === 'round' ? Infinity : 12);
  return { x: border / 2, y: border / 2, width, height, rx: Math.max(0, outerRadius - border / 2) };
}

export function hitTestGroupBorder(group: GroupGeometry, wx: number, wy: number, tolerance: number) {
  const rect = groupBorderRect(group);
  const qx = Math.abs(wx - group.x - group.width / 2) - (rect.width / 2 - rect.rx);
  const qy = Math.abs(wy - group.y - group.height / 2) - (rect.height / 2 - rect.rx);
  const distance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rect.rx;
  return Math.abs(distance) <= Math.max(tolerance, (group.borderWidth || 1.5) / 2);
}

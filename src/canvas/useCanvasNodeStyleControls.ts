export interface NodeStyleTarget {
  id: string;
  color?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  firstLineTextAlign?: 'left' | 'center' | 'right' | 'justify';
  borderColor?: string;
  borderStyle?: string;
  borderWidth?: number;
  fillStyle?: 'gradient' | 'solid';
  fontColor?: string;
  transparent?: boolean;
  shape?: 'rect' | 'round';
}

type NodeId = string | null | undefined;
type NodeStyleChanges = Record<string, unknown>;

interface NodeStyleControlOptions {
  findNode: (id: NodeId) => NodeStyleTarget | undefined;
  pushUndo: () => void;
  commit: (node: NodeStyleTarget, changes: NodeStyleChanges) => void;
}

const HEX_TO_FONT_COLOR_KEY: Record<string, string> = {
  '#fb464c': '1', '#e9973f': '2', '#e0de71': '3', '#44cf6e': '4', '#53dfdd': '5', '#a882ff': '6',
};

export function useCanvasNodeStyleControls(options: NodeStyleControlOptions) {
  const borderStyles = [
    { value: 'solid', label: 'Solid', svg: '<line x1="0" y1="5" x2="24" y2="5" stroke="currentColor" stroke-width="2"/>' },
    { value: 'dashed', label: 'Dashed', svg: '<line x1="0" y1="5" x2="24" y2="5" stroke="currentColor" stroke-width="2" stroke-dasharray="6 3"/>' },
    { value: 'dotted', label: 'Dotted', svg: '<line x1="0" y1="5" x2="24" y2="5" stroke="currentColor" stroke-width="2" stroke-dasharray="2 2"/>' },
    { value: 'double', label: 'Double', svg: '<line x1="0" y1="3" x2="24" y2="3" stroke="currentColor" stroke-width="1"/><line x1="0" y1="7" x2="24" y2="7" stroke="currentColor" stroke-width="1"/>' },
    { value: 'ridge', label: 'Dash-dot', svg: '<line x1="0" y1="5" x2="24" y2="5" stroke="currentColor" stroke-width="2" stroke-dasharray="8 2 2 2"/>' },
    { value: 'wavy', label: 'Wavy', svg: '<path d="M0 5 Q3 2 6 5 Q9 8 12 5 Q15 2 18 5 Q21 8 24 5" fill="none" stroke="currentColor" stroke-width="1.5"/>' },
    { value: 'sawtooth', label: 'Sawtooth', svg: '<path d="M0 7 L4 3 L8 7 L12 3 L16 7 L20 3 L24 7" fill="none" stroke="currentColor" stroke-width="1.5"/>' },
  ];
  const fontColors = ['1', '2', '3', '4', '5', '6'];

  const getNodeColor = (id: NodeId) => options.findNode(id)?.color;
  const setNodeColor = (id: NodeId, color: string | undefined) => {
    const node = options.findNode(id);
    if (!node) return;
    options.pushUndo();
    node.color = color;
    options.commit(node, { color: color ?? null });
  };
  const getNodeAlign = (id: NodeId) => options.findNode(id)?.textAlign || 'left';
  const getNodeFirstLineAlign = (id: NodeId) => options.findNode(id)?.firstLineTextAlign || options.findNode(id)?.textAlign || 'left';
  const setNodeFirstLineAlign = (id: NodeId, align: 'left' | 'center' | 'right' | 'justify') => {
    const node = options.findNode(id);
    if (!node) return;
    options.pushUndo();
    node.firstLineTextAlign = align;
    options.commit(node, { firstLineTextAlign: align });
  };
  const setNodeAlign = (id: NodeId, align: 'left' | 'center' | 'right' | 'justify') => {
    const node = options.findNode(id);
    if (!node) return;
    options.pushUndo();
    node.textAlign = align;
    options.commit(node, { textAlign: align });
  };

  const normalizeFontColorKey = (color: string | undefined): string | undefined => {
    if (!color) return undefined;
    if (fontColors.includes(color)) return color;
    return HEX_TO_FONT_COLOR_KEY[color.toLowerCase()];
  };
  const resolveNodeFontColor = (color: string | undefined): string | undefined => {
    if (!color) return undefined;
    const key = normalizeFontColorKey(color);
    if (key) return `var(--content-canvas-node-text-${key})`;
    const lower = color.toLowerCase();
    if (lower === '#ffffff' || lower === '#000000' || lower === '#d7dce8') return undefined;
    return color;
  };
  const getNodeFontColorSwatch = (colorKey: string | undefined) => {
    const key = normalizeFontColorKey(colorKey);
    return key ? `var(--content-canvas-node-text-${key})` : colorKey || '';
  };
  const isNodeFontColorActive = (nodeColor: string | undefined, paletteKey: string) => normalizeFontColorKey(nodeColor) === paletteKey;

  const getNodeFillStyle = (id: NodeId): 'gradient' | 'solid' => options.findNode(id)?.fillStyle || 'gradient';
  const toggleNodeFillStyle = (id: NodeId) => {
    const node = options.findNode(id);
    if (!node) return;
    options.pushUndo();
    const fillStyle = (node.fillStyle || 'gradient') === 'gradient' ? 'solid' : 'gradient';
    node.fillStyle = fillStyle;
    options.commit(node, { fillStyle });
  };
  const getNodeBorderColor = (id: NodeId) => options.findNode(id)?.borderColor;
  const setNodeBorderColor = (id: NodeId, color: string | undefined) => {
    const node = options.findNode(id);
    if (!node) return;
    options.pushUndo();
    node.borderColor = color;
    options.commit(node, { borderColor: color ?? null });
  };
  const getNodeBorderStyle = (id: NodeId) => options.findNode(id)?.borderStyle || 'solid';
  const setNodeBorderStyle = (id: NodeId, style: string) => {
    const node = options.findNode(id);
    if (!node) return;
    options.pushUndo();
    node.borderStyle = style;
    options.commit(node, { borderStyle: style });
  };
  const getNodeBorderWidth = (id: NodeId) => options.findNode(id)?.borderWidth || 2;
  const setNodeBorderWidth = (id: NodeId, width: number) => {
    const node = options.findNode(id);
    if (!node) return;
    options.pushUndo();
    node.borderWidth = width;
    options.commit(node, { borderWidth: width });
  };
  const getNodeFontColor = (id: NodeId) => options.findNode(id)?.fontColor;
  const setNodeFontColor = (id: NodeId, fontColor: string | undefined) => {
    const node = options.findNode(id);
    if (!node) return;
    options.pushUndo();
    node.fontColor = fontColor;
    options.commit(node, { fontColor: fontColor ?? null });
  };

  const isNodeTransparent = (id: NodeId) => options.findNode(id)?.transparent === true;
  const toggleNodeTransparent = (id: NodeId) => {
    const node = options.findNode(id);
    if (!node) return;
    options.pushUndo();
    options.commit(node, { transparent: !node.transparent });
  };
  const getNodeShape = (id: NodeId): 'rect' | 'round' => options.findNode(id)?.shape || 'rect';
  const toggleNodeShape = (id: NodeId) => {
    const node = options.findNode(id);
    if (!node) return;
    options.pushUndo();
    options.commit(node, { shape: node.shape === 'round' ? 'rect' : 'round' });
  };

  return {
    borderStyles,
    fontColors,
    getNodeColor,
    setNodeColor,
    getNodeAlign,
    getNodeFirstLineAlign,
    setNodeFirstLineAlign,
    setNodeAlign,
    normalizeFontColorKey,
    resolveNodeFontColor,
    getNodeFontColorSwatch,
    isNodeFontColorActive,
    getNodeFillStyle,
    toggleNodeFillStyle,
    getNodeBorderColor,
    setNodeBorderColor,
    getNodeBorderStyle,
    setNodeBorderStyle,
    getNodeBorderWidth,
    setNodeBorderWidth,
    getNodeFontColor,
    setNodeFontColor,
    isNodeTransparent,
    toggleNodeTransparent,
    getNodeShape,
    toggleNodeShape,
  };
}

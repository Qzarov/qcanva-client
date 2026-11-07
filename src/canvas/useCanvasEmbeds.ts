import { reactive, type Ref } from 'vue';
import type { CanvasCameraState } from './useCanvasCamera';

export interface CanvasEmbedNode {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  documentKind?: 'html' | 'text';
  documentId?: string;
  canvasId?: string;
}

export interface EmbeddedDocumentEntry {
  title: string;
  srcdoc: string;
  excerpt: string;
  loading: boolean;
  error: boolean;
  errorText: string;
  empty: boolean;
}

interface EmbeddedCanvasEntry {
  title: string;
  nodes: any[];
  edges: any[];
  loading: boolean;
  error: boolean;
}

export function useCanvasEmbeds(options: {
  viewport: Ref<HTMLElement | null>;
  camera: CanvasCameraState;
  effectiveTheme: Ref<string>;
  t: (key: any) => string;
  genId: () => string;
  pushUndo: () => void;
  addNode: (node: CanvasEmbedNode) => void;
  selectNode: (id: string) => void;
  openDocument: (payload: { kind: 'html' | 'text'; id: string }) => void;
}) {
  const embeddedDocumentCache = reactive<Record<string, EmbeddedDocumentEntry>>({});
  const embeddedCanvasCache = reactive<Record<string, EmbeddedCanvasEntry>>({});
  const documentCacheKey = (kind: 'html' | 'text', id: string) => kind + ':' + id;
  const documentNodeKind = (node: CanvasEmbedNode): 'html' | 'text' => node.documentKind === 'text' ? 'text' : 'html';
  const stripHtmlToText = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim();
  const isBlankDocument = (html: string) => !stripHtmlToText(html) && !/<(img|svg|video|canvas|iframe|table|hr)\b/i.test(html);
  const wrapDocumentFragment = (html: string, theme: string) => {
    const palette = theme === 'light'
      ? { surface: '#ffffff', text: '#172019', muted: '#536156', link: '#0b626b', border: 'rgba(23,32,25,0.16)', code: '#f6f8fa' }
      : { surface: '#191b20', text: '#f8fafc', muted: 'rgba(248,250,252,0.7)', link: '#7dd3fc', border: 'rgba(255,255,255,0.16)', code: 'rgba(255,255,255,0.06)' };
    return '<!doctype html><html><head><meta charset="utf-8"><style>' +
      `html,body{margin:0;padding:12px 14px;background:${palette.surface};color:${palette.text};` +
      "font:14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}" +
      "h1,h2,h3,h4{line-height:1.25;margin:0 0 .4em;}h1{font-size:1.5em}h2{font-size:1.25em}h3{font-size:1.1em}" +
      "p{margin:0 0 .7em}ul,ol{margin:0 0 .7em;padding-left:1.3em}" +
      `blockquote{margin:0 0 .7em;padding-left:10px;border-left:3px solid ${palette.border};color:${palette.muted}}` +
      `a{color:${palette.link}}img{max-width:100%;height:auto}hr{border:0;border-top:1px solid ${palette.border};margin:1em 0}` +
      `table{border-collapse:collapse;max-width:100%}td,th{border:1px solid ${palette.border};padding:4px 6px}` +
      `pre{background:${palette.code};padding:8px;border-radius:4px;overflow:auto}` +
      "code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em}" +
      '</style></head><body>' + html + '</body></html>';
  };

  const loadEmbeddedDocument = async (kind: 'html' | 'text', id: string) => {
    const key = documentCacheKey(kind, id);
    if (embeddedDocumentCache[key]) return;
    embeddedDocumentCache[key] = { title: '', srcdoc: '', excerpt: '', loading: true, error: false, errorText: '', empty: false };
    try {
      const { htmlDocuments, textDocuments } = await import('../api/client');
      const res: any = kind === 'html' ? await htmlDocuments.get(id) : await textDocuments.get(id);
      const title = res?.document?.title || 'Untitled';
      const html = kind === 'html' ? res?.document?.html || '' : res?.document?.snapshot?.html || '';
      embeddedDocumentCache[key] = { title, srcdoc: html, excerpt: stripHtmlToText(html).slice(0, 400), loading: false, error: false, errorText: '', empty: isBlankDocument(html) };
    } catch {
      embeddedDocumentCache[key] = { title: 'Error', srcdoc: '', excerpt: '', loading: false, error: true, errorText: 'Cannot load document', empty: false };
    }
  };

  const EMPTY_DOCUMENT_ENTRY: EmbeddedDocumentEntry = { title: '', srcdoc: '', excerpt: '', loading: true, error: false, errorText: '', empty: false };
  const MISSING_DOCUMENT_ENTRY: EmbeddedDocumentEntry = { title: 'Документ не выбран', srcdoc: '', excerpt: '', loading: false, error: true, errorText: 'Документ не выбран', empty: false };
  const documentData = (node: CanvasEmbedNode): EmbeddedDocumentEntry => {
    if (!node.documentId) return MISSING_DOCUMENT_ENTRY;
    const kind = documentNodeKind(node);
    const key = documentCacheKey(kind, node.documentId);
    if (!embeddedDocumentCache[key]) void loadEmbeddedDocument(kind, node.documentId);
    return embeddedDocumentCache[key] || EMPTY_DOCUMENT_ENTRY;
  };
  const documentSrcdoc = (node: CanvasEmbedNode) => {
    const entry = documentData(node);
    return documentNodeKind(node) === 'html' ? entry.srcdoc : wrapDocumentFragment(entry.srcdoc, options.effectiveTheme.value);
  };
  const isDocPreviewRich = (node: CanvasEmbedNode) => node.width >= 220 && node.height >= 140;
  const onDocumentEmbedDblClick = (node: CanvasEmbedNode) => {
    if (node.documentId) options.openDocument({ kind: documentNodeKind(node), id: node.documentId });
  };
  const addDocumentEmbed = (kind: 'html' | 'text', documentId: string) => {
    const element = options.viewport.value;
    const centerX = element ? (-options.camera.x / options.camera.scale) + element.clientWidth / (2 * options.camera.scale) : 0;
    const centerY = element ? (-options.camera.y / options.camera.scale) + element.clientHeight / (2 * options.camera.scale) : 0;
    const node: CanvasEmbedNode = { id: options.genId(), type: 'document', x: centerX - 210, y: centerY - 160, width: 420, height: 320, documentKind: kind, documentId };
    options.pushUndo();
    options.addNode(node);
    options.selectNode(node.id);
    void loadEmbeddedDocument(kind, documentId);
  };

  const loadEmbeddedCanvas = async (canvasId: string) => {
    if (embeddedCanvasCache[canvasId]) return;
    embeddedCanvasCache[canvasId] = { title: '', nodes: [], edges: [], loading: true, error: false };
    try {
      const { canvas: canvasApi } = await import('../api/client');
      const res = await canvasApi.get(canvasId);
      const data = JSON.parse(res.canvas.data || '{"nodes":[],"edges":[]}');
      embeddedCanvasCache[canvasId] = { title: res.canvas.title || 'Untitled', nodes: data.nodes || [], edges: data.edges || [], loading: false, error: false };
    } catch {
      embeddedCanvasCache[canvasId] = { title: options.t('cannotLoadCanvas'), nodes: [], edges: [], loading: false, error: true };
    }
  };
  const getEmbeddedCanvasData = (canvasId: string) => {
    if (!embeddedCanvasCache[canvasId]) void loadEmbeddedCanvas(canvasId);
    return embeddedCanvasCache[canvasId] || { title: '', nodes: [], edges: [], loading: true, error: false };
  };
  const embeddedCanvasViewBox = (canvasId: string) => {
    const data = embeddedCanvasCache[canvasId];
    if (!data || !data.nodes.length) return '0 0 800 600';
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const node of data.nodes) {
      minX = Math.min(minX, node.x); minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + (node.width || 100)); maxY = Math.max(maxY, node.y + (node.height || 60));
    }
    const pad = 40;
    return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  };
  const embeddedEdgePath = (edge: any, allNodes: any[]) => {
    const from = allNodes.find((node) => node.id === edge.fromNode);
    const to = allNodes.find((node) => node.id === edge.toNode);
    if (!from || !to) return '';
    return `M${from.x + (from.width || 100) / 2},${from.y + (from.height || 60) / 2} L${to.x + (to.width || 100) / 2},${to.y + (to.height || 60) / 2}`;
  };

  return { documentData, documentSrcdoc, isDocPreviewRich, onDocumentEmbedDblClick, addDocumentEmbed, loadEmbeddedDocument, loadEmbeddedCanvas, getEmbeddedCanvasData, embeddedCanvasViewBox, embeddedEdgePath };
}

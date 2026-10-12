// Compiled by vue-tsc (tsconfig.app.json); never imported by the application.
// These assertions fail if either consumer or the snapshot boundary leaks any.
import type CanvasLoader from '../components/CanvasLoader.vue';
import type CanvasView from '../views/CanvasView.vue';
import type MobileNodeToolbar from './MobileNodeToolbar.vue';
import type { CanvasLoaderApi } from './loaderApi';

type IsAny<T> = 0 extends (1 & T) ? true : false;
type Assert<T extends true> = T;
type Loader = InstanceType<typeof CanvasLoader>;
type View = InstanceType<typeof CanvasView>;
type Toolbar = InstanceType<typeof MobileNodeToolbar>;
type UntypedApiKeys = {
  [K in keyof CanvasLoaderApi]: IsAny<CanvasLoaderApi[K]> extends true ? K
    : CanvasLoaderApi[K] extends (...args: infer Args) => infer Result
      ? IsAny<Args[number]> extends true ? K : IsAny<Result> extends true ? K : never
      : never;
}[keyof CanvasLoaderApi];

export type CanvasLoaderContractChecks = [
  Assert<IsAny<View['canvasRef']> extends false ? true : false>,
  Assert<IsAny<Toolbar['$props']['canvasRef']> extends false ? true : false>,
  Assert<IsAny<ReturnType<Loader['getCanvasData']>['nodes']> extends false ? true : false>,
  Assert<IsAny<ReturnType<Loader['getCanvasData']>['edges']> extends false ? true : false>,
  Assert<IsAny<ReturnType<Loader['getCanvasData']>['drawings']> extends false ? true : false>,
  Assert<IsAny<ReturnType<Loader['getCanvasData']>['nodes'][number]> extends false ? true : false>,
  Assert<[UntypedApiKeys] extends [never] ? true : false>,
];

// Only a compile-time consumer, not executed or imported by production.
// Every expect-error becomes an error itself if the API widens back to any.
export function checkCanvasLoaderCalls(api: CanvasLoaderApi): void {
  api.setDrawWidth(4);
  api.setDrawTool('pen');
  api.setNodeColor(null, undefined);
  api.setNodeAlign('node-1', 'center');
  api.applyRemoteData({ nodes: [], edges: [], drawings: [] });
  api.applyRemoteOp({ type: 'node-update', id: 'node-1', changes: { color: null } });
  api.addDocumentEmbed('text', 'doc-1');
  api.onEdgeToggleStyle();

  // @ts-expect-error Line width must be a number.
  api.setDrawWidth('4');
  // @ts-expect-error A nonexistent drawing tool is not supported.
  api.setDrawTool('spray');
  // @ts-expect-error Alignment is a known literal, not any string.
  api.setNodeAlign('node-1', 'diagonal');
  // @ts-expect-error This method acts on the current selection and takes no id.
  api.onEdgeToggleStyle('edge-1');
  // @ts-expect-error Canvas nodes require geometry and identity.
  api.applyRemoteData({ nodes: [{ text: 'missing geometry' }], edges: [] });
  // @ts-expect-error Operation discriminants are checked.
  api.applyRemoteOp({ type: 'unsupported-operation' });
  // @ts-expect-error Only supported document kinds may be embedded.
  api.addDocumentEmbed('pdf', 'doc-1');
  // @ts-expect-error A snapshot is not an untyped JSON object.
  api.getCanvasData().nodes.push({ text: 'missing geometry' });
  // @ts-expect-error Internal component machinery is not part of the API.
  api.$emit('change');
}

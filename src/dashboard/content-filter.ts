/**
 * The dashboard's type filter: any number of types at once, none meaning
 * all of them. "file" is a folder's files (from the Drive), the rest are the
 * resource types.
 */
export type DashboardContentType = 'canvas' | 'html-document' | 'text-document' | 'interactive-template' | 'file';

/** Whether a type passes the filter. */
export const typePasses = (types: readonly DashboardContentType[], type: string): boolean =>
  types.length === 0 || (types as readonly string[]).includes(type);

/**
 * The single-value view older code and tests use: 'all' for no filter, the
 * type when exactly one is chosen, 'mixed' for several.
 */
export const singleType = (types: readonly DashboardContentType[]): 'all' | 'mixed' | DashboardContentType =>
  types.length === 0 ? 'all' : types.length === 1 ? types[0]! : 'mixed';

import { formatFileSize, getFileExtension } from '../api/drive';
import type { FileInfo } from '../directives/fileInfo';

/**
 * What a file card tells on hover (v-file-info), the same for a QCanva
 * folder's file and a Yandex Disk file: the full name, size, type and dates.
 */

type T = (key: any) => string;

export const formatFileDateTime = (value: string | null | undefined, locale: string): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const typeLabel = (name: string, mime: string | null | undefined) => {
  const ext = getFileExtension(name);
  return [ext === 'FILE' ? '' : ext, mime || ''].filter(Boolean).join(' · ');
};

export function fileInfo(
  file: { name: string; size: number | null | undefined; mime?: string | null; created?: string | null; modified?: string | null; taken?: string | null },
  t: T,
  locale: string,
): FileInfo {
  return {
    title: file.name,
    rows: [
      [t('fileInfoSize'), file.size === null || file.size === undefined ? '' : formatFileSize(file.size)],
      [t('fileInfoType'), typeLabel(file.name, file.mime)],
      [t('fileInfoTaken'), file.taken && file.taken !== file.modified ? formatFileDateTime(file.taken, locale) : ''],
      [t('fileInfoCreated'), file.created && file.created !== file.modified ? formatFileDateTime(file.created, locale) : ''],
      [t('fileInfoModified'), formatFileDateTime(file.modified, locale)],
    ],
  };
}

/**
 * The kinds of file a space's feed is narrowed by - the kind tiles above
 * the feed and the filter menu read the same list - and each kind's
 * extensions, as the hub tells them (GET /api/spaces/feed-types), asked once.
 */
import { ref, type Component } from 'vue';
import { BookOpen, File as FileIcon, FileText, Image as ImageIcon, LayoutTemplate, Music, Video } from '@lucide/vue';
import { spacesApi, type SpaceFeedType } from '../api/spaces';

export const SPACE_FEED_TYPES: ReadonlyArray<{ value: SpaceFeedType; label: string; icon: Component }> = [
  { value: 'canva', label: 'spaceTypeCanva', icon: LayoutTemplate },
  { value: 'document', label: 'spaceTypeDocument', icon: FileText },
  { value: 'book', label: 'spaceTypeBook', icon: BookOpen },
  { value: 'image', label: 'spaceTypeImage', icon: ImageIcon },
  { value: 'video', label: 'spaceTypeVideo', icon: Video },
  { value: 'audio', label: 'spaceTypeAudio', icon: Music },
  { value: 'other', label: 'spaceTypeOther', icon: FileIcon },
];

const extensions = ref<Partial<Record<SpaceFeedType, string[]>>>({});
let asked: Promise<void> | null = null;

export function useSpaceFeedTypes() {
  asked ??= spacesApi.feedTypes()
    .then(({ types }) => { extensions.value = Object.fromEntries(types.map((entry) => [entry.type, entry.extensions])); })
    // An older hub: the kinds without their lists; asked again next time.
    .catch(() => { asked = null; });
  return {
    extensionsOf: (type: SpaceFeedType) => extensions.value[type] ?? [],
  };
}

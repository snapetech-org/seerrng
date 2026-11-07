import type { AudiobookshelfLibraryItem } from '@server/api/audiobookshelf';
import { MAX_SERVARR_LIBRARY_RESULTS } from '@server/api/servarr/base';

export const AUDIOBOOKSHELF_PAGE_SIZE = 100;
export const AUDIOBOOKSHELF_MAX_LIBRARY_ITEMS = MAX_SERVARR_LIBRARY_RESULTS;
export const AUDIOBOOKSHELF_MAX_LIBRARY_PAGES = Math.ceil(
  AUDIOBOOKSHELF_MAX_LIBRARY_ITEMS / AUDIOBOOKSHELF_PAGE_SIZE
);
const MAX_ITEM_ID_LENGTH = 256;

// A book-library entry can contain only an ebook. Item identity and the
// library-level mediaType do not establish that an audiobook file exists.
export const hasAudiobookshelfAudioFile = (
  item: AudiobookshelfLibraryItem
): boolean => {
  if (
    !item ||
    item.isMissing ||
    item.isInvalid ||
    (item.mediaType !== undefined && item.mediaType !== 'book') ||
    !item.media ||
    typeof item.media !== 'object' ||
    Array.isArray(item.media)
  ) {
    return false;
  }
  const media = item.media;
  if (media.audioFiles !== undefined) {
    return (
      Array.isArray(media.audioFiles) &&
      media.audioFiles.some(
        (file) =>
          file &&
          typeof file === 'object' &&
          !Array.isArray(file) &&
          !file.invalid &&
          !file.exclude &&
          !file.isMissing &&
          ((typeof file.ino === 'string' && file.ino.trim().length > 0) ||
            (Number.isSafeInteger(file.ino) && Number(file.ino) >= 0))
      )
    );
  }
  // Minified responses omit audioFiles and expose explicit audio counts.
  return (
    Number.isSafeInteger(media.numAudioFiles) &&
    Number(media.numAudioFiles) > 0 &&
    (media.numTracks === undefined ||
      (Number.isSafeInteger(media.numTracks) && Number(media.numTracks) > 0))
  );
};

export const getCompleteAudiobookshelfItemIds = (
  items: readonly AudiobookshelfLibraryItem[],
  expectedTotal: number
): Set<string> | undefined => {
  if (
    !Number.isSafeInteger(expectedTotal) ||
    expectedTotal < 0 ||
    expectedTotal > AUDIOBOOKSHELF_MAX_LIBRARY_ITEMS ||
    items.length !== expectedTotal
  ) {
    return undefined;
  }

  const ids = new Set<string>();

  for (const item of items) {
    const itemId =
      item && typeof item.id === 'string' ? item.id.trim() : undefined;
    if (!itemId || itemId.length > MAX_ITEM_ID_LENGTH || ids.has(itemId)) {
      return undefined;
    }
    ids.add(itemId);
  }

  return ids;
};

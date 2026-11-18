import type { MediaCategoryKey } from '@server/constants/mediaCategories';
// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths -- The standalone build owns the shared URL formatter.
import { getIndexerSearchHref as buildHref } from '../../lumen/src/indexerSearchHref';

export const getIndexerSearchHref = (
  category: MediaCategoryKey,
  title: string
): string | undefined => buildHref(category, title);

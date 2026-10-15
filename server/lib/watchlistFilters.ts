import { MediaType } from '@server/constants/media';
import { WATCHLIST_SORT_OPTIONS } from '@server/interfaces/api/discoverInterfaces';
import { z } from 'zod';

export const watchlistFiltersSchema = z.object({
  search: z
    .string()
    .trim()
    .max(100)
    .transform((value) => value || undefined)
    .optional(),
  mediaType: z
    .enum([
      MediaType.MOVIE,
      MediaType.TV,
      MediaType.MUSIC,
      MediaType.BOOK,
      MediaType.COMIC,
      MediaType.MAGAZINE,
    ])
    .optional(),
  sortBy: z.enum(WATCHLIST_SORT_OPTIONS).optional(),
});

import type { MediaRow, TitleResult } from './api';

// Filter before pagination so other available media types do not displace videos.
export const RECENT_MEDIA_QUERY =
  '/media?filter=allavailable&take=20&sort=mediaAdded&mediaType=movie%2Ctv';
// Invalidate pre-fix cached rows, which may contain only one surviving item.
export const RECENT_ROW_CACHE_KEY = '/lumen/new-on-server-v2';

export type RecentMediaTitle = TitleResult & { added?: string };

export function recentMediaTitles(rows: MediaRow[]): RecentMediaTitle[] {
  return rows
    .filter(
      (row) =>
        (row.mediaType === 'movie' || row.mediaType === 'tv') &&
        Number.isSafeInteger(row.tmdbId) &&
        row.tmdbId > 0
    )
    .slice(0, 20)
    .map((row) => ({
      id: row.tmdbId,
      mediaType: row.mediaType as 'movie' | 'tv',
      title: row.mediaType === 'movie' ? row.title || 'Untitled movie' : undefined,
      name: row.mediaType === 'tv' ? row.title || 'Untitled series' : undefined,
      posterPath: row.posterPath,
      releaseDate: row.mediaType === 'movie' ? row.releaseDate : undefined,
      firstAirDate: row.mediaType === 'tv' ? row.releaseDate : undefined,
      mediaInfo: {
        status: row.status,
        status4k: row.status4k,
        mediaAddedAt: row.mediaAddedAt,
      },
      added: row.mediaAddedAt,
    }));
}
// Some recent-view-only accounts receive a deliberately limited /media projection
// without catalog titles. Reuse the existing authorized detail endpoint only
// for those rows; a failed lookup must never erase the entire recent card.
export async function enrichRecentMediaTitles(
  cards: RecentMediaTitle[],
  lookup: (card: RecentMediaTitle) => Promise<TitleResult>
): Promise<RecentMediaTitle[]> {
  return Promise.all(
    cards.map(async (card) => {
      const missingName =
        card.mediaType === 'movie'
          ? card.title === 'Untitled movie'
          : card.name === 'Untitled series';
      if (!missingName) return card;
      try {
        const detail = await lookup(card);
        const resolvedTitle = detail.title || detail.name;
        return {
          ...card,
          title: card.mediaType === 'movie' ? resolvedTitle || card.title : undefined,
          name: card.mediaType === 'tv' ? resolvedTitle || card.name : undefined,
          posterPath: card.posterPath || detail.posterPath,
          releaseDate: card.releaseDate || detail.releaseDate,
          firstAirDate: card.firstAirDate || detail.firstAirDate,
        };
      } catch {
        return card;
      }
    })
  );
}

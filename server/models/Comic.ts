import type {
  ComicVineIssueSummary,
  ComicVineVolumeDetails,
  ComicVineVolumeResult,
} from '@server/api/comicvine';
import type Media from '@server/entity/Media';

export interface ComicResult {
  id: string;
  provider: 'comicvine';
  mediaType: 'comic';
  title: string;
  aliases?: string[];
  publisher?: string;
  startYear?: string;
  issueCount?: number;
  posterPath?: string;
  deck?: string;
  siteDetailUrl?: string;
  mediaInfo?: Media;
  /** Manga (or manhwa), as opposed to a Western comic. */
  manga?: boolean;
  /** 'en' for an English manga edition, 'ja' for the Japanese original. */
  edition?: 'en' | 'ja';
  anilistId?: number;
  /** A short human line, e.g. "Manga · English edition · Yen Press · 13 vols". */
  label?: string;
}

export interface ComicIssueReference {
  id: string;
  name?: string;
  issueNumber?: string;
  coverDate?: string;
  coverUrl?: string;
}

export interface ComicDetails extends ComicResult {
  description?: string;
  issues?: ComicIssueReference[];
  onUserWatchlist?: boolean;
}

const pickPosterPath = (
  image: ComicVineVolumeResult['image']
): string | undefined =>
  image?.super_url ?? image?.medium_url ?? image?.small_url ?? image?.icon_url;

export const mapComicVineIssueResult = (
  issue: ComicVineIssueSummary
): ComicIssueReference => ({
  id: String(issue.id),
  name: issue.name,
  issueNumber: issue.issue_number,
  coverDate: issue.cover_date,
  coverUrl:
    issue.image?.medium_url ?? issue.image?.small_url ?? issue.image?.icon_url,
});

export const mapComicVineVolumeResult = (
  volume: ComicVineVolumeResult,
  media?: Media
): ComicResult => ({
  id: String(volume.id),
  provider: 'comicvine',
  mediaType: 'comic',
  title: volume.name,
  aliases: volume.aliases,
  publisher: volume.publisher?.name,
  startYear: volume.start_year,
  issueCount: volume.count_of_issues,
  posterPath: pickPosterPath(volume.image),
  deck: volume.deck,
  siteDetailUrl: volume.site_detail_url,
  mediaInfo: media,
});

export const mapComicVineVolumeDetails = (
  volume: ComicVineVolumeDetails,
  media?: Media,
  onUserWatchlist?: boolean
): ComicDetails => ({
  ...mapComicVineVolumeResult(volume, media),
  description: volume.description,
  issues: volume.issues?.map(mapComicVineIssueResult),
  onUserWatchlist,
});

const volumeCount = (count?: number) =>
  count ? `${count} vol${count === 1 ? '' : 's'}` : '';

export const mangaLabel = (
  edition: 'en' | 'ja' | undefined,
  publisher?: string,
  count?: number
): string =>
  [
    'Manga',
    edition === 'en'
      ? 'English edition'
      : edition === 'ja'
        ? 'Japanese edition'
        : '',
    publisher ?? '',
    volumeCount(count),
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * Tags a ComicVine result as manga from its publisher, so a plain ComicVine
 * search still says which results are manga and in which language.
 */
export const withMangaEdition = (
  result: ComicResult,
  edition: { manga: boolean; edition?: 'en' | 'ja' }
): ComicResult =>
  edition.manga
    ? {
        ...result,
        manga: true,
        edition: edition.edition,
        label: mangaLabel(edition.edition, result.publisher, result.issueCount),
      }
    : result;

/** A manga found on AniList, keyed by its English-edition ComicVine volume. */
export const mapMangaEditionResult = (
  match: {
    anilistId: number;
    volume: ComicVineVolumeResult;
    title: string;
    coverUrl?: string;
  },
  media?: Media
): ComicResult => {
  const base = mapComicVineVolumeResult(match.volume, media);
  return {
    ...base,
    title: match.title || base.title,
    posterPath: match.coverUrl ?? base.posterPath,
    manga: true,
    edition: 'en',
    anilistId: match.anilistId,
    label: mangaLabel('en', base.publisher, base.issueCount),
  };
};

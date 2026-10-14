import CachedImage from '@app/components/Common/CachedImage';
import { getIssueMediaAndFormatLabel } from '@app/components/IssueDetails/issueMediaFormat';
import {
  encodeApiPathSegment,
  normalizeMusicBrainzId,
  normalizeOpenLibraryWorkId,
} from '@app/utils/apiPath';
import { sortCrewPriority } from '@app/utils/creditHelpers';
import defineMessages from '@app/utils/defineMessages';
import { getTmdbPosterImageUrl } from '@app/utils/imageCache';
import type { BookDetails } from '@server/models/Book';
import type { ComicDetails } from '@server/models/Comic';
import type { MagazineDetails } from '@server/models/Magazine';
import type { MovieDetails } from '@server/models/Movie';
import type { MusicDetails } from '@server/models/Music';
import type { TvDetails } from '@server/models/Tv';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

export type IssueMediaDetails =
  | MovieDetails
  | TvDetails
  | MusicDetails
  | BookDetails
  | ComicDetails
  | MagazineDetails;

export type IssueSummaryDetail = {
  label?: string;
  value: ReactNode;
};

type LinkedValue = { label: string; href?: string };
type SummaryRow = { label: string; values: LinkedValue[] };

const messages = defineMessages('components.IssueDetails.IssueMediaSummary', {
  notAvailable: 'Not available',
  mediaAndFormat: 'Media & Format',
  firstPublished: 'First Published',
  latestIssue: 'Latest Issue',
  releaseDate: 'Release Date',
  pages: 'Pages',
  issues: 'Issues',
  runtime: 'Runtime',
  genres: 'Genres',
  studio: 'Studio',
  artist: 'Artist',
  albumType: 'Album Type',
  trackCount: 'Track Count',
  author: 'Author',
  publisher: 'Publisher',
  creator: 'Creator',
  network: 'Network',
  minutes: '{count, plural, one {# minute} other {# minutes}}',
  issueCount: '{count, plural, one {# issue} other {# issues}}',
});

export const isIssueMusic = (media: IssueMediaDetails): media is MusicDetails =>
  (media as MusicDetails).mediaType === 'album';

export const isIssueBook = (media: IssueMediaDetails): media is BookDetails =>
  (media as BookDetails).mediaType === 'book';

export const isIssueComic = (media: IssueMediaDetails): media is ComicDetails =>
  (media as ComicDetails).mediaType === 'comic';

export const isIssueMagazine = (
  media: IssueMediaDetails
): media is MagazineDetails =>
  (media as MagazineDetails).mediaType === 'magazine';

export const isIssueMovie = (media: IssueMediaDetails): media is MovieDetails =>
  !isIssueMusic(media) &&
  !isIssueBook(media) &&
  !isIssueComic(media) &&
  !isIssueMagazine(media) &&
  (media as MovieDetails).title !== undefined;

const linkedValues = (values: LinkedValue[]) =>
  values.map((value, index) => (
    <span key={`${value.label}-${index}`}>
      {index > 0 && ', '}
      {value.href ? (
        <Link
          href={value.href}
          className="text-indigo-300 hover:text-indigo-200 hover:underline focus:ring-2 focus:ring-indigo-400 focus:outline-none"
        >
          {value.label}
        </Link>
      ) : (
        value.label
      )}
    </span>
  ));

interface IssueMediaSummaryProps {
  data: IssueMediaDetails;
  mediaType: 'movie' | 'tv' | 'music' | 'book' | 'comic' | 'magazine';
  is4k?: boolean;
  mediaHref?: string;
  artwork?: string;
  rightDetails: IssueSummaryDetail[];
  footer?: ReactNode;
  embedded?: boolean;
}

const IssueMediaSummary = ({
  data,
  mediaType,
  is4k = false,
  mediaHref,
  artwork,
  rightDetails,
  footer,
  embedded = false,
}: IssueMediaSummaryProps) => {
  const intl = useIntl();
  const unavailable = intl.formatMessage(messages.notAvailable);
  const isMovie = isIssueMovie(data);
  const isMusic = isIssueMusic(data);
  const isBook = isIssueBook(data);
  const isComic = isIssueComic(data);
  const isMagazine = isIssueMagazine(data);
  const title =
    isMovie || isMusic || isBook || isComic || isMagazine
      ? data.title
      : data.name;
  const releaseDate = isMovie
    ? data.releaseDate
    : isMusic
      ? data.releaseDate
      : isBook
        ? data.firstPublishYear?.toString()
        : isComic
          ? data.startYear
          : isMagazine
            ? data.latestIssue
            : data.firstAirDate;
  const releaseYear = releaseDate?.match(/^\d{4}/)?.[0];
  const runtime = isBook
    ? data.numberOfPages
      ? intl.formatNumber(data.numberOfPages)
      : unavailable
    : isMagazine
      ? data.issueCount !== undefined
        ? intl.formatNumber(data.issueCount)
        : unavailable
      : isMusic
        ? data.tracks.length > 0
          ? intl.formatMessage(messages.minutes, {
              count: Math.round(
                data.tracks.reduce((total, track) => total + track.length, 0) /
                  60000
              ),
            })
          : unavailable
        : isComic
          ? data.issueCount
            ? intl.formatMessage(messages.issueCount, {
                count: data.issueCount,
              })
            : unavailable
          : isMovie
            ? data.runtime
              ? intl.formatMessage(messages.minutes, { count: data.runtime })
              : unavailable
            : data.episodeRunTime[0]
              ? intl.formatMessage(messages.minutes, {
                  count: data.episodeRunTime[0],
                })
              : unavailable;
  const posterSrc =
    isMusic || isBook || isComic || isMagazine
      ? data.posterPath || '/images/seerr_poster_not_found.png'
      : getTmdbPosterImageUrl(data.posterPath) ||
        '/images/seerr_poster_not_found.png';
  const posterType =
    isBook || isComic || isMagazine ? 'book' : isMusic ? 'music' : 'tmdb';
  const artworkSrc =
    artwork ??
    (isMusic
      ? data.artistBackdrop || data.posterPath
      : isBook || isComic || isMagazine
        ? data.posterPath
        : data.backdropPath
          ? `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${data.backdropPath}`
          : posterSrc);
  const artworkType =
    isBook || isComic || isMagazine ? 'book' : isMusic ? 'music' : 'tmdb';
  const mediaLabel = getIssueMediaAndFormatLabel(mediaType, is4k, intl);
  const secondaryRows: SummaryRow[] = isMovie
    ? [
        ...sortCrewPriority(data.credits.crew)
          .slice(0, 2)
          .map((person) => ({
            label: person.job,
            values: [
              {
                label: person.name,
                href: person.id ? `/person/${person.id}` : undefined,
              },
            ],
          })),
        {
          label: intl.formatMessage(messages.studio),
          values: [
            {
              label: data.productionCompanies[0]?.name ?? unavailable,
              href: data.productionCompanies[0]?.id
                ? `/discover/movies/studio/${data.productionCompanies[0].id}`
                : undefined,
            },
          ],
        },
      ]
    : isMusic
      ? [
          {
            label: intl.formatMessage(messages.artist),
            values: [
              {
                label: data.artist.name,
                href: data.artist.id
                  ? `/artist/${encodeApiPathSegment(
                      normalizeMusicBrainzId(data.artist.id)
                    )}`
                  : undefined,
              },
            ],
          },
          {
            label: intl.formatMessage(messages.albumType),
            values: [{ label: data.type }],
          },
          {
            label: intl.formatMessage(messages.trackCount),
            values: [{ label: intl.formatNumber(data.tracks.length) }],
          },
        ]
      : isBook
        ? [
            {
              label: intl.formatMessage(messages.author),
              values: [
                {
                  label: data.author ?? unavailable,
                  href: data.authorId
                    ? `/author/${encodeApiPathSegment(data.authorId)}`
                    : undefined,
                },
              ],
            },
            {
              label: intl.formatMessage(messages.publisher),
              values: [{ label: data.publisher ?? unavailable }],
            },
          ]
        : isMagazine
          ? []
          : isComic
            ? [
                {
                  label: intl.formatMessage(messages.publisher),
                  values: [{ label: data.publisher ?? unavailable }],
                },
              ]
            : [
                {
                  label: intl.formatMessage(messages.creator),
                  values:
                    data.createdBy.length > 0
                      ? data.createdBy.slice(0, 2).map((person) => ({
                          label: person.name,
                          href: `/person/${person.id}`,
                        }))
                      : [{ label: unavailable }],
                },
                {
                  label: intl.formatMessage(messages.network),
                  values:
                    data.networks.length > 0
                      ? data.networks.slice(0, 2).map((network) => ({
                          label: network.name,
                          href: `/discover/tv/network/${network.id}`,
                        }))
                      : [{ label: unavailable }],
                },
              ];
  const genres: LinkedValue[] = isMusic
    ? (data.tags?.releaseGroup ?? []).slice(0, 3).map((genre) => ({
        label: genre.tag,
      }))
    : isBook
      ? (data.subjects ?? []).slice(0, 3).map((subject) => ({
          label: subject,
        }))
      : isMagazine
        ? []
        : isComic
          ? (data.aliases ?? []).slice(0, 3).map((alias) => ({
              label: alias,
            }))
          : data.genres.slice(0, 3).map((genre) => ({
              label: genre.name,
              href:
                mediaType === 'movie'
                  ? `/discover/movies/genre/${genre.id}`
                  : `/discover/tv/genre/${genre.id}`,
            }));
  const bookWorkId = isBook
    ? normalizeOpenLibraryWorkId(data.id?.toString() ?? '')
    : undefined;
  const resolvedHref =
    mediaHref ??
    (mediaType === 'movie'
      ? `/movie/${data.id}`
      : mediaType === 'tv'
        ? `/tv/${data.id}`
        : mediaType === 'music' && isMusic
          ? `/music/${encodeApiPathSegment(data.id)}`
          : isComic
            ? `/comic/${encodeApiPathSegment(data.id)}`
            : isMagazine
              ? `/magazine/${encodeApiPathSegment(data.id)}`
              : bookWorkId
                ? `/book/${encodeApiPathSegment(bookWorkId)}`
                : undefined);

  return (
    <article
      className={`${embedded ? 'app-card-inset refreshed-inset-surface' : 'app-card-main refreshed-card-surface shadow-lg shadow-gray-950/20'} relative rounded-xl border border-gray-700 p-3`}
    >
      {!embedded && artworkSrc && (
        <div
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-xl"
          aria-hidden
        >
          <CachedImage
            type={artworkType}
            src={artworkSrc}
            alt=""
            fill
            priority
            sizes="(min-width: 768px) 48rem, 100vw"
            className="object-cover object-top"
          />
          <div className="refreshed-artwork-scrim" />
          <div className="refreshed-artwork-gradient" />
        </div>
      )}
      <div className="relative z-10">
        <div
          className={`${embedded ? '' : 'app-card-inset refreshed-inset-surface detail-summary-card'} grid min-w-0 grid-cols-[64px_minmax(0,1fr)] gap-3 sm:grid-cols-[80px_minmax(0,1fr)]`}
        >
          <div className="detail-card-poster relative overflow-hidden rounded-lg ring-1 ring-gray-600">
            <CachedImage
              type={posterType}
              src={posterSrc}
              alt=""
              fill
              sizes="(min-width: 640px) 80px, 64px"
              className="object-cover"
            />
          </div>

          <div className="flex min-w-0 flex-col">
            {resolvedHref ? (
              <Link
                href={resolvedHref}
                className="detail-summary-title block truncate text-lg leading-5 font-semibold text-white hover:underline"
              >
                {title}
                {releaseYear ? ` (${releaseYear})` : ''}
              </Link>
            ) : (
              <h3 className="detail-summary-title truncate text-lg leading-5 font-semibold text-white">
                {title}
                {releaseYear ? ` (${releaseYear})` : ''}
              </h3>
            )}

            <div className="detail-card-heading-spacing detail-three-column-grid grid min-h-0 min-w-0 flex-1 items-stretch">
              <div className="detail-paired-column-span min-w-0">
                <dl className="media-detail-rows detail-paired-columns grid min-w-0 content-start text-xs">
                  <dt className="card:col-start-1 card:row-start-1 font-medium text-gray-100">
                    {intl.formatMessage(messages.mediaAndFormat)}:
                  </dt>
                  <dd className="card:col-start-3 card:row-start-1 m-0 truncate">
                    {mediaLabel}
                  </dd>
                  <dt className="card:col-start-1 card:row-start-2 font-medium text-gray-100">
                    {intl.formatMessage(
                      isBook
                        ? messages.firstPublished
                        : isMagazine
                          ? messages.latestIssue
                          : messages.releaseDate
                    )}
                    :
                  </dt>
                  <dd className="card:col-start-3 card:row-start-2 m-0 truncate">
                    {releaseDate || unavailable}
                  </dd>
                  <dt className="card:col-start-1 card:row-start-3 font-medium text-gray-100">
                    {intl.formatMessage(
                      isBook
                        ? messages.pages
                        : isMagazine
                          ? messages.issues
                          : messages.runtime
                    )}
                    :
                  </dt>
                  <dd className="card:col-start-3 card:row-start-3 m-0 truncate">
                    {runtime}
                  </dd>

                  <div className="media-detail-rows media-detail-column-divider card:col-span-1 card:col-start-5 card:row-span-3 card:row-start-1 col-span-2 grid min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3">
                    {secondaryRows.slice(0, 3).map((row) => (
                      <div className="contents" key={row.label}>
                        <dt className="font-medium text-gray-100">
                          {row.label}:
                        </dt>
                        <dd className="m-0 truncate">
                          {linkedValues(row.values)}
                        </dd>
                      </div>
                    ))}
                  </div>

                  <dt className="card:col-start-1 card:row-start-4 font-medium text-gray-100">
                    {intl.formatMessage(messages.genres)}:
                  </dt>
                  <dd className="card:col-span-3 card:col-start-3 card:row-start-4 m-0 line-clamp-2 min-w-0 break-words">
                    {genres.length > 0 ? linkedValues(genres) : unavailable}
                  </dd>
                </dl>
              </div>

              <dl className="media-detail-rows media-detail-column-divider grid h-full min-w-0 grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3 text-xs">
                {rightDetails.map((detail, index) => (
                  <div className="contents" key={`${detail.label}-${index}`}>
                    <dt
                      className="font-medium text-gray-100"
                      aria-hidden={!detail.label}
                    >
                      {detail.label ? `${detail.label}:` : ''}
                    </dt>
                    <dd className="m-0 truncate">{detail.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
        {footer && (
          <div className="mt-[5px] flex flex-wrap gap-2">{footer}</div>
        )}
      </div>
    </article>
  );
};

export default IssueMediaSummary;

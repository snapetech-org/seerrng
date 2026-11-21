import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { bookDetailPath, videoDetailPath } from '../api';
import { isAdministrator, useAuth } from '../auth';
import { canViewAllRequests, Pill } from '../components/detail';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

const MEDIA = [
  ['', 'allMedia'],
  ['movie', 'movies'],
  ['tv', 'series'],
  ['music', 'albums'],
  ['book', 'books'],
  ['comic', 'comics'],
  ['magazine', 'magazines'],
  ['software', 'games'],
] as const;

interface Release {
  id: string;
  title: string;
  startsAt: string;
  allDay: boolean;
  dateType:
    | 'air'
    | 'digital'
    | 'physical'
    | 'theatrical'
    | 'album'
    | 'book'
    | 'issue'
    | 'game';
  mediaType: Exclude<(typeof MEDIA)[number][0], ''>;
  available: boolean;
  is4k: boolean;
  tmdbId?: number;
  mbId?: string;
  bookId?: string;
  bookFormat?: 'ebook' | 'audiobook';
  comicId?: string;
  magazineTitle?: string;
  igdbId?: number;
  softwareCategory?: 'game' | 'retro' | 'modern';
  artistName?: string;
  authorName?: string;
  platformName?: string;
  episodeTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  dateChanges?: {
    changedAt: string;
    startsAt: string;
    allDay: boolean;
    previousStartsAt: string;
    previousAllDay: boolean;
  }[];
}

interface CalendarResult {
  results: Release[];
  partialSources: { source: string }[];
  truncated: boolean;
}

const PAGE_SIZE = 25;
const FIRST_MONTH = '0001-01';
const LAST_MONTH = '9999-11';
const monthValue = (date: Date) =>
  `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}`;

function moveMonth(month: string, step: number) {
  const [year, number] = month.split('-').map(Number);
  // setFullYear preserves years below 100, which the Date constructor remaps.
  const date = new Date(0);
  date.setFullYear(year, number - 1 + step, 1);
  return monthValue(date);
}

function displayDate(value: string, allDay: boolean, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    ...(allDay ? { timeZone: 'UTC' } : { timeStyle: 'short' }),
  }).format(date);
}

function releaseHref(item: Release) {
  const encode = encodeURIComponent;
  switch (item.mediaType) {
    case 'movie':
    case 'tv':
      return item.tmdbId
        ? videoDetailPath(
            item.mediaType,
            item.tmdbId,
            item.is4k,
            item.seasonNumber,
            item.episodeNumber
          )
        : undefined;
    case 'music':
      return item.mbId ? `/music/${encode(item.mbId)}` : undefined;
    case 'book':
      return item.bookId
        ? bookDetailPath(item.bookId, item.bookFormat ?? 'ebook', item.title)
        : undefined;
    case 'comic':
      return item.comicId ? `/comic/${encode(item.comicId)}` : undefined;
    case 'magazine':
      return item.magazineTitle
        ? `/magazine/${encode(item.magazineTitle)}`
        : undefined;
    case 'software':
      return item.igdbId && item.softwareCategory
        ? `/game/${item.softwareCategory}/${encode(item.igdbId)}`
        : undefined;
  }
}

function CalendarResults({ path }: { path: string }) {
  const { locale, t } = useLumenLocale();
  const {
    data: response,
    error: loadError,
    reload,
  } = useApi<CalendarResult>(path, { keepDuringRefresh: true });
  const [limit, setLimit] = useState(PAGE_SIZE);
  const data =
    Array.isArray(response?.results) && Array.isArray(response?.partialSources)
      ? response
      : null;
  const error =
    loadError ||
    (response && !data
      ? t(
          'lumen.calendar.invalidResponse',
          'Invalid release calendar response.'
        )
      : null);
  if (!data) {
    return error ? (
      <ServiceNote
        error={error}
        what={t('lumen.calendar.releases', 'releases')}
        retry={reload}
      />
    ) : (
      <p className="note" role="status">
        {t('lumen.calendar.loading', 'Loading releases…')}
      </p>
    );
  }

  return (
    <>
      {(loadError || !!data.partialSources.length) && (
        <ServiceNote
          error={
            loadError
              ? t(
                  'lumen.calendar.retryFailed',
                  'Retry failed: {error} Showing the previous results.',
                  { error: loadError }
                )
              : t(
                  'lumen.calendar.partialSources',
                  'Some release sources could not be reached. Their releases may be missing.'
                )
          }
          what={t('lumen.calendar.allSources', 'all release sources')}
          retry={reload}
        />
      )}
      {data.truncated && (
        <p className="note" role="status">
          {t(
            'lumen.calendar.truncated',
            'Result limit reached. Choose a media type to see more releases.'
          )}
        </p>
      )}
      {!data.results.length ? (
        <p className="note">
          {data.partialSources.length
            ? t(
                'lumen.calendar.noReturned',
                'No releases were returned by the sources that responded.'
              )
            : t(
                'lumen.calendar.noMatches',
                'No releases match this month and scope.'
              )}
        </p>
      ) : (
        <ol className="setlist">
          {data.results.slice(0, limit).map((release) => {
            const href = releaseHref(release);
            const episode =
              release.seasonNumber !== undefined &&
              release.episodeNumber !== undefined
                ? t(
                    'lumen.calendar.episode',
                    'Season {season}, Episode {episode}',
                    {
                      season: release.seasonNumber,
                      episode: release.episodeNumber,
                    }
                  )
                : null;
            const dateType = (
              {
                air: 'episodeRelease',
                digital: 'digitalRelease',
                physical: 'physicalRelease',
                theatrical: 'theatricalRelease',
                album: 'albumRelease',
                book: 'bookRelease',
                issue: 'issueRelease',
                game: 'gameRelease',
              } as const
            )[release.dateType];
            const summary = [
              release.artistName,
              release.authorName,
              release.bookFormat === 'audiobook'
                ? t('lumen.calendar.audiobook', 'Audiobook')
                : undefined,
              release.softwareCategory &&
                t(
                  `lumen.calendar.category.${release.softwareCategory}`,
                  (
                    {
                      game: 'PC game',
                      retro: 'Retro emulation',
                      modern: 'Modern emulation',
                    } as const
                  )[release.softwareCategory]
                ),
              release.platformName &&
                t('lumen.calendar.requestedFor', 'Requested for {platform}', {
                  platform: release.platformName,
                }),
              episode,
              release.episodeTitle,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={release.id} className="set">
                <div>
                  {href ? (
                    <Link className="go" to={href}>
                      {release.title}
                    </Link>
                  ) : (
                    <b>{release.title}</b>
                  )}
                  <small>
                    <time dateTime={release.startsAt}>
                      {displayDate(release.startsAt, release.allDay, locale)}
                    </time>
                    {' · '}
                    {t(`lumen.calendar.dateType.${dateType}`, dateType)}
                  </small>
                  {summary && <small>{summary}</small>}
                  {release.dateChanges?.map((change) => (
                    <small key={`${change.changedAt}:${change.startsAt}`}>
                      {t(
                        'lumen.calendar.changedFrom',
                        'Date changed from {previous} to {date} on {changed}.',
                        {
                          previous: displayDate(
                            change.previousStartsAt,
                            change.previousAllDay,
                            locale
                          ),
                          date: displayDate(
                            change.startsAt,
                            change.allDay,
                            locale
                          ),
                          changed: displayDate(change.changedAt, false, locale),
                        }
                      )}
                    </small>
                  ))}
                </div>
                <Pill k={release.available ? 'ok' : 'neutral'}>
                  {release.available
                    ? t('lumen.calendar.available', 'Available')
                    : t('lumen.calendar.upcoming', 'Upcoming')}
                  {release.is4k ? ' · 4K' : ''}
                </Pill>
              </li>
            );
          })}
        </ol>
      )}
      {data.results.length > limit && (
        <button
          className="btn btn-tonal btn-sm"
          onClick={() => setLimit(limit + PAGE_SIZE)}
        >
          {t('lumen.calendar.showMore', 'Show More Releases')}
        </button>
      )}
    </>
  );
}

export default function Calendar() {
  const { locale, t } = useLumenLocale();
  const { user } = useAuth();
  const admin = isAdministrator(user?.permissions);
  const canSeeAll = canViewAllRequests(user?.permissions);
  const [params, setParams] = useSearchParams();
  const bookmarkedMonth = params.get('month') ?? '';
  const month =
    /^\d{4}-(0[1-9]|1[0-2])$/.test(bookmarkedMonth) &&
    bookmarkedMonth >= FIRST_MONTH &&
    bookmarkedMonth <= LAST_MONTH
      ? bookmarkedMonth
      : monthValue(new Date());
  const scope = canSeeAll && params.get('scope') === 'all' ? 'all' : 'mine';
  const medium =
    MEDIA.find(([value]) => value === params.get('mediaType'))?.[0] ?? '';
  const unmonitored = admin && params.get('includeUnmonitored') === 'true';
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  const setMonth = (value: string) => update('month', value);
  const query = new URLSearchParams({
    start: `${month}-01`,
    end: `${moveMonth(month, 1)}-01`,
    scope,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    includeUnmonitored: String(unmonitored),
  });
  if (medium) query.set('mediaType', medium);
  const path = `/calendar?${query}`;

  return (
    <>
      <header className="ph">
        <h1>{t('lumen.calendar.title', 'Release Calendar')}</h1>
      </header>
      <p className="note">
        {t(
          'lumen.calendar.description',
          'Upcoming movie, series, music, book, comic, magazine, PC game, and emulation releases from your acquisition services.'
        )}
      </p>
      <div
        className="toolbar"
        aria-label={t('lumen.calendar.filters', 'Calendar Filters')}
      >
        <button
          className="btn btn-quiet btn-sm"
          disabled={month <= FIRST_MONTH}
          onClick={() => setMonth(moveMonth(month, -1))}
        >
          {t('lumen.calendar.previousMonth', 'Previous Month')}
        </button>
        <label className="sel">
          <span className="lbl">{t('lumen.calendar.month', 'Month')}</span>
          <input
            type="month"
            lang={locale}
            min={FIRST_MONTH}
            max={LAST_MONTH}
            value={month}
            onChange={(event) => {
              const value = event.target.value;
              if (
                /^\d{4}-(0[1-9]|1[0-2])$/.test(value) &&
                value >= FIRST_MONTH &&
                value <= LAST_MONTH
              )
                setMonth(value);
            }}
          />
        </label>
        <button
          className="btn btn-quiet btn-sm"
          disabled={month >= LAST_MONTH}
          onClick={() => setMonth(moveMonth(month, 1))}
        >
          {t('lumen.calendar.nextMonth', 'Next Month')}
        </button>
        {canSeeAll && (
          <label className="sel">
            <span className="lbl">{t('lumen.calendar.scope', 'Scope')}</span>
            <select
              value={scope}
              onChange={(event) =>
                update('scope', event.target.value === 'all' ? 'all' : '')
              }
            >
              <option value="mine">
                {t('lumen.calendar.myRequests', 'My Requests')}
              </option>
              <option value="all">
                {t('lumen.calendar.allMonitored', 'All Monitored Releases')}
              </option>
            </select>
          </label>
        )}
        <label className="sel">
          <span className="lbl">
            {t('lumen.calendar.mediaType', 'Media Type')}
          </span>
          <select
            value={medium}
            onChange={(event) => update('mediaType', event.target.value)}
          >
            {MEDIA.map(([value, key]) => (
              <option key={value} value={value}>
                {t(`lumen.calendar.media.${key}`, key)}
              </option>
            ))}
          </select>
        </label>
        {admin && (
          <label className="sel">
            <input
              type="checkbox"
              checked={unmonitored}
              onChange={(event) =>
                update('includeUnmonitored', event.target.checked ? 'true' : '')
              }
            />
            {t(
              'lumen.calendar.includeUnmonitored',
              'Include Unmonitored Titles'
            )}
          </label>
        )}
      </div>
      <CalendarResults key={path} path={path} />
    </>
  );
}

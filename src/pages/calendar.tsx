import Alert from '@app/components/Common/Alert';
import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import PageTitle from '@app/components/Common/PageTitle';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import { Permission, useUser } from '@app/hooks/useUser';
import {
  encodeApiPathSegment,
  normalizeMusicBrainzId,
} from '@app/utils/apiPath';
import defineMessages from '@app/utils/defineMessages';
import type { ReleaseCalendarItem } from '@server/lib/releaseCalendar/normalize';
import Link from 'next/link';
import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import useSWR from 'swr';
const messages = defineMessages('calendar', {
  title: 'Release Calendar',
  description:
    'Upcoming movie, series, music, book, comic, magazine, PC game, and emulation releases from your acquisition services.',
  month: 'Month',
  scope: 'Calendar scope',
  mine: 'My requests',
  all: 'All monitored titles, issues, and software requests',
  mediaType: 'Media type',
  allTypes:
    'Movies, series, music, books, comics, magazines, PC games, and emulation',
  movies: 'Movies',
  series: 'Series',
  albums: 'Music albums',
  books: 'Books',
  comics: 'Comics',
  magazines: 'Magazines',
  games: 'Games and emulation',
  unmonitored: 'Include unmonitored titles',
  loading: 'Loading releases…',
  empty: 'No releases match this month and scope.',
  failed: 'The calendar could not be loaded.',
  retry: 'Retry',
  partial:
    'Some acquisition services, issue sources, or game catalogs could not be reached. Their releases may be missing.',
  truncated:
    'This calendar reached its result limit. Narrow the media filter to see more releases.',
  available: 'Available',
  upcoming: 'Upcoming',
  air: 'Episode release',
  digital: 'Digital release',
  physical: 'Physical release',
  theatrical: 'Theatrical release',
  album: 'Album release',
  book: 'Book release',
  issue: 'Issue release',
  game: 'Game release',
  pcGame: 'PC game',
  retroGame: 'Retro emulation',
  modernGame: 'Modern emulation',
  softwareTargets: 'Requested for {targets}',
  ebook: 'Book',
  audiobook: 'Audiobook',
  episode: 'Season {season}, episode {episode}',
  previous: 'Previous month',
  next: 'Next month',
  more: 'Show more releases',
  dateChanged: 'Date changed from {previous} to {current} on {changedAt}.',
});
const dateMonth = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
export default function CalendarPage() {
  const intl = useIntl();
  const upstream = useUpstreamTheme();
  const { hasPermission } = useUser();
  const [month, setMonth] = useState(() => dateMonth(new Date()));
  const [scope, setScope] = useState('mine');
  const [type, setType] = useState('');
  const [unmonitored, setUnmonitored] = useState(false);
  const [limit, setLimit] = useState(25);
  const [year, number] = month.split('-').map(Number);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatReleaseDate = (value: string, allDay: boolean) => {
    const date = intl.formatDate(value, {
      dateStyle: 'medium',
      ...(allDay ? { timeZone: 'UTC' } : {}),
    });
    return allDay
      ? date
      : `${date} · ${intl.formatTime(value, { timeStyle: 'short' })}`;
  };
  const start = `${month}-01`;
  const end = `${dateMonth(new Date(year, number, 1))}-01`;
  const { data, error, isLoading, mutate } = useSWR<{
    results: ReleaseCalendarItem[];
    partialSources: { source: string }[];
    truncated: boolean;
  }>(
    /^\d{4}-\d{2}$/.test(month)
      ? `/api/v1/calendar?start=${start}&end=${end}&scope=${scope}&timeZone=${encodeURIComponent(timeZone)}&includeUnmonitored=${unmonitored}${type ? `&mediaType=${type}` : ''}`
      : null,
    { revalidateOnFocus: false, dedupingInterval: 30000 }
  );
  const move = (offset: number) => {
    setMonth(dateMonth(new Date(year, number - 1 + offset, 1)));
    setLimit(25);
  };
  return (
    <div className="text-gray-100 upstream-extension-page upstream-calendar-page">
      <PageTitle title={intl.formatMessage(messages.title)} />
      <Header>{intl.formatMessage(messages.title)}</Header>
      <p className="description mb-6">
        {intl.formatMessage(messages.description)}
      </p>
      <div className="upstream-extension-toolbar mb-6 flex flex-wrap items-end gap-4">
        <label htmlFor="calendar-month">
          {intl.formatMessage(messages.month)}
          <input
            className="mt-2 block rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-gray-100 [color-scheme:dark]"
            id="calendar-month"
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setLimit(25);
            }}
          />
        </label>
        <label htmlFor="calendar-scope">
          {intl.formatMessage(messages.scope)}
          <select
            id="calendar-scope"
            className="mt-2 block"
            value={scope}
            onChange={(event) => {
              setScope(event.target.value);
              setLimit(25);
            }}
          >
            <option value="mine">{intl.formatMessage(messages.mine)}</option>
            {hasPermission(
              [
                Permission.ADMIN,
                Permission.MANAGE_REQUESTS,
                Permission.REQUEST_VIEW,
              ],
              { type: 'or' }
            ) && (
              <option value="all">{intl.formatMessage(messages.all)}</option>
            )}
          </select>
        </label>
        <label htmlFor="calendar-media-type">
          {intl.formatMessage(messages.mediaType)}
          <select
            id="calendar-media-type"
            className="mt-2 block"
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setLimit(25);
            }}
          >
            <option value="">{intl.formatMessage(messages.allTypes)}</option>
            <option value="movie">{intl.formatMessage(messages.movies)}</option>
            <option value="tv">{intl.formatMessage(messages.series)}</option>
            <option value="music">{intl.formatMessage(messages.albums)}</option>
            <option value="book">{intl.formatMessage(messages.books)}</option>
            <option value="comic">{intl.formatMessage(messages.comics)}</option>
            <option value="magazine">
              {intl.formatMessage(messages.magazines)}
            </option>
            <option value="software">
              {intl.formatMessage(messages.games)}
            </option>
          </select>
        </label>
        {hasPermission(Permission.ADMIN) && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={unmonitored}
              onChange={(event) => setUnmonitored(event.target.checked)}
            />
            {intl.formatMessage(messages.unmonitored)}
          </label>
        )}
      </div>
      <nav
        className="mb-6 flex justify-between gap-4"
        aria-label={intl.formatMessage(messages.month)}
      >
        <Button onClick={() => move(-1)}>
          {intl.formatMessage(messages.previous)}
        </Button>
        <Button onClick={() => move(1)}>
          {intl.formatMessage(messages.next)}
        </Button>
      </nav>
      {isLoading && <p role="status">{intl.formatMessage(messages.loading)}</p>}
      {error &&
        (upstream ? (
          <div role="alert">
            <Alert type="error">
              {intl.formatMessage(messages.failed)}{' '}
              <Button onClick={() => void mutate()}>
                {intl.formatMessage(messages.retry)}
              </Button>
            </Alert>
          </div>
        ) : (
          <p role="alert">
            {intl.formatMessage(messages.failed)}{' '}
            <Button onClick={() => void mutate()}>
              {intl.formatMessage(messages.retry)}
            </Button>
          </p>
        ))}
      {!!data?.partialSources.length &&
        (upstream ? (
          <div role="status">
            <Alert type="warning">{intl.formatMessage(messages.partial)}</Alert>
          </div>
        ) : (
          <p
            role="status"
            className="mb-4 rounded-lg border border-yellow-500 p-4"
          >
            {intl.formatMessage(messages.partial)}
          </p>
        ))}
      {data?.truncated &&
        (upstream ? (
          <div role="status">
            <Alert type="warning">
              {intl.formatMessage(messages.truncated)}
            </Alert>
          </div>
        ) : (
          <p role="status" className="mb-4 text-yellow-400">
            {intl.formatMessage(messages.truncated)}
          </p>
        ))}
      {data && !data.results.length && (
        <p className={upstream ? 'description' : undefined}>
          {intl.formatMessage(messages.empty)}
        </p>
      )}
      <ol className="space-y-3">
        {data?.results.slice(0, limit).map((item) => (
          <li
            key={item.id}
            className={
              upstream
                ? 'app-card-main grid gap-2 border border-gray-700 p-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto]'
                : 'grid gap-2 rounded-lg border border-gray-700 bg-gray-800 p-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto]'
            }
          >
            <div className="min-w-32 text-sm">
              <time dateTime={item.startsAt}>
                {intl.formatDate(item.startsAt, {
                  dateStyle: 'medium',
                  ...(item.allDay ? { timeZone: 'UTC' } : {}),
                })}
                {!item.allDay && (
                  <>
                    {' '}
                    · {intl.formatTime(item.startsAt, { timeStyle: 'short' })}
                  </>
                )}
              </time>
              <p className="mt-1 text-gray-400">
                {intl.formatMessage(messages[item.dateType])}
              </p>
            </div>
            <div className="min-w-0 flex-1 break-words">
              <h2 className="font-semibold text-gray-100">
                {item.mediaType === 'software' &&
                item.softwareCategory &&
                item.igdbId ? (
                  <Link
                    href={`/software?category=${item.softwareCategory}&game=${item.igdbId}`}
                    className={
                      upstream ? undefined : 'text-blue-300 hover:text-blue-200'
                    }
                  >
                    {item.title}
                  </Link>
                ) : item.mediaType === 'music' && item.mbId ? (
                  <Link
                    href={`/music/${encodeApiPathSegment(normalizeMusicBrainzId(item.mbId))}`}
                    className={
                      upstream ? undefined : 'text-blue-300 hover:text-blue-200'
                    }
                  >
                    {item.title}
                  </Link>
                ) : item.mediaType === 'book' && item.bookId ? (
                  <Link
                    href={`/book/${encodeApiPathSegment(item.bookId)}?format=${item.bookFormat ?? 'ebook'}&lookupTitle=${encodeURIComponent(item.title)}`}
                    className={
                      upstream ? undefined : 'text-blue-300 hover:text-blue-200'
                    }
                  >
                    {item.title}
                  </Link>
                ) : item.mediaType === 'comic' && item.comicId ? (
                  <Link
                    href={'/comic/' + encodeApiPathSegment(item.comicId)}
                    className={
                      upstream ? undefined : 'text-blue-300 hover:text-blue-200'
                    }
                  >
                    {item.title}
                  </Link>
                ) : item.mediaType === 'magazine' && item.magazineTitle ? (
                  <Link
                    href={
                      '/magazine/' + encodeApiPathSegment(item.magazineTitle)
                    }
                    className={
                      upstream ? undefined : 'text-blue-300 hover:text-blue-200'
                    }
                  >
                    {item.title}
                  </Link>
                ) : item.tmdbId ? (
                  <Link
                    href={`/${item.mediaType}/${item.tmdbId}`}
                    className={
                      upstream ? undefined : 'text-blue-300 hover:text-blue-200'
                    }
                  >
                    {item.title}
                  </Link>
                ) : (
                  item.title
                )}
              </h2>
              {item.artistName && (
                <p className="mt-1 text-sm text-gray-400">{item.artistName}</p>
              )}
              {item.authorName && (
                <p className="mt-1 text-sm text-gray-400">{item.authorName}</p>
              )}
              {item.bookFormat && (
                <p className="mt-1 text-sm text-gray-400">
                  {intl.formatMessage(messages[item.bookFormat])}
                </p>
              )}
              {item.softwareCategory && (
                <p className="mt-1 text-sm text-gray-400">
                  {intl.formatMessage(
                    item.softwareCategory === 'game'
                      ? messages.pcGame
                      : item.softwareCategory === 'retro'
                        ? messages.retroGame
                        : messages.modernGame
                  )}
                </p>
              )}
              {item.platformName && (
                <p className="mt-1 text-sm text-gray-400">
                  {intl.formatMessage(messages.softwareTargets, {
                    targets: item.platformName,
                  })}
                </p>
              )}
              {item.seasonNumber !== undefined &&
                item.episodeNumber !== undefined && (
                  <p className="mt-1 text-sm text-gray-400">
                    <FormattedMessage
                      {...messages.episode}
                      values={{
                        season: item.seasonNumber,
                        episode: item.episodeNumber,
                      }}
                    />
                    {item.episodeTitle ? ` · ${item.episodeTitle}` : ''}
                  </p>
                )}
              {item.dateChanges?.map((change) => (
                <p
                  key={`${change.changedAt}:${change.startsAt}`}
                  className="mt-2 text-sm text-yellow-300"
                >
                  {intl.formatMessage(messages.dateChanged, {
                    previous: formatReleaseDate(
                      change.previousStartsAt,
                      change.previousAllDay
                    ),
                    current: formatReleaseDate(change.startsAt, change.allDay),
                    changedAt: intl.formatDate(change.changedAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                </p>
              ))}
            </div>
            {upstream ? (
              <Badge badgeType={item.available ? 'success' : 'dark'}>
                {intl.formatMessage(
                  item.available ? messages.available : messages.upcoming
                )}
                {item.is4k ? ' · 4K' : ''}
              </Badge>
            ) : (
              <span
                className={`text-sm ${item.available ? 'text-green-400' : 'text-gray-400'}`}
              >
                {intl.formatMessage(
                  item.available ? messages.available : messages.upcoming
                )}
                {item.is4k ? ' · 4K' : ''}
              </span>
            )}
          </li>
        ))}
      </ol>
      {data && data.results.length > limit && (
        <Button
          className="my-6"
          onClick={() => setLimit((current) => current + 25)}
        >
          {intl.formatMessage(messages.more)}
        </Button>
      )}
    </div>
  );
}

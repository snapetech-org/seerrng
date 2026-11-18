import { useState } from 'react';
import { Link } from 'react-router-dom';
import { bookDetailPath, videoDetailPath } from '../api';
import { isAdministrator, useAuth } from '../auth';
import { canViewAllRequests, Pill } from '../components/detail';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';

const MEDIA = [
  ['', 'All Media'],
  ['movie', 'Movies'],
  ['tv', 'Series'],
  ['music', 'Music Albums'],
  ['book', 'Books'],
  ['comic', 'Comics'],
  ['magazine', 'Magazines'],
  ['software', 'Games and Emulation'],
] as const;

const DATE_TYPES = {
  air: 'Episode release',
  digital: 'Digital release',
  physical: 'Physical release',
  theatrical: 'Theatrical release',
  album: 'Album release',
  book: 'Book release',
  issue: 'Issue release',
  game: 'Game release',
};

interface Release {
  id: string;
  title: string;
  startsAt: string;
  allDay: boolean;
  dateType: keyof typeof DATE_TYPES;
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
const CATEGORY_LABEL = {
  game: 'PC game',
  retro: 'Retro emulation',
  modern: 'Modern emulation',
};
const monthValue = (date: Date) =>
  `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}`;

function moveMonth(month: string, step: number) {
  const [year, number] = month.split('-').map(Number);
  // setFullYear preserves years below 100, which the Date constructor remaps.
  const date = new Date(0);
  date.setFullYear(year, number - 1 + step, 1);
  return monthValue(date);
}

function displayDate(value: string, allDay: boolean) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
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
            item.seasonNumber
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
  const { data, error, reload } = useApi<CalendarResult>(path);
  const [limit, setLimit] = useState(PAGE_SIZE);
  if (!data) {
    return error ? (
      <ServiceNote error={error} what="releases" retry={reload} />
    ) : (
      <p className="note" role="status">
        Loading releases…
      </p>
    );
  }

  return (
    <>
      {!!data.partialSources.length && (
        <p className="note" role="status">
          Some release sources could not be reached. Their releases may be
          missing.
        </p>
      )}
      {data.truncated && (
        <p className="note" role="status">
          Result limit reached. Choose a media type to see more releases.
        </p>
      )}
      {!data.results.length ? (
        <p className="note">No releases match this month and scope.</p>
      ) : (
        <ol className="setlist">
          {data.results.slice(0, limit).map((release) => {
            const href = releaseHref(release);
            const episode =
              release.seasonNumber !== undefined &&
              release.episodeNumber !== undefined
                ? `Season ${release.seasonNumber}, Episode ${release.episodeNumber}`
                : null;
            const summary = [
              release.artistName,
              release.authorName,
              release.bookFormat === 'audiobook' ? 'Audiobook' : undefined,
              release.softwareCategory &&
                CATEGORY_LABEL[release.softwareCategory],
              release.platformName && `Requested for ${release.platformName}`,
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
                      {displayDate(release.startsAt, release.allDay)}
                    </time>
                    {' · '}
                    {DATE_TYPES[release.dateType]}
                  </small>
                  {summary && <small>{summary}</small>}
                  {release.dateChanges?.map((change) => (
                    <small key={`${change.changedAt}:${change.startsAt}`}>
                      Date changed from{' '}
                      {displayDate(
                        change.previousStartsAt,
                        change.previousAllDay
                      )}{' '}
                      to {displayDate(change.startsAt, change.allDay)} on{' '}
                      {displayDate(change.changedAt, false)}.
                    </small>
                  ))}
                </div>
                <Pill k={release.available ? 'ok' : 'neutral'}>
                  {release.available ? 'Available' : 'Upcoming'}
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
          Show More Releases
        </button>
      )}
    </>
  );
}

export default function Calendar() {
  const { user } = useAuth();
  const admin = isAdministrator(user?.permissions);
  const canSeeAll = canViewAllRequests(user?.permissions);
  const [month, setMonth] = useState(() => monthValue(new Date()));
  const [scope, setScope] = useState('mine');
  const [medium, setMedium] = useState('');
  const [unmonitored, setUnmonitored] = useState(false);
  const query = new URLSearchParams({
    start: `${month}-01`,
    end: `${moveMonth(month, 1)}-01`,
    scope: canSeeAll ? scope : 'mine',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    includeUnmonitored: String(admin && unmonitored),
  });
  if (medium) query.set('mediaType', medium);
  const path = `/calendar?${query}`;

  return (
    <>
      <header className="ph">
        <h1>Release Calendar</h1>
      </header>
      <div className="toolbar" aria-label="Calendar Filters">
        <button
          className="btn btn-quiet btn-sm"
          disabled={month <= FIRST_MONTH}
          onClick={() => setMonth(moveMonth(month, -1))}
        >
          Previous Month
        </button>
        <label className="sel">
          <span className="lbl">Month</span>
          <input
            type="month"
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
          Next Month
        </button>
        {canSeeAll && (
          <label className="sel">
            <span className="lbl">Scope</span>
            <select
              value={scope}
              onChange={(event) => setScope(event.target.value)}
            >
              <option value="mine">My Requests</option>
              <option value="all">All Monitored Releases</option>
            </select>
          </label>
        )}
        <label className="sel">
          <span className="lbl">Media Type</span>
          <select
            value={medium}
            onChange={(event) => setMedium(event.target.value)}
          >
            {MEDIA.map(([value, title]) => (
              <option key={value} value={value}>
                {title}
              </option>
            ))}
          </select>
        </label>
        {admin && (
          <label className="sel">
            <input
              type="checkbox"
              checked={unmonitored}
              onChange={(event) => setUnmonitored(event.target.checked)}
            />
            Include Unmonitored Titles
          </label>
        )}
      </div>
      <CalendarResults key={path} path={path} />
    </>
  );
}

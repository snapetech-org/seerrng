import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  artUrl,
  bookArt,
  bookDetailPath,
  englishAudioEdition,
  hardcoverWorkId,
  mediaLink,
  MediaStatus,
  plexUrl,
  requestBook,
  titleOf,
  tmdbImg,
  yearOf,
  type BookResult,
  type CardTitleKind,
  type CollectionResult,
  type MediaInfo,
  type TitleResult,
} from '../api';
import { useAuth, useMediaServerName } from '../auth';
import { cardTitleModes } from '../cardTitleModes';
import { localToday } from '../dates';
import {
  storeDiscoverNavigationContext,
  type DiscoverNavigationItem,
} from '../discoverNavigation';
import { friendlyError } from '../errors';
import {
  bookMediaWithLibrary,
  dropBookStates,
  useBookStates,
  useOwnedBooks,
} from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon, type IconName } from '../icons';
import { scrollBehavior } from '../motion';
import { seriesRequestSummary } from '../seriesRequestSummary';
import { onSessionReset, sessionGeneration } from '../sessionState';
import { usePrefs } from '../settings';
import {
  isSharedVideoCopy,
  useVideoAvailability,
  videoPlaybackMedia,
  type AvailabilityMode,
} from '../videoAvailability';
import { canRequestBook } from './detail';
import { useQuickRequest } from './requestSheet';
import { useToast } from './toast';
import { VideoRatingsPopover } from './VideoRatings';
import WatchlistButton from './WatchlistButton';

// A stable theme-owned tone per title keeps drawn covers consistent between visits.
function toneOf(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 6;
  return h;
}

// Art that is missing, or fails to load, gets a drawn cover with the title
// instead of an empty grey box. The words come from CSS (data attributes), so
// screen readers and text searches still see the title only once.
export function Cover({
  src,
  title,
  sub,
  icon,
}: {
  src?: string | null;
  title: string;
  sub?: string;
  icon: IconName;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const artwork = artUrl(src);
  if (artwork && !failed)
    return (
      <img
        loading="lazy"
        decoding="async"
        src={artwork}
        referrerPolicy="no-referrer"
        alt=""
        onError={() => setFailed(true)}
      />
    );
  return (
    <div
      className="nocover"
      data-cover-tone={toneOf(title)}
      data-title={title}
      data-sub={sub || ''}
      aria-hidden="true"
    >
      <Icon name={icon} />
    </div>
  );
}

// one status vocabulary everywhere (same as the mockup)
export type Stat = {
  k: 'ok' | 'dl' | 'wait';
  word: string;
  ico: IconName;
} | null;
export function statusOf(
  mi: MediaInfo | undefined,
  book = false,
  serverName = 'Plex',
  availability?: AvailabilityMode
): Stat {
  if (mi?.status === MediaStatus.BLOCKLISTED)
    return { k: 'wait', word: 'Blocklisted', ico: 'lock' };
  // SeerrNG's own cards count the 4K copy too: a title that's only in the 4K library
  // (or only requested in 4K) still gets its glyph
  const shown = (x?: number) =>
    !!x && x >= MediaStatus.PENDING && x <= MediaStatus.AVAILABLE;
  const have = (x?: number) =>
    x === MediaStatus.AVAILABLE || x === MediaStatus.PARTIAL;
  const standardShared = !book && isSharedVideoCopy(mi, false, availability);
  const fourKShared = !book && isSharedVideoCopy(mi, true, availability);
  const standard =
    availability === 'hide' && standardShared ? undefined : mi?.status;
  const fourK =
    availability === 'hide' && fourKShared ? undefined : mi?.status4k;
  const use4k =
    !book &&
    shown(fourK) &&
    (!shown(standard) || (have(fourK) && !have(standard)));
  const s = use4k ? fourK : standard;
  if (
    availability === 'distinguish' &&
    (use4k ? fourKShared : standardShared)
  ) {
    return { k: 'wait', word: 'Available to Other Users', ico: 'user' };
  }
  const downloads = use4k ? mi?.downloadStatus4k : mi?.downloadStatus;
  if (s === MediaStatus.AVAILABLE)
    return {
      k: 'ok',
      word: book ? 'In library' : `On ${serverName}`,
      ico: 'check',
    };
  if (s === MediaStatus.PARTIAL)
    return { k: 'ok', word: `Partly on ${serverName}`, ico: 'check' };
  // processing = handed to Radarr/Sonarr/ChaptarrNG; it's only "downloading" once a download shows up
  if (s === MediaStatus.PROCESSING) {
    const d = downloads?.[0];
    return d
      ? {
          k: 'dl',
          // still all to come: waiting its turn in the download client's queue
          word: !d.size
            ? 'Downloading'
            : d.sizeLeft >= d.size
              ? 'Queued'
              : `Downloading ${Math.round((1 - d.sizeLeft / d.size) * 100)}%`,
          ico: 'down',
        }
      : { k: 'wait', word: 'Requested', ico: 'clock' };
  }
  if (s === MediaStatus.PENDING)
    return { k: 'wait', word: 'Requested', ico: 'clock' };
  return null;
}
// A pending or processing 4K copy must not make the independent HD request look requested
// (the same rule as the movie page).
export const withoutPending4k = (mi?: MediaInfo): MediaInfo | undefined =>
  mi &&
  (mi.status4k === MediaStatus.PENDING ||
    mi.status4k === MediaStatus.PROCESSING)
    ? { ...mi, status4k: undefined, downloadStatus4k: undefined }
    : mi;
export const Glyph = ({ s }: { s: Stat }) => {
  const { t } = useLumenLocale();
  return s ? (
    <span className={`glyph ${s.k}`} title={statusLabel(s, t)}>
      <Icon name={s.ico} />
      <span className="sr">{statusLabel(s, t)}</span>
    </span>
  ) : null;
};

export type CardQuality = 'HD' | '4K' | 'MP3' | 'FLAC';
export type QualityStatus = { quality?: CardQuality; s: Stat };

function videoQualityStatuses(
  media: MediaInfo | undefined,
  serverName: string,
  availability: AvailabilityMode
): QualityStatus[] {
  if (!media) return [];
  const standard = statusOf(
    { ...media, status4k: undefined, downloadStatus4k: undefined },
    false,
    serverName,
    availability
  );
  if (standard?.word === 'Blocklisted') return [{ s: standard }];
  const fourK = statusOf(
    { ...media, status: undefined, downloadStatus: undefined },
    false,
    serverName,
    availability
  );
  const statuses: QualityStatus[] = [
    ...(standard ? [{ quality: 'HD' as const, s: standard }] : []),
    ...(fourK ? [{ quality: '4K' as const, s: fourK }] : []),
  ];
  return statuses;
}

export function QualityStatusGlyphs({
  statuses,
}: {
  statuses: QualityStatus[];
}) {
  const { t } = useLumenLocale();
  if (!statuses.length) return null;
  return (
    <span className="glyph-stack">
      {statuses.map(({ quality, s }) => {
        if (!s) return null;
        const qualityLabel = quality;
        const label = qualityLabel
          ? `${qualityLabel}: ${statusLabel(s, t)}`
          : statusLabel(s, t);
        return (
          <span
            key={quality ?? 'blocklisted'}
            className={`glyph ${s.k}`}
            data-quality={quality}
            title={label}
            role="img"
            aria-label={label}
          >
            {quality && <span className="glyph-quality">{qualityLabel}</span>}
            <Icon name={s.ico} />
          </span>
        );
      })}
    </span>
  );
}

export function statusLabel(
  s: { word: string } | null,
  t: ReturnType<typeof useLumenLocale>['t']
) {
  if (!s) return '';
  if (s.word === 'Blocklisted') return t('lumen.status.blocklisted', s.word);
  if (s.word === 'In library') return t('lumen.status.inLibrary', s.word);
  if (s.word === 'Requested') return t('lumen.status.requested', s.word);
  if (s.word === 'Processing') return t('lumen.status.processing', s.word);
  if (s.word === 'Waiting for approval')
    return t('lumen.status.waitingApproval', s.word);
  if (s.word === 'Approved') return t('lumen.status.approved', s.word);
  if (s.word === 'Searching') return t('lumen.status.searching', s.word);
  if (s.word === 'Importing') return t('lumen.status.importing', s.word);
  if (s.word === 'Checking library')
    return t('lumen.status.checkingLibrary', s.word);
  if (s.word === 'Couldn’t get it') return t('lumen.status.couldntGet', s.word);
  if (s.word === 'Declined') return t('lumen.status.declined', s.word);
  if (s.word === 'Cancelled') return t('lumen.status.cancelled', s.word);
  if (s.word === 'Unavailable') return t('lumen.status.unavailable', s.word);
  if (s.word === 'Status unavailable')
    return t('lumen.status.statusUnavailable', s.word);
  if (s.word === 'Different edition in library')
    return t('lumen.status.differentEdition', s.word);
  if (s.word === 'Downloading') return t('lumen.status.downloading', s.word);
  if (s.word === 'Complete') return t('lumen.status.complete', s.word);
  if (s.word === 'Queued') return t('lumen.status.queued', s.word);
  if (s.word === 'Available to Other Users')
    return t('lumen.status.shared', s.word);
  if (s.word === 'Partly in library')
    return t('lumen.status.partlyInLibrary', s.word);
  const onServer = /^On (.+)$/.exec(s.word);
  if (onServer)
    return t('lumen.status.onServer', 'On {server}', {
      server: onServer[1],
    });
  const on4kServer = /^4K on (.+)$/.exec(s.word);
  if (on4kServer)
    return t('lumen.status.on4kServer', '4K on {server}', {
      server: on4kServer[1],
    });
  const partlyOnServer = /^Partly on (.+)$/.exec(s.word);
  if (partlyOnServer)
    return t('lumen.status.partlyOnServer', 'Partly on {server}', {
      server: partlyOnServer[1],
    });
  const downloading = /^Downloading (\d+)%$/.exec(s.word);
  if (downloading)
    return t('lumen.status.downloadingPercent', 'Downloading {percent}%', {
      percent: downloading[1],
    });
  const allInLibrary = /^All (\d+) in library$/.exec(s.word);
  if (allInLibrary)
    return t('lumen.status.allInLibrary', 'All {count} in library', {
      count: allInLibrary[1],
    });
  const owned = /^(\d+) of (\d+) in library$/.exec(s.word);
  if (owned)
    return t('lumen.status.ownedInLibrary', '{owned} of {total} in library', {
      owned: owned[1],
      total: owned[2],
    });
  return s.word;
}

export function StatLabel({ s }: { s: { word: string } | null }) {
  const { t } = useLumenLocale();
  return statusLabel(s, t);
}

// one request at a time: a double click must not send it twice (the second comes back as an
// error after the first worked). Every request button on a card shares the same guard.
function useBusy(run: () => void | Promise<void>) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const start = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await run();
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return [start, busy] as const;
}

// touch screens can't hover, so posters get a small round request button instead of the overlay
// (CSS shows it only where there's no mouse; the overlay keeps working on desktop)
export function TouchQuick({
  label,
  onClick,
  busy = false,
}: {
  label: string;
  onClick: () => Promise<void>;
  busy?: boolean;
}) {
  return (
    <button
      className="tq"
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={() => void onClick()}
    >
      <Icon name="plus" />
    </button>
  );
}

const MON = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
// "Mar 11", or "Mar 11, 2027" when the date is in another year than this one (`year: false` for
// callers that print the year themselves)
export const shortDate = (d?: string, year = true, locale?: string) => {
  if (!d) return '';
  if (locale) {
    const date = new Date(`${d.slice(0, 10)}T12:00:00Z`);
    const includeYear =
      year && date.getUTCFullYear() !== new Date().getFullYear();
    return date.toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      ...(includeYear ? { year: 'numeric' as const } : {}),
    });
  }
  return (
    `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}` +
    (year && +d.slice(0, 4) !== new Date().getFullYear()
      ? `, ${+d.slice(0, 4)}`
      : '')
  );
};

// local request state so a card flips to "Requested" straight away
function useRequested(initial: Stat) {
  const [requested, setRequested] = useState('');
  return [
    requested && initial?.k !== 'ok'
      ? ({ k: 'wait', word: requested, ico: 'clock' } as const)
      : initial,
    (word = 'Requested') => setRequested(word),
  ] as const;
}

export function useCardTitleMode(kind?: CardTitleKind) {
  const { user } = useAuth();
  return kind ? cardTitleModes(user?.settings)[kind] : undefined;
}

export function CollectionCard({
  collection,
}: {
  collection: CollectionResult;
}) {
  const href = `/collection/${collection.id}`;
  return (
    <div className="poster">
      <div className="art">
        <Cover
          src={tmdbImg(collection.posterPath)}
          title={collection.title}
          icon="film"
        />
        <Link className="hit" to={href} aria-label={collection.title} />
      </div>
      <Link className="t" to={href} tabIndex={-1} aria-hidden="true">
        {collection.title}
      </Link>
    </div>
  );
}

export function TitleCard({
  it,
  meta,
  discoverContextId,
  discoverItems,
}: {
  it: TitleResult;
  meta?: string;
  discoverContextId?: string;
  discoverItems?: DiscoverNavigationItem[];
}) {
  const { t } = useLumenLocale();
  const serverName = useMediaServerName();
  const toast = useToast();
  const { prefs } = usePrefs();
  const tv = it.mediaType === 'tv';
  const titleMode = useCardTitleMode(tv ? 'tv' : 'movie');
  const availability = useVideoAvailability();
  const media = it.mediaInfo;
  const requestMedia = withoutPending4k(media);
  // Presentation never changes whether the server already has or is acquiring a copy.
  const shown = statusOf(media, false, serverName, availability);
  const [requestedQuality, setRequestedQuality] = useState<CardQuality>();
  const videoStatuses = videoQualityStatuses(media, serverName, availability);
  const visibleVideoStatuses: QualityStatus[] = videoStatuses.map((item) =>
    requestedQuality && item.quality === requestedQuality
      ? {
          ...item,
          s: {
            k: 'wait' as const,
            word: 'Requested',
            ico: 'clock' as const,
          },
        }
      : item
  );
  if (
    requestedQuality &&
    !videoStatuses.some(({ quality }) => quality === requestedQuality) &&
    videoStatuses.every(({ quality }) => quality)
  ) {
    visibleVideoStatuses.push({
      quality: requestedQuality,
      s: {
        k: 'wait',
        word: 'Requested',
        ico: 'clock',
      },
    });
  }
  const [s, markRequested] = useRequested(
    statusOf(requestMedia, false, serverName)
  );
  const visibleRequestStatus =
    s?.k === 'ok' ? statusOf(requestMedia, false, serverName, availability) : s;
  const playbackMedia = videoPlaybackMedia(media, availability);
  const date = it.releaseDate || it.firstAirDate;
  const unreleased = !!date && date > localToday();
  const href = `/${tv ? 'tv' : 'movie'}/${it.id}`;
  const detailHref =
    discoverContextId && discoverItems
      ? `${href}?discoverContext=${encodeURIComponent(discoverContextId)}`
      : href;
  const saveDiscoverContext = () => {
    if (discoverContextId && discoverItems)
      storeDiscoverNavigationContext(discoverContextId, discoverItems, {
        id: it.id,
        mediaType: tv ? 'tv' : 'movie',
      });
  };
  const m =
    meta ||
    [unreleased ? shortDate(date) : yearOf(it), tv ? 'Series' : '']
      .filter(Boolean)
      .join(' · ');
  const qm = [
    unreleased ? 'Out ' + shortDate(date) : yearOf(it),
    it.voteAverage ? '★ ' + it.voteAverage.toFixed(1) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const quick = useQuickRequest(it, (is4k, series, quotaException) => {
    markRequested(is4k ? '4K Requested' : 'Requested');
    setRequestedQuality(is4k ? '4K' : 'HD');
    toast(
      quotaException
        ? `Approval requested for ${titleOf(it)}`
        : tv
          ? seriesRequestSummary(titleOf(it), series, is4k)
          : `Requested ${titleOf(it)}${is4k ? ' in 4K' : ''}`
    );
  });
  const [request, busy] = useBusy(quick.request);
  // The Request button sits in an overlay that only shows on hover or focus. While the sheet is
  // open the poster has neither, so keep the overlay up until focus is back on the button.
  const goRef = useRef<HTMLButtonElement>(null);
  const sheetOpen = quick.sheet !== null;
  const [hold, setHold] = useState(false);
  useEffect(() => {
    if (sheetOpen) setHold(true);
    else if (hold) {
      goRef.current?.focus({ preventScroll: true });
      setHold(false);
    }
  }, [sheetOpen, hold]);
  let qb: ReactNode;
  const plex = plexUrl(playbackMedia);
  if (!quick.allowed) qb = null;
  else if (s?.k === 'ok')
    qb =
      visibleRequestStatus?.k !== 'ok' ? null : plex ? (
        <a
          className="qbtn okb"
          {...mediaLink(playbackMedia, false, tv ? 'tv' : 'movie')}
        >
          <Icon name="play" size="sm" />
          {t('lumen.tv.watchOn', 'Watch on {server}', { server: serverName })}
        </a>
      ) : (
        <Link
          className="qbtn okb"
          to={detailHref}
          onClick={saveDiscoverContext}
        >
          <Icon name="play" size="sm" />
          {t('lumen.status.onServer', 'On {server}', { server: serverName })}
        </Link>
      );
  else if (s)
    qb = (
      <button className="qbtn done" disabled>
        <Icon name={s.ico} size="sm" />
        <StatLabel s={s} />
      </button>
    );
  else if (tv && !prefs.wholeSeriesDefault)
    qb = (
      <Link
        className="qbtn go"
        to={detailHref + '#seasons'}
        onClick={saveDiscoverContext}
      >
        <Icon name="list" size="sm" />
        {t('lumen.accessibility.chooseSeasons', 'Choose seasons')}
      </Link>
    );
  else
    qb = (
      <>
        <button
          ref={goRef}
          className="qbtn go"
          disabled={busy}
          onClick={request}
        >
          <Icon name="plus" size="sm" />
          {unreleased ? 'Request early' : 'Request'}
        </button>
        {tv && (
          <Link
            className="qbtn ghost"
            to={detailHref + '#seasons'}
            onClick={saveDiscoverContext}
            aria-label={t(
              'lumen.accessibility.chooseSeasons',
              'Choose seasons'
            )}
            title={t('lumen.accessibility.chooseSeasons', 'Choose seasons')}
          >
            <Icon name="list" size="sm" />
          </Link>
        )}
      </>
    );
  return (
    <div
      className={hold ? 'poster hold' : 'poster'}
      data-media-type={tv ? 'tv' : 'movie'}
      data-title-mode={it.posterPath ? titleMode : undefined}
    >
      <div className="art">
        <Cover
          src={it.posterPath ? tmdbImg(it.posterPath) : null}
          title={titleOf(it)}
          sub={yearOf(it)}
          icon={tv ? 'tv' : 'film'}
        />
        <QualityStatusGlyphs
          statuses={
            visibleVideoStatuses.length || (!visibleRequestStatus && !shown)
              ? visibleVideoStatuses
              : [...visibleVideoStatuses, { s: visibleRequestStatus || shown }]
          }
        />
        <Link
          className="hit"
          to={detailHref}
          onClick={saveDiscoverContext}
          aria-label={titleOf(it)}
        />
        {prefs.hoverRequest &&
          quick.allowed &&
          !s &&
          (!tv || prefs.wholeSeriesDefault) && (
            <TouchQuick
              label={`Request ${titleOf(it)}${tv ? ' (entire series)' : ''}`}
              onClick={request}
              busy={busy}
            />
          )}
        <WatchlistButton
          mediaType={tv ? 'tv' : 'movie'}
          detail={{ id: it.id, title: titleOf(it) }}
          compact
          touch
        />
        <div className="qa">
          {prefs.hoverRequest && (
            <>
              <div className="qt">{titleOf(it)}</div>
              <div className="qm">{qm}</div>
              <div className="qb">{qb}</div>
            </>
          )}
          <div className="qb watchlist-row">
            <WatchlistButton
              mediaType={tv ? 'tv' : 'movie'}
              detail={{ id: it.id, title: titleOf(it) }}
              compact
            />
          </div>
        </div>
      </div>
      <Link
        className="t"
        to={detailHref}
        onClick={saveDiscoverContext}
        tabIndex={-1}
        aria-hidden="true"
      >
        {titleOf(it)}
      </Link>
      <div className="m">
        <span className="card-meta">{m}</span>
        <VideoRatingsPopover
          mediaType={tv ? 'tv' : 'movie'}
          id={it.id}
          voteAverage={it.voteAverage}
          voteCount={it.voteCount}
          title={titleOf(it)}
        />
      </div>
      {quick.sheet}
    </div>
  );
}

export function BookCard({ b }: { b: BookResult }) {
  const { t } = useLumenLocale();
  const titleMode = useCardTitleMode('book');
  const audio = b.bookFormat === 'audiobook';
  const { prefs } = usePrefs();
  const { user } = useAuth();
  const mayRequest = canRequestBook(user?.permissions);
  const toast = useToast();
  const states = useBookStates();
  const format = audio ? 'audiobook' : 'ebook';
  const library = useOwnedBooks(format);
  const known = states?.get(b.id)?.[format];
  const media = bookMediaWithLibrary(b, format, library);
  const libraryStatus = statusOf(media, true);
  const [s0, markRequested] = useRequested(libraryStatus);
  const ownershipUnknown =
    b.provider === 'openlibrary' &&
    !!library?.complete &&
    !media &&
    !known &&
    !s0;
  const s =
    s0 ||
    libraryStatus ||
    (known
      ? { k: 'wait' as const, word: 'Requested', ico: 'clock' as const }
      : !library?.complete
        ? {
            k: 'wait' as const,
            word: library?.unavailable
              ? 'Library check unavailable'
              : library
                ? 'Library check incomplete'
                : 'Checking library',
            ico: 'clock' as const,
          }
        : ownershipUnknown
          ? {
              k: 'wait' as const,
              word: 'Library status unknown',
              ico: 'clock' as const,
            }
          : null);
  // narrator choice off (admin or personal setting) = one straight request, no picker
  const straight = !audio || !prefs.narratorChoice;
  const go = async () => {
    if (!mayRequest) return;
    try {
      await requestBook(
        b.id,
        audio ? 'audiobook' : 'ebook',
        audio ? await englishAudioEdition(hardcoverWorkId(b.id)) : undefined,
        'either'
      );
      markRequested();
      dropBookStates();
      toast(`Requested ${b.title} · ${audio ? 'audiobook' : 'ebook'}`);
    } catch (e) {
      toast(
        friendlyError(e, t('lumen.error.requestFailed', 'Request failed'), t)
      );
    }
  };
  const [request, busy] = useBusy(go);
  const href = bookDetailPath(b.id, format, b.title);
  const series = b.series?.[0];
  return (
    <div
      className={`poster ${audio ? 'sq' : 'book'}`}
      data-title-mode={b.posterPath ? titleMode : undefined}
    >
      <div className="art">
        <Cover
          src={bookArt(b.posterPath)}
          title={b.title}
          sub={b.author}
          icon={audio ? 'headphones' : 'book'}
        />
        {/* unknown is almost always not owned (SeerrNG marks the owned Open Library
            results), so no corner badge; the request still says "anyway" */}
        <Glyph s={ownershipUnknown ? null : s} />
        <Link className="hit" to={href} aria-label={b.title} />
        {prefs.hoverRequest &&
          mayRequest &&
          (!s || ownershipUnknown) &&
          straight && (
            <TouchQuick
              label={
                ownershipUnknown
                  ? `Request ${b.title} anyway; library status is unknown`
                  : `Request ${b.title} (${audio ? 'audiobook' : 'ebook'})`
              }
              onClick={request}
              busy={busy}
            />
          )}
        <WatchlistButton
          mediaType="book"
          detail={{ id: b.id, title: b.title }}
          compact
          touch
        />
        <div className="qa">
          {prefs.hoverRequest && mayRequest && (
            <>
              <div className="qt">{b.title}</div>
              <div className="qm">
                {[
                  series?.title ? `${series.title} #${series.position}` : '',
                  b.firstPublishYear,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <div className="qb">
                {s?.k === 'ok' ? (
                  <>
                    {/* this button did nothing: the book page has the library links */}
                    <Link
                      className="qbtn okb"
                      to={href}
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      <Icon name={audio ? 'play' : 'book'} size="sm" />
                      {audio ? 'Listen' : 'Read'}
                    </Link>
                    {audio && prefs.narratorChoice && (
                      <Link
                        className="qbtn ghost"
                        to={href + '#narr'}
                        aria-label={t(
                          'lumen.accessibility.requestAnotherNarrator',
                          'Request another narrator'
                        )}
                        title={t(
                          'lumen.accessibility.requestAnotherNarrator',
                          'Request another narrator'
                        )}
                      >
                        <Icon name="plus" size="sm" />
                      </Link>
                    )}
                  </>
                ) : s && !ownershipUnknown ? (
                  <button className="qbtn done" disabled>
                    <Icon name={s.ico} size="sm" />
                    <StatLabel s={s} />
                  </button>
                ) : straight ? (
                  <button className="qbtn go" disabled={busy} onClick={request}>
                    <Icon name="plus" size="sm" />
                    {ownershipUnknown
                      ? 'Request anyway'
                      : audio
                        ? 'Request audiobook'
                        : 'Request ebook'}
                  </button>
                ) : (
                  <Link
                    className="qbtn go"
                    to={href}
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <Icon name="headphones" size="sm" />
                    Choose narrator
                  </Link>
                )}
              </div>
            </>
          )}
          <div className="qb watchlist-row">
            <WatchlistButton
              mediaType="book"
              detail={{ id: b.id, title: b.title }}
              compact
            />
          </div>
        </div>
      </div>
      <Link className="t" to={href} tabIndex={-1} aria-hidden="true">
        {b.title}
      </Link>
      <div className="m">
        {b.author || (audio ? 'Audiobook' : 'Ebook')}
        {b.firstPublishYear ? ' · ' + b.firstPublishYear : ''}
      </div>
    </div>
  );
}

export function FeatCard({
  it,
  eyebrow,
  lazy,
}: {
  it: TitleResult;
  eyebrow: string;
  lazy?: boolean;
}) {
  const { t } = useLumenLocale();
  const serverName = useMediaServerName();
  const tv = it.mediaType === 'tv';
  const availability = useVideoAvailability();
  const requestMedia = withoutPending4k(it.mediaInfo);
  const s = statusOf(requestMedia, false, serverName);
  const shown = statusOf(requestMedia, false, serverName, availability);
  const playbackMedia = videoPlaybackMedia(it.mediaInfo, availability);
  const toast = useToast();
  const { prefs } = usePrefs();
  const [done, setDone] = useState('');
  const mm = [
    yearOf(it),
    tv ? 'Series' : 'Movie',
    it.voteAverage ? '★ ' + it.voteAverage.toFixed(1) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const quick = useQuickRequest(it, (is4k, series, quotaException) => {
    setDone(is4k ? '4K Requested' : 'Requested');
    toast(
      quotaException
        ? `Approval requested for ${titleOf(it)}`
        : tv
          ? seriesRequestSummary(titleOf(it), series, is4k)
          : `Requested ${titleOf(it)}${is4k ? ' in 4K' : ''}`
    );
  });
  const [request, busy] = useBusy(quick.request);
  return (
    <div className="feat">
      {quick.sheet}
      <img
        src={tmdbImg(it.backdropPath, 'w780')}
        alt=""
        loading={lazy ? 'lazy' : undefined}
      />
      <Link
        className="hit"
        to={`/${tv ? 'tv' : 'movie'}/${it.id}`}
        aria-label={titleOf(it)}
      />
      <span className="cap">
        <span className="ey">{eyebrow}</span>
        <h3>{titleOf(it)}</h3>
        <span className="row">
          <span className="mm">{mm}</span>
          {s?.k === 'ok' && shown?.k === 'ok' ? (
            // this button used to do nothing: open Plex when we have a link, else the title page
            plexUrl(playbackMedia) ? (
              <a
                className="btn go"
                {...mediaLink(playbackMedia, false, tv ? 'tv' : 'movie')}
              >
                <Icon name="play" size="sm" />
                Watch
              </a>
            ) : (
              <Link className="btn go" to={`/${tv ? 'tv' : 'movie'}/${it.id}`}>
                <Icon name="play" size="sm" />
                Watch
              </Link>
            )
          ) : s || done ? (
            (shown || done) && (
              <span className="btn go done">
                <Icon name={shown?.ico || 'clock'} size="sm" />
                {done || <StatLabel s={shown} />}
              </span>
            )
          ) : quick.allowed && tv && !prefs.wholeSeriesDefault ? (
            <Link className="btn go" to={`/tv/${it.id}#seasons`}>
              <Icon name="list" size="sm" />
              {t('lumen.accessibility.chooseSeasons', 'Choose seasons')}
            </Link>
          ) : quick.allowed ? (
            <button className="btn go" disabled={busy} onClick={request}>
              <Icon name="plus" size="sm" />
              {tv ? 'Request series' : 'Request'}
            </button>
          ) : null}
        </span>
      </span>
    </div>
  );
}

const railPositions = new Map<string, number>();
onSessionReset(() => railPositions.clear());

// a horizontal row with arrow buttons for mouse users (same behaviour as the mockup)
export function Rail({
  children,
  className = '',
  restoreId,
}: {
  children: ReactNode;
  className?: string;
  restoreId?: string;
}) {
  const { t } = useLumenLocale();
  const location = useLocation();
  const storageKey = restoreId
    ? JSON.stringify([location.key, restoreId])
    : undefined;
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  useLayoutEffect(() => {
    const r = ref.current;
    if (!r) return;
    const generation = sessionGeneration();
    if (storageKey) r.scrollLeft = railPositions.get(storageKey) ?? 0;
    const save = () => {
      if (!storageKey || generation !== sessionGeneration()) return;
      railPositions.delete(storageKey);
      railPositions.set(storageKey, r.scrollLeft);
      if (railPositions.size > 200) {
        const oldest = railPositions.keys().next().value;
        if (oldest !== undefined) railPositions.delete(oldest);
      }
    };
    const upd = () =>
      setEdge({
        start: r.scrollLeft < 8,
        end: r.scrollLeft + r.clientWidth > r.scrollWidth - 8,
      });
    upd();
    const onScroll = () => {
      upd();
      save();
    };
    r.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(upd);
    ro.observe(r);
    return () => {
      save();
      r.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [storageKey]);
  const by = (d: number) =>
    ref.current?.scrollBy({
      left: d * ref.current.clientWidth * 0.85,
      behavior: scrollBehavior(),
    });
  return (
    <div className="rail-wrap">
      <div className={`rail ${className}`} ref={ref}>
        {children}
      </div>
      <button
        className="rail-btn prev"
        aria-label={t('lumen.accessibility.scrollBack', 'Scroll back')}
        disabled={edge.start}
        onClick={() => by(-1)}
      >
        <Icon name="chevL" />
      </button>
      <button
        className="rail-btn next"
        aria-label={t('lumen.accessibility.scrollForward', 'Scroll forward')}
        disabled={edge.end}
        onClick={() => by(1)}
      >
        <Icon name="chev" />
      </button>
    </div>
  );
}

export function Section({
  title,
  id,
  link,
  action,
  children,
}: {
  title: string;
  id?: string;
  link?: [string, string];
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id}>
      <div className="sec-head">
        <h2>{title}</h2>
        {link && <Link to={link[1]}>{link[0]}</Link>}
        {action}
      </div>
      {children}
    </section>
  );
}

// placeholder row while a section loads, so the page doesn't jump
export const RailSkeleton = ({ n = 8, sq }: { n?: number; sq?: boolean }) => {
  const { t } = useLumenLocale();
  return (
    <div
      className="rail"
      aria-busy="true"
      aria-label={t('lumen.accessibility.loading', 'Loading')}
    >
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={`poster ${sq ? 'sq' : ''}`}>
          <div className="art skel" />
          <div className="t skel-line" />
        </div>
      ))}
    </div>
  );
};

// placeholder grid while a list's first page loads, so a slow answer doesn't look empty
export const GridSkeleton = ({
  n = 12,
  sq,
  className = 'grid',
}: {
  n?: number;
  sq?: boolean;
  className?: string;
}) => {
  const { t } = useLumenLocale();
  return (
    <div
      className={className}
      aria-busy="true"
      aria-label={t('lumen.accessibility.loading', 'Loading')}
    >
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={`poster ${sq ? 'sq' : ''}`}>
          <div className="art skel" />
          <div className="t skel-line" />
        </div>
      ))}
    </div>
  );
};

// endless scrolling: loads the next page when this marker comes within a screen of view
export function MoreOnScroll({
  done,
  loading,
  more,
  error,
  retry,
  labels,
}: {
  done: boolean;
  loading: boolean;
  more: () => void;
  error?: string | null;
  retry?: () => void;
  labels?: { error: string; retry: string; loading: string };
}) {
  const { t } = useLumenLocale();
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ done, loading, more });
  latest.current = { done, loading, more };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const l = latest.current;
        if (entries.some((e) => e.isIntersecting) && !l.done && !l.loading)
          l.more();
      },
      { rootMargin: '0px 0px 900px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
    // the marker is removed while done ("Look further" brings it back): watch the new one
  }, [done]);
  // a short page can leave the marker on screen after a load; check again once loading ends
  useEffect(() => {
    const el = ref.current;
    if (!el || done || loading) return;
    if (el.getBoundingClientRect().top < window.innerHeight + 900) more();
  }, [done, loading, more]);
  // a page failed: stop here and let the person ask again (shown where the list stopped)
  if (error && retry)
    return (
      <div className="more-scroll" role="alert">
        {labels?.error ??
          t('lumen.browse.loadMoreFailure', 'Couldn’t load more.')}{' '}
        <button className="btn btn-tonal btn-sm" onClick={retry}>
          {labels?.retry ?? t('lumen.common.retry', 'Retry')}
        </button>
      </div>
    );
  if (done) return null;
  return (
    <div ref={ref} className="more-scroll" aria-live="polite">
      {loading
        ? (labels?.loading ?? t('lumen.browse.loadingMore', 'Loading more…'))
        : ''}
    </div>
  );
}

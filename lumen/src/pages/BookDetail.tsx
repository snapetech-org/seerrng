import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  api,
  audiobookEditionsPath,
  audiobookshelfLink,
  bookArt,
  bookDetailPath,
  bookIdFor,
  bookMediaForFormat,
  englishAudioEdition,
  hardcoverWorkId,
  MediaStatus,
  narratorKey,
  requestBook,
  type BookDetails,
  type BookResult,
  type Edition,
  type EditionList,
  type RequestOptions,
} from '../api';
import { isAdministrator, useAuth } from '../auth';
import BlocklistButton from '../components/BlocklistButton';
import BookRequestOptions from '../components/BookRequestOptions';
import BulkBookRequest from '../components/BulkBookRequest';
import { StatLabel, statusOf } from '../components/cards';
import {
  ActionBar,
  canManageRequests,
  canRequestBook,
  DetailTop,
  Facts,
  fmtHrs,
  Pill,
  VideoDisclosure,
} from '../components/detail';
import { ServiceNote } from '../components/extra';
import FollowButton from '../components/FollowButton';
import IndexerSearchLink from '../components/IndexerSearchLink';
import OpenIssueReports from '../components/OpenIssueReports';
import ReaderDeliveryLink from '../components/ReaderDeliveryLink';
import ReportIssueButton from '../components/ReportIssueButton';
import { ReaderDownloads } from '../components/RequestFiles';
import { useToast } from '../components/toast';
import WatchlistButton from '../components/WatchlistButton';
import { friendlyError } from '../errors';
import { canViewFollowing } from '../followPermissions';
import { dropBookStates, useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { usePrefs } from '../settings';
import { useLiveMediaProgress } from '../useLiveDownloadProgress';
import { AssociationLink } from './Associations';

interface BookRating {
  average?: number;
  count: number;
  source: 'openlibrary' | 'bookshelf';
  workId?: string;
}

function ratingLabel(
  rating: BookRating | null,
  book: BookDetails,
  t: ReturnType<typeof useLumenLocale>['t'],
  locale: string
) {
  const valid = (score: unknown, count: number): score is number =>
    typeof score === 'number' &&
    score >= 0 &&
    score <= 5 &&
    Number.isSafeInteger(count) &&
    count > 0;
  const score = rating?.average;
  const localScore = book.ratingsAverage;
  const localCount = book.ratingsCount ?? 0;
  if (
    rating &&
    (rating.source === 'openlibrary' || rating.source === 'bookshelf') &&
    valid(score, rating.count)
  ) {
    const library = rating.source === 'openlibrary';
    const source = library
      ? t('lumen.bookDetail.openLibrary', 'Open Library')
      : 'Bookshelf';
    const label = `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(score)}/5 · ${source}`;
    const work = rating.workId ?? book.id;
    return library && /^OL[0-9]+W$/.test(work) ? (
      <a href={`https://openlibrary.org/works/${work}`}>{label}</a>
    ) : (
      label
    );
  }
  if (book.provider === 'bookshelf' && valid(localScore, localCount))
    return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(localScore)}/5 · Bookshelf`;
}

const english = (e: Edition) =>
  !e.language || /^(en|eng|english|und)$/i.test(e.language);
const who = (e: Edition, t: ReturnType<typeof useLumenLocale>['t']) =>
  e.narrators?.length
    ? e.narrators.length > 3
      ? `${e.narrators.slice(0, 3).join(', ')} +${e.narrators.length - 3}`
      : e.narrators.join(' & ')
    : t('lumen.bookDetail.narratorNotListed', 'Narrator not listed');

// SeerrNG lists catalogue copies it can't pin (no Hardcover edition id) with an empty id
const pinnable = (e: Edition) => !!e.id && e.requestable !== false;
// a narration row: one recording, keyed by its narrators (edition ids can be empty or shared)
type NarrationRow = Edition & { key: string };

// one row per distinct narrator set; a copy that can be requested wins, then the most detail
function narrations(list: Edition[]): NarrationRow[] {
  const by = new Map<string, NarrationRow>();
  for (const e of list.filter((x) => x.format === 'audiobook' && english(x))) {
    const k = narratorKey(e.narrators) || 'unknown:' + e.id;
    const cur = by.get(k);
    const score = (x: Edition) =>
      (pinnable(x) ? 16 : 0) +
      (x.durationSeconds ? 2 : 0) +
      (x.publisher ? 1 : 0) +
      (x.owned ? 4 : 0) +
      (x.selected ? 3 : 0);
    if (!cur || score(e) > score(cur))
      by.set(k, {
        ...e,
        key: k,
        owned: e.owned || cur?.owned,
        selected: e.selected || cur?.selected,
      });
    else if (e.owned || e.selected)
      by.set(k, {
        ...cur,
        owned: cur.owned || e.owned,
        selected: cur.selected || e.selected,
      });
  }
  // full-cast productions show up as several listings (different cast subsets, or just "Full Cast");
  // keep one row for them: one that can be requested, then the one with the most detail
  const castScore = (x: Edition) =>
    (pinnable(x) ? 16 : 0) +
    (x.durationSeconds ? 4 : 0) +
    (x.owned ? 8 : 0) +
    (x.narrators?.length || 0) / 100;
  const isCast = (x: Edition) =>
    (x.narrators?.length || 0) > 3 || narratorKey(x.narrators) === 'full cast';
  const cast = [...by.values()]
    .filter(isCast)
    .sort((a, b) => castScore(b) - castScore(a));
  const rows = [...by.values()]
    .filter((x) => !isCast(x))
    .concat(
      cast.slice(0, 1).map((x) => ({
        ...x,
        owned: cast.some((c) => c.owned),
        selected: cast.some((c) => c.selected),
      }))
    );
  // unnamed recordings only add noise when named ones exist; "Any English narrator" covers them
  const named = rows.filter((r) => r.narrators?.length || r.owned);
  return (named.length ? named : rows).sort(
    (a, b) =>
      Number(!!b.owned) - Number(!!a.owned) ||
      Number(!!b.selected) - Number(!!a.selected) ||
      (b.narrators?.length ? 1 : 0) - (a.narrators?.length ? 1 : 0)
  );
}

// Hardcover tags that name a format, not a subject ("Audiobook" on the ebook page)
const FORMAT_TAG = /^(audio ?books?|e-?books?|kindle|audible)$/i;

interface BookSeriesDetails {
  id: string;
  title: string;
  description?: string;
  books: BookResult[];
}

function BookSeriesSummary({ id, title }: { id: string; title: string }) {
  const { t } = useLumenLocale();
  const { data, error, reload } = useApi<BookSeriesDetails>(
    `/series/${encodeURIComponent(id)}`,
    { currentPathOnly: true }
  );
  const subjects = [
    ...new Set(
      (data?.books ?? [])
        .flatMap((book) => book.subjects ?? [])
        .map((subject) => subject.trim())
        .filter(Boolean)
    ),
  ].slice(0, 3);

  return (
    <section className="adv" data-testid={`book-series-${id}`}>
      <h3 className="h2">
        <Link to={`/book-series/${encodeURIComponent(id)}`}>
          {data?.title || title}{' '}
          {t('lumen.bookDetail.collectionTitle', 'Collection')}
        </Link>
      </h3>
      {error ? (
        <p className="note">
          {error}{' '}
          <button className="chip" type="button" onClick={() => void reload()}>
            {t('lumen.bookSeries.retry', 'Retry')}
          </button>
        </p>
      ) : data ? (
        <>
          {data.description && <p className="ov">{data.description}</p>}
          <p className="note">
            {t('lumen.bookDetail.collectionSize', 'Collection size: {count}', {
              count: data.books.length,
            })}
          </p>
          {subjects.length > 0 && (
            <div className="toolbar">
              {subjects.map((subject) => (
                <Link
                  className="chip"
                  key={subject}
                  to={`/books?subject=${encodeURIComponent(subject)}`}
                >
                  {subject}
                </Link>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="note" aria-busy="true">
          {t('lumen.bookDetail.loadingCollection', 'Loading collection…')}
        </p>
      )}
    </section>
  );
}

// bookshelf:N:<base64 of a bare number> -> the same book under bookshelf:N:<base64 of "hc:number">
function hcFormId(id: string): string | null {
  const m = /^(bookshelf:\d+:)([A-Za-z0-9_-]+)$/.exec(id);
  if (!m) return null;
  try {
    const raw = atob(m[2].replace(/-/g, '+').replace(/_/g, '/'));
    if (!/^[1-9]\d*$/.test(raw)) return null;
    return `${m[1]}${btoa(`hc:${raw}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  } catch {
    return null;
  }
}

export default function BookDetail() {
  const { t, locale } = useLumenLocale();
  const { id = '' } = useParams();
  const [p] = useSearchParams();
  const f: 'ebook' | 'audiobook' =
    p.get('f') === 'audio' || p.get('format') === 'audiobook'
      ? 'audiobook'
      : 'ebook';
  const { prefs, audiobookshelfUrl } = usePrefs();
  const toast = useToast();
  const { user } = useAuth();
  // useParams has already decoded it (decoding again breaks on a literal %)
  const plainId = bookIdFor(id, f);
  const rawLookupTitle = plainId.startsWith('bookshelf:')
    ? p.get('lookupTitle')?.trim()
    : undefined;
  const lookupTitle =
    rawLookupTitle && rawLookupTitle.length <= 512 ? rawLookupTitle : undefined;
  const lookup = lookupTitle ? `?${new URLSearchParams({ lookupTitle })}` : '';
  const first = useApi<BookDetails>(
    `/book/${encodeURIComponent(plainId)}${lookup}`,
    { currentPathOnly: true }
  );
  const ratings = useApi<BookRating>(
    first.data ? `/book/${encodeURIComponent(plainId)}/ratings${lookup}` : null,
    { currentPathOnly: true }
  );
  const bookId = plainId;
  // Books stored under a bare Hardcover id can come back without a description while the
  // "hc:" form of the same work has one: ask for that form once, and only to fill the blurb.
  const altId =
    first.data && !first.data.description ? hcFormId(plainId) : null;
  const alt = useApi<BookDetails>(
    altId ? `/book/${encodeURIComponent(altId)}${lookup}` : null
  );
  const b = useMemo(
    () =>
      first.data && !first.data.description && altId && alt.data?.description
        ? { ...first.data, description: alt.data.description }
        : first.data,
    [first.data, alt.data, altId]
  );
  const formatHref = (format: 'ebook' | 'audiobook') =>
    bookDetailPath(id, format, lookupTitle ?? first.data?.title);
  const error = first.error;
  const progressMedia = useLiveMediaProgress(
    bookMediaForFormat(b?.mediaInfo, f),
    isAdministrator(user?.permissions)
  );
  const reload = first.reload;
  const work = hardcoverWorkId(bookId);
  const showNarr = f === 'audiobook' && prefs.narratorChoice;
  // narrations load on the ebook page too, so its Audiobook button reads the same as on the audiobook page
  const narrData = prefs.narratorChoice && !!work;
  const eds = useApi<EditionList>(
    narrData && work ? audiobookEditionsPath(work) : null
  );
  const allRows = useMemo(
    () => narrations(eds.data?.editions || []),
    [eds.data]
  );
  const soloNarrators = new Map<string, string>();
  if (showNarr && canViewFollowing(user?.permissions)) {
    for (const edition of allRows) {
      const name = edition.narrators?.[0]?.trim();
      if (
        edition.narrators?.length === 1 &&
        name &&
        name.toLowerCase() !== 'full cast'
      )
        soloNarrators.set(name.toLowerCase(), name);
    }
  }
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestOptions, setRequestOptions] = useState<{
    format: 'ebook' | 'audiobook';
    options: RequestOptions;
  }>({ format: f, options: {} });
  const [requestOptionsReady, setRequestOptionsReady] = useState(true);
  const onBookOptionsChange = useCallback(
    (options: RequestOptions) => setRequestOptions({ format: f, options }),
    [f]
  );
  const effectiveRequestOptions =
    requestOptions.format === f ? requestOptions.options : {};
  const quotaUserId = effectiveRequestOptions.userId ?? user?.id;
  const quota = useApi<{
    book?: {
      limit?: number;
      remaining?: number;
      days?: number;
      restricted?: boolean;
    };
  }>(quotaUserId ? `/user/${quotaUserId}/quota` : null, {
    currentPathOnly: true,
  });
  const bookQuota = quota.data?.book;
  const quotaReady = !!quota.data || !!quota.error;
  const quotaBlocked = bookQuota?.restricted === true;
  const requestDisabled =
    busy ||
    !requestOptionsReady ||
    !quotaReady ||
    !!quota.error ||
    quotaBlocked;
  // set at once, unlike busy: a double tap can't send a request twice before the re-render
  const sending = useRef(false);
  const [justAsked, setJustAsked] = useState<Set<string>>(new Set());
  // what SeerrNG says about the audiobook itself: requested or in the library at all?
  const audioStatus = bookMediaForFormat(
    first.data?.mediaInfo,
    'audiobook'
  )?.status;
  const tracked =
    audioStatus === MediaStatus.PENDING ||
    audioStatus === MediaStatus.PROCESSING ||
    audioStatus === MediaStatus.PARTIAL ||
    audioStatus === MediaStatus.AVAILABLE;
  // the book service's own list says which narrations it holds (owned) or has asked for (selected)
  const fromLibrary = eds.data?.source === 'library';
  const rows = allRows;
  // the library already has (or has asked for) this audiobook: other narrators are added as separate copies
  const anotherMode =
    tracked &&
    fromLibrary &&
    (eds.data?.editions || []).some((e) => e.owned || e.selected);
  const stateOf = (r: Edition): '' | 'library' | 'requested' => {
    const k = narratorKey(r.narrators);
    if (k && justAsked.has(k)) return 'requested';
    if (r.owned) return 'library';
    return tracked && fromLibrary && r.selected ? 'requested' : '';
  };

  if (error)
    // only "not found" means there's no ebook; a rate limit or outage can be tried again
    return f === 'ebook' && first.errorStatus === 404 ? (
      <div className="empty">
        <b>{t('lumen.bookDetail.noEbookEdition', 'No ebook edition found')}</b>
        {t(
          'lumen.bookDetail.audiobookOnly',
          'ChaptarrNG only knows this book as an audiobook.'
        )}{' '}
        <Link to={formatHref('audiobook')} style={{ color: 'var(--accent)' }}>
          {t('lumen.bookDetail.seeAudiobook', 'See the audiobook')}
        </Link>
      </div>
    ) : (
      <ServiceNote
        error={error}
        what={t('lumen.bookDetail.thisBook', 'this book')}
        retry={reload}
      />
    );
  if (!b) return <div className="detail-loading" aria-busy="true" />;

  const s = statusOf(progressMedia, true);
  // copies in the library that the English list leaves out (another language)
  const unlisted = (eds.data?.editions || []).filter(
    (e) => e.format === 'audiobook' && e.owned && !english(e)
  );
  const ownedRows = rows.filter((r) => stateOf(r) === 'library');
  const ownsAny = ownedRows.length > 0 || unlisted.length > 0;
  // a request pins SeerrNG's edition id, so a recording it can't pin can't be chosen; another
  // copy next to the one already here also needs a named narrator and a service that can keep both
  const requestable = rows.filter(
    (r) =>
      !stateOf(r) &&
      pinnable(r) &&
      (!anotherMode || (r.narrators?.length && eds.data?.supportsAlongside))
  );
  // the selection is a row key ('*' = any English narrator, '' = nothing picked yet)
  const chosen =
    pick ??
    (anotherMode
      ? ''
      : ((requestable.find((r) => r.selected) || requestable[0])?.key ?? '*'));
  const chosenRow = requestable.find((r) => r.key === chosen);
  const longest = Math.max(0, ...rows.map((r) => r.durationSeconds || 0));
  const series = b.series?.[0];
  const bookSeries = (b.series ?? []).filter(
    (entry): entry is { id: string; title: string; position?: string } =>
      !!entry.id?.trim() && !!entry.title?.trim()
  );
  const bookSubjects = [
    ...new Set((b.subjects ?? []).map((subject) => subject.trim())),
  ]
    .filter(Boolean)
    .slice(0, 50);
  const audio = f === 'audiobook';
  // nothing to choose between: no narrator details, or no recordings found at all
  const noChoice = !anotherMode && (!work || (!!eds.data && !rows.length));
  // owned in this format: an audiobook in the library doesn't make the ebook owned (or the reverse)
  const available =
    bookMediaForFormat(b.mediaInfo, f)?.status === MediaStatus.AVAILABLE;
  const pendingRequest = canManageRequests(user?.permissions)
    ? b.mediaInfo?.requests?.find(
        (request) =>
          request.status === 1 &&
          ((request.bookFormat ?? 'ebook') === f ||
            request.bookFormat === 'both')
      )
    : undefined;
  const mayRequest = canRequestBook(user?.permissions);
  const approve = async () => {
    if (!pendingRequest || busy) return;
    setBusy(true);
    try {
      await api(`/request/${pendingRequest.id}/approve`, {
        method: 'POST',
        body: '{}',
      });
      toast(t('lumen.bookDetail.requestApproved', 'Request approved'));
      dropBookStates();
      reload();
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : t('lumen.bookDetail.approveFailed', 'Couldn’t approve the request')
      );
    } finally {
      setBusy(false);
    }
  };

  const requestAnother = async () => {
    const row = chosenRow;
    if (!row?.id || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      // an ordinary request, so it goes through approval like any other
      await requestBook(
        bookId,
        'audiobook',
        row.id,
        'alongside',
        effectiveRequestOptions
      );
      setJustAsked((x) => new Set(x).add(narratorKey(row.narrators)));
      setPick(null);
      toast(
        t(
          'lumen.bookDetail.requestedSeparateCopy',
          'Requested {title} · {narrator}. It will arrive as a separate copy.',
          { title: b.title, narrator: who(row, t) }
        )
      );
      dropBookStates();
      first.refresh();
    } catch (e) {
      toast(
        friendlyError(
          e,
          t('lumen.bookDetail.requestFailed', 'Request failed'),
          t
        )
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const request = async () => {
    if (!mayRequest || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      // "any narrator" or narrator choice off: still target an English recording
      const exact = audio && showNarr ? chosenRow?.id || undefined : undefined;
      const fallback =
        audio && !exact
          ? rows.find((r) => r.selected && r.narrators?.length && pinnable(r))
              ?.id || (await englishAudioEdition(work))
          : undefined;
      await requestBook(
        bookId,
        f,
        exact || fallback,
        exact ? 'only' : 'either',
        effectiveRequestOptions
      );
      if (audio && showNarr && chosenRow)
        setJustAsked((x) => new Set(x).add(narratorKey(chosenRow.narrators)));
      setPick(null);
      toast(
        t('lumen.bookDetail.requested', 'Requested {title} · {format}', {
          title: b.title,
          format: audio
            ? showNarr && chosenRow
              ? who(chosenRow, t)
              : t('lumen.bookDetail.audiobook', 'audiobook')
            : t('lumen.bookDetail.ebook', 'ebook'),
        })
      );
      dropBookStates(); // book cards elsewhere show the new request straight away
      first.refresh();
    } catch (e) {
      toast(
        friendlyError(
          e,
          t('lumen.bookDetail.requestFailed', 'Request failed'),
          t
        )
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const label = !audio
    ? t('lumen.bookDetail.requestEbook', 'Request ebook')
    : showNarr && chosenRow
      ? t('lumen.bookDetail.requestNarrator', 'Request · {narrator}', {
          narrator: who(chosenRow, t),
        })
      : t('lumen.bookDetail.requestAudiobook', 'Request audiobook');
  const canCustomizeRequest =
    mayRequest &&
    b.mediaInfo?.status !== MediaStatus.BLOCKLISTED &&
    !pendingRequest &&
    (audio && showNarr && anotherMode
      ? !!chosenRow
      : !available && !(s && s.k !== 'ok'));
  // with the admin's Audiobookshelf address this opens the book there; without one it's a plain
  // "in your library" status rather than a button that does nothing
  const inAbs = (listening: boolean) => {
    const href = audiobookshelfLink(
      audiobookshelfUrl,
      listening
        ? bookMediaForFormat(b.mediaInfo, 'audiobook')?.audiobookLibraryItemId
        : null
    );
    return href ? (
      <a className="btn btn-ok" href={href} target="_blank" rel="noopener">
        <Icon name={listening ? 'play' : 'book'} />
        {listening
          ? t(
              'lumen.bookDetail.listenInAudiobookshelf',
              'Listen in Audiobookshelf'
            )
          : t(
              'lumen.bookDetail.readInAudiobookshelf',
              'Read in Audiobookshelf'
            )}
      </a>
    ) : (
      <button className="btn btn-tonal" disabled>
        <Icon name="check" />
        {t('lumen.bookDetail.inYourLibrary', 'In your library')}
      </button>
    );
  };
  const listen = inAbs(true);
  // picking another narrator makes that the main button: the copy already here stays reachable
  const alsoListen =
    audio && anotherMode && ownsAny && chosenRow ? listen : null;
  const main =
    b.mediaInfo?.status === MediaStatus.BLOCKLISTED ? (
      <button className="btn btn-tonal" disabled>
        {t('lumen.bookDetail.blocklisted', 'Blocklisted')}
      </button>
    ) : pendingRequest ? (
      <button className="btn btn-ok" disabled={busy} onClick={approve}>
        <Icon name="check" />
        {busy
          ? t('lumen.bookDetail.approving', 'Approving…')
          : t('lumen.bookDetail.approveRequest', 'Approve request')}
      </button>
    ) : !mayRequest ? null : audio && showNarr && anotherMode ? (
      chosenRow ? (
        <button
          className="btn btn-primary"
          disabled={requestDisabled}
          onClick={requestAnother}
        >
          <Icon name="plus" />
          {t(
            'lumen.bookDetail.requestAnotherNarrator',
            'Request another narrator · {narrator}',
            { narrator: who(chosenRow, t) }
          )}
        </button>
      ) : ownsAny ? (
        listen
      ) : (
        <button className="btn btn-tonal" disabled>
          <Icon name="clock" />
          {t('lumen.bookDetail.requestedStatus', 'Requested')}
        </button>
      )
    ) : available ? (
      // owned: another narrator is only offered once the narration list has loaded (above)
      inAbs(audio)
    ) : s && s.k !== 'ok' ? (
      <button className="btn btn-tonal" disabled>
        <Icon name={s.ico} />
        <StatLabel s={s} />
      </button>
    ) : (
      <button
        className="btn btn-primary"
        disabled={requestDisabled}
        onClick={request}
      >
        <Icon name="plus" />
        {label}
      </button>
    );

  return (
    <article className="detail">
      <DetailTop
        status={s}
        poster={bookArt(b.posterPath, 'L')}
        square={audio}
        whole
        title={b.title}
        by={
          b.authorId && b.author ? (
            <Link to={`/author/${encodeURIComponent(b.authorId)}`}>
              {b.author}
            </Link>
          ) : (
            b.author || undefined
          )
        }
        line={[
          series?.title
            ? `${series.title}${series.position ? ' #' + series.position : ''}`
            : '',
          b.firstPublishYear,
          ratingLabel(ratings.data, b, t, locale),
          audio && longest
            ? t('lumen.bookDetail.listenDuration', '{duration} listen', {
                duration: fmtHrs(longest),
              })
            : '',
          audio
            ? t('lumen.bookDetail.audiobook', 'Audiobook')
            : t('lumen.bookDetail.ebook', 'Ebook'),
        ]}
      />
      <div className="dbody">
        <div className="fmt">
          <Link
            replace
            to={formatHref('ebook')}
            aria-current={!audio ? 'page' : undefined}
          >
            <b>
              <Icon name="book" size="sm" />
              {t('lumen.bookDetail.ebook', 'Ebook')}
            </b>
            <small>
              {t('lumen.bookDetail.ebookFormatHelp', 'EPUB, works with Kindle')}
            </small>
          </Link>
          <Link
            replace
            to={formatHref('audiobook')}
            aria-current={audio ? 'page' : undefined}
          >
            <b>
              <Icon name="headphones" size="sm" />
              {t('lumen.bookDetail.audiobook', 'Audiobook')}
            </b>
            <small>
              {narrData && rows.length
                ? t(
                    rows.length === 1
                      ? 'lumen.bookDetail.narrationCountOne'
                      : 'lumen.bookDetail.narrationCount',
                    rows.length === 1
                      ? '{count} narration{duration}'
                      : '{count} narrations{duration}',
                    {
                      count: rows.length,
                      duration: longest ? ' · ' + fmtHrs(longest) : '',
                    }
                  )
                : t(
                    'lumen.bookDetail.playsInAudiobookshelf',
                    'Plays in Audiobookshelf'
                  )}
            </small>
          </Link>
        </div>
        <div className="dstatus">
          {s && (
            <Pill k={s.k} icon={s.ico}>
              <StatLabel s={s} />
            </Pill>
          )}
          <IndexerSearchLink
            category={audio ? 'audiobook' : 'ebook'}
            title={b.title}
          />
          <AssociationLink mediaType="book" id={b.id} audio={audio} />
          <BlocklistButton
            mediaType="book"
            id={b.id}
            requestedId={plainId}
            title={b.title}
            onChange={first.refresh}
          />
          <ReaderDeliveryLink target={f} />
          <ReaderDownloads mediaId={b.mediaInfo?.id} type="book" format={f} />
          {b.authorId && (
            <BulkBookRequest
              source={{ id: b.authorId, books: [b], nextOffset: 1 }}
              onComplete={first.refresh}
              buttonLabel={t(
                'lumen.bulkBooks.requestBibliography',
                'Request Bibliography'
              )}
            />
          )}
          <ReportIssueButton type="book" title={b.title} media={b.mediaInfo} />
          {canViewFollowing(user?.permissions) && b.authorId && b.author && (
            <FollowButton
              key={b.authorId}
              label={t(
                'lumen.bookDetail.followNewReleases',
                'Follow New Releases'
              )}
              subject={{
                kind: 'author',
                subjectKey: `author:${b.authorId}`,
                subjectLabel: b.author,
                conditions: { ref: { authorId: b.authorId } },
              }}
            />
          )}
          <WatchlistButton mediaType="book" detail={b} requestedId={plainId} />
        </div>
        {/* phones: the action bar holds only the request, so the owned copy's link goes here */}
        {alsoListen && <div className="dacts ph">{alsoListen}</div>}
        {bookSeries.length > 0 && (
          <VideoDisclosure
            media="book"
            panel="collection"
            label={t('lumen.movie.fact.collection', 'Collection')}
            testId="book-series-collections"
            deferChildrenUntilOpen
          >
            {bookSeries.map((entry) => (
              <BookSeriesSummary
                key={entry.id}
                id={entry.id}
                title={entry.title}
              />
            ))}
          </VideoDisclosure>
        )}
        <VideoDisclosure
          media="book"
          panel="subjectTags"
          label={t('lumen.bookDetail.subjects', 'Subjects')}
          testId="book-subject-tags"
        >
          {bookSubjects.length > 0 ? (
            <div className="toolbar">
              {bookSubjects.map((subject) => (
                <Link
                  className="chip"
                  key={subject}
                  to={`/books?subject=${encodeURIComponent(subject)}`}
                >
                  {subject}
                </Link>
              ))}
            </div>
          ) : (
            <p className="note">
              {t('lumen.detail.noSubjectTags', 'No subject tags.')}
            </p>
          )}
        </VideoDisclosure>
        {canCustomizeRequest && (
          <BookRequestOptions
            key={f}
            format={f}
            onChange={onBookOptionsChange}
            onReady={setRequestOptionsReady}
            disabled={busy}
          />
        )}
        {(bookQuota?.limit ?? 0) > 0 && (
          <p className="note" role={quotaBlocked ? 'status' : undefined}>
            {quotaBlocked
              ? t(
                  'lumen.bookDetail.quotaReached',
                  'Your book request limit has been reached.'
                )
              : t(
                  'lumen.bookDetail.quotaRemaining',
                  '{remaining} of {limit} book requests remaining.',
                  {
                    remaining: bookQuota?.remaining ?? 0,
                    limit: bookQuota?.limit ?? 0,
                  }
                )}
            {!!bookQuota?.days &&
              ` ${t('lumen.bookDetail.quotaPeriod', 'Quota period: {days} days.', { days: bookQuota.days })}`}
          </p>
        )}
        {quota.error && (
          <p className="note" role="alert">
            {t(
              'lumen.bookDetail.quotaLoadFailure',
              'Could not check the book request limit. Retry before requesting.'
            )}{' '}
            <button className="chip" type="button" onClick={quota.reload}>
              {t('lumen.bookDetail.recheckQuota', 'Recheck quota')}
            </button>
          </p>
        )}
        {!quotaReady && (
          <p className="note" aria-busy="true">
            {t('lumen.bookDetail.quotaLoading', 'Checking book request limit…')}
          </p>
        )}
        <div className="dcols">
          <div style={{ display: 'grid', gap: 22 }}>
            {b.description && <p className="ov long">{b.description.trim()}</p>}
            <OpenIssueReports
              id="book-open-issues"
              mediaType="book"
              issues={b.mediaInfo?.issues}
            />
            {showNarr ? (
              <div id="narr">
                <div className="sec-head">
                  <h2>
                    {anotherMode
                      ? t('lumen.bookDetail.narrations', 'Narrations')
                      : noChoice
                        ? t('lumen.bookDetail.narrator', 'Narrator')
                        : t(
                            'lumen.bookDetail.chooseNarrator',
                            'Choose a narrator'
                          )}
                  </h2>
                  <span className="note">
                    {eds.data && rows.length
                      ? t(
                          rows.length === 1
                            ? 'lumen.bookDetail.englishRecordingOne'
                            : 'lumen.bookDetail.englishRecordings',
                          rows.length === 1
                            ? '{count} English recording'
                            : '{count} English recordings',
                          { count: rows.length }
                        )
                      : ''}
                  </span>
                </div>
                {anotherMode && eds.data && (
                  <p className="note" style={{ margin: '-4px 0 12px' }}>
                    {requestable.length
                      ? t(
                          'lumen.bookDetail.chooseAdditionalNarrator',
                          'You already have this audiobook. Pick another narrator to add it as a separate copy; nothing you have is replaced.'
                        )
                      : t(
                          'lumen.bookDetail.allNarrationsOwned',
                          'Every narration we can request is already in the library or on its way.'
                        )}
                  </p>
                )}
                {!work && (
                  <p className="note">
                    {t(
                      'lumen.bookDetail.noNarratorDetails',
                      'This listing has no narrator details. Requesting it gets the best available English recording.'
                    )}
                  </p>
                )}
                {work && !eds.data && !eds.error && (
                  <p className="note">
                    {t(
                      'lumen.bookDetail.lookingUpRecordings',
                      'Looking up recordings…'
                    )}
                  </p>
                )}
                {eds.error && (
                  <p className="note">
                    {t(
                      'lumen.bookDetail.narratorLoadError',
                      'Couldn’t load narrators ({error}). You can still request the best available recording.',
                      { error: eds.error }
                    )}
                  </p>
                )}
                {noChoice && eds.data && (
                  <p className="note">
                    {t(
                      'lumen.bookDetail.noEnglishNarrations',
                      'No English recordings with narrator details were found. Requesting it gets the best available English recording.'
                    )}
                  </p>
                )}
                {eds.data && !noChoice && (
                  <div
                    className="nlist"
                    role="radiogroup"
                    aria-label={t('lumen.bookDetail.narrations', 'Narrations')}
                  >
                    {rows.map((r) => {
                      const st = stateOf(r);
                      const locked = !!st || !requestable.includes(r);
                      const on = !locked && chosen === r.key;
                      return (
                        <div
                          key={r.key}
                          className={`nrow ${st === 'library' ? 'owned' : ''} ${locked && !st ? 'unavailable' : ''}`}
                          role="radio"
                          aria-checked={on}
                          aria-disabled={locked}
                          tabIndex={locked ? -1 : 0}
                          onClick={() => !locked && setPick(r.key)}
                          onKeyDown={(e) => {
                            if (
                              !locked &&
                              (e.key === ' ' || e.key === 'Enter')
                            ) {
                              e.preventDefault();
                              setPick(r.key);
                            }
                          }}
                        >
                          <span className="radio">
                            {st === 'library' && <Icon name="check" />}
                          </span>
                          <span className="nart">
                            {b.posterPath ? (
                              <img
                                src={bookArt(b.posterPath)}
                                referrerPolicy="no-referrer"
                                alt=""
                                loading="lazy"
                              />
                            ) : (
                              <Icon name="headphones" />
                            )}
                          </span>
                          <span>
                            <div className="who">{who(r, t)}</div>
                            <div className="det">
                              {[
                                fmtHrs(r.durationSeconds),
                                r.publisher,
                                r.releaseDate?.slice(0, 4),
                              ]
                                .filter(Boolean)
                                .join(' · ') ||
                                t(
                                  'lumen.bookDetail.detailsUnknown',
                                  'Details unknown'
                                )}
                            </div>
                            <div className="tags">
                              {r.selected && !locked && !anotherMode && (
                                <span className="tag rec">
                                  <Icon name="star" />
                                  {t(
                                    'lumen.bookDetail.recommended',
                                    'Recommended'
                                  )}
                                </span>
                              )}
                              {st === 'library' && (
                                <span className="tag own">
                                  <Icon name="check" />
                                  {t(
                                    'lumen.bookDetail.inYourLibrary',
                                    'In your library'
                                  )}
                                </span>
                              )}
                              {st === 'requested' && (
                                <span className="tag wait">
                                  <Icon name="clock" />
                                  {t(
                                    'lumen.bookDetail.requestedStatus',
                                    'Requested'
                                  )}
                                </span>
                              )}
                              {locked && !st && (
                                <span className="tag">
                                  {t(
                                    'lumen.bookDetail.cannotRequestYet',
                                    'Can’t be requested yet'
                                  )}
                                </span>
                              )}
                              {(r.narrators?.length || 0) > 3 && (
                                <span className="tag">
                                  <Icon name="user" />
                                  {t('lumen.bookDetail.fullCast', 'Full cast')}
                                </span>
                              )}
                            </div>
                          </span>
                        </div>
                      );
                    })}
                    {unlisted.map((l) => (
                      <div
                        key={'local' + l.id + l.title}
                        className="nrow owned"
                        role="radio"
                        aria-checked={false}
                        aria-disabled
                        tabIndex={-1}
                      >
                        <span className="radio">
                          <Icon name="check" />
                        </span>
                        <span className="nart">
                          {b.posterPath ? (
                            <img
                              src={bookArt(b.posterPath)}
                              referrerPolicy="no-referrer"
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <Icon name="headphones" />
                          )}
                        </span>
                        <span>
                          <div className="who">{who(l, t)}</div>
                          <div className="det">{l.title}</div>
                          <div className="tags">
                            <span className="tag own">
                              <Icon name="check" />
                              {t(
                                'lumen.bookDetail.inYourLibrary',
                                'In your library'
                              )}
                            </span>
                          </div>
                        </span>
                      </div>
                    ))}
                    {!anotherMode && !ownedRows.length && (
                      <div
                        className="nrow nany"
                        role="radio"
                        aria-checked={chosen === '*'}
                        tabIndex={0}
                        onClick={() => setPick('*')}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setPick('*');
                          }
                        }}
                      >
                        <span className="radio" />
                        <span className="nart">
                          <Icon name="spark" />
                        </span>
                        <span>
                          <div className="who">
                            {t(
                              'lumen.bookDetail.anyEnglishNarrator',
                              'Any English narrator'
                            )}
                          </div>
                          <div className="det">
                            {t(
                              'lumen.bookDetail.fastestRecording',
                              'Fastest. We grab the best copy we can find.'
                            )}
                          </div>
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {soloNarrators.size > 0 && (
                  <div className="dacts">
                    {[...soloNarrators].map(([key, name]) => (
                      <FollowButton
                        key={key}
                        label={t(
                          'lumen.followButton.followNarrator',
                          'Follow {name}',
                          {
                            name,
                          }
                        )}
                        subject={{
                          kind: 'narrator',
                          subjectKey: `narrator:${key}`,
                          subjectLabel: name,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="ov">
                {audio
                  ? t(
                      'lumen.bookDetail.bestUnabridgedRecording',
                      'We’ll grab the best available unabridged recording.'
                    )
                  : t(
                      'lumen.bookDetail.ebookInAudiobookshelf',
                      'The ebook arrives as an EPUB in Audiobookshelf, ready to read or send to your Kindle.'
                    )}
              </p>
            )}
            <div className="dacts pc">
              {main}
              {alsoListen}
            </div>
          </div>
          <aside>
            <VideoDisclosure
              media="book"
              panel="details"
              label={t('lumen.detail.bookDetails', 'Book Details')}
            >
              {(() => {
                const openLibraryWork =
                  ratings.data?.source === 'openlibrary' &&
                  /^OL[0-9]+W$/.test(ratings.data.workId ?? '')
                    ? ratings.data.workId
                    : b.provider === 'openlibrary' && /^OL[0-9]+W$/.test(b.id)
                      ? b.id
                      : undefined;
                const unavailable = t(
                  'components.BookDetails.Layout.notAvailable',
                  'Not Available'
                );
                const number = (value?: number) =>
                  typeof value === 'number' && value > 0
                    ? new Intl.NumberFormat(locale).format(value)
                    : unavailable;

                return (
                  <Facts
                    rows={[
                      [
                        t('lumen.bookDetail.series', 'Series'),
                        series?.id && series.title ? (
                          <Link
                            to={`/book-series/${encodeURIComponent(series.id)}`}
                          >
                            {series.title}
                            {series.position ? ` #${series.position}` : ''}
                          </Link>
                        ) : series?.title ? (
                          `${series.title}${series.position ? ' #' + series.position : ''}`
                        ) : (
                          ''
                        ),
                      ],
                      [
                        t('components.BookDetails.Layout.author', 'Author'),
                        b.author ? (
                          b.authorId ? (
                            <Link
                              to={`/author/${encodeURIComponent(b.authorId)}`}
                            >
                              {b.author}
                            </Link>
                          ) : (
                            b.author
                          )
                        ) : (
                          unavailable
                        ),
                      ],
                      [
                        t(
                          'components.BookDetails.Layout.firstPublished',
                          'First Published'
                        ),
                        b.firstPublishYear ?? unavailable,
                      ],
                      [
                        t(
                          'components.BookDetails.Layout.publisher',
                          'Publisher'
                        ),
                        b.publisher || unavailable,
                      ],
                      [
                        t('components.BookDetails.Layout.pages', 'Pages'),
                        audio ? unavailable : number(b.numberOfPages),
                      ],
                      [
                        t('components.BookDetails.Layout.editions', 'Editions'),
                        number(b.editionCount),
                      ],
                      [
                        t('components.BookDetails.Layout.isbn', 'ISBN'),
                        b.isbn13 || unavailable,
                      ],
                      [
                        t('components.BookDetails.Layout.edition', 'Edition'),
                        b.editionId || unavailable,
                      ],
                      [
                        t(
                          'components.BookDetails.Layout.openLibrary',
                          'Open Library'
                        ),
                        openLibraryWork ? (
                          <a
                            href={`https://openlibrary.org/works/${openLibraryWork}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {openLibraryWork}
                          </a>
                        ) : (
                          unavailable
                        ),
                      ],
                      [
                        t('lumen.bookDetail.listeningTime', 'Listening time'),
                        audio
                          ? longest
                            ? fmtHrs(longest)
                            : unavailable
                          : unavailable,
                      ],
                      [
                        t('lumen.bookDetail.subjects', 'Subjects'),
                        (b.subjects || [])
                          .filter((t) => !FORMAT_TAG.test(t))
                          .slice(0, 4)
                          .join(', ') || unavailable,
                      ],
                      [
                        t(
                          'components.BookDetails.Layout.isbnCandidates',
                          'ISBN Candidates'
                        ),
                        b.isbnCandidates?.length
                          ? b.isbnCandidates.slice(0, 4).map((candidate) => (
                              <span
                                className="block"
                                key={`${candidate.editionId ?? candidate.isbn}-${candidate.isbn}`}
                                title={[
                                  candidate.isbn,
                                  candidate.title,
                                  candidate.format,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              >
                                {candidate.isbn}
                              </span>
                            ))
                          : unavailable,
                      ],
                    ]}
                  />
                );
              })()}
            </VideoDisclosure>
          </aside>
        </div>
      </div>
      <ActionBar
        title={
          audio
            ? t('lumen.bookDetail.audiobook', 'Audiobook')
            : t('lumen.bookDetail.ebook', 'Ebook')
        }
        meta={audio && longest ? fmtHrs(longest) : undefined}
      >
        {main}
      </ActionBar>
    </article>
  );
}

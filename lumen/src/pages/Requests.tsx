import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  api,
  ApiError,
  artUrl,
  aurralAlbumLink,
  bookArt,
  bookDetailPath,
  bookMediaForFormat,
  bookRequestLabel,
  cancelRequest,
  mediaLink,
  MediaStatus,
  plexUrl,
  tmdbImg,
  videoDetailPath,
  type BookResult,
  type MusicServiceSummary,
  type RequestItem,
  type TvDetails,
} from '../api';
import { forget } from '../apiCache';
import { isAdministrator, useAuth, useMediaServerName } from '../auth';
import { Cover, shortDate, StatLabel } from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import {
  canManageRequests,
  canViewAllRequests,
  Pill,
} from '../components/detail';
import { RequestEditSheet } from '../components/requestEdit';
import RequestEpisodeQueueSheet, {
  canEditEpisodeQueue,
} from '../components/RequestEpisodeQueueSheet';
import RequestHistorySheet from '../components/RequestHistorySheet';
import { Avatar } from '../components/Shell';
import { SoftwareRequestHistorySheet } from '../components/SoftwareRequestHistorySheet';
import { useToast } from '../components/toast';
import TvSeasonMappingSheet, {
  canMapTvSeasons,
} from '../components/TvSeasonMappingSheet';
import { localToday } from '../dates';
import { friendlyError } from '../errors';
import {
  adultScenePath,
  GAME_LABEL,
  patchHref,
  softwareSelectionLabel,
  useExtras,
  type AlbumDetails,
  type Comic,
  type League,
  type Magazine,
  type Scene,
  type SoftwareRequest,
  type TrackRequestItem,
} from '../extras';
import { useApi, usePublicSettings, usePullToRefresh } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon, type IconName } from '../icons';
import type { LiveDownload } from '../liveDownloadStore';
import { canRetryRequest, requestFailureMessage } from '../requestRetry';
import {
  onSessionReset,
  sessionGeneration,
  sessionUserId,
} from '../sessionState';
import {
  applyLiveDownloadProgress,
  downloadSubscriptionId,
  useLiveDownloadProgress,
} from '../useLiveDownloadProgress';

// the glyph on a drawn cover when a request has no artwork
const coverIcon = (type: string, format?: string): IconName =>
  type === 'music'
    ? 'music'
    : type === 'book'
      ? format === 'audiobook'
        ? 'headphones'
        : 'book'
      : type === 'tv'
        ? 'tv'
        : 'film';

interface Row {
  r: RequestItem;
  title: string;
  art?: string;
  cover?: boolean;
  href: string;
  sub: string;
  // series: seasons that hadn't aired when the title was looked up (nothing to wait for yet)
  unaired?: number[];
  airing?: boolean;
  trackRequest?: TrackRequestItem;
  updatedAt?: string;
}

// Everyone tab: SeerrNG's request filters, and how many requests load at a time
const EVERYONE_FILTERS = [
  ['all', 'All', 'total', 'lumen.requests.filter.all'],
  ['pending', 'Waiting', 'pending', 'lumen.requests.filter.pending'],
  [
    'processing',
    'Downloading',
    'processing',
    'lumen.requests.filter.processing',
  ],
  [
    'incomplete',
    'Incomplete',
    'incomplete',
    'lumen.requests.filter.incomplete',
  ],
  [
    'attention',
    'Needs attention',
    'attention',
    'lumen.requests.filter.attention',
  ],
  [
    'unavailable',
    'Unavailable',
    'unavailable',
    'lumen.requests.filter.unavailable',
  ],
  ['failed', 'Failed', 'failed', 'lumen.requests.filter.failed'],
  ['completed', 'Completed', 'completed', 'lumen.requests.filter.completed'],
  ['available', 'Available', 'available', 'lumen.requests.filter.available'],
  ['software', 'Software', 'software', 'lumen.requests.filter.software'],
] as const;
const PAGE = 20;

// Older companion backends may reject the opt-in parameter. Never retry an
// authorization failure or outage as a legacy response, and reset on sign-out.
interface RequestListPage {
  pageInfo?: { pages?: number; results?: number };
  results: RequestItem[];
  authoritativeStatus?: boolean;
}
let statusProjectionSupported = true;
let statusFilterSupported = true;
// SeerrNG checks at most 32 title variants (HD and 4K) per answer against the viewer's own media
// server access and reports the rest as not available, so a page of 100 showed most titles as
// missing. Ask in pages small enough to stay inside that and join them.
const SAFE_TAKE = 15;
async function requestList(path: string): Promise<RequestListPage> {
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  const take = Number(params.get('take') || 0);
  if (!(take > SAFE_TAKE)) return requestListOnce(path);
  const skip = Number(params.get('skip') || 0);
  const pages: RequestListPage[] = [];
  for (let offset = 0; offset < take; offset += SAFE_TAKE) {
    const size = Math.min(SAFE_TAKE, take - offset);
    params.set('take', String(size));
    params.set('skip', String(skip + offset));
    const page = await requestListOnce(`${base}?${params}`);
    pages.push(page);
    if (page.results.length < size) break;
  }
  const total = pages[pages.length - 1].pageInfo?.results;
  return {
    pageInfo:
      total === undefined
        ? pages[0].pageInfo
        : { results: total, pages: Math.max(1, Math.ceil(total / take)) },
    results: pages.flatMap((p) => p.results),
    authoritativeStatus: pages.every((p) => p.authoritativeStatus) || undefined,
  };
}
const TIMELINE_ONLY_REQUEST_FILTERS = new Set([
  'incomplete',
  'attention',
  'unavailable',
  'completed',
]);

async function requestListOnce(path: string): Promise<RequestListPage> {
  const params = new URLSearchParams(path.split('?')[1]);
  const filter = params.get('filter');
  const requiresTimeline =
    TIMELINE_ONLY_REQUEST_FILTERS.has(filter ?? '') ||
    params.has('timeFrame') ||
    params.has('bookFormat') ||
    params.has('search') ||
    params.has('sortDirection');
  if (
    requiresTimeline ||
    (statusFilterSupported &&
      (filter === 'available' || filter === 'processing'))
  ) {
    try {
      // The legacy list filter follows aggregate media/coarse request flags.
      // Reuse the lifecycle owner's filtering and pagination for file truth.
      const stages =
        filter === 'available'
          ? ['available']
          : filter === 'processing'
            ? ['searching', 'downloading', 'importing', 'library']
            : null;
      const data = await api<{
        pageInfo: { pages: number; results: number };
        results: {
          request: RequestItem;
          status: NonNullable<RequestItem['currentStatus']>;
          canRemove?: boolean;
        }[];
      }>(path.replace('/request?', '/request/status?'));
      if (
        !Array.isArray(data.results) ||
        !Number.isSafeInteger(data.pageInfo?.results) ||
        data.pageInfo.results < 0 ||
        data.results.some(
          (item) =>
            !item.request ||
            !Number.isSafeInteger(item.request.id) ||
            item.request.id <= 0 ||
            typeof item.status?.stage !== 'string' ||
            (stages !== null && !stages.includes(item.status.stage))
        )
      ) {
        throw new Error('Invalid request status response');
      }
      return {
        ...data,
        authoritativeStatus: true,
        results: data.results.map(({ request, status, canRemove }) => ({
          ...request,
          currentStatus: status,
          canRemove,
        })),
      };
    } catch (error) {
      if (
        requiresTimeline ||
        !(error instanceof ApiError) ||
        ![400, 404].includes(error.status)
      )
        throw error;
      statusFilterSupported = false;
    }
  }
  if (!statusProjectionSupported) return api<RequestListPage>(path);
  try {
    return await api<RequestListPage>(`${path}&includeStatus=true`);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 400) throw error;
    const result = await api<RequestListPage>(path);
    statusProjectionSupported = false;
    return result;
  }
}

// what a request looks like to the person who made it, in plain words
// "00:03:03" -> "About 3 min left"
type Translate = (
  id: string,
  fallback?: string,
  values?: Record<string, string | number>
) => string;

function eta(t?: string, translate?: Translate) {
  const m = /^(?:(\d+)\.)?(\d+):(\d+):(\d+)/.exec(t || '');
  if (!m) return '';
  const mins = +(m[1] || 0) * 1440 + +m[2] * 60 + +m[3] + (+m[4] >= 30 ? 1 : 0);
  if (mins < 1)
    return (
      translate?.('lumen.requests.row.etaAlmostDone', 'Almost done') ??
      'Almost done'
    );
  if (mins < 60)
    return (
      translate?.('lumen.requests.row.etaMinutes', 'About {count} min left', {
        count: mins,
      }) ?? `About ${mins} min left`
    );
  const hours = Math.round(mins / 60);
  return (
    translate?.(
      hours === 1
        ? 'lumen.requests.row.etaHours'
        : 'lumen.requests.row.etaHoursPlural',
      hours === 1 ? 'About {count} hr left' : 'About {count} hrs left',
      { count: hours }
    ) ?? `About ${hours} hr${hours === 1 ? '' : 's'} left`
  );
}

// a series request is done once every requested season that has aired is at least partly on
// Plex: ongoing shows stay partial for good, and new episodes are fetched as they air.
// Returns the requested, aired seasons with nothing on Plex yet (null if not a series).
function seasonsMissing(x: Row) {
  const r = x.r;
  if (r.type !== 'tv' || !r.seasons?.length) return null;
  const have = new Map(
    (r.media.seasons || []).map((s) => [
      s.seasonNumber,
      (r.is4k ? s.status4k : s.status) || 0,
    ])
  );
  return r.seasons
    .map((s) => s.seasonNumber)
    .filter(
      (n) => !x.unaired?.includes(n) && (have.get(n) || 0) < MediaStatus.PARTIAL
    )
    .sort((a, b) => a - b);
}
// [10, 11, 12, 13, 15] -> "Seasons 10–13, 15"
function seasonList(ns: number[], translate?: Translate) {
  const runs: string[] = [];
  for (let i = 0; i < ns.length;) {
    let j = i;
    while (ns[j + 1] === ns[j] + 1) j++;
    runs.push(j > i ? `${ns[i]}–${ns[j]}` : `${ns[i]}`);
    i = j + 1;
  }
  const seasons = runs.join(', ');
  const id =
    ns.length === 1
      ? 'lumen.requests.row.season'
      : 'lumen.requests.row.seasons';
  const fallback = `${ns.length === 1 ? 'Season' : 'Seasons'} {seasons}`;
  return (
    translate?.(id, fallback, { seasons }) ??
    fallback.replace('{seasons}', seasons)
  );
}

// an edition id that names a specific edition rather than just "this book" (Open Library work ids
// and plain edition ids from the book service are not pins)
const OL_EDITION = /^(?:\/?books\/)?OL\d+M$/i;
function otherEditionInLibrary(r: RequestItem): boolean {
  if (r.type !== 'book' || r.status !== 5) return false;
  if (r.media.status !== 4 && r.media.status !== 5) return false;
  const pin = r.preferredEditionId;
  if (!pin || OL_EDITION.test(pin)) return false;
  const m = r.media;
  const ebook = !!m.availableEbookServiceIds?.length;
  const audiobook =
    !!m.availableAudiobookServiceIds?.length ||
    !!m.audiobookLibraryItemId ||
    m.hasPlexAudiobookFile === true ||
    !!m.ratingKey;
  const format = r.bookFormat ?? 'ebook';
  return format === 'both'
    ? ebook && audiobook
    : format === 'audiobook'
      ? audiobook
      : ebook;
}

export function RequestStatusPills({
  request,
  status,
}: {
  request: RequestItem;
  status: ReturnType<typeof requestRowStatus>;
}) {
  const { t } = useLumenLocale();
  return (
    <>
      <Pill k={status.k} icon={status.ico}>
        <StatLabel s={status} />
      </Pill>
      {request.status === 1 && request.quotaException && (
        <Pill k="wait">{t('lumen.status.overQuota', 'Over quota')}</Pill>
      )}
    </>
  );
}

function requestDownloads(r: RequestItem) {
  return (
    (r.is4k
      ? r.media.downloadStatus4k
      : r.bookFormat === 'audiobook'
        ? r.media.audiobookDownloadStatus
        : r.media.downloadStatus) ?? []
  );
}

export function requestRowStatus(
  x: Row,
  serverName = 'Plex',
  live?: ReadonlyMap<string, LiveDownload>,
  allowRawHashes = false,
  translate?: Translate
): {
  k: 'ok' | 'dl' | 'wait' | 'bad';
  word: string;
  ico: IconName;
  active: boolean;
  pct?: number;
  detail?: string;
} {
  const tr = (
    id: string,
    fallback: string,
    values?: Record<string, string | number>
  ) =>
    translate?.(id, fallback, values) ??
    fallback.replace(/\{(\w+)\}/g, (_, key: string) =>
      String(values?.[key] ?? `{${key}}`)
    );
  const r = x.r;
  const current = r.currentStatus;
  const scheduled = requestDownloads(r);
  const dls = live?.size
    ? scheduled.map((download) =>
        applyLiveDownloadProgress(download, live, allowRawHashes)
      )
    : scheduled;
  const downloading = dls.length;
  const size = dls.reduce((a, d) => a + (d.size || 0), 0);
  const left = dls.reduce((a, d) => a + (d.sizeLeft || 0), 0);
  const pct = size
    ? Math.max(0, Math.min(100, Math.round((1 - left / size) * 100)))
    : undefined;

  // a comic or manga series with part of it in the library and nothing downloading
  if (
    r.type === 'comic' &&
    r.media.status === MediaStatus.PARTIAL &&
    (!current || current.stage === 'library' || current.stage === 'searching')
  ) {
    const p = r.media.comicProgress;
    return {
      k: 'ok',
      word: p?.total
        ? tr(
            'lumen.requests.row.comicProgress',
            '{owned} of {total} in library',
            { owned: Math.min(p.owned, p.total), total: p.total }
          )
        : tr('lumen.requests.row.partlyInLibrary', 'Partly in library'),
      ico: 'check',
      active: true,
      detail: current?.message,
    };
  }
  if (current) {
    const base = { active: true, detail: current.message };
    const available =
      r.type === 'comic'
        ? tr('lumen.requests.row.complete', 'Complete')
        : r.type !== 'movie' && r.type !== 'tv'
          ? tr('lumen.requests.row.inLibrary', 'In library')
          : tr(
              r.is4k
                ? 'lumen.requests.row.fourKOn'
                : 'lumen.requests.row.onServer',
              r.is4k ? '4K on {server}' : 'On {server}',
              { server: serverName }
            );
    switch (current.stage) {
      case 'available':
        return {
          ...base,
          k: 'ok',
          word: available,
          ico: 'check',
          active: false,
        };
      case 'requested':
        return {
          ...base,
          k: 'wait',
          word:
            r.status === 1
              ? tr('lumen.requests.row.waitingApproval', 'Waiting for approval')
              : tr('lumen.requests.row.requested', 'Requested'),
          ico: 'clock',
        };
      case 'approved':
        return {
          ...base,
          k: 'wait',
          word: tr('lumen.requests.row.approved', 'Approved'),
          ico: 'clock',
        };
      case 'searching':
        return {
          ...base,
          k: 'wait',
          word: tr('lumen.requests.row.searching', 'Searching'),
          ico: 'clock',
        };
      case 'downloading': {
        const displayedPct = dls.some(
          (item, index) => item !== scheduled[index]
        )
          ? pct
          : typeof current.percent === 'number' &&
              Number.isFinite(current.percent) &&
              current.percent >= 0 &&
              current.percent <= 100
            ? Math.round(current.percent)
            : undefined;
        return {
          ...base,
          k: 'dl',
          word:
            displayedPct === 0
              ? tr('lumen.requests.row.queued', 'Queued')
              : displayedPct === undefined
                ? tr('lumen.requests.row.downloading', 'Downloading')
                : tr(
                    'lumen.requests.row.downloadingPercent',
                    'Downloading {percent}%',
                    { percent: displayedPct }
                  ),
          ico: 'down',
          pct: displayedPct,
        };
      }
      case 'importing':
        return {
          ...base,
          k: 'wait',
          word: tr('lumen.requests.row.importing', 'Importing'),
          ico: 'clock',
        };
      case 'library':
        // a completed request pinned to one edition, while another edition of the book is what's
        // in the library: the server keeps saying "library" for it, which would never settle
        if (otherEditionInLibrary(r))
          return {
            k: 'ok',
            word: tr(
              'lumen.requests.row.differentEdition',
              'Different edition in library'
            ),
            ico: 'check',
            active: false,
            detail:
              translate?.(
                'lumen.requests.row.differentEditionDetail',
                'This book is in your library in another edition than the one requested.'
              ) ??
              'This book is in your library in another edition than the one requested.',
          };
        return {
          ...base,
          k: 'wait',
          word: tr('lumen.requests.row.checkingLibrary', 'Checking library'),
          ico: 'clock',
        };
      case 'failed':
        return {
          ...base,
          k: 'bad',
          word: tr('lumen.requests.row.failed', 'Couldn’t get it'),
          ico: 'x',
        };
      case 'declined':
        return {
          ...base,
          k: 'bad',
          word: tr('lumen.requests.row.declined', 'Declined'),
          ico: 'x',
          active: false,
        };
      case 'cancelled':
        return {
          ...base,
          k: 'bad',
          word: tr('lumen.requests.row.cancelled', 'Cancelled'),
          ico: 'x',
          active: false,
        };
      case 'unavailable':
        return {
          ...base,
          k: 'bad',
          word: tr('lumen.requests.row.unavailable', 'Unavailable'),
          ico: 'x',
        };
      default:
        return {
          ...base,
          k: 'wait',
          word: tr(
            'lumen.requests.row.statusUnavailable',
            'Status unavailable'
          ),
          ico: 'clock',
        };
    }
  }
  // a 4K request follows the 4K copy, not the HD one already on Plex
  const bookStatuses =
    r.type === 'book'
      ? (r.bookFormat === 'both'
          ? (['ebook', 'audiobook'] as const)
          : ([r.bookFormat === 'audiobook' ? 'audiobook' : 'ebook'] as const)
        ).map((format) => bookMediaForFormat(r.media, format)?.status)
      : null;
  const ms = bookStatuses
    ? bookStatuses.every((status) => status === MediaStatus.AVAILABLE)
      ? MediaStatus.AVAILABLE
      : undefined
    : ['magazine', 'sports'].includes(r.type)
      ? undefined
      : r.is4k
        ? r.media.status4k
        : r.media.status;
  if (ms === MediaStatus.AVAILABLE)
    return {
      k: 'ok',
      word:
        r.type !== 'movie' && r.type !== 'tv'
          ? tr('lumen.requests.row.inLibrary', 'In library')
          : r.is4k
            ? tr('lumen.requests.row.fourKOn', '4K on {server}', {
                server: serverName,
              })
            : tr('lumen.requests.row.onServer', 'On {server}', {
                server: serverName,
              }),
      ico: 'check',
      active: false,
    };
  if (r.status === 3)
    return {
      k: 'bad',
      word: tr('lumen.requests.row.declined', 'Declined'),
      ico: 'x',
      active: false,
    };
  if (r.status === 4)
    return {
      k: 'bad',
      word: tr('lumen.requests.row.failed', 'Couldn’t get it'),
      ico: 'x',
      active: true,
    };
  if (r.status === 1)
    return {
      k: 'wait',
      word: tr('lumen.requests.row.waitingApproval', 'Waiting for approval'),
      ico: 'clock',
      active: true,
    };
  if (downloading)
    return {
      k: 'dl',
      // nothing here yet: it's waiting its turn in the download client's queue
      word:
        pct === 0
          ? tr('lumen.requests.row.queued', 'Queued')
          : pct != null
            ? tr(
                'lumen.requests.row.downloadingPercent',
                'Downloading {percent}%',
                { percent: pct }
              )
            : tr('lumen.requests.row.downloading', 'Downloading'),
      ico: 'down',
      active: true,
      pct,
      detail: eta(dls[0]?.timeLeft, translate),
    };
  if (ms === MediaStatus.PARTIAL) {
    const missing = seasonsMissing(x);
    return missing && !missing.length
      ? {
          k: 'ok',
          word: r.is4k
            ? tr('lumen.requests.row.fourKOn', '4K on {server}', {
                server: serverName,
              })
            : tr('lumen.requests.row.onServer', 'On {server}', {
                server: serverName,
              }),
          ico: 'check',
          active: false,
          detail:
            x.airing == null
              ? undefined // title not looked up yet
              : x.airing
                ? (translate?.(
                    'lumen.requests.row.newEpisodesAsTheyAir',
                    'New episodes added as they air'
                  ) ?? 'New episodes added as they air')
                : (translate?.(
                    'lumen.requests.row.fewEpisodesMissing',
                    'A few episodes missing'
                  ) ?? 'A few episodes missing'),
        }
      : {
          k: 'ok',
          word:
            r.type !== 'movie' && r.type !== 'tv'
              ? tr('lumen.requests.row.partlyInLibrary', 'Partly in library')
              : tr('lumen.requests.row.partlyOnServer', 'Partly on {server}', {
                  server: serverName,
                }),
          ico: 'check',
          active: true,
          detail: missing?.length
            ? (translate?.(
                missing.length === 1
                  ? 'lumen.requests.row.seasonNotFound'
                  : 'lumen.requests.row.seasonsNotFound',
                '{seasons} not found yet',
                { seasons: seasonList(missing, translate) }
              ) ?? `${seasonList(missing)} not found yet`)
            : undefined,
        };
  }
  return {
    k: 'wait',
    word: tr('lumen.requests.row.requested', 'Requested'),
    ico: 'clock',
    active: true,
  };
}

// How much of a request's download is here (0 to 1). Radarr and Sonarr call everything in the
// download client's queue "downloading", so this is what tells a running download from a
// queued one.
function progress(r: RequestItem) {
  const dls = requestDownloads(r);
  const size = dls.reduce((a, d) => a + (d.size || 0), 0);
  const left = dls.reduce((a, d) => a + (d.sizeLeft || 0), 0);
  return size ? 1 - left / size : 0;
}
// Requests whose download has started, wherever they are in the history: a big queue pushes
// the one that's actually downloading far past the newest requests. `query` narrows the list
// (e.g. one person's requests). Two pages of SeerrNG's in-progress requests are plenty.
async function processingRequests(query = '') {
  const page = (skip: number) =>
    requestList(
      `/request?take=100&skip=${skip}&filter=processing&sort=added${query}`
    );
  const first = await page(0);
  const more =
    (first.pageInfo?.pages || 1) > 1 ? (await page(100)).results : [];
  return first.results.concat(more);
}
const startedDownloads = async (query = '') =>
  (await processingRequests(query)).filter((r) => progress(r) > 0);
// All of one person's requests, newest first, so the tab counts are the real totals and nothing
// falls out of every tab. Keep each request page small for status accuracy, with bounded
// concurrency so large histories don't issue hundreds of sequential round trips.
const OWN_PAGE = 15;
const OWN_MAX = 2000; // a safety stop, not a limit anyone should meet
const OWN_PAGE_CONCURRENCY = 4;
async function ownRequests(userId: number): Promise<RequestItem[]> {
  const page = (skip: number) =>
    requestList(
      `/request?take=${OWN_PAGE}&skip=${skip}&filter=all&sort=added&requestedBy=${userId}`
    );
  const first = await page(0);
  const out = [...first.results];
  let total = first.pageInfo?.results;
  let skip = OWN_PAGE;
  while (
    first.results.length === OWN_PAGE &&
    out.length < OWN_MAX &&
    (total === undefined || out.length < total)
  ) {
    const remaining = Math.min(OWN_MAX, total ?? OWN_MAX) - out.length;
    const pageCount = Math.min(
      OWN_PAGE_CONCURRENCY,
      Math.ceil(remaining / OWN_PAGE)
    );
    const pages = await Promise.all(
      Array.from({ length: pageCount }, (_, index) =>
        page(skip + index * OWN_PAGE)
      )
    );
    let finished = false;
    for (const result of pages) {
      out.push(...result.results.slice(0, OWN_MAX - out.length));
      total = result.pageInfo?.results ?? total;
      if (
        result.results.length < OWN_PAGE ||
        out.length >= OWN_MAX ||
        (total !== undefined && out.length >= total)
      ) {
        finished = true;
        break;
      }
    }
    skip += pages.length * OWN_PAGE;
    if (finished) break;
  }
  return out;
}
const merge = (...lists: RequestItem[][]) => {
  const seen = new Set<number>();
  return lists.flat().filter((r) => !seen.has(r.id) && !!seen.add(r.id));
};

// titles and artwork don't change, so each request is described once and kept on this device.
// A lookup that failed for a passing reason isn't kept, so the next visit tries again.
const descriptionKey = () => {
  const userId = sessionUserId();
  return userId === null ? null : `lumen-request-titles:${userId}`;
};
const described = new Map<number, Omit<Row, 'r'>>();
const saveDescribed = () => {
  try {
    const key = descriptionKey();
    if (!key) return;
    localStorage.setItem(
      key,
      JSON.stringify([...described].slice(-400)) // newest 400 are plenty
    );
  } catch {
    // storage full or blocked: it's only a cache
  }
};
// lookups that failed for a passing reason (rate limit, outage): not kept, tried again next visit
const retryLater = new Set<number>();
function cachedRow(r: RequestItem, known: Omit<Row, 'r'>): Row {
  return {
    ...known,
    r,
    sub: r.type === 'book' ? bookRequestLabel(r.bookFormat) : known.sub,
    href:
      r.type === 'book'
        ? requestBookPath(r, known.title === 'Book' ? undefined : known.title)
        : r.type === 'tv' || r.type === 'movie'
          ? videoDetailPath(r.type, r.media.tmdbId, r.is4k)
          : known.href,
  };
}

async function describe(r: RequestItem): Promise<Row> {
  const generation = sessionGeneration();
  const known = described.get(r.id);
  // series kept before seasons were remembered get looked up once more
  if (known && isDescribed(r)) return cachedRow(r, known);
  const row = await describeOnce(r);
  if (generation !== sessionGeneration()) return row;
  const { r: _ignored, ...rest } = row;
  void _ignored;
  if (!retryLater.delete(r.id)) described.set(r.id, rest);
  else if (known && (r.type !== 'adult' || known.href === row.href))
    return cachedRow(r, known); // keep the old name until a lookup works
  return row;
}
const isDescribed = (r: RequestItem) =>
  !!described.get(r.id) &&
  (r.type !== 'tv' || !!described.get(r.id)?.unaired) &&
  (r.type !== 'adult' ||
    r.serverId == null ||
    described.get(r.id)?.href ===
      adultScenePath(idOf(r, 'stashdb') || '', r.serverId));
// SeerrNG rate-limits bursts (and book lookups to 30 a minute), so look a few up at a time and
// at most 12 new books per visit; the rest show a plain label now and get named next time.
const BOOK_LOOKUPS_PER_VISIT = 12; // an ebook can take 2 calls (plain id, then the Hardcover form)
let bookLimited = false;
// two requests for the same book (another narration, ebook + audiobook) share one lookup
const bookCalls = new Map<
  string,
  Promise<{ b: BookResult | null; st: number }>
>();
const fetchBook = (bid: string) => {
  let p = bookCalls.get(bid);
  if (!p) {
    p = api<BookResult>(`/book/${encodeURIComponent(bid)}`).then(
      (b) => ({ b, st: 200 }),
      (e) => ({ b: null, st: e instanceof ApiError ? e.status : 0 })
    );
    bookCalls.set(bid, p);
  }
  return p;
};
// movie/series lookups share SeerrNG's 60-a-minute metadata limit with the rest of the app: after
// a 429, stop for this visit so browsing keeps working (the rest are named next visit)
let limited = false;
// A slow lookup (a title SeerrNG has to fetch, a book while the metadata service is busy) shouldn't
// hold back the whole list: `partial` gets the rows at once, with names already known or a plain
// label, and again as lookups finish. Other categories join as their names arrive.
export async function describeAll(
  list: RequestItem[],
  partial?: (rows: Row[]) => void
): Promise<Row[]> {
  const generation = sessionGeneration();
  const out: Row[] = new Array(list.length);
  let next = 0;
  let books = 0;
  bookLimited = false;
  bookCalls.clear();
  limited = false;
  const first = list.map((r): Row | null =>
    described.has(r.id)
      ? cachedRow(r, described.get(r.id)!)
      : r.type === 'book'
        ? bookPlaceholder(r)
        : r.type === 'movie' || r.type === 'tv'
          ? titlePlaceholder(r)
          : null
  );
  const showsEarly = !!partial;
  let finished = false;
  let timer: number | undefined;
  const show = () => {
    timer = undefined;
    if (finished || generation !== sessionGeneration()) return;
    const visible = first
      .map((row, i) => out[i] || row)
      .filter((row): row is Row => !!row);
    // Do not flash an empty-state message while an all-extra list is loading.
    // A slow extra category must not prevent already-known rows from appearing.
    if (visible.length || !list.length) partial!(visible);
  };
  if (showsEarly) show();
  const worker = async () => {
    while (next < list.length && generation === sessionGeneration()) {
      const i = next++;
      const r = list[i];
      const known = isDescribed(r);
      if (r.type === 'book' && !known && ++books > BOOK_LOOKUPS_PER_VISIT)
        out[i] = bookPlaceholder(r);
      else if (limited && !known && (r.type === 'movie' || r.type === 'tv'))
        out[i] = described.has(r.id)
          ? { ...described.get(r.id)!, r }
          : titlePlaceholder(r);
      else out[i] = await describe(r);
      if (showsEarly && timer === undefined)
        timer = window.setTimeout(show, 250);
    }
  };
  try {
    await Promise.all(Array.from({ length: 4 }, worker));
  } finally {
    finished = true;
    window.clearTimeout(timer);
  }
  if (generation === sessionGeneration()) saveDescribed();
  return out;
}
const bookId = (r: RequestItem) =>
  r.media.identifiers?.find((i) => i.provider === 'bookshelf')?.value ||
  r.media.identifiers?.[0]?.value ||
  '';
function requestBookPath(r: RequestItem, title?: string) {
  return bookDetailPath(
    bookId(r),
    r.bookFormat === 'audiobook' ? 'audiobook' : 'ebook',
    title
  );
}
function titlePlaceholder(r: RequestItem): Row {
  const kind = r.type === 'tv' ? 'tv' : 'movie';
  return {
    r,
    title: kind === 'tv' ? 'Series' : 'Movie',
    href: videoDetailPath(kind, r.media.tmdbId, r.is4k),
    sub: [kind === 'tv' ? 'Series' : 'Movie', r.is4k ? '4K' : '']
      .filter(Boolean)
      .join(' · '),
  };
}
function bookPlaceholder(r: RequestItem): Row {
  return {
    r,
    title: 'Book',
    cover: true,
    href: requestBookPath(r),
    sub: bookRequestLabel(r.bookFormat),
  };
}
const keepUnless404 = (r: RequestItem) => {
  const generation = sessionGeneration();
  return (e: unknown) => {
    if (generation !== sessionGeneration()) return null;
    const st = e instanceof ApiError ? e.status : 0;
    if (st === 429) limited = true;
    if (st !== 404) retryLater.add(r.id);
    return null;
  };
};
async function describeOnce(r: RequestItem): Promise<Row> {
  const generation = sessionGeneration();
  if (r.type === 'book') {
    const id = bookId(r);
    // a 404 is permanent (kept, so it isn't asked again); a 429 or outage is retried next visit
    const look = async (bid: string) => {
      const { b, st } = await fetchBook(bid);
      if (!b && generation === sessionGeneration()) {
        if (st === 429) bookLimited = true; // stop asking this visit, so book pages still load
        if (st !== 404) retryLater.add(r.id);
      }
      return b;
    };
    const b = id && !bookLimited ? await look(id) : null;
    if (bookLimited) retryLater.add(r.id);
    return {
      r,
      title: b?.title || 'Book',
      art: bookArt(b?.posterPath),
      cover: true,
      href: requestBookPath(r, b?.title),
      sub: bookRequestLabel(r.bookFormat),
    };
  }
  const extra = await describeExtra(r);
  if (extra) return extra;
  const kind = r.type === 'tv' ? 'tv' : 'movie';
  const t = await api<TvDetails>(`/${kind}/${r.media.tmdbId}`).catch(
    keepUnless404(r)
  );
  const today = localToday();
  const seasons = r.seasons?.length
    ? r.seasons.length === 1
      ? `Season ${r.seasons[0].seasonNumber}`
      : `${r.seasons.length} seasons`
    : '';
  return {
    r,
    title: t ? t.title || t.name || '' : kind === 'tv' ? 'Series' : 'Movie',
    art: tmdbImg(t?.backdropPath || t?.posterPath, 'w500'),
    href: videoDetailPath(kind, r.media.tmdbId, r.is4k),
    sub: [kind === 'tv' ? 'Series' : 'Movie', seasons, r.is4k ? '4K' : '']
      .filter(Boolean)
      .join(' · '),
    ...(kind === 'tv'
      ? {
          unaired: (t?.seasons || [])
            .filter((s) => !s.episodeCount || !s.airDate || s.airDate > today)
            .map((s) => s.seasonNumber),
          airing: ['Returning Series', 'In Production', 'Planned'].includes(
            t?.status || ''
          ),
        }
      : {}),
  };
}

// music, comics, magazines, sports and adult requests: each is keyed by its own catalogue's id
const idOf = (r: RequestItem, provider: string) =>
  r.media.identifiers?.find((i) => i.provider === provider)?.value;
async function describeExtra(r: RequestItem): Promise<Row | null> {
  const get = <T,>(path: string) => api<T>(path).catch(keepUnless404(r));
  if (r.type === 'music') {
    const id = r.media.mbId || idOf(r, 'musicbrainz') || '';
    const a = id ? await get<AlbumDetails>(`/music/${id}`) : null;
    return {
      r,
      title: a?.title || 'Album',
      art: a?.posterPath,
      cover: true,
      href: `/music/${id}`,
      sub: ['Album', a?.artist.name].filter(Boolean).join(' · '),
    };
  }
  if (r.type === 'comic') {
    const id = idOf(r, 'comicvine') || '';
    const c = id ? await get<Comic>(`/comic/${id}`) : null;
    return {
      r,
      title: c?.title || 'Comic',
      art: artUrl(c?.posterPath),
      cover: true,
      href: `/comic/${id}`,
      sub: [c?.manga ? 'Manga' : 'Comic', c?.publisher]
        .filter(Boolean)
        .join(' · '),
    };
  }
  if (r.type === 'magazine') {
    const t = idOf(r, 'lazylibrarian') || r.media.identifiers?.[0]?.value || '';
    const m = t
      ? await get<Magazine>(`/magazine/${encodeURIComponent(t)}`)
      : null;
    return {
      r,
      title: m?.title || t || 'Magazine',
      art: m?.posterPath,
      cover: true,
      href: `/magazine/${encodeURIComponent(t)}`,
      sub: 'Magazine',
    };
  }
  if (r.type === 'sports') {
    const id = idOf(r, 'sportarr') || r.media.identifiers?.[0]?.value || '';
    const l = id
      ? await get<League>(`/sportarr/${encodeURIComponent(id)}`)
      : null;
    return {
      r,
      title: l?.title || 'League',
      art: l?.posterPath,
      cover: true,
      href: `/sportarr/${encodeURIComponent(id)}`,
      sub: ['Sports', l?.sport].filter(Boolean).join(' · '),
    };
  }
  if (r.type === 'adult') {
    const id = idOf(r, 'stashdb') || '';
    const href = adultScenePath(id, r.serverId);
    const x = id ? await get<Scene>(href) : null;
    return {
      r,
      title: x?.title || 'Scene',
      art: x?.posterPath,
      href: r.serverId == null ? adultScenePath(id, x?.serviceId) : href,
      sub: ['Adult', x?.studio].filter(Boolean).join(' · '),
    };
  }
  return null;
}

// game requests live in their own list in SeerrNG; shape them like the others
function gameRow(g: SoftwareRequest): Row {
  const q = g.request;
  const st = q.status;
  const r = {
    id: -q.id, // negative ids keep them apart from media requests
    status:
      st === 'pending' ? 1 : st === 'declined' ? 3 : st === 'failed' ? 4 : 2,
    type: 'game',
    is4k: false,
    createdAt: q.createdAt,
    seasons: [],
    requestedBy: q.requestedBy ?? { id: 0, displayName: '' },
    currentStatus: {
      stage: st === 'pending' ? 'requested' : st,
      percent: q.percent,
      message: q.error ?? undefined,
    },
    media: {
      mediaType: 'game',
      tmdbId: 0,
      status:
        st === 'available' ? MediaStatus.AVAILABLE : MediaStatus.PROCESSING,
      downloadStatus:
        q.percent != null && st !== 'available'
          ? [{ size: 100, sizeLeft: 100 - q.percent }]
          : [],
    },
  } as unknown as RequestItem;
  const id = q.catalogProvider === 'dat' ? q.catalogKey : q.catalogId;
  const patch = q.selection?.kind === 'patch' ? q.selection : null;
  const patchLink =
    patch &&
    patchHref(patch.projectId, patch.versionId, q.category, q.platform?.slug);
  return {
    r,
    title: q.title,
    art: q.coverUrl || undefined,
    cover: true,
    href:
      patchLink ||
      (id
        ? `/game/${q.category}/${encodeURIComponent(String(id))}${q.catalogProvider === 'dat' ? '?dat=1' : ''}`
        : ''),
    sub: [
      GAME_LABEL[q.category],
      q.platform?.name,
      softwareSelectionLabel(q.selection),
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

const TRACK_REQUEST_ID_OFFSET = 1_000_000_000;

// Every track request, a page of 100 at a time (the Track Requests page shows
// them all too), up to a sane bound.
const MAX_TRACK_REQUEST_PAGES = 50;
async function loadAllTrackRequests(): Promise<TrackRequestItem[]> {
  const all: TrackRequestItem[] = [];
  for (let page = 0; page < MAX_TRACK_REQUEST_PAGES; page++) {
    const d = await api<{
      results: TrackRequestItem[];
      pageInfo?: { total?: number };
    }>(
      `/soulseek/track-requests?scope=all&filter=all&take=100&skip=${page * 100}`
    );
    const results = Array.isArray(d.results) ? d.results : [];
    all.push(...results);
    if (
      results.length < 100 ||
      (typeof d.pageInfo?.total === 'number' && all.length >= d.pageInfo.total)
    )
      break;
  }
  return all;
}

function trackRequestRow(tr: TrackRequestItem): Row {
  const st = tr.status;
  const stage =
    st === 'pending' ? 'requested' : st === 'completed' ? 'available' : st;
  const status =
    st === 'pending'
      ? 1
      : st === 'completed'
        ? 5
        : st === 'failed'
          ? 4
          : st === 'declined' || st === 'cancelled'
            ? 3
            : 2;
  const detailMessage =
    tr.lastError ||
    (st === 'searching' && tr.searchCount > 0
      ? `Searches: ${tr.searchCount}${tr.lastMatchCount ? ` · Last matches: ${tr.lastMatchCount}` : ''}`
      : undefined);
  const r = {
    id: -(TRACK_REQUEST_ID_OFFSET + tr.id),
    status,
    type: 'music',
    is4k: false,
    createdAt: tr.createdAt,
    seasons: [],
    requestedBy: tr.requestedBy ?? { id: 0, displayName: '' },
    currentStatus: {
      stage,
      percent: null,
      message: detailMessage,
    },
    media: {
      mediaType: 'music',
      tmdbId: 0,
      status:
        st === 'completed' ? MediaStatus.AVAILABLE : MediaStatus.PROCESSING,
      downloadStatus: [],
    },
  } as unknown as RequestItem;
  return {
    r,
    title: tr.title,
    cover: true,
    href: '/track-requests',
    sub: ['Track', tr.artist].filter(Boolean).join(' · '),
    trackRequest: tr,
    updatedAt: tr.updatedAt ?? tr.createdAt,
  };
}

function matchesEveryoneTrackFilters(
  tr: TrackRequestItem,
  show: string,
  requester: string,
  timeFrame: string,
  search: string
): boolean {
  if (requester !== 'all' && tr.requestedBy?.id !== Number(requester))
    return false;
  if (search) {
    const needle = search.toLowerCase();
    const hay = [tr.title, tr.artist, tr.requestedBy?.displayName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  if (timeFrame !== 'all') {
    const days = timeFrame === '7d' ? 7 : timeFrame === '14d' ? 14 : 30;
    const created = Date.parse(tr.createdAt);
    if (!Number.isFinite(created) || Date.now() - created > days * 86_400_000)
      return false;
  }
  switch (show) {
    case 'all':
      return true;
    case 'pending':
      return tr.status === 'pending';
    case 'processing':
      return tr.status === 'searching';
    case 'attention':
    case 'failed':
      return tr.status === 'failed';
    case 'completed':
    case 'available':
      return tr.status === 'completed';
    default:
      return false;
  }
}

function sortMergedRows(
  a: Row,
  b: Row,
  sortMode: (typeof REQUEST_SORTS)[number][0]
): number {
  switch (sortMode) {
    case 'oldest':
      return a.r.createdAt.localeCompare(b.r.createdAt);
    case 'updated':
      return (b.updatedAt ?? b.r.createdAt).localeCompare(
        a.updatedAt ?? a.r.createdAt
      );
    case 'title-asc':
      return a.title.localeCompare(b.title);
    case 'title-desc':
      return b.title.localeCompare(a.title);
    case 'priority': {
      const ap = a.r.status === 1 ? 0 : 1;
      const bp = b.r.status === 1 ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return b.r.createdAt.localeCompare(a.r.createdAt);
    }
    case 'newest':
    default:
      return b.r.createdAt.localeCompare(a.r.createdAt);
  }
}

const REQUEST_SORTS = [
  [
    'priority',
    'Request priority',
    'lumen.requests.sort.priority',
    'added',
    'desc',
  ],
  ['newest', 'Newest first', 'lumen.requests.sort.newest', 'added', 'desc'],
  ['oldest', 'Oldest first', 'lumen.requests.sort.oldest', 'added', 'asc'],
  [
    'updated',
    'Recently updated',
    'lumen.requests.sort.updated',
    'modified',
    'desc',
  ],
  [
    'title-asc',
    'Title A–Z',
    'lumen.requests.sort.titleAscending',
    'title',
    'asc',
  ],
  [
    'title-desc',
    'Title Z–A',
    'lumen.requests.sort.titleDescending',
    'title',
    'desc',
  ],
] as const;

const REQUEST_TIME_FRAMES = [
  ['all', 'All time', 'components.Requests.allTime'],
  ['7d', 'Last 7 days', 'components.Requests.last7Days'],
  ['14d', 'Last 14 days', 'components.Requests.last14Days'],
  ['30d', 'Last 30 days', 'components.Requests.last30Days'],
  ['6m', 'Last 6 months', 'components.Requests.last6Months'],
] as const;

const REQUEST_MEDIA_TYPES = [
  ['all', 'All media', 'components.Requests.allMedia'],
  ['movie', 'Movies', 'components.Requests.movies'],
  ['tv', 'Series', 'components.Requests.series'],
  ['music', 'Music', 'components.Requests.music'],
  ['book', 'Books and audiobooks', 'lumen.requests.filters.booksAndAudiobooks'],
  ['comic', 'Comics', 'components.Requests.comics'],
  ['magazine', 'Magazines', 'components.Requests.magazines'],
  ['sports', 'Sports', 'components.Requests.sports'],
  ['adult', 'Adult', 'components.Requests.adult'],
] as const;

const SOFTWARE_CATEGORIES = [
  ['all', 'All categories'],
  ['game', 'PC games'],
  ['retro', 'Retro games'],
  ['modern', 'Modern games'],
] as const;

const SOFTWARE_STATUSES = [
  ['all', 'All statuses'],
  ['active', 'Active'],
  ['pending', 'Waiting for approval'],
  ['approved', 'Approved'],
  ['searching', 'Searching'],
  ['downloading', 'Downloading'],
  ['importing', 'Importing'],
  ['available', 'Available'],
  ['attention', 'Needs attention'],
  ['failed', 'Failed'],
  ['declined', 'Declined'],
  ['cancelled', 'Cancelled'],
] as const;

function RequesterFilter({
  value,
  change,
}: {
  value: string;
  change: (value: string) => void;
}) {
  const { t } = useLumenLocale();
  const [page, setPage] = useState(0);
  const { data, error, reload } = useApi<{
    results: { id: number; displayName: string }[];
    pageInfo: { page: number; pages: number };
  }>(`/request/status/users?take=100&skip=${page * 100}`);
  const users = data?.results ?? [];
  return (
    <>
      <label className="sel">
        <span className="lbl">
          {t('lumen.requests.filters.requester', 'Requester')}
        </span>
        <select value={value} onChange={(event) => change(event.target.value)}>
          <option value="all">
            {t('components.Requests.allUsers', 'All Users')}
          </option>
          {value !== 'all' && !users.some(({ id }) => String(id) === value) && (
            <option value={value}>User #{value}</option>
          )}
          {users.map(({ id, displayName }) => (
            <option key={id} value={id}>
              {displayName}
            </option>
          ))}
        </select>
      </label>
      {page > 0 && (
        <button
          className="btn btn-quiet btn-sm"
          onClick={() => setPage(page - 1)}
        >
          {t('lumen.requests.filters.previousUsers', 'Previous Users')}
        </button>
      )}
      {!!data &&
        data.pageInfo?.page === page + 1 &&
        data.pageInfo.pages > page + 1 && (
          <button
            className="btn btn-quiet btn-sm"
            onClick={() => setPage(page + 1)}
          >
            {t('lumen.requests.filters.moreUsers', 'More Users')}
          </button>
        )}
      {error && (
        <button className="btn btn-quiet btn-sm" onClick={reload}>
          {t('lumen.requests.filters.retryUsers', 'Retry Loading Users')}
        </button>
      )}
    </>
  );
}

async function loadSoftwareRequests(
  pages: number,
  category: string,
  status: string,
  requester: string
) {
  const rows: Row[] = [];
  let more = false;
  for (let page = 0; page < pages; page++) {
    const params = new URLSearchParams({
      take: String(PAGE),
      skip: String(page * PAGE),
      filter: status,
    });
    if (category !== 'all') params.set('category', category);
    if (requester !== 'all') params.set('requestedBy', requester);
    const data = await api<{
      results: SoftwareRequest[];
      pageInfo: { pages: number };
    }>(`/request/software/status?${params}`);
    rows.push(...data.results.map(gameRow));
    more = data.pageInfo.pages > page + 1;
    if (!more) break;
  }
  return { rows, more };
}

function normalizeClassicRequestFilters(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  for (const [classic, lumen] of [
    ['filter', 'show'],
    ['userId', 'requestedBy'],
  ]) {
    const value = next.get(classic);
    if (value && !next.has(lumen) && next.getAll(classic).length === 1)
      next.set(lumen, value);
    next.delete(classic);
  }
  const type = next.get('mediaType');
  if (type === 'audiobook') {
    next.set('mediaType', 'book');
    const format = next.get('bookFormat');
    if (format !== 'ebook' && format !== 'audiobook')
      next.set('bookFormat', 'audiobook');
  }
  if (type === 'game' || type === 'retro' || type === 'modern') {
    const status = next.get('show');
    if (
      status &&
      !next.has('softwareStatus') &&
      SOFTWARE_STATUSES.some(([value]) => value === status)
    ) {
      next.set('softwareStatus', status);
    }
    next.set('show', 'software');
    if (!SOFTWARE_CATEGORIES.some(([value]) => value === next.get('category')))
      next.set('category', type);
    next.delete('mediaType');
  }

  const sort = next.get('sort');
  const direction = next.get('sortDirection');
  if (!next.has('order') && (direction === 'asc' || direction === 'desc')) {
    if (sort === 'added')
      next.set('order', direction === 'asc' ? 'oldest' : 'newest');
    if (sort === 'modified' && direction === 'desc')
      next.set('order', 'updated');
    if (sort === 'title') next.set('order', `title-${direction}`);
  }
  next.delete('sort');
  next.delete('sortDirection');
  return next;
}

export default function Requests() {
  const { t } = useLumenLocale();
  const serverName = useMediaServerName();
  const { user } = useAuth();
  const toast = useToast();
  const [params, setP] = useSearchParams();
  const p = normalizeClassicRequestFilters(params);
  const requestKey = p.has('softwareRequestId')
    ? 'softwareRequestId'
    : 'requestId';
  const requestParam = p.get(requestKey);
  const focusedId =
    requestParam && /^\d+$/.test(requestParam) ? Number(requestParam) : 0;
  const validRequestLink = Number.isSafeInteger(focusedId) && focusedId > 0;
  const historyParams = (id: number) => {
    const next = new URLSearchParams(p);
    next.delete('requestId');
    next.delete('softwareRequestId');
    next.set(id < 0 ? 'softwareRequestId' : 'requestId', String(Math.abs(id)));
    return next;
  };
  const closeHistory = () => {
    const next = new URLSearchParams(p);
    next.delete(requestKey);
    setP(next, { replace: true });
  };

  const viewAll = canViewAllRequests(user?.permissions);
  const defaultTab = viewAll ? 'everyone' : 'active';
  const requestedTab = p.get('tab');
  const tab =
    requestedTab === 'everyone' && !viewAll
      ? defaultTab
      : requestedTab || defaultTab;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ownError, setOwnError] = useState(false);
  const [tick, setTick] = useState(0);
  // full list loads in flight (a poll waits for them)
  const loads = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const pull = usePullToRefresh(() => {
    setRefreshing(true);
    setTick((t) => t + 1);
  });
  const extras = useExtras();
  const publicSettings = usePublicSettings();
  const trackRequestsEnabled = Boolean(publicSettings?.trackRequestsEnabled);
  const musicServices = useApi<MusicServiceSummary[]>(
    user && (trackRequestsEnabled || extras.list.some((e) => e.key === 'music'))
      ? '/service/music'
      : null
  );
  const manage = canManageRequests(user?.permissions);
  const everyone = viewAll && tab === 'everyone';
  const [others, setOthers] = useState<Row[] | null>(null);
  const [othersError, setOthersError] = useState(false);
  // SeerrNG's request counts, for the Everyone tab and its filters
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const waiting = counts?.pending ?? null;
  // Everyone: which requests (SeerrNG's own filters) and how many pages of them
  const show = (EVERYONE_FILTERS.find(([v]) => v === p.get('show')) ||
    EVERYONE_FILTERS[0])[0];
  const softwareCategory =
    SOFTWARE_CATEGORIES.find(([value]) => value === p.get('category'))?.[0] ??
    'all';
  const softwareStatus =
    SOFTWARE_STATUSES.find(
      ([value]) => value === p.get('softwareStatus')
    )?.[0] ?? 'all';
  const requesterParam = p.get('requestedBy');
  const requester =
    requesterParam &&
    /^[1-9]\d*$/.test(requesterParam) &&
    Number.isSafeInteger(Number(requesterParam))
      ? requesterParam
      : 'all';
  const requesterQuery = requester === 'all' ? '' : `&requestedBy=${requester}`;
  const ownSoftware =
    !everyone && (tab === 'software' || (!requestedTab && show === 'software'));
  const browseRequests = everyone || ownSoftware;
  const softwareView = ownSoftware || (everyone && show === 'software');
  const softwareRequester = ownSoftware ? String(user?.id ?? '') : requester;

  const permissions = user?.permissions ?? 0;
  const canViewAdult =
    manage ||
    (Number.isSafeInteger(permissions) &&
      permissions >= 0 &&
      (BigInt(permissions) & 140737488355328n) !== 0n);
  const mediaTypes = REQUEST_MEDIA_TYPES.filter(
    ([type]) => type !== 'adult' || canViewAdult
  );
  const formatParam = p.get('bookFormat');
  const selectedBookFormat =
    formatParam === 'ebook' || formatParam === 'audiobook'
      ? formatParam
      : 'all';
  const mediaType =
    mediaTypes.find(([type]) => type === p.get('mediaType'))?.[0] ??
    (selectedBookFormat === 'all' ? 'all' : 'book');
  const bookFormat = mediaType === 'book' ? selectedBookFormat : 'all';
  const timeFrameParam =
    p.get('timeFrame') === '1m' ? '30d' : p.get('timeFrame');
  const timeFrame =
    REQUEST_TIME_FRAMES.find(([value]) => value === timeFrameParam)?.[0] ??
    'all';
  const search = (p.get('search') ?? '').trim().slice(0, 200);
  const [sortMode, , , sortField, sortDirection] =
    REQUEST_SORTS.find(([value]) => value === p.get('order')) ??
    REQUEST_SORTS[0];
  const priorityOrder = sortMode === 'priority';
  const requestSortQuery = priorityOrder
    ? 'sort=added'
    : `sort=${sortField}&sortDirection=${sortDirection}`;
  const mediaQuery =
    requesterQuery +
    (mediaType === 'all' ? '' : `&mediaType=${mediaType}`) +
    (timeFrame === 'all' ? '' : `&timeFrame=${timeFrame}`) +
    (bookFormat === 'all' ? '' : `&bookFormat=${bookFormat}`) +
    (search ? `&${new URLSearchParams({ search })}` : '');
  const setRequestFilter = (key: string, value: string) => {
    const next = new URLSearchParams(p);
    if (key === 'mediaType' && value !== 'book') next.delete('bookFormat');
    if (key === 'bookFormat') next.set('mediaType', 'book');
    if (
      !value ||
      (key !== 'search' && value === 'all') ||
      (key === 'order' && value === 'priority')
    )
      next.delete(key);
    else next.set(key, value);
    setPages(1);
    setP(next, { replace: true });
  };
  const [pages, setPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    setPages(1);
    setOthers(null);
  }, [
    show,
    browseRequests,
    softwareRequester,
    softwareCategory,
    softwareStatus,
    requester,
    mediaType,
    bookFormat,
    timeFrame,
    search,
    sortMode,
  ]);
  const mutationInFlight = useRef(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [acting, setActing] = useState<number | null>(null);
  const [queueEdit, setQueueEdit] = useState<Row | null>(null);
  const [mapping, setMapping] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  // a decline, a cancel or a remove waits for a yes; none can be taken back
  const [confirming, setConfirming] = useState<{
    id: number;
    how: 'decline' | 'cancel' | 'remove' | 'removeMedia';
    title: string;
    request?: RequestItem;
    trackId?: number;
  } | null>(null);
  useEffect(() => {
    if (!viewAll) return;
    let live = true;
    api<Record<string, number>>('/request/count')
      .then(
        (d) =>
          live &&
          setCounts((previous) => {
            // Coarse media counts can describe a different book format. Derive
            // availability and processing counts from their lifecycle pages.
            const next = { ...d };
            delete next.available;
            delete next.processing;
            if (previous?.available !== undefined)
              next.available = previous.available;
            if (previous?.processing !== undefined)
              next.processing = previous.processing;
            return next;
          })
      )
      .catch(() => live && setCounts(null));
    return () => {
      live = false;
    };
  }, [viewAll, tick]);

  useEffect(() => {
    if (!browseRequests || !softwareRequester) return;
    let live = true;
    setOthersError(false);
    // the newest `take` requests of one filter, in SeerrNG's pages of up to 100
    const list = async (filter: string, take: number) => {
      const out: RequestItem[] = [];
      let total = 0;
      for (let skip = 0; skip < take; skip += 100) {
        const d = await requestList(
          `/request?take=${Math.min(100, take - skip)}&skip=${skip}&filter=${filter}&${requestSortQuery}${mediaQuery}`
        );
        total = d.pageInfo?.results ?? 0;
        if (
          live &&
          !mediaQuery &&
          (filter === 'available' || filter === 'processing') &&
          d.authoritativeStatus
        ) {
          setCounts((previous) => ({ ...previous, [filter]: total }));
        }
        out.push(...d.results);
        if (d.results.length < Math.min(100, take - skip)) break;
      }
      return { results: out, more: total > take };
    };
    const take = PAGE * pages;
    // All: waiting for approval, then downloads that have started (furthest along first), then
    // the newest of the rest. Downloading: started ones first too. Others: newest first.
    const load = async () => {
      if (softwareView)
        return loadSoftwareRequests(
          pages,
          softwareCategory,
          softwareStatus,
          softwareRequester
        );
      const started =
        priorityOrder && (show === 'all' || show === 'processing')
          ? startedDownloads(mediaQuery)
              .then((x) => x.sort((a, b) => progress(b) - progress(a)))
              .catch(() => [])
          : Promise.resolve([]);
      const pending =
        priorityOrder && show === 'all'
          ? list('pending', 50).then((x) => x.results)
          : Promise.resolve([]);
      const includeTracks =
        trackRequestsEnabled &&
        (mediaType === 'all' || mediaType === 'music') &&
        bookFormat === 'all' &&
        [
          'all',
          'pending',
          'processing',
          'attention',
          'failed',
          'completed',
          'available',
        ].includes(show);
      const tracksPromise = includeTracks
        ? loadAllTrackRequests()
            .then((results) =>
              results
                .filter((tr) =>
                  matchesEveryoneTrackFilters(
                    tr,
                    show,
                    requester,
                    timeFrame,
                    search
                  )
                )
                .map(trackRequestRow)
            )
            .catch(() => [] as Row[])
        : Promise.resolve([] as Row[]);
      const [waitingList, startedList, rest, trackRows] = await Promise.all([
        pending,
        started,
        list(show, take),
        tracksPromise,
      ]);
      const rows = await describeAll(
        merge(waitingList, startedList, rest.results),
        (early) =>
          live &&
          setOthers(
            trackRows.length
              ? [...early, ...trackRows].sort((a, b) =>
                  sortMergedRows(a, b, sortMode)
                )
              : early
          )
      );
      return {
        rows: trackRows.length
          ? [...rows, ...trackRows].sort((a, b) =>
              sortMergedRows(a, b, sortMode)
            )
          : rows,
        more: rest.more,
      };
    };
    loads.current++;
    load()
      .then(({ rows, more }) => {
        if (!live) return;
        setOthers(rows);
        setHasMore(more);
      })
      .catch(() => {
        if (!live) return;
        setOthers(null);
        setOthersError(true);
      })
      .finally(() => {
        loads.current--;
        if (!live) return;
        setRefreshing(false);
        setLoadingMore(false);
      });
    return () => {
      live = false;
    };
  }, [
    browseRequests,
    softwareView,
    softwareRequester,
    show,
    pages,
    tick,
    softwareCategory,
    softwareStatus,
    requester,
    mediaQuery,
    priorityOrder,
    requestSortQuery,
    trackRequestsEnabled,
    mediaType,
    bookFormat,
    timeFrame,
    search,
    sortMode,
  ]);

  useEffect(() => {
    if (!user || browseRequests) return;
    let live = true;
    setOwnError(false);
    loads.current++;
    const media = Promise.all([
      ownRequests(user.id),
      startedDownloads(`&requestedBy=${user.id}`).catch(() => []),
    ]).then(([recent, started]) =>
      describeAll(
        merge(recent, started),
        // with games or track requests on, the list waits so items don't pop in later
        extras.games.length || trackRequestsEnabled
          ? undefined
          : (early) =>
              live &&
              setRows(
                [...early].sort((x, y) =>
                  y.r.createdAt.localeCompare(x.r.createdAt)
                )
              )
      )
    );
    // game requests only when a games category is on (the endpoint refuses otherwise)
    const games = extras.games.length
      ? api<{ results: SoftwareRequest[] }>(
          `/request/software/status?take=40&requestedBy=${user.id}`
        )
          .then((d) => d.results.map(gameRow))
          .catch(() => [])
      : Promise.resolve([]);
    const tracks = trackRequestsEnabled
      ? api<{ results: TrackRequestItem[] }>(
          '/soulseek/track-requests?scope=mine&filter=all&take=100'
        )
          .then((d) => d.results.map(trackRequestRow))
          .catch(() => [] as Row[])
      : Promise.resolve([] as Row[]);
    Promise.all([media, games, tracks])
      .then(([a, b, c]) =>
        a
          .concat(b, c)
          .sort((x, y) => y.r.createdAt.localeCompare(x.r.createdAt))
      )
      .then((x) => live && setRows(x))
      .catch(() => live && setOwnError(true))
      .finally(() => {
        loads.current--;
        if (live) setRefreshing(false);
      });
    return () => {
      live = false;
    };
  }, [user, browseRequests, tick, extras.games.length, trackRequestsEnabled]);

  const all = rows || [];
  const act = all.filter((x) => requestRowStatus(x, serverName).active);
  const ready = all.filter(
    (x) =>
      requestRowStatus(x, serverName).k === 'ok' &&
      !requestRowStatus(x, serverName).active
  );
  const list = ownSoftware
    ? others || []
    : everyone
      ? (others || []).filter((row) =>
          show === 'available'
            ? requestRowStatus(row, serverName).k === 'ok' &&
              !requestRowStatus(row, serverName).active
            : show !== 'processing' || requestRowStatus(row, serverName).active
        )
      : tab === 'ready'
        ? ready
        : tab === 'all'
          ? all
          : act;
  const allowRawHashes = isAdministrator(user?.permissions);
  const liveDownloads = useLiveDownloadProgress(
    list.flatMap(({ r }) =>
      requestDownloads(r).map((download) =>
        downloadSubscriptionId(download, allowRawHashes)
      )
    )
  );

  const shown = browseRequests ? others : rows;

  // keep download percentages moving while anything shown is downloading
  const busy = list.some((x) => requestRowStatus(x, serverName).pct != null);
  const [poll, setPoll] = useState(0);
  useEffect(() => {
    if (!busy) return;
    // a hidden tab (or backgrounded app) doesn't poll; it catches up when it's shown again
    const t = window.setInterval(() => {
      if (!document.hidden) setPoll((n) => n + 1);
    }, 30_000);
    let hiddenAt: number | null = null;
    const onVisible = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt != null) {
        if (Date.now() - hiddenAt >= 30_000) setPoll((n) => n + 1);
        hiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [busy]);
  // a poll asks only for the requests in progress and updates those rows in place; the whole
  // history is fetched again only when one finishes or a new one starts
  useEffect(() => {
    // a full load still on its way would land over the poll's newer numbers: skip this one
    if (!poll || !user || loads.current) return;
    if (softwareView || (everyone && sortMode === 'updated')) {
      setTick((n) => n + 1);
      return;
    }
    let live = true;
    const current = shown || [];
    const ids = new Set(current.map((x) => x.r.id));
    // these lists always include every started download
    const withStarted =
      !everyone || (priorityOrder && (show === 'all' || show === 'processing'));
    const gameBusy =
      !everyone &&
      current.some(
        (x) =>
          x.r.id < 0 &&
          !x.trackRequest &&
          requestRowStatus(x, serverName).pct != null
      );
    Promise.all([
      processingRequests(everyone ? mediaQuery : `&requestedBy=${user.id}`),
      gameBusy
        ? api<{ results: SoftwareRequest[] }>(
            `/request/software/status?take=40&requestedBy=${user.id}`
          ).then((d) => d.results.map(gameRow))
        : Promise.resolve([] as Row[]),
    ])
      .then(([fresh, games]) => {
        if (!live) return;
        const byId = new Map<number, RequestItem>(fresh.map((r) => [r.id, r]));
        const gameById = new Map(games.map((g) => [g.r.id, g]));
        const finished = current.some(
          (x) =>
            x.r.id > 0 &&
            requestRowStatus(x, serverName).pct != null &&
            !byId.has(x.r.id)
        );
        const started =
          withStarted &&
          fresh.some((r) => !ids.has(r.id) && (!everyone || progress(r) > 0));
        if (finished || started) return setTick((n) => n + 1);
        const update = (l: Row[] | null) =>
          l &&
          l.map((x) =>
            byId.has(x.r.id)
              ? { ...x, r: byId.get(x.r.id)! }
              : gameById.get(x.r.id) || x
          );
        if (everyone) setOthers(update);
        else setRows(update);
      })
      .catch(() => {}); // the next poll tries again
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll]);
  const decide = async (
    id: number,
    how: 'approve' | 'decline' | 'retry' | 'remove'
  ) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setActing(id);
    try {
      if (how === 'remove') await api(`/request/${id}`, { method: 'DELETE' });
      else await api(`/request/${id}/${how}`, { method: 'POST', body: '{}' });
      const successCopy = {
        approve: {
          key: 'lumen.requests.actions.approvedToast',
          fallback: 'Request approved',
        },
        decline: {
          key: 'lumen.requests.actions.declinedToast',
          fallback: 'Request declined',
        },
        retry: {
          key: 'lumen.requests.actions.retriedToast',
          fallback: 'Request sent again',
        },
        remove: {
          key: 'lumen.requests.actions.removedToast',
          fallback: 'Request removed',
        },
      }[how];
      toast(t(successCopy.key, successCopy.fallback));
      forget(`/request/status/${id}`);
      if (requestKey === 'requestId' && focusedId === id) {
        if (how === 'remove') closeHistory();
        else setHistoryRevision((value) => value + 1);
      }
      setTick((t) => t + 1);
    } catch (e) {
      toast(
        friendlyError(
          e,
          t(
            'lumen.requests.actions.updateFailed',
            'Couldn’t update the request'
          )
        )
      );
    } finally {
      mutationInFlight.current = false;
      setActing(null);
    }
  };
  const cancel = async (id: number) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setActing(id);
    try {
      // game requests (negative ids here) are withdrawn through their own endpoint
      if (id < 0)
        await api(`/request/software/status/${-id}/withdraw`, {
          method: 'POST',
        });
      else await cancelRequest(id);
      if (id > 0) forget(`/request/status/${id}`);
      toast(t('lumen.requests.actions.cancelledToast', 'Request cancelled'));
      if (requestKey === 'requestId' && focusedId === id) closeHistory();
      // gone now, not after the list has refreshed
      const updateRows = ownSoftware ? setOthers : setRows;
      updateRows((list) => list && list.filter((x) => x.r.id !== id));
      setTick((t) => t + 1);
    } catch (e) {
      toast(
        friendlyError(
          e,
          t('lumen.requests.actions.cancelFailed', 'Couldn’t cancel')
        )
      );
    } finally {
      mutationInFlight.current = false;
      setActing(null);
    }
  };
  const decideTrack = async (trackId: number, how: 'approve' | 'decline') => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setActing(-(TRACK_REQUEST_ID_OFFSET + trackId));
    try {
      await api(`/soulseek/track-requests/${trackId}/${how}`, {
        method: 'POST',
      });
      toast(how === 'approve' ? 'Request approved' : 'Request declined');
      setTick((t) => t + 1);
    } catch (e) {
      toast(friendlyError(e, 'Couldn’t update the request'));
    } finally {
      mutationInFlight.current = false;
      setActing(null);
    }
  };
  const cancelTrack = async (trackId: number) => {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setActing(-(TRACK_REQUEST_ID_OFFSET + trackId));
    try {
      await api(`/soulseek/track-requests/${trackId}`, { method: 'DELETE' });
      toast('Request cancelled');
      setRows(
        (list) => list && list.filter((x) => x.trackRequest?.id !== trackId)
      );
      setOthers(
        (list) => list && list.filter((x) => x.trackRequest?.id !== trackId)
      );
      setTick((t) => t + 1);
    } catch (e) {
      toast(friendlyError(e, 'Couldn’t cancel'));
    } finally {
      mutationInFlight.current = false;
      setActing(null);
    }
  };

  const removeManagedCopy = async (request: RequestItem) => {
    if (!manage || request.canRemove !== true || !request.media.id) return;
    const query = new URLSearchParams({ is4k: String(request.is4k) });
    if (request.type === 'book') {
      let format = request.bookFormat || 'ebook';
      if (format === 'both') {
        const ebook = request.media.externalServiceId != null;
        const audiobook = request.media.audiobookExternalServiceId != null;
        format = ebook !== audiobook ? (ebook ? 'ebook' : 'audiobook') : 'both';
      }
      query.set('format', format);
    }
    setActing(request.id);
    try {
      await api(
        `/media/${request.media.id}/file?${query}`,
        { method: 'DELETE' },
        'empty'
      );
      forget(`/request/status/${request.id}`);
      toast(
        t(
          'lumen.requestHistory.mediaRemoved',
          'Managed copy removed. Request history was kept.'
        )
      );
      setTick((value) => value + 1);
    } catch (error) {
      toast(
        friendlyError(
          error,
          t(
            'lumen.requestHistory.mediaRemoveFailed',
            'Could not remove the managed copy.'
          )
        )
      );
    } finally {
      setActing(null);
    }
  };

  const renderRequestActions = (x: Row, moderate: boolean) => {
    if (x.trackRequest) {
      const tr = x.trackRequest;
      const owner = tr.requestedBy?.id === user?.id;
      const canCancelTrack =
        (tr.status === 'pending' && owner) ||
        (tr.status === 'searching' && (moderate || manage || owner));
      return (
        <>
          {moderate && tr.status === 'pending' && (
            <>
              <button
                className="btn btn-sm btn-ok"
                disabled={acting !== null}
                onClick={() => void decideTrack(tr.id, 'approve')}
              >
                <Icon name="check" size="sm" />
                {t('components.Requests.approve', 'Approve')}
              </button>
              <button
                className="btn btn-sm btn-quiet"
                disabled={acting !== null}
                onClick={() =>
                  setConfirming({
                    id: x.r.id,
                    how: 'decline',
                    title: x.title,
                    trackId: tr.id,
                  })
                }
              >
                <Icon name="x" size="sm" />
                {t('components.Requests.decline', 'Decline')}
              </button>
            </>
          )}
          {canCancelTrack && (
            <button
              className="btn btn-sm btn-quiet"
              disabled={acting !== null}
              onClick={() =>
                setConfirming({
                  id: x.r.id,
                  how: 'cancel',
                  title: x.title,
                  trackId: tr.id,
                })
              }
            >
              Cancel
            </button>
          )}
        </>
      );
    }
    const st = requestRowStatus(x, serverName, liveDownloads, allowRawHashes);
    const plexHref = plexUrl(x.r.media, x.r.is4k);
    const aurralHref =
      x.r.type === 'music' && !plexHref
        ? aurralAlbumLink(x.r.media, musicServices.data)
        : null;
    const aurralAction = aurralHref ? (
      <a
        className={st.k === 'ok' ? 'btn btn-sm btn-ok' : 'btn btn-sm btn-quiet'}
        href={aurralHref}
        target="_blank"
        rel="noreferrer"
      >
        <Icon name="music" size="sm" />
        {t('lumen.requests.openInAurral', 'Open in Aurral')}
      </a>
    ) : null;
    return (
      <>
        {canEditEpisodeQueue(x.r, user?.permissions) && (
          <button
            className="btn btn-sm btn-quiet"
            disabled={acting !== null}
            onClick={() => setQueueEdit(x)}
          >
            {t('components.Requests.episodeQueue', 'Episode Queue')}
          </button>
        )}
        {canRetryRequest(x.r, user, manage) && (
          <button
            className="btn btn-sm btn-tonal"
            disabled={acting !== null}
            onClick={() => decide(x.r.id, 'retry')}
          >
            <Icon name="refresh" size="sm" />
            {t('components.Requests.retry', 'Retry')}
          </button>
        )}
        {manage && x.r.id > 0 && canMapTvSeasons(x.r) && (
          <button
            className="btn btn-sm btn-quiet"
            disabled={acting !== null}
            onClick={() => setMapping(x)}
          >
            {t('lumen.requestMapping.open', 'Map Seasons')}
          </button>
        )}
        {moderate &&
          x.r.status !== 1 &&
          x.r.canRemove === true &&
          Number.isSafeInteger(x.r.media.id) &&
          (x.r.media.id ?? 0) > 0 && (
            <button
              className="btn btn-sm btn-quiet"
              disabled={acting !== null}
              onClick={() =>
                setConfirming({
                  id: x.r.id,
                  how: 'removeMedia',
                  title:
                    x.title ||
                    t('lumen.requestHistory.unknownTitle', 'this item'),
                  request: x.r,
                })
              }
            >
              {t(
                'lumen.requestHistory.removeManagedCopy',
                'Remove from Service'
              )}
            </button>
          )}
        {moderate && x.r.id > 0 ? (
          <>
            {x.r.status === 1 && (
              <>
                <button
                  className="btn btn-sm btn-ok"
                  disabled={acting !== null}
                  onClick={() => decide(x.r.id, 'approve')}
                >
                  <Icon name="check" size="sm" />
                  {t('components.Requests.approve', 'Approve')}
                </button>
                <button
                  className="btn btn-sm btn-quiet"
                  disabled={acting !== null}
                  onClick={() =>
                    setConfirming({
                      id: x.r.id,
                      how: 'decline',
                      title: x.title,
                    })
                  }
                >
                  <Icon name="x" size="sm" />
                  {t('components.Requests.decline', 'Decline')}
                </button>
              </>
            )}
            {(x.r.status === 1 || x.r.status === 4) &&
              (x.r.type === 'movie' || x.r.type === 'tv') && (
                <button
                  className="btn btn-sm btn-quiet"
                  disabled={acting !== null}
                  onClick={() => setEditing(x)}
                >
                  {t('lumen.requestHistory.changeRequest', 'Change')}
                </button>
              )}
            <button
              className="btn btn-sm btn-quiet"
              disabled={acting !== null}
              onClick={() =>
                setConfirming({
                  id: x.r.id,
                  how: 'remove',
                  title: x.title,
                })
              }
            >
              {t('lumen.requestHistory.removeRequest', 'Remove')}
            </button>
            {aurralAction}
          </>
        ) : st.k === 'ok' && x.r.type !== 'book' && plexHref ? (
          <a
            className="btn btn-sm btn-ok"
            {...mediaLink(x.r.media, x.r.is4k, x.r.type, serverName)}
          >
            <Icon name="play" size="sm" />
            {x.r.type === 'music'
              ? t('lumen.music.listenOn', 'Listen on {server}', {
                  server: serverName,
                })
              : t('lumen.tv.watchOn', 'Watch on {server}', {
                  server: serverName,
                })}
          </a>
        ) : aurralAction ? (
          aurralAction
        ) : (x.r.id < 0 ? !everyone : x.r.requestedBy?.id === user?.id) &&
          x.r.status === 1 ? (
          <button
            className="btn btn-sm btn-quiet"
            disabled={acting !== null}
            onClick={() =>
              setConfirming({
                id: x.r.id,
                how: 'cancel',
                title: x.title,
              })
            }
          >
            {t('lumen.requests.actions.cancel', 'Cancel')}
          </button>
        ) : null}
      </>
    );
  };

  return (
    <>
      <header className="ph">
        <div className="ph-row">
          <h1>{t('lumen.requests.page.title', 'Requests')}</h1>
          <Link className="chip" to="/book-series/requests">
            {t('lumen.requests.page.bookSeries', 'Book Series Requests')}
          </Link>
          <Avatar className="avatar ph-only-avatar" />
        </div>
        <p className="sub">
          {ownSoftware
            ? t(
                'lumen.requests.page.softwareSubtitle',
                'Your software and game requests, newest first.'
              )
            : everyone
              ? show === 'software'
                ? t(
                    'lumen.requests.page.softwareEveryoneSubtitle',
                    'Software and game requests from everyone, newest first.'
                  )
                : !priorityOrder
                  ? t(
                      'lumen.requests.page.selectedOrderSubtitle',
                      'Everyone’s requests in the selected order.'
                    )
                  : show === 'all'
                    ? t(
                        'lumen.requests.page.prioritySubtitle',
                        'Everyone’s requests: waiting ones first, then downloads, then the newest.'
                      )
                    : t(
                        'lumen.requests.page.everyoneSubtitle',
                        'Everyone’s requests, newest first.'
                      )
              : t(
                  'lumen.requests.page.ownSubtitle',
                  'Everything you’ve asked for, newest first.'
                )}
        </p>
      </header>
      {/* pull-to-refresh pill: fixed, so it never shifts the page layout */}
      <div
        className={`ptr ${refreshing ? 'busy' : pull.state}`}
        style={{
          transform: `translate(-50%, ${refreshing ? 56 : pull.dist - 44}px)`,
          opacity: refreshing ? 1 : Math.min(1, pull.dist / 50),
        }}
        role="status"
      >
        <Icon name="refresh" size="sm" />
        {refreshing
          ? t('lumen.requests.page.refreshing', 'Refreshing…')
          : pull.state === 'armed'
            ? t('lumen.requests.page.releaseToRefresh', 'Release to refresh')
            : t('lumen.requests.page.pullToRefresh', 'Pull to refresh')}
      </div>
      <div
        className="seg"
        role="group"
        aria-label={t('lumen.requests.page.show', 'Show')}
      >
        {[
          ['active', t('lumen.requests.page.active', 'Active'), act.length],
          ['ready', t('lumen.requests.page.ready', 'Ready'), ready.length],
          ['all', t('lumen.requests.page.all', 'All'), all.length],
          ...(viewAll
            ? [
                [
                  'everyone',
                  t('lumen.requests.page.everyone', 'Everyone'),
                  waiting ?? '',
                ],
              ]
            : []),
        ].map(([v, t, n]) => (
          <button
            key={v as string}
            aria-pressed={!ownSoftware && tab === v}
            onClick={() =>
              setP(v === defaultTab ? {} : { tab: v as string }, {
                replace: true,
              })
            }
          >
            {t}{' '}
            <span className="n">
              {v === 'everyone' ? n || '' : rows ? n : ''}
            </span>
          </button>
        ))}
      </div>
      {(extras.games.length > 0 || ownSoftware) && (
        <div className="chips wrap">
          <button
            className="chip"
            aria-pressed={ownSoftware}
            onClick={() =>
              setP(ownSoftware ? {} : { tab: 'software' }, { replace: true })
            }
          >
            {t('lumen.requests.page.mySoftware', 'My Software')}
          </button>
        </div>
      )}
      {!shown && !(browseRequests ? othersError : ownError) && (
        <p className="note">
          {everyone
            ? t(
                'lumen.requests.page.loadingEveryone',
                'Loading everyone’s requests…'
              )
            : t('lumen.requests.page.loadingOwn', 'Loading your requests…')}
        </p>
      )}
      {(browseRequests ? othersError : ownError) && (
        <div className="empty" role="alert">
          <b>{t('lumen.requests.page.loadFailed', 'Couldn’t load requests')}</b>
          <p>
            {everyone
              ? t(
                  'lumen.requests.page.loadEveryoneFailed',
                  'Try again to check everyone’s request history.'
                )
              : t(
                  'lumen.requests.page.loadOwnFailed',
                  'Try again to check your request history.'
                )}
          </p>
          <button
            className="btn btn-tonal"
            onClick={() => setTick((t) => t + 1)}
          >
            {t('lumen.requests.page.retry', 'Retry')}
          </button>
        </div>
      )}
      {everyone && (
        <div
          className="chips wrap"
          role="group"
          aria-label={t('lumen.requests.page.whichRequests', 'Which requests')}
        >
          {EVERYONE_FILTERS.map(([v, label, key, translationKey]) => (
            <button
              key={v}
              className="chip"
              aria-pressed={show === v}
              onClick={() => setRequestFilter('show', v)}
            >
              {t(translationKey, label)}
              {!mediaQuery && counts?.[key] != null && (
                <span className="n">{counts[key]}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {everyone && (
        <div
          className="toolbar"
          role="group"
          aria-label={t('components.Requests.mediaFilters', 'Media Filters')}
        >
          <RequesterFilter
            value={requester}
            change={(value) => setRequestFilter('requestedBy', value)}
          />
          {show !== 'software' && (
            <>
              <label className="sel">
                <span className="lbl">
                  {t('components.Requests.mediaType', 'Media Type')}
                </span>
                <select
                  value={mediaType}
                  onChange={(event) =>
                    setRequestFilter('mediaType', event.target.value)
                  }
                >
                  {mediaTypes.map(([value, label, message]) => (
                    <option key={value} value={value}>
                      {t(message, label)}
                    </option>
                  ))}
                </select>
              </label>
              {mediaType === 'book' && (
                <label className="sel">
                  <span className="lbl">
                    {t('components.Requests.format', 'Format')}
                  </span>
                  <select
                    value={bookFormat}
                    onChange={(event) =>
                      setRequestFilter('bookFormat', event.target.value)
                    }
                  >
                    <option value="all">
                      {t('lumen.requests.filters.allFormats', 'All formats')}
                    </option>
                    <option value="ebook">
                      {t('components.Requests.ebook', 'Book')}
                    </option>
                    <option value="audiobook">
                      {t('lumen.requests.filters.audiobook', 'Audiobook')}
                    </option>
                  </select>
                </label>
              )}
              <label className="sel">
                <span className="lbl">
                  {t('components.Requests.sortBy', 'Sort By')}
                </span>
                <select
                  value={sortMode}
                  onChange={(event) =>
                    setRequestFilter('order', event.target.value)
                  }
                >
                  {REQUEST_SORTS.map(([value, label, message]) => (
                    <option key={value} value={value}>
                      {t(message, label)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sel">
                <span className="lbl">
                  {t('lumen.requests.filters.dateAdded', 'Date Added')}
                </span>
                <select
                  value={timeFrame}
                  onChange={(event) =>
                    setRequestFilter('timeFrame', event.target.value)
                  }
                >
                  {REQUEST_TIME_FRAMES.map(([value, label, message]) => (
                    <option key={value} value={value}>
                      {t(message, label)}
                    </option>
                  ))}
                </select>
              </label>
              <form
                className="toolbar-search"
                aria-label={t(
                  'components.Requests.searchRequests',
                  'Search Requests'
                )}
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = new FormData(event.currentTarget).get('search');
                  setRequestFilter(
                    'search',
                    typeof value === 'string' ? value.trim() : ''
                  );
                }}
              >
                <label className="search">
                  <input
                    key={search}
                    name="search"
                    type="search"
                    aria-label={t(
                      'components.Requests.searchRequests',
                      'Search Requests'
                    )}
                    placeholder={t(
                      'components.Requests.searchRequests',
                      'Search Requests'
                    )}
                    maxLength={200}
                    defaultValue={search}
                  />
                </label>
                <button className="btn btn-tonal btn-sm">
                  {t('components.BookSeriesSearch.search', 'Search')}
                </button>
                {search && (
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => setRequestFilter('search', '')}
                  >
                    {t(
                      'components.Discover.DiscoverAdult.clearSearch',
                      'Clear Search'
                    )}
                  </button>
                )}
              </form>
            </>
          )}
        </div>
      )}
      {softwareView && (
        <div
          className="toolbar"
          role="group"
          aria-label={t(
            'lumen.requests.page.softwareFilters',
            'Software request filters'
          )}
        >
          <label className="sel">
            <span className="lbl">
              {t('lumen.requests.page.category', 'Category')}
            </span>
            <select
              value={softwareCategory}
              onChange={(event) =>
                setRequestFilter('category', event.target.value)
              }
            >
              {SOFTWARE_CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="sel">
            <span className="lbl">
              {t('lumen.requests.page.status', 'Status')}
            </span>
            <select
              value={softwareStatus}
              onChange={(event) =>
                setRequestFilter('softwareStatus', event.target.value)
              }
            >
              {SOFTWARE_STATUSES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {shown && !list.length && browseRequests && (
        <div className="empty">
          <b>
            {!softwareView && show === 'all'
              ? t('lumen.requests.page.noRequestsYet', 'No requests yet')
              : t('lumen.requests.page.nothingHere', 'Nothing here')}
          </b>
          {!softwareView && show === 'all'
            ? t(
                'lumen.requests.page.nobodyRequested',
                'Nobody has asked for anything.'
              )
            : t(
                'lumen.requests.page.noFilterMatches',
                'No requests match this filter right now.'
              )}
        </div>
      )}
      {shown && !list.length && !browseRequests && (
        <div className="empty">
          <b>
            {tab === 'ready'
              ? t('lumen.requests.page.nothingReady', 'Nothing ready yet')
              : t('lumen.requests.page.noActiveRequests', 'No active requests')}
          </b>
          {t('lumen.requests.page.findSomething', 'Find something on')}{' '}
          <Link to="/" style={{ color: 'var(--accent)' }}>
            {t('lumen.requests.page.discover', 'Discover')}
          </Link>
          {t('lumen.requests.page.period', '.')}
        </div>
      )}
      <div className="rqlist">
        {list.map((x) => {
          const st = requestRowStatus(
            x,
            serverName,
            liveDownloads,
            allowRawHashes,
            t
          );
          const detail = requestFailureMessage(x.r) ?? st.detail;
          const artwork = artUrl(x.art);
          return (
            <div
              className="rq"
              key={x.trackRequest ? `track:${x.trackRequest.id}` : x.r.id}
            >
              <div className={`art ${x.cover ? 'cover' : ''}`}>
                {x.cover && artwork && (
                  <img
                    className="art-fill"
                    src={artwork}
                    referrerPolicy="no-referrer"
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}
                <Cover
                  src={artwork}
                  title={x.title}
                  sub={x.sub}
                  icon={coverIcon(x.r.type, x.r.bookFormat)}
                />
                {st.k === 'ok' && !x.cover && (
                  <span className="play">
                    <Icon name="play" />
                  </span>
                )}
                {st.pct != null && (
                  <span className="bar">
                    <i style={{ width: `${st.pct}%` }} />
                  </span>
                )}
              </div>
              <div style={{ minWidth: 0 }}>
                <div className="tt">
                  <Link
                    to={
                      x.href ||
                      (x.trackRequest
                        ? '/track-requests'
                        : `?${historyParams(x.r.id)}`)
                    }
                  >
                    {x.title}
                  </Link>
                </div>
                <div className="sub">
                  {everyone && x.r.requestedBy?.displayName
                    ? `${x.r.requestedBy.displayName} · `
                    : ''}
                  {x.sub} · {shortDate(x.r.createdAt.slice(0, 10))}
                </div>
                <div className="st">
                  <RequestStatusPills request={x.r} status={st} />
                  {x.r.watchAheadParentRequestId ? (
                    <span className="d">
                      {t('lumen.requests.row.autoQueued', 'Auto-Queued')}
                    </span>
                  ) : (x.r.watchAheadEpisodeCount ?? 0) > 0 ? (
                    <span className="d">
                      {t(
                        'lumen.requests.row.episodeQueueAhead',
                        'Episode Queue · {count} ahead',
                        { count: x.r.watchAheadEpisodeCount ?? 0 }
                      )}
                    </span>
                  ) : null}
                  {detail && <span className="d">{detail}</span>}
                </div>
                <div className="rqa">
                  {x.r.id !== 0 && !x.trackRequest && (
                    <button
                      className="btn btn-sm btn-quiet"
                      onClick={() => setP(historyParams(x.r.id))}
                    >
                      {t('lumen.requests.actions.history', 'History')}
                    </button>
                  )}
                  {renderRequestActions(x, everyone && manage)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {trackRequestsEnabled && !softwareView && (
        <p className="note">
          <Link className="btn btn-quiet btn-sm" to="/track-requests">
            {t('lumen.requests.openTrackRequests', 'Open Track Requests')}
          </Link>
        </p>
      )}
      {browseRequests && hasMore && shown && (
        <div className="more-scroll">
          <button
            className="btn btn-tonal"
            disabled={loadingMore}
            onClick={() => {
              setLoadingMore(true);
              setPages((n) => n + 1);
            }}
          >
            {loadingMore
              ? t('lumen.requests.page.loadingMore', 'Loading…')
              : t('lumen.requests.page.showMore', 'Show more')}
          </button>
        </div>
      )}
      {confirming && (
        <ConfirmSheet
          title={
            confirming.how === 'cancel'
              ? t('lumen.requests.actions.cancelTitle', 'Cancel this request?')
              : confirming.how === 'remove'
                ? t(
                    'lumen.requests.actions.removeRequestTitle',
                    'Remove {title}?',
                    {
                      title:
                        confirming.title.trim() ||
                        t('lumen.requestHistory.unknownTitle', 'this item'),
                    }
                  )
                : confirming.how === 'removeMedia'
                  ? t(
                      'lumen.requests.actions.removeMediaTitle',
                      'Remove {title} from the service?',
                      {
                        title:
                          confirming.title.trim() ||
                          t('lumen.requestHistory.unknownTitle', 'this item'),
                      }
                    )
                  : t(
                      'lumen.requests.actions.declineTitle',
                      'Decline this request?'
                    )
          }
          body={
            confirming.how === 'cancel'
              ? t(
                  'lumen.requests.actions.cancelBody',
                  '{title} won’t be fetched. You can ask for it again later.',
                  {
                    title:
                      confirming.title.trim() ||
                      t('lumen.requestHistory.unknownTitle', 'this item'),
                  }
                )
              : confirming.how === 'remove'
                ? t(
                    'lumen.requests.actions.removeRequestBody',
                    'This deletes the request for {title} for good. It can’t be undone.',
                    {
                      title:
                        confirming.title.trim() ||
                        t('lumen.requestHistory.unknownTitle', 'this item'),
                    }
                  )
                : confirming.how === 'removeMedia'
                  ? t(
                      'lumen.requests.actions.removeMediaBody',
                      'This removes the managed copy of {title}. Its SeerrNG request and history will remain.',
                      {
                        title:
                          confirming.title.trim() ||
                          t('lumen.requestHistory.unknownTitle', 'this item'),
                      }
                    )
                  : t(
                      'lumen.requests.actions.declineBody',
                      '{title} won’t be fetched, and the person who asked will see it was declined.',
                      {
                        title:
                          confirming.title.trim() ||
                          t('lumen.requestHistory.unknownTitle', 'this item'),
                      }
                    )
          }
          confirm={
            confirming.how === 'cancel'
              ? t('lumen.requests.actions.confirmCancel', 'Cancel request')
              : confirming.how === 'remove'
                ? t(
                    'lumen.requests.actions.confirmRemoveRequest',
                    'Remove request'
                  )
                : confirming.how === 'removeMedia'
                  ? t(
                      'lumen.requests.actions.confirmRemoveMedia',
                      'Remove from Service'
                    )
                  : t(
                      'lumen.requests.actions.confirmDecline',
                      'Decline request'
                    )
          }
          cancel={t('lumen.requests.actions.keep', 'Keep it')}
          onClose={() => setConfirming(null)}
          onConfirm={() => {
            const { id, how, request, trackId } = confirming;
            setConfirming(null);
            if (trackId != null) {
              if (how === 'cancel') void cancelTrack(trackId);
              else if (how === 'decline') void decideTrack(trackId, 'decline');
              return;
            }
            if (how === 'cancel') void cancel(id);
            else if (how === 'removeMedia') {
              if (request) void removeManagedCopy(request);
            } else void decide(id, how);
          }}
        />
      )}
      {requestParam !== null && !validRequestLink && (
        <p className="note" role="alert">
          {t('lumen.requests.invalidLink', 'This request link is invalid.')}
        </p>
      )}
      {validRequestLink && requestKey === 'softwareRequestId' && (
        <SoftwareRequestHistorySheet
          changed={() => setTick((value) => value + 1)}
          key={focusedId}
          id={focusedId}
          close={closeHistory}
        />
      )}
      {validRequestLink &&
        requestKey === 'requestId' &&
        !confirming &&
        !editing &&
        !queueEdit &&
        !mapping && (
          <RequestHistorySheet
            key={`${focusedId}:${historyRevision}`}
            id={focusedId}
            title={list.find(({ r }) => r.id === focusedId)?.title}
            describeRequest={describe}
            renderActions={(request, title) => (
              <div className="rqa">
                {renderRequestActions(
                  {
                    href: '',
                    sub: '',
                    ...list.find(({ r }) => r.id === request.id),
                    r: request,
                    title,
                  },
                  manage
                )}
              </div>
            )}

            close={closeHistory}
          />
        )}
      {queueEdit && (
        <RequestEpisodeQueueSheet
          request={queueEdit.r}
          title={queueEdit.title}
          close={() => setQueueEdit(null)}
          saved={({ episodeCount, usesUserDefault }) => {
            forget(`/request/status/${queueEdit.r.id}`);
            const patch = (previous: Row[] | null) =>
              previous?.map((row) =>
                row.r.id === queueEdit.r.id
                  ? {
                      ...row,
                      r: {
                        ...row.r,
                        watchAheadEpisodeCount: episodeCount,
                        watchAheadUsesUserDefault: usesUserDefault,
                      },
                    }
                  : row
              ) ?? null;
            setRows(patch);
            setOthers(patch);
            setQueueEdit(null);
            toast(
              t('lumen.requests.episodeQueue.saved', 'Episode Queue saved.')
            );
            setTick((t) => t + 1);
          }}
        />
      )}
      {mapping && (
        <TvSeasonMappingSheet
          request={mapping.r}
          title={mapping.title}
          close={() => setMapping(null)}
          saved={() => {
            forget(`/request/status/${mapping.r.id}`);
            setMapping(null);
            setTick((value) => value + 1);
            toast(
              t(
                'lumen.requestMapping.success',
                'Season mapping saved and request retried.'
              )
            );
          }}
        />
      )}
      {editing && (
        <RequestEditSheet
          r={editing.r}
          title={editing.title}
          art={editing.art}
          onClose={() => setEditing(null)}
          onDone={(message) => {
            forget(`/request/status/${editing.r.id}`);
            setEditing(null);
            toast(message);
            setTick((t) => t + 1);
          }}
        />
      )}
    </>
  );
}

onSessionReset(() => {
  statusProjectionSupported = true;
  statusFilterSupported = true;
  described.clear();
  retryLater.clear();
  bookCalls.clear();
  bookLimited = false;
  limited = false;
  const key = descriptionKey();
  if (!key) return;
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(stored)) {
      for (const entry of stored.slice(-400)) {
        if (
          Array.isArray(entry) &&
          entry.length === 2 &&
          Number.isSafeInteger(entry[0]) &&
          entry[1] &&
          typeof entry[1].title === 'string'
        ) {
          described.set(entry[0], entry[1]);
        }
      }
    }
  } catch {
    /* Optional account-local metadata cache. */
  }
});

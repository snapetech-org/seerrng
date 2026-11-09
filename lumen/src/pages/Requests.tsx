import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  api,
  ApiError,
  bookMediaForFormat,
  cancelRequest,
  mediaLink,
  MediaStatus,
  plexUrl,
  tmdbImg,
  type BookResult,
  type RequestItem,
  type TvDetails,
} from '../api';
import { useAuth, useMediaServerName } from '../auth';
import { shortDate } from '../components/cards';
import { canChooseRequestOptions, Pill } from '../components/detail';
import { RequestEditSheet } from '../components/requestEdit';
import { Avatar } from '../components/Shell';
import { useToast } from '../components/toast';
import {
  GAME_LABEL,
  useExtras,
  type AlbumDetails,
  type Comic,
  type League,
  type Magazine,
  type Scene,
  type SoftwareRequest,
} from '../extras';
import { usePullToRefresh } from '../hooks';
import { Icon, type IconName } from '../icons';
import {
  onSessionReset,
  sessionGeneration,
  sessionUserId,
} from '../sessionState';

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
}

// Everyone tab: SeerrNG's request filters, and how many requests load at a time
const EVERYONE_FILTERS = [
  ['all', 'All', 'total'],
  ['pending', 'Waiting', 'pending'],
  ['processing', 'Downloading', 'processing'],
  ['failed', 'Failed', 'failed'],
  ['available', 'Available', 'available'],
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
async function requestListOnce(path: string): Promise<RequestListPage> {
  const filter = new URLSearchParams(path.split('?')[1]).get('filter');
  if (
    statusFilterSupported &&
    (filter === 'available' || filter === 'processing')
  ) {
    try {
      // The legacy list filter follows aggregate media/coarse request flags.
      // Reuse the lifecycle owner's filtering and pagination for file truth.
      const stages =
        filter === 'available'
          ? ['available']
          : ['searching', 'downloading', 'importing', 'library'];
      const data = await api<{
        pageInfo: { pages: number; results: number };
        results: {
          request: RequestItem;
          status: NonNullable<RequestItem['currentStatus']>;
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
            !stages.includes(item.status?.stage)
        )
      ) {
        throw new Error('Invalid request status response');
      }
      return {
        ...data,
        authoritativeStatus: true,
        results: data.results.map(({ request, status }) => ({
          ...request,
          currentStatus: status,
        })),
      };
    } catch (error) {
      if (!(error instanceof ApiError) || ![400, 404].includes(error.status))
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
function eta(t?: string) {
  const m = /^(?:(\d+)\.)?(\d+):(\d+):(\d+)/.exec(t || '');
  if (!m) return '';
  const mins = +(m[1] || 0) * 1440 + +m[2] * 60 + +m[3] + (+m[4] >= 30 ? 1 : 0);
  if (mins < 1) return 'Almost done';
  return mins < 60
    ? `About ${mins} min left`
    : `About ${Math.round(mins / 60)} hr${Math.round(mins / 60) === 1 ? '' : 's'} left`;
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
function seasonList(ns: number[]) {
  const runs: string[] = [];
  for (let i = 0; i < ns.length;) {
    let j = i;
    while (ns[j + 1] === ns[j] + 1) j++;
    runs.push(j > i ? `${ns[i]}–${ns[j]}` : `${ns[i]}`);
    i = j + 1;
  }
  return `${ns.length === 1 ? 'Season' : 'Seasons'} ${runs.join(', ')}`;
}

function state(
  x: Row,
  serverName = 'Plex'
): {
  k: 'ok' | 'dl' | 'wait' | 'bad';
  word: string;
  ico: IconName;
  active: boolean;
  pct?: number;
  detail?: string;
} {
  const r = x.r;
  const current = r.currentStatus;
  if (current) {
    const base = { active: true, detail: current.message };
    const available =
      r.type !== 'movie' && r.type !== 'tv'
        ? 'In library'
        : `${r.is4k ? '4K on' : 'On'} ${serverName}`;
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
          word: r.status === 1 ? 'Waiting for approval' : 'Requested',
          ico: 'clock',
        };
      case 'approved':
        return { ...base, k: 'wait', word: 'Approved', ico: 'clock' };
      case 'searching':
        return { ...base, k: 'wait', word: 'Searching', ico: 'clock' };
      case 'downloading': {
        const pct =
          typeof current.percent === 'number' &&
          Number.isFinite(current.percent) &&
          current.percent >= 0 &&
          current.percent <= 100
            ? Math.round(current.percent)
            : undefined;
        return {
          ...base,
          k: 'dl',
          word:
            pct === 0
              ? 'Queued'
              : pct === undefined
                ? 'Downloading'
                : `Downloading ${pct}%`,
          ico: 'down',
          pct,
        };
      }
      case 'importing':
        return { ...base, k: 'wait', word: 'Importing', ico: 'clock' };
      case 'library':
        return { ...base, k: 'wait', word: 'Checking library', ico: 'clock' };
      case 'failed':
        return { ...base, k: 'bad', word: 'Couldn’t get it', ico: 'x' };
      case 'declined':
        return { ...base, k: 'bad', word: 'Declined', ico: 'x', active: false };
      case 'cancelled':
        return {
          ...base,
          k: 'bad',
          word: 'Cancelled',
          ico: 'x',
          active: false,
        };
      case 'unavailable':
        return { ...base, k: 'bad', word: 'Unavailable', ico: 'x' };
      default:
        return { ...base, k: 'wait', word: 'Status unavailable', ico: 'clock' };
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
  const dls =
    (r.is4k
      ? r.media.downloadStatus4k
      : r.bookFormat === 'audiobook'
        ? r.media.audiobookDownloadStatus
        : r.media.downloadStatus) || [];
  const downloading = dls.length;
  const size = dls.reduce((a, d) => a + (d.size || 0), 0);
  const left = dls.reduce((a, d) => a + (d.sizeLeft || 0), 0);
  const pct = size
    ? Math.max(0, Math.min(100, Math.round((1 - left / size) * 100)))
    : undefined;
  if (ms === MediaStatus.AVAILABLE)
    return {
      k: 'ok',
      word:
        r.type !== 'movie' && r.type !== 'tv'
          ? 'In library'
          : r.is4k
            ? `4K on ${serverName}`
            : `On ${serverName}`,
      ico: 'check',
      active: false,
    };
  if (r.status === 3)
    return { k: 'bad', word: 'Declined', ico: 'x', active: false };
  if (r.status === 4)
    return { k: 'bad', word: 'Couldn’t get it', ico: 'x', active: true };
  if (r.status === 1)
    return {
      k: 'wait',
      word: 'Waiting for approval',
      ico: 'clock',
      active: true,
    };
  if (downloading)
    return {
      k: 'dl',
      // nothing here yet: it's waiting its turn in the download client's queue
      word:
        pct === 0
          ? 'Queued'
          : pct != null
            ? `Downloading ${pct}%`
            : 'Downloading',
      ico: 'down',
      active: true,
      pct,
      detail: eta(dls[0]?.timeLeft),
    };
  if (ms === MediaStatus.PARTIAL) {
    const missing = seasonsMissing(x);
    return missing && !missing.length
      ? {
          k: 'ok',
          word: r.is4k ? `4K on ${serverName}` : `On ${serverName}`,
          ico: 'check',
          active: false,
          detail:
            x.airing == null
              ? undefined // title not looked up yet
              : x.airing
                ? 'New episodes added as they air'
                : 'A few episodes missing',
        }
      : {
          k: 'ok',
          word: `Partly on ${serverName}`,
          ico: 'check',
          active: true,
          detail: missing?.length
            ? `${seasonList(missing)} not found yet`
            : undefined,
        };
  }
  return { k: 'wait', word: 'Requested', ico: 'clock', active: true };
}

// How much of a request's download is here (0 to 1). Radarr and Sonarr call everything in the
// download client's queue "downloading", so this is what tells a running download from a
// queued one.
function progress(r: RequestItem) {
  const dls =
    (r.is4k
      ? r.media.downloadStatus4k
      : r.bookFormat === 'audiobook'
        ? r.media.audiobookDownloadStatus
        : r.media.downloadStatus) || [];
  const size = dls.reduce((a, d) => a + (d.size || 0), 0);
  const left = dls.reduce((a, d) => a + (d.sizeLeft || 0), 0);
  return size ? 1 - left / size : 0;
}
// Requests whose download has started, wherever they are in the history: a big queue pushes
// the one that's actually downloading far past the newest requests. `query` narrows the list
// (e.g. one person's requests). Two pages of SeerrNG's in-progress requests are plenty.
async function startedDownloads(query = '') {
  const page = (skip: number) =>
    requestList(
      `/request?take=100&skip=${skip}&filter=processing&sort=added${query}`
    );
  const first = await page(0);
  const more =
    (first.pageInfo?.pages || 1) > 1 ? (await page(100)).results : [];
  return first.results.concat(more).filter((r) => progress(r) > 0);
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
async function describe(r: RequestItem): Promise<Row> {
  const generation = sessionGeneration();
  const known = described.get(r.id);
  // series kept before seasons were remembered get looked up once more
  if (known && isDescribed(r)) return { ...known, r };
  const row = await describeOnce(r);
  if (generation !== sessionGeneration()) return row;
  const { r: _ignored, ...rest } = row;
  void _ignored;
  if (!retryLater.delete(r.id)) described.set(r.id, rest);
  else if (known) return { ...known, r }; // keep the old name until a lookup works
  return row;
}
const isDescribed = (r: RequestItem) =>
  !!described.get(r.id) && (r.type !== 'tv' || !!described.get(r.id)?.unaired);
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
async function describeAll(list: RequestItem[]): Promise<Row[]> {
  const generation = sessionGeneration();
  const out: Row[] = new Array(list.length);
  let next = 0;
  let books = 0;
  bookLimited = false;
  bookCalls.clear();
  limited = false;
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
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  if (generation === sessionGeneration()) saveDescribed();
  return out;
}
const bookId = (r: RequestItem) =>
  r.media.identifiers?.find((i) => i.provider === 'bookshelf')?.value ||
  r.media.identifiers?.[0]?.value ||
  '';
function titlePlaceholder(r: RequestItem): Row {
  const kind = r.type === 'tv' ? 'tv' : 'movie';
  return {
    r,
    title: kind === 'tv' ? 'Series' : 'Movie',
    href: `/${kind}/${r.media.tmdbId}`,
    sub: kind === 'tv' ? 'Series' : 'Movie',
  };
}
function bookPlaceholder(r: RequestItem): Row {
  const id = bookId(r);
  const audio = r.bookFormat === 'audiobook';
  return {
    r,
    title: 'Book',
    cover: true,
    href: `/book/${encodeURIComponent(id)}${audio ? '?f=audio' : ''}`,
    sub: audio ? 'Audiobook' : 'Ebook',
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
    const audio = r.bookFormat === 'audiobook';
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
      art: b?.posterPath || undefined,
      cover: true,
      href: `/book/${encodeURIComponent(id)}${audio ? '?f=audio' : ''}`,
      sub: audio ? 'Audiobook' : 'Ebook',
    };
  }
  const extra = await describeExtra(r);
  if (extra) return extra;
  const kind = r.type === 'tv' ? 'tv' : 'movie';
  const t = await api<TvDetails>(`/${kind}/${r.media.tmdbId}`).catch(
    keepUnless404(r)
  );
  const today = new Date().toISOString().slice(0, 10);
  const seasons = r.seasons?.length
    ? r.seasons.length === 1
      ? `Season ${r.seasons[0].seasonNumber}`
      : `${r.seasons.length} seasons`
    : '';
  return {
    r,
    title: t ? t.title || t.name || '' : kind === 'tv' ? 'Series' : 'Movie',
    art: tmdbImg(t?.backdropPath || t?.posterPath, 'w500'),
    href: `/${kind}/${r.media.tmdbId}`,
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
      art: c?.posterPath,
      cover: true,
      href: `/comic/${id}`,
      sub: ['Comic', c?.publisher].filter(Boolean).join(' · '),
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
    const x = id ? await get<Scene>(`/adult/${encodeURIComponent(id)}`) : null;
    return {
      r,
      title: x?.title || 'Scene',
      art: x?.posterPath,
      href: `/adult/${encodeURIComponent(id)}`,
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
    requestedBy: { id: 0, displayName: '' },
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
  return {
    r,
    title: q.title,
    art: q.coverUrl || undefined,
    cover: true,
    href: `/game/${q.category}/${encodeURIComponent(String(id))}${q.catalogProvider === 'dat' ? '?dat=1' : ''}`,
    sub: [GAME_LABEL[q.category], q.platform?.name].filter(Boolean).join(' · '),
  };
}

export default function Requests() {
  const serverName = useMediaServerName();
  const { user } = useAuth();
  const toast = useToast();
  const [p, setP] = useSearchParams();
  const tab = p.get('tab') || 'active';
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ownError, setOwnError] = useState(false);
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pull = usePullToRefresh(() => {
    setRefreshing(true);
    setTick((t) => t + 1);
  });
  const extras = useExtras();
  // admins and request managers also see everyone's requests, and approve or decline them
  const manage = canChooseRequestOptions(user?.permissions);
  const everyone = manage && tab === 'everyone';
  const [others, setOthers] = useState<Row[] | null>(null);
  const [othersError, setOthersError] = useState(false);
  // SeerrNG's request counts, for the Everyone tab and its filters
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const waiting = counts?.pending ?? null;
  // Everyone: which requests (SeerrNG's own filters) and how many pages of them
  const show = (EVERYONE_FILTERS.find(([v]) => v === p.get('show')) ||
    EVERYONE_FILTERS[0])[0];
  const [pages, setPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    setPages(1);
    setOthers(null);
  }, [show, everyone]);
  const [acting, setActing] = useState<number | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  // Remove asks once more on the same button instead of a pop-up
  const [removing, setRemoving] = useState<number | null>(null);
  useEffect(() => {
    if (removing == null) return;
    const t = window.setTimeout(() => setRemoving(null), 4000);
    return () => window.clearTimeout(t);
  }, [removing]);

  useEffect(() => {
    if (!manage) return;
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
  }, [manage, tick]);

  useEffect(() => {
    if (!everyone) return;
    let live = true;
    setOthersError(false);
    // the newest `take` requests of one filter, in SeerrNG's pages of up to 100
    const list = async (filter: string, take: number) => {
      const out: RequestItem[] = [];
      let total = 0;
      for (let skip = 0; skip < take; skip += 100) {
        const d = await requestList(
          `/request?take=${Math.min(100, take - skip)}&skip=${skip}&filter=${filter}&sort=added`
        );
        total = d.pageInfo?.results ?? 0;
        if (
          live &&
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
    const started =
      show === 'all' || show === 'processing'
        ? startedDownloads()
            .then((x) => x.sort((a, b) => progress(b) - progress(a)))
            .catch(() => [])
        : Promise.resolve([]);
    const pending =
      show === 'all'
        ? list('pending', 50).then((x) => x.results)
        : Promise.resolve([]);
    Promise.all([pending, started, list(show, take)])
      .then(async ([waitingList, startedList, rest]) => {
        const rows = await describeAll(
          merge(waitingList, startedList, rest.results)
        );
        if (!live) return;
        setOthers(rows);
        setHasMore(rest.more);
      })
      .catch(() => {
        if (!live) return;
        setOthers(null);
        setOthersError(true);
      })
      .finally(() => {
        if (!live) return;
        setRefreshing(false);
        setLoadingMore(false);
      });
    return () => {
      live = false;
    };
  }, [everyone, show, pages, tick]);

  useEffect(() => {
    if (!user || everyone) return;
    let live = true;
    setOwnError(false);
    const media = Promise.all([
      requestList(
        `/request?take=40&skip=0&filter=all&sort=added&requestedBy=${user.id}`
      ).then((d) => d.results),
      startedDownloads(`&requestedBy=${user.id}`).catch(() => []),
    ]).then(([recent, started]) => describeAll(merge(recent, started)));
    // game requests only when a games category is on (the endpoint refuses otherwise)
    const games = extras.games.length
      ? api<{ results: SoftwareRequest[] }>(
          `/request/software/status?take=40&requestedBy=${user.id}`
        )
          .then((d) => d.results.map(gameRow))
          .catch(() => [])
      : Promise.resolve([]);
    Promise.all([media, games])
      .then(([a, b]) =>
        a.concat(b).sort((x, y) => y.r.createdAt.localeCompare(x.r.createdAt))
      )
      .then((x) => live && setRows(x))
      .catch(() => live && setOwnError(true))
      .finally(() => live && setRefreshing(false));
    return () => {
      live = false;
    };
  }, [user, everyone, tick, extras.games.length]);

  // keep download percentages moving while anything is downloading
  const busy = (rows || []).some((x) => state(x, serverName).pct != null);
  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, [busy]);
  const all = rows || [];
  const act = all.filter((x) => state(x, serverName).active);
  const ready = all.filter(
    (x) => state(x, serverName).k === 'ok' && !state(x, serverName).active
  );
  const list = everyone
    ? (others || []).filter((row) =>
        show === 'available'
          ? state(row, serverName).k === 'ok' && !state(row, serverName).active
          : show !== 'processing' || state(row, serverName).active
      )
    : tab === 'ready'
      ? ready
      : tab === 'all'
        ? all
        : act;
  const shown = everyone ? others : rows;
  const decide = async (
    id: number,
    how: 'approve' | 'decline' | 'retry' | 'remove'
  ) => {
    setActing(id);
    setRemoving(null);
    try {
      if (how === 'remove') await api(`/request/${id}`, { method: 'DELETE' });
      else await api(`/request/${id}/${how}`, { method: 'POST', body: '{}' });
      toast(
        {
          approve: 'Request approved',
          decline: 'Request declined',
          retry: 'Request sent again',
          remove: 'Request removed',
        }[how]
      );
      setTick((t) => t + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t update the request');
    } finally {
      setActing(null);
    }
  };
  const cancel = async (id: number) => {
    try {
      // game requests (negative ids here) are withdrawn through their own endpoint
      if (id < 0)
        await api(`/request/software/status/${-id}/withdraw`, {
          method: 'POST',
        });
      else await cancelRequest(id);
      toast('Request cancelled');
      setTick((t) => t + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t cancel');
    }
  };

  return (
    <>
      <header className="ph">
        <div className="ph-row">
          <div>
            <h1>Requests</h1>
          </div>
          <Avatar className="avatar ph-only-avatar" />
        </div>
        <p className="sub">
          {everyone
            ? show === 'all'
              ? 'Everyone’s requests: waiting ones first, then downloads, then the newest.'
              : 'Everyone’s requests, newest first.'
            : 'Everything you’ve asked for, newest first.'}
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
          ? 'Refreshing…'
          : pull.state === 'armed'
            ? 'Release to refresh'
            : 'Pull to refresh'}
      </div>
      <div className="seg" role="group" aria-label="Show">
        {[
          ['active', 'Active', act.length],
          ['ready', 'Ready', ready.length],
          ['all', 'All', all.length],
          ...(manage ? [['everyone', 'Everyone', waiting ?? '']] : []),
        ].map(([v, t, n]) => (
          <button
            key={v as string}
            aria-pressed={tab === v}
            onClick={() =>
              setP(v === 'active' ? {} : { tab: v as string }, {
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
      {!shown && !(everyone ? othersError : ownError) && (
        <p className="note">
          {everyone ? 'Loading everyone’s requests…' : 'Loading your requests…'}
        </p>
      )}
      {(everyone ? othersError : ownError) && (
        <div className="empty" role="alert">
          <b>Couldn’t load requests</b>
          <p>
            {everyone
              ? 'Try again to check everyone’s request history.'
              : 'Try again to check your request history.'}
          </p>
          <button
            className="btn btn-tonal"
            onClick={() => setTick((t) => t + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {everyone && (
        <div className="chips wrap" role="group" aria-label="Which requests">
          {EVERYONE_FILTERS.map(([v, t, key]) => (
            <button
              key={v}
              className="chip"
              aria-pressed={show === v}
              onClick={() =>
                setP(
                  v === 'all'
                    ? { tab: 'everyone' }
                    : { tab: 'everyone', show: v },
                  {
                    replace: true,
                  }
                )
              }
            >
              {t}
              {counts?.[key] != null && (
                <span className="n">{counts[key]}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {shown && !list.length && everyone && (
        <div className="empty">
          <b>{show === 'all' ? 'No requests yet' : 'Nothing here'}</b>
          {show === 'all'
            ? 'Nobody has asked for anything.'
            : 'No requests match this filter right now.'}
        </div>
      )}
      {shown && !list.length && !everyone && (
        <div className="empty">
          <b>{tab === 'ready' ? 'Nothing ready yet' : 'No active requests'}</b>
          Find something on{' '}
          <Link to="/" style={{ color: 'var(--accent)' }}>
            Discover
          </Link>
          .
        </div>
      )}
      <div className="rqlist">
        {list.map((x) => {
          const st = state(x, serverName);
          return (
            <div className="rq" key={x.r.id}>
              <div className={`art ${x.cover ? 'cover' : ''}`}>
                {x.cover && x.art && (
                  <img
                    className="art-fill"
                    src={x.art}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                  />
                )}
                {x.art && <img src={x.art} alt="" loading="lazy" />}
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
                  <Link to={x.href}>{x.title}</Link>
                </div>
                <div className="sub">
                  {everyone && x.r.requestedBy?.displayName
                    ? `${x.r.requestedBy.displayName} · `
                    : ''}
                  {x.sub} · {shortDate(x.r.createdAt.slice(0, 10))}
                </div>
                <div className="st">
                  <Pill k={st.k} icon={st.ico}>
                    {st.word}
                  </Pill>
                  {st.detail && <span className="d">{st.detail}</span>}
                </div>
                <div className="rqa">
                  {everyone ? (
                    <>
                      {x.r.status === 1 && (
                        <>
                          <button
                            className="btn btn-sm btn-ok"
                            disabled={acting === x.r.id}
                            onClick={() => decide(x.r.id, 'approve')}
                          >
                            <Icon name="check" size="sm" />
                            Approve
                          </button>
                          <button
                            className="btn btn-sm btn-quiet"
                            disabled={acting === x.r.id}
                            onClick={() => decide(x.r.id, 'decline')}
                          >
                            <Icon name="x" size="sm" />
                            Decline
                          </button>
                        </>
                      )}
                      {x.r.status === 4 && (
                        <button
                          className="btn btn-sm btn-tonal"
                          disabled={acting === x.r.id}
                          onClick={() => decide(x.r.id, 'retry')}
                        >
                          <Icon name="refresh" size="sm" />
                          Retry
                        </button>
                      )}
                      {(x.r.status === 1 || x.r.status === 4) &&
                        (x.r.type === 'movie' || x.r.type === 'tv') && (
                          <button
                            className="btn btn-sm btn-quiet"
                            disabled={acting === x.r.id}
                            onClick={() => setEditing(x)}
                          >
                            Change
                          </button>
                        )}
                      <button
                        className="btn btn-sm btn-quiet"
                        disabled={acting === x.r.id}
                        onClick={() =>
                          removing === x.r.id
                            ? decide(x.r.id, 'remove')
                            : setRemoving(x.r.id)
                        }
                      >
                        {removing === x.r.id ? 'Remove for good?' : 'Remove'}
                      </button>
                    </>
                  ) : st.k === 'ok' &&
                    x.r.type !== 'book' &&
                    plexUrl(x.r.media, x.r.is4k) ? (
                    <a
                      className="btn btn-sm btn-ok"
                      {...mediaLink(x.r.media, x.r.is4k, x.r.type, serverName)}
                    >
                      <Icon name="play" size="sm" />
                      {x.r.type === 'music'
                        ? `Listen on ${serverName}`
                        : `Watch on ${serverName}`}
                    </a>
                  ) : x.r.status === 1 ? (
                    <button
                      className="btn btn-sm btn-quiet"
                      onClick={() => cancel(x.r.id)}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {everyone && hasMore && shown && (
        <div className="more-scroll">
          <button
            className="btn btn-tonal"
            disabled={loadingMore}
            onClick={() => {
              setLoadingMore(true);
              setPages((n) => n + 1);
            }}
          >
            {loadingMore ? 'Loading…' : 'Show more'}
          </button>
        </div>
      )}
      {editing && (
        <RequestEditSheet
          r={editing.r}
          title={editing.title}
          art={editing.art}
          onClose={() => setEditing(null)}
          onDone={(message) => {
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

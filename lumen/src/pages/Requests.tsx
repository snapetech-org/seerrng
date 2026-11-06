import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  api,
  ApiError,
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
import { Pill } from '../components/detail';
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
  // a 4K request follows the 4K copy, not the HD one already on Plex
  const ms = r.is4k ? r.media.status4k : r.media.status;
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
      word: pct != null ? `Downloading ${pct}%` : 'Downloading',
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
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pull = usePullToRefresh(() => {
    setRefreshing(true);
    setTick((t) => t + 1);
  });
  const extras = useExtras();

  useEffect(() => {
    if (!user) return;
    let live = true;
    const media = api<{ results: RequestItem[] }>(
      `/request?take=40&skip=0&filter=all&sort=added&requestedBy=${user.id}`
    ).then((d) => describeAll(d.results));
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
      .catch(() => live && setRows([]))
      .finally(() => live && setRefreshing(false));
    return () => {
      live = false;
    };
  }, [user, tick, extras.games.length]);

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
  const list = tab === 'ready' ? ready : tab === 'all' ? all : act;
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
        <p className="sub">Everything you’ve asked for, newest first.</p>
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
            {t} <span className="n">{rows ? n : ''}</span>
          </button>
        ))}
      </div>
      {!rows && <p className="note">Loading your requests…</p>}
      {rows && !list.length && (
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
                  {x.sub} · {shortDate(x.r.createdAt.slice(0, 10))}
                </div>
                <div className="st">
                  <Pill k={st.k} icon={st.ico}>
                    {st.word}
                  </Pill>
                  {st.detail && <span className="d">{st.detail}</span>}
                </div>
                <div className="rqa">
                  {st.k === 'ok' &&
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
    </>
  );
}

onSessionReset(() => {
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

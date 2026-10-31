import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  api,
  cancelRequest,
  MediaStatus,
  plexUrl,
  tmdbImg,
  type BookResult,
  type RequestItem,
  type TitleResult,
} from '../api';
import { useAuth } from '../auth';
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
import { Icon, type IconName } from '../icons';

interface Row {
  r: RequestItem;
  title: string;
  art?: string;
  cover?: boolean;
  href: string;
  sub: string;
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

function state(r: RequestItem): {
  k: 'ok' | 'dl' | 'wait' | 'bad';
  word: string;
  ico: IconName;
  active: boolean;
  pct?: number;
  detail?: string;
} {
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
            ? '4K on Plex'
            : 'On Plex',
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
  if (ms === MediaStatus.PARTIAL)
    return { k: 'ok', word: 'Partly on Plex', ico: 'check', active: true };
  return { k: 'wait', word: 'Requested', ico: 'clock', active: true };
}

// titles and artwork don't change, so each request is described once and reused on refresh
const described = new Map<number, Omit<Row, 'r'>>();
async function describe(r: RequestItem): Promise<Row> {
  const known = described.get(r.id);
  if (known) return { ...known, r };
  const row = await describeOnce(r);
  const { r: _ignored, ...rest } = row;
  void _ignored;
  described.set(r.id, rest);
  return row;
}
async function describeOnce(r: RequestItem): Promise<Row> {
  if (r.type === 'book') {
    const id =
      r.media.identifiers?.find((i) => i.provider === 'bookshelf')?.value ||
      r.media.identifiers?.[0]?.value ||
      '';
    const audio = r.bookFormat === 'audiobook' || id.startsWith('bookshelf:1:');
    const b = id
      ? await api<BookResult>(`/book/${encodeURIComponent(id)}`).catch(
          () => null
        )
      : null;
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
  const t = await api<TitleResult>(`/${kind}/${r.media.tmdbId}`).catch(
    () => null
  );
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
  };
}

// music, comics, magazines, sports and adult requests: each is keyed by its own catalogue's id
const idOf = (r: RequestItem, provider: string) =>
  r.media.identifiers?.find((i) => i.provider === provider)?.value;
async function describeExtra(r: RequestItem): Promise<Row | null> {
  const get = <T,>(path: string) => api<T>(path).catch(() => null);
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
  const { user } = useAuth();
  const toast = useToast();
  const [p, setP] = useSearchParams();
  const tab = p.get('tab') || 'active';
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tick, setTick] = useState(0);
  const extras = useExtras();

  useEffect(() => {
    if (!user) return;
    let live = true;
    const media = api<{ results: RequestItem[] }>(
      `/request?take=40&skip=0&filter=all&sort=added&requestedBy=${user.id}`
    ).then((d) => Promise.all(d.results.map(describe)));
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
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [user, tick, extras.games.length]);

  // keep download percentages moving while anything is downloading
  const busy = (rows || []).some((x) => state(x.r).pct != null);
  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(t);
  }, [busy]);
  const all = rows || [];
  const act = all.filter((x) => state(x.r).active);
  const ready = all.filter((x) => state(x.r).k === 'ok' && !state(x.r).active);
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
          const st = state(x.r);
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
                      href={plexUrl(x.r.media, x.r.is4k)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon name="play" size="sm" />
                      {x.r.type === 'music'
                        ? 'Listen on Plex'
                        : 'Watch on Plex'}
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

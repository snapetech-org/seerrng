import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { api, artUrl } from '../api';
import { useAuth } from '../auth';
import { GridSkeleton, MoreOnScroll, type Stat } from '../components/cards';
import { DetailTop, Facts, fmtHrs, Pill } from '../components/detail';
import {
  ExtraCard,
  ExtraGate,
  ExtraHeader,
  ExtraSearch,
  ServiceNote,
  StatPill,
} from '../components/extra';
import FollowButton from '../components/FollowButton';
import GameContentPicker from '../components/GameContentPicker';
import IndexerSearchLink from '../components/IndexerSearchLink';
import { useToast } from '../components/toast';
import {
  GAME_LABEL,
  gameState,
  PC_ARCH,
  PC_OS,
  requestGame,
  useExtras,
  type Game,
  type GameCategory,
  type GameContentSelection,
  type GamePage,
} from '../extras';
import { canViewFollowing } from '../followPermissions';
import { useApi } from '../hooks';
import { Icon } from '../icons';

const statOf = (g: Game): Stat => {
  const w = gameState(g);
  return !w
    ? null
    : w === 'In library'
      ? { k: 'ok', word: w, ico: 'check' }
      : w === 'Downloading'
        ? { k: 'dl', word: w, ico: 'down' }
        : { k: 'wait', word: w, ico: 'clock' };
};

// the software catalogue pages by offset when browsing and by cursor when searching
function useGames(category: GameCategory | undefined, query: string) {
  const [items, setItems] = useState<Game[]>([]);
  const [next, setNext] = useState<string | number | null | undefined>(
    undefined
  ); // undefined = not loaded yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = `${category}|${query}`;
  const live = useRef(key);
  const inFlight = useRef<symbol | null>(null);
  // where a failed page was, so Retry asks for it again
  const failedAt = useRef<string | number | undefined>(undefined);
  useEffect(() => {
    live.current = key;
    inFlight.current = null;
    failedAt.current = undefined;
    setLoading(false);
    setItems([]);
    setNext(undefined);
    setError(null);
  }, [key]);
  const more = useCallback(async () => {
    if (!category || loading || inFlight.current || next === null) return;
    const token = Symbol();
    inFlight.current = token;
    const ownsRequest = () =>
      live.current === key && inFlight.current === token;
    setLoading(true);
    const p = new URLSearchParams({ category, limit: '24' });
    if (query) p.set('q', query);
    if (next !== undefined) p.set(query ? 'cursor' : 'offset', String(next));
    try {
      const d = await api<GamePage>(
        `/request/software/catalog/${query ? 'search' : 'popular'}?${p}`
      );
      if (!ownsRequest()) return;
      setItems((x) => {
        const seen = new Set(x.map((g) => g.id));
        return x.concat(d.results.filter((g) => !seen.has(g.id)));
      });
      setNext((query ? d.nextCursor : d.nextOffset) ?? null);
    } catch (e) {
      if (ownsRequest()) {
        setError(e instanceof Error ? e.message : 'Failed to load');
        failedAt.current = next;
        setNext(null);
      }
    } finally {
      if (ownsRequest()) {
        inFlight.current = null;
        setLoading(false);
      }
    }
  }, [category, query, next, loading, key]);
  useEffect(() => {
    if (next === undefined && !loading) void more();
  }, [key, next, loading, more]);
  const retry = useCallback(() => {
    setError(null);
    setNext(failedAt.current);
  }, []);
  return { items, more, retry, loading, error, done: next === null };
}

export function SoftwareBookmark() {
  const [params] = useSearchParams();
  const category = params.get('category');
  const knownCategory =
    category === 'game' || category === 'retro' || category === 'modern';
  const id = params.get('game') ?? '';
  const dat = params.get('catalogProvider') === 'dat';
  const validId = dat
    ? category !== 'game' && /^dat-[0-9a-f]{64}$/.test(id)
    : /^[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id));
  if (knownCategory && validId) {
    return (
      <Navigate replace to={`/game/${category}/${id}${dat ? '?dat=1' : ''}`} />
    );
  }
  const search = new URLSearchParams();
  if (knownCategory) search.set('c', category);
  const query = params.get('q')?.trim();
  if (query && query.length <= 256) search.set('q', query);
  return (
    <Navigate replace to={{ pathname: '/games', search: search.toString() }} />
  );
}

export function Games() {
  const x = useExtras();
  const [p, setP] = useSearchParams();
  const cat = (
    x.games.includes(p.get('c') as GameCategory) ? p.get('c') : x.games[0]
  ) as GameCategory | undefined;
  const query = p.get('q') || '';
  const [q, setQ] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim() === query) return;
      const n = new URLSearchParams(p);
      if (q.trim()) n.set('q', q.trim());
      else n.delete('q');
      setP(n, { replace: true });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  // no game service behind the category: the gate explains, so don't ask SeerrNG for lists
  const list = useGames(x.enabled('game') ? cat : undefined, query);
  const checking = x.enabled('game') && !x.gamesChecked;
  const setCat = (c: GameCategory) => {
    const n = new URLSearchParams(p);
    n.set('c', c);
    setP(n, { replace: true });
  };

  return (
    <ExtraGate k="game">
      <ExtraHeader
        title="Games"
        sub={
          cat === 'game'
            ? 'PC games. Pick your system when you request.'
            : 'Pick the console when you request; it arrives ready for your emulator.'
        }
      >
        <div className="toolbar">
          <Link className="chip" to="/patches">
            Translations and Hacks
          </Link>
          <Link className="chip" to="/game-library">
            My Games
          </Link>
        </div>
        {x.games.length > 1 && (
          <div className="seg wide" role="group" aria-label="Platform">
            {x.games.map((c) => (
              <button
                key={c}
                aria-pressed={cat === c}
                onClick={() => setCat(c)}
              >
                {GAME_LABEL[c]}
              </button>
            ))}
          </div>
        )}
        <ExtraSearch
          value={q}
          onChange={setQ}
          placeholder={
            {
              game: 'Search PC games…',
              retro: 'Search retro games…',
              modern: 'Search console games…',
            }[cat || 'game']
          }
        />
      </ExtraHeader>
      {/* the catalogue checks are still out, or none of them answered */}
      {checking ? (
        <GridSkeleton />
      ) : !cat ? (
        <ServiceNote
          error="None of the game catalogues answered."
          what="games"
          retry={x.recheckGames}
        />
      ) : (
        <>
          <ServiceNote
            error={list.items.length ? null : list.error}
            what="games"
            retry={list.retry}
          />
          {!list.error && !list.items.length && !list.loading && (
            <div className="empty">
              <b>No games found</b>Try the game’s full title.
            </div>
          )}
        </>
      )}
      <div className="grid">
        {list.items.map((g) => (
          <ExtraCard
            key={g.id}
            href={`/game/${cat}/${encodeURIComponent(g.catalogProvider === 'dat' ? g.catalogId : String(g.igdbId ?? g.catalogId))}${g.catalogProvider === 'dat' ? '?dat=1' : ''}`}
            img={g.coverUrl}
            title={g.title}
            icon="game"
            stat={statOf(g)}
            meta={[(g.releaseDate || '').slice(0, 4), g.genres?.[0]]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
      </div>
      <MoreOnScroll
        done={list.done}
        loading={list.loading}
        more={list.more}
        error={list.items.length ? list.error : null}
        retry={list.retry}
      />
    </ExtraGate>
  );
}

export function GameDetail() {
  const { category = 'game', id = '' } = useParams();
  const [p] = useSearchParams();
  const cat = category as GameCategory;
  const dat = p.get('dat') === '1';
  return (
    <GameDetailView
      key={JSON.stringify([cat, id, dat])}
      id={id}
      cat={cat}
      dat={dat}
    />
  );
}

function GameDetailView({
  id,
  cat,
  dat,
}: {
  id: string;
  cat: GameCategory;
  dat: boolean;
}) {
  const { user } = useAuth();
  const { data, error, reload } = useApi<Game | { game: Game }>(
    `/request/software/catalog/games/${encodeURIComponent(id)}?category=${encodeURIComponent(cat)}${dat ? '&catalogProvider=dat' : ''}`
  );
  const g = data && ('game' in data ? data.game : data);
  const toast = useToast();
  const [os, setOs] = useState('');
  const [arch, setArch] = useState('');
  const [system, setSystem] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [done, setDone] = useState('');
  const [selection, setSelection] = useState<
    GameContentSelection | null | undefined
  >(null);
  if (error)
    return (
      <ExtraGate k="game">
        <ServiceNote what="this game" error={error} retry={reload} />
      </ExtraGate>
    );
  if (!g) return <div className="detail-loading" aria-busy="true" />;
  const s = statOf(g);
  const systems = (g.emulationSystems || []).filter((x) => x.group === cat);
  const sys =
    systems.find(({ slug }) => slug === system)?.slug ?? systems[0]?.slug ?? '';
  const contentId =
    cat === 'game' &&
    !dat &&
    typeof g.igdbId === 'number' &&
    Number.isSafeInteger(g.igdbId) &&
    g.igdbId > 0
      ? g.igdbId
      : undefined;
  const baseBlocked = !!s && selection === null;
  const ready =
    cat === 'game' ? !!os && !!arch && selection !== undefined : !!sys;
  const go = async () => {
    if (!ready || baseBlocked || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const r = await requestGame(cat, g, {
        os,
        arch,
        system: sys,
        selection: selection ?? undefined,
      });
      setDone(
        r.request.status === 'pending' ? 'Waiting for approval' : 'Requested'
      );
      toast(`Requested ${g.title}`);
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      toast(
        m === 'SOFTWARE_QUOTA_EXCEEDED'
          ? 'You’ve reached your game request limit.'
          : m || 'Request failed'
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const main =
    baseBlocked || done ? (
      <button className="btn btn-tonal" disabled>
        <Icon name={s?.ico || 'clock'} />
        {done || s?.word}
      </button>
    ) : (
      <button
        className="btn btn-primary"
        disabled={!ready || busy}
        onClick={go}
      >
        <Icon name="plus" />
        Request
      </button>
    );

  const screenshots = [
    ...new Set(
      (Array.isArray(g.screenshots) ? g.screenshots : [])
        .map(artUrl)
        .filter((url): url is string => !!url)
    ),
  ].slice(0, 6);
  return (
    <ExtraGate k="game">
      <article className="detail">
        <DetailTop
          status={s}
          backdrop={screenshots[0]}
          poster={g.coverUrl}
          title={g.title}
          line={[
            (g.releaseDate || '').slice(0, 4),
            GAME_LABEL[cat],
            g.genres.slice(0, 3).join(', '),
          ]}
        />
        <div className="dbody">
          <div className="dstatus">
            <StatPill s={s} />
            <IndexerSearchLink category={cat} title={g.title} />
            {cat === 'game' &&
              !dat &&
              typeof g.igdbId === 'number' &&
              Number.isSafeInteger(g.igdbId) &&
              g.igdbId > 0 &&
              canViewFollowing(user?.permissions) && (
                <FollowButton
                  label="Follow Story Expansions"
                  subject={{
                    kind: 'expansion',
                    subjectKey: `igdb:${g.igdbId}`,
                    subjectLabel: g.title,
                    conditions: { ref: { igdbId: g.igdbId, storyOnly: true } },
                  }}
                />
              )}
            {g.rating != null && (
              <Pill k="neutral" icon="star">
                {Math.round(g.rating)} / 100
              </Pill>
            )}
          </div>
          {contentId && canViewFollowing(user?.permissions) && (
            <GameContentPicker
              id={contentId}
              disabled={busy || !!done}
              onChange={setSelection}
            />
          )}
          {!baseBlocked && !done && (
            <div className="adv-grid game-pick">
              {cat === 'game' ? (
                <>
                  <label className="sel">
                    <span className="lbl">System</span>
                    <select value={os} onChange={(e) => setOs(e.target.value)}>
                      <option value="">Choose…</option>
                      {PC_OS.map(([v, t]) => (
                        <option key={v} value={v}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="sel">
                    <span className="lbl">Build</span>
                    <select
                      value={arch}
                      onChange={(e) => setArch(e.target.value)}
                    >
                      <option value="">Choose…</option>
                      {PC_ARCH.map(([v, t]) => (
                        <option key={v} value={v}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : systems.length ? (
                <label className="sel">
                  <span className="lbl">Console</span>
                  <select
                    value={sys}
                    onChange={(e) => setSystem(e.target.value)}
                  >
                    {systems.map((x) => (
                      <option key={x.slug} value={x.slug}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="note">
                  This game isn’t listed for any{' '}
                  {cat === 'retro' ? 'retro' : 'modern'} console this server
                  supports.
                </p>
              )}
            </div>
          )}
          <div className="dacts pc">{main}</div>
          <div className="dcols">
            <div style={{ display: 'grid', gap: 22 }}>
              {g.summary && <p className="ov">{g.summary}</p>}
              {!!screenshots.length && (
                <div className="shots">
                  {screenshots.map((u) => (
                    <img key={u} src={u} alt="" loading="lazy" />
                  ))}
                </div>
              )}
            </div>
            <aside>
              <Facts
                rows={[
                  ['Released', g.releaseDate],
                  ['Developer', g.developers?.join(', ')],
                  ['Publisher', g.publishers?.join(', ')],
                  ['Platforms', g.platforms.slice(0, 6).join(', ')],
                  [
                    'Time to beat',
                    g.timeToBeat?.normally ? fmtHrs(g.timeToBeat.normally) : '',
                  ],
                ]}
              />
            </aside>
          </div>
        </div>
        <div className="actionbar">
          <span className="ab-meta">
            <b>{g.title}</b>
            {GAME_LABEL[cat]}
          </span>
          {main}
        </div>
      </article>
    </ExtraGate>
  );
}

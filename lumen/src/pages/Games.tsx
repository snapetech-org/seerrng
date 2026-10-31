import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { MoreOnScroll, type Stat } from '../components/cards';
import { DetailTop, Facts, fmtHrs, Pill } from '../components/detail';
import {
  ExtraCard,
  ExtraGate,
  ExtraHeader,
  ExtraSearch,
  ServiceNote,
  StatPill,
} from '../components/extra';
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
  type GamePage,
} from '../extras';
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
  useEffect(() => {
    live.current = key;
    setItems([]);
    setNext(undefined);
    setError(null);
  }, [key]);
  const more = useCallback(async () => {
    if (!category || loading || next === null) return;
    setLoading(true);
    const p = new URLSearchParams({ category, limit: '24' });
    if (query) p.set('q', query);
    if (next !== undefined) p.set(query ? 'cursor' : 'offset', String(next));
    try {
      const d = await api<GamePage>(
        `/request/software/catalog/${query ? 'search' : 'popular'}?${p}`
      );
      if (live.current !== key) return;
      setItems((x) => {
        const seen = new Set(x.map((g) => g.id));
        return x.concat(d.results.filter((g) => !seen.has(g.id)));
      });
      setNext((query ? d.nextCursor : d.nextOffset) ?? null);
    } catch (e) {
      if (live.current === key) {
        setError(e instanceof Error ? e.message : 'Failed to load');
        setNext(null);
      }
    } finally {
      setLoading(false);
    }
  }, [category, query, next, loading, key]);
  useEffect(() => {
    if (next === undefined && !loading) void more();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, next]);
  return { items, more, loading, error, done: next === null };
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
  const list = useGames(cat, query);
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
      <ServiceNote error={list.error} what="games" />
      {!list.error && !list.items.length && !list.loading && (
        <div className="empty">
          <b>No games found</b>Try the game’s full title.
        </div>
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
      <MoreOnScroll done={list.done} loading={list.loading} more={list.more} />
    </ExtraGate>
  );
}

export function GameDetail() {
  const { category = 'game', id = '' } = useParams();
  const [p] = useSearchParams();
  const cat = category as GameCategory;
  const dat = p.get('dat') === '1';
  const { data: g, error } = useApi<Game>(
    `/request/software/catalog/games/${encodeURIComponent(id)}?category=${cat}${dat ? '&catalogProvider=dat' : ''}`
  );
  const toast = useToast();
  const [os, setOs] = useState('');
  const [arch, setArch] = useState('');
  const [system, setSystem] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  if (error)
    return (
      <ExtraGate k="game">
        <div className="empty">
          <b>Couldn’t load this game</b>
          {error}
        </div>
      </ExtraGate>
    );
  if (!g) return <div className="detail-loading" aria-busy="true" />;
  const s = statOf(g);
  const systems = (g.emulationSystems || []).filter((x) => x.group === cat);
  const sys = system || systems[0]?.slug || '';
  const ready = cat === 'game' ? !!os && !!arch : !!sys;
  const go = async () => {
    setBusy(true);
    try {
      const r = await requestGame(cat, g, { os, arch, system: sys });
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
      setBusy(false);
    }
  };
  const main =
    s || done ? (
      <button className="btn btn-tonal" disabled>
        <Icon name={s?.ico || 'clock'} />
        {s?.word || done}
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

  return (
    <ExtraGate k="game">
      <article className="detail">
        <DetailTop
          backdrop={g.screenshots?.[0]}
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
            {g.rating != null && (
              <Pill k="neutral" icon="star">
                {Math.round(g.rating)} / 100
              </Pill>
            )}
          </div>
          {!s && !done && (
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
              {!!g.screenshots?.length && (
                <div className="shots">
                  {g.screenshots.slice(0, 6).map((u) => (
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

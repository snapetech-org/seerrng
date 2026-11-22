import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Link,
  Navigate,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { api, artUrl } from '../api';
import { useAuth } from '../auth';
import {
  GridSkeleton,
  MoreOnScroll,
  StatLabel,
  type Stat,
} from '../components/cards';
import {
  canUseRequestAccess,
  DetailTop,
  Facts,
  Pill,
} from '../components/detail';
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
import { friendlyError } from '../errors';
import {
  GAME_LABEL,
  gameState,
  PC_ARCH,
  PC_OS,
  requestGame,
  unwrapCatalogGame,
  useExtras,
  type Game,
  type GameCategory,
  type GameContentSelection,
  type GamePage,
} from '../extras';
import { canViewFollowing } from '../followPermissions';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';

type Translate = ReturnType<typeof useLumenLocale>['t'];

const categoryMessages = {
  game: 'lumen.gameLibrary.pcGames',
  retro: 'lumen.gameLibrary.retroConsoles',
  modern: 'lumen.gameLibrary.modernConsoles',
} as const;

const categoryLabel = (category: GameCategory, t: Translate) =>
  t(categoryMessages[category], GAME_LABEL[category]);

const statOf = (g: Game, t: Translate): Stat => {
  const w = gameState(g);
  return !w
    ? null
    : w === 'In library'
      ? { k: 'ok', word: t('lumen.status.inLibrary', w), ico: 'check' }
      : w === 'Downloading'
        ? { k: 'dl', word: t('lumen.status.downloading', w), ico: 'down' }
        : { k: 'wait', word: t('lumen.status.requested', w), ico: 'clock' };
};

type CatalogFilters = {
  platform: string;
  system: string;
  genre: string;
  releaseYear: string;
};

// the software catalogue pages by offset when browsing and by cursor when searching
function useGames(
  category: GameCategory | undefined,
  query: string,
  filters: CatalogFilters
) {
  const { platform, system, genre, releaseYear } = filters;
  const [items, setItems] = useState<Game[]>([]);
  const [next, setNext] = useState<string | number | null | undefined>(
    undefined
  ); // undefined = not loaded yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = `${category}|${query}|${JSON.stringify(filters)}`;
  const live = useRef(key);
  const inFlight = useRef<symbol | null>(null);
  // where a failed page was, so Retry asks for it again
  const failedAt = useRef<string | number | undefined>(undefined);
  useEffect(() => {
    if (live.current === key) return;
    live.current = key;
    inFlight.current = null;
    failedAt.current = undefined;
    setLoading(false);
    setItems([]);
    setNext(undefined);
    setError(null);
  }, [key]);
  const load = useCallback(
    async (position: string | number | null | undefined) => {
      if (
        !category ||
        live.current !== key ||
        inFlight.current ||
        position === null
      )
        return;
      const token = Symbol();
      inFlight.current = token;
      const ownsRequest = () =>
        live.current === key && inFlight.current === token;
      setLoading(true);
      setError(null);
      const p = new URLSearchParams({ category, limit: '24' });
      if (query) p.set('q', query);
      if (category === 'game' && platform) p.set('platform', platform);
      if (category !== 'game' && system) p.set('system', system);
      if (genre) p.set('genre', genre);
      if (releaseYear) p.set('releaseYear', releaseYear);
      if (position !== undefined)
        p.set(query ? 'cursor' : 'offset', String(position));
      try {
        const d = await api<GamePage>(
          `/request/software/catalog/${query ? 'search' : 'popular'}?${p}`
        );
        if (!ownsRequest()) return;
        if (
          !Array.isArray(d?.results) ||
          !d.results.every(
            (game) =>
              typeof game?.id === 'string' && typeof game.title === 'string'
          )
        )
          throw new Error('Invalid game catalogue response.');
        const continuation = query ? d.nextCursor : d.nextOffset;
        if (
          continuation != null &&
          (query
            ? typeof continuation !== 'string' ||
              !continuation ||
              continuation === position
            : typeof continuation !== 'number' ||
              !Number.isSafeInteger(continuation) ||
              continuation <= Number(position ?? 0))
        )
          throw new Error('Invalid game catalogue continuation.');
        setItems((x) => {
          const seen = new Set(x.map((g) => g.id));
          return x.concat(d.results.filter((g) => !seen.has(g.id)));
        });
        setNext(continuation ?? null);
      } catch (e) {
        if (ownsRequest()) {
          setError(e instanceof Error ? e.message : 'Failed to load');
          failedAt.current = position;
          setNext(null);
        }
      } finally {
        if (ownsRequest()) {
          inFlight.current = null;
          setLoading(false);
        }
      }
    },
    [category, query, platform, system, genre, releaseYear, key]
  );
  const more = useCallback(() => void load(next), [load, next]);
  useEffect(() => {
    if (next === undefined && !loading) void more();
  }, [key, next, loading, more]);
  const retry = () => void load(failedAt.current);
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
  const { user } = useAuth();
  const { t } = useLumenLocale();
  const x = useExtras();
  const [p, setP] = useSearchParams();
  const { key: locationKey } = useLocation();
  const cat = (
    x.games.includes(p.get('c') as GameCategory) ? p.get('c') : x.games[0]
  ) as GameCategory | undefined;
  const query = (p.get('q') ?? '').trim().slice(0, 200);
  const [filterDraft, setFilterDraft] = useState({
    genre: '',
    releaseYear: '',
  });
  const [textFilters, setTextFilters] = useState({
    genre: '',
    releaseYear: '',
  });
  const [platformFilter, setPlatformFilter] = useState('');
  const [systemFilter, setSystemFilter] = useState('');
  const systemCatalog = useApi<{
    results?: { slug: string; group: GameCategory | null; name: string }[];
    catalogProvider?: 'questarr' | 'igdb' | 'dat';
    catalogSystemSlugs?: string[];
  }>(cat && cat !== 'game' ? '/request/software/catalog/systems' : null);
  const isDatCatalog =
    cat !== 'game' && systemCatalog.data?.catalogProvider === 'dat';
  const datSystemSlugs = new Set(systemCatalog.data?.catalogSystemSlugs ?? []);
  const systems = (systemCatalog.data?.results ?? []).filter(
    (system) =>
      system.group === cat && (!isDatCatalog || datSystemSlugs.has(system.slug))
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTextFilters({
        genre: filterDraft.genre.trim().slice(0, 64),
        releaseYear: /^(19[5-9]\d|20\d\d|21\d\d|2200)$/.test(
          filterDraft.releaseYear
        )
          ? filterDraft.releaseYear
          : '',
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [filterDraft]);
  const validReleaseYear =
    isDatCatalog ||
    filterDraft.releaseYear === '' ||
    /^(19[5-9]\d|20\d\d|21\d\d|2200)$/.test(filterDraft.releaseYear);
  const catalogFilters: CatalogFilters = {
    platform: cat === 'game' ? platformFilter : '',
    system: cat !== 'game' ? systemFilter : '',
    genre: isDatCatalog ? '' : textFilters.genre,
    releaseYear: isDatCatalog ? '' : textFilters.releaseYear,
  };
  const [draft, setDraft] = useState({ key: locationKey, value: query });
  const q = draft.key === locationKey ? draft.value : query;
  useEffect(() => {
    setDraft({ key: locationKey, value: query });
  }, [locationKey, query]);
  useEffect(() => {
    const term = q.trim();
    if (term === query) return;
    const t = setTimeout(() => {
      const n = new URLSearchParams(p);
      if (term) n.set('q', term);
      else n.delete('q');
      setP(n, { replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [p, q, query, setP]);
  // no game service behind the category: the gate explains, so don't ask SeerrNG for lists
  const list = useGames(
    x.enabled('game') && validReleaseYear ? cat : undefined,
    query,
    catalogFilters
  );
  const checking = x.enabled('game') && !x.gamesChecked;
  const setCat = (c: GameCategory) => {
    const n = new URLSearchParams(p);
    n.set('c', c);
    if (q.trim()) n.set('q', q.trim());
    else n.delete('q');
    setP(n, { replace: true });
  };

  return (
    <ExtraGate k="game">
      <ExtraHeader
        title={t('lumen.games.catalogTitle', 'Games')}
        sub={
          cat === 'game'
            ? t(
                'lumen.games.pcRequestHint',
                'PC games. Pick your system when you request.'
              )
            : t(
                'lumen.games.consoleRequestHint',
                'Pick the console when you request; it arrives ready for your emulator.'
              )
        }
      >
        <div className="toolbar">
          {canUseRequestAccess(user?.permissions) && (
            <>
              <Link className="chip" to="/patches">
                {t(
                  'lumen.games.translationsAndHacks',
                  'Translations and Hacks'
                )}
              </Link>
              {x.games.includes('game') && (
                <Link className="chip" to="/games/discovery">
                  {t('lumen.gameFinder.title', 'Game Finder')}
                </Link>
              )}
            </>
          )}
          <Link className="chip" to="/game-library">
            {t('lumen.gameLibrary.myGames', 'My Games')}
          </Link>
        </div>
        {x.games.length > 1 && (
          <div
            className="seg wide"
            role="group"
            aria-label={t('lumen.games.platformGroup', 'Platform')}
          >
            {x.games.map((c) => (
              <button
                key={c}
                aria-pressed={cat === c}
                onClick={() => {
                  setSystemFilter('');
                  setPlatformFilter('');
                  setCat(c);
                }}
              >
                {categoryLabel(c, t)}
              </button>
            ))}
          </div>
        )}
        <ExtraSearch
          value={q}
          onChange={(value) =>
            setDraft({ key: locationKey, value: value.slice(0, 200) })
          }
          placeholder={
            {
              game: t('lumen.games.searchPc', 'Search PC games…'),
              retro: t('lumen.games.searchRetro', 'Search retro games…'),
              modern: t('lumen.games.searchConsole', 'Search console games…'),
            }[cat || 'game']
          }
        />
        {cat && (
          <div
            className="field-grid"
            role="group"
            aria-label={t('components.Discover.FilterPanel.filters', 'Filters')}
          >
            <label className="field">
              <span className="lbl">
                {t(
                  cat === 'game'
                    ? 'components.SoftwareCatalog.allPcPlatforms'
                    : 'components.SoftwareCatalog.allSystems',
                  cat === 'game' ? 'All PC platforms' : 'All systems'
                )}
              </span>
              <select
                className="cfg-input cfg-select"
                aria-label={t(
                  cat === 'game'
                    ? 'components.SoftwareCatalog.allPcPlatforms'
                    : 'components.SoftwareCatalog.allSystems',
                  cat === 'game' ? 'All PC platforms' : 'All systems'
                )}
                value={cat === 'game' ? platformFilter : systemFilter}
                onChange={(event) =>
                  cat === 'game'
                    ? setPlatformFilter(event.target.value)
                    : setSystemFilter(event.target.value)
                }
              >
                <option value="">
                  {t(
                    cat === 'game'
                      ? 'components.SoftwareCatalog.allPcPlatforms'
                      : 'components.SoftwareCatalog.allSystems',
                    cat === 'game' ? 'All PC platforms' : 'All systems'
                  )}
                </option>
                {cat === 'game'
                  ? PC_OS.map(([value, fallback]) => (
                      <option key={value} value={value}>
                        {t(
                          `components.SoftwareCatalog.${value === 'macos' ? 'macos' : value}`,
                          fallback
                        )}
                      </option>
                    ))
                  : systems.map((system) => (
                      <option key={system.slug} value={system.slug}>
                        {system.name}
                      </option>
                    ))}
              </select>
            </label>
            {!isDatCatalog && (
              <>
                <label className="field">
                  <span className="lbl">
                    {t('components.SoftwareCatalog.genreFilter', 'Genre')}
                  </span>
                  <input
                    className="cfg-input"
                    aria-label={t(
                      'components.SoftwareCatalog.genreFilter',
                      'Genre'
                    )}
                    maxLength={64}
                    value={filterDraft.genre}
                    onChange={(event) =>
                      setFilterDraft((current) => ({
                        ...current,
                        genre: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span className="lbl">
                    {t(
                      'components.SoftwareCatalog.releaseYearFilter',
                      'Release year'
                    )}
                  </span>
                  <input
                    className="cfg-input"
                    aria-label={t(
                      'components.SoftwareCatalog.releaseYearFilter',
                      'Release year'
                    )}
                    type="number"
                    min={1950}
                    max={2200}
                    value={filterDraft.releaseYear}
                    aria-invalid={!validReleaseYear}
                    onChange={(event) =>
                      setFilterDraft((current) => ({
                        ...current,
                        releaseYear: event.target.value,
                      }))
                    }
                  />
                </label>
              </>
            )}
          </div>
        )}
        {!isDatCatalog && !validReleaseYear && (
          <p className="note bad" role="alert">
            {t(
              'components.SoftwareCatalog.invalidReleaseYear',
              'Enter a release year from 1950 to 2200.'
            )}
          </p>
        )}
      </ExtraHeader>
      {/* the catalogue checks are still out, or none of them answered */}
      {checking ? (
        <GridSkeleton />
      ) : !cat ? (
        <ServiceNote
          error={t(
            'lumen.games.catalogueUnavailable',
            'None of the game catalogues answered.'
          )}
          what={t('lumen.games.catalogueWhat', 'games')}
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
              <b>{t('lumen.games.noGamesFound', 'No games found')}</b>
              {t('lumen.games.tryFullTitle', 'Try the game’s full title.')}
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
            stat={statOf(g, t)}
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
  const platform = p.get('platform') ?? '';
  return (
    <GameDetailView
      key={JSON.stringify([cat, id, dat, platform])}
      id={id}
      cat={cat}
      dat={dat}
      platform={platform}
    />
  );
}

function GameDetailView({
  id,
  cat,
  dat,
  platform,
}: {
  id: string;
  cat: GameCategory;
  dat: boolean;
  platform: string;
}) {
  const { user } = useAuth();
  const { locale, t } = useLumenLocale();
  const {
    data,
    error: loadError,
    reload,
  } = useApi<Game | { game: Game }>(
    `/request/software/catalog/games/${encodeURIComponent(id)}?category=${encodeURIComponent(cat)}${dat ? '&catalogProvider=dat' : ''}`
  );
  const game = unwrapCatalogGame(data);
  const g =
    game &&
    typeof game.title === 'string' &&
    Array.isArray(game.genres) &&
    Array.isArray(game.platforms) &&
    (game.emulationSystems === undefined ||
      Array.isArray(game.emulationSystems))
      ? game
      : null;
  const error =
    loadError || (data && !g ? 'Invalid game catalogue response.' : null);
  const toast = useToast();
  const [os, setOs] = useState('');
  const [arch, setArch] = useState('');
  const [system, setSystem] = useState(platform);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [done, setDone] = useState('');
  const [requestId, setRequestId] = useState<number>();
  const [libraryEntryId, setLibraryEntryId] = useState<number>();
  const [addingToLibrary, setAddingToLibrary] = useState(false);
  const [libraryFeedback, setLibraryFeedback] = useState('');
  const [libraryError, setLibraryError] = useState('');
  const libraryPending = useRef(false);
  const [selection, setSelection] = useState<
    GameContentSelection | null | undefined
  >(null);
  const libraryCatalogId =
    g?.catalogProvider === 'igdb' &&
    typeof g.igdbId === 'number' &&
    Number.isSafeInteger(g.igdbId) &&
    g.igdbId > 0 &&
    g.igdbId <= 2_147_483_647 &&
    ['game', 'retro', 'modern'].includes(cat)
      ? g.igdbId
      : undefined;
  const libraryLookupPath =
    user && libraryCatalogId
      ? `/game-library/lookup?category=${encodeURIComponent(cat)}&catalogId=${libraryCatalogId}`
      : null;
  const libraryLookup = useApi<{ entry: { id: number } | null }>(
    libraryLookupPath
  );
  if (error)
    return (
      <ExtraGate k="game">
        <ServiceNote
          what={t('lumen.games.gameWhat', 'this game')}
          error={error}
          retry={reload}
        />
      </ExtraGate>
    );
  if (!g) return <div className="detail-loading" aria-busy="true" />;
  const existingLibraryEntryId =
    libraryEntryId ?? libraryLookup.data?.entry?.id;
  const addToLibrary = async () => {
    if (!user || !libraryCatalogId || libraryPending.current) return;
    libraryPending.current = true;
    setAddingToLibrary(true);
    setLibraryError('');
    setLibraryFeedback('');
    try {
      const result = await api<{ entry: { id: number } }>('/game-library', {
        method: 'POST',
        body: JSON.stringify({ category: cat, catalogId: libraryCatalogId }),
      });
      if (!Number.isSafeInteger(result.entry?.id) || result.entry.id <= 0)
        throw new Error(
          t(
            'lumen.gameLibrary.couldNotAddGameToMyGames',
            'This game could not be added to My Games.'
          )
        );
      setLibraryEntryId(result.entry.id);
      setLibraryFeedback(
        t(
          'lumen.gameLibrary.addedAsPrivateBacklogGame',
          'Added as a private backlog game.'
        )
      );
      libraryLookup.reload();
    } catch (cause) {
      setLibraryError(
        friendlyError(
          cause,
          t(
            'lumen.gameLibrary.couldNotAddGameToMyGames',
            'This game could not be added to My Games.'
          ),
          t
        )
      );
    } finally {
      libraryPending.current = false;
      setAddingToLibrary(false);
    }
  };
  const s = statOf(g, t);
  const systems = (g.emulationSystems || []).filter((x) => x.group === cat);
  const sys = system
    ? (systems.find(({ slug }) => slug === system)?.slug ?? '')
    : (systems[0]?.slug ?? '');
  const patchSearch =
    (cat === 'retro' || cat === 'modern') && sys && (g.catalogId || id)
      ? new URLSearchParams({
          catalogKey: g.catalogId || id,
          platform: sys,
          category: cat,
          language: '',
          completeOnly: 'false',
        })
      : undefined;
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
        r.request.status === 'pending'
          ? t('lumen.games.waitingApproval', 'Waiting for approval')
          : t('lumen.status.requested', 'Requested')
      );
      setRequestId(r.request.id);
      toast(
        t('lumen.games.requestedTitle', 'Requested {title}', {
          title: g.title,
        })
      );
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      toast(
        m === 'SOFTWARE_QUOTA_EXCEEDED'
          ? t(
              'lumen.games.quotaReached',
              'You’ve reached your game request limit.'
            )
          : m || t('lumen.common.requestFailed', 'Request failed')
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const main = canUseRequestAccess(user?.permissions) ? (
    baseBlocked || done ? (
      <button className="btn btn-tonal" disabled>
        <Icon name={s?.ico || 'clock'} />
        {done || <StatLabel s={s} />}
      </button>
    ) : (
      <button
        className="btn btn-primary"
        disabled={!ready || busy}
        onClick={go}
      >
        <Icon name="plus" />
        {t('lumen.games.requestAction', 'Request')}
      </button>
    )
  ) : null;

  const screenshots = [
    ...new Set(
      (Array.isArray(g.screenshots) ? g.screenshots : [])
        .map(artUrl)
        .filter((url): url is string => !!url)
    ),
  ].slice(0, 6);
  const videos = (Array.isArray(g.videos) ? g.videos : []).filter(
    (video) =>
      video &&
      typeof video.videoId === 'string' &&
      /^[A-Za-z0-9_-]{11}$/.test(video.videoId)
  );
  const hours = (value: number | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0
      ? t('lumen.games.hoursValue', '{hours} h', {
          hours: new Intl.NumberFormat(locale, {
            maximumFractionDigits: 1,
          }).format(value),
        })
      : '';
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
            categoryLabel(cat, t),
            g.genres.slice(0, 3).join(', '),
          ]}
        />
        <div className="dbody">
          <div className="dstatus">
            <StatPill s={s} />
            <IndexerSearchLink category={cat} title={g.title} />
            {patchSearch && canUseRequestAccess(user?.permissions) && (
              <Link
                className="btn btn-quiet btn-sm"
                to={`/patches?${patchSearch}`}
              >
                {t(
                  'lumen.games.translationsForGame',
                  'Translations and Hacks for This Game'
                )}
              </Link>
            )}
            {cat === 'game' &&
              !dat &&
              typeof g.igdbId === 'number' &&
              Number.isSafeInteger(g.igdbId) &&
              g.igdbId > 0 &&
              canViewFollowing(user?.permissions) && (
                <FollowButton
                  label={t(
                    'lumen.followButton.followStoryExpansions',
                    'Follow Story Expansions'
                  )}
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
            {cat === 'game' && !dat && g.steamOwned && (
              <Pill k="neutral">
                {t('lumen.games.steamLibrary', 'Steam Library')}
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
                    <span className="lbl">
                      {t('lumen.games.systemLabel', 'System')}
                    </span>
                    <select value={os} onChange={(e) => setOs(e.target.value)}>
                      <option value="">
                        {t('lumen.games.chooseOption', 'Choose…')}
                      </option>
                      {PC_OS.map(([v, t]) => (
                        <option key={v} value={v}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="sel">
                    <span className="lbl">
                      {t('lumen.games.buildLabel', 'Build')}
                    </span>
                    <select
                      value={arch}
                      onChange={(e) => setArch(e.target.value)}
                    >
                      <option value="">
                        {t('lumen.games.chooseOption', 'Choose…')}
                      </option>
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
                  <span className="lbl">
                    {t('lumen.games.consoleLabel', 'Console')}
                  </span>
                  <select
                    value={sys}
                    onChange={(e) => setSystem(e.target.value)}
                  >
                    {!sys && (
                      <option value="">
                        {t('lumen.games.chooseConsole', 'Choose a console')}
                      </option>
                    )}
                    {systems.map((x) => (
                      <option key={x.slug} value={x.slug}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="note">
                  {cat === 'retro'
                    ? t(
                        'lumen.games.noRetroConsole',
                        'This game isn’t listed for any retro console this server supports.'
                      )
                    : t(
                        'lumen.games.noModernConsole',
                        'This game isn’t listed for any modern console this server supports.'
                      )}
                </p>
              )}
            </div>
          )}
          <div className="dacts pc">{main}</div>
          {user && libraryCatalogId && (
            <>
              <section
                className="setlist"
                aria-label={t(
                  'lumen.gameLibrary.privateGameLibrary',
                  'Private Game Library'
                )}
              >
                <div className="set">
                  <div>
                    <b>{t('lumen.gameLibrary.myGames', 'My Games')}</b>
                    <small>
                      {t(
                        'lumen.gameLibrary.privateGameLibraryDescription',
                        'Add it to your private game library, then track progress and choose whether to share it with your household.'
                      )}
                    </small>
                  </div>
                  <div className="toolbar">
                    <button
                      className="btn btn-quiet btn-sm"
                      disabled={
                        addingToLibrary ||
                        existingLibraryEntryId !== undefined ||
                        (!libraryLookup.data && !libraryLookup.error)
                      }
                      onClick={() => void addToLibrary()}
                    >
                      {addingToLibrary
                        ? t('lumen.gameLibrary.addingToMyGames', 'Adding…')
                        : existingLibraryEntryId !== undefined
                          ? t(
                              'lumen.gameLibrary.alreadyInMyGames',
                              'Already in My Games'
                            )
                          : !libraryLookup.data && !libraryLookup.error
                            ? t(
                                'lumen.gameLibrary.checkingMyGames',
                                'Checking My Games…'
                              )
                            : t(
                                'lumen.gameLibrary.addToMyGames',
                                'Add to My Games'
                              )}
                    </button>
                    {existingLibraryEntryId !== undefined && (
                      <Link className="chip" to={`/game-library?c=${cat}`}>
                        {t('lumen.gameLibrary.openMyGames', 'Open My Games')}
                      </Link>
                    )}
                  </div>
                </div>
                {libraryFeedback && (
                  <p className="note" role="status">
                    {libraryFeedback}
                  </p>
                )}
              </section>
              {libraryLookup.error && (
                <ServiceNote
                  error={libraryLookup.error}
                  title={t(
                    'lumen.gameLibrary.myGamesLookupFailure',
                    'Could not check My Games.'
                  )}
                  what={t('lumen.gameLibrary.myGames', 'My Games')}
                  retryLabel={t(
                    'lumen.gameLibrary.retryMyGamesCheck',
                    'Retry My Games Check'
                  )}
                  retry={libraryLookup.reload}
                />
              )}
              {libraryError && (
                <p className="note" role="alert">
                  {libraryError}
                </p>
              )}
            </>
          )}
          {typeof requestId === 'number' &&
            Number.isSafeInteger(requestId) &&
            requestId > 0 && (
              <div className="toolbar">
                <Link
                  className="chip"
                  to={`/requests?softwareRequestId=${requestId}`}
                >
                  {t('lumen.gameLibrary.requestHistory', 'Request History')}
                </Link>
              </div>
            )}
          <div className="dcols">
            <div style={{ display: 'grid', gap: 22 }}>
              {g.summary && <p className="ov">{g.summary}</p>}
              {!!screenshots.length && (
                <section
                  aria-label={t('lumen.games.screenshots', 'Screenshots')}
                >
                  <h3 className="tagline">
                    {t('lumen.games.screenshots', 'Screenshots')}
                  </h3>
                  <div className="shots">
                    {screenshots.map((u) => (
                      <img key={u} src={u} alt="" loading="lazy" />
                    ))}
                  </div>
                </section>
              )}
              {!!videos.length && (
                <section aria-label={t('lumen.games.videos', 'Videos')}>
                  <h3 className="tagline">
                    {t('lumen.games.videos', 'Videos')}
                  </h3>
                  <nav
                    className="toolbar"
                    aria-label={t('lumen.games.videos', 'Videos')}
                  >
                    {videos.map((video) => (
                      <a
                        key={video.videoId}
                        className="chip"
                        href={`https://www.youtube.com/watch?v=${video.videoId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t('lumen.games.watchVideo', 'Watch {name}', {
                          name:
                            typeof video.name === 'string' && video.name.trim()
                              ? video.name.trim()
                              : t('lumen.games.gameVideo', 'Game video'),
                        })}
                      </a>
                    ))}
                  </nav>
                </section>
              )}
            </div>
            <aside>
              <Facts
                rows={[
                  [t('lumen.games.released', 'Released'), g.releaseDate],
                  [
                    t('lumen.games.developer', 'Developer'),
                    g.developers?.join(', '),
                  ],
                  [
                    t('lumen.games.publisher', 'Publisher'),
                    g.publishers?.join(', '),
                  ],
                  [
                    t('lumen.games.platforms', 'Platforms'),
                    g.platforms.slice(0, 6).join(', '),
                  ],
                  [
                    t('lumen.games.quickFinish', 'Quick Finish'),
                    hours(g.timeToBeat?.hastily),
                  ],
                  [
                    t('lumen.games.mainStory', 'Main Story'),
                    hours(g.timeToBeat?.normally),
                  ],
                  [
                    t('lumen.games.completionist', 'Completionist'),
                    hours(g.timeToBeat?.completely),
                  ],
                ]}
              />
            </aside>
          </div>
        </div>
        <div className="actionbar">
          <span className="ab-meta">
            <b>{g.title}</b>
            {categoryLabel(cat, t)}
          </span>
          {main}
        </div>
      </article>
    </ExtraGate>
  );
}

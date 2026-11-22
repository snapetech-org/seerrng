import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { artUrl, kavitaLink, MediaStatus } from '../api';
import { useAuth } from '../auth';
import BlocklistButton from '../components/BlocklistButton';
import {
  GridSkeleton,
  MoreOnScroll,
  Rail,
  RailSkeleton,
  Section,
  shortDate,
  StatLabel,
} from '../components/cards';
import {
  ComicCard,
  editionLabel,
  requestComicEdition,
} from '../components/comics';
import { ConfirmSheet } from '../components/ConfirmSheet';
import {
  canChooseRequestOptions,
  canRequestComic,
  DetailTop,
  Facts,
  Pill,
} from '../components/detail';
import {
  comicState,
  ExtraGate,
  ExtraHeader,
  ExtraSearch,
  extraStat,
  MagazineCard,
  ServiceNote,
  StatPill,
} from '../components/extra';
import { GenrePicker } from '../components/GenrePicker';
import IndexerSearchLink from '../components/IndexerSearchLink';
import ReaderDeliveryLink from '../components/ReaderDeliveryLink';
import ReaderShelf from '../components/ReaderShelf';
import ReportIssueButton from '../components/ReportIssueButton';
import { ReaderDownloads } from '../components/RequestFiles';
import { useToast } from '../components/toast';
import WatchlistButton from '../components/WatchlistButton';
import { friendlyError } from '../errors';
import {
  editionLine,
  plainText,
  requestExtra,
  type Comic,
  type ComicIssue,
  type ComicLanding,
  type ComicWork,
  type Magazine,
} from '../extras';
import { useApi, usePaged } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { usePrefs } from '../settings';

// the search box writes ?q= after a pause, so typing doesn't fire a request per letter
const MANGA_SORTS = [
  ['popular', 'Popular'],
  ['trending', 'Trending'],
  ['newest', 'Newest'],
  ['title', 'A–Z'],
] as const;
const COMIC_SORTS = [
  ['issues', 'Most issues'],
  ['newest', 'Newest'],
  ['title', 'A–Z'],
] as const;

const DEFAULT_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
];

// a row of comic cards, or its placeholder while the page loads
function ComicRail({
  title,
  works,
  loading,
  link,
}: {
  title: string;
  works?: ComicWork[];
  loading: boolean;
  link?: [string, string];
}) {
  if (!loading && !works?.length) return null;
  return (
    <Section title={title} link={link}>
      {works?.length ? (
        <Rail>
          {works.map((w) => (
            <ComicCard key={w.id} w={w} />
          ))}
        </Rail>
      ) : (
        <RailSkeleton />
      )}
    </Section>
  );
}

// owned, wholly or in part: the same test as the In library list
const inLibrary = (w: ComicWork) =>
  w.mediaInfo?.status === MediaStatus.AVAILABLE ||
  w.mediaInfo?.status === MediaStatus.PARTIAL;

interface ComicCatalogueStatus {
  comicVineConfigured?: boolean;
  indexing?: boolean;
  indexedResults?: number;
  expectedResults?: number;
  indexError?: string;
}

const CATALOGUE_RECHECK_MS = 15_000;

const COMIC_CATALOG_FIELDS = [
  { key: 'query', label: 'Title', maxLength: 256 },
  { key: 'publisher', label: 'Publisher', maxLength: 128 },
  { key: 'startYear', label: 'Start Year', min: 1800, max: 2200 },
  { key: 'minIssues', label: 'Minimum Issues', min: 0, max: 100000 },
  { key: 'maxIssues', label: 'Maximum Issues', min: 0, max: 100000 },
] as const;

function catalogComicWork(volume: Comic | ComicWork): ComicWork {
  if ('editions' in volume) return volume;
  return {
    ...volume,
    kind: volume.manga ? 'manga' : 'comic',
    editions: [volume],
    editionsResolved: true,
    recommendedId: String(volume.id),
    id: String(volume.id),
  };
}

// ---- comics and manga: manga from AniList, Western comics from ComicVine; one card per
// work with its editions inside; searching is the top search bar's job ----
export function Comics() {
  const { t } = useLumenLocale();
  const [p, setP] = useSearchParams();
  const type = (['manga', 'comic'] as const).find((t) => t === p.get('type'));
  // All / In library / Not yet, as on Books: Not yet is the browse feed minus owned works
  const show = (['library', 'not'] as const).find((s) => s === p.get('show'));
  const picked = (p.get('genre') || '').split(',').filter(Boolean);
  const status = p.get('status') || '';
  const catalogFilters = new URLSearchParams();
  for (const { key } of COMIC_CATALOG_FIELDS) {
    const value = p.get(key)?.trim();
    if (value) catalogFilters.set(key, value);
  }
  // The Western browse publisher dropdown uses the curated browse endpoint.
  const catalogMode =
    p.has('catalog') ||
    COMIC_CATALOG_FIELDS.some(
      ({ key }) => key !== 'publisher' && catalogFilters.has(key)
    ) ||
    (!type && catalogFilters.has('publisher'));
  const catalogQuery = new URLSearchParams(catalogFilters);
  if (catalogQuery.size === 1 && catalogQuery.has('query'))
    catalogQuery.set('group', 'works');
  const catalog = usePaged<Comic | ComicWork, ComicCatalogueStatus>(
    catalogMode ? `/discover/comics?${catalogQuery}` : null
  );
  const catalogueStatus = catalogMode ? catalog.firstPage : undefined;
  const indexing = catalogueStatus?.indexing === true;
  const { recheckEmptyFirstPage } = catalog;
  useEffect(() => {
    if (!indexing || catalog.page !== 1) return;
    const timer = setTimeout(recheckEmptyFirstPage, CATALOGUE_RECHECK_MS);
    return () => clearTimeout(timer);
  }, [indexing, catalog.page, recheckEmptyFirstPage]);
  const publisher = p.get('publisher') || '';
  const sort = p.get('sort') || '';
  const filtered = !!(
    catalogMode ||
    type ||
    show ||
    picked.length ||
    status ||
    sort
  );
  const landing = useApi<ComicLanding>('/discover/comics/landing');
  const genres = landing.data?.genres?.length
    ? landing.data.genres
    : DEFAULT_GENRES;
  const publishers = landing.data?.publishers || [];
  const kind = type || 'manga';
  const q = new URLSearchParams({ type: kind });
  if (show === 'library') {
    q.set('show', show);
    if (!type) q.delete('type');
  }
  if (sort) q.set('sort', sort);
  if (kind === 'manga' && picked.length) q.set('genre', picked.join(','));
  if (kind === 'manga' && status) q.set('status', status);
  if (kind === 'comic' && publisher) q.set('publisher', publisher);
  const browse = usePaged<ComicWork>(
    catalogMode ? null : `/discover/comics/browse?${q}`
  );
  const list = catalogMode
    ? { ...catalog, items: catalog.items.map(catalogComicWork) }
    : browse;
  // a work can come back on a later page too
  const seen = new Set<string>();
  const items = list.items.filter((w) =>
    seen.has(w.id)
      ? false
      : (seen.add(w.id), !(!catalogMode && show === 'not' && inLibrary(w)))
  );
  // Not yet: a page can be all owned works; fetch on until something shows or the feed ends
  const hiddenPage =
    !catalogMode &&
    show === 'not' &&
    !items.length &&
    list.page > 0 &&
    !list.done &&
    !list.loading &&
    !list.error;
  useEffect(() => {
    if (hiddenPage) list.more();
  }, [hiddenPage, list]);
  const upd = (changes: Record<string, string | null>) => {
    const n = new URLSearchParams(p);
    for (const [k, v] of Object.entries(changes)) {
      if (v) n.set(k, v);
      else n.delete(k);
    }
    setP(n, { replace: true });
  };
  // genre, status and these sorts only exist for manga: picking one from All shows manga
  const mangaOnly = (changes: Record<string, string | null>) =>
    upd({ ...changes, ...(type ? {} : { type: 'manga' }) });
  const noKey = landing.data?.comicVineConfigured === false;
  const sorts = (kind === 'comic' ? COMIC_SORTS : MANGA_SORTS).map(
    ([value, label]) => [value, t(`lumen.comics.sort.${value}`, label)] as const
  );
  const gridTitle = catalogMode
    ? t('lumen.comics.catalogue', 'Comics Catalogue')
    : show === 'library'
      ? t('lumen.comics.libraryGrid', 'In your library')
      : show === 'not'
        ? t('lumen.comics.notYetGrid', 'Not in your library yet')
        : kind === 'comic'
          ? t('lumen.comics.western', 'Western comics')
          : picked.length || status || sort
            ? t('lumen.comics.manga', 'Manga')
            : t('lumen.comics.popularManga', 'Popular manga');

  return (
    <ExtraGate k="comic">
      <ExtraHeader
        title={t('lumen.comics.title', 'Comics and Manga')}
        sub={t(
          'lumen.comics.guidance',
          'Request manga or comic series. New volumes and issues arrive as they are released; manga uses its English edition unless you choose another.'
        )}
      >
        <Link className="search search-ph" to="/search?f=comic">
          <Icon name="search" />
          <span className="ph-text">
            {t('lumen.comics.search', 'Search comics and manga…')}
          </span>
        </Link>
      </ExtraHeader>
      {noKey && (
        <div className="empty">
          <b>
            {t(
              'components.Discover.DiscoverComics.noComicVineKey',
              'Comic discovery requires a ComicVine API key configured in settings.'
            )}
          </b>
          {t(
            'lumen.comics.keyHelp',
            'An admin can add one in SeerrNG under Settings › General. You can still browse manga.'
          )}
        </div>
      )}
      {!catalogMode && (
        <div className="toolbar">
          <div
            className="seg"
            role="group"
            aria-label={t('lumen.comics.type', 'Type')}
          >
            {(
              [
                ['', t('lumen.comics.all', 'All')],
                ['manga', t('lumen.comics.manga', 'Manga')],
                [
                  'comic',
                  t('components.Discover.DiscoverComics.comics', 'Comics'),
                ],
              ] as const
            ).map(([v, t]) => (
              <button
                key={v || 'all'}
                aria-pressed={(type || '') === v}
                onClick={() =>
                  upd({
                    type: v || null,
                    sort: null,
                    // manga filters don't apply to Western comics and back
                    ...(v === 'comic' ? { genre: null, status: null } : {}),
                    ...(v !== 'comic' ? { publisher: null } : {}),
                  })
                }
              >
                {t}
              </button>
            ))}
          </div>
          <div
            className="seg"
            role="group"
            aria-label={t('lumen.comics.library', 'Library')}
          >
            {(
              [
                ['', t('lumen.comics.all', 'All')],
                ['library', t('lumen.comics.inLibrary', 'In library')],
                ['not', t('lumen.comics.notYet', 'Not yet')],
              ] as const
            ).map(([v, t]) => (
              <button
                key={v || 'all'}
                aria-pressed={(show || '') === v}
                onClick={() => upd({ show: v || null })}
              >
                {t}
              </button>
            ))}
          </div>
          {show !== 'library' && (
            <label className="sel">
              <span className="lbl">{t('lumen.comics.sort', 'Sort')}</span>
              <select
                value={sort || sorts[0][0]}
                onChange={(e) =>
                  kind === 'comic'
                    ? upd({
                        sort:
                          e.target.value === 'issues' ? null : e.target.value,
                      })
                    : mangaOnly({
                        sort:
                          e.target.value === 'popular' && type
                            ? null
                            : e.target.value,
                      })
                }
              >
                {sorts.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === 'manga' && show !== 'library' && (
            <label className="sel">
              <span className="lbl">{t('lumen.comics.status', 'Status')}</span>
              <select
                value={status}
                onChange={(e) => mangaOnly({ status: e.target.value || null })}
              >
                <option value="">{t('lumen.comics.any', 'Any')}</option>
                <option value="ongoing">
                  {t('lumen.comics.ongoing', 'Ongoing')}
                </option>
                <option value="finished">
                  {t('lumen.comics.finished', 'Finished')}
                </option>
              </select>
            </label>
          )}
          {kind === 'comic' && !!publishers.length && (
            <label className="sel">
              <span className="lbl">
                {t('components.Discover.DiscoverComics.publisher', 'Publisher')}
              </span>
              <select
                value={publisher}
                onChange={(e) => upd({ publisher: e.target.value || null })}
              >
                <option value="">{t('lumen.comics.all', 'All')}</option>
                {publishers.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === 'manga' && (
            <GenrePicker
              options={genres.map((g) => ({ value: g, label: g }))}
              picked={picked}
              // a genre narrows All to manga; All genres only clears the genres
              onChange={(next) =>
                next.length
                  ? mangaOnly({ genre: next.join(',') })
                  : upd({ genre: null })
              }
            />
          )}
        </div>
      )}
      <details className="adv more-filters" open={catalogMode || undefined}>
        <summary>
          {t('lumen.comics.searchCatalogue', 'Search the Comics Catalogue')}
        </summary>
        <div className="filter-grid">
          <form
            className="toolbar range-filter"
            aria-label={t(
              'lumen.comics.catalogueFilters',
              'Comics Catalogue Filters'
            )}
            key={catalogFilters.toString()}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const next = new URLSearchParams({ catalog: '1' });
              for (const { key } of COMIC_CATALOG_FIELDS) {
                const value = String(data.get(key) ?? '').trim();
                if (value) next.set(key, value);
              }
              setP(next, { replace: true });
            }}
          >
            {COMIC_CATALOG_FIELDS.map((field) => (
              <label className="sel" key={field.key}>
                <span className="lbl">
                  {field.key === 'query'
                    ? t(
                        'components.Discover.DiscoverComics.search',
                        field.label
                      )
                    : field.key === 'publisher'
                      ? t(
                          'components.Discover.DiscoverComics.publisher',
                          field.label
                        )
                      : field.key === 'startYear'
                        ? t(
                            'components.Discover.DiscoverComics.startYear',
                            field.label
                          )
                        : field.key === 'minIssues'
                          ? t(
                              'components.Discover.DiscoverComics.minIssues',
                              field.label
                            )
                          : field.key === 'maxIssues'
                            ? t(
                                'components.Discover.DiscoverComics.maxIssues',
                                field.label
                              )
                            : ''}
                </span>
                <input
                  className="cfg-input"
                  type={'min' in field ? 'number' : 'search'}
                  name={field.key}
                  defaultValue={catalogFilters.get(field.key) ?? ''}
                  min={'min' in field ? field.min : undefined}
                  max={'max' in field ? field.max : undefined}
                  maxLength={'maxLength' in field ? field.maxLength : undefined}
                />
              </label>
            ))}
            <button type="submit" className="btn btn-tonal btn-sm">
              <span aria-hidden="true">
                {t(
                  'components.Discover.DiscoverComics.applyFilters',
                  'Apply filters'
                )}
              </span>
              <span className="sr-only">
                {t(
                  'components.Discover.DiscoverComics.searchComics',
                  'Search Comics'
                )}
              </span>
            </button>
            {catalogMode && (
              <button
                type="button"
                className="chip"
                onClick={() => setP({}, { replace: true })}
              >
                {t('lumen.comics.back', 'Back to Comics and Manga')}
              </button>
            )}
          </form>
        </div>
      </details>
      {!filtered && (
        <>
          <ComicRail
            title={t('lumen.comics.yourLibrary', 'Your comics and manga')}
            works={landing.data?.library}
            loading={false}
            link={[t('lumen.comics.seeAll', 'See all'), '/comics?show=library']}
          />
          <ComicRail
            title={t('lumen.comics.trendingManga', 'Trending manga')}
            works={landing.data?.trending}
            loading={!landing.data && !landing.error}
            link={[
              t('lumen.comics.seeAll', 'See all'),
              '/comics?type=manga&sort=trending',
            ]}
          />
          <ComicRail
            title={t('lumen.comics.newManga', 'New manga')}
            works={landing.data?.newest}
            loading={!landing.data && !landing.error}
            link={[
              t('lumen.comics.seeAll', 'See all'),
              '/comics?type=manga&sort=newest',
            ]}
          />
          <ComicRail
            title={t('lumen.comics.western', 'Western comics')}
            works={landing.data?.western}
            loading={false}
            link={[t('lumen.comics.seeAll', 'See all'), '/comics?type=comic']}
          />
        </>
      )}
      <section>
        <div className="sec-head">
          <h2>{gridTitle}</h2>
        </div>
        {list.error && !items.length && (
          <ServiceNote error={list.error} what="comics" retry={list.retry} />
        )}
        {indexing && (
          <div className="empty" role="status">
            <b>
              {t(
                'components.Discover.DiscoverComics.indexing',
                'Building comic index'
              )}
            </b>
            {typeof catalogueStatus.indexedResults === 'number' &&
              (catalogueStatus.expectedResults
                ? t(
                    'lumen.comics.indexedOf',
                    '{indexed} of {expected} volumes indexed.',
                    {
                      indexed: catalogueStatus.indexedResults,
                      expected: catalogueStatus.expectedResults,
                    }
                  )
                : t('lumen.comics.indexed', '{indexed} volumes indexed.', {
                    indexed: catalogueStatus.indexedResults,
                  }))}
            {catalogueStatus.indexError &&
              ` ${t('components.Discover.DiscoverComics.indexingRetry', 'The index is retrying after a provider response. Already indexed volumes are saved.')}`}
            <button
              className="btn btn-tonal btn-sm"
              type="button"
              onClick={recheckEmptyFirstPage}
              disabled={catalog.loading || catalog.page === 0}
            >
              {t('lumen.comics.checkAgain', 'Check again')}
            </button>
          </div>
        )}
        {!indexing &&
          !list.error &&
          !items.length &&
          !list.loading &&
          list.page > 0 &&
          (catalogMode || show !== 'not' || list.done) && (
            <div className="empty">
              {catalogueStatus?.comicVineConfigured === false ? (
                <b>
                  {t(
                    'components.Discover.DiscoverComics.noComicVineKey',
                    'Comic discovery requires a ComicVine API key configured in settings.'
                  )}
                </b>
              ) : catalogMode ? (
                <>
                  <>
                    <b>{t('lumen.comics.noComics', 'No comics found')}</b>
                    {t(
                      'lumen.comics.tryFilters',
                      'Try different filters or check whether the catalogue has finished indexing.'
                    )}
                  </>
                </>
              ) : show === 'library' ? (
                <>
                  <>
                    <b>
                      {t(
                        'lumen.comics.libraryEmpty',
                        'Nothing in the library yet'
                      )}
                    </b>
                    {t(
                      'lumen.comics.requestSeries',
                      'Request a series and it will show up here.'
                    )}
                  </>
                </>
              ) : show === 'not' ? (
                <>
                  <>
                    <b>{t('lumen.comics.allOwned', 'You have all of these')}</b>
                    {t(
                      'lumen.comics.tryGenre',
                      'Try another genre, or switch to All.'
                    )}
                  </>
                </>
              ) : kind === 'comic' ? (
                <>
                  <>
                    <b>
                      {t(
                        'lumen.comics.cataloguing',
                        'Western comics are still being catalogued'
                      )}
                    </b>
                    {t(
                      'lumen.comics.cataloguingHint',
                      'SeerrNG is reading ComicVine’s catalogue in the background. Use search to find a series meanwhile.'
                    )}
                  </>
                </>
              ) : (
                <>
                  <>
                    <b>{t('lumen.comics.nothingHere', 'Nothing here')}</b>
                    {t(
                      'lumen.comics.tryGenre',
                      'Try another genre, or switch to All.'
                    )}
                  </>
                </>
              )}
            </div>
          )}
        {list.loading && !items.length && list.page === 0 && (
          <GridSkeleton className="comic-grid grid" />
        )}
        <div className="comic-grid grid">
          {items.map((w) => (
            <ComicCard key={w.id} w={w} />
          ))}
        </div>
        <MoreOnScroll
          done={list.done}
          loading={list.loading}
          more={list.more}
          error={list.error}
          retry={list.retry}
        />
      </section>
    </ExtraGate>
  );
}

// the chosen edition's volumes or issues, as ComicVine lists them
function ComicIssues({ id, manga }: { id: string; manga: boolean }) {
  const issues = usePaged<ComicIssue>(`/comic/${id}/issues`);
  if (!issues.items.length)
    return issues.error ? (
      <div>
        <div className="h2">{manga ? 'Volumes' : 'Issues'}</div>
        <ServiceNote
          error={issues.error}
          what={manga ? 'the volumes' : 'the issues'}
          retry={issues.retry}
        />
      </div>
    ) : null;
  return (
    <div>
      <div className="h2">{manga ? 'Volumes' : 'Issues'}</div>
      <ol className="slist tlist">
        {issues.items.map((i) => (
          <li key={i.id} className="trow">
            <span className="tn">#{i.issueNumber || '?'}</span>
            <span>
              <b>
                {i.name || `${manga ? 'Volume' : 'Issue'} #${i.issueNumber}`}
              </b>
              {i.coverDate && (
                <small>
                  {shortDate(i.coverDate, false)}, {i.coverDate.slice(0, 4)}
                </small>
              )}
            </span>
            <span />
          </li>
        ))}
      </ol>
      <MoreOnScroll
        done={issues.done}
        loading={issues.loading}
        more={issues.more}
        error={issues.error}
        retry={issues.retry}
      />
    </div>
  );
}

// ---- one work: its editions to choose from (English recommended), then the chosen
// edition's description and volumes ----
export function ComicDetail() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { kavitaUrl } = usePrefs();
  const {
    data: work,
    error: workError,
    reload,
    refresh,
  } = useApi<ComicWork>(`/comic/work/${encodeURIComponent(id)}`, {
    currentPathOnly: true,
    keepDuringRefresh: true,
  });
  const [pick, setPick] = useState<string | null>(null);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const { user } = useAuth();
  const mayRequest = canRequestComic(user?.permissions);
  const [busy, setBusy] = useState(false);
  // set at once, unlike busy: a double tap can't send the request twice
  const sending = useRef(false);
  useEffect(() => setPick(null), [id]);
  // #editions (from a card's "Choose edition") scrolls to the picker once it's there
  const workLoaded = !!work;
  useEffect(() => {
    if (workLoaded && window.location.hash === '#editions')
      document.getElementById('editions')?.scrollIntoView({ block: 'start' });
  }, [id, workLoaded]);
  const editions = work?.editions || [];
  const stateOf = (editionId: string) => {
    const e = editions.find((x) => x.id === editionId);
    const st = comicState(e?.mediaInfo).stat;
    return asked.has(editionId) && !st
      ? ({ k: 'wait', word: 'Requested', ico: 'clock' } as const)
      : st;
  };
  const chosenId =
    pick ??
    (work?.mediaEditionId && editions.some((e) => e.id === work.mediaEditionId)
      ? work.mediaEditionId
      : work?.recommendedId) ??
    editions[0]?.id;
  const chosen = editions.find((e) => e.id === chosenId);
  const { data: edition, refresh: refreshEdition } = useApi<Comic>(
    chosen ? `/comic/${chosen.id}` : null
  );
  const c = edition?.id === chosen?.id ? edition : undefined;
  // Keep queue progress tied to the selected edition.
  const shown = chosen
    ? (chosen.mediaInfo ??
      (chosen.id === work?.mediaEditionId ? work?.mediaInfo : undefined))
    : work?.mediaInfo;
  const trackDownload =
    shown?.status === MediaStatus.PENDING ||
    shown?.status === MediaStatus.PROCESSING ||
    (shown?.status === MediaStatus.PARTIAL && !!shown.downloadStatus?.length);
  useEffect(() => {
    if (!trackDownload) return;
    // The server's Download Sync job updates these provider queues once a minute.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [id, chosenId, trackDownload, refresh]);
  if (workError)
    return (
      <ExtraGate k="comic">
        <ServiceNote error={workError} what="this comic" retry={reload} />
      </ExtraGate>
    );
  if (!work) return <div className="detail-loading" aria-busy="true" />;
  const manga = work.kind === 'manga';
  const unit = manga ? 'vol' : 'issue';
  const cs = comicState(shown);
  const s = chosen ? stateOf(chosen.id) : cs.stat;
  const about = work.description
    ? work.description
        .split(/\n+/)
        .map((t) => t.trim())
        .filter(Boolean)
    : plainText(c?.description);
  const request = async () => {
    if (!mayRequest || !chosen || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      toast(await requestComicEdition(work, chosen));
      setAsked((x) => new Set(x).add(chosen.id));
      refresh();
    } catch (e) {
      toast(friendlyError(e, 'Request failed'));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  // in the library: complete opens it in Kavita; part of it keeps its state and offers
  // the reader as well. No Kavita link: no button
  const readHref = kavitaLink(shown?.readerUrl, kavitaUrl);
  const complete = s?.k === 'ok' && shown?.status === MediaStatus.AVAILABLE;
  const read = readHref ? (
    <a
      className={`btn ${complete ? 'btn-primary' : 'btn-quiet'}`}
      href={readHref}
      target="_blank"
      rel="noopener"
    >
      <Icon name="book" />
      Read in Kavita
    </a>
  ) : null;
  const alsoRead = complete ? null : read;
  const main =
    c?.mediaInfo?.status === MediaStatus.BLOCKLISTED ? (
      <button className="btn btn-tonal" disabled>
        Blocklisted
      </button>
    ) : !chosen ? (
      <button className="btn btn-tonal" disabled>
        <Icon name="clock" />
        {work.editionsResolved
          ? 'No edition to request yet'
          : 'Looking up editions…'}
      </button>
    ) : complete && read ? (
      read
    ) : s ? (
      <button className="btn btn-tonal" disabled>
        <Icon name={s.ico} />
        <StatLabel s={s} />
      </button>
    ) : !mayRequest ? null : (
      <button className="btn btn-primary" disabled={busy} onClick={request}>
        <Icon name="plus" />
        {editions.length > 1
          ? `Request · ${editionLabel(chosen)}`
          : manga
            ? 'Request manga'
            : 'Request series'}
      </button>
    );
  return (
    <ExtraGate k="comic">
      <article className="detail">
        <DetailTop
          status={s}
          poster={artUrl(work.posterPath)}
          whole
          title={work.title}
          line={[
            work.startYear,
            manga ? 'Manga' : 'Comic',
            chosen?.publisher || work.publisher,
            chosen?.issueCount ? `${chosen.issueCount} ${unit}s` : '',
          ]}
        />
        <div className="dbody">
          <div className="dstatus">
            <StatPill s={s} />
            {cs.detail && <span className="dnote">{cs.detail}</span>}
            {(work.genres || []).slice(0, 4).map((g) => (
              <Pill key={g} k="neutral">
                {g}
              </Pill>
            ))}
            <IndexerSearchLink
              category="comic"
              title={chosen?.title || work.title}
            />
            <BlocklistButton
              mediaType="comic"
              id={c?.id}
              requestedId={chosen?.id}
              title={c?.title}
              onChange={() => {
                refreshEdition();
                reload();
              }}
            />
            {chosen && (
              <ReaderShelf
                key={`reader-shelf:${chosen.id}`}
                target={{
                  type: 'comic-series',
                  id: chosen.id,
                  name: chosen.title,
                }}
              />
            )}
            <ReaderDeliveryLink target="comic" />
            <ReaderDownloads
              mediaId={chosen ? shown?.id : undefined}
              type="comic"
            />
            <ReportIssueButton
              key={`report-issue:${chosen?.id}`}
              type="comic"
              title={c?.title ?? work.title}
              media={c?.mediaInfo}
            />
            {c && chosen && (
              <WatchlistButton
                key={`watchlist:${chosen.id}`}
                mediaType="comic"
                detail={c}
                requestedId={chosen.id}
              />
            )}
          </div>
          {alsoRead && <div className="dacts ph">{alsoRead}</div>}
          {cs.pct != null && (
            <div
              className="progress"
              role="progressbar"
              aria-label="Download progress"
              aria-valuenow={cs.pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: `${cs.pct}%` }} />
            </div>
          )}
          <div className="dcols">
            <div style={{ display: 'grid', gap: 22 }}>
              {c?.deck && !work.description && (
                <p className="tagline">{c.deck}</p>
              )}
              {about.slice(0, 4).map((t, i) => (
                <p key={i} className="ov">
                  {t}
                </p>
              ))}
              <div id="editions">
                <div className="sec-head">
                  <h2>
                    {editions.length > 1 ? 'Choose an edition' : 'Edition'}
                  </h2>
                  <span className="note">
                    {editions.length > 1 ? `${editions.length} editions` : ''}
                  </span>
                </div>
                {!editions.length && (
                  <p className="note">
                    {work.editionsResolved
                      ? 'ComicVine has no edition of this series yet, so it can’t be requested.'
                      : 'Couldn’t look up the editions right now. Try again in a minute.'}
                  </p>
                )}
                {!!editions.length && (
                  <div
                    className="nlist"
                    role="radiogroup"
                    aria-label="Editions"
                  >
                    {editions.map((e) => {
                      const st = stateOf(e.id);
                      const on = chosenId === e.id;
                      return (
                        <div
                          key={e.id}
                          className={`nrow ${st?.k === 'ok' ? 'owned' : ''}`}
                          role="radio"
                          aria-checked={on}
                          tabIndex={0}
                          onClick={() => setPick(e.id)}
                          onKeyDown={(ev) => {
                            if (ev.key === ' ' || ev.key === 'Enter') {
                              ev.preventDefault();
                              setPick(e.id);
                            }
                          }}
                        >
                          <span className="radio">
                            {st?.k === 'ok' && <Icon name="check" />}
                          </span>
                          <span className="nart">
                            {e.posterPath ? (
                              <img
                                src={artUrl(e.posterPath)}
                                referrerPolicy="no-referrer"
                                alt=""
                                loading="lazy"
                              />
                            ) : (
                              <Icon name="comic" />
                            )}
                          </span>
                          <span>
                            <div className="who">
                              {e.languageName || e.publisher || e.title}
                              {e.languageName && e.publisher && (
                                <small> · {e.publisher}</small>
                              )}
                            </div>
                            <div className="det">
                              {[
                                e.title !== work.title ? e.title : '',
                                e.startYear,
                                e.issueCount
                                  ? `${e.issueCount} ${unit}${e.issueCount === 1 ? '' : 's'}`
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' · ') || editionLine(e, unit)}
                            </div>
                            <div className="tags">
                              {e.recommended && (
                                <span className="tag rec">
                                  <Icon name="star" />
                                  Recommended
                                </span>
                              )}
                              {st?.k === 'ok' && (
                                <span className="tag own">
                                  <Icon name="check" />
                                  <StatLabel s={st} />
                                </span>
                              )}
                              {st && st.k !== 'ok' && (
                                <span className="tag wait">
                                  <Icon name={st.ico} />
                                  <StatLabel s={st} />
                                </span>
                              )}
                            </div>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="dacts pc">
                {main}
                {alsoRead}
              </div>
              {chosen && <ComicIssues id={chosen.id} manga={manga} />}
            </div>
            <aside>
              <Facts
                rows={[
                  [
                    'Type',
                    manga
                      ? chosen?.languageName
                        ? `Manga, ${chosen.languageName} edition`
                        : 'Manga'
                      : chosen?.languageName &&
                          chosen.languageName !== 'English'
                        ? `Comic, ${chosen.languageName} edition`
                        : 'Comic',
                  ],
                  ['Publisher', chosen?.publisher || work.publisher],
                  ['Started', chosen?.startYear || work.startYear],
                  [
                    manga ? 'Volumes' : 'Issues',
                    chosen?.issueCount ? String(chosen.issueCount) : '',
                  ],
                  [
                    'Status',
                    work.status === 'ongoing'
                      ? 'Ongoing'
                      : work.status === 'finished'
                        ? 'Finished'
                        : work.status === 'hiatus'
                          ? 'On hiatus'
                          : work.status === 'cancelled'
                            ? 'Cancelled'
                            : '',
                  ],
                  [
                    'In library',
                    chosen?.mediaInfo?.comicProgress?.total
                      ? `${Math.min(chosen.mediaInfo.comicProgress.owned, chosen.mediaInfo.comicProgress.total)} of ${chosen.mediaInfo.comicProgress.total}`
                      : '',
                  ],
                ]}
              />
            </aside>
          </div>
        </div>
        <div className="actionbar">
          <span className="ab-meta">
            <b>{work.title}</b>
            {chosen ? editionLabel(chosen) : work.publisher}
          </span>
          {main}
        </div>
      </article>
    </ExtraGate>
  );
}

// ---- magazines: the tracked list from LazyLibrarian, or a Google Books search ----
const MAGAZINE_SEARCH_SUGGESTIONS = [
  'National Geographic',
  'Time',
  'Vogue',
  'The New Yorker',
  'Scientific American',
  'Wired',
];

function hasMagazinePermission(permissions: number, mask: bigint) {
  return (
    Number.isSafeInteger(permissions) &&
    permissions >= 0 &&
    (BigInt(permissions) & mask) !== 0n
  );
}

function canRequestMagazines(permissions = 0) {
  // Admin, Request, or Request Magazines.
  return hasMagazinePermission(permissions, 2n | 32n | (1n << 41n));
}

function MagazineRequestSheet({
  requestTitle,
  onClose,
  onRequested,
}: {
  requestTitle: string;
  onClose: () => void;
  onRequested: () => void;
}) {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const activeRequest = useRef(false);
  const permissions = user?.permissions ?? 0;
  const quota = useApi<{
    magazine?: {
      limit?: number;
      remaining?: number;
      days?: number;
      restricted: boolean;
    };
  }>(user?.id ? `/user/${user.id}/quota` : null, { currentPathOnly: true });
  const existing = useApi<Magazine>(
    `/magazine/${encodeURIComponent(requestTitle)}`,
    { currentPathOnly: true }
  );
  const media = existing.data?.mediaInfo;
  const available =
    media?.status === MediaStatus.AVAILABLE ||
    media?.status === MediaStatus.PARTIAL;
  const blocked = media?.status === MediaStatus.BLOCKLISTED;
  const covered =
    media?.status === MediaStatus.PROCESSING ||
    media?.status === MediaStatus.PENDING ||
    media?.hasActiveRequest ||
    media?.requests?.some(({ status }) => status === 1 || status === 2);
  const unavailable = existing.data?.requestable === false;
  const requestStatus = available
    ? t('lumen.magazineRequest.alreadyAvailable', 'Already in the Library')
    : blocked
      ? t('lumen.magazineRequest.blocklisted', 'This Magazine Is Blocklisted')
      : covered
        ? t(
            'lumen.magazineRequest.alreadyRequested',
            'This Magazine Has Already Been Requested'
          )
        : unavailable
          ? t(
              'lumen.magazineRequest.unavailable',
              'This Magazine Is Unavailable for Requests'
            )
          : undefined;
  const magazineQuota = quota.data?.magazine;
  // Admin, Manage Requests, Auto Approve, or Auto Approve Magazines.
  const autoApprove = hasMagazinePermission(
    permissions,
    2n | 16n | 128n | (1n << 40n)
  );
  const advanced = canChooseRequestOptions(permissions);
  const [serviceId, setServiceId] = useState<number>();
  const services = useApi<{ id: number; name: string; isDefault?: boolean }[]>(
    '/service/magazine',
    { currentPathOnly: true }
  );
  const selectedService =
    advanced && services.data?.some(({ id }) => id === serviceId)
      ? serviceId
      : undefined;
  const selectedServiceDetails = services.data?.find(
    ({ id }) => id === selectedService
  );
  const defaultService = services.data?.find(({ isDefault }) => isDefault);
  const serviceUnavailable = !!services.data && services.data.length === 0;
  const canSelectService = advanced && (services.data?.length ?? 0) > 1;
  const displayedStatus = requestStatus
    ? requestStatus
    : t('lumen.magazineRequest.ready', 'Ready to Request');
  return (
    <ConfirmSheet
      title={t('lumen.magazineRequest.title', 'Request Magazine')}
      body={requestTitle}
      confirm={t('lumen.magazineRequest.send', 'Send Request')}
      cancel={t('lumen.magazineRequest.cancel', 'Cancel')}
      busy={sending}
      confirmDisabled={
        (!quota.data && !quota.error) ||
        (!existing.data && !existing.error) ||
        (!services.data && !services.error) ||
        !!requestStatus ||
        magazineQuota?.restricted ||
        serviceUnavailable
      }
      onClose={() => {
        if (!activeRequest.current) onClose();
      }}
      onConfirm={async () => {
        if (activeRequest.current) return;
        activeRequest.current = true;
        setSending(true);
        try {
          const result = await requestExtra(
            'magazine',
            requestTitle,
            selectedService
          );
          if ((result as { status?: number } | null)?.status === 4)
            throw new Error(
              t(
                'lumen.magazineRequest.backendFailure',
                'The Magazine Request Failed.'
              )
            );
          onRequested();
          toast(t('lumen.magazineRequest.requested', 'Magazine Requested'));
        } catch (error) {
          toast(
            friendlyError(
              error,
              t('lumen.magazineRequest.requestFailure', 'Request Failed')
            )
          );
        } finally {
          activeRequest.current = false;
          setSending(false);
        }
      }}
    >
      <Facts
        rows={[
          [
            t('lumen.magazineRequest.latestIssue', 'Latest Issue'),
            existing.data?.latestIssue ??
              t('lumen.magazineRequest.notAvailable', 'Not Available'),
          ],
          [t('lumen.magazineRequest.status', 'Status'), displayedStatus],
          [
            t('lumen.magazineRequest.service', 'Service'),
            selectedServiceDetails?.name ??
              defaultService?.name ??
              t('lumen.magazineRequest.notAvailable', 'Not Available'),
          ],
          [
            t('lumen.magazineRequest.approval', 'Approval'),
            autoApprove
              ? t(
                  'lumen.magazineRequest.autoApproved',
                  'Automatically Approved'
                )
              : t(
                  'lumen.magazineRequest.approvalRequired',
                  'Approval Required'
                ),
          ],
        ]}
      />
      {!!magazineQuota?.limit && (
        <p
          className="sub"
          role={magazineQuota.restricted ? 'status' : undefined}
        >
          {magazineQuota.restricted
            ? t(
                'lumen.magazineRequest.quotaReached',
                'Magazine Request Quota Reached.'
              )
            : t(
                'lumen.magazineRequest.quotaRemaining',
                '{remaining} of {limit} magazine requests remaining.',
                {
                  remaining: magazineQuota.remaining ?? 0,
                  limit: magazineQuota.limit,
                }
              )}
          {!!magazineQuota.days &&
            ` ${t('lumen.magazineRequest.quotaPeriod', 'Quota Period: {days} Days.', { days: magazineQuota.days })}`}
        </p>
      )}
      {magazineQuota?.restricted && (
        <button className="chip" type="button" onClick={quota.reload}>
          {t('lumen.magazineRequest.recheckQuota', 'Recheck Quota')}
        </button>
      )}
      {canSelectService && services.data && (
        <div className="toolbar">
          <label className="sel">
            <span className="lbl">
              {t('lumen.magazineRequest.service', 'Service')}
            </span>
            <select
              value={selectedService ?? ''}
              disabled={sending}
              onChange={(event) =>
                setServiceId(
                  event.target.value ? Number(event.target.value) : undefined
                )
              }
            >
              <option value="">
                {defaultService
                  ? t(
                      'lumen.magazineRequest.defaultService',
                      'Default ({name})',
                      {
                        name: defaultService.name,
                      }
                    )
                  : t('lumen.magazineRequest.notAvailable', 'Not Available')}
              </option>
              {services.data.map(({ id, name, isDefault }) => (
                <option key={id} value={id}>
                  {name}
                  {isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {serviceUnavailable && (
        <p role="status">
          {t(
            'lumen.magazineRequest.noService',
            'No magazine service is configured. Magazine requests are unavailable.'
          )}
        </p>
      )}
    </ConfirmSheet>
  );
}

export function Magazines() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? params.get('query') ?? '';
  const [q, setQ] = useState(query);
  const { user } = useAuth();
  const [requestTitle, setRequestTitle] = useState('');
  const [requested, setRequested] = useState('');
  const mayRequest = canRequestMagazines(user?.permissions);
  const title = q.trim();
  const mode = params.get('catalog');
  const catalog =
    mode === 'tracked' || mode === 'public'
      ? mode
      : query && params.has('q')
        ? 'public'
        : 'tracked';
  useEffect(() => {
    const value = q.trim();
    if (value === query) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (next.has('query') && !next.has('catalog'))
        next.set('catalog', 'tracked');
      next.delete('query');
      if (value) next.set('q', value);
      else next.delete('q');
      setParams(next, { replace: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [params, q, query, setParams]);
  useEffect(() => setQ(query), [query]);

  const requestParams = new URLSearchParams({ catalog });
  if (query) requestParams.set('query', query);
  const needsPublicQuery = catalog === 'public' && !query;
  const list = usePaged<Magazine>(
    needsPublicQuery ? null : `/discover/magazines?${requestParams}`
  );
  return (
    <ExtraGate k="magazine">
      <ExtraHeader
        title="Magazines"
        sub={
          query
            ? 'Search results. Request a title to start getting new issues.'
            : catalog === 'public'
              ? 'Search Google Books for magazine titles.'
              : 'Titles the library follows.'
        }
      >
        <ExtraSearch
          value={q}
          onChange={setQ}
          placeholder="Search magazines…"
        />
      </ExtraHeader>
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Magazine Catalogue">
          {(
            [
              ['tracked', 'Tracked Titles'],
              ['public', 'Public Catalogue'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={catalog === value}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('catalog', value);
                setParams(next, { replace: true });
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {needsPublicQuery && !title && (
        <div
          className="toolbar"
          role="group"
          aria-label="Suggested Magazine Searches"
        >
          {MAGAZINE_SEARCH_SUGGESTIONS.map((suggestion) => (
            <button
              className="chip"
              key={suggestion}
              type="button"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.delete('query');
                next.set('q', suggestion);
                next.set('catalog', 'public');
                setParams(next, { replace: true });
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      {mayRequest && title && title.length <= 256 && (
        <div className="toolbar">
          <button
            className="btn btn-tonal btn-sm"
            type="button"
            disabled={title === requested}
            onClick={() => setRequestTitle(title)}
          >
            {title === requested ? `Requested ${title}` : `Request “${title}”`}
          </button>
        </div>
      )}
      {mayRequest && requestTitle && (
        <MagazineRequestSheet
          requestTitle={requestTitle}
          onClose={() => setRequestTitle('')}
          onRequested={() => {
            setRequested(requestTitle);
            setRequestTitle('');
          }}
        />
      )}
      <ServiceNote
        error={list.items.length ? null : list.error}
        what="magazines"
        retry={list.retry}
      />
      {!needsPublicQuery &&
        !list.error &&
        !list.items.length &&
        !list.loading && (
          <div className="empty">
            <b>{query ? 'No magazines found' : 'No magazines yet'}</b>
            {query
              ? 'Try the magazine’s full title.'
              : 'Search for a title to request it.'}
          </div>
        )}
      <div className="grid">
        {list.items.map((magazine) => (
          <MagazineCard key={magazine.id} magazine={magazine} />
        ))}
      </div>
      <MoreOnScroll
        done={list.done}
        loading={list.loading}
        more={list.more}
        error={list.error}
        retry={list.retry}
      />
    </ExtraGate>
  );
}

export function MagazineDetail() {
  const { title = '' } = useParams();
  const { user } = useAuth();
  const [requestTitle, setRequestTitle] = useState('');
  const [requested, setRequested] = useState('');
  const mayRequest = canRequestMagazines(user?.permissions);
  const {
    data: m,
    error,
    reload,
    refresh,
  } = useApi<Magazine>(`/magazine/${encodeURIComponent(title)}`);
  if (error)
    return (
      <ExtraGate k="magazine">
        <ServiceNote error={error} what="this magazine" retry={reload} />
      </ExtraGate>
    );
  if (!m) return <div className="detail-loading" aria-busy="true" />;
  const s = extraStat(m.mediaInfo);
  const have = (m.issues || []).filter((i) => i.available).length;
  const main =
    m.requestable === false ? null : s || requested === m.title ? (
      <button className="btn btn-tonal" disabled>
        <Icon name={s?.ico || 'clock'} />
        <StatLabel s={s ?? { word: 'Requested' }} />
      </button>
    ) : mayRequest ? (
      <button
        className="btn btn-primary"
        onClick={() => setRequestTitle(m.title)}
      >
        <Icon name="plus" />
        Request magazine
      </button>
    ) : null;
  return (
    <ExtraGate k="magazine">
      {mayRequest && requestTitle === m.title && (
        <MagazineRequestSheet
          requestTitle={requestTitle}
          onClose={() => setRequestTitle('')}
          onRequested={() => {
            setRequested(requestTitle);
            setRequestTitle('');
            refresh();
          }}
        />
      )}
      <article className="detail">
        <DetailTop
          status={s}
          poster={m.posterPath}
          title={m.title}
          line={[
            m.publisher,
            m.firstPublishYear,
            m.issueCount ? `${m.issueCount} issues` : '',
          ]}
        />
        <div className="dbody">
          <div className="dstatus">
            <StatPill s={s} />
            {have > 0 && (
              <Pill k="ok" icon="check">
                {have} issue{have === 1 ? '' : 's'} in library
              </Pill>
            )}
            <IndexerSearchLink category="magazine" title={m.title} />
            <BlocklistButton
              mediaType="magazine"
              id={m.id}
              requestedId={title}
              title={m.title}
              onChange={refresh}
            />
            <ReaderDeliveryLink target="magazine" />
            <ReaderDownloads mediaId={m.mediaInfo?.id} type="magazine" />
            <ReportIssueButton
              type="magazine"
              title={m.title}
              media={m.mediaInfo}
            />
            <WatchlistButton
              mediaType="magazine"
              detail={m}
              requestedId={title}
            />
          </div>
          <div className="dacts pc">{main}</div>
          <div className="dcols">
            <div>
              {!!m.issues?.length && (
                <>
                  <div className="h2">Issues</div>
                  <ol className="slist tlist">
                    {m.issues.map((i) => (
                      <li key={i.id} className="trow">
                        <span className="tn" />
                        <span>
                          <b>{i.date || i.id}</b>
                        </span>
                        {i.available ? (
                          <Pill k="ok" icon="check">
                            In library
                          </Pill>
                        ) : (
                          <span className="tl">Not yet</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
            <aside>
              <Facts
                rows={[
                  ['Publisher', m.publisher],
                  ['Latest issue', m.latestIssue],
                  ['Status', m.status],
                  [
                    'Source',
                    m.provider === 'googlebooks'
                      ? 'Google Books'
                      : 'LazyLibrarian',
                  ],
                ]}
              />
            </aside>
          </div>
        </div>
        {main && (
          <div className="actionbar">
            <span className="ab-meta">
              <b>{m.title}</b>
              {m.publisher}
            </span>
            {main}
          </div>
        )}
      </article>
    </ExtraGate>
  );
}

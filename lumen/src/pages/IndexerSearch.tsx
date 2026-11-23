import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { isAdministrator, useAuth } from '../auth';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

const PATH = '/indexer-search';
const CATEGORIES: Record<string, { id: string; fallback: string }> = {
  movie: { id: 'categoryMovie', fallback: 'Movies' },
  tv: { id: 'categoryTv', fallback: 'TV' },
  music: { id: 'categoryMusic', fallback: 'Music' },
  ebook: { id: 'categoryEbook', fallback: 'Books' },
  audiobook: { id: 'categoryAudiobook', fallback: 'Audiobooks' },
  comic: { id: 'categoryComic', fallback: 'Comics' },
  magazine: { id: 'categoryMagazine', fallback: 'Magazines' },
  adult: { id: 'categoryAdult', fallback: 'Adult' },
  retro: { id: 'categoryRetro', fallback: 'Retro ROMs' },
  modern: { id: 'categoryModern', fallback: 'Modern ROMs' },
  game: { id: 'categoryGame', fallback: 'PC Games' },
  sports: { id: 'categorySports', fallback: 'Sports' },
};
interface Configuration {
  configured: boolean;
  showIndexerDetails: boolean;
  categories: { category: string; categoryIds: number[]; enabled: boolean }[];
}
interface Release {
  title: string;
  indexer?: string;
  size: number | null;
  seeders: number | null;
  leechers: number | null;
  grabs: number | null;
  protocol: string;
  publishDate: string | null;
  infoUrl: string | null;
  grabId: string | null;
  categories: { id: number; name: string }[];
}
interface SearchPage {
  results: Release[];
  hasMore: boolean;
  limit: number;
}
interface SearchInput {
  category: string;
  query: string;
}
type Handoff = 'sending' | 'sent' | 'failed';

function detailsUrl(value: string | null) {
  try {
    if (!value) return undefined;
    const url = new URL(value);
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    ) {
      return url.href;
    }
  } catch {
    return undefined;
  }
}

function ReleaseRow({
  release,
  showDetails,
  state,
  send,
  locale,
  t,
}: {
  release: Release;
  showDetails: boolean;
  state?: Handoff;
  send: () => void;
  locale: string;
  t: ReturnType<typeof useLumenLocale>['t'];
}) {
  const info = showDetails ? detailsUrl(release.infoUrl) : undefined;
  const date = release.publishDate ? new Date(release.publishDate) : null;
  return (
    <li className="set">
      <div>
        <b>{release.title}</b>
        <small>
          {[
            release.protocol,
            release.size === null
              ? null
              : `${(release.size / 1024 ** 2).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`,
            date && Number.isFinite(date.valueOf())
              ? date.toLocaleDateString(locale)
              : null,
            release.seeders === null
              ? null
              : `${release.seeders.toLocaleString(locale)} ${t('components.IndexerSearch.seeders', 'Seeders')}`,
            release.leechers === null
              ? null
              : `${release.leechers.toLocaleString(locale)} ${t('components.IndexerSearch.leechers', 'Leechers')}`,
            release.grabs === null
              ? null
              : `${release.grabs.toLocaleString(locale)} ${t('components.IndexerSearch.grabs', 'Grabs')}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </small>
        {showDetails && release.indexer && <small>{release.indexer}</small>}
        {!!release.categories.length && (
          <small>{release.categories.map(({ name }) => name).join(', ')}</small>
        )}
        {state === 'sent' && (
          <small role="status">
            {t(
              'components.IndexerSearch.sentToDownloader',
              'Sent to Prowlarr’s configured download client.'
            )}
          </small>
        )}
        {state === 'failed' && (
          <small role="alert">
            {t(
              'lumen.indexerSearch.handoffUnconfirmed',
              'Handoff could not be confirmed. Check the client before searching and trying again.'
            )}
          </small>
        )}
      </div>
      <div className="toolbar">
        {info && (
          <a
            className="btn btn-quiet btn-sm"
            href={info}
            target="_blank"
            rel="noreferrer"
          >
            {t('components.IndexerSearch.openResult', 'Open indexer details')}
          </a>
        )}
        {release.grabId && !state && (
          <button className="btn btn-tonal btn-sm" onClick={send}>
            {t(
              'components.IndexerSearch.sendToDownloader',
              'Send to downloader'
            )}
          </button>
        )}
        {state === 'sending' && (
          <small role="status">
            {t('components.IndexerSearch.sendingToDownloader', 'Sending…')}
          </small>
        )}
      </div>
    </li>
  );
}

function SearchForm({
  configuration,
  canConfigure,
}: {
  configuration: Configuration;
  canConfigure: boolean;
}) {
  const { locale, t } = useLumenLocale();
  const [params] = useSearchParams();
  const linkedCategory = params.get('category');
  const linkedQuery = params.get('query');
  const linkedSearchKey = JSON.stringify([linkedCategory, linkedQuery]);
  const categories = configuration.categories.filter(
    ({ category, enabled, categoryIds }) =>
      Object.hasOwn(CATEGORIES, category) &&
      enabled &&
      categoryIds.some((id) => Number.isSafeInteger(id) && id > 0)
  );
  const [category, setCategory] = useState(params.get('category') ?? '');
  const selected =
    categories.find((item) => item.category === category)?.category ??
    categories[0]?.category ??
    '';
  const [query, setQuery] = useState((params.get('query') ?? '').slice(0, 256));
  const [results, setResults] = useState<Release[]>([]);
  const [submitted, setSubmitted] = useState<SearchInput>();
  const [nextOffset, setNextOffset] = useState<number>();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const searchingRef = useRef(false);
  const searchGeneration = useRef(0);
  const linkedSearchKeyRef = useRef(linkedSearchKey);
  const sentHandles = useRef(new Set<string>());
  const [handoffs, setHandoffs] = useState<Record<string, Handoff>>({});

  useEffect(() => {
    if (linkedSearchKeyRef.current === linkedSearchKey) return;
    linkedSearchKeyRef.current = linkedSearchKey;
    searchGeneration.current += 1;
    searchingRef.current = false;
    setSearching(false);
    if (linkedCategory !== null) setCategory(linkedCategory);
    if (linkedQuery !== null) setQuery(linkedQuery.slice(0, 256));
    setResults([]);
    setSubmitted(undefined);
    setNextOffset(undefined);
    setError('');
    sentHandles.current.clear();
    setHandoffs({});
  }, [linkedCategory, linkedQuery, linkedSearchKey]);

  async function search(input: SearchInput, offset = 0) {
    if (searchingRef.current || !input.category || input.query.length < 2)
      return;
    const generation = ++searchGeneration.current;
    searchingRef.current = true;
    setSearching(true);
    setError('');
    if (!offset) {
      setResults([]);
      setSubmitted(undefined);
      setNextOffset(undefined);
    }
    try {
      const page = await api<SearchPage>(PATH + '/search', {
        method: 'POST',
        body: JSON.stringify({ ...input, offset }),
      });
      if (generation !== searchGeneration.current) return;
      setSubmitted(input);
      setResults((previous) =>
        offset ? [...previous, ...page.results] : page.results
      );
      setNextOffset(page.hasMore ? offset + page.limit : undefined);
    } catch (err) {
      if (generation !== searchGeneration.current) return;
      setError(
        err instanceof ApiError && err.status === 429
          ? t(
              'components.IndexerSearch.tooManySearches',
              'Search limit reached. Wait a minute before searching again.'
            )
          : err instanceof ApiError && err.status === 409
            ? t(
                'components.SettingsProwlarr.noSearchableIndexers',
                'No enabled searchable indexers are available. Enable an indexer in Prowlarr or adjust the category filters.'
              )
            : t(
                'components.IndexerSearch.searchFailed',
                'Prowlarr search failed. Check the connection and try again.'
              )
      );
    } finally {
      if (generation === searchGeneration.current) {
        searchingRef.current = false;
        setSearching(false);
      }
    }
  }

  async function send(grabId: string) {
    if (sentHandles.current.has(grabId)) return;
    sentHandles.current.add(grabId);
    setHandoffs((current) => ({ ...current, [grabId]: 'sending' }));
    let state: Handoff = 'failed';
    try {
      const result = await api<{ submitted: boolean }>(PATH + '/grab', {
        method: 'POST',
        body: JSON.stringify({ grabId }),
      });
      if (result.submitted === true) state = 'sent';
    } catch {
      // Handles are single-use, including when the service outcome is uncertain.
    }
    setHandoffs((current) => ({ ...current, [grabId]: state }));
  }

  if (!configuration.configured)
    return (
      <div className="note">
        <p>
          {t(
            'components.IndexerSearch.noConnection',
            'Prowlarr is not connected.'
          )}
        </p>
        <p>
          {t(
            'components.IndexerSearch.noConnectionHelp',
            'Ask an administrator to connect Prowlarr under Settings > Services.'
          )}
        </p>
        {canConfigure && (
          <p>
            <Link className="btn btn-tonal btn-sm" to="/admin/prowlarr">
              {t(
                'components.IndexerSearch.configure',
                'Open Prowlarr settings'
              )}
            </Link>
          </p>
        )}
      </div>
    );
  if (!selected)
    return (
      <div className="note">
        <p>
          {t(
            'lumen.indexerSearch.noCategories',
            'No enabled media categories are available to this account.'
          )}
        </p>
      </div>
    );

  return (
    <>
      <p className="note">
        {t(
          'components.IndexerSearch.intro',
          'Search releases in your Prowlarr indexers across every SeerrNG media category.'
        )}{' '}
        {t(
          'components.IndexerSearch.manualMode',
          'Search results are separate from SeerrNG requests. You can send a result to a download client configured in Prowlarr.'
        )}
      </p>
      <p className="note">
        {t(
          'components.IndexerSearch.requestStillUsesManager',
          'Sending a result does not change a SeerrNG request. Prowlarr handles the handoff to its configured download client.'
        )}
      </p>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void search({ category: selected, query: query.trim() });
        }}
      >
        <label className="sel">
          <select
            aria-label={t(
              'components.IndexerSearch.category',
              'Media category'
            )}
            disabled={searching}
            value={selected}
            onChange={(event) => {
              setCategory(event.target.value);
              setResults([]);
              setSubmitted(undefined);
              setNextOffset(undefined);
              setError('');
            }}
          >
            {categories.map((item) => (
              <option key={item.category} value={item.category}>
                {t(
                  `components.IndexerSearch.${CATEGORIES[item.category].id}`,
                  CATEGORIES[item.category].fallback
                )}
              </option>
            ))}
          </select>
        </label>
        <label className="search">
          <input
            aria-label={t('components.IndexerSearch.query', 'Search terms')}
            type="search"
            placeholder={t(
              'components.IndexerSearch.queryPlaceholder',
              'Title, author, album, issue, or game name'
            )}
            maxLength={256}
            value={query}
            disabled={searching}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          className="btn btn-tonal btn-sm"
          disabled={searching || query.trim().length < 2}
        >
          {t('components.IndexerSearch.search', 'Search indexers')}
        </button>
      </form>
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {searching && (
        <p className="note" role="status">
          {t('components.IndexerSearch.searching', 'Searching indexers…')}
        </p>
      )}
      {submitted && (
        <p className="note" role="status">
          {results.length
            ? t(
                'lumen.indexerSearch.resultsFound',
                'Results returned by Prowlarr: {count}.',
                {
                  count: results.length,
                }
              )
            : t(
                'components.IndexerSearch.noResults',
                'No releases matched this search.'
              )}
        </p>
      )}
      {!!results.length && (
        <ul className="setlist">
          {results.map((release, index) => (
            <ReleaseRow
              key={index}
              release={release}
              showDetails={configuration.showIndexerDetails}
              state={release.grabId ? handoffs[release.grabId] : undefined}
              locale={locale}
              t={t}
              send={() => {
                if (release.grabId) void send(release.grabId);
              }}
            />
          ))}
        </ul>
      )}
      {submitted && nextOffset !== undefined && (
        <div className="toolbar">
          <button
            className="btn btn-quiet btn-sm"
            disabled={searching}
            onClick={() => void search(submitted, nextOffset)}
          >
            {t('components.IndexerSearch.loadMore', 'Load more results')}
          </button>
        </div>
      )}
    </>
  );
}

export default function IndexerSearch({ allowed }: { allowed: boolean }) {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const canConfigure = isAdministrator(user?.permissions);
  const { data, error, reload } = useApi<Configuration>(
    allowed ? PATH + '/configuration' : null
  );
  const [params] = useSearchParams();
  return (
    <>
      <header className="ph">
        <h1>{t('components.IndexerSearch.title', 'Indexer Search')}</h1>
      </header>
      {!allowed && (
        <p className="note">
          {t(
            'components.IndexerSearch.accessDenied',
            'You need Manage Requests permission to search indexers.'
          )}
        </p>
      )}
      <ServiceNote
        error={error}
        what={t('components.IndexerSearch.categories', 'Indexer categories')}
        retry={reload}
      />
      {allowed && !data && !error && (
        <p className="note" role="status">
          {t('components.IndexerSearch.loadingMore', 'Loading…')}
        </p>
      )}
      {allowed && data && (
        <SearchForm
          key={params.toString()}
          configuration={data}
          canConfigure={canConfigure}
        />
      )}
    </>
  );
}

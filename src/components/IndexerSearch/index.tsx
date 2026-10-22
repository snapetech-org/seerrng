import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { getSafeHref } from '@app/utils/safeUrl';
import {
  getUserServiceAvailability,
  isConfiguredMediaCategoryEnabled,
} from '@app/utils/serviceAvailability';
import type { MediaCategoryKey } from '@server/constants/mediaCategories';
import type {
  ProwlarrSearchResult,
  ProwlarrSearchResultsResponse,
} from '@server/interfaces/api/prowlarrInterfaces';
import axios from 'axios';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.IndexerSearch', {
  title: 'Indexer Search',
  intro:
    'Search releases in your Prowlarr indexers across every SeerrNG media category.',
  category: 'Media category',
  query: 'Search terms',
  queryPlaceholder: 'Title, author, album, issue, or game name',
  search: 'Search indexers',
  searching: 'Searching indexers…',
  categoryMovie: 'Movies',
  categoryTv: 'TV',
  categoryMusic: 'Music',
  categoryEbook: 'Books',
  categoryAudiobook: 'Audiobooks',
  categoryComic: 'Comics',
  categoryMagazine: 'Magazines',
  categoryAdult: 'Adult',
  categoryRetro: 'Retro ROMs',
  categoryModern: 'Modern ROMs',
  categoryGame: 'PC games',
  noConnection: 'Prowlarr is not connected.',
  noConnectionHelp:
    'Ask an administrator to connect Prowlarr under Settings > Services.',
  configure: 'Open Prowlarr settings',
  accessDenied: 'You need Manage Requests permission to search indexers.',
  loadFailed: 'Prowlarr search configuration could not be loaded.',
  searchFailed: 'Prowlarr search failed. Check the connection and try again.',
  tooManySearches:
    'Search limit reached. Wait a minute before searching again.',
  noResults: 'No releases matched this search.',
  noResultsHelp:
    'Check the category filters and enabled indexers in Prowlarr. Search results do not confirm that an app can import a release.',
  resultCount: '{count} releases returned by Prowlarr.',
  size: 'Size',
  seeders: 'Seeders',
  leechers: 'Leechers',
  grabs: 'Grabs',
  protocol: 'Protocol',
  categories: 'Indexer categories',
  published: 'Published',
  openResult: 'Open indexer details',
  sendToDownloader: 'Send to downloader',
  sendingToDownloader: 'Sending…',
  sentToDownloader: 'Sent to Prowlarr’s configured download client.',
  downloaderFailed:
    'Prowlarr could not send this release. Run a new search and try again.',
  loadMore: 'Load more results',
  loadingMore: 'Loading…',
  manualMode:
    'Search results are separate from SeerrNG requests. You can send a result to a download client configured in Prowlarr.',
  requestStillUsesManager:
    'Sending a result does not change a SeerrNG request. Prowlarr handles the handoff to its configured download client.',
});

interface IndexerSearchConfiguration {
  configured: boolean;
  showIndexerDetails: boolean;
  categories: { category: MediaCategoryKey; categoryIds: number[] }[];
}

const categories: {
  key: MediaCategoryKey;
  label: keyof typeof messages;
}[] = [
  { key: 'movie', label: 'categoryMovie' },
  { key: 'tv', label: 'categoryTv' },
  { key: 'music', label: 'categoryMusic' },
  { key: 'ebook', label: 'categoryEbook' },
  { key: 'audiobook', label: 'categoryAudiobook' },
  { key: 'comic', label: 'categoryComic' },
  { key: 'magazine', label: 'categoryMagazine' },
  { key: 'adult', label: 'categoryAdult' },
  { key: 'retro', label: 'categoryRetro' },
  { key: 'modern', label: 'categoryModern' },
  { key: 'game', label: 'categoryGame' },
];

const formatSize = (bytes: number | null, intl: ReturnType<typeof useIntl>) => {
  if (bytes === null) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;
  return `${intl.formatNumber(value, { maximumFractionDigits: 1 })} ${units[exponent]}`;
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <span className="rounded bg-gray-900/70 px-2 py-1 text-xs text-gray-300">
    <span className="text-gray-500">{label}: </span>
    {value}
  </span>
);

const ResultCard = ({
  result,
  intl,
  grabState,
  onGrab,
}: {
  result: ProwlarrSearchResult;
  intl: ReturnType<typeof useIntl>;
  grabState?: 'sending' | 'sent' | 'failed';
  onGrab: () => void;
}) => {
  const infoHref = result.infoUrl ? getSafeHref(result.infoUrl) : undefined;
  const published = result.publishDate
    ? intl.formatDate(result.publishDate, { dateStyle: 'medium' })
    : '—';

  return (
    <article className="rounded-lg border border-gray-700 bg-gray-800/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold break-words text-white">
            {result.title}
          </h3>
          {result.indexer && (
            <p className="mt-1 text-sm text-indigo-200">{result.indexer}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {infoHref && (
            <a
              className="rounded border border-gray-600 px-3 py-2 text-sm font-medium text-gray-100 hover:bg-gray-700"
              href={infoHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              {intl.formatMessage(messages.openResult)}
            </a>
          )}
          {result.grabId && !grabState && (
            <Button buttonType="primary" onClick={onGrab}>
              {intl.formatMessage(messages.sendToDownloader)}
            </Button>
          )}
          {grabState === 'sending' && (
            <Button buttonType="primary" disabled>
              {intl.formatMessage(messages.sendingToDownloader)}
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Metric
          label={intl.formatMessage(messages.size)}
          value={formatSize(result.size, intl)}
        />
        <Metric
          label={intl.formatMessage(messages.protocol)}
          value={result.protocol}
        />
        <Metric
          label={intl.formatMessage(messages.seeders)}
          value={result.seeders?.toLocaleString() ?? '—'}
        />
        <Metric
          label={intl.formatMessage(messages.leechers)}
          value={result.leechers?.toLocaleString() ?? '—'}
        />
        {result.grabs !== null && (
          <Metric
            label={intl.formatMessage(messages.grabs)}
            value={result.grabs.toLocaleString()}
          />
        )}
        <Metric
          label={intl.formatMessage(messages.published)}
          value={published}
        />
      </div>
      {result.categories.length > 0 && (
        <p className="mt-3 text-xs text-gray-400">
          {intl.formatMessage(messages.categories)}:{' '}
          {result.categories.map((category) => category.name).join(', ')}
        </p>
      )}
      {grabState === 'sent' && (
        <p className="mt-3 text-sm text-green-300" role="status">
          {intl.formatMessage(messages.sentToDownloader)}
        </p>
      )}
      {grabState === 'failed' && (
        <p className="mt-3 text-sm text-amber-200" role="status">
          {intl.formatMessage(messages.downloaderFailed)}
        </p>
      )}
    </article>
  );
};

const IndexerSearch = () => {
  const intl = useIntl();
  const router = useRouter();
  const { currentSettings } = useSettings();
  const { hasPermission, user } = useUser();
  const serviceAvailability = getUserServiceAvailability(
    currentSettings,
    user?.settings?.enabledMediaCategories,
    hasPermission(Permission.ADMIN)
  );
  const visibleCategories = categories.filter(
    (item) =>
      isConfiguredMediaCategoryEnabled(item.key, serviceAvailability) &&
      (item.key !== 'adult' || serviceAvailability.adultEnabled)
  );
  const adultCategoryEnabled =
    serviceAvailability.adultEnabled &&
    isConfiguredMediaCategoryEnabled('adult', serviceAvailability);
  const {
    data: configuration,
    error: configurationError,
    isLoading,
  } = useSWR<IndexerSearchConfiguration>(
    '/api/v1/indexer-search/configuration',
    { shouldRetryOnError: false }
  );
  const [category, setCategory] = useState<MediaCategoryKey>('movie');
  const [submittedCategory, setSubmittedCategory] =
    useState<MediaCategoryKey>('movie');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<ProwlarrSearchResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [searching, setSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [grabStates, setGrabStates] = useState<
    Record<string, 'sending' | 'sent' | 'failed'>
  >({});

  const sendToDownloader = async (result: ProwlarrSearchResult) => {
    if (!result.grabId) return;
    setGrabStates((current) => ({ ...current, [result.grabId!]: 'sending' }));
    try {
      await axios.post('/api/v1/indexer-search/grab', {
        grabId: result.grabId,
      });
      setGrabStates((current) => ({ ...current, [result.grabId!]: 'sent' }));
    } catch {
      setGrabStates((current) => ({ ...current, [result.grabId!]: 'failed' }));
    }
  };

  useEffect(() => {
    if (!router.isReady) return;

    const linkedCategory = router.query.category;
    if (
      typeof linkedCategory === 'string' &&
      categories.some((item) => item.key === linkedCategory) &&
      (linkedCategory !== 'adult' || adultCategoryEnabled)
    ) {
      setCategory(linkedCategory as MediaCategoryKey);
    }

    const linkedQuery = router.query.query;
    if (typeof linkedQuery === 'string') {
      setQuery(linkedQuery.slice(0, 256));
    }
  }, [
    adultCategoryEnabled,
    router.isReady,
    router.query.category,
    router.query.query,
  ]);

  const runSearch = async (nextOffset = 0, append = false) => {
    const searchText = (append ? submittedQuery : query).trim();
    if (searchText.length < 2 || searchText.length > 256) return;
    setSearching(true);
    setErrorMessage('');
    try {
      const searchCategory = append ? submittedCategory : category;
      const response = await axios.post<ProwlarrSearchResultsResponse>(
        '/api/v1/indexer-search/search',
        { category: searchCategory, query: searchText, offset: nextOffset }
      );
      setSubmittedQuery(searchText);
      setSubmittedCategory(searchCategory);
      setResults((current) =>
        append ? [...current, ...response.data.results] : response.data.results
      );
      setOffset(nextOffset + response.data.limit);
      setHasMore(response.data.hasMore);
    } catch (searchError) {
      setErrorMessage(
        axios.isAxiosError(searchError) && searchError.response?.status === 429
          ? intl.formatMessage(messages.tooManySearches)
          : intl.formatMessage(messages.searchFailed)
      );
      if (!append) setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittedQuery('');
    setResults([]);
    setGrabStates({});
    setOffset(0);
    setHasMore(false);
    void runSearch();
  };

  const canManageRequests = hasPermission(Permission.MANAGE_REQUESTS);
  const canAdmin = hasPermission(Permission.ADMIN);

  return (
    <>
      <PageTitle title={intl.formatMessage(messages.title)} />
      <main className="mb-10">
        <Header subtext={intl.formatMessage(messages.intro)}>
          {intl.formatMessage(messages.title)}
        </Header>

        {!canManageRequests ? (
          <Alert type="error">
            {intl.formatMessage(messages.accessDenied)}
          </Alert>
        ) : isLoading ? (
          <div className="mt-6 flex justify-center">
            <LoadingSpinner />
          </div>
        ) : configurationError ? (
          <Alert type="error">{intl.formatMessage(messages.loadFailed)}</Alert>
        ) : !configuration?.configured ? (
          <Alert type="info">
            <p>{intl.formatMessage(messages.noConnection)}</p>
            <p className="mt-1">
              {intl.formatMessage(messages.noConnectionHelp)}
            </p>
            {canAdmin && (
              <Link
                className="mt-2 inline-block underline"
                href="/settings/prowlarr"
              >
                {intl.formatMessage(messages.configure)}
              </Link>
            )}
          </Alert>
        ) : (
          <>
            <div className="mt-6 rounded-lg border border-gray-700 bg-gray-900/50 p-4 text-sm text-gray-300">
              <p>{intl.formatMessage(messages.manualMode)}</p>
              <p className="mt-1 text-gray-400">
                {intl.formatMessage(messages.requestStillUsesManager)}
              </p>
            </div>

            <form
              className="mt-5 grid grid-cols-1 items-end gap-4 sm:grid-cols-[minmax(12rem,0.45fr)_minmax(18rem,1fr)_auto]"
              onSubmit={submitSearch}
            >
              <label className="text-sm text-gray-200">
                {intl.formatMessage(messages.category)}
                <select
                  className="input input-lite mt-1 w-full"
                  value={category}
                  disabled={searching}
                  onChange={(event) => {
                    setCategory(event.target.value as MediaCategoryKey);
                    setResults([]);
                    setSubmittedQuery('');
                    setOffset(0);
                    setHasMore(false);
                    setErrorMessage('');
                  }}
                >
                  {visibleCategories.map((item) => (
                    <option key={item.key} value={item.key}>
                      {intl.formatMessage(messages[item.label])}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-gray-200">
                {intl.formatMessage(messages.query)}
                <input
                  className="input input-lite mt-1 w-full"
                  minLength={2}
                  maxLength={256}
                  required
                  disabled={searching}
                  value={query}
                  placeholder={intl.formatMessage(messages.queryPlaceholder)}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <Button
                type="submit"
                buttonType="primary"
                disabled={searching || query.trim().length < 2}
              >
                {intl.formatMessage(
                  searching ? messages.searching : messages.search
                )}
              </Button>
            </form>

            {errorMessage && (
              <div className="mt-4" role="alert">
                <Alert type="error">{errorMessage}</Alert>
              </div>
            )}

            {submittedQuery &&
              !searching &&
              results.length === 0 &&
              !errorMessage && (
                <div className="mt-5 rounded-lg border border-gray-700 bg-gray-800/60 p-5 text-center">
                  <p className="font-semibold text-gray-100">
                    {intl.formatMessage(messages.noResults)}
                  </p>
                  <p className="mt-1 text-sm text-gray-400">
                    {intl.formatMessage(messages.noResultsHelp)}
                  </p>
                </div>
              )}

            {results.length > 0 && (
              <section className="mt-6" aria-live="polite">
                <p className="mb-3 text-sm text-gray-300">
                  {intl.formatMessage(messages.resultCount, {
                    count: results.length,
                  })}
                </p>
                <ul className="space-y-3">
                  {results.map((result, index) => (
                    <li key={`${result.grabId ?? result.title}-${index}`}>
                      <ResultCard
                        result={result}
                        intl={intl}
                        grabState={
                          result.grabId ? grabStates[result.grabId] : undefined
                        }
                        onGrab={() => void sendToDownloader(result)}
                      />
                    </li>
                  ))}
                </ul>
                {hasMore && (
                  <div className="mt-5 text-center">
                    <Button
                      type="button"
                      disabled={searching}
                      onClick={() => void runSearch(offset, true)}
                    >
                      {intl.formatMessage(
                        searching ? messages.loadingMore : messages.loadMore
                      )}
                    </Button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
};

export default IndexerSearch;

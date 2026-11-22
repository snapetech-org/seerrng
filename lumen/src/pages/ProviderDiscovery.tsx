import { Link, useSearchParams } from 'react-router-dom';
import { artUrl } from '../api';
import { Cover } from '../components/cards';
import { ExtraHeader } from '../components/extra';
import IdentityMapping, {
  type MappingCandidate,
  videoHref,
} from '../components/IdentityMapping';
import ProviderFailure from '../components/ProviderFailure';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

const feeds = {
  'anilist/trending': 'AniList Trending',
  'anilist/popular': 'AniList Popular',
  'anilist/top': 'AniList Top Rated',
  'anilist/next-season': 'AniList Next Season',
  'anilist/library': 'AniList Library',
  'trakt/watchlist': 'Trakt Watchlist',
  'trakt/history': 'Trakt History',
  'trakt/recommendations-movie': 'Trakt Movie Recommendations',
  'trakt/recommendations-tv': 'Trakt Series Recommendations',
  'mdblist/list': 'MDBList Public List',
};

const feedLabelKeys: Record<keyof typeof feeds, string> = {
  'anilist/trending': 'lumen.providerDiscovery.feed.anilistTrending',
  'anilist/popular': 'lumen.providerDiscovery.feed.anilistPopular',
  'anilist/top': 'lumen.providerDiscovery.feed.anilistTop',
  'anilist/next-season': 'lumen.providerDiscovery.feed.anilistNextSeason',
  'anilist/library': 'lumen.providerDiscovery.feed.anilistLibrary',
  'trakt/watchlist': 'lumen.providerDiscovery.feed.traktWatchlist',
  'trakt/history': 'lumen.providerDiscovery.feed.traktHistory',
  'trakt/recommendations-movie':
    'lumen.providerDiscovery.feed.traktMovieRecommendations',
  'trakt/recommendations-tv':
    'lumen.providerDiscovery.feed.traktSeriesRecommendations',
  'mdblist/list': 'lumen.providerDiscovery.feed.mdblistPublicList',
};

const matchDescriptions = {
  personal: 'Personal match',
  curated: 'Curated match',
  'external-id': 'Matched by catalog ID',
};

interface FeedPage {
  page: number;
  hasMore: boolean;
  missingMappings?: number;
  items: (MappingCandidate & { imageUrl?: string })[];
}

export default function ProviderDiscovery() {
  const { t } = useLumenLocale();
  const [params, setParams] = useSearchParams();
  const requestedFeed = params.get('feed') ?? '';
  const feed = Object.hasOwn(feeds, requestedFeed)
    ? requestedFeed
    : 'anilist/trending';
  const requestedPage = params.get('page') ?? '';
  const page = /^[1-9]\d?$|^100$/.test(requestedPage)
    ? Number(requestedPage)
    : 1;
  const list = params.get('list')?.trim() ?? '';
  const unmatched = params.get('unmatched') === '1';
  const query = new URLSearchParams({ page: String(page) });
  const needsList = feed === 'mdblist/list';
  if (needsList && list.length <= 2048) query.set('list', list);
  const enabled = !needsList || (!!list && list.length <= 2048);
  const { data, error, errorStatus, apiError, reload } = useApi<FeedPage>(
    enabled ? `/integrations/discovery/feeds/${feed}?${query}` : null,
    { currentPathOnly: true }
  );
  const current = data?.page === page ? data : null;
  const items = current?.items.filter((item) => !unmatched || !videoHref(item));
  const missingMappings = current?.missingMappings;

  function update(name: string, value: string, resetPage = true) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    if (resetPage) next.delete('page');
    setParams(next);
  }

  return (
    <>
      <ExtraHeader
        title={t('lumen.providerDiscovery.title', 'Provider Discovery')}
      >
        <div className="toolbar">
          <Link className="chip" to="/me/account/linked-accounts">
            {t('lumen.providerDiscovery.linkedAccounts', 'Linked Accounts')}
          </Link>
          <Link className="chip" to="/">
            {t('lumen.providerDiscovery.discover', 'Discover')}
          </Link>
        </div>
      </ExtraHeader>
      <div className="toolbar">
        <label className="sel">
          <span className="lbl">
            {t('lumen.providerDiscovery.feed', 'Provider Feed')}
          </span>
          <select
            aria-label={t('lumen.providerDiscovery.feed', 'Provider Feed')}
            value={feed}
            onChange={(event) => update('feed', event.target.value)}
          >
            {Object.entries(feeds).map(([value, label]) => (
              <option key={value} value={value}>
                {t(feedLabelKeys[value as keyof typeof feeds], label)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={unmatched}
            onChange={(event) =>
              update('unmatched', event.target.checked ? '1' : '', false)
            }
          />{' '}
          {t('lumen.providerDiscovery.unmatchedOnly', 'Unmatched Only')}
        </label>
        {typeof missingMappings === 'number' && missingMappings > 0 && (
          <span className="note">
            {missingMappings === 1
              ? t(
                  'lumen.providerDiscovery.unmatchedOne',
                  '{count} unmatched title on this page',
                  { count: missingMappings }
                )
              : t(
                  'lumen.providerDiscovery.unmatchedMany',
                  '{count} unmatched titles on this page',
                  { count: missingMappings }
                )}
          </span>
        )}
      </div>
      {needsList && (
        <form
          className="toolbar"
          key={list}
          onSubmit={(event) => {
            event.preventDefault();
            const value = String(
              new FormData(event.currentTarget).get('list') ?? ''
            ).trim();
            update('list', value);
          }}
        >
          <label className="search">
            <input
              name="list"
              type="text"
              aria-label={t(
                'lumen.providerDiscovery.listReference',
                'MDBList Reference'
              )}
              defaultValue={list}
              maxLength={2048}
              required
            />
          </label>
          <button className="btn btn-tonal btn-sm" type="submit">
            {t('lumen.providerDiscovery.openList', 'Open List')}
          </button>
        </form>
      )}
      {error && (
        <ProviderFailure
          key={`${feed}:${page}:${apiError?.retryAt ?? ''}`}
          error={error}
          what={t('lumen.providerDiscovery.what', 'provider feed')}
          provider={feed.split('/')[0]}
          code={apiError?.code}
          retryAt={apiError?.retryAt}
          retry={reload}
        />
      )}
      {(errorStatus === 401 || errorStatus === 403) && (
        <p className="note">
          {t(
            'lumen.providerDiscovery.accessHelp',
            'Check that this provider is enabled and linked in your account.'
          )}
        </p>
      )}
      {enabled && !current && !error && (
        <p className="note" role="status">
          {t('lumen.providerDiscovery.loading', 'Loading feed…')}
        </p>
      )}
      {items?.length === 0 && (
        <p className="note">
          {unmatched
            ? t(
                'lumen.providerDiscovery.noUnmatchedTitles',
                'No unmatched titles on this page.'
              )
            : t('lumen.providerDiscovery.noTitles', 'No titles on this page.')}
        </p>
      )}
      {!!items?.length && (
        <ul className="setlist">
          {items.map((item) => {
            const href = videoHref(item);
            const animeId = feed.startsWith('anilist/')
              ? /^anilist:([1-9]\d{0,9})$/.exec(item.id)?.[1]
              : undefined;
            const cover = animeId ? artUrl(item.imageUrl) : undefined;
            const matchDescription =
              item.identityResolution &&
              Object.hasOwn(matchDescriptions, item.identityResolution)
                ? t(
                    `lumen.providerDiscovery.match.${item.identityResolution === 'external-id' ? 'externalId' : item.identityResolution}`,
                    matchDescriptions[item.identityResolution]
                  )
                : item.identityMapped
                  ? t(
                      'lumen.providerDiscovery.match.personal',
                      matchDescriptions.personal
                    )
                  : undefined;
            return (
              <li className="set" key={item.id}>
                {!href && cover?.startsWith('/imageproxy/anilist/') && (
                  <div className="poster" aria-hidden="true">
                    <div className="art">
                      <Cover src={cover} title={item.title} icon="tv" />
                    </div>
                  </div>
                )}
                <div>
                  {href ? (
                    <Link className="go" to={href}>
                      {item.title}
                    </Link>
                  ) : (
                    <b>{item.title}</b>
                  )}
                  <small>
                    {[
                      item.year,
                      href
                        ? item.mediaType === 'movie'
                          ? t('lumen.providerDiscovery.movie', 'Movie')
                          : t('lumen.providerDiscovery.series', 'Series')
                        : t(
                            'lumen.providerDiscovery.noCatalogueMatch',
                            'No catalogue match'
                          ),
                      href ? matchDescription : undefined,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                  {!href && !item.mappingAvailable && (
                    <small>
                      {t(
                        'lumen.providerDiscovery.noStableId',
                        'This title has no stable provider ID for saving a match.'
                      )}
                    </small>
                  )}
                  {animeId && (
                    <Link
                      className="btn btn-quiet btn-sm"
                      to={`/franchise/anime/${animeId}`}
                      aria-label={`${t('lumen.providerDiscovery.exploreFranchise', 'Explore Franchise')}: ${item.title}`}
                    >
                      {t(
                        'lumen.providerDiscovery.exploreFranchise',
                        'Explore Franchise'
                      )}
                    </Link>
                  )}
                </div>
                {(item.mappingAvailable ||
                  item.identityMapped ||
                  item.identityResolution === 'curated' ||
                  item.identityResolution === 'external-id') && (
                  <IdentityMapping item={item} updated={reload} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {enabled && (page > 1 || current?.hasMore) && (
        <nav
          className="toolbar"
          aria-label={t('lumen.providerDiscovery.pages', 'Provider Feed Pages')}
        >
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={page <= 1}
            onClick={() => update('page', String(page - 1), false)}
          >
            {t('lumen.providerDiscovery.previousPage', 'Previous Page')}
          </button>
          <span className="note">
            {t('lumen.providerDiscovery.pageNumber', 'Page {page}', { page })}
          </span>
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={!current?.hasMore || page >= 100}
            onClick={() => update('page', String(page + 1), false)}
          >
            {t('lumen.providerDiscovery.nextPage', 'Next Page')}
          </button>
        </nav>
      )}
    </>
  );
}

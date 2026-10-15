import Button from '@app/components/Common/Button';
import PageTitle from '@app/components/Common/PageTitle';
import IdentityMappingControls from '@app/components/DiscoveryIntegrations/IdentityMappingControls';
import discoveryMessages from '@app/components/DiscoveryIntegrations/messages';
import TmdbTitleCard from '@app/components/TitleCard/TmdbTitleCard';
import globalMessages from '@app/i18n/globalMessages';
import { getDiscoveryFeedFailure } from '@app/utils/discoveryFeedError';
import type { DiscoveryFeedPage } from '@server/lib/discoveryIntegrations/feeds';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import useSWR from 'swr';

const feeds = [
  'trakt/watchlist',
  'trakt/history',
  'trakt/recommendations-movie',
  'trakt/recommendations-tv',
  'anilist/trending',
  'anilist/popular',
  'anilist/top',
  'anilist/next-season',
  'anilist/library',
  'mdblist/list',
] as const;
const labels = [
  discoveryMessages['providers.traktWatchlist'],
  discoveryMessages['providers.traktHistory'],
  discoveryMessages['providers.traktMovieRecommendations'],
  discoveryMessages['providers.traktSeriesRecommendations'],
  discoveryMessages['providers.anilistTrending'],
  discoveryMessages['providers.anilistPopular'],
  discoveryMessages['providers.anilistTop'],
  discoveryMessages['providers.anilistNextSeason'],
  discoveryMessages['providers.anilistLibrary'],
  discoveryMessages['providers.mdblistPublicList'],
];
export default function ProviderDiscoverPage() {
  const intl = useIntl();
  const [feed, setFeed] = useState<string>('anilist/trending');
  const [page, setPage] = useState(1);
  const [draftList, setDraftList] = useState('');
  const [list, setList] = useState('');
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const url =
    feed !== 'mdblist/list' || list
      ? `/api/v1/integrations/discovery/feeds/${feed}?page=${page}${feed === 'mdblist/list' ? `&list=${encodeURIComponent(list)}` : ''}`
      : null;
  const { data, error, isLoading, mutate } = useSWR<DiscoveryFeedPage>(url, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });
  const failure = error ? getDiscoveryFeedFailure(error) : undefined;
  const retryAfterSeconds =
    failure?.kind === 'rate-limited'
      ? (failure.retryAfterSeconds ?? 60)
      : undefined;
  const [retryDeadline, setRetryDeadline] = useState<number>();
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (retryAfterSeconds === undefined) {
      setRetryDeadline(undefined);
      return;
    }

    const deadline = Date.now() + retryAfterSeconds * 1000;
    setRetryDeadline(deadline);
    setNow(Date.now());
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (currentTime >= deadline) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [error, retryAfterSeconds, url]);

  const retryRemaining =
    retryAfterSeconds === undefined
      ? 0
      : retryDeadline === undefined
        ? retryAfterSeconds
        : Math.max(0, Math.ceil((retryDeadline - now) / 1000));
  const displayedItems = data?.items.filter(
    (item) => !unmatchedOnly || !item.tmdbId || !item.mediaType
  );
  return (
    <div className="text-gray-100">
      <PageTitle
        title={intl.formatMessage(discoveryMessages['providers.title'])}
      />
      <h1 className="heading">
        <FormattedMessage {...discoveryMessages['providers.title']} />
      </h1>
      <p className="description mb-6">
        <FormattedMessage {...discoveryMessages['providers.description']} />{' '}
        <Link
          className="text-blue-400"
          href="/profile/settings/linked-accounts"
        >
          <FormattedMessage {...discoveryMessages['providers.manage']} />
        </Link>
      </p>
      <label htmlFor="provider-feed" className="mb-2 block">
        <FormattedMessage {...discoveryMessages['providers.feed']} />
      </label>
      <select
        id="provider-feed"
        className="mb-6 w-full sm:w-auto"
        value={feed}
        onChange={(event) => {
          setFeed(event.target.value);
          setPage(1);
        }}
      >
        {feeds.map((value, index) => (
          <option key={value} value={value}>
            {intl.formatMessage(labels[index])}
          </option>
        ))}
      </select>
      {feed === 'mdblist/list' && (
        <form
          className="mb-6 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setList(draftList.trim());
            setPage(1);
          }}
        >
          <label htmlFor="mdblist-reference" className="flex-1">
            <FormattedMessage {...discoveryMessages['providers.list']} />
            <input
              id="mdblist-reference"
              className="mt-2 w-full"
              maxLength={2048}
              value={draftList}
              onChange={(event) => setDraftList(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={!draftList.trim()}>
            <FormattedMessage {...discoveryMessages['providers.browse']} />
          </Button>
        </form>
      )}
      {error && failure && (
        <div role="alert" className="mb-6 rounded-lg border border-red-500 p-4">
          <p>
            <FormattedMessage
              {...discoveryMessages[
                failure.kind === 'rate-limited'
                  ? 'providers.rateLimited'
                  : failure.kind === 'reconnect'
                    ? 'providers.reconnectRequired'
                    : failure.kind === 'setup-required'
                      ? 'providers.setupRequired'
                      : failure.kind === 'list-not-found'
                        ? 'providers.listNotFound'
                        : 'providers.failed'
              ]}
              values={{ seconds: retryRemaining }}
            />
          </p>
          {failure.kind === 'reconnect' && (
            <Link
              href="/profile/settings/linked-accounts"
              className="mt-3 inline-block text-blue-300 underline"
            >
              <FormattedMessage
                {...discoveryMessages['providers.reconnectAction']}
              />
            </Link>
          )}
          {failure.kind !== 'list-not-found' && (
            <div className="mt-3">
              <Button
                disabled={isLoading || retryRemaining > 0}
                onClick={() => void mutate()}
              >
                <FormattedMessage {...discoveryMessages['providers.retry']} />
              </Button>
            </div>
          )}
        </div>
      )}
      {isLoading && (
        <p role="status">
          <FormattedMessage {...discoveryMessages['providers.loading']} />
        </p>
      )}
      {data?.items.length === 0 && (
        <p>
          <FormattedMessage {...discoveryMessages['providers.empty']} />
        </p>
      )}
      {!!data?.items.length && (
        <div className="mb-4 space-y-2 text-sm text-gray-400">
          {!!data.missingMappings && (
            <p>
              <FormattedMessage {...discoveryMessages['providers.unmapped']} />
            </p>
          )}
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={unmatchedOnly}
              onChange={(event) => setUnmatchedOnly(event.target.checked)}
            />
            <FormattedMessage
              {...discoveryMessages['providers.repairOnly']}
              values={{ count: data.missingMappings }}
            />
          </label>
        </div>
      )}
      {unmatchedOnly && data && displayedItems?.length === 0 && (
        <p className="mb-4 text-sm text-gray-400">
          <FormattedMessage {...discoveryMessages['providers.noUnmatched']} />
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {displayedItems?.map((item) =>
          item.tmdbId && item.mediaType ? (
            <div key={item.id} className="space-y-2">
              <TmdbTitleCard
                id={item.tmdbId}
                tmdbId={item.tmdbId}
                type={item.mediaType}
                title={item.title}
                posterPath={item.imageUrl}
                year={item.year?.toString()}
              />
              {(item.identityMapped ||
                item.identityResolution === 'external-id' ||
                item.identityResolution === 'curated') && (
                <IdentityMappingControls
                  item={item}
                  onUpdated={() => mutate()}
                />
              )}
            </div>
          ) : (
            <article
              key={item.id}
              className="overflow-hidden rounded-lg border border-gray-700 bg-gray-800"
            >
              {item.imageUrl && (
                <Image
                  src={item.imageUrl.replace(
                    'https://s4.anilist.co/',
                    '/imageproxy/anilist/'
                  )}
                  width={300}
                  height={450}
                  unoptimized
                  alt=""
                  loading="lazy"
                  className="aspect-[2/3] w-full object-cover"
                />
              )}
              <div className="p-3">
                <h2 className="font-semibold text-gray-100">{item.title}</h2>
                {item.year && (
                  <p className="text-sm text-gray-400">{item.year}</p>
                )}
                <p className="mt-2 text-xs text-gray-400">
                  <FormattedMessage
                    {...discoveryMessages['providers.matchpending']}
                  />
                </p>
                {item.mappingAvailable ? (
                  <IdentityMappingControls
                    item={item}
                    onUpdated={() => mutate()}
                  />
                ) : (
                  <p className="mt-2 text-xs text-gray-400">
                    <FormattedMessage
                      {...discoveryMessages['providers.noStableIdentity']}
                    />
                  </p>
                )}
              </div>
            </article>
          )
        )}
      </div>
      {data && (
        <nav
          aria-label={intl.formatMessage(globalMessages.discoveryFeedPages)}
          className="my-6 flex items-center justify-between gap-4"
        >
          <Button
            disabled={page === 1 || isLoading}
            onClick={() => setPage((current) => current - 1)}
          >
            <FormattedMessage {...discoveryMessages['providers.previous']} />
          </Button>
          <span>
            <FormattedMessage
              {...discoveryMessages['providers.page']}
              values={{ page }}
            />
          </span>
          <Button
            disabled={!data.hasMore || page >= 100 || isLoading}
            onClick={() => setPage((current) => current + 1)}
          >
            <FormattedMessage {...discoveryMessages['providers.next']} />
          </Button>
        </nav>
      )}
    </div>
  );
}

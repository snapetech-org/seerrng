import { useSearchParams } from 'react-router-dom';
import type { VideoSearchResult } from '../api';
import { useAuth } from '../auth';
import {
  CollectionCard,
  GridSkeleton,
  MoreOnScroll,
  TitleCard,
} from '../components/cards';
import { ExtraHeader, ServiceNote } from '../components/extra';
import {
  discoveryVisibility,
  showDiscoveryTitle,
} from '../discoveryVisibility';
import { useExtras } from '../extras';
import { usePaged, usePublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';
import { PersonCard } from './People';

const mediaOptions = [
  ['all', 'lumen.trending.all', 'All'],
  ['movie', 'lumen.trending.movies', 'Movies'],
  ['tv', 'lumen.trending.series', 'Series'],
] as const;
const windows = [
  ['day', 'lumen.trending.daily', 'Daily'],
  ['week', 'lumen.trending.weekly', 'Weekly'],
] as const;
const identity = (item: VideoSearchResult) => `${item.mediaType}:${item.id}`;

export default function Trending() {
  const [params, setParams] = useSearchParams();
  const { t } = useLumenLocale();
  const extras = useExtras();
  const categoriesReady = extras.ready;
  const movieEnabled = extras.categoryEnabled('movie');
  const tvEnabled = extras.categoryEnabled('tv');
  const media = params.get('mediaType');
  const requestedMediaType =
    media === 'movie' || media === 'tv' ? media : 'all';
  const mediaType =
    requestedMediaType === 'movie' && !movieEnabled
      ? tvEnabled
        ? 'tv'
        : 'all'
      : requestedMediaType === 'tv' && !tvEnabled
        ? movieEnabled
          ? 'movie'
          : 'all'
        : requestedMediaType;
  const timeWindow = params.get('timeWindow') === 'week' ? 'week' : 'day';
  const query = new URLSearchParams({ mediaType, timeWindow });
  const list = usePaged<VideoSearchResult>(
    categoriesReady && (movieEnabled || tvEnabled)
      ? `/discover/trending?${query}`
      : null,
    identity
  );
  const { user } = useAuth();
  const visibility = discoveryVisibility(
    usePublicSettings(),
    user?.permissions
  );
  const items = list.items.filter((item) => {
    if (item.mediaType === 'collection') return movieEnabled;
    if (item.mediaType === 'person') return true;
    if (item.mediaType === 'movie')
      return movieEnabled && showDiscoveryTitle(item, visibility);
    if (item.mediaType === 'tv')
      return tvEnabled && showDiscoveryTitle(item, visibility);
    return showDiscoveryTitle(item, visibility);
  });
  const empty = items.length === 0;
  const filtered = items.length < list.items.length;
  function select(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  }

  return (
    <>
      <ExtraHeader title={t('lumen.trending.title', 'Trending')}>
        <div className="toolbar">
          <div
            className="seg"
            role="group"
            aria-label={t('lumen.trending.media', 'Trending media')}
          >
            {mediaOptions
              .filter(
                ([value]) =>
                  value === 'all' ||
                  (value === 'movie' && movieEnabled) ||
                  (value === 'tv' && tvEnabled)
              )
              .map(([value, message, fallback]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mediaType === value}
                  onClick={() => select('mediaType', value)}
                >
                  {t(message, fallback)}
                </button>
              ))}
          </div>
          <div
            className="seg"
            role="group"
            aria-label={t('lumen.trending.timeWindow', 'Trending time window')}
          >
            {windows.map(([value, message, fallback]) => (
              <button
                key={value}
                type="button"
                aria-pressed={timeWindow === value}
                onClick={() => select('timeWindow', value)}
              >
                {t(message, fallback)}
              </button>
            ))}
          </div>
        </div>
      </ExtraHeader>
      {empty && (
        <ServiceNote
          error={list.error}
          what={t('lumen.trending.title', 'trending titles')}
          title={t('lumen.trending.loadError', 'Couldn’t load trending titles')}
          retry={list.retry}
          retryLabel={t('components.Persius.retry', 'Retry')}
        />
      )}
      {empty && list.loading && <GridSkeleton />}
      {empty && list.done && !list.error && (
        <p className="note">
          {t('lumen.trending.noTitles', 'No trending titles found.')}
        </p>
      )}
      <div className="grid">
        {items.map((item) =>
          item.mediaType === 'person' ? (
            <PersonCard key={identity(item)} person={item} />
          ) : item.mediaType === 'collection' ? (
            <CollectionCard key={identity(item)} collection={item} />
          ) : (
            <TitleCard key={identity(item)} it={item} />
          )
        )}
      </div>
      {filtered && !list.done && (
        <div className="more-scroll">
          <button
            className="btn btn-tonal"
            disabled={list.loading}
            onClick={list.more}
          >
            {list.loading
              ? t('lumen.trending.loading', 'Loading…')
              : t('lumen.trending.showMore', 'Show more trending titles')}
          </button>
        </div>
      )}
      <MoreOnScroll
        done={list.done || filtered}
        loading={list.loading}
        more={list.more}
        error={empty ? null : list.error}
        retry={list.retry}
      />
    </>
  );
}

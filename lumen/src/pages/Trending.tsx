import { useSearchParams } from 'react-router-dom';
import type { VideoSearchResult } from '../api';
import { useAuth } from '../auth';
import {
  CollectionCard,
  GridSkeleton,
  MoreOnScroll,
  TitleCard,
} from '../components/cards';
import { CardTitleToggle } from '../components/CardTitleToggle';
import { ExtraHeader, ServiceNote } from '../components/extra';
import {
  discoveryVisibility,
  showDiscoveryTitle,
} from '../discoveryVisibility';
import { useExtras } from '../extras';
import { usePaged, usePublicSettings } from '../hooks';
import { PersonCard } from './People';

const mediaOptions = [
  ['all', 'All'],
  ['movie', 'Movies'],
  ['tv', 'Series'],
] as const;
const windows = [
  ['day', 'Daily'],
  ['week', 'Weekly'],
] as const;
const identity = (item: VideoSearchResult) => `${item.mediaType}:${item.id}`;

export default function Trending() {
  const [params, setParams] = useSearchParams();
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
      <ExtraHeader title="Trending">
        <div className="toolbar">
          <div className="seg" role="group" aria-label="Trending Media">
            {mediaOptions
              .filter(
                ([value]) =>
                  value === 'all' ||
                  (value === 'movie' && movieEnabled) ||
                  (value === 'tv' && tvEnabled)
              )
              .map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mediaType === value}
                  onClick={() => select('mediaType', value)}
                >
                  {label}
                </button>
              ))}
          </div>
          <div className="seg" role="group" aria-label="Trending Time Window">
            {windows.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={timeWindow === value}
                onClick={() => select('timeWindow', value)}
              >
                {label}
              </button>
            ))}
          </div>
          <CardTitleToggle
            kinds={mediaType === 'all' ? ['movie', 'tv'] : [mediaType]}
          />
        </div>
      </ExtraHeader>
      {empty && (
        <ServiceNote
          error={list.error}
          what="trending titles"
          retry={list.retry}
        />
      )}
      {empty && list.loading && <GridSkeleton />}
      {empty && list.done && !list.error && (
        <p className="note">No trending titles found.</p>
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
            {list.loading ? 'Loading…' : 'Show more trending titles'}
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

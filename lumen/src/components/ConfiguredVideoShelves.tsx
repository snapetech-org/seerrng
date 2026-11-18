import { useEffect, useRef, useState } from 'react';
import type { Paged, VideoSearchResult } from '../api';
import { useApi, usePublicSettings } from '../hooks';
import { PersonCard } from '../pages/People';
import {
  CollectionCard,
  Rail,
  RailSkeleton,
  Section,
  TitleCard,
} from './cards';

// DiscoverSliderType values from SeerrNG's settings API.
const videoFilters = new Map<number, { media: 'movie' | 'tv'; filter: string }>(
  [
    [13, { media: 'movie', filter: 'keywords' }],
    [14, { media: 'movie', filter: 'genre' }],
    [15, { media: 'tv', filter: 'keywords' }],
    [16, { media: 'tv', filter: 'genre' }],
    [18, { media: 'movie', filter: 'studio' }],
    [19, { media: 'tv', filter: 'network' }],
    [20, { media: 'movie', filter: 'streaming' }],
    [21, { media: 'tv', filter: 'streaming' }],
  ] as const
);
const TMDB_SEARCH = 17;
const TMDB_LIST = 28;
const positiveId = (value: string, max = 1_000_000_000) =>
  /^[1-9]\d{0,9}$/.test(value) && Number(value) <= max;

interface DiscoverSlider {
  id: number;
  type: number;
  order: number;
  enabled: boolean;
  title?: string;
  data?: string;
}

interface ShelfPage extends Paged<VideoSearchResult> {
  list?: { name: string };
}

interface ShelfDestination {
  endpoint: string;
  href: string;
}

function shelfDestination(
  slider: DiscoverSlider,
  categories?: Record<string, boolean>
): ShelfDestination | undefined {
  const value = slider.data;
  if (typeof value !== 'string') return;
  if (slider.type === TMDB_LIST && positiveId(value, 2_147_483_647)) {
    return {
      endpoint: `/discover/list/${value}?page=1`,
      href: `/list/${value}`,
    };
  }

  if (slider.type === TMDB_SEARCH) {
    const term = value.trim();
    if (!term || term.length > 256) return;
    return {
      endpoint: `/search?query=${encodeURIComponent(term)}&page=1`,
      href: `/search?${new URLSearchParams({ q: term })}`,
    };
  }

  const spec = videoFilters.get(slider.type);
  if (!spec || categories?.[spec.media] === false) return;
  const query = new URLSearchParams();
  if (spec.filter === 'streaming') {
    const parts = value.split(',');
    if (parts.length !== 2 || !/^[A-Z]{2}$/.test(parts[0])) return;
    const providers = parts[1].split('|');
    if (providers.length > 100 || providers.some((id) => !positiveId(id)))
      return;
    query.set('watchRegion', parts[0]);
    query.set('watchProviders', parts[1]);
  } else {
    const values = spec.filter === 'keywords' ? value.split(',') : [value];
    if (values.length > 20 || values.some((id) => !positiveId(id))) return;
    query.set(spec.filter, value);
  }

  const movies = spec.media === 'movie';
  return {
    endpoint: `/discover/${movies ? 'movies' : 'tv'}?${query}&page=1`,
    href: `/${movies ? 'movies' : 'series'}?${query}`,
  };
}

function VideoShelf({
  id,
  title,
  endpoint,
  href,
}: ShelfDestination & { id: number; title?: string }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const { data, error, reload } = useApi<ShelfPage>(visible ? endpoint : null);

  useEffect(() => {
    const element = anchor.current;
    if (visible || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  const items = data?.results.filter(
    ({ mediaType }) =>
      mediaType === 'movie' ||
      mediaType === 'tv' ||
      mediaType === 'person' ||
      mediaType === 'collection'
  );
  if (items?.length === 0) return null;

  return (
    <div ref={anchor}>
      <Section
        title={title || data?.list?.name || 'Discover Titles'}
        link={['See all', href]}
      >
        {items ? (
          <Rail restoreId={`configured-video-${id}`}>
            {items.map((item) => {
              const key = `${item.mediaType}:${item.id}`;
              if (item.mediaType === 'collection')
                return <CollectionCard key={key} collection={item} />;
              if (item.mediaType === 'person')
                return <PersonCard key={key} person={item} />;
              return <TitleCard key={key} it={item} />;
            })}
          </Rail>
        ) : error ? (
          <div className="empty">
            <span>Couldn’t load this shelf</span>
            <button
              type="button"
              className="btn btn-tonal btn-sm"
              onClick={reload}
            >
              Retry
            </button>
          </div>
        ) : (
          <RailSkeleton />
        )}
      </Section>
    </div>
  );
}

export function ConfiguredVideoShelves() {
  const settings = usePublicSettings();
  const categories = settings?.enabledMediaCategories;
  const visible = categories?.movie !== false || categories?.tv !== false;
  const { data } = useApi<DiscoverSlider[]>(
    visible ? '/settings/discover' : null
  );
  if (!visible || !Array.isArray(data)) return null;

  return data
    .filter((slider) => slider.enabled)
    .sort((a, b) => a.order - b.order)
    .map((slider) => {
      const destination = shelfDestination(slider, categories);
      return destination ? (
        <VideoShelf
          key={`${slider.id}:${destination.endpoint}`}
          id={slider.id}
          title={slider.title}
          {...destination}
        />
      ) : null;
    });
}

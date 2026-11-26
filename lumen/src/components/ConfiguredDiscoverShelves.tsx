import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  tmdbImg,
  type BookResult,
  type Paged,
  type VideoSearchResult,
} from '../api';
import { useAuth } from '../auth';
import {
  readDiscoverCompanyList,
  type DiscoverCompanyKind,
} from '../discoverCompanies';
import {
  createDiscoverNavigationContextId,
  type DiscoverNavigationItem,
} from '../discoverNavigation';
import {
  defaultDiscoverNetworks,
  type DiscoverCompanyData,
} from '../discoverNetworks';
import { defaultDiscoverStudios } from '../discoverStudios';
import {
  discoveryVisibility,
  showDiscoveryTitle,
} from '../discoveryVisibility';
import type { Album } from '../extras';
import { useApi, usePublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';
import { AlbumCard } from '../pages/Music';
import { PersonCard } from '../pages/People';
import { apiQueryString } from '../searchParams';
import {
  BookCard,
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
const BOOK_SUBJECT = 24;
const MUSIC_GENRE = 25;
const MUSIC_CHART = 26;
const chartSorts = new Set(['popular.week', 'popular.month', 'popular.year']);
const TMDB_LIST = 28;
const STUDIOS = 8;
const NETWORKS = 12;
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

interface ShelfPage extends Paged<VideoSearchResult | BookResult | Album> {
  list?: { name: string };
}

interface ShelfDestination {
  endpoint: string;
  href: string;
  kind?: 'books' | 'music';
}

function shelfDestination(
  slider: DiscoverSlider,
  categories: Record<string, boolean> | undefined,
  bookFormat: 'ebook' | 'audiobook' | undefined,
  showMusic: boolean
): ShelfDestination | undefined {
  const value = slider.data;
  if (typeof value !== 'string') return;
  if (slider.type === BOOK_SUBJECT) {
    const subject = value.trim();
    if (!bookFormat || !subject || subject.length > 512) return;
    const query = new URLSearchParams({ subject });
    return {
      endpoint: `/discover/books?${query}&sortBy=ranked&page=1`,
      href: `/${bookFormat === 'ebook' ? 'books' : 'audiobooks'}?${query}`,
      kind: 'books',
    };
  }

  if (slider.type === MUSIC_GENRE || slider.type === MUSIC_CHART) {
    if (!showMusic) return;
    const valueForShelf = value.trim();
    const query = new URLSearchParams();
    if (slider.type === MUSIC_GENRE) {
      if (!valueForShelf || valueForShelf.length > 512) return;
      query.set('genre', valueForShelf);
      query.set('sort', 'ranked');
    } else {
      if (!chartSorts.has(valueForShelf)) return;
      query.set('sort', valueForShelf);
    }
    const endpoint = new URLSearchParams(query);
    endpoint.set('sortBy', endpoint.get('sort') ?? 'ranked');
    endpoint.delete('sort');
    endpoint.set('page', '1');
    return {
      endpoint: `/discover/music?${apiQueryString(endpoint)}`,
      href: `/music?${query}`,
      kind: 'music',
    };
  }

  if (categories?.movie === false && categories.tv === false) return;
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

function DiscoverShelf({
  id,
  title,
  endpoint,
  href,
  kind,
  visibility,
}: ShelfDestination & {
  id: number;
  title?: string;
  visibility: ReturnType<typeof discoveryVisibility>;
}) {
  const { t } = useLumenLocale();
  const [discoverContextId] = useState(createDiscoverNavigationContextId);
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

  const items = data?.results.filter((item) => {
    if (kind === 'music')
      return item.mediaType === 'album' && showDiscoveryTitle(item, visibility);
    if (kind === 'books') return item.mediaType === 'book';
    if (item.mediaType === 'movie' || item.mediaType === 'tv')
      return showDiscoveryTitle(item, visibility);
    return item.mediaType === 'person' || item.mediaType === 'collection';
  });
  const discoverItems: DiscoverNavigationItem[] =
    items?.flatMap((item) =>
      (item.mediaType === 'movie' || item.mediaType === 'tv') &&
      Number.isSafeInteger(Number(item.id)) &&
      Number(item.id) > 0
        ? [{ id: Number(item.id), mediaType: item.mediaType }]
        : []
    ) ?? [];
  if (items?.length === 0) return null;

  return (
    <div ref={anchor}>
      <Section
        title={
          title ||
          data?.list?.name ||
          t('lumen.discover.discoverTitles', 'Discover Titles')
        }
        link={[t('components.Persius.seeAll', 'See All'), href]}
      >
        {items ? (
          <Rail restoreId={`configured-video-${id}`}>
            {items.map((item) => {
              const key = `${item.mediaType}:${item.id}`;
              if (item.mediaType === 'album')
                return <AlbumCard key={key} a={item} />;
              if (item.mediaType === 'book')
                return (
                  <BookCard
                    key={`${key}:${item.bookFormat ?? 'ebook'}`}
                    b={item}
                  />
                );
              if (item.mediaType === 'collection')
                return <CollectionCard key={key} collection={item} />;
              if (item.mediaType === 'person')
                return <PersonCard key={key} person={item} />;
              return (
                <TitleCard
                  key={key}
                  it={item}
                  discoverContextId={discoverContextId}
                  discoverItems={discoverItems}
                />
              );
            })}
          </Rail>
        ) : error ? (
          <div className="empty">
            <span>
              {t('lumen.discover.shelfLoadFailed', 'Couldn’t load this shelf')}
            </span>
            <button
              type="button"
              className="btn btn-tonal btn-sm"
              onClick={reload}
            >
              {t('lumen.account.retry', 'Retry')}
            </button>
          </div>
        ) : (
          <RailSkeleton />
        )}
      </Section>
    </div>
  );
}

function CompanyShelf({
  title,
  companies,
  kind,
}: {
  title: string;
  companies: readonly DiscoverCompanyData[];
  kind: DiscoverCompanyKind;
}) {
  const { t } = useLumenLocale();
  if (companies.length === 0) return null;
  const isStudio = kind === 'studio';
  const basePath = isStudio ? '/movies?studio=' : '/series?network=';
  const restoreId = isStudio
    ? 'configured-discover-studios'
    : 'configured-discover-networks';

  return (
    <Section
      title={title}
      link={[
        t('components.Persius.seeAll', 'See All'),
        isStudio ? '/movies' : '/series',
      ]}
    >
      <Rail restoreId={restoreId}>
        {companies.map((company) => (
          <Link
            key={`${kind}-${company.id}`}
            className={`company-logo-card ${company.logoTone === 'white' ? 'white-logo-card' : ''}`}
            to={`${basePath}${company.id}`}
            aria-label={t(
              isStudio
                ? 'lumen.accessibility.browseMoviesFromCompany'
                : 'lumen.accessibility.browseSeriesFromCompany',
              isStudio
                ? 'Browse movies from {name}'
                : 'Browse series from {name}',
              { name: company.name }
            )}
          >
            <span className="company-logo-card-art">
              <img
                src={
                  company.logoPath.startsWith('/images/')
                    ? company.logoPath
                    : tmdbImg(company.logoPath, 'original')
                }
                alt=""
                loading="lazy"
                className={company.logoTone === 'white' ? 'white-logo' : ''}
              />
            </span>
            <span className="company-logo-card-name">{company.name}</span>
          </Link>
        ))}
      </Rail>
    </Section>
  );
}

export function ConfiguredDiscoverShelves({
  showBooks,
  showMusic,
  enabledCategories,
}: {
  showBooks: boolean;
  showMusic: boolean;
  enabledCategories: Record<string, boolean>;
}) {
  const settings = usePublicSettings();
  const { user } = useAuth();
  const visibility = discoveryVisibility(settings, user?.permissions);
  const categories = settings?.enabledMediaCategories;
  const ebook =
    showBooks &&
    enabledCategories.ebook !== false &&
    categories?.ebook !== false &&
    (settings?.ebookServiceEnabled ?? settings?.booksEnabled);
  const audio =
    showBooks &&
    enabledCategories.audiobook !== false &&
    categories?.audiobook !== false &&
    (settings?.audiobookServiceEnabled ?? settings?.booksEnabled);
  const bookFormat = ebook ? 'ebook' : audio ? 'audiobook' : undefined;
  const visible =
    showMusic ||
    !!bookFormat ||
    (categories?.movie !== false && enabledCategories.movie !== false) ||
    (categories?.tv !== false && enabledCategories.tv !== false);
  const { data } = useApi<DiscoverSlider[]>(
    visible ? '/settings/discover' : null
  );
  if (!visible || !Array.isArray(data)) return null;

  return data
    .filter((slider) => slider.enabled)
    .sort((a, b) => a.order - b.order)
    .map((slider) => {
      const companyKind: DiscoverCompanyKind | undefined =
        slider.type === STUDIOS
          ? 'studio'
          : slider.type === NETWORKS
            ? 'network'
            : undefined;
      if (companyKind) {
        const isStudio = companyKind === 'studio';
        if (categories?.[isStudio ? 'movie' : 'tv'] === false) return null;
        const defaults = isStudio
          ? defaultDiscoverStudios
          : defaultDiscoverNetworks;
        const { companies } = readDiscoverCompanyList(
          slider.data,
          defaults,
          companyKind
        );
        return (
          <CompanyShelf
            key={`${slider.id}:${companyKind}`}
            title={slider.title || (isStudio ? 'Studios' : 'Networks')}
            companies={companies}
            kind={companyKind}
          />
        );
      }
      const destination = shelfDestination(
        slider,
        categories,
        bookFormat,
        showMusic
      );
      return destination ? (
        <DiscoverShelf
          key={`${slider.id}:${destination.endpoint}`}
          id={slider.id}
          title={slider.title}
          visibility={
            destination.kind === 'music' || slider.type === TMDB_SEARCH
              ? { ...visibility, hideRequested: false }
              : visibility
          }
          {...destination}
        />
      ) : null;
    });
}

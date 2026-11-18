type SwipeMediaType =
  | 'movie'
  | 'tv'
  | 'book'
  | 'audiobook'
  | 'comic'
  | 'magazine'
  | 'music'
  | 'sports'
  | 'adult'
  | 'software-retro'
  | 'software-modern'
  | 'software-game';

// Numeric values defined by the media API.
const AVAILABLE = 5;
const PROCESSING = 3;

export interface SwipeSoftwareTarget {
  category: 'retro' | 'modern' | 'game';
  catalogProvider: 'igdb' | 'dat';
  catalogId: string;
  igdbId?: number;
  systems: { slug: string; name: string }[];
  pcVariants: {
    operatingSystem: 'windows' | 'linux' | 'macos';
    architecture: 'x64' | 'arm64' | 'x86' | 'universal';
  }[];
}

export interface SwipeCardData {
  mediaType: SwipeMediaType;
  id: string;
  title: string;
  subtitle?: string;
  year?: number;
  overview?: string;
  imageUrl?: string;
  rating?: number;
  authorId?: string;
  serviceId?: number;
  tags: string[];
  because?: string;
  reason?: string;
  software?: SwipeSoftwareTarget;
}

export const MAX_SWIPE_SOFTWARE_CURSOR_LENGTH = 20_000;

export interface SwipeCatalogFilters {
  query: string;
  genre: string;
  yearFrom: string;
  yearTo: string;
  minimumRating: string;
  publisher: string;
  magazineCatalog: 'tracked' | 'public';
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const text = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
};

const number = (value: unknown): number | undefined => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed)
    ? parsed
    : undefined;
};

const year = (value: unknown): number | undefined => {
  const parsed = number(value);
  if (parsed && parsed >= 1800 && parsed <= 2200) return Math.floor(parsed);
  const match = typeof value === 'string' ? /^(\d{4})/.exec(value) : undefined;
  const parsedYear = match ? Number(match[1]) : undefined;
  return parsedYear && parsedYear >= 1800 && parsedYear <= 2200
    ? parsedYear
    : undefined;
};

const safeImage = (value: unknown): string | undefined => {
  const image = text(value);
  if (
    image &&
    (/^https?:\/\//i.test(image) ||
      image.startsWith('/api/') ||
      image.startsWith('/images/') ||
      image.startsWith('/imageproxy/'))
  ) {
    return image;
  }
  return undefined;
};

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map(text)
        .filter((item): item is string => !!item)
        .slice(0, 16)
    : [];

const isAlreadyHandled = (item: Record<string, unknown>): boolean => {
  const mediaInfo = record(item.mediaInfo);
  const requestStatus = text(mediaInfo?.requestStatus)?.toLowerCase();
  const availability = text(item.availability)?.toLowerCase();
  const libraryState = text(item.libraryState)?.toLowerCase();
  return (
    item.requestable === false ||
    item.hasFile === true ||
    item.available === true ||
    availability === 'available' ||
    availability === 'owned' ||
    availability === 'tracked' ||
    availability === 'downloading' ||
    libraryState === 'requested' ||
    libraryState === 'monitored' ||
    requestStatus === 'pending' ||
    requestStatus === 'approved' ||
    number(mediaInfo?.status) === AVAILABLE ||
    number(mediaInfo?.status) === PROCESSING
  );
};

const artistNames = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((credit) => {
      const source = record(credit);
      return text(source?.name) ?? text(record(source?.artist)?.name);
    })
    .filter((item): item is string => !!item)
    .slice(0, 4);
};

const softwareTarget = (
  item: Record<string, unknown>,
  mediaType: SwipeMediaType
): SwipeSoftwareTarget | undefined => {
  if (!mediaType.startsWith('software-')) return undefined;
  const category = mediaType.slice('software-'.length);
  if (category !== 'retro' && category !== 'modern' && category !== 'game') {
    return undefined;
  }
  const catalogProvider = item.catalogProvider === 'dat' ? 'dat' : 'igdb';
  const catalogId =
    text(item.catalogId) ?? text(item.id) ?? text(item.catalogKey);
  if (!catalogId) return undefined;
  const systems = Array.isArray(item.emulationSystems)
    ? item.emulationSystems.flatMap((system) => {
        const source = record(system);
        const slug = text(source?.slug);
        const name = text(source?.name);
        const group = text(source?.group);
        return slug && name && group === category ? [{ slug, name }] : [];
      })
    : [];
  const pcOptions = Array.isArray(item.platformOptions)
    ? item.platformOptions.map((option) => text(record(option)?.name) ?? '')
    : [];
  const pcVariants: SwipeSoftwareTarget['pcVariants'] = [];
  for (const operatingSystem of ['windows', 'linux', 'macos'] as const) {
    const platformName = operatingSystem === 'macos' ? 'mac' : operatingSystem;
    if (
      pcOptions.some((option) => option.toLowerCase().includes(platformName))
    ) {
      for (const architecture of [
        'x64',
        'arm64',
        'x86',
        'universal',
      ] as const) {
        pcVariants.push({ operatingSystem, architecture });
      }
    }
  }
  const igdbId = number(item.igdbId);
  return {
    category,
    catalogProvider,
    catalogId,
    ...(igdbId ? { igdbId } : {}),
    systems,
    pcVariants,
  };
};

const toCard = (
  mediaType: SwipeMediaType,
  source: unknown
): SwipeCardData | undefined => {
  const item = record(source);
  if (!item || isAlreadyHandled(item)) return undefined;
  const title = text(item.title) ?? text(item.name);
  const rawId = text(item.id) ?? text(item.externalId);
  if (!title || !rawId || rawId.length > 512) return undefined;
  const poster =
    safeImage(item.imageUrl) ??
    safeImage(item.posterPath) ??
    safeImage(item.coverUrl) ??
    safeImage(record(item.image)?.medium_url) ??
    safeImage(record(item.image)?.small_url);
  const mediaInfo = record(item.mediaInfo);
  const serviceId = number(item.serviceId);
  const bookAuthorId = text(item.authorId) ?? text(item.authorKey);
  const bookAuthors = stringList(item.author_name ?? item.authors).slice(0, 4);
  const artistCredits = artistNames(item['artist-credit']);
  const software = softwareTarget(item, mediaType);
  const releaseYear = year(
    item.year ??
      item.startYear ??
      item.start_year ??
      item.firstPublishYear ??
      item.releaseDate ??
      item['first-release-date']
  );
  const rawRating = number(
    item.ratingsAverage ?? item.rating ?? item.voteAverage
  );
  const bookRating = mediaType === 'book' || mediaType === 'audiobook';
  const rating =
    rawRating !== undefined && rawRating >= 0 && rawRating <= 100
      ? Math.round(
          (rawRating > (bookRating ? 5 : 10) ? rawRating / 10 : rawRating) * 10
        ) / 10
      : undefined;
  const tags = [
    ...stringList(item.tags),
    ...stringList(item.genres),
    ...stringList(item.subjects),
  ].slice(0, 16);

  const subtitleParts = [
    text(item.publisher),
    text(item.studio),
    ...bookAuthors,
    ...artistCredits,
    ...stringList(item.performers),
    text(item.sport),
    text(item.country),
    text(item.latestIssue),
    releaseYear,
  ].filter((value): value is string | number => !!value);
  if (mediaType.startsWith('software-')) {
    const systems = software?.systems.map(({ name }) => name) ?? [];
    subtitleParts.unshift(
      systems.length
        ? systems.slice(0, 3).join(' · ')
        : mediaType.slice('software-'.length)
    );
  }
  if (
    mediaType === 'comic' &&
    number(item.issueCount ?? item.count_of_issues)
  ) {
    subtitleParts.push(
      `${number(item.issueCount ?? item.count_of_issues)} issues`
    );
  }

  const overview =
    text(item.overview) ?? text(item.description) ?? text(item.deck);
  const card: SwipeCardData = {
    mediaType,
    id: rawId,
    title,
    ...(subtitleParts.length ? { subtitle: subtitleParts.join(' · ') } : {}),
    ...(releaseYear ? { year: releaseYear } : {}),
    ...(overview ? { overview: overview.slice(0, 800) } : {}),
    ...(poster ? { imageUrl: poster } : {}),
    ...(rating !== undefined ? { rating } : {}),
    ...(bookAuthorId ? { authorId: bookAuthorId } : {}),
    ...(serviceId !== undefined ? { serviceId } : {}),
    tags,
    ...(text(item.because) ? { because: text(item.because) } : {}),
    ...(software ? { software } : {}),
  };
  // Magazine identities are titles in the existing request contract.
  if (mediaType === 'magazine') card.id = title;
  if (
    mediaType.startsWith('software-') &&
    (!software ||
      (software.category === 'game'
        ? software.pcVariants.length === 0
        : software.systems.length === 0))
  ) {
    return undefined;
  }
  if (mediaType === 'audiobook' && !card.authorId) {
    card.authorId = text(mediaInfo?.authorId);
  }
  return card;
};

export const normalizeSwipeCatalogCards = (
  mediaType: SwipeMediaType,
  response: unknown
): SwipeCardData[] => {
  const payload = record(response);
  const values = Array.isArray(payload?.cards)
    ? payload.cards
    : Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(response)
        ? response
        : [];
  const cards = values
    .map((item) => toCard(mediaType, item))
    .filter((card): card is SwipeCardData => !!card);
  const unique = new Set<string>();
  return cards
    .filter((card) => {
      if (unique.has(card.id)) return false;
      unique.add(card.id);
      return true;
    })
    .slice(0, 60);
};

export const filterSwipeCards = (
  cards: SwipeCardData[],
  filters: SwipeCatalogFilters
): SwipeCardData[] => {
  const query = filters.query.trim().toLocaleLowerCase();
  const genre = filters.genre.trim().toLocaleLowerCase();
  const yearFrom = number(filters.yearFrom);
  const yearTo = number(filters.yearTo);
  const minimumRating = number(filters.minimumRating);
  return cards.filter((card) => {
    if (
      query &&
      ![card.title, card.subtitle, card.overview, ...card.tags]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(query))
    ) {
      return false;
    }
    if (
      genre &&
      !card.tags.some((tag) => tag.toLocaleLowerCase().includes(genre))
    ) {
      return false;
    }
    if (yearFrom && (!card.year || card.year < yearFrom)) return false;
    if (yearTo && (!card.year || card.year > yearTo)) return false;
    if (
      minimumRating &&
      (card.rating === undefined || card.rating < minimumRating)
    ) {
      return false;
    }
    return true;
  });
};

export const shuffleSwipeCards = <T extends { id: string }>(
  cards: T[],
  seed: string
): T[] => {
  let state = 0x811c9dc5;
  for (const character of seed) {
    state = Math.imul(state ^ character.charCodeAt(0), 0x01000193);
  }
  if (state === 0) state = 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
};

export const swipeCatalogUrl = (
  mediaType: SwipeMediaType,
  filters: SwipeCatalogFilters,
  page: number,
  shuffleSeed: string,
  cursor?: string
): string => {
  if (mediaType === 'movie' || mediaType === 'tv' || mediaType === 'book') {
    return `/api/v1/swipe/deck?mediaType=${mediaType}`;
  }
  const params = new URLSearchParams({ page: String(page) });
  const query = filters.query.trim();
  if (mediaType === 'audiobook') {
    params.set('format', 'audiobook');
    params.set('sortBy', 'random');
    params.set('shuffleSeed', shuffleSeed);
    if (query) params.set('query', query);
    if (filters.genre.trim()) params.set('subject', filters.genre.trim());
    return `/api/v1/discover/books?${params}`;
  }
  if (mediaType === 'comic') {
    params.set('query', query || '*');
    if (filters.publisher.trim())
      params.set('publisher', filters.publisher.trim());
    if (filters.yearFrom.trim()) params.set('startYear', filters.yearFrom);
    return `/api/v1/discover/comics?${params}`;
  }
  if (mediaType === 'magazine') {
    params.set('catalog', filters.magazineCatalog);
    if (query) params.set('query', query);
    return `/api/v1/discover/magazines?${params}`;
  }
  if (mediaType === 'music') {
    params.set('sortBy', 'ranked');
    params.set('shuffleSeed', shuffleSeed);
    if (query) params.set('query', query);
    if (filters.genre.trim()) params.set('genre', filters.genre.trim());
    if (filters.yearFrom.trim()) {
      params.set('primaryReleaseDateGte', `${filters.yearFrom}-01-01`);
    }
    if (filters.yearTo.trim()) {
      params.set('primaryReleaseDateLte', `${filters.yearTo}-12-31`);
    }
    return `/api/v1/discover/music?${params}`;
  }
  if (mediaType === 'sports') {
    if (query) params.set('query', query);
    return `/api/v1/discover/sports?${params}`;
  }
  if (mediaType === 'adult') {
    if (query) params.set('query', query);
    return `/api/v1/adult/search?${params}`;
  }
  if (mediaType.startsWith('software-')) {
    const category = mediaType.slice('software-'.length);
    if (query) {
      params.set('category', category);
      params.set('q', query);
      params.set('limit', '20');
      if (cursor) params.set('cursor', cursor);
      if (filters.genre.trim()) params.set('genre', filters.genre.trim());
      return `/api/v1/request/software/catalog/search?${params}`;
    }
    params.set('category', category);
    params.set('limit', '20');
    params.set('offset', String((page - 1) * 20));
    if (filters.genre.trim()) params.set('genre', filters.genre.trim());
    return `/api/v1/request/software/catalog/popular?${params}`;
  }
  return `/api/v1/swipe/deck?mediaType=movie`;
};

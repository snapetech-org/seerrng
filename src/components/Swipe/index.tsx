import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import Modal from '@app/components/Common/Modal';
import PageTitle from '@app/components/Common/PageTitle';
import DiscoveryModeTabs, {
  discoveryMediaTypeForPath,
  safeSwipeReturnTo,
  type SwipeContextMediaType,
} from '@app/components/Discover/DiscoveryModeTabs';
import SwipeCardView, {
  type SwipeDirection,
} from '@app/components/Swipe/SwipeCardView';
import {
  filterSwipeCards,
  MAX_SWIPE_SOFTWARE_CURSOR_LENGTH,
  normalizeSwipeCatalogCards,
  shuffleSwipeCards,
  swipeCatalogUrl,
  type SwipeCardData,
  type SwipeCatalogFilters,
  type SwipeSoftwareTarget,
} from '@app/components/Swipe/swipeCatalog';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import {
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  CheckIcon,
  ClockIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { SwipeMediaType } from '@server/entity/SwipeDecision';
import type { SwipeFavoriteSeed } from '@server/entity/SwipeProfile';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { useSWRConfig } from 'swr';

interface DeckResponse {
  mediaType: SwipeMediaType;
  ranked: boolean;
  remaining: number;
  cards: SwipeCardData[];
  nextCursor?: string | null;
}

interface SwipeProfile {
  tasteNotes: string;
  seriesRequest: 'first-season' | 'all-seasons';
  bookFormat: 'ebook' | 'audiobook';
  seedScope: 'full' | 'rated' | 'favorites';
  favoriteSeeds: SwipeFavoriteSeed[];
}

const messages = defineMessages('components.Swipe', {
  title: 'Swipe',
  unavailable:
    'Swipe is not available. An administrator may have turned it off, or your account cannot make requests.',
  intro:
    'Swipe right to request, left to pass, or up if you have already seen or read it.',
  movies: 'Movies',
  series: 'Series',
  books: 'Books',
  audiobooks: 'Audiobooks',
  comics: 'Comics',
  magazines: 'Magazines',
  music: 'Music',
  sports: 'Sports',
  adult: 'Adult',
  retro: 'Retro',
  modern: 'Modern',
  pcGames: 'PC Games',
  request: 'Request',
  pass: 'Pass',
  seen: 'Seen It',
  undo: 'Undo',
  preferences: 'Preferences',
  history: 'History',
  filters: 'Filters',
  search: 'Search titles, creators, descriptions, or genres',
  applyFilters: 'Apply filters',
  resetFilters: 'Reset',
  genreOrSubject: 'Genre or subject',
  yearFrom: 'From year',
  yearTo: 'Through year',
  minimumRating: 'Minimum rating',
  publisher: 'Publisher',
  magazineSource: 'Magazine catalog',
  trackedCatalog: 'Tracked by LazyLibrarian',
  publicCatalog: 'Public search',
  filteredCount: '{count} picks match',
  decisionSummary: '{count} reviewed in this deck',
  noResultsSearch: 'Try a search to bring this catalog into your deck.',
  adultPrivacy:
    'Adult discovery stays within your Whisparr catalog. Titles and history are never sent to AI ordering.',
  softwareTarget: 'Choose where this title should go',
  chooseSystem: 'System',
  chooseOperatingSystem: 'Operating system',
  chooseArchitecture: 'Architecture',
  noSoftwareTarget: 'This title has no available request target.',
  reviewHistory: 'Review past decisions',
  clearHistory: 'Clear passes and seen',
  restore: 'Bring back',
  requestedInRequests: 'Requested · manage in Requests',
  noHistory: 'Your Swipe history will show up here.',
  historyLoadError: 'Swipe history could not be loaded.',
  historyLimit: 'Showing the most recent 200 decisions.',
  historyCleared: 'Passes and seen titles were cleared.',
  restored: 'Decision removed. This title can appear again.',
  requestSavedHistoryFailed:
    'The request was created, but Swipe could not save its history.',
  requestNeedsTarget: 'Choose a request target to continue.',
  invalidFilters: 'Check the year and rating filters, then try again.',
  activeFilters: '{count} filters',
  openDetails: 'More about this pick',
  updated: 'Pick list updated.',
  read: 'Seen / Read',
  discoverSearchHint:
    'Search a title, creator, description, or genre to narrow this catalog.',
  adultSearchHint:
    'Search Whisparr for scenes to review. Adult activity stays private to your account.',
  sportsSearchHint: 'Search a team, league, or competition to start a deck.',
  magazineSearchHint: 'Browse tracked magazines or search the public catalog.',
  refresh: 'New Picks',
  refreshFailed: 'These picks could not be refreshed. Try again.',
  aiRanked: 'Ordered for you by AI',
  loadError: 'Recommendations could not be loaded.',
  retry: 'Retry',
  empty: 'You Are All Caught Up',
  emptyHelp:
    'Request or swipe a few more titles elsewhere, then check back for new picks.',
  requested: '{title} requested.',
  requestFailed: '{title} could not be requested: {reason}',
  undone: 'Brought back {title}.',
  saveFailed: 'Your swipe could not be saved. Try again.',
  keyboardHint: 'Keyboard: ← pass, → request, ↑ seen it, Backspace to undo.',
  tasteNotes: 'What Are You in the Mood For?',
  tasteNotesHelp:
    'Optional. Used to order your picks when AI ordering is turned on, for example “cozy mysteries” or “nothing too scary”.',
  seriesRequest: 'When I Request a Series',
  firstSeason: 'Request the first season',
  allSeasons: 'Request every season',
  bookFormat: 'When I Request a Book',
  seedScope: 'Recommendation seeds',
  fullScope: 'Full catalog',
  ratedScope: 'Rated only',
  favoritesScope: 'Pick my favorites',
  seedScopeHelp:
    'Rated only uses items you rated in your linked Plex, Jellyfin, or Emby library for movies and series. Favorites uses the items selected below; choose Favorites to seed book suggestions from selected books.',
  favoriteItems: 'Choose up to 25 favorites',
  favoriteCount: '{count} of 25 selected',
  noFavoriteItems:
    'No library items, requests, or past liked titles are available to choose yet.',
  audiobook: 'Request the audiobook',
  ebook: 'Request the ebook',
  save: 'Save',
  close: 'Close',
});

const TABS: { mediaType: SwipeMediaType; label: keyof typeof messages }[] = [
  { mediaType: 'movie', label: 'movies' },
  { mediaType: 'tv', label: 'series' },
  { mediaType: 'book', label: 'books' },
  { mediaType: 'audiobook', label: 'audiobooks' },
  { mediaType: 'comic', label: 'comics' },
  { mediaType: 'magazine', label: 'magazines' },
  { mediaType: 'music', label: 'music' },
  { mediaType: 'sports', label: 'sports' },
  { mediaType: 'software-retro', label: 'retro' },
  { mediaType: 'software-modern', label: 'modern' },
  { mediaType: 'software-game', label: 'pcGames' },
  { mediaType: 'adult', label: 'adult' },
];

const DEFAULT_FILTERS: SwipeCatalogFilters = {
  query: '',
  genre: '',
  yearFrom: '',
  yearTo: '',
  minimumRating: '',
  publisher: '',
  magazineCatalog: 'tracked',
};

const SWIPE_MEDIA_TYPES = TABS.map(({ mediaType }) => mediaType);

const deckSourcePath: Partial<Record<SwipeMediaType, string>> = {
  movie: '/discover/movies',
  tv: '/discover/tv',
  book: '/discover/books',
  audiobook: '/discover/audiobooks',
  comic: '/discover/comics',
  magazine: '/discover/magazines',
  music: '/discover/music',
  sports: '/discover/sports',
  adult: '/discover/adult',
};

const isSwipeMediaType = (value: unknown): value is SwipeMediaType =>
  typeof value === 'string' &&
  SWIPE_MEDIA_TYPES.includes(value as SwipeMediaType);

const EXIT_MS = 320;
const REFILL_BELOW = 4;

const DECISION: Record<SwipeDirection, 'want' | 'pass' | 'seen'> = {
  right: 'want',
  left: 'pass',
  up: 'seen',
};

/** The normal media request a right swipe submits. Exposed for tests. */
export const requestBodyFor = (
  card: SwipeCardData,
  profile: SwipeProfile
): Record<string, unknown> | undefined => {
  if (card.mediaType === 'movie') {
    return { mediaType: 'movie', mediaId: Number(card.id) };
  }
  if (card.mediaType === 'tv') {
    return {
      mediaType: 'tv',
      mediaId: Number(card.id),
      seasons: profile.seriesRequest === 'all-seasons' ? 'all' : [1],
    };
  }
  if (card.mediaType === 'book' || card.mediaType === 'audiobook') {
    return {
      mediaType: 'book',
      mediaId: card.id,
      authorId: card.authorId,
      format: card.mediaType === 'audiobook' ? 'audiobook' : profile.bookFormat,
    };
  }
  if (card.mediaType === 'comic') {
    return { mediaType: 'comic', mediaId: Number(card.id) };
  }
  if (card.mediaType === 'magazine') {
    return {
      mediaType: 'magazine',
      mediaId: card.id,
      ...(card.serviceId !== undefined ? { serverId: card.serviceId } : {}),
    };
  }
  if (card.mediaType === 'music') {
    return { mediaType: 'music', mediaId: card.id };
  }
  if (card.mediaType === 'sports') {
    return {
      mediaType: 'sports',
      mediaId: card.id,
      ...(card.serviceId !== undefined ? { serverId: card.serviceId } : {}),
    };
  }
  if (card.mediaType === 'adult') {
    return {
      mediaType: 'adult',
      mediaId: card.id,
      ...(card.serviceId !== undefined ? { serverId: card.serviceId } : {}),
    };
  }
  return undefined;
};

export const softwareRequestBodyFor = (
  software: SwipeSoftwareTarget,
  target: { system?: string; operatingSystem?: string; architecture?: string }
): Record<string, unknown> | undefined => {
  if (software.category === 'game') {
    if (!target.operatingSystem || !target.architecture) return undefined;
    return {
      category: software.category,
      catalogProvider: software.catalogProvider,
      ...(software.catalogProvider === 'dat'
        ? { catalogKey: software.catalogId }
        : { catalogId: software.igdbId ?? Number(software.catalogId) }),
      variant: {
        operatingSystem: target.operatingSystem,
        architecture: target.architecture,
      },
    };
  }
  if (!target.system) return undefined;
  return {
    category: software.category,
    catalogProvider: software.catalogProvider,
    ...(software.catalogProvider === 'dat'
      ? { catalogKey: software.catalogId }
      : { catalogId: software.igdbId ?? Number(software.catalogId) }),
    platformSlug: target.system,
  };
};

const errorMessage = (error: unknown) =>
  axios.isAxiosError(error) && typeof error.response?.data?.message === 'string'
    ? error.response.data.message
    : axios.isAxiosError(error) &&
        typeof error.response?.data?.error === 'string'
      ? error.response.data.error
      : undefined;

interface SwipeHistoryDecision {
  mediaType: SwipeMediaType;
  id: string;
  title: string;
  decision: 'want' | 'pass' | 'seen';
  createdAt: string;
  card: SwipeCardData;
}

const Swipe = () => {
  const router = useRouter();
  const intl = useIntl();
  const { addToast } = useToasts();
  const { mutate: mutateKey } = useSWRConfig();
  const [mediaType, setMediaType] = useState<SwipeMediaType>('movie');
  const [cards, setCards] = useState<SwipeCardData[]>([]);
  const [exiting, setExiting] = useState<{
    id: string;
    direction: SwipeDirection;
  }>();
  const exitTimer = useRef<number | undefined>(undefined);
  const cancelPendingExit = useCallback(() => {
    if (exitTimer.current !== undefined) {
      window.clearTimeout(exitTimer.current);
      exitTimer.current = undefined;
    }
    setExiting(undefined);
  }, []);
  const [busy, setBusy] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [draftProfile, setDraftProfile] = useState<SwipeProfile>();
  const [page, setPage] = useState(1);
  const [shuffleSeed, setShuffleSeed] = useState('first');
  const [softwareCursors, setSoftwareCursors] = useState<{
    key: string;
    pages: Record<number, string>;
  }>({ key: '', pages: {} });
  const [softwareCard, setSoftwareCard] = useState<SwipeCardData>();
  const [softwareTarget, setSoftwareTarget] = useState<{
    system: string;
    operatingSystem: string;
    architecture: string;
  }>({ system: '', operatingSystem: '', architecture: '' });
  const [filtersByType, setFiltersByType] = useState<
    Partial<Record<SwipeMediaType, SwipeCatalogFilters>>
  >({});
  const [draftFilters, setDraftFilters] = useState<SwipeCatalogFilters>();
  const [queryDraft, setQueryDraft] = useState('');
  const lastLoaded = useRef<string>(undefined);
  const returnTo = safeSwipeReturnTo(router.query.returnTo);
  const returnMediaType = returnTo
    ? discoveryMediaTypeForPath(returnTo)
    : undefined;
  const discoveryMediaType: SwipeContextMediaType =
    mediaType === 'software-retro' ||
    mediaType === 'software-modern' ||
    mediaType === 'software-game'
      ? (returnMediaType ?? 'movie')
      : mediaType;

  const filters = filtersByType[mediaType] ?? DEFAULT_FILTERS;
  const filtersForMode = (filtersByType[mediaType] ??
    DEFAULT_FILTERS) as SwipeCatalogFilters;

  useEffect(() => {
    setQueryDraft(filters.query);
  }, [filters.query, mediaType]);

  useEffect(() => {
    if (!router.isReady) return;
    const nextMediaType = isSwipeMediaType(router.query.mediaType)
      ? router.query.mediaType
      : 'movie';
    setMediaType((current) =>
      current === nextMediaType ? current : nextMediaType
    );
  }, [router.isReady, router.query.mediaType]);

  const selectMediaType = useCallback(
    (nextMediaType: SwipeMediaType) => {
      cancelPendingExit();
      setMediaType(nextMediaType);
      setPage(1);
      const nextReturnTo = deckSourcePath[nextMediaType] ?? returnTo;
      void router.replace(
        {
          pathname: '/swipe',
          query: {
            mediaType: nextMediaType,
            ...(nextReturnTo ? { returnTo: nextReturnTo } : {}),
          },
        },
        undefined,
        { shallow: true, scroll: false }
      );
    },
    [cancelPendingExit, returnTo, router]
  );

  useEffect(
    () => () => {
      if (exitTimer.current !== undefined) {
        window.clearTimeout(exitTimer.current);
      }
    },
    []
  );

  const { data: status, error: statusError } = useSWR<{
    aiRanking: boolean;
    mediaTypes: SwipeMediaType[];
    bookFormats: ('ebook' | 'audiobook')[];
    softwareCatalogProvider?: 'questarr' | 'romarr' | 'romarr-dat';
  }>('/api/v1/swipe/status');
  const unavailable =
    (axios.isAxiosError(statusError) &&
      (statusError.response?.status === 404 ||
        statusError.response?.status === 403)) ||
    (!!status && status.mediaTypes.length === 0);
  const categoryUnavailable =
    !!status?.mediaTypes && !status.mediaTypes.includes(mediaType);

  useEffect(() => {
    const requestedMediaType = router.query.mediaType;
    if (
      !router.isReady ||
      !status?.mediaTypes.length ||
      (isSwipeMediaType(requestedMediaType) &&
        status.mediaTypes.includes(requestedMediaType)) ||
      status.mediaTypes.includes(mediaType)
    ) {
      return;
    }
    selectMediaType(status.mediaTypes[0]);
  }, [
    mediaType,
    router.isReady,
    router.query.mediaType,
    selectMediaType,
    status?.mediaTypes,
  ]);

  const isDatSoftwareCategory =
    status?.softwareCatalogProvider === 'romarr-dat' &&
    (mediaType === 'software-retro' || mediaType === 'software-modern');
  const effectiveFiltersForMode = useMemo(
    () =>
      isDatSoftwareCategory
        ? { ...filtersForMode, genre: '', minimumRating: '' }
        : filtersForMode,
    [filtersForMode, isDatSoftwareCategory]
  );
  const catalogSessionKey = JSON.stringify([
    mediaType,
    effectiveFiltersForMode,
    shuffleSeed,
    status?.softwareCatalogProvider,
  ]);
  const currentSoftwareCursor =
    softwareCursors.key === catalogSessionKey
      ? softwareCursors.pages[page]
      : undefined;

  const { data: profile, mutate: mutateProfile } = useSWR<SwipeProfile>(
    '/api/v1/swipe/profile'
  );
  const favoriteMediaType: SwipeFavoriteSeed['mediaType'] =
    mediaType === 'movie' || mediaType === 'tv' || mediaType === 'book'
      ? mediaType
      : 'book';
  const supportsSeeds =
    mediaType === 'movie' || mediaType === 'tv' || mediaType === 'book';
  const supportsPreferences = supportsSeeds || mediaType === 'audiobook';
  const { data: favoriteOptions } = useSWR<SwipeFavoriteSeed[]>(
    showPreferences && supportsSeeds
      ? `/api/v1/swipe/favorites?mediaType=${favoriteMediaType}`
      : null
  );
  const sourceUrl = swipeCatalogUrl(
    mediaType,
    effectiveFiltersForMode,
    page,
    shuffleSeed,
    currentSoftwareCursor
  );
  const {
    data: deck,
    error,
    isValidating,
    mutate: reloadDeck,
  } = useSWR<unknown>(
    router.isReady && !categoryUnavailable ? sourceUrl : null,
    { revalidateOnFocus: false }
  );
  const { data: decisionData, mutate: mutateDecisions } = useSWR<{
    decisions: { id: string; decision: 'want' | 'pass' | 'seen' }[];
  }>(
    router.isReady && !categoryUnavailable
      ? `/api/v1/swipe/decisions?mediaType=${mediaType}`
      : null
  );
  const {
    data: historyData,
    error: historyError,
    mutate: mutateHistory,
  } = useSWR<{ decisions: SwipeHistoryDecision[]; hasMore: boolean }>(
    showHistory
      ? `/api/v1/swipe/history?mediaType=${encodeURIComponent(mediaType)}`
      : null
  );

  useEffect(() => {
    if (showHistory) void mutateHistory();
  }, [mutateHistory, showHistory]);

  useEffect(() => {
    if (!mediaType.startsWith('software-') || !filtersForMode.query.trim()) {
      return;
    }
    const nextCursor =
      deck && typeof deck === 'object' && !Array.isArray(deck)
        ? (deck as { nextCursor?: unknown }).nextCursor
        : undefined;
    setSoftwareCursors((current) => {
      const pages = current.key === catalogSessionKey ? current.pages : {};
      const nextPages = { ...pages };
      if (
        typeof nextCursor === 'string' &&
        nextCursor.length > 0 &&
        nextCursor.length <= MAX_SWIPE_SOFTWARE_CURSOR_LENGTH
      ) {
        nextPages[page + 1] = nextCursor;
      } else {
        delete nextPages[page + 1];
      }
      if (
        current.key === catalogSessionKey &&
        current.pages[page + 1] === nextPages[page + 1]
      ) {
        return current;
      }
      return { key: catalogSessionKey, pages: nextPages };
    });
  }, [catalogSessionKey, deck, filtersForMode.query, mediaType, page]);

  const decisionIds = useMemo(
    () => new Set((decisionData?.decisions ?? []).map(({ id }) => id)),
    [decisionData]
  );
  const catalogCards = useMemo(() => {
    if (!deck) return [];
    const undecided = filterSwipeCards(
      normalizeSwipeCatalogCards(mediaType, deck),
      effectiveFiltersForMode
    ).filter((card) => !decisionIds.has(card.id));
    if (
      shuffleSeed === 'first' ||
      mediaType === 'movie' ||
      mediaType === 'tv' ||
      mediaType === 'book'
    ) {
      return undecided;
    }
    return shuffleSwipeCards(undecided, shuffleSeed);
  }, [deck, decisionIds, effectiveFiltersForMode, mediaType, shuffleSeed]);

  // Load a compact stack from each category catalog; a new page appends picks.
  useEffect(() => {
    if (!deck || !decisionData) return;
    const key = `${catalogSessionKey}:${page}:${JSON.stringify(catalogCards)}`;
    if (lastLoaded.current === key) return;
    lastLoaded.current = key;
    setCards((current) => {
      if (page === 1 || current[0]?.mediaType !== mediaType)
        return catalogCards;
      const seen = new Set(current.map((card) => card.id));
      return [...current, ...catalogCards.filter((card) => !seen.has(card.id))];
    });
  }, [catalogCards, catalogSessionKey, decisionData, deck, mediaType, page]);

  useEffect(() => {
    setCards([]);
    lastLoaded.current = undefined;
    setPage(1);
  }, [mediaType]);

  const top = cards[0];
  const bookFormats: SwipeProfile['bookFormat'][] = status?.bookFormats ?? [
    'audiobook',
    'ebook',
  ];
  const preferredBookFormat: SwipeProfile['bookFormat'] = bookFormats.includes(
    profile?.bookFormat ?? 'audiobook'
  )
    ? (profile?.bookFormat ?? 'audiobook')
    : (bookFormats[0] ?? 'audiobook');
  const favoriteOptionsForType = [
    ...(favoriteOptions ?? []),
    ...(draftProfile?.favoriteSeeds ?? []).filter(
      (seed) => seed.mediaType === favoriteMediaType
    ),
  ].reduce<SwipeFavoriteSeed[]>((items, seed) => {
    if (
      !items.some(
        (item) => item.mediaType === seed.mediaType && item.id === seed.id
      )
    ) {
      items.push(seed);
    }
    return items;
  }, []);

  const swipe = useCallback(
    async (
      direction: SwipeDirection,
      requestTarget?: {
        system?: string;
        operatingSystem?: string;
        architecture?: string;
      }
    ) => {
      if (!top || busy || exiting || !profile) return false;
      if (direction === 'right' && top.software && !requestTarget) {
        if (top.software.category === 'game') {
          setSoftwareTarget({
            system: '',
            operatingSystem: '',
            architecture: '',
          });
        } else {
          setSoftwareTarget({
            system: top.software.systems[0]?.slug ?? '',
            operatingSystem: '',
            architecture: '',
          });
        }
        setSoftwareCard(top);
        return false;
      }
      setBusy(true);
      let requestCreated = false;
      try {
        if (direction === 'right') {
          try {
            if (top.software) {
              const body = softwareRequestBodyFor(
                top.software,
                requestTarget ?? {}
              );
              if (!body) {
                addToast(intl.formatMessage(messages.requestNeedsTarget), {
                  appearance: 'error',
                  autoDismiss: true,
                });
                return false;
              }
              await axios.post('/api/v1/request/software', body);
            } else {
              const body = requestBodyFor(top, {
                ...profile,
                bookFormat: preferredBookFormat,
              });
              if (!body) return false;
              await axios.post('/api/v1/request', body);
            }
            requestCreated = true;
          } catch (failure) {
            addToast(
              intl.formatMessage(messages.requestFailed, {
                title: top.title,
                reason: errorMessage(failure) ?? '',
              }),
              { appearance: 'error', autoDismiss: true }
            );
            return false;
          }
          addToast(
            intl.formatMessage(messages.requested, { title: top.title }),
            {
              appearance: 'success',
              autoDismiss: true,
            }
          );
        }
        try {
          await axios.post('/api/v1/swipe/decisions', {
            mediaType: top.mediaType,
            id: top.id,
            decision: DECISION[direction],
            ...(top.mediaType === 'movie' ||
            top.mediaType === 'tv' ||
            top.mediaType === 'book'
              ? {}
              : { card: top }),
          });
          void mutateDecisions();
        } catch {
          // A right swipe already made its request; only a lost pass/seen
          // needs to keep the card.
          if (direction !== 'right') {
            addToast(intl.formatMessage(messages.saveFailed), {
              appearance: 'error',
              autoDismiss: true,
            });
            return false;
          }
          if (requestCreated) {
            addToast(intl.formatMessage(messages.requestSavedHistoryFailed), {
              appearance: 'warning',
              autoDismiss: true,
            });
          }
        }
        setExiting({ id: top.id, direction });
        exitTimer.current = window.setTimeout(() => {
          exitTimer.current = undefined;
          setExiting(undefined);
          setCards((current) => {
            const next = current.filter((card) => card.id !== top.id);
            if (next.length < REFILL_BELOW) {
              if (
                mediaType === 'movie' ||
                mediaType === 'tv' ||
                mediaType === 'book'
              ) {
                void axios
                  .get<DeckResponse>(
                    `/api/v1/swipe/deck?mediaType=${mediaType}&refresh=true`
                  )
                  .then((response) =>
                    reloadDeck(response.data, { revalidate: false })
                  );
              } else {
                const needsSoftwareCursor =
                  mediaType.startsWith('software-') &&
                  !!filtersForMode.query.trim();
                const nextSoftwareCursor =
                  softwareCursors.key === catalogSessionKey &&
                  !!softwareCursors.pages[page + 1];
                if (!needsSoftwareCursor || nextSoftwareCursor) {
                  setPage((current) => current + 1);
                }
              }
            }
            return next;
          });
        }, EXIT_MS);
        return true;
      } finally {
        setBusy(false);
      }
    },
    [
      addToast,
      busy,
      catalogSessionKey,
      exiting,
      filtersForMode.query,
      intl,
      mediaType,
      mutateDecisions,
      page,
      profile,
      preferredBookFormat,
      reloadDeck,
      softwareCursors,
      top,
    ]
  );

  const undo = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await axios.post<{ card: SwipeCardData }>(
        '/api/v1/swipe/undo',
        { mediaType }
      );
      const card = response.data.card;
      cancelPendingExit();
      setCards((current) => [
        card,
        ...current.filter((item) => item.id !== card.id),
      ]);
      void mutateDecisions();
      addToast(intl.formatMessage(messages.undone, { title: card.title }), {
        appearance: 'info',
        autoDismiss: true,
      });
    } catch (failure) {
      const message = errorMessage(failure);
      if (message) {
        addToast(message, { appearance: 'info', autoDismiss: true });
      }
    } finally {
      setBusy(false);
    }
  }, [addToast, busy, cancelPendingExit, intl, mediaType, mutateDecisions]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        showPreferences ||
        showFilters ||
        showHistory ||
        softwareCard ||
        target?.closest('input, textarea, select, [contenteditable]')
      ) {
        return;
      }
      const direction: SwipeDirection | undefined =
        event.key === 'ArrowRight'
          ? 'right'
          : event.key === 'ArrowLeft'
            ? 'left'
            : event.key === 'ArrowUp'
              ? 'up'
              : undefined;
      if (direction) {
        event.preventDefault();
        void swipe(direction);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        void undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showFilters, showHistory, showPreferences, softwareCard, swipe, undo]);

  const savePreferences = async () => {
    if (!draftProfile) return;
    const normalizedProfile = {
      ...draftProfile,
      bookFormat: bookFormats.includes(draftProfile.bookFormat)
        ? draftProfile.bookFormat
        : preferredBookFormat,
    };
    try {
      const response = await axios.put<SwipeProfile>(
        '/api/v1/swipe/profile',
        normalizedProfile
      );
      await mutateProfile(response.data, { revalidate: false });
      setShowPreferences(false);
      if (
        response.data.tasteNotes !== profile?.tasteNotes ||
        response.data.seedScope !== profile?.seedScope ||
        JSON.stringify(response.data.favoriteSeeds) !==
          JSON.stringify(profile?.favoriteSeeds)
      ) {
        setCards([]);
        lastLoaded.current = undefined;
        void reloadDeck();
      }
    } catch (failure) {
      addToast(
        errorMessage(failure) ?? intl.formatMessage(messages.saveFailed),
        {
          appearance: 'error',
          autoDismiss: true,
        }
      );
    }
  };

  const applyFilters = () => {
    if (!draftFilters) return;
    const filtersToApply = isDatSoftwareCategory
      ? { ...draftFilters, genre: '', minimumRating: '' }
      : draftFilters;
    const yearFrom = filtersToApply.yearFrom
      ? Number(filtersToApply.yearFrom)
      : undefined;
    const yearTo = filtersToApply.yearTo
      ? Number(filtersToApply.yearTo)
      : undefined;
    const minimumRating = filtersToApply.minimumRating
      ? Number(filtersToApply.minimumRating)
      : undefined;
    const ratingLimit =
      mediaType === 'book' || mediaType === 'audiobook' ? 5 : 10;
    const invalidYear = [yearFrom, yearTo].some(
      (year) =>
        year !== undefined &&
        (!Number.isSafeInteger(year) || year < 1800 || year > 2200)
    );
    const invalidRating =
      minimumRating !== undefined &&
      (!Number.isFinite(minimumRating) ||
        minimumRating < 0 ||
        minimumRating > ratingLimit ||
        minimumRating * 2 !== Math.round(minimumRating * 2));
    if (
      invalidYear ||
      (yearFrom && yearTo && yearFrom > yearTo) ||
      invalidRating
    ) {
      addToast(intl.formatMessage(messages.invalidFilters), {
        appearance: 'error',
        autoDismiss: true,
      });
      return;
    }
    setFiltersByType((current) => ({
      ...current,
      [mediaType]: filtersToApply,
    }));
    setCards([]);
    lastLoaded.current = undefined;
    setPage(1);
    setShowFilters(false);
  };

  const resetFilters = () => {
    setDraftFilters({ ...DEFAULT_FILTERS });
  };

  const refreshPicks = async () => {
    setCards([]);
    lastLoaded.current = undefined;
    if (mediaType === 'movie' || mediaType === 'tv' || mediaType === 'book') {
      try {
        const response = await axios.get<DeckResponse>(
          `/api/v1/swipe/deck?mediaType=${mediaType}&refresh=true`
        );
        await reloadDeck(response.data, { revalidate: false });
      } catch {
        await reloadDeck();
      }
      return;
    }
    const entropy = window.crypto.getRandomValues(new Uint32Array(2));
    const nextSeed = `${Date.now()}-${Array.from(entropy, (word) => word.toString(36)).join('')}`;
    const firstPageUrl = swipeCatalogUrl(
      mediaType,
      effectiveFiltersForMode,
      1,
      nextSeed
    );
    setShuffleSeed(nextSeed);
    setPage(1);
    try {
      const response = await axios.get(firstPageUrl);
      await mutateKey(firstPageUrl, response.data, { revalidate: false });
    } catch {
      addToast(intl.formatMessage(messages.refreshFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };

  const restoreHistoryDecision = async (item: SwipeHistoryDecision) => {
    setBusy(true);
    try {
      await axios.post('/api/v1/swipe/history/restore', {
        mediaType: item.mediaType,
        id: item.id,
      });
      cancelPendingExit();
      await Promise.all([mutateHistory(), mutateDecisions()]);
      setCards((current) => [
        item.card,
        ...current.filter((card) => card.id !== item.id),
      ]);
      addToast(intl.formatMessage(messages.restored), {
        appearance: 'success',
        autoDismiss: true,
      });
    } catch (failure) {
      addToast(
        errorMessage(failure) ?? intl.formatMessage(messages.saveFailed),
        {
          appearance: 'error',
          autoDismiss: true,
        }
      );
    } finally {
      setBusy(false);
    }
  };

  const clearHistory = async () => {
    setBusy(true);
    try {
      await axios.delete(
        `/api/v1/swipe/history?mediaType=${encodeURIComponent(mediaType)}`
      );
      cancelPendingExit();
      await Promise.all([mutateHistory(), mutateDecisions()]);
      setCards([]);
      lastLoaded.current = undefined;
      setPage(1);
      addToast(intl.formatMessage(messages.historyCleared), {
        appearance: 'success',
        autoDismiss: true,
      });
    } catch (failure) {
      addToast(
        errorMessage(failure) ?? intl.formatMessage(messages.saveFailed),
        {
          appearance: 'error',
          autoDismiss: true,
        }
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmSoftwareRequest = async () => {
    if (!softwareCard?.software) return;
    const requestBody = softwareRequestBodyFor(
      softwareCard.software,
      softwareTarget
    );
    if (!requestBody) {
      addToast(intl.formatMessage(messages.noSoftwareTarget), {
        appearance: 'error',
        autoDismiss: true,
      });
      return;
    }
    if (await swipe('right', softwareTarget)) {
      setSoftwareCard(undefined);
    }
  };

  const visible = cards.slice(0, 3);
  const loading = !deck && !error;
  const activeFilterCount = [
    effectiveFiltersForMode.query,
    effectiveFiltersForMode.genre,
    effectiveFiltersForMode.yearFrom,
    effectiveFiltersForMode.yearTo,
    effectiveFiltersForMode.minimumRating,
    effectiveFiltersForMode.publisher,
    effectiveFiltersForMode.magazineCatalog === 'public' ? 'public' : '',
  ].filter(Boolean).length;
  const visibleTabs = (status?.mediaTypes ?? []).flatMap((availableType) => {
    const tab = TABS.find(
      ({ mediaType: candidate }) => candidate === availableType
    );
    return tab ? [tab] : [];
  });
  const latestDecision = decisionData?.decisions[0];
  const canUndo = !!latestDecision && latestDecision.decision !== 'want';
  const historyForMode = historyData?.decisions ?? [];
  const clearableHistoryCount = historyForMode.filter(
    ({ decision }) => decision !== 'want'
  ).length;
  const searchRequired =
    mediaType === 'sports' ||
    mediaType === 'adult' ||
    (mediaType === 'magazine' &&
      effectiveFiltersForMode.magazineCatalog === 'public');

  return (
    <div className="page-layout">
      <DiscoveryModeTabs
        selected="swipe"
        mediaType={discoveryMediaType}
        returnTo={returnTo}
      />
      <PageTitle title={intl.formatMessage(messages.title)} />
      <div className="page-title-row">
        <h1 className="page-title">{intl.formatMessage(messages.title)}</h1>
        {(loading || (isValidating && cards.length === 0)) && (
          <span className="page-status">
            <LoadingSpinner />
          </span>
        )}
      </div>
      <p className="card-body-text">{intl.formatMessage(messages.intro)}</p>
      <div
        className="swipe-media-rail"
        role="tablist"
        aria-label={intl.formatMessage(messages.title)}
        data-testid="swipe-media-rail"
      >
        {visibleTabs.map((tab) => (
          <Button
            key={tab.mediaType}
            role="tab"
            aria-selected={mediaType === tab.mediaType}
            buttonType={mediaType === tab.mediaType ? 'primary' : 'default'}
            buttonSize="sm"
            data-testid={`swipe-category-${tab.mediaType}`}
            onClick={() => selectMediaType(tab.mediaType)}
          >
            {intl.formatMessage(messages[tab.label])}
          </Button>
        ))}
      </div>
      <div className="swipe-tool-row">
        <form
          className="swipe-search-row"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setFiltersByType((current) => ({
              ...current,
              [mediaType]: {
                ...effectiveFiltersForMode,
                query: queryDraft.trim(),
              },
            }));
            setCards([]);
            lastLoaded.current = undefined;
            setPage(1);
          }}
        >
          <label className="sr-only" htmlFor="swipe-catalog-search">
            {intl.formatMessage(messages.search)}
          </label>
          <MagnifyingGlassIcon aria-hidden="true" />
          <input
            id="swipe-catalog-search"
            type="search"
            maxLength={200}
            value={queryDraft}
            placeholder={intl.formatMessage(messages.search)}
            onChange={(event) => setQueryDraft(event.currentTarget.value)}
          />
          <Button buttonType="primary" buttonSize="sm" type="submit">
            {intl.formatMessage(messages.search)}
          </Button>
        </form>
        <div className="swipe-tool-actions">
          <Button
            buttonType="default"
            buttonSize="sm"
            data-testid="swipe-open-filters"
            onClick={() => {
              setDraftFilters({ ...filtersForMode });
              setShowFilters(true);
            }}
          >
            <AdjustmentsHorizontalIcon aria-hidden="true" />
            <span>{intl.formatMessage(messages.filters)}</span>
            {activeFilterCount > 0 && (
              <span className="swipe-count-pill">{activeFilterCount}</span>
            )}
          </Button>
          <Button
            buttonType="default"
            buttonSize="sm"
            data-testid="swipe-open-history"
            onClick={() => setShowHistory(true)}
          >
            <ClockIcon aria-hidden="true" />
            <span>{intl.formatMessage(messages.history)}</span>
          </Button>
          <Button
            buttonType="default"
            buttonSize="sm"
            data-testid="swipe-refresh"
            onClick={() => void refreshPicks()}
          >
            <ArrowPathIcon aria-hidden="true" />
            <span>{intl.formatMessage(messages.refresh)}</span>
          </Button>
          {supportsPreferences && (
            <Button
              buttonType="default"
              buttonSize="sm"
              onClick={() => {
                setDraftProfile(profile);
                setShowPreferences(true);
              }}
              disabled={!profile}
            >
              {intl.formatMessage(messages.preferences)}
            </Button>
          )}
        </div>
      </div>
      {decisionData && (
        <p className="swipe-deck-meta">
          {intl.formatMessage(messages.decisionSummary, {
            count: decisionData.decisions.length,
          })}
          {activeFilterCount > 0 && (
            <>
              {' '}
              ·{' '}
              {intl.formatMessage(messages.filteredCount, {
                count: catalogCards.length,
              })}
            </>
          )}
        </p>
      )}
      {mediaType === 'adult' && (
        <p className="swipe-privacy-note" role="note">
          {intl.formatMessage(messages.adultPrivacy)}
        </p>
      )}
      {status?.aiRanking &&
        (deck as Partial<DeckResponse> | undefined)?.ranked && (
          <p className="card-subheading">
            {intl.formatMessage(messages.aiRanked)}
          </p>
        )}

      {unavailable ? (
        <section className="app-card-main card-layout">
          <p className="card-body-text">
            {intl.formatMessage(messages.unavailable)}
          </p>
        </section>
      ) : error && cards.length === 0 ? (
        <section className="app-card-main card-layout">
          <h2 className="card-title">
            {intl.formatMessage(messages.loadError)}
          </h2>
          <div className="app-action-row">
            <Button
              buttonType="default"
              buttonSize="sm"
              onClick={() => void reloadDeck()}
            >
              {intl.formatMessage(messages.retry)}
            </Button>
          </div>
        </section>
      ) : deck && cards.length === 0 && !isValidating ? (
        <section className="app-card-main card-layout">
          <h2 className="page-heading">
            {catalogCards.length === 0 && activeFilterCount > 0
              ? intl.formatMessage(messages.noResultsSearch)
              : intl.formatMessage(messages.empty)}
          </h2>
          <p className="card-body-text">
            {mediaType === 'adult'
              ? intl.formatMessage(messages.adultSearchHint)
              : mediaType === 'sports'
                ? intl.formatMessage(messages.sportsSearchHint)
                : mediaType === 'magazine'
                  ? intl.formatMessage(messages.magazineSearchHint)
                  : searchRequired
                    ? intl.formatMessage(messages.discoverSearchHint)
                    : intl.formatMessage(messages.emptyHelp)}
          </p>
          <div className="app-action-row">
            <Button
              buttonType="primary"
              buttonSize="sm"
              onClick={() => void refreshPicks()}
            >
              {intl.formatMessage(messages.refresh)}
            </Button>
          </div>
        </section>
      ) : (
        <>
          <div className="swipe-deck" aria-live="polite">
            {visible
              .map((card, index) => (
                <SwipeCardView
                  key={card.id}
                  card={card}
                  position={index as 0 | 1 | 2}
                  exit={exiting?.id === card.id ? exiting.direction : undefined}
                  disabled={busy || !!exiting || !profile}
                  onSwipe={(direction) => void swipe(direction)}
                />
              ))
              .reverse()}
          </div>
          <div className="swipe-actions">
            <Button
              buttonType="default"
              buttonSize="sm"
              disabled={!canUndo || busy}
              data-testid="swipe-undo"
              onClick={() => void undo()}
            >
              <ArrowUturnLeftIcon />
              <span>{intl.formatMessage(messages.undo)}</span>
            </Button>
            <Button
              buttonType="danger"
              buttonSize="sm"
              disabled={!top || busy || !!exiting || !profile}
              data-testid="swipe-pass"
              onClick={() => void swipe('left')}
            >
              <XMarkIcon />
              <span>{intl.formatMessage(messages.pass)}</span>
            </Button>
            <Button
              buttonType="primary"
              buttonSize="sm"
              disabled={!top || busy || !!exiting || !profile}
              data-testid="swipe-seen"
              onClick={() => void swipe('up')}
            >
              <EyeIcon />
              <span>{intl.formatMessage(messages.seen)}</span>
            </Button>
            <Button
              buttonType="success"
              buttonSize="sm"
              disabled={!top || busy || !!exiting || !profile}
              data-testid="swipe-request"
              onClick={() => void swipe('right')}
            >
              <CheckIcon />
              <span>{intl.formatMessage(messages.request)}</span>
            </Button>
          </div>
          <p className="settings-form-row-description">
            {intl.formatMessage(messages.keyboardHint)}
          </p>
        </>
      )}

      {showPreferences && draftProfile && (
        <Modal
          title={intl.formatMessage(messages.preferences)}
          onCancel={() => setShowPreferences(false)}
          cancelText={intl.formatMessage(messages.close)}
          onOk={() => void savePreferences()}
          okText={intl.formatMessage(messages.save)}
        >
          {(mediaType === 'movie' ||
            mediaType === 'tv' ||
            mediaType === 'book') && (
            <>
              <div className="form-row">
                <label htmlFor="swipe-taste-notes">
                  {intl.formatMessage(messages.tasteNotes)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <textarea
                      id="swipe-taste-notes"
                      maxLength={1000}
                      rows={3}
                      value={draftProfile.tasteNotes}
                      onChange={(event) =>
                        setDraftProfile({
                          ...draftProfile,
                          tasteNotes: event.currentTarget.value,
                        })
                      }
                    />
                  </div>
                  <p className="settings-form-row-description">
                    {intl.formatMessage(messages.tasteNotesHelp)}
                  </p>
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="swipe-seed-scope">
                  {intl.formatMessage(messages.seedScope)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <select
                      id="swipe-seed-scope"
                      value={draftProfile.seedScope}
                      onChange={(event) =>
                        setDraftProfile({
                          ...draftProfile,
                          seedScope: event.currentTarget
                            .value as SwipeProfile['seedScope'],
                        })
                      }
                    >
                      <option value="full">
                        {intl.formatMessage(messages.fullScope)}
                      </option>
                      <option value="rated">
                        {intl.formatMessage(messages.ratedScope)}
                      </option>
                      <option value="favorites">
                        {intl.formatMessage(messages.favoritesScope)}
                      </option>
                    </select>
                  </div>
                  <p className="settings-form-row-description">
                    {intl.formatMessage(messages.seedScopeHelp)}
                  </p>
                </div>
              </div>
              <div className="form-row">
                <label>{intl.formatMessage(messages.favoriteItems)}</label>
                <div className="form-input-area">
                  <p className="settings-form-row-description">
                    {intl.formatMessage(messages.favoriteCount, {
                      count: draftProfile.favoriteSeeds.length,
                    })}
                  </p>
                  {favoriteOptionsForType.length === 0 ? (
                    <p className="settings-form-row-description">
                      {intl.formatMessage(messages.noFavoriteItems)}
                    </p>
                  ) : (
                    <div
                      className="app-list"
                      role="group"
                      aria-label={intl.formatMessage(messages.favoriteItems)}
                    >
                      {favoriteOptionsForType.map((seed) => {
                        const checked = draftProfile.favoriteSeeds.some(
                          (item) =>
                            item.mediaType === seed.mediaType &&
                            item.id === seed.id
                        );
                        return (
                          <label
                            className="app-list-row"
                            key={`${seed.mediaType}:${seed.id}`}
                          >
                            <span className="app-list-value">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={
                                  !checked &&
                                  draftProfile.favoriteSeeds.length >= 25
                                }
                                onChange={(event) =>
                                  setDraftProfile({
                                    ...draftProfile,
                                    favoriteSeeds: event.currentTarget.checked
                                      ? [...draftProfile.favoriteSeeds, seed]
                                      : draftProfile.favoriteSeeds.filter(
                                          (item) =>
                                            !(
                                              item.mediaType ===
                                                seed.mediaType &&
                                              item.id === seed.id
                                            )
                                        ),
                                  })
                                }
                              />{' '}
                              {seed.title}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          {mediaType === 'tv' && (
            <div className="form-row">
              <label htmlFor="swipe-series-request">
                {intl.formatMessage(messages.seriesRequest)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <select
                    id="swipe-series-request"
                    value={draftProfile.seriesRequest}
                    onChange={(event) =>
                      setDraftProfile({
                        ...draftProfile,
                        seriesRequest: event.currentTarget
                          .value as SwipeProfile['seriesRequest'],
                      })
                    }
                  >
                    <option value="first-season">
                      {intl.formatMessage(messages.firstSeason)}
                    </option>
                    <option value="all-seasons">
                      {intl.formatMessage(messages.allSeasons)}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          )}
          {(mediaType === 'book' || mediaType === 'audiobook') && (
            <div className="form-row">
              <label htmlFor="swipe-book-format">
                {intl.formatMessage(messages.bookFormat)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <select
                    id="swipe-book-format"
                    value={draftProfile.bookFormat}
                    onChange={(event) =>
                      setDraftProfile({
                        ...draftProfile,
                        bookFormat: event.currentTarget
                          .value as SwipeProfile['bookFormat'],
                      })
                    }
                  >
                    {bookFormats.map((format) => (
                      <option value={format} key={format}>
                        {intl.formatMessage(messages[format])}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
      {showFilters && draftFilters && (
        <Modal
          title={intl.formatMessage(messages.filters)}
          onCancel={() => setShowFilters(false)}
          cancelText={intl.formatMessage(messages.close)}
          onOk={applyFilters}
          okText={intl.formatMessage(messages.applyFilters)}
        >
          {mediaType === 'magazine' && (
            <div className="form-row">
              <label htmlFor="swipe-magazine-catalog">
                {intl.formatMessage(messages.magazineSource)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <select
                    id="swipe-magazine-catalog"
                    value={draftFilters.magazineCatalog}
                    onChange={(event) =>
                      setDraftFilters({
                        ...draftFilters,
                        magazineCatalog: event.currentTarget
                          .value as SwipeCatalogFilters['magazineCatalog'],
                      })
                    }
                  >
                    <option value="tracked">
                      {intl.formatMessage(messages.trackedCatalog)}
                    </option>
                    <option value="public">
                      {intl.formatMessage(messages.publicCatalog)}
                    </option>
                  </select>
                </div>
              </div>
            </div>
          )}
          {mediaType !== 'sports' &&
            mediaType !== 'adult' &&
            !isDatSoftwareCategory && (
              <div className="form-row">
                <label htmlFor="swipe-genre">
                  {intl.formatMessage(messages.genreOrSubject)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <input
                      id="swipe-genre"
                      value={draftFilters.genre}
                      onChange={(event) =>
                        setDraftFilters({
                          ...draftFilters,
                          genre: event.currentTarget.value,
                        })
                      }
                      maxLength={mediaType.startsWith('software-') ? 64 : 128}
                    />
                  </div>
                </div>
              </div>
            )}
          {mediaType === 'comic' && (
            <div className="form-row">
              <label htmlFor="swipe-publisher">
                {intl.formatMessage(messages.publisher)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <input
                    id="swipe-publisher"
                    value={draftFilters.publisher}
                    onChange={(event) =>
                      setDraftFilters({
                        ...draftFilters,
                        publisher: event.currentTarget.value,
                      })
                    }
                    maxLength={128}
                  />
                </div>
              </div>
            </div>
          )}
          {mediaType !== 'sports' &&
            mediaType !== 'adult' &&
            mediaType !== 'magazine' &&
            !isDatSoftwareCategory && (
              <div className="form-row">
                <label htmlFor="swipe-rating">
                  {intl.formatMessage(messages.minimumRating)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <input
                      id="swipe-rating"
                      type="number"
                      min="0"
                      max={
                        mediaType === 'book' || mediaType === 'audiobook'
                          ? '5'
                          : '10'
                      }
                      step="0.5"
                      value={draftFilters.minimumRating}
                      onChange={(event) =>
                        setDraftFilters({
                          ...draftFilters,
                          minimumRating: event.currentTarget.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          {mediaType !== 'sports' &&
            mediaType !== 'adult' &&
            mediaType !== 'magazine' && (
              <div className="form-row">
                <label htmlFor="swipe-year-from">
                  {intl.formatMessage(messages.yearFrom)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <input
                      id="swipe-year-from"
                      type="number"
                      min="1800"
                      max="2200"
                      value={draftFilters.yearFrom}
                      onChange={(event) =>
                        setDraftFilters({
                          ...draftFilters,
                          yearFrom: event.currentTarget.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          {mediaType !== 'sports' &&
            mediaType !== 'adult' &&
            mediaType !== 'magazine' && (
              <div className="form-row">
                <label htmlFor="swipe-year-to">
                  {intl.formatMessage(messages.yearTo)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <input
                      id="swipe-year-to"
                      type="number"
                      min="1800"
                      max="2200"
                      value={draftFilters.yearTo}
                      onChange={(event) =>
                        setDraftFilters({
                          ...draftFilters,
                          yearTo: event.currentTarget.value,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          <div className="app-action-row">
            <Button buttonType="default" buttonSize="sm" onClick={resetFilters}>
              {intl.formatMessage(messages.resetFilters)}
            </Button>
          </div>
        </Modal>
      )}
      {showHistory && (
        <Modal
          title={intl.formatMessage(messages.reviewHistory)}
          onCancel={() => setShowHistory(false)}
          cancelText={intl.formatMessage(messages.close)}
        >
          {historyError ? (
            <p className="card-body-text">
              {intl.formatMessage(messages.historyLoadError)}
            </p>
          ) : historyForMode.length === 0 ? (
            <p className="card-body-text">
              {intl.formatMessage(messages.noHistory)}
            </p>
          ) : (
            <div className="swipe-history-list">
              {historyForMode.map((item) => (
                <article
                  className="swipe-history-item"
                  key={`${item.mediaType}:${item.id}`}
                >
                  <div className="swipe-history-copy">
                    <strong>{item.title}</strong>
                    <span>
                      {intl.formatDate(new Date(item.createdAt), {
                        dateStyle: 'medium',
                      })}
                    </span>
                  </div>
                  {item.decision === 'want' ? (
                    <span className="swipe-history-status">
                      {intl.formatMessage(messages.requestedInRequests)}
                    </span>
                  ) : (
                    <Button
                      buttonType="default"
                      buttonSize="sm"
                      disabled={busy}
                      onClick={() => void restoreHistoryDecision(item)}
                    >
                      {intl.formatMessage(messages.restore)}
                    </Button>
                  )}
                </article>
              ))}
              {historyData?.hasMore && (
                <p className="settings-form-row-description">
                  {intl.formatMessage(messages.historyLimit)}
                </p>
              )}
            </div>
          )}
          {clearableHistoryCount > 0 && (
            <div className="app-action-row">
              <Button
                buttonType="danger"
                buttonSize="sm"
                disabled={busy}
                onClick={() => void clearHistory()}
              >
                {intl.formatMessage(messages.clearHistory)}
              </Button>
            </div>
          )}
        </Modal>
      )}
      {softwareCard?.software && (
        <Modal
          title={intl.formatMessage(messages.softwareTarget)}
          onCancel={() => setSoftwareCard(undefined)}
          cancelText={intl.formatMessage(messages.close)}
          onOk={() => void confirmSoftwareRequest()}
          okText={intl.formatMessage(messages.request)}
        >
          <p className="card-body-text">{softwareCard.title}</p>
          {softwareCard.software.category === 'game' ? (
            <>
              <div className="form-row">
                <label htmlFor="swipe-software-os">
                  {intl.formatMessage(messages.chooseOperatingSystem)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <select
                      id="swipe-software-os"
                      value={softwareTarget.operatingSystem}
                      onChange={(event) =>
                        setSoftwareTarget({
                          ...softwareTarget,
                          operatingSystem: event.currentTarget.value,
                        })
                      }
                    >
                      <option value="">
                        {intl.formatMessage(messages.chooseOperatingSystem)}
                      </option>
                      {[
                        ...new Set(
                          softwareCard.software.pcVariants.map(
                            ({ operatingSystem }) => operatingSystem
                          )
                        ),
                      ].map((operatingSystem) => (
                        <option key={operatingSystem} value={operatingSystem}>
                          {operatingSystem}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="swipe-software-architecture">
                  {intl.formatMessage(messages.chooseArchitecture)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <select
                      id="swipe-software-architecture"
                      value={softwareTarget.architecture}
                      onChange={(event) =>
                        setSoftwareTarget({
                          ...softwareTarget,
                          architecture: event.currentTarget.value,
                        })
                      }
                    >
                      <option value="">
                        {intl.formatMessage(messages.chooseArchitecture)}
                      </option>
                      {[
                        ...new Set(
                          softwareCard.software.pcVariants
                            .filter(
                              ({ operatingSystem }) =>
                                operatingSystem ===
                                softwareTarget.operatingSystem
                            )
                            .map(({ architecture }) => architecture)
                        ),
                      ].map((architecture) => (
                        <option key={architecture} value={architecture}>
                          {architecture}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="form-row">
              <label htmlFor="swipe-software-system">
                {intl.formatMessage(messages.chooseSystem)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <select
                    id="swipe-software-system"
                    value={softwareTarget.system}
                    onChange={(event) =>
                      setSoftwareTarget({
                        ...softwareTarget,
                        system: event.currentTarget.value,
                      })
                    }
                  >
                    <option value="">
                      {intl.formatMessage(messages.chooseSystem)}
                    </option>
                    {softwareCard.software.systems.map((system) => (
                      <option value={system.slug} key={system.slug}>
                        {system.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};

export default Swipe;

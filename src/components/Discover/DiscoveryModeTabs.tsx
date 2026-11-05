import { getFilterToggleButtonClass } from '@app/components/Discover/FilterPanel/CompactFilterSelect';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { HeartIcon, SparklesIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

export type SwipeContextMediaType =
  | 'movie'
  | 'tv'
  | 'book'
  | 'audiobook'
  | 'comic'
  | 'magazine'
  | 'music'
  | 'sports'
  | 'adult';

const messages = defineMessages('components.Discover.DiscoveryModeTabs', {
  discover: 'Discover',
  swipe: 'Swipe',
  movies: 'Movies',
  series: 'Series',
  books: 'Books',
  audiobooks: 'Audiobooks',
  comics: 'Comics',
  magazines: 'Magazines',
  music: 'Music',
  sports: 'Sports',
  adult: 'Adult',
  navigation: '{mediaType} Discovery Modes',
});

const canonicalDiscoverPaths: Record<SwipeContextMediaType, string> = {
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

export const discoveryMediaTypeForPath = (
  pathname: string
): SwipeContextMediaType | undefined => {
  if (
    pathname === '/discover/movies' ||
    pathname.startsWith('/discover/movies/')
  ) {
    return 'movie';
  }
  if (pathname === '/discover/tv' || pathname.startsWith('/discover/tv/')) {
    return 'tv';
  }
  if (
    pathname === '/discover/books' ||
    pathname.startsWith('/discover/books/')
  ) {
    return 'book';
  }
  if (
    pathname === '/discover/audiobooks' ||
    pathname.startsWith('/discover/audiobooks/')
  ) {
    return 'audiobook';
  }
  if (
    pathname === '/discover/comics' ||
    pathname.startsWith('/discover/comics/')
  ) {
    return 'comic';
  }
  if (
    pathname === '/discover/magazines' ||
    pathname.startsWith('/discover/magazines/')
  ) {
    return 'magazine';
  }
  if (
    pathname === '/discover/music' ||
    pathname.startsWith('/discover/music/')
  ) {
    return 'music';
  }
  if (
    pathname === '/discover/sports' ||
    pathname.startsWith('/discover/sports/')
  ) {
    return 'sports';
  }
  if (
    pathname === '/discover/adult' ||
    pathname.startsWith('/discover/adult/')
  ) {
    return 'adult';
  }

  return undefined;
};

export const safeSwipeReturnTo = (value: unknown): string | undefined => {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return undefined;
  }

  try {
    const base = 'https://seerrng.invalid';
    const target = new URL(value, base);
    if (
      target.origin !== base ||
      !/^\/discover\/(?:movies|tv|books|audiobooks|comics|magazines|music|sports|adult)(?:\/|$)/.test(
        target.pathname
      )
    ) {
      return undefined;
    }

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return undefined;
  }
};

const DiscoveryModeTabs = ({
  selected,
  mediaType,
  returnTo,
}: {
  selected: 'discover' | 'swipe';
  mediaType: SwipeContextMediaType;
  returnTo?: unknown;
}) => {
  const intl = useIntl();
  const router = useRouter();
  const { hasPermission } = useUser();

  if (
    !hasPermission([Permission.REQUEST, Permission.REQUEST_ADULT], {
      type: 'or',
    })
  ) {
    return null;
  }

  const apiMediaType = mediaType === 'audiobook' ? 'book' : mediaType;
  const browsePath = router.isReady
    ? router.asPath
    : canonicalDiscoverPaths[mediaType];
  const fallbackSwipePath = {
    pathname: '/swipe',
    query: { mediaType: apiMediaType },
  };
  const discoverHref =
    selected === 'swipe'
      ? (safeSwipeReturnTo(returnTo) ?? canonicalDiscoverPaths[mediaType])
      : browsePath;
  const swipeHref =
    selected === 'swipe'
      ? router.isReady
        ? router.asPath
        : fallbackSwipePath
      : {
          pathname: '/swipe',
          query: {
            mediaType: apiMediaType,
            returnTo: browsePath,
          },
        };
  const mediaTypeLabel = intl.formatMessage(
    mediaType === 'tv'
      ? messages.series
      : mediaType === 'book'
        ? messages.books
        : mediaType === 'audiobook'
          ? messages.audiobooks
          : mediaType === 'comic'
            ? messages.comics
            : mediaType === 'magazine'
              ? messages.magazines
              : mediaType === 'music'
                ? messages.music
                : mediaType === 'sports'
                  ? messages.sports
                  : mediaType === 'adult'
                    ? messages.adult
                    : messages.movies
  );

  return (
    <nav
      className="app-filter-row"
      aria-label={intl.formatMessage(messages.navigation, {
        mediaType: mediaTypeLabel,
      })}
      data-testid="discovery-mode-tabs"
    >
      <Link
        href={discoverHref}
        prefetch={false}
        aria-current={selected === 'discover' ? 'page' : undefined}
        className={`${getFilterToggleButtonClass(
          selected === 'discover'
        )} app-control-shadow-exempt app-filter-segment-focus`}
        data-testid="discovery-mode-tab-discover"
      >
        <SparklesIcon className="app-action-icon" aria-hidden="true" />
        {intl.formatMessage(messages.discover)}
      </Link>
      <Link
        href={swipeHref}
        prefetch={false}
        aria-current={selected === 'swipe' ? 'page' : undefined}
        className={`${getFilterToggleButtonClass(
          selected === 'swipe'
        )} app-control-shadow-exempt app-filter-segment-focus`}
        data-testid="discovery-mode-tab-swipe"
      >
        <HeartIcon className="app-action-icon" aria-hidden="true" />
        {intl.formatMessage(messages.swipe)}
      </Link>
    </nav>
  );
};

export default DiscoveryModeTabs;

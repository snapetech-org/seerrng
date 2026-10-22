import MediaFilterOption from '@app/components/Discover/MediaFilterOption';
import PinnedFilterSection from '@app/components/Discover/PinnedFilterSection';
import useMediaFilterPin from '@app/hooks/useMediaFilterPin';
import useSettings from '@app/hooks/useSettings';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import type { DiscoverMediaType as DiscoverMediaCategory } from '@app/utils/serviceAvailability';
import {
  DISCOVER_MEDIA_TYPES,
  getUserServiceAvailability,
  isDiscoverMediaTypeEnabled,
} from '@app/utils/serviceAvailability';
import {
  BookOpenIcon,
  FilmIcon,
  MusicalNoteIcon,
  SpeakerWaveIcon,
  Squares2X2Icon,
  TvIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

export type DiscoverMediaType = 'all' | DiscoverMediaCategory;

interface DiscoverMediaTabsProps {
  selected?: DiscoverMediaType;
  basePath?: string;
}

const messages = defineMessages('components.Discover.DiscoverMediaTabs', {
  mediaFilters: 'Media Filters',
  all: 'All',
  movies: 'Movies',
  series: 'Series',
  music: 'Music',
  books: 'Books',
  audiobooks: 'Audiobooks',
});

const tabs = [
  {
    type: 'all',
    label: messages.all,
    icon: Squares2X2Icon,
    href: '/discover/trending',
  },
  {
    type: 'movie',
    label: messages.movies,
    icon: FilmIcon,
    href: '/discover/movies',
  },
  { type: 'tv', label: messages.series, icon: TvIcon, href: '/discover/tv' },
  {
    type: 'music',
    label: messages.music,
    icon: MusicalNoteIcon,
    href: '/discover/music',
  },
  {
    type: 'book',
    label: messages.books,
    icon: BookOpenIcon,
    href: '/discover/books',
  },
  {
    type: 'audiobook',
    label: messages.audiobooks,
    icon: SpeakerWaveIcon,
    href: '/discover/audiobooks',
  },
] as const;

const DiscoverMediaTabs = ({ selected, basePath }: DiscoverMediaTabsProps) => {
  const intl = useIntl();
  const { currentSettings } = useSettings();
  const { user, hasPermission } = useUser();
  const serviceAvailability = getUserServiceAvailability(
    currentSettings,
    user?.settings?.enabledMediaCategories,
    hasPermission(Permission.ADMIN)
  );
  const availableTypes = DISCOVER_MEDIA_TYPES.filter((type) =>
    isDiscoverMediaTypeEnabled(type, serviceAvailability)
  );
  const router = useRouter();
  const pin = useMediaFilterPin<DiscoverMediaType>({
    scope: 'trending',
    selected: selected ?? 'all',
    values: tabs.map((tab) => tab.type),
    ready: router.isReady && Boolean(basePath),
    explicit: Boolean(router.query.mediaType),
    restore: (value) => {
      void router.replace({
        pathname: basePath,
        query: { ...router.query, mediaType: value },
      });
    },
  });

  return (
    <PinnedFilterSection
      mediaType={
        selected === 'audiobook'
          ? 'book'
          : selected === 'all'
            ? 'movie'
            : (selected ?? 'movie')
      }
      section="mediaFilters"
      label={intl.formatMessage(messages.mediaFilters)}
    >
      <nav className="app-filter-row" data-testid="discover-media-tabs">
        {tabs
          .filter(
            (tab) =>
              tab.type === 'all' ||
              availableTypes.includes(tab.type as DiscoverMediaCategory)
          )
          .map((tab) => {
            const Icon = tab.icon;
            const isSelected = selected === tab.type;

            return (
              <MediaFilterOption
                key={tab.type}
                pin={pin}
                value={tab.type}
                label={intl.formatMessage(tab.label)}
                selected={isSelected}
              >
                <Link
                  href={
                    basePath
                      ? { pathname: basePath, query: { mediaType: tab.type } }
                      : tab.href
                  }
                  aria-current={isSelected ? 'page' : undefined}
                  className="app-control-shadow-exempt app-filter-segment-focus"
                  data-testid={`discover-media-tab-${tab.type}`}
                >
                  <Icon className="app-action-icon" aria-hidden="true" />
                  <span>{intl.formatMessage(tab.label)}</span>
                </Link>
              </MediaFilterOption>
            );
          })}
      </nav>
    </PinnedFilterSection>
  );
};

export default DiscoverMediaTabs;

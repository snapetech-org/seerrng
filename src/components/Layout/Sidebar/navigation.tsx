import { Permission } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import {
  BookOpenIcon,
  ClockIcon,
  CogIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
  EyeSlashIcon,
  FilmIcon,
  HeartIcon,
  MagnifyingGlassIcon,
  MusicalNoteIcon,
  NewspaperIcon,
  PuzzlePieceIcon,
  SparklesIcon,
  SpeakerWaveIcon,
  Square3Stack3DIcon,
  TrophyIcon,
  TvIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import {
  BookOpenIcon as FilledBookOpenIcon,
  ClockIcon as FilledClockIcon,
  CogIcon as FilledCogIcon,
  CommandLineIcon as FilledCommandLineIcon,
  ExclamationTriangleIcon as FilledExclamationTriangleIcon,
  EyeSlashIcon as FilledEyeSlashIcon,
  FilmIcon as FilledFilmIcon,
  HeartIcon as FilledHeartIcon,
  MagnifyingGlassIcon as FilledMagnifyingGlassIcon,
  MusicalNoteIcon as FilledMusicalNoteIcon,
  NewspaperIcon as FilledNewspaperIcon,
  PuzzlePieceIcon as FilledPuzzlePieceIcon,
  SparklesIcon as FilledSparklesIcon,
  SpeakerWaveIcon as FilledSpeakerWaveIcon,
  Square3Stack3DIcon as FilledSquare3Stack3DIcon,
  TrophyIcon as FilledTrophyIcon,
  TvIcon as FilledTvIcon,
  UsersIcon as FilledUsersIcon,
} from '@heroicons/react/24/solid';
import type { ReactElement, SVGProps } from 'react';

export const menuMessages = defineMessages('components.Layout.Sidebar', {
  discover: 'Discover',
  calendar: 'Calendar',
  downloads: 'Download Inbox',
  acquisitionTools: 'Acquisition Tools',
  library: 'My Library',
  myMedia: 'My Media',
  gamesLibrary: 'My Games',
  swipe: 'Swipe',
  indexerSearch: 'Indexer Search',
  browsemovies: 'Movies',
  browsemusic: 'Music',
  browsebooks: 'Books',
  browseaudiobooks: 'Audiobooks',
  browsesoftware: 'Software',
  browsecomics: 'Comics',
  browsemagazines: 'Magazines',
  browsesports: 'Sports',
  browsetv: 'Series',
  requests: 'Requests',
  blocklist: 'Blocklist',
  issues: 'Issues',
  users: 'User List',
  settings: 'Settings',
});

export type MenuMessageKey = keyof typeof menuMessages;
type NavigationIcon = ReactElement<SVGProps<SVGSVGElement>>;

export interface NavigationLink {
  id: string;
  href: string;
  messagesKey: MenuMessageKey;
  svgIcon: NavigationIcon;
  svgIconSelected: NavigationIcon;
  activeRegExp: RegExp;
  requiredPermission?: Permission | Permission[];
  permissionType?: 'and' | 'or';
  dataTestId?: string;
  nested?: boolean;
}

export interface NavigationSection {
  id: string;
  ariaLabelKey: MenuMessageKey;
  headingKey?: MenuMessageKey;
  links: NavigationLink[];
}

export const navigationSections: NavigationSection[] = [
  {
    id: 'discover',
    ariaLabelKey: 'discover',
    links: [
      {
        id: 'discover-home',
        href: '/',
        messagesKey: 'discover',
        svgIcon: <SparklesIcon aria-hidden="true" />,
        svgIconSelected: <FilledSparklesIcon aria-hidden="true" />,
        activeRegExp: /^\/(discover\/?)?$/,
      },
      {
        id: 'movies',
        href: '/discover/movies',
        messagesKey: 'browsemovies',
        svgIcon: <FilmIcon aria-hidden="true" />,
        svgIconSelected: <FilledFilmIcon aria-hidden="true" />,
        activeRegExp: /^\/(?:discover\/movies(?:\/.*)?|movie\/)/,
      },
      {
        id: 'series',
        href: '/discover/tv',
        messagesKey: 'browsetv',
        svgIcon: <TvIcon aria-hidden="true" />,
        svgIconSelected: <FilledTvIcon aria-hidden="true" />,
        activeRegExp: /^\/(?:discover\/tv(?:\/.*)?|tv\/)/,
      },
      {
        id: 'books',
        href: '/discover/books',
        messagesKey: 'browsebooks',
        svgIcon: <BookOpenIcon aria-hidden="true" />,
        svgIconSelected: <FilledBookOpenIcon aria-hidden="true" />,
        activeRegExp: /^\/(?:discover\/books(?:\/.*)?|book\/)/,
      },
      {
        id: 'audiobooks',
        href: '/discover/audiobooks',
        messagesKey: 'browseaudiobooks',
        svgIcon: <SpeakerWaveIcon aria-hidden="true" />,
        svgIconSelected: <FilledSpeakerWaveIcon aria-hidden="true" />,
        activeRegExp: /^\/discover\/audiobooks$/,
      },
      {
        id: 'swipe',
        href: '/swipe',
        messagesKey: 'swipe',
        svgIcon: <HeartIcon aria-hidden="true" />,
        svgIconSelected: <FilledHeartIcon aria-hidden="true" />,
        activeRegExp: /^\/swipe$/,
        requiredPermission: Permission.REQUEST,
      },
      {
        id: 'music',
        href: '/discover/music',
        messagesKey: 'browsemusic',
        svgIcon: <MusicalNoteIcon aria-hidden="true" />,
        svgIconSelected: <FilledMusicalNoteIcon aria-hidden="true" />,
        activeRegExp: /^\/(?:discover\/music(?:\/.*)?|music\/)/,
      },
      {
        id: 'software',
        href: '/software',
        messagesKey: 'browsesoftware',
        svgIcon: <CommandLineIcon aria-hidden="true" />,
        svgIconSelected: <FilledCommandLineIcon aria-hidden="true" />,
        activeRegExp: /^\/software(?:\/|$)/,
      },
      {
        id: 'comics',
        href: '/discover/comics',
        messagesKey: 'browsecomics',
        svgIcon: <Square3Stack3DIcon aria-hidden="true" />,
        svgIconSelected: <FilledSquare3Stack3DIcon aria-hidden="true" />,
        activeRegExp: /^\/(?:discover\/comics(?:\/.*)?|comic\/)/,
      },
      {
        id: 'magazines',
        href: '/discover/magazines',
        messagesKey: 'browsemagazines',
        svgIcon: <NewspaperIcon aria-hidden="true" />,
        svgIconSelected: <FilledNewspaperIcon aria-hidden="true" />,
        activeRegExp: /^\/(?:discover\/magazines(?:\/.*)?|magazine\/)/,
      },
      {
        id: 'sports',
        href: '/discover/sports',
        messagesKey: 'browsesports',
        svgIcon: <TrophyIcon aria-hidden="true" />,
        svgIconSelected: <FilledTrophyIcon aria-hidden="true" />,
        activeRegExp: /^\/(?:discover\/sports(?:\/.*)?|sportarr\/)/,
      },
    ],
  },
  {
    id: 'library',
    ariaLabelKey: 'library',
    headingKey: 'library',
    links: [
      {
        id: 'my-media',
        href: '/library',
        messagesKey: 'myMedia',
        svgIcon: <BookOpenIcon aria-hidden="true" />,
        svgIconSelected: <FilledBookOpenIcon aria-hidden="true" />,
        activeRegExp: /^\/library$/,
        nested: true,
      },
      {
        id: 'games-library',
        href: '/games',
        messagesKey: 'gamesLibrary',
        svgIcon: <PuzzlePieceIcon aria-hidden="true" />,
        svgIconSelected: <FilledPuzzlePieceIcon aria-hidden="true" />,
        activeRegExp: /^\/games(?:\/|$)/,
        nested: true,
      },
      {
        id: 'calendar',
        href: '/calendar',
        messagesKey: 'calendar',
        svgIcon: <ClockIcon aria-hidden="true" />,
        svgIconSelected: <FilledClockIcon aria-hidden="true" />,
        activeRegExp: /^\/calendar$/,
        nested: true,
      },
    ],
  },
  {
    id: 'acquisition-tools',
    ariaLabelKey: 'acquisitionTools',
    links: [
      {
        id: 'downloads',
        href: '/downloads',
        messagesKey: 'downloads',
        svgIcon: <ClockIcon aria-hidden="true" />,
        svgIconSelected: <FilledClockIcon aria-hidden="true" />,
        activeRegExp: /^\/downloads$/,
        requiredPermission: Permission.MANAGE_DOWNLOADS,
      },
      {
        id: 'indexer-search',
        href: '/indexer-search',
        messagesKey: 'indexerSearch',
        svgIcon: <MagnifyingGlassIcon aria-hidden="true" />,
        svgIconSelected: <FilledMagnifyingGlassIcon aria-hidden="true" />,
        activeRegExp: /^\/indexer-search$/,
        requiredPermission: Permission.MANAGE_REQUESTS,
      },
    ],
  },
  {
    id: 'requests',
    ariaLabelKey: 'requests',
    links: [
      {
        id: 'requests',
        href: '/requests',
        messagesKey: 'requests',
        svgIcon: <ClockIcon aria-hidden="true" />,
        svgIconSelected: <FilledClockIcon aria-hidden="true" />,
        activeRegExp: /^\/requests\/?$/,
      },
      {
        id: 'issues',
        href: '/issues',
        messagesKey: 'issues',
        svgIcon: <ExclamationTriangleIcon aria-hidden="true" />,
        svgIconSelected: <FilledExclamationTriangleIcon aria-hidden="true" />,
        activeRegExp: /^\/issues/,
        requiredPermission: [
          Permission.MANAGE_ISSUES,
          Permission.CREATE_ISSUES,
          Permission.VIEW_ISSUES,
        ],
        permissionType: 'or',
      },
      {
        id: 'blocklist',
        href: '/blocklist',
        messagesKey: 'blocklist',
        svgIcon: <EyeSlashIcon aria-hidden="true" />,
        svgIconSelected: <FilledEyeSlashIcon aria-hidden="true" />,
        activeRegExp: /^\/blocklist/,
        requiredPermission: [
          Permission.MANAGE_BLOCKLIST,
          Permission.VIEW_BLOCKLIST,
        ],
        permissionType: 'or',
      },
    ],
  },
  {
    id: 'settings',
    ariaLabelKey: 'settings',
    links: [
      {
        id: 'settings',
        href: '/settings',
        messagesKey: 'settings',
        svgIcon: <CogIcon aria-hidden="true" />,
        svgIconSelected: <FilledCogIcon aria-hidden="true" />,
        activeRegExp: /^\/settings/,
        requiredPermission: Permission.ADMIN,
        dataTestId: 'sidebar-menu-settings',
      },
      {
        id: 'users',
        href: '/users',
        messagesKey: 'users',
        svgIcon: <UsersIcon aria-hidden="true" />,
        svgIconSelected: <FilledUsersIcon aria-hidden="true" />,
        activeRegExp: /^\/users/,
        requiredPermission: Permission.MANAGE_USERS,
        dataTestId: 'sidebar-menu-users',
        nested: true,
      },
    ],
  },
];

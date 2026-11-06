import AudiobookshelfLogo from '@app/assets/services/audiobookshelf.svg';
import backissueLogo from '@app/assets/services/backissue.png';
import issuarrLogo from '@app/assets/services/issuarr.png';
import JellystatLogo from '@app/assets/services/jellystat.svg';
import kapowarrLogo from '@app/assets/services/kapowarr.png';
import LidarrLogo from '@app/assets/services/lidarr.svg';
import NavidromeLogo from '@app/assets/services/navidrome.svg';
import RadarrLogo from '@app/assets/services/radarr.svg';
import SonarrLogo from '@app/assets/services/sonarr.svg';
import sportarrLogo from '@app/assets/services/sportarr.png';
import WhisparrLogo from '@app/assets/services/whisparr.svg';
import Alert from '@app/components/Common/Alert';
import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import Modal from '@app/components/Common/Modal';
import PageTitle from '@app/components/Common/PageTitle';
import OverrideRuleTiles from '@app/components/Settings/OverrideRule/OverrideRuleTiles';
import ReaderDeliverySettings from '@app/components/Settings/ReaderDeliverySettings';
import SavedServiceHosts from '@app/components/Settings/SavedServiceHosts';
import SettingsDownloadClients from '@app/components/Settings/SettingsDownloadClients';
import { useSettingsPageAction } from '@app/components/Settings/SettingsLayout';
import SettingsProwlarr from '@app/components/Settings/SettingsProwlarr';
import SettingsReadMeABook from '@app/components/Settings/SettingsReadMeABook';
import SettingsRecognition from '@app/components/Settings/SettingsRecognition';
import SettingsSlskdn from '@app/components/Settings/SettingsSlskdn';
import SettingsSoftwareAcquisition from '@app/components/Settings/SettingsSoftwareAcquisition';
import SettingsSwipe from '@app/components/Settings/SettingsSwipe';
import SettingsTunerr from '@app/components/Settings/SettingsTunerr';
import SetupConnectionsImport from '@app/components/Settings/SetupConnectionsImport';
import {
  getSetupServiceCategories,
  type SetupServiceCategory,
} from '@app/components/Setup/setupServiceCategories';
import useSettings from '@app/hooks/useSettings';
import globalMessages from '@app/i18n/globalMessages';
import { getSafeApiErrorDetails } from '@app/utils/apiError';
import defineMessages from '@app/utils/defineMessages';
import { getSafeHref } from '@app/utils/safeUrl';
import { Transition } from '@headlessui/react';
import {
  BookOpenIcon,
  FilmIcon,
  MusicalNoteIcon,
  NewspaperIcon,
  PencilIcon,
  PlusIcon,
  Square3Stack3DIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import type { EnabledMediaCategories } from '@server/constants/mediaCategories';
import type OverrideRule from '@server/entity/OverrideRule';
import type { OverrideRuleResultsResponse } from '@server/interfaces/api/overrideRuleInterfaces';
import type {
  AudiobookshelfSettings,
  BackIssueSettings,
  JellystatSettings,
  KapowarrSettings,
  LazyLibrarianSettings,
  LidarrSettings,
  MylarSettings,
  NavidromeSettings,
  RadarrSettings,
  ReadarrSettings,
  SlskdnSettings,
  SonarrSettings,
  SportarrSettings,
  WhisparrSettings,
} from '@server/lib/settings';
import { readarrServiceSupportsFormat } from '@server/utils/readarrService';
import axios from 'axios';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';
import styles from './SettingsServices.module.css';

const KapowarrModal = dynamic(
  () => import('@app/components/Settings/KapowarrModal')
);
const BackIssueModal = dynamic(
  () => import('@app/components/Settings/BackIssueModal')
);
const AudiobookshelfModal = dynamic(
  () => import('@app/components/Settings/AudiobookshelfModal')
);
const NavidromeModal = dynamic(
  () => import('@app/components/Settings/NavidromeModal')
);
const JellystatModal = dynamic(
  () => import('@app/components/Settings/JellystatModal')
);
const LazyLibrarianModal = dynamic(
  () => import('@app/components/Settings/LazyLibrarianModal')
);
const LidarrModal = dynamic(
  () => import('@app/components/Settings/LidarrModal')
);
const MylarModal = dynamic(() => import('@app/components/Settings/MylarModal'));
const OverrideRuleModal = dynamic(
  () => import('@app/components/Settings/OverrideRule/OverrideRuleModal')
);
const RadarrModal = dynamic(
  () => import('@app/components/Settings/RadarrModal')
);
const ReadarrModal = dynamic(
  () => import('@app/components/Settings/ReadarrModal')
);
const BinderyModal = dynamic(
  () => import('@app/components/Settings/BinderyModal')
);
const SonarrModal = dynamic(
  () => import('@app/components/Settings/SonarrModal')
);
const SportarrModal = dynamic(
  () => import('@app/components/Settings/SportarrModal')
);
const WhisparrModal = dynamic(
  () => import('@app/components/Settings/WhisparrModal')
);

const messages = defineMessages('components.Settings', {
  services: 'Services',
  chooseServiceCategory: 'Manage connections and tools by library area',
  serviceCategoryTvMovies: 'TV & Movies',
  serviceCategoryBooks: 'Audiobooks & Books',
  setupServiceCategoryBooks: 'Books, Comics & Magazines',
  serviceCategoryMusic: 'Music',
  serviceCategoryTools: 'System',
  guidedSetupTitle: 'New to SeerrNG?',
  guidedSetupDescription:
    'Use the short setup guide to review request defaults and connect the services you use.',
  guidedSetupAction: 'Open guided setup',
  serviceCategories: 'Service categories',
  serviceGroupRequestDestinations: 'Request Destinations',
  serviceGroupViewing: 'Viewing and Live TV',
  serviceGroupBooks: 'Books and Audiobooks',
  serviceGroupComicsMagazines: 'Comics and Magazines',
  serviceGroupReaderTools: 'Reader Apps and Audiobook Discovery',
  serviceGroupMusicRequests: 'Music Requests and Downloads',
  serviceGroupMusicLibrary: 'Music Library',
  serviceGroupRequestRouting: 'Request Routing',
  serviceGroupSearchDownload: 'Search and Downloads',
  serviceGroupSoftware: 'Software and Games',
  serviceGroupDiscovery: 'Discovery Features',
  fourKDisabledTitle: 'Global 4K support is off',
  fourKDisabledDescription:
    'The 4K Server badge is a saved classification for a separate Radarr or Sonarr instance; it does not turn 4K on. Enable the global setting to restore 4K request options and separate availability tracking.',
  fourKSettingsLink: 'Open 4K settings',
  noSetupCategories:
    'No request categories are enabled. You can finish setup now and add service connections after enabling a category in Settings.',
  spotifyPlaylistSettings:
    'Configure Spotify playlist access in General settings',
  setupAssistantTitle: 'Connect your apps',
  setupAssistantDescription:
    'Find services with a Compose starter, Docker discovery, host checks, or a manual connection report. Import suggestions to fill in addresses, then test each connection before saving.',
  setupAssistantGuide: 'Open the setup guide',
  radarrsettings: 'Radarr Settings',
  sonarrsettings: 'Sonarr Settings',
  whisparrsettings: 'Whisparr Settings',
  sportarrsettings: 'Sportarr Settings',
  lidarrsettings: 'Lidarr Settings',
  readarrsettings: 'Bookshelf and Bindery Settings',
  audiobookshelfsettings: 'Audiobookshelf Availability',
  audiobookshelfDescription:
    'Optionally sync an Audiobookshelf book library so SeerrNG can recognize matching audiobooks that are already available. This connection is read-only and does not send acquisition requests.',
  addAudiobookshelf: 'Connect Audiobookshelf library',
  navidromesettings: 'Navidrome Availability',
  jellystatsettings: 'Jellystat Statistics',
  jellystatDescription:
    'Optionally show lifetime play counts from Jellystat on titles linked to Jellyfin. This connection is read-only.',
  addJellystat: 'Connect Jellystat Server',
  navidromeDescription:
    'Optionally read a Navidrome music library so SeerrNG can recognize albums you already have. Albums are matched by MusicBrainz ID. This connection is read-only.',
  addNavidrome: 'Connect Navidrome Server',
  videoServiceSettingsDescription:
    'Add {serverType} connections. Choose one standard default and, when 4K is enabled, one 4K default. A manager can change the destination before approval.',
  musicServiceSettingsDescription:
    'Add {serverType} connections and choose a default. A manager can change the destination before approving a request.',
  bookServiceSettingsDescription:
    'Connect ChaptarrNG, BookshelfNG, another Readarr-compatible service, or Bindery. Bindery can handle books and audiobooks through one connection. A manager can change the destination before approval.',
  bookServiceApiKeyDescription:
    'No variable is needed on the SeerrNG container. For ChaptarrNG 0.9.941+, set CHAPTARR__AUTH__SEERRAPIKEY on the ChaptarrNG container, then enter that key in this connection.',
  bookFreshSetup:
    'Recommended for a new setup: run one ChaptarrNG instance for both formats. Add the Book connection first, then use the same instance for Audiobooks.',
  bookAddMissingFormat:
    'This book server can handle both formats. Add the missing {format} connection using the same instance, or add a different server.',
  bookAddOtherFormat: 'Use this instance for {format} requests',
  bookSharedSetup:
    'These two SeerrNG connections route requests to one book-service instance and share its library.',
  bookSplitUpgrade:
    'Your Book and Audiobook connections use different addresses. Upgrades keep them as configured. If they use separate databases, migrate the audiobook library before pointing both connections to one shared book-service instance.',
  bookCombineGuide: 'Book backend deployment options',
  deleteserverconfirm: 'Are you sure you want to delete this server?',
  ssl: 'SSL',
  default: 'Default',
  default4k: 'Default 4K',
  is4k: '4K',
  ebook: 'Book',
  audiobook: 'Audiobook',
  address: 'Address',
  activeProfile: 'Active Profile',
  activeAnimeProfile: 'Active Anime Profile',
  addradarr: 'Add Radarr Server',
  addsonarr: 'Add Sonarr Server',
  addWhisparr: 'Connect Whisparr Server',
  adultServiceSettingsDescription:
    'Connect the scene-focused Whisparr v3 Eros branch. Adult media uses its own request permission and stays out of ordinary movie discovery.',
  whisparrEmpty:
    'No Whisparr servers are connected. Connect one to enable the Adult category.',
  whisparrLoadError: 'Whisparr server settings could not be loaded.',
  whisparrLoadErrorHelp:
    'Retry to check saved connections before adding another server.',
  whisparrPermissionError:
    'You need administrator access to view or change Whisparr connections.',
  whisparrLoadErrorStatus:
    'SeerrNG returned HTTP {status} while loading Whisparr settings. Retry, then check the server logs if the error continues.',
  retryWhisparr: 'Retry',
  addSportarr: 'Connect Sportarr Server',
  sportarrDescription:
    'Search and request sports leagues in Sportarr. Sportarr uses its own root folder and monitoring defaults when SeerrNG adds a league.',
  noDefaultSportarr:
    'Choose one Sportarr server as the default destination for sports requests.',
  addlidarr: 'Add Lidarr Server',
  addreadarr: 'Add ChaptarrNG Server',
  addbindery: 'Add Bindery Server',
  bothBookFormats: 'Book and Audiobook',
  addmylar: 'Add Mylar Server',
  addkapowarr: 'Add Kapowarr Server',
  addbackissue: 'Add BackIssue Server',
  addlazylibrarian: 'Add LazyLibrarian Server',
  lazylibrariansettings: 'LazyLibrarian Settings',
  magazineServiceSettingsDescription:
    'Configure LazyLibrarian to search and track magazine issues. Enable scanning to keep library availability current.',
  mediaTypeMagazine: 'magazine',
  mylarsettings: 'Mylar Settings',
  kapowarrsettings: 'Kapowarr Settings',
  backissuesettings: 'BackIssue Settings',
  comicServiceSettingsDescription:
    'Mylar, Kapowarr, and BackIssue share one default destination for comic requests.',
  mediaTypeComic: 'comic',
  noDefaultServer:
    'At least one {serverType} server must be marked as default in order for {mediaType} requests to be processed.',
  noDefaultNon4kServer:
    'If you only have a single {serverType} server for both non-4K and 4K content (or if you only download 4K content), your {serverType} server should <strong>NOT</strong> be designated as a 4K server.',
  noDefault4kServer:
    'A 4K {serverType} server must be marked as default in order to enable users to submit 4K {mediaType} requests.',
  mediaTypeMovie: 'movie',
  mediaTypeAdult: 'adult',
  mediaTypeSeries: 'series',
  mediaTypeMusic: 'music',
  mediaTypeBook: 'book',
  mediaTypeEbook: 'book',
  mediaTypeAudiobook: 'audiobook',
  deleteServer: 'Delete {serverType} Server',
  overrideRules: 'Override Rules',
  overrideRulesDescription:
    'Override rules allow you to specify properties that will be replaced if a request matches the rule.',
  addrule: 'New Override Rule',
});

type ServiceCategory =
  'tv-movies' | 'audiobooks-books' | 'music' | 'tools-other';

const serviceCategoryFromSearchTarget = (
  targetId: string | undefined
): ServiceCategory | undefined => {
  if (!targetId) return undefined;
  if (targetId.startsWith('download-clients-')) {
    return 'tools-other';
  }
  if (targetId.startsWith('slskdn-')) return 'music';
  if (targetId.startsWith('tunerr-')) return 'tv-movies';
  if (targetId.startsWith('reader-') || targetId.startsWith('readmeabook-')) {
    return 'audiobooks-books';
  }
  if (targetId === 'steamApiKey') return 'tools-other';
  return undefined;
};

const isServiceCategory = (value: unknown): value is ServiceCategory =>
  value === 'tv-movies' ||
  value === 'audiobooks-books' ||
  value === 'music' ||
  value === 'tools-other';

const ServiceCategoryPanel = ({
  category,
  title,
  activeCategory,
  children,
}: {
  category: ServiceCategory;
  title: string;
  activeCategory: ServiceCategory;
  children: ReactNode;
}) => (
  <section
    id={`settings-services-${category}`}
    data-settings-category={category}
    aria-label={title}
    hidden={activeCategory !== category}
    className={activeCategory === category ? styles.categoryPanel : 'hidden'}
  >
    {children}
  </section>
);

const ServiceGroup = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className={styles.serviceGroup} aria-label={title}>
    <h2 className={styles.serviceGroupHeading}>{title}</h2>
    <div className={styles.serviceGroupContent}>{children}</div>
  </section>
);

interface ServerInstanceProps {
  name: string;
  isDefault?: boolean;
  is4k?: boolean;
  hostname: string;
  port: number;
  isSSL?: boolean;
  externalUrl?: string;
  profileName?: string;
  animeProfileName?: string;
  isSonarr?: boolean;
  isSportarr?: boolean;
  isLidarr?: boolean;
  isReadarr?: boolean;
  isAudiobookshelf?: boolean;
  isNavidrome?: boolean;
  isJellystat?: boolean;
  isKapowarr?: boolean;
  isBackissue?: boolean;
  isMylar?: boolean;
  isComics?: boolean;
  isMagazines?: boolean;
  isAdult?: boolean;
  serviceFormat?: 'ebook' | 'audiobook' | 'both';
  isBindery?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export interface DVRTestResponse {
  profiles: {
    id: number;
    name: string;
  }[];
  rootFolders: {
    id: number;
    path: string;
  }[];
  tags: {
    id: number;
    label: string;
  }[];
  urlBase?: string;
}

export type RadarrTestResponse = DVRTestResponse;

export type SonarrTestResponse = DVRTestResponse & {
  metadataLanguages?: { id: number; name: string }[] | null;
  languageProfiles:
    | {
        id: number;
        name: string;
      }[]
    | null;
};

const ServerInstance = ({
  name,
  hostname,
  port,
  profileName,
  is4k = false,
  isDefault = false,
  isSSL = false,
  isSonarr = false,
  isSportarr = false,
  isLidarr = false,
  isReadarr = false,
  isBindery = false,
  isAudiobookshelf = false,
  isNavidrome = false,
  isJellystat = false,
  isKapowarr = false,
  isBackissue = false,
  isMylar = false,
  isComics = false,
  isMagazines = false,
  isAdult = false,
  serviceFormat,
  externalUrl,
  animeProfileName,
  onEdit,
  onDelete,
}: ServerInstanceProps) => {
  const intl = useIntl();

  const internalUrl =
    (isSSL ? 'https://' : 'http://') + hostname + ':' + String(port);
  const internalHref = getSafeHref(internalUrl);
  const serviceUrl = getSafeHref(externalUrl) ?? internalHref;

  return (
    <li className="settings-service-card app-card-inset refreshed-inset-surface">
      <div className="settings-service-card-content">
        <a
          href={serviceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="settings-service-logo-link"
        >
          {isSonarr ? (
            <SonarrLogo className="h-10 w-10 flex-shrink-0" />
          ) : isSportarr ? (
            <img
              src={sportarrLogo.src}
              className="h-10 w-10 flex-shrink-0 object-contain"
              alt=""
            />
          ) : isLidarr ? (
            <LidarrLogo className="h-10 w-10 flex-shrink-0" />
          ) : isReadarr ? (
            <BookOpenIcon className="h-10 w-10 flex-shrink-0 text-gray-300" />
          ) : isAudiobookshelf ? (
            <AudiobookshelfLogo className="h-10 w-10 flex-shrink-0" />
          ) : isAdult ? (
            <WhisparrLogo className="h-10 w-10 flex-shrink-0" />
          ) : isNavidrome ? (
            <NavidromeLogo className="h-10 w-10 flex-shrink-0" />
          ) : isJellystat ? (
            <JellystatLogo className="h-10 w-10 flex-shrink-0" />
          ) : isKapowarr ? (
            <img
              src={kapowarrLogo.src}
              className="h-10 w-10 flex-shrink-0 object-contain"
              alt=""
            />
          ) : isBackissue ? (
            <img
              src={backissueLogo.src}
              className="h-10 w-10 flex-shrink-0 object-contain"
              alt=""
            />
          ) : isMylar ? (
            <img
              src={issuarrLogo.src}
              className="h-10 w-10 flex-shrink-0 object-contain"
              alt=""
            />
          ) : isComics ? (
            <Square3Stack3DIcon className="h-10 w-10 flex-shrink-0 text-gray-300" />
          ) : isMagazines ? (
            <NewspaperIcon className="h-10 w-10 flex-shrink-0 text-gray-300" />
          ) : (
            <RadarrLogo className="h-10 w-10 flex-shrink-0" />
          )}
        </a>
        <div className="settings-service-card-body">
          <h3 className="settings-service-title">
            <a
              href={serviceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="transition duration-300 hover:text-white hover:underline"
            >
              {name}
            </a>
          </h3>
          <div className="settings-service-badges">
            {isDefault && !is4k && (
              <Badge>{intl.formatMessage(messages.default)}</Badge>
            )}
            {isDefault && is4k && (
              <Badge>{intl.formatMessage(messages.default4k)}</Badge>
            )}
            {!isDefault && is4k && (
              <Badge badgeType="warning">
                {intl.formatMessage(messages.is4k)}
              </Badge>
            )}
            {isReadarr && serviceFormat && (
              <Badge
                badgeType={
                  serviceFormat === 'audiobook' ? 'warning' : 'default'
                }
              >
                {intl.formatMessage(
                  serviceFormat === 'both'
                    ? messages.bothBookFormats
                    : serviceFormat === 'audiobook'
                      ? messages.audiobook
                      : messages.ebook
                )}
              </Badge>
            )}
            {isBindery && <Badge badgeType="success">Bindery</Badge>}
            {isAudiobookshelf && (
              <Badge badgeType="warning">
                {intl.formatMessage(messages.audiobook)}
              </Badge>
            )}
            {isSSL && (
              <Badge badgeType="success">
                {intl.formatMessage(messages.ssl)}
              </Badge>
            )}
          </div>
          <dl className="settings-service-details">
            <dt>{intl.formatMessage(messages.address)}</dt>
            <dd>
              <a
                href={internalHref}
                target="_blank"
                rel="noopener noreferrer"
                className="transition duration-300 hover:text-white hover:underline"
              >
                {internalUrl}
              </a>
            </dd>
            {profileName !== undefined && (
              <>
                <dt>{intl.formatMessage(messages.activeProfile)}</dt>
                <dd>{profileName}</dd>
              </>
            )}
            {animeProfileName !== undefined && (
              <>
                <dt>{intl.formatMessage(messages.activeAnimeProfile)}</dt>
                <dd>{animeProfileName}</dd>
              </>
            )}
          </dl>
          <div className="settings-card-actions settings-service-card-actions">
            <Button
              buttonType="warning"
              buttonSize="standard"
              onClick={() => onEdit()}
            >
              <PencilIcon />
              <span>{intl.formatMessage(globalMessages.edit)}</span>
            </Button>
            <Button
              buttonType="danger"
              buttonSize="standard"
              className="settings-service-delete-action"
              onClick={() => onDelete()}
            >
              <TrashIcon />
              <span>{intl.formatMessage(globalMessages.delete)}</span>
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
};

const SettingsServices = ({
  showProwlarr = false,
  hideGuidedSetupPrompt = false,
  setupEnabledMediaCategories,
  setupActiveCategory,
  onSetupCategoryChange,
}: {
  showProwlarr?: boolean;
  hideGuidedSetupPrompt?: boolean;
  setupEnabledMediaCategories?: EnabledMediaCategories;
  setupActiveCategory?: SetupServiceCategory;
  onSetupCategoryChange?: (category: SetupServiceCategory) => void;
}) => {
  const intl = useIntl();
  const router = useRouter();
  const { currentSettings } = useSettings();

  useEffect(() => {
    if (!router.isReady || router.pathname !== '/settings/services') return;
    const legacyProwlarrLink =
      router.query.settingsSearchTarget === 'prowlarr' ||
      window.location.hash === '#prowlarr';
    if (!legacyProwlarrLink) return;

    const settingsSearch =
      typeof router.query.settingsSearch === 'string'
        ? router.query.settingsSearch
        : undefined;
    void router.replace({
      pathname: '/settings/prowlarr',
      query: settingsSearch
        ? {
            settingsSearch,
            settingsSearchTarget: 'prowlarr-settings-title',
          }
        : {},
    });
  }, [router]);

  const searchTargetCategory = serviceCategoryFromSearchTarget(
    typeof router.query.settingsSearchTarget === 'string'
      ? router.query.settingsSearchTarget
      : undefined
  );
  const setupServiceCategories = setupEnabledMediaCategories
    ? getSetupServiceCategories(setupEnabledMediaCategories)
    : undefined;
  const defaultServiceCategory = setupServiceCategories?.[0] ?? 'tv-movies';
  const requestedServiceCategory =
    setupActiveCategory ??
    searchTargetCategory ??
    (isServiceCategory(router.query.serviceCategory)
      ? router.query.serviceCategory
      : undefined);
  const showSoftwareAcquisition =
    !setupEnabledMediaCategories ||
    setupEnabledMediaCategories.retro ||
    setupEnabledMediaCategories.modern ||
    setupEnabledMediaCategories.game ||
    currentSettings.softwareEnabled ||
    currentSettings.romarrEnabled;

  const selectServiceCategory = (category: ServiceCategory) => {
    if (setupEnabledMediaCategories && onSetupCategoryChange) {
      onSetupCategoryChange(category);
      return;
    }

    const query = { ...router.query };
    delete query.settingsSearch;
    delete query.settingsSearchTarget;
    void router.push(
      {
        pathname: router.pathname,
        query: { ...query, serviceCategory: category },
      },
      undefined,
      { shallow: true, scroll: false }
    );
  };

  const {
    data: radarrData,
    error: radarrError,
    mutate: revalidateRadarr,
  } = useSWR<RadarrSettings[]>('/api/v1/settings/radarr');
  const {
    data: sonarrData,
    error: sonarrError,
    mutate: revalidateSonarr,
  } = useSWR<SonarrSettings[]>('/api/v1/settings/sonarr');
  const {
    data: whisparrData,
    error: whisparrError,
    isValidating: whisparrIsValidating,
    mutate: revalidateWhisparr,
  } = useSWR<WhisparrSettings[]>('/api/v1/settings/whisparr');
  const whisparrErrorDetails = getSafeApiErrorDetails(whisparrError);
  const {
    data: sportarrData,
    error: sportarrError,
    mutate: revalidateSportarr,
  } = useSWR<SportarrSettings[]>('/api/v1/settings/sportarr');
  const {
    data: lidarrData,
    error: lidarrError,
    mutate: revalidateLidarr,
  } = useSWR<LidarrSettings[]>('/api/v1/settings/lidarr');
  const {
    data: readarrData,
    error: readarrError,
    mutate: revalidateReadarr,
  } = useSWR<ReadarrSettings[]>('/api/v1/settings/readarr');
  const { data: audiobookshelfData, mutate: revalidateAudiobookshelf } =
    useSWR<AudiobookshelfSettings | null>('/api/v1/settings/audiobookshelf');
  const { data: navidromeData, mutate: revalidateNavidrome } =
    useSWR<NavidromeSettings | null>('/api/v1/settings/navidrome');
  const { data: jellystatData, mutate: revalidateJellystat } =
    useSWR<JellystatSettings | null>('/api/v1/settings/jellystat');
  const { data: slskdnData } = useSWR<SlskdnSettings>(
    '/api/v1/settings/slskdn'
  );
  const { data: savedProwlarr } = useSWR<{
    apiKeyConfigured?: boolean;
    hostname?: string;
  }>('/api/v1/settings/prowlarr');
  const { data: savedDownloadClients } = useSWR<{ clients?: unknown[] }>(
    '/api/v1/settings/download-clients'
  );
  const {
    data: mylarData,
    error: mylarError,
    mutate: revalidateMylar,
  } = useSWR<MylarSettings[]>('/api/v1/settings/mylar');
  const {
    data: kapowarrData,
    error: kapowarrError,
    mutate: revalidateKapowarr,
  } = useSWR<KapowarrSettings[]>('/api/v1/settings/kapowarr');
  const {
    data: backissueData,
    error: backissueError,
    mutate: revalidateBackIssue,
  } = useSWR<BackIssueSettings[]>('/api/v1/settings/backissue');
  const {
    data: lazyLibrarianData,
    error: lazyLibrarianError,
    mutate: revalidateLazyLibrarian,
  } = useSWR<LazyLibrarianSettings[]>('/api/v1/settings/lazylibrarian');
  const { data: rules, mutate: revalidate } =
    useSWR<OverrideRuleResultsResponse>('/api/v1/overrideRule');
  const [editRadarrModal, setEditRadarrModal] = useState<{
    open: boolean;
    radarr: RadarrSettings | null;
  }>({
    open: false,
    radarr: null,
  });
  const [editSonarrModal, setEditSonarrModal] = useState<{
    open: boolean;
    sonarr: SonarrSettings | null;
  }>({
    open: false,
    sonarr: null,
  });
  const [editWhisparrModal, setEditWhisparrModal] = useState<{
    open: boolean;
    whisparr: WhisparrSettings | null;
  }>({ open: false, whisparr: null });
  const [editSportarrModal, setEditSportarrModal] = useState<{
    open: boolean;
    sportarr: SportarrSettings | null;
  }>({ open: false, sportarr: null });
  const [editLidarrModal, setEditLidarrModal] = useState<{
    open: boolean;
    lidarr: LidarrSettings | null;
  }>({
    open: false,
    lidarr: null,
  });
  const [editReadarrModal, setEditReadarrModal] = useState<{
    open: boolean;
    readarr: ReadarrSettings | null;
    copyFrom?: ReadarrSettings | null;
    copyFormat?: 'ebook' | 'audiobook';
  }>({
    open: false,
    readarr: null,
  });
  const [editBinderyModal, setEditBinderyModal] = useState<{
    open: boolean;
    bindery: ReadarrSettings | null;
  }>({ open: false, bindery: null });
  const [editAudiobookshelfModal, setEditAudiobookshelfModal] = useState(false);
  const [editNavidromeModal, setEditNavidromeModal] = useState(false);
  const [editJellystatModal, setEditJellystatModal] = useState(false);
  const [editMylarModal, setEditMylarModal] = useState<{
    open: boolean;
    mylar: MylarSettings | null;
  }>({
    open: false,
    mylar: null,
  });
  const [editKapowarrModal, setEditKapowarrModal] = useState<{
    open: boolean;
    kapowarr: KapowarrSettings | null;
  }>({
    open: false,
    kapowarr: null,
  });
  const [editBackIssueModal, setEditBackIssueModal] = useState<{
    open: boolean;
    backissue: BackIssueSettings | null;
  }>({ open: false, backissue: null });
  const [editLazyLibrarianModal, setEditLazyLibrarianModal] = useState<{
    open: boolean;
    lazylibrarian: LazyLibrarianSettings | null;
  }>({
    open: false,
    lazylibrarian: null,
  });
  const [deleteServerModal, setDeleteServerModal] = useState<{
    open: boolean;
    type:
      | 'radarr'
      | 'whisparr'
      | 'sonarr'
      | 'sportarr'
      | 'lidarr'
      | 'readarr'
      | 'audiobookshelf'
      | 'navidrome'
      | 'jellystat'
      | 'mylar'
      | 'kapowarr'
      | 'backissue'
      | 'lazylibrarian';
    serverId: number | null;
  }>({
    open: false,
    type: 'radarr',
    serverId: null,
  });
  const [overrideRuleModal, setOverrideRuleModal] = useState<{
    open: boolean;
    rule: OverrideRule | null;
  }>({
    open: false,
    rule: null,
  });
  const newOverrideRuleAction = useMemo(
    () => ({
      label: intl.formatMessage(messages.addrule),
      icon: <PlusIcon />,
      disabled:
        !radarrData?.length && !sonarrData?.length && !lidarrData?.length,
      onClick: () =>
        setOverrideRuleModal({
          open: true,
          rule: null,
        }),
    }),
    [intl, lidarrData?.length, radarrData?.length, sonarrData?.length]
  );
  useSettingsPageAction(newOverrideRuleAction);
  const hasReadarrEbook = readarrData?.some((readarr) =>
    readarrServiceSupportsFormat(readarr, 'ebook')
  );
  const hasDefaultReadarrEbook = readarrData?.some(
    (readarr) =>
      readarrServiceSupportsFormat(readarr, 'ebook') && readarr.isDefault
  );
  const hasReadarrAudiobook = readarrData?.some((readarr) =>
    readarrServiceSupportsFormat(readarr, 'audiobook')
  );
  const hasDefaultReadarrAudiobook = readarrData?.some(
    (readarr) =>
      readarrServiceSupportsFormat(readarr, 'audiobook') && readarr.isDefault
  );
  const missingBookFormat =
    hasReadarrEbook && !hasReadarrAudiobook
      ? 'audiobook'
      : hasReadarrAudiobook && !hasReadarrEbook
        ? 'ebook'
        : undefined;
  const readarrCompatibleConnections =
    readarrData?.filter((readarr) => readarr.backend !== 'bindery') ?? [];
  const bookConnectionToCopy =
    readarrCompatibleConnections.find((readarr) => readarr.isDefault) ??
    readarrCompatibleConnections[0];
  const ebookConnections =
    readarrData?.filter((readarr) =>
      readarrServiceSupportsFormat(readarr, 'ebook')
    ) ?? [];
  const audiobookConnections =
    readarrData?.filter((readarr) =>
      readarrServiceSupportsFormat(readarr, 'audiobook')
    ) ?? [];
  const hasSharedBookshelf = ebookConnections.some((ebook) =>
    audiobookConnections.some(
      (audiobook) =>
        ebook.hostname.trim().toLowerCase() ===
          audiobook.hostname.trim().toLowerCase() &&
        ebook.port === audiobook.port &&
        ebook.useSsl === audiobook.useSsl &&
        (ebook.baseUrl ?? '') === (audiobook.baseUrl ?? '')
    )
  );
  const configuredServiceCategories = new Set<SetupServiceCategory>();
  if (
    radarrData?.length ||
    sonarrData?.length ||
    whisparrData?.length ||
    sportarrData?.length ||
    jellystatData ||
    currentSettings.adultEnabled ||
    currentSettings.sportsEnabled
  ) {
    configuredServiceCategories.add('tv-movies');
  }
  if (
    readarrData?.length ||
    audiobookshelfData ||
    mylarData?.length ||
    kapowarrData?.length ||
    backissueData?.length ||
    lazyLibrarianData?.length ||
    currentSettings.booksEnabled ||
    currentSettings.ebookServiceEnabled ||
    currentSettings.audiobookServiceEnabled ||
    currentSettings.comicsEnabled ||
    currentSettings.magazinesEnabled
  ) {
    configuredServiceCategories.add('audiobooks-books');
  }
  if (
    lidarrData?.length ||
    navidromeData ||
    slskdnData?.enabled ||
    currentSettings.musicEnabled
  ) {
    configuredServiceCategories.add('music');
  }
  if (
    currentSettings.softwareEnabled ||
    currentSettings.romarrEnabled ||
    currentSettings.swipeEnabled ||
    savedProwlarr?.apiKeyConfigured ||
    Boolean(savedDownloadClients?.clients?.length)
  ) {
    configuredServiceCategories.add('tools-other');
  }
  const showMovieServices =
    !setupEnabledMediaCategories ||
    setupEnabledMediaCategories.movie ||
    Boolean(radarrData?.length);
  const showTvServices =
    !setupEnabledMediaCategories ||
    setupEnabledMediaCategories.tv ||
    Boolean(sonarrData?.length);
  const showAdultServices =
    !setupEnabledMediaCategories ||
    setupEnabledMediaCategories.adult ||
    Boolean(whisparrData?.length);
  const showSportsServices =
    !setupEnabledMediaCategories ||
    setupEnabledMediaCategories.sports ||
    Boolean(sportarrData?.length);
  const showMusicServices =
    !setupEnabledMediaCategories ||
    setupEnabledMediaCategories.music ||
    Boolean(lidarrData?.length || navidromeData || slskdnData?.enabled) ||
    currentSettings.musicEnabled;
  const showMediaStats =
    !setupEnabledMediaCategories ||
    setupEnabledMediaCategories.movie ||
    setupEnabledMediaCategories.tv ||
    Boolean(jellystatData);
  const showBookServices =
    !setupEnabledMediaCategories ||
    setupEnabledMediaCategories.ebook ||
    setupEnabledMediaCategories.audiobook ||
    Boolean(readarrData?.length) ||
    Boolean(audiobookshelfData) ||
    currentSettings.booksEnabled ||
    currentSettings.ebookServiceEnabled ||
    currentSettings.audiobookServiceEnabled;
  const showComicServices =
    !setupEnabledMediaCategories ||
    setupEnabledMediaCategories.comic ||
    Boolean(
      mylarData?.length || kapowarrData?.length || backissueData?.length
    ) ||
    currentSettings.comicsEnabled;
  const showMagazineServices =
    !setupEnabledMediaCategories ||
    setupEnabledMediaCategories.magazine ||
    Boolean(lazyLibrarianData?.length) ||
    currentSettings.magazinesEnabled;
  const visibleServiceCategories = (
    [
      'tv-movies',
      'audiobooks-books',
      'music',
      'tools-other',
    ] as SetupServiceCategory[]
  ).filter(
    (category) =>
      !setupServiceCategories ||
      setupServiceCategories.includes(category) ||
      configuredServiceCategories.has(category)
  );
  const activeServiceCategory = visibleServiceCategories.includes(
    requestedServiceCategory ?? defaultServiceCategory
  )
    ? (requestedServiceCategory ?? defaultServiceCategory)
    : (visibleServiceCategories[0] ?? 'tv-movies');

  const deleteServer = async () => {
    if (deleteServerModal.type === 'audiobookshelf') {
      await axios.delete('/api/v1/settings/audiobookshelf');
    } else if (deleteServerModal.type === 'navidrome') {
      await axios.delete('/api/v1/settings/navidrome');
    } else if (deleteServerModal.type === 'jellystat') {
      await axios.delete('/api/v1/settings/jellystat');
    } else {
      await axios.delete(
        `/api/v1/settings/${deleteServerModal.type}/${deleteServerModal.serverId}`
      );
    }
    setDeleteServerModal({ open: false, serverId: null, type: 'radarr' });
    revalidateRadarr();
    revalidateWhisparr();
    revalidateSonarr();
    revalidateSportarr();
    revalidateLidarr();
    revalidateReadarr();
    revalidateMylar();
    revalidateKapowarr();
    revalidateBackIssue();
    revalidateLazyLibrarian();
    revalidateAudiobookshelf();
    revalidateNavidrome();
    revalidateJellystat();
    mutate('/api/v1/settings/public');
  };

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.services),
          intl.formatMessage(globalMessages.settings),
        ]}
      />
      {!setupEnabledMediaCategories && !hideGuidedSetupPrompt && (
        <section className="app-card-sub section mb-5">
          <h2 className="heading">
            {intl.formatMessage(messages.guidedSetupTitle)}
          </h2>
          <p className="description mb-3">
            {intl.formatMessage(messages.guidedSetupDescription)}
          </p>
          <Link href="/setup?guide=1" legacyBehavior passHref>
            <Button as="a" buttonType="default" buttonSize="standard">
              {intl.formatMessage(messages.guidedSetupAction)}
            </Button>
          </Link>
        </section>
      )}
      <div className={styles.categoryPicker}>
        {visibleServiceCategories.length > 0 ? (
          <p className="description mb-3">
            {intl.formatMessage(messages.chooseServiceCategory)}
          </p>
        ) : (
          <p className="description mb-3">
            {intl.formatMessage(messages.noSetupCategories)}
          </p>
        )}
        <nav
          aria-label={intl.formatMessage(messages.serviceCategories)}
          className={`${styles.categoryNavigation} grid grid-cols-2 gap-2 sm:flex sm:flex-wrap`}
        >
          {(
            [
              {
                id: 'tv-movies',
                label: messages.serviceCategoryTvMovies,
                Icon: FilmIcon,
              },
              {
                id: 'audiobooks-books',
                label: setupEnabledMediaCategories
                  ? messages.setupServiceCategoryBooks
                  : messages.serviceCategoryBooks,
                Icon: BookOpenIcon,
              },
              {
                id: 'music',
                label: messages.serviceCategoryMusic,
                Icon: MusicalNoteIcon,
              },
              {
                id: 'tools-other',
                label: messages.serviceCategoryTools,
                Icon: Square3Stack3DIcon,
              },
            ] as const
          )
            .filter(({ id }) => visibleServiceCategories.includes(id))
            .map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={`app-filter-button w-full sm:w-auto ${
                  activeServiceCategory === id
                    ? 'app-filter-button-active'
                    : 'app-filter-button-idle'
                }`}
                aria-pressed={activeServiceCategory === id}
                aria-controls={`settings-services-${id}`}
                onClick={() => selectServiceCategory(id)}
              >
                <Icon aria-hidden="true" />
                {intl.formatMessage(label)}
              </button>
            ))}
        </nav>
      </div>
      <ServiceCategoryPanel
        category="tv-movies"
        title={intl.formatMessage(messages.serviceCategoryTvMovies)}
        activeCategory={activeServiceCategory}
      >
        {(showMovieServices ||
          showTvServices ||
          showAdultServices ||
          showSportsServices) && (
          <ServiceGroup
            title={intl.formatMessage(messages.serviceGroupRequestDestinations)}
          >
            <div
              data-settings-category="tv-movies"
              hidden={activeServiceCategory !== 'tv-movies'}
              className={activeServiceCategory === 'tv-movies' ? '' : 'hidden'}
            >
              {!currentSettings.enable4k &&
                (showMovieServices || showTvServices) && (
                  <Alert
                    type="info"
                    title={intl.formatMessage(messages.fourKDisabledTitle)}
                  >
                    <p>
                      {intl.formatMessage(messages.fourKDisabledDescription)}
                    </p>
                    <Button
                      as="a"
                      href="/settings/main?settingsSearchTarget=enable4k#enable4k"
                      buttonType="default"
                      buttonSize="standard"
                      className="mt-3"
                    >
                      {intl.formatMessage(messages.fourKSettingsLink)}
                    </Button>
                  </Alert>
                )}
              <div
                className="settings-service-heading"
                hidden={!showMovieServices}
              >
                <h3 className="heading">
                  {intl.formatMessage(messages.radarrsettings)}
                </h3>
                <p className="description">
                  {intl.formatMessage(
                    messages.videoServiceSettingsDescription,
                    {
                      serverType: 'Radarr',
                    }
                  )}
                </p>
              </div>
              {editRadarrModal.open && (
                <RadarrModal
                  radarr={editRadarrModal.radarr}
                  onClose={() => {
                    if (!overrideRuleModal.open)
                      setEditRadarrModal({ open: false, radarr: null });
                  }}
                  onSave={() => {
                    revalidateRadarr();
                    mutate('/api/v1/settings/public');
                    setEditRadarrModal({ open: false, radarr: null });
                  }}
                />
              )}
              {editSonarrModal.open && (
                <SonarrModal
                  sonarr={editSonarrModal.sonarr}
                  onClose={() => {
                    if (!overrideRuleModal.open)
                      setEditSonarrModal({ open: false, sonarr: null });
                  }}
                  onSave={() => {
                    revalidateSonarr();
                    mutate('/api/v1/settings/public');
                    setEditSonarrModal({ open: false, sonarr: null });
                  }}
                />
              )}
              {editWhisparrModal.open && (
                <WhisparrModal
                  whisparr={editWhisparrModal.whisparr}
                  onClose={() =>
                    setEditWhisparrModal({ open: false, whisparr: null })
                  }
                  onSave={() => {
                    revalidateWhisparr();
                    mutate('/api/v1/settings/public');
                    setEditWhisparrModal({ open: false, whisparr: null });
                  }}
                />
              )}
              {editSportarrModal.open && (
                <SportarrModal
                  settings={editSportarrModal.sportarr}
                  onClose={() =>
                    setEditSportarrModal({ open: false, sportarr: null })
                  }
                  onSave={() => {
                    revalidateSportarr();
                    mutate('/api/v1/settings/public');
                    setEditSportarrModal({ open: false, sportarr: null });
                  }}
                />
              )}
              {editLidarrModal.open && (
                <LidarrModal
                  lidarr={editLidarrModal.lidarr}
                  onClose={() =>
                    setEditLidarrModal({ open: false, lidarr: null })
                  }
                  onSave={() => {
                    revalidateLidarr();
                    mutate('/api/v1/settings/public');
                    setEditLidarrModal({ open: false, lidarr: null });
                  }}
                />
              )}
              {editReadarrModal.open && (
                <ReadarrModal
                  readarr={editReadarrModal.readarr}
                  copyFrom={editReadarrModal.copyFrom}
                  copyFormat={editReadarrModal.copyFormat}
                  onClose={() =>
                    setEditReadarrModal({ open: false, readarr: null })
                  }
                  onSave={() => {
                    revalidateReadarr();
                    mutate('/api/v1/settings/public');
                    setEditReadarrModal({ open: false, readarr: null });
                  }}
                />
              )}
              {editBinderyModal.open && (
                <BinderyModal
                  settings={editBinderyModal.bindery}
                  onClose={() =>
                    setEditBinderyModal({ open: false, bindery: null })
                  }
                  onSave={() => {
                    revalidateReadarr();
                    mutate('/api/v1/settings/public');
                    setEditBinderyModal({ open: false, bindery: null });
                  }}
                />
              )}
              {editJellystatModal && (
                <JellystatModal
                  settings={jellystatData ?? null}
                  onClose={() => setEditJellystatModal(false)}
                  onSave={() => {
                    revalidateJellystat();
                    setEditJellystatModal(false);
                  }}
                />
              )}
              {editNavidromeModal && (
                <NavidromeModal
                  settings={navidromeData ?? null}
                  onClose={() => setEditNavidromeModal(false)}
                  onSave={() => {
                    revalidateNavidrome();
                    setEditNavidromeModal(false);
                  }}
                />
              )}
              {editAudiobookshelfModal && (
                <AudiobookshelfModal
                  settings={audiobookshelfData ?? null}
                  onClose={() => setEditAudiobookshelfModal(false)}
                  onSave={() => {
                    revalidateAudiobookshelf();
                    mutate('/api/v1/settings/public');
                    setEditAudiobookshelfModal(false);
                  }}
                />
              )}
              {editMylarModal.open && (
                <MylarModal
                  mylar={editMylarModal.mylar}
                  onClose={() =>
                    setEditMylarModal({ open: false, mylar: null })
                  }
                  onSave={() => {
                    revalidateMylar();
                    revalidateKapowarr();
                    revalidateBackIssue();
                    mutate('/api/v1/settings/public');
                    setEditMylarModal({ open: false, mylar: null });
                  }}
                />
              )}
              {editKapowarrModal.open && (
                <KapowarrModal
                  kapowarr={editKapowarrModal.kapowarr}
                  onClose={() =>
                    setEditKapowarrModal({ open: false, kapowarr: null })
                  }
                  onSave={() => {
                    revalidateKapowarr();
                    revalidateMylar();
                    revalidateBackIssue();
                    mutate('/api/v1/settings/public');
                    setEditKapowarrModal({ open: false, kapowarr: null });
                  }}
                />
              )}
              {editBackIssueModal.open && (
                <BackIssueModal
                  backissue={editBackIssueModal.backissue}
                  onClose={() =>
                    setEditBackIssueModal({ open: false, backissue: null })
                  }
                  onSave={() => {
                    revalidateBackIssue();
                    revalidateMylar();
                    revalidateKapowarr();
                    mutate('/api/v1/settings/public');
                    setEditBackIssueModal({ open: false, backissue: null });
                  }}
                />
              )}
              {editLazyLibrarianModal.open && (
                <LazyLibrarianModal
                  lazylibrarian={editLazyLibrarianModal.lazylibrarian}
                  onClose={() =>
                    setEditLazyLibrarianModal({
                      open: false,
                      lazylibrarian: null,
                    })
                  }
                  onSave={() => {
                    revalidateLazyLibrarian();
                    mutate('/api/v1/settings/public');
                    setEditLazyLibrarianModal({
                      open: false,
                      lazylibrarian: null,
                    });
                  }}
                />
              )}
              <Transition as={Fragment} show={deleteServerModal.open}>
                <Modal
                  okText={intl.formatMessage(globalMessages.delete)}
                  okButtonType="danger"
                  okButtonProps={{ buttonIcon: 'delete' }}
                  onOk={() => deleteServer()}
                  onCancel={() =>
                    setDeleteServerModal({
                      open: false,
                      serverId: null,
                      type: 'radarr',
                    })
                  }
                  title={intl.formatMessage(messages.deleteServer, {
                    serverType:
                      deleteServerModal.type === 'radarr'
                        ? 'Radarr'
                        : deleteServerModal.type === 'whisparr'
                          ? 'Whisparr'
                          : deleteServerModal.type === 'sonarr'
                            ? 'Sonarr'
                            : deleteServerModal.type === 'sportarr'
                              ? 'Sportarr'
                              : deleteServerModal.type === 'lidarr'
                                ? 'Lidarr'
                                : deleteServerModal.type === 'backissue'
                                  ? 'BackIssue'
                                  : deleteServerModal.type === 'audiobookshelf'
                                    ? 'Audiobookshelf'
                                    : deleteServerModal.type === 'navidrome'
                                      ? 'Navidrome'
                                      : deleteServerModal.type === 'jellystat'
                                        ? 'Jellystat'
                                        : 'Bookshelf',
                  })}
                >
                  {intl.formatMessage(messages.deleteserverconfirm)}
                </Modal>
              </Transition>
              <div
                className="app-card-sub section settings-service-section"
                hidden={!showMovieServices}
              >
                {!radarrData && !radarrError && <LoadingSpinner />}
                {radarrData && !radarrError && (
                  <>
                    {radarrData.length > 0 &&
                      (!radarrData.some((radarr) => radarr.isDefault) ? (
                        <Alert
                          title={intl.formatMessage(messages.noDefaultServer, {
                            serverType: 'Radarr',
                            mediaType: intl.formatMessage(
                              messages.mediaTypeMovie
                            ),
                          })}
                        />
                      ) : !radarrData.some(
                          (radarr) => radarr.isDefault && !radarr.is4k
                        ) ? (
                        <Alert
                          title={intl.formatMessage(
                            messages.noDefaultNon4kServer,
                            {
                              serverType: 'Radarr',
                              strong: (msg: React.ReactNode) => (
                                <strong className="font-semibold text-white">
                                  {msg}
                                </strong>
                              ),
                            }
                          )}
                        />
                      ) : (
                        currentSettings.enable4k &&
                        radarrData.some((radarr) => radarr.is4k) &&
                        !radarrData.some(
                          (radarr) => radarr.isDefault && radarr.is4k
                        ) && (
                          <Alert
                            title={intl.formatMessage(
                              messages.noDefault4kServer,
                              {
                                serverType: 'Radarr',
                                mediaType: intl.formatMessage(
                                  messages.mediaTypeMovie
                                ),
                              }
                            )}
                          />
                        )
                      ))}
                    <ul className="settings-service-grid">
                      {radarrData.map((radarr) => (
                        <ServerInstance
                          key={`radarr-config-${radarr.id}`}
                          name={radarr.name}
                          hostname={radarr.hostname}
                          port={radarr.port}
                          profileName={radarr.activeProfileName}
                          isSSL={radarr.useSsl}
                          isDefault={radarr.isDefault}
                          is4k={radarr.is4k}
                          externalUrl={radarr.externalUrl}
                          onEdit={() =>
                            setEditRadarrModal({ open: true, radarr })
                          }
                          onDelete={() =>
                            setDeleteServerModal({
                              open: true,
                              serverId: radarr.id,
                              type: 'radarr',
                            })
                          }
                        />
                      ))}
                      <li className="settings-service-add-card">
                        <div className="settings-service-add-card-content">
                          <Button
                            buttonType="success"
                            buttonSize="standard"
                            onClick={() =>
                              setEditRadarrModal({ open: true, radarr: null })
                            }
                          >
                            <PlusIcon />
                            <span>
                              {intl.formatMessage(messages.addradarr)}
                            </span>
                          </Button>
                        </div>
                      </li>
                    </ul>
                  </>
                )}
              </div>
              <div
                className="settings-service-heading"
                hidden={!showTvServices}
              >
                <h3 className="heading">
                  {intl.formatMessage(messages.sonarrsettings)}
                </h3>
                <p className="description">
                  {intl.formatMessage(
                    messages.videoServiceSettingsDescription,
                    {
                      serverType: 'Sonarr',
                    }
                  )}
                </p>
              </div>
              <div
                className="app-card-sub section settings-service-section"
                hidden={!showTvServices}
              >
                {!sonarrData && !sonarrError && <LoadingSpinner />}
                {sonarrData && !sonarrError && (
                  <>
                    {sonarrData.length > 0 &&
                      (!sonarrData.some((sonarr) => sonarr.isDefault) ? (
                        <Alert
                          title={intl.formatMessage(messages.noDefaultServer, {
                            serverType: 'Sonarr',
                            mediaType: intl.formatMessage(
                              messages.mediaTypeSeries
                            ),
                          })}
                        />
                      ) : !sonarrData.some(
                          (sonarr) => sonarr.isDefault && !sonarr.is4k
                        ) ? (
                        <Alert
                          title={intl.formatMessage(
                            messages.noDefaultNon4kServer,
                            {
                              serverType: 'Sonarr',
                              strong: (msg: React.ReactNode) => (
                                <strong className="font-semibold text-white">
                                  {msg}
                                </strong>
                              ),
                            }
                          )}
                        />
                      ) : (
                        currentSettings.enable4k &&
                        sonarrData.some((sonarr) => sonarr.is4k) &&
                        !sonarrData.some(
                          (sonarr) => sonarr.isDefault && sonarr.is4k
                        ) && (
                          <Alert
                            title={intl.formatMessage(
                              messages.noDefault4kServer,
                              {
                                serverType: 'Sonarr',
                                mediaType: intl.formatMessage(
                                  messages.mediaTypeSeries
                                ),
                              }
                            )}
                          />
                        )
                      ))}
                    <ul className="settings-service-grid">
                      {sonarrData.map((sonarr) => (
                        <ServerInstance
                          key={`sonarr-config-${sonarr.id}`}
                          name={sonarr.name}
                          hostname={sonarr.hostname}
                          port={sonarr.port}
                          profileName={sonarr.activeProfileName}
                          animeProfileName={sonarr.activeAnimeProfileName}
                          isSSL={sonarr.useSsl}
                          isSonarr
                          isDefault={sonarr.isDefault}
                          is4k={sonarr.is4k}
                          externalUrl={sonarr.externalUrl}
                          onEdit={() =>
                            setEditSonarrModal({ open: true, sonarr })
                          }
                          onDelete={() =>
                            setDeleteServerModal({
                              open: true,
                              serverId: sonarr.id,
                              type: 'sonarr',
                            })
                          }
                        />
                      ))}
                      <li className="settings-service-add-card">
                        <div className="settings-service-add-card-content">
                          <Button
                            buttonType="success"
                            buttonSize="standard"
                            onClick={() =>
                              setEditSonarrModal({ open: true, sonarr: null })
                            }
                          >
                            <PlusIcon />
                            <span>
                              {intl.formatMessage(messages.addsonarr)}
                            </span>
                          </Button>
                        </div>
                      </li>
                    </ul>
                  </>
                )}
              </div>
              {(showAdultServices || showSportsServices) && (
                <>
                  <div
                    className="settings-service-heading"
                    hidden={!showAdultServices}
                  >
                    <h3 className="heading">
                      {intl.formatMessage(messages.whisparrsettings)}
                    </h3>
                    <p className="description">
                      {intl.formatMessage(
                        messages.adultServiceSettingsDescription
                      )}
                    </p>
                  </div>
                  <div
                    className="app-card-sub section settings-service-section"
                    hidden={!showAdultServices}
                  >
                    {!whisparrData &&
                      (!whisparrError || whisparrIsValidating) && (
                        <LoadingSpinner />
                      )}
                    {whisparrError && (
                      <Alert
                        type="error"
                        title={intl.formatMessage(messages.whisparrLoadError)}
                      >
                        <p className="mb-3">
                          {intl.formatMessage(messages.whisparrLoadErrorHelp)}
                        </p>
                        {whisparrErrorDetails.status === 403 && (
                          <p className="mb-3">
                            {intl.formatMessage(
                              messages.whisparrPermissionError
                            )}
                          </p>
                        )}
                        {whisparrErrorDetails.status !== undefined &&
                          whisparrErrorDetails.status !== 403 && (
                            <p className="mb-3">
                              {intl.formatMessage(
                                messages.whisparrLoadErrorStatus,
                                { status: whisparrErrorDetails.status }
                              )}
                            </p>
                          )}
                        <Button
                          buttonType="default"
                          buttonSize="sm"
                          disabled={whisparrIsValidating}
                          onClick={() => void revalidateWhisparr()}
                        >
                          {intl.formatMessage(messages.retryWhisparr)}
                        </Button>
                      </Alert>
                    )}
                    {whisparrData?.length === 0 && !whisparrError && (
                      <p className="description mb-4">
                        {intl.formatMessage(messages.whisparrEmpty)}
                      </p>
                    )}
                    {whisparrData &&
                      whisparrData.length > 0 &&
                      !whisparrData.some((service) => service.isDefault) && (
                        <Alert
                          title={intl.formatMessage(messages.noDefaultServer, {
                            serverType: 'Whisparr',
                            mediaType: intl.formatMessage(
                              messages.mediaTypeAdult
                            ),
                          })}
                        />
                      )}
                    {(whisparrData || whisparrError) && (
                      <ul className="settings-service-grid">
                        {whisparrData?.map((service) => (
                          <ServerInstance
                            key={`whisparr-config-${service.id}`}
                            name={service.name}
                            hostname={service.hostname}
                            port={service.port}
                            profileName={service.activeProfileName}
                            isSSL={service.useSsl}
                            isDefault={service.isDefault}
                            isAdult
                            externalUrl={service.externalUrl}
                            onEdit={() =>
                              setEditWhisparrModal({
                                open: true,
                                whisparr: service,
                              })
                            }
                            onDelete={() =>
                              setDeleteServerModal({
                                open: true,
                                serverId: service.id,
                                type: 'whisparr',
                              })
                            }
                          />
                        ))}
                        {((whisparrData && !whisparrError) ||
                          (whisparrError &&
                            !whisparrData &&
                            !whisparrIsValidating)) && (
                          <li className="settings-service-add-card">
                            <div className="settings-service-add-card-content">
                              <Button
                                buttonType="success"
                                buttonSize="standard"
                                onClick={() =>
                                  setEditWhisparrModal({
                                    open: true,
                                    whisparr: null,
                                  })
                                }
                              >
                                <PlusIcon
                                  className="settings-service-add-icon"
                                  aria-hidden="true"
                                />
                                <span>
                                  {intl.formatMessage(messages.addWhisparr)}
                                </span>
                              </Button>
                            </div>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                  <div
                    className="settings-service-heading"
                    hidden={!showSportsServices}
                  >
                    <h3 className="heading">
                      {intl.formatMessage(messages.sportarrsettings)}
                    </h3>
                    <p className="description">
                      {intl.formatMessage(messages.sportarrDescription)}
                    </p>
                  </div>
                  <div
                    className="app-card-sub section settings-service-section"
                    hidden={!showSportsServices}
                  >
                    {!sportarrData && !sportarrError && <LoadingSpinner />}
                    {sportarrData && !sportarrError && (
                      <>
                        {sportarrData.length > 0 &&
                          !sportarrData.some(
                            (instance) => instance.isDefault
                          ) && (
                            <Alert
                              title={intl.formatMessage(
                                messages.noDefaultSportarr
                              )}
                            />
                          )}
                        <ul className="settings-service-grid">
                          {sportarrData.map((instance) => (
                            <ServerInstance
                              key={`sportarr-config-${instance.id}`}
                              name={instance.name}
                              hostname={instance.hostname}
                              port={instance.port}
                              profileName={instance.activeProfileName}
                              isSSL={instance.useSsl}
                              isSportarr
                              isDefault={instance.isDefault}
                              externalUrl={instance.externalUrl}
                              onEdit={() =>
                                setEditSportarrModal({
                                  open: true,
                                  sportarr: instance,
                                })
                              }
                              onDelete={() =>
                                setDeleteServerModal({
                                  open: true,
                                  serverId: instance.id,
                                  type: 'sportarr',
                                })
                              }
                            />
                          ))}
                          <li className="settings-service-add-card">
                            <div className="settings-service-add-card-content">
                              <Button
                                buttonType="success"
                                buttonSize="standard"
                                onClick={() =>
                                  setEditSportarrModal({
                                    open: true,
                                    sportarr: null,
                                  })
                                }
                              >
                                <PlusIcon
                                  className="settings-service-add-icon"
                                  aria-hidden="true"
                                />
                                <span>
                                  {intl.formatMessage(messages.addSportarr)}
                                </span>
                              </Button>
                            </div>
                          </li>
                        </ul>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </ServiceGroup>
        )}
        {(showMediaStats || showTvServices) && (
          <ServiceGroup
            title={intl.formatMessage(messages.serviceGroupViewing)}
          >
            <div
              data-settings-category="tv-movies"
              hidden={activeServiceCategory !== 'tv-movies'}
              className={activeServiceCategory === 'tv-movies' ? '' : 'hidden'}
            >
              <div
                className="settings-service-heading"
                hidden={!showMediaStats}
              >
                <h3 className="heading">
                  {intl.formatMessage(messages.jellystatsettings)}
                </h3>
                <p className="description">
                  {intl.formatMessage(messages.jellystatDescription)}
                </p>
              </div>
              <ul className="settings-service-grid">
                {jellystatData &&
                  (() => {
                    const url = new URL(jellystatData.url);
                    return (
                      <ServerInstance
                        name="Jellystat"
                        hostname={url.hostname}
                        port={
                          url.port
                            ? Number(url.port)
                            : url.protocol === 'https:'
                              ? 443
                              : 80
                        }
                        isSSL={url.protocol === 'https:'}
                        isJellystat
                        onEdit={() => setEditJellystatModal(true)}
                        onDelete={() =>
                          setDeleteServerModal({
                            open: true,
                            serverId: null,
                            type: 'jellystat',
                          })
                        }
                      />
                    );
                  })()}
                {!jellystatData && (
                  <li className="settings-service-add-card">
                    <div className="settings-service-add-card-content">
                      <Button
                        buttonType="success"
                        buttonSize="standard"
                        onClick={() => setEditJellystatModal(true)}
                      >
                        <PlusIcon />
                        <span>{intl.formatMessage(messages.addJellystat)}</span>
                      </Button>
                    </div>
                  </li>
                )}
              </ul>
            </div>
            <div
              data-settings-category="tv-movies"
              hidden={activeServiceCategory !== 'tv-movies' || !showTvServices}
              className={
                activeServiceCategory === 'tv-movies' && showTvServices
                  ? ''
                  : 'hidden'
              }
            >
              <SettingsTunerr />
            </div>
          </ServiceGroup>
        )}
      </ServiceCategoryPanel>
      <ServiceCategoryPanel
        category="audiobooks-books"
        title={intl.formatMessage(
          setupEnabledMediaCategories
            ? messages.setupServiceCategoryBooks
            : messages.serviceCategoryBooks
        )}
        activeCategory={activeServiceCategory}
      >
        {showBookServices && (
          <ServiceGroup title={intl.formatMessage(messages.serviceGroupBooks)}>
            <div
              data-settings-category="audiobooks-books"
              hidden={
                activeServiceCategory !== 'audiobooks-books' ||
                !showBookServices
              }
              className={
                activeServiceCategory === 'audiobooks-books' && showBookServices
                  ? ''
                  : 'hidden'
              }
            >
              <div
                className="settings-service-heading"
                hidden={!showBookServices}
              >
                <h3 className="heading">
                  {intl.formatMessage(messages.readarrsettings)}
                </h3>
                <p className="description">
                  {intl.formatMessage(messages.bookServiceSettingsDescription)}
                </p>
                <p className="description mt-2">
                  {intl.formatMessage(messages.bookServiceApiKeyDescription)}
                </p>
              </div>
              <div
                className="app-card-sub section settings-service-section"
                hidden={!showBookServices}
              >
                {!readarrData && !readarrError && <LoadingSpinner />}
                {readarrData && !readarrError && (
                  <>
                    {readarrData.length === 0 && (
                      <p className="mb-4 text-sm text-gray-300">
                        {intl.formatMessage(messages.bookFreshSetup)}
                      </p>
                    )}
                    {missingBookFormat && bookConnectionToCopy && (
                      <div className="mb-4 flex flex-wrap items-center gap-3">
                        <p className="text-sm text-gray-300">
                          {intl.formatMessage(messages.bookAddMissingFormat, {
                            format: intl.formatMessage(
                              missingBookFormat === 'ebook'
                                ? messages.ebook
                                : messages.audiobook
                            ),
                          })}
                        </p>
                        <Button
                          buttonType="primary"
                          buttonSize="sm"
                          onClick={() =>
                            setEditReadarrModal({
                              open: true,
                              readarr: null,
                              copyFrom: bookConnectionToCopy,
                              copyFormat: missingBookFormat,
                            })
                          }
                        >
                          {intl.formatMessage(messages.bookAddOtherFormat, {
                            format: intl.formatMessage(
                              missingBookFormat === 'ebook'
                                ? messages.ebook
                                : messages.audiobook
                            ),
                          })}
                        </Button>
                      </div>
                    )}
                    {hasReadarrEbook && hasReadarrAudiobook && (
                      <p className="mb-4 text-sm text-gray-300">
                        {intl.formatMessage(
                          hasSharedBookshelf
                            ? messages.bookSharedSetup
                            : messages.bookSplitUpgrade
                        )}{' '}
                        {!hasSharedBookshelf && (
                          <a
                            className="text-primary-400 hover:underline"
                            href="https://github.com/snapetech-org/seerrng/blob/main/docs/using-seerr/bookshelf-backend.md"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {intl.formatMessage(messages.bookCombineGuide)}
                          </a>
                        )}
                      </p>
                    )}
                    {readarrData.length > 0 && (
                      <>
                        {hasReadarrEbook && !hasDefaultReadarrEbook && (
                          <Alert
                            title={intl.formatMessage(
                              messages.noDefaultServer,
                              {
                                serverType: 'book',
                                mediaType: intl.formatMessage(
                                  messages.mediaTypeEbook
                                ),
                              }
                            )}
                          />
                        )}
                        {hasReadarrAudiobook && !hasDefaultReadarrAudiobook && (
                          <Alert
                            title={intl.formatMessage(
                              messages.noDefaultServer,
                              {
                                serverType: 'book',
                                mediaType: intl.formatMessage(
                                  messages.mediaTypeAudiobook
                                ),
                              }
                            )}
                          />
                        )}
                        {!hasReadarrEbook && !hasReadarrAudiobook && (
                          <Alert
                            title={intl.formatMessage(
                              messages.noDefaultServer,
                              {
                                serverType: 'book',
                                mediaType: intl.formatMessage(
                                  messages.mediaTypeBook
                                ),
                              }
                            )}
                          />
                        )}
                      </>
                    )}
                    <ul className="settings-service-grid">
                      {readarrData.map((readarr) => (
                        <ServerInstance
                          key={`readarr-config-${readarr.id}`}
                          name={readarr.name}
                          hostname={readarr.hostname}
                          port={readarr.port}
                          profileName={readarr.activeProfileName}
                          isSSL={readarr.useSsl}
                          isReadarr={true}
                          isBindery={readarr.backend === 'bindery'}
                          serviceFormat={readarr.serviceType ?? 'ebook'}
                          isDefault={readarr.isDefault}
                          externalUrl={readarr.externalUrl}
                          onEdit={() =>
                            readarr.backend === 'bindery'
                              ? setEditBinderyModal({
                                  open: true,
                                  bindery: readarr,
                                })
                              : setEditReadarrModal({ open: true, readarr })
                          }
                          onDelete={() =>
                            setDeleteServerModal({
                              open: true,
                              serverId: readarr.id,
                              type: 'readarr',
                            })
                          }
                        />
                      ))}
                      <li className="settings-service-add-card">
                        <div className="settings-service-add-card-content">
                          <Button
                            buttonType="success"
                            buttonSize="standard"
                            onClick={() =>
                              setEditReadarrModal({ open: true, readarr: null })
                            }
                          >
                            <PlusIcon />
                            <span>
                              {intl.formatMessage(messages.addreadarr)}
                            </span>
                          </Button>
                        </div>
                      </li>
                      <li className="settings-service-add-card">
                        <div className="settings-service-add-card-content">
                          <Button
                            buttonType="success"
                            buttonSize="standard"
                            onClick={() =>
                              setEditBinderyModal({ open: true, bindery: null })
                            }
                          >
                            <PlusIcon />
                            <span>
                              {intl.formatMessage(messages.addbindery)}
                            </span>
                          </Button>
                        </div>
                      </li>
                    </ul>
                    <div className="settings-service-heading">
                      <h4 className="text-lg font-semibold">
                        {intl.formatMessage(messages.audiobookshelfsettings)}
                      </h4>
                      <p className="description">
                        {intl.formatMessage(messages.audiobookshelfDescription)}
                      </p>
                    </div>
                    <ul className="settings-service-grid">
                      {audiobookshelfData && (
                        <ServerInstance
                          name={`${audiobookshelfData.name} · ${audiobookshelfData.libraryName}`}
                          hostname={audiobookshelfData.hostname}
                          port={audiobookshelfData.port}
                          isSSL={audiobookshelfData.useSsl}
                          isAudiobookshelf
                          externalUrl={audiobookshelfData.externalUrl}
                          onEdit={() => setEditAudiobookshelfModal(true)}
                          onDelete={() =>
                            setDeleteServerModal({
                              open: true,
                              serverId: audiobookshelfData.id,
                              type: 'audiobookshelf',
                            })
                          }
                        />
                      )}
                      {!audiobookshelfData && (
                        <li className="settings-service-add-card">
                          <div className="settings-service-add-card-content">
                            <Button
                              buttonType="success"
                              buttonSize="standard"
                              onClick={() => setEditAudiobookshelfModal(true)}
                            >
                              <PlusIcon />
                              <span>
                                {intl.formatMessage(messages.addAudiobookshelf)}
                              </span>
                            </Button>
                          </div>
                        </li>
                      )}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </ServiceGroup>
        )}
        {(showComicServices || showMagazineServices) && (
          <ServiceGroup
            title={intl.formatMessage(messages.serviceGroupComicsMagazines)}
          >
            <div
              data-settings-category="audiobooks-books"
              hidden={
                activeServiceCategory !== 'audiobooks-books' ||
                (!showComicServices && !showMagazineServices)
              }
              className={
                activeServiceCategory === 'audiobooks-books' &&
                (showComicServices || showMagazineServices)
                  ? ''
                  : 'hidden'
              }
            >
              <div
                className="settings-service-heading"
                hidden={!showComicServices}
              >
                <h3 className="heading">
                  {intl.formatMessage(messages.mylarsettings)}
                </h3>
                <p className="description">
                  {intl.formatMessage(
                    messages.comicServiceSettingsDescription,
                    {
                      serverType: 'Mylar',
                    }
                  )}
                </p>
              </div>
              {showComicServices &&
                mylarData &&
                kapowarrData &&
                backissueData &&
                mylarData.length + kapowarrData.length + backissueData.length >
                  0 &&
                !mylarData.some((mylar) => mylar.isDefault) &&
                !kapowarrData.some((kapowarr) => kapowarr.isDefault) &&
                !backissueData.some((backissue) => backissue.isDefault) && (
                  <Alert
                    title={intl.formatMessage(messages.noDefaultServer, {
                      serverType: 'Mylar, Kapowarr, or BackIssue',
                      mediaType: intl.formatMessage(messages.mediaTypeComic),
                    })}
                  />
                )}
              <div
                className="app-card-sub section settings-service-section"
                hidden={!showComicServices}
              >
                {!mylarData && !mylarError && <LoadingSpinner />}
                {mylarData && !mylarError && (
                  <>
                    <ul className="settings-service-grid">
                      {mylarData.map((mylar) => (
                        <ServerInstance
                          key={`mylar-config-${mylar.id}`}
                          name={mylar.name}
                          hostname={mylar.hostname}
                          port={mylar.port}
                          profileName={mylar.rootFolder ?? ''}
                          isSSL={mylar.useSsl}
                          isComics={true}
                          isMylar
                          isDefault={mylar.isDefault}
                          externalUrl={mylar.externalUrl}
                          onEdit={() =>
                            setEditMylarModal({ open: true, mylar })
                          }
                          onDelete={() =>
                            setDeleteServerModal({
                              open: true,
                              serverId: mylar.id,
                              type: 'mylar',
                            })
                          }
                        />
                      ))}
                      <li className="settings-service-add-card">
                        <div className="settings-service-add-card-content">
                          <Button
                            buttonType="success"
                            buttonSize="standard"
                            onClick={() =>
                              setEditMylarModal({ open: true, mylar: null })
                            }
                          >
                            <PlusIcon />
                            <span>{intl.formatMessage(messages.addmylar)}</span>
                          </Button>
                        </div>
                      </li>
                    </ul>
                  </>
                )}
              </div>
              <div
                className="settings-service-heading"
                hidden={!showComicServices}
              >
                <h3 className="heading">
                  {intl.formatMessage(messages.kapowarrsettings)}
                </h3>
                <p className="description">
                  {intl.formatMessage(
                    messages.comicServiceSettingsDescription,
                    {
                      serverType: 'Kapowarr',
                    }
                  )}
                </p>
              </div>
              <div
                className="app-card-sub section settings-service-section"
                hidden={!showComicServices}
              >
                {!kapowarrData && !kapowarrError && <LoadingSpinner />}
                {kapowarrData && !kapowarrError && (
                  <>
                    <ul className="settings-service-grid">
                      {kapowarrData.map((kapowarr) => (
                        <ServerInstance
                          key={`kapowarr-config-${kapowarr.id}`}
                          name={kapowarr.name}
                          hostname={kapowarr.hostname}
                          port={kapowarr.port}
                          profileName={kapowarr.rootFolder ?? ''}
                          isSSL={kapowarr.useSsl}
                          isComics={true}
                          isKapowarr
                          isDefault={kapowarr.isDefault}
                          externalUrl={kapowarr.externalUrl}
                          onEdit={() =>
                            setEditKapowarrModal({ open: true, kapowarr })
                          }
                          onDelete={() =>
                            setDeleteServerModal({
                              open: true,
                              serverId: kapowarr.id,
                              type: 'kapowarr',
                            })
                          }
                        />
                      ))}
                      <li className="settings-service-add-card">
                        <div className="settings-service-add-card-content">
                          <Button
                            buttonType="success"
                            buttonSize="standard"
                            onClick={() =>
                              setEditKapowarrModal({
                                open: true,
                                kapowarr: null,
                              })
                            }
                          >
                            <PlusIcon />
                            <span>
                              {intl.formatMessage(messages.addkapowarr)}
                            </span>
                          </Button>
                        </div>
                      </li>
                    </ul>
                  </>
                )}
              </div>
              <div
                className="settings-service-heading"
                hidden={!showComicServices}
              >
                <h3 className="heading">
                  {intl.formatMessage(messages.backissuesettings)}
                </h3>
                <p className="description">
                  {intl.formatMessage(
                    messages.comicServiceSettingsDescription,
                    {
                      serverType: 'BackIssue',
                    }
                  )}
                </p>
              </div>
              <div
                className="app-card-sub section settings-service-section"
                hidden={!showComicServices}
              >
                {!backissueData && !backissueError && <LoadingSpinner />}
                {backissueData && !backissueError && (
                  <ul className="settings-service-grid">
                    {backissueData.map((backissue) => (
                      <ServerInstance
                        key={`backissue-config-${backissue.id}`}
                        name={backissue.name}
                        hostname={backissue.hostname}
                        port={backissue.port}
                        isSSL={backissue.useSsl}
                        isComics={true}
                        isBackissue
                        isDefault={backissue.isDefault}
                        externalUrl={backissue.externalUrl}
                        onEdit={() =>
                          setEditBackIssueModal({ open: true, backissue })
                        }
                        onDelete={() =>
                          setDeleteServerModal({
                            open: true,
                            serverId: backissue.id,
                            type: 'backissue',
                          })
                        }
                      />
                    ))}
                    <li className="settings-service-add-card">
                      <div className="settings-service-add-card-content">
                        <Button
                          buttonType="success"
                          buttonSize="standard"
                          onClick={() =>
                            setEditBackIssueModal({
                              open: true,
                              backissue: null,
                            })
                          }
                        >
                          <PlusIcon />
                          <span>
                            {intl.formatMessage(messages.addbackissue)}
                          </span>
                        </Button>
                      </div>
                    </li>
                  </ul>
                )}
              </div>
              <div
                className="settings-service-heading"
                hidden={!showMagazineServices}
              >
                <h3 className="heading">
                  {intl.formatMessage(messages.lazylibrariansettings)}
                </h3>
                <p className="description">
                  {intl.formatMessage(
                    messages.magazineServiceSettingsDescription
                  )}
                </p>
              </div>
              <div
                className="app-card-sub section settings-service-section"
                hidden={!showMagazineServices}
              >
                {!lazyLibrarianData && !lazyLibrarianError && (
                  <LoadingSpinner />
                )}
                {lazyLibrarianData && !lazyLibrarianError && (
                  <>
                    {lazyLibrarianData.length > 0 &&
                      !lazyLibrarianData.some(({ isDefault }) => isDefault) && (
                        <Alert
                          title={intl.formatMessage(messages.noDefaultServer, {
                            serverType: 'LazyLibrarian',
                            mediaType: intl.formatMessage(
                              messages.mediaTypeMagazine
                            ),
                          })}
                        />
                      )}
                    <ul className="settings-service-grid">
                      {lazyLibrarianData.map((lazylibrarian) => (
                        <ServerInstance
                          key={`lazylibrarian-config-${lazylibrarian.id}`}
                          name={lazylibrarian.name}
                          hostname={lazylibrarian.hostname}
                          port={lazylibrarian.port}
                          isSSL={lazylibrarian.useSsl}
                          isMagazines={true}
                          isDefault={lazylibrarian.isDefault}
                          externalUrl={lazylibrarian.externalUrl}
                          onEdit={() =>
                            setEditLazyLibrarianModal({
                              open: true,
                              lazylibrarian,
                            })
                          }
                          onDelete={() =>
                            setDeleteServerModal({
                              open: true,
                              serverId: lazylibrarian.id,
                              type: 'lazylibrarian',
                            })
                          }
                        />
                      ))}
                      <li className="settings-service-add-card">
                        <div className="settings-service-add-card-content">
                          <Button
                            buttonType="success"
                            buttonSize="standard"
                            onClick={() =>
                              setEditLazyLibrarianModal({
                                open: true,
                                lazylibrarian: null,
                              })
                            }
                          >
                            <PlusIcon />
                            <span>
                              {intl.formatMessage(messages.addlazylibrarian)}
                            </span>
                          </Button>
                        </div>
                      </li>
                    </ul>
                  </>
                )}
              </div>
            </div>
          </ServiceGroup>
        )}
        {showBookServices && (
          <ServiceGroup
            title={intl.formatMessage(messages.serviceGroupReaderTools)}
          >
            <div
              data-settings-category="audiobooks-books"
              hidden={
                activeServiceCategory !== 'audiobooks-books' ||
                !showBookServices
              }
              className={
                activeServiceCategory === 'audiobooks-books' && showBookServices
                  ? ''
                  : 'hidden'
              }
            >
              <ReaderDeliverySettings />
            </div>
            <div
              data-settings-category="audiobooks-books"
              hidden={
                activeServiceCategory !== 'audiobooks-books' ||
                !showBookServices
              }
              className={
                activeServiceCategory === 'audiobooks-books' && showBookServices
                  ? ''
                  : 'hidden'
              }
            >
              <SettingsReadMeABook />
            </div>
          </ServiceGroup>
        )}
      </ServiceCategoryPanel>
      <ServiceCategoryPanel
        category="music"
        title={intl.formatMessage(messages.serviceCategoryMusic)}
        activeCategory={activeServiceCategory}
      >
        {showMusicServices && (
          <ServiceGroup
            title={intl.formatMessage(messages.serviceGroupMusicRequests)}
          >
            <div
              data-settings-category="music"
              hidden={activeServiceCategory !== 'music'}
              className={activeServiceCategory === 'music' ? '' : 'hidden'}
            >
              <div
                className="settings-service-heading"
                hidden={!showMusicServices}
              >
                <h3 className="heading">
                  {intl.formatMessage(messages.lidarrsettings)}
                </h3>
                <p className="description">
                  {intl.formatMessage(
                    messages.musicServiceSettingsDescription,
                    {
                      serverType: 'Lidarr',
                    }
                  )}
                </p>
              </div>
              <div
                className="app-card-sub section settings-service-section"
                hidden={!showMusicServices}
              >
                {!lidarrData && !lidarrError && <LoadingSpinner />}
                {lidarrData && !lidarrError && (
                  <>
                    {lidarrData.length > 0 &&
                      (!lidarrData.some((lidarr) => lidarr.isDefault) ? (
                        <Alert
                          title={intl.formatMessage(messages.noDefaultServer, {
                            serverType: 'Lidarr',
                            mediaType: intl.formatMessage(
                              messages.mediaTypeMusic
                            ),
                          })}
                        />
                      ) : null)}
                    <ul className="settings-service-grid">
                      {lidarrData.map((lidarr) => (
                        <ServerInstance
                          key={`lidarr-config-${lidarr.id}`}
                          name={lidarr.name}
                          hostname={lidarr.hostname}
                          port={lidarr.port}
                          profileName={lidarr.activeProfileName}
                          isSSL={lidarr.useSsl}
                          isLidarr={true}
                          isDefault={lidarr.isDefault}
                          externalUrl={lidarr.externalUrl}
                          onEdit={() =>
                            setEditLidarrModal({ open: true, lidarr })
                          }
                          onDelete={() =>
                            setDeleteServerModal({
                              open: true,
                              serverId: lidarr.id,
                              type: 'lidarr',
                            })
                          }
                        />
                      ))}
                      <li className="settings-service-add-card">
                        <div className="settings-service-add-card-content">
                          <Button
                            buttonType="success"
                            buttonSize="standard"
                            onClick={() =>
                              setEditLidarrModal({ open: true, lidarr: null })
                            }
                          >
                            <PlusIcon />
                            <span>
                              {intl.formatMessage(messages.addlidarr)}
                            </span>
                          </Button>
                        </div>
                      </li>
                    </ul>
                  </>
                )}
              </div>
            </div>
            <div
              data-settings-category="music"
              hidden={activeServiceCategory !== 'music' || !showMusicServices}
              className={
                activeServiceCategory === 'music' && showMusicServices
                  ? ''
                  : 'hidden'
              }
            >
              <SettingsSlskdn />
            </div>
          </ServiceGroup>
        )}
        <ServiceGroup
          title={intl.formatMessage(messages.serviceGroupMusicLibrary)}
        >
          <div
            data-settings-category="music"
            hidden={activeServiceCategory !== 'music'}
            className={activeServiceCategory === 'music' ? '' : 'hidden'}
          >
            <div className="settings-service-heading">
              <h3 className="heading">
                {intl.formatMessage(messages.navidromesettings)}
              </h3>
              <p className="description">
                {intl.formatMessage(messages.navidromeDescription)}
              </p>
            </div>
            <ul className="settings-service-grid">
              {navidromeData &&
                (() => {
                  const url = new URL(navidromeData.url);
                  return (
                    <ServerInstance
                      name={`${navidromeData.username} · Navidrome`}
                      hostname={url.hostname}
                      port={
                        url.port
                          ? Number(url.port)
                          : url.protocol === 'https:'
                            ? 443
                            : 80
                      }
                      isSSL={url.protocol === 'https:'}
                      isNavidrome
                      onEdit={() => setEditNavidromeModal(true)}
                      onDelete={() =>
                        setDeleteServerModal({
                          open: true,
                          serverId: null,
                          type: 'navidrome',
                        })
                      }
                    />
                  );
                })()}
              {!navidromeData && (
                <li className="settings-service-add-card">
                  <div className="settings-service-add-card-content">
                    <Button
                      buttonType="success"
                      buttonSize="standard"
                      onClick={() => setEditNavidromeModal(true)}
                    >
                      <PlusIcon />
                      <span>{intl.formatMessage(messages.addNavidrome)}</span>
                    </Button>
                  </div>
                </li>
              )}
            </ul>
            <p className="mt-6 text-sm text-gray-300">
              <a
                className="text-indigo-300 underline hover:text-indigo-200"
                href="/settings/main?settingsSearchTarget=spotifyClientId#spotifyClientId"
              >
                {intl.formatMessage(messages.spotifyPlaylistSettings)}
              </a>
            </p>
          </div>
        </ServiceGroup>
      </ServiceCategoryPanel>
      <ServiceCategoryPanel
        category="tools-other"
        title={intl.formatMessage(messages.serviceCategoryTools)}
        activeCategory={activeServiceCategory}
      >
        <div
          data-settings-category="tools-other"
          hidden={activeServiceCategory !== 'tools-other'}
          className={activeServiceCategory === 'tools-other' ? '' : 'hidden'}
        >
          <section className="app-card-sub section">
            <h2 className="heading">
              {intl.formatMessage(messages.setupAssistantTitle)}
            </h2>
            <p className="description">
              {intl.formatMessage(messages.setupAssistantDescription)}
            </p>
            <Button
              as="a"
              href="https://github.com/snapetech-org/seerrng/blob/main/docs/using-seerr/setup-assistant.md"
              target="_blank"
              rel="noopener noreferrer"
              buttonType="default"
              buttonSize="standard"
            >
              {intl.formatMessage(messages.setupAssistantGuide)}
            </Button>
            <SetupConnectionsImport />
            <SavedServiceHosts />
          </section>
        </div>
        <div
          data-settings-category="tools-other"
          hidden={activeServiceCategory !== 'tools-other'}
          className={activeServiceCategory === 'tools-other' ? '' : 'hidden'}
        >
          <ServiceGroup
            title={intl.formatMessage(messages.serviceGroupRequestRouting)}
          >
            <div className="settings-service-heading">
              <h3 className="heading">
                {intl.formatMessage(messages.overrideRules)}
              </h3>
              <p className="description">
                {intl.formatMessage(messages.overrideRulesDescription, {
                  serverType: 'Sonarr',
                })}
              </p>
            </div>
            <div className="app-card-sub section settings-service-section">
              <ul className="settings-service-grid">
                {rules &&
                  radarrData &&
                  sonarrData &&
                  lidarrData &&
                  readarrData && (
                    <OverrideRuleTiles
                      rules={rules}
                      radarrServices={radarrData}
                      sonarrServices={sonarrData}
                      lidarrServices={lidarrData}
                      readarrServices={readarrData}
                      setOverrideRuleModal={setOverrideRuleModal}
                      revalidate={revalidate}
                    />
                  )}
              </ul>
            </div>
          </ServiceGroup>
          <ServiceGroup
            title={intl.formatMessage(messages.serviceGroupSearchDownload)}
          >
            {showProwlarr && <SettingsProwlarr />}
            <SettingsDownloadClients />
          </ServiceGroup>
        </div>
        <div
          data-settings-category="tools-other"
          hidden={activeServiceCategory !== 'tools-other'}
          className={activeServiceCategory === 'tools-other' ? '' : 'hidden'}
        >
          {!setupEnabledMediaCategories && (
            <ServiceGroup
              title={intl.formatMessage(messages.serviceGroupDiscovery)}
            >
              <SettingsSwipe />
              <SettingsRecognition />
            </ServiceGroup>
          )}
          {showSoftwareAcquisition && (
            <ServiceGroup
              title={intl.formatMessage(messages.serviceGroupSoftware)}
            >
              <SettingsSoftwareAcquisition />
            </ServiceGroup>
          )}
        </div>
      </ServiceCategoryPanel>

      {overrideRuleModal.open &&
        radarrData &&
        sonarrData &&
        lidarrData &&
        readarrData && (
          <OverrideRuleModal
            rule={overrideRuleModal.rule}
            onClose={() => {
              setOverrideRuleModal({
                open: false,
                rule: null,
              });
              revalidate();
            }}
            radarrServices={radarrData}
            sonarrServices={sonarrData}
            lidarrServices={lidarrData}
            readarrServices={readarrData}
          />
        )}
    </>
  );
};

export default SettingsServices;

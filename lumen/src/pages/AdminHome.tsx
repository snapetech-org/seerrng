import { useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { Section } from '../components/cards';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';

const destinationMessages: Record<string, string> = {
  'Setup Guide': 'lumen.admin.dest.setupGuide',
  'General Settings': 'lumen.admin.dest.general',
  'Network Settings': 'lumen.admin.dest.network',
  'Connection Hosts': 'lumen.admin.dest.connectionHosts',
  'Prowlarr Settings': 'lumen.admin.dest.prowlarr',
  'Radarr Services': 'lumen.admin.dest.radarr',
  'Sonarr Services': 'lumen.admin.dest.sonarr',
  'Lidarr Services': 'lumen.admin.dest.lidarr',
  'Book and Audiobook Services': 'lumen.admin.dest.books',
  'LazyLibrarian Services': 'lumen.admin.dest.lazyLibrarian',
  'Mylar Services': 'lumen.admin.dest.mylar',
  'Kapowarr Services': 'lumen.admin.dest.kapowarr',
  'BackIssue Services': 'lumen.admin.dest.backIssue',
  'Software Acquisition': 'lumen.admin.dest.softwareAcquisition',
  'Tunerr Settings': 'lumen.admin.dest.tunerr',
  'Sportarr Services': 'lumen.admin.dest.sportarr',
  'Soulseek Settings': 'lumen.admin.dest.soulseek',
  'Reader Delivery': 'lumen.admin.dest.readerDelivery',
  'Share and Image Recognition': 'lumen.admin.dest.shareRecognition',
  'Swipe Settings': 'lumen.admin.dest.swipe',
  'Request Override Rules': 'lumen.admin.dest.overrideRules',
  'Download Client Settings': 'lumen.admin.dest.downloadClients',
  'ReadMeABook Settings': 'lumen.admin.dest.readmeabook',
  'Navidrome Settings': 'lumen.admin.dest.navidrome',
  'Jellystat Settings': 'lumen.admin.dest.jellystat',
  'Audiobookshelf Settings': 'lumen.admin.dest.audiobookshelf',
  'Kavita Settings': 'lumen.admin.dest.kavita',
  'Whisparr Services': 'lumen.admin.dest.whisparr',
  'Discovery Integrations': 'lumen.admin.dest.discovery',
  'Metadata Providers': 'lumen.admin.dest.metadata',
  'Instance Notifications': 'lumen.admin.dest.notifications',
  'Library Migration': 'lumen.admin.dest.libraryMigration',
  'Media Server Libraries': 'lumen.admin.dest.mediaLibraries',
  'Media Categories': 'lumen.admin.dest.categories',
  'Scheduled Jobs': 'lumen.admin.dest.jobs',
  'About SeerrNG': 'lumen.admin.dest.about',
  'System Logs': 'lumen.admin.dest.logs',
  Users: 'lumen.admin.dest.users',
  'System Caches': 'lumen.admin.dest.caches',
  'Lumen Settings': 'lumen.admin.dest.lumenSettings',
  '4K Requests': 'lumen.admin.dest.4k',
  'Application API Key': 'lumen.admin.dest.apiKey',
  'Download Client Refresh Interval': 'lumen.admin.dest.downloadRefresh',
  'Spotify Playlist Import': 'lumen.admin.dest.spotifyImport',
  'Steam Library Import': 'lumen.admin.dest.steamImport',
  'Default Request Quotas': 'lumen.admin.dest.quotas',
};

const destinations = [
  ['Setup Guide', '/setup?guide=1'],
  ['General Settings', '/admin/general'],
  ['Network Settings', '/admin/network'],
  ['Connection Hosts', '/admin/connection-hosts'],
  ['Prowlarr Settings', '/admin/prowlarr'],
  ['Radarr Services', '/admin/radarr'],
  ['Sonarr Services', '/admin/sonarr'],
  ['Lidarr Services', '/admin/lidarr'],
  ['Book and Audiobook Services', '/admin/readarr'],
  ['LazyLibrarian Services', '/admin/lazylibrarian'],
  ['Mylar Services', '/admin/mylar'],
  ['Kapowarr Services', '/admin/kapowarr'],
  ['BackIssue Services', '/admin/backissue'],
  ['Software Acquisition', '/admin/software-acquisition'],
  ['Tunerr Settings', '/admin/tunerr'],
  ['Sportarr Services', '/admin/sportarr'],
  ['Soulseek Settings', '/admin/soulseek'],
  ['Reader Delivery', '/admin/reader-delivery'],
  ['Share and Image Recognition', '/admin/recognition'],
  ['Swipe Settings', '/admin/swipe'],
  ['Request Override Rules', '/admin/override-rules'],
  ['Download Client Settings', '/admin/download-clients'],
  ['ReadMeABook Settings', '/admin/readmeabook'],
  ['Navidrome Settings', '/admin/navidrome'],
  ['Jellystat Settings', '/admin/jellystat'],
  ['Audiobookshelf Settings', '/admin/audiobookshelf'],
  ['Kavita Settings', '/admin/kavita'],
  ['Whisparr Services', '/admin/whisparr'],
  ['Discovery Integrations', '/admin/discovery'],
  ['Metadata Providers', '/admin/metadata'],
  ['Instance Notifications', '/admin/notifications'],
  ['Library Migration', '/admin/library-migration'],
  ['Media Server Libraries', '/admin/media-libraries'],
  ['Media Categories', '/admin/categories'],
  ['Scheduled Jobs', '/admin/jobs'],
  ['About SeerrNG', '/admin/about'],
  ['System Logs', '/admin/logs'],
  ['Users', '/admin/users'],
  ['System Caches', '/admin/caches'],
  ['Lumen Settings', '/me/lumen'],
] as const;

const serviceGroups = {
  'tv-movies': {
    label: 'TV and Movies',
    pages: ['radarr', 'sonarr', 'tunerr', 'sportarr', 'whisparr', 'jellystat'],
  },
  'audiobooks-books': {
    label: 'Audiobooks and Books',
    pages: [
      'readarr',
      'reader-delivery',
      'readmeabook',
      'audiobookshelf',
      'lazylibrarian',
      'mylar',
      'kapowarr',
      'backissue',
      'kavita',
    ],
  },
  music: { label: 'Music', pages: ['lidarr', 'soulseek', 'navidrome'] },
  'tools-other': {
    label: 'System Services',
    pages: [
      'connection-hosts',
      'prowlarr',
      'download-clients',
      'override-rules',
      'software-acquisition',
      'recognition',
    ],
  },
} satisfies Record<string, { label: string; pages: string[] }>;
const groupMessages: Record<string, string> = {
  'tv-movies': 'lumen.admin.group.tvMovies',
  'audiobooks-books': 'lumen.admin.group.booksAudiobooks',
  music: 'lumen.admin.group.music',
  'tools-other': 'lumen.admin.group.systemServices',
};

const shortcuts = [
  ['4K Requests', '/admin/general#enable4k', '4k uhd ultra hd'],
  ['Application API Key', '/admin/general#apiKey', 'apikey token'],
  [
    'Download Client Refresh Interval',
    '/admin/download-clients#download-clients-interval',
    'poll polling frequency seconds live download progress',
  ],
  [
    'Spotify Playlist Import',
    '/admin/general#spotifyClientId',
    'spotify client id secret credentials',
  ],
  [
    'Steam Library Import',
    '/admin/software-acquisition#steam-library-import',
    'steam api key apikey credentials',
  ],
  [
    'Default Request Quotas',
    '/admin/general#default-request-quotas',
    'limit limits quotas',
  ],
  [
    'Prowlarr Settings',
    '/admin/prowlarr',
    'indexer search nzbhydra2 nzb hydra2',
  ],
] as const;

export function AdminLinks({
  pages,
  terms = [],
}: { pages?: readonly string[]; terms?: readonly string[] } = {}) {
  const { t } = useLumenLocale();
  const localizedLabel = (label: string) =>
    t(destinationMessages[label] ?? '', label);
  const entries = terms.length
    ? [
        ...destinations.filter(
          ([, path]) => !shortcuts.some(([, target]) => target === path)
        ),
        ...shortcuts,
      ].filter(([label, , aliases]) => {
        const searchable =
          `${label} ${localizedLabel(label)} ${aliases ?? ''}`.toLowerCase();
        return terms.every((term) => searchable.includes(term));
      })
    : destinations.filter(
        ([, path]) => !pages || pages.includes(path.slice('/admin/'.length))
      );

  if (!entries.length)
    return (
      <p className="note">
        {t('lumen.admin.noSettingsMatch', 'No settings match this search.')}
      </p>
    );
  return (
    <div className="setlist">
      {entries.map(([label, path]) => (
        <div className="set" key={path}>
          <b>{localizedLabel(label)}</b>
          <Link
            className="go"
            to={path}
            aria-label={`${t('lumen.admin.open', 'Open')} ${localizedLabel(label)}`}
          >
            {t('lumen.admin.open', 'Open')} <Icon name="chev" size="sm" />
          </Link>
        </div>
      ))}
    </div>
  );
}

export default function AdminHome() {
  const { t } = useLumenLocale();
  const [params] = useSearchParams();
  const { hash } = useLocation();
  const [search, setSearch] = useState('');
  if (hash === '#prowlarr') return <Navigate to="/admin/prowlarr" replace />;
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const category = params.get('serviceCategory') ?? '';
  const group = Object.hasOwn(serviceGroups, category)
    ? serviceGroups[category as keyof typeof serviceGroups]
    : undefined;
  return (
    <>
      <header className="ph">
        <h1>{t('lumen.admin.title', 'Administration')}</h1>
      </header>
      <div className="toolbar">
        <label className="sel">
          <span className="lbl">
            {t('lumen.admin.searchSettings', 'Search Settings')}
          </span>
          <input
            className="cfg-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <nav
        className="toolbar"
        aria-label={t(
          'lumen.admin.administrationCategories',
          'Administration Categories'
        )}
      >
        <Link
          className="btn btn-quiet btn-sm"
          to="/admin"
          onClick={() => setSearch('')}
          aria-current={!group ? 'page' : undefined}
        >
          {t('lumen.admin.allSettingsTools', 'All Settings and Tools')}
        </Link>
        {Object.entries(serviceGroups).map(([key, { label }]) => (
          <Link
            className="btn btn-quiet btn-sm"
            key={key}
            to={`/admin?serviceCategory=${key}`}
            onClick={() => setSearch('')}
            aria-current={group && category === key ? 'page' : undefined}
          >
            {t(groupMessages[key], label)}
          </Link>
        ))}
      </nav>
      <Section
        title={
          terms.length
            ? t('lumen.admin.searchResults', 'Search Results')
            : group
              ? t(groupMessages[category], group.label)
              : t('lumen.admin.settingsTools', 'Settings and Tools')
        }
      >
        <AdminLinks pages={group?.pages} terms={terms} />
      </Section>
    </>
  );
}

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Section } from '../components/cards';
import { Icon } from '../icons';

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
      'software-acquisition',
      'recognition',
    ],
  },
} satisfies Record<string, { label: string; pages: string[] }>;

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
  const entries = terms.length
    ? [
        ...destinations.filter(
          ([, path]) => !shortcuts.some(([, target]) => target === path)
        ),
        ...shortcuts,
      ].filter(([label, , aliases]) => {
        const searchable = `${label} ${aliases ?? ''}`.toLowerCase();
        return terms.every((term) => searchable.includes(term));
      })
    : destinations.filter(
        ([, path]) => !pages || pages.includes(path.slice('/admin/'.length))
      );

  if (!entries.length)
    return <p className="note">No settings match this search.</p>;
  return (
    <div className="setlist">
      {entries.map(([label, path]) => (
        <div className="set" key={path}>
          <b>{label}</b>
          <Link className="go" to={path} aria-label={`Open ${label}`}>
            Open <Icon name="chev" size="sm" />
          </Link>
        </div>
      ))}
    </div>
  );
}

export default function AdminHome() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const category = params.get('serviceCategory') ?? '';
  const group = Object.hasOwn(serviceGroups, category)
    ? serviceGroups[category as keyof typeof serviceGroups]
    : undefined;
  return (
    <>
      <header className="ph">
        <h1>Administration</h1>
      </header>
      <div className="toolbar">
        <label className="sel">
          <span className="lbl">Search Settings</span>
          <input
            className="cfg-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <nav className="toolbar" aria-label="Administration Categories">
        <Link
          className="btn btn-quiet btn-sm"
          to="/admin"
          onClick={() => setSearch('')}
          aria-current={!group ? 'page' : undefined}
        >
          All Settings and Tools
        </Link>
        {Object.entries(serviceGroups).map(([key, { label }]) => (
          <Link
            className="btn btn-quiet btn-sm"
            key={key}
            to={`/admin?serviceCategory=${key}`}
            onClick={() => setSearch('')}
            aria-current={group && category === key ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <Section
        title={
          terms.length
            ? 'Search Results'
            : (group?.label ?? 'Settings and Tools')
        }
      >
        <AdminLinks pages={group?.pages} terms={terms} />
      </Section>
    </>
  );
}

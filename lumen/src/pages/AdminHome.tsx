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

export function AdminLinks({ pages }: { pages?: readonly string[] } = {}) {
  return (
    <div className="setlist">
      {destinations
        .filter(
          ([, path]) => !pages || pages.includes(path.slice('/admin/'.length))
        )
        .map(([label, path]) => (
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
  const category = params.get('serviceCategory') ?? '';
  const group = Object.hasOwn(serviceGroups, category)
    ? serviceGroups[category as keyof typeof serviceGroups]
    : undefined;
  return (
    <>
      <header className="ph">
        <h1>Administration</h1>
      </header>
      <Section
        title={group?.label ?? 'Settings and Tools'}
        link={group ? ['All Settings and Tools', '/admin'] : undefined}
      >
        <AdminLinks pages={group?.pages} />
      </Section>
    </>
  );
}

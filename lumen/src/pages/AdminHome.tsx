import { Link } from 'react-router-dom';
import { Section } from '../components/cards';
import { Icon } from '../icons';

const destinations = [
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
  ['Sportarr Services', '/admin/sportarr'],
  ['Soulseek Settings', '/admin/soulseek'],
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

export function AdminLinks() {
  return (
    <div className="setlist">
      {destinations.map(([label, path]) => (
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
  return (
    <>
      <header className="ph">
        <h1>Administration</h1>
      </header>
      <Section title="Settings and Tools">
        <AdminLinks />
      </Section>
    </>
  );
}

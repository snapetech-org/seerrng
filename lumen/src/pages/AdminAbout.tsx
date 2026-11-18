import { Link } from 'react-router-dom';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import ReleaseHistory from '../components/ReleaseHistory';
import { useApi, usePublicSettings } from '../hooks';

const project = 'https://github.com/snapetech-org/seerrng';

export default function AdminAbout() {
  const settings = usePublicSettings();
  const about = useApi<{
    version: string;
    totalMediaItems: number;
    totalRequests: number;
    tz?: string;
    appDataPath: string;
  }>('/settings/about');
  const status = useApi<{
    commitTag: string;
    updateCheckSucceeded?: boolean;
    updateAvailable?: boolean;
  }>(settings?.versionCheck ? '/status' : null);

  let update = '';
  if (settings?.versionCheck === false) update = 'Version check disabled';
  else if (status.error) update = 'Could not check for updates';
  else if (status.data && status.data.commitTag !== 'local') {
    update = !status.data.updateCheckSucceeded
      ? 'Could not check for updates'
      : status.data.updateAvailable
        ? 'Update available'
        : 'Up to date';
  }

  const rows = about.data && [
    ['Version', about.data.version],
    ['Total Media', about.data.totalMediaItems.toLocaleString()],
    ['Total Requests', about.data.totalRequests.toLocaleString()],
    ['Data Directory', about.data.appDataPath],
    ['Time Zone', about.data.tz || 'Unavailable'],
  ];

  return (
    <>
      <header className="ph">
        <h1>About SeerrNG</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me">
          Back to Account
        </Link>
      </div>
      <ServiceNote
        error={about.error}
        what="server information"
        retry={about.reload}
      />
      {!about.data && !about.error && (
        <p className="note" role="status">
          Loading server information…
        </p>
      )}
      {rows && (
        <Section title="Server Information">
          <dl className="setlist">
            {rows.map(([label, value]) => (
              <div className="set" key={label}>
                <dt>
                  <b>{label}</b>
                </dt>
                <dd>
                  <small>{value}</small>
                </dd>
              </div>
            ))}
          </dl>
          {update && <p className="note">{update}</p>}
          {about.data?.version.startsWith('main-') && (
            <p className="note">This server is running a development build.</p>
          )}
        </Section>
      )}
      <Section title="Support and Releases">
        <div className="toolbar">
          <a className="btn btn-quiet btn-sm" href={project + '/releases'}>
            Release Notes
          </a>
          <a
            className="btn btn-quiet btn-sm"
            href={project + '/tree/main/docs'}
          >
            Documentation
          </a>
          <a className="btn btn-quiet btn-sm" href={project + '/discussions'}>
            GitHub Discussions
          </a>
          <a
            className="btn btn-quiet btn-sm"
            href="https://discord.gg/5PyXBfvS6T"
          >
            Discord
          </a>
          <a
            className="btn btn-quiet btn-sm"
            href="https://ko-fi.com/snapetech"
          >
            Support Development
          </a>
        </div>
      </Section>
      {about.data && <ReleaseHistory installed={about.data.version} />}
      <Section title="Metadata Attribution">
        <p className="note">
          SeerrNG uses The Movie Database API. TMDB does not endorse or certify
          SeerrNG.
        </p>
        <a
          className="btn btn-quiet btn-sm"
          href="https://www.themoviedb.org/api-terms-of-use"
        >
          TMDB API Terms
        </a>
      </Section>
    </>
  );
}

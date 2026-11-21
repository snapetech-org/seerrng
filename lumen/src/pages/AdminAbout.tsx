import { Link } from 'react-router-dom';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import ReleaseHistory from '../components/ReleaseHistory';
import { useApi, usePublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';

const project = 'https://github.com/snapetech-org/seerrng';

export default function AdminAbout() {
  const { locale, t } = useLumenLocale();
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

  const developmentBuild = about.data?.version.startsWith('main-');
  const commit = status.data?.commitTag;
  const releases = project + '/releases';
  let updateHref = releases;
  let update = '';
  let updateState:
    'disabled' | 'unavailable' | 'available' | 'current' | undefined;
  if (settings?.versionCheck === false) {
    updateState = 'disabled';
    update = t(
      'lumen.adminAbout.versionCheckDisabled',
      'Version check disabled'
    );
  } else if (status.error) {
    updateState = 'unavailable';
    update = t(
      'components.Settings.SettingsAbout.updateCheckUnavailable',
      'Could not check for updates'
    );
  } else if (status.data && status.data.commitTag !== 'local') {
    updateState = !status.data.updateCheckSucceeded
      ? 'unavailable'
      : status.data.updateAvailable
        ? 'available'
        : 'current';
    update =
      updateState === 'unavailable'
        ? t(
            'components.Settings.SettingsAbout.updateCheckUnavailable',
            'Could not check for updates'
          )
        : updateState === 'available'
          ? t('lumen.adminAbout.updateAvailable', 'Update available')
          : t('components.Settings.SettingsAbout.uptodate', 'Up to date');
  }

  if (
    developmentBuild &&
    (updateState === 'current' || updateState === 'disabled')
  )
    updateHref = project + '/commits/main';
  if (
    developmentBuild &&
    updateState === 'available' &&
    commit &&
    /^[a-f0-9]{7,40}$/i.test(commit)
  )
    updateHref = `${project}/compare/${commit}...main`;

  const rows = about.data && [
    [
      t('components.Settings.SettingsAbout.version', 'Version'),
      about.data.version,
    ],
    [
      t('components.Settings.SettingsAbout.totalmedia', 'Total Media'),
      about.data.totalMediaItems.toLocaleString(locale),
    ],
    [
      t('components.Settings.SettingsAbout.totalrequests', 'Total Requests'),
      about.data.totalRequests.toLocaleString(locale),
    ],
    [
      t('components.Settings.SettingsAbout.appDataPath', 'Data Directory'),
      about.data.appDataPath,
    ],
    [
      t('components.Settings.SettingsAbout.timezone', 'Time Zone'),
      about.data.tz || t('lumen.adminAbout.unavailable', 'Unavailable'),
    ],
  ];
  const tmdbAttribution = t(
    'components.Settings.SettingsAbout.tmdbAttributionCopy',
    'This product uses TMDB and its APIs, but TMDB does not endorse or certify SeerrNG. <ApiTermsLink>TMDB API terms</ApiTermsLink>.'
  );
  const tmdbTerms = tmdbAttribution.match(
    /^(.*)<ApiTermsLink>(.*?)<\/ApiTermsLink>(.*)$/s
  );
  const tmdbAttributionBody = tmdbTerms
    ? `${tmdbTerms[1]}${tmdbTerms[3]}`
        .replace(/\s+(\p{P})/gu, '$1')
        .replace(/(\p{P})\1+/gu, '$1')
        .trim()
    : tmdbAttribution;

  return (
    <>
      <header className="ph">
        <h1>
          {t('components.Settings.SettingsAbout.aboutseerr', 'About SeerrNG')}
        </h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me">
          {t('lumen.adminAbout.backToAccount', 'Back to Account')}
        </Link>
      </div>
      <ServiceNote
        error={about.error}
        what={t('lumen.adminAbout.serverInformation', 'server information')}
        retry={about.reload}
      />
      {!about.data && !about.error && (
        <p className="note" role="status">
          {t(
            'lumen.adminAbout.loadingServerInformation',
            'Loading server information…'
          )}
        </p>
      )}
      {rows && (
        <Section
          title={t(
            'lumen.adminAbout.serverInformationTitle',
            'Server Information'
          )}
        >
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
          {update && (
            <p className="note">
              <a className="btn btn-quiet btn-sm" href={updateHref}>
                {update}
              </a>
            </p>
          )}
          {developmentBuild && (
            <p className="note">
              {t(
                'lumen.adminAbout.developmentBuild',
                'This server is running a development build.'
              )}
            </p>
          )}
        </Section>
      )}
      <Section
        title={t('lumen.adminAbout.supportAndReleases', 'Support and Releases')}
      >
        <div className="toolbar">
          <a className="btn btn-quiet btn-sm" href={project + '/releases'}>
            {t('lumen.adminAbout.releaseNotes', 'Release Notes')}
          </a>
          <a
            className="btn btn-quiet btn-sm"
            href={project + '/tree/main/docs'}
          >
            {t(
              'components.Settings.SettingsAbout.documentation',
              'Documentation'
            )}
          </a>
          <a className="btn btn-quiet btn-sm" href={project + '/discussions'}>
            {t(
              'components.Settings.SettingsAbout.githubdiscussions',
              'GitHub Discussions'
            )}
          </a>
          <a
            className="btn btn-quiet btn-sm"
            href="https://discord.gg/5PyXBfvS6T"
          >
            {t('lumen.adminAbout.discord', 'Discord')}
          </a>
          <a
            className="btn btn-quiet btn-sm"
            href="https://ko-fi.com/snapetech"
          >
            {t(
              'components.Settings.SettingsAbout.supportdevelopment',
              'Support Development'
            )}
          </a>
        </div>
      </Section>
      {about.data && <ReleaseHistory installed={about.data.version} />}
      <Section
        title={t(
          'components.Settings.SettingsAbout.legalUseTitle',
          'Legal Use'
        )}
      >
        <p className="note">
          {t(
            'components.Settings.SettingsAbout.legalUse',
            'SeerrNG is intended for lawful personal media management. Users are responsible for complying with applicable laws, licenses, and service terms in their region.'
          )}
        </p>
      </Section>
      <Section
        title={t(
          'components.Settings.SettingsAbout.metadataAttribution',
          'Metadata Attribution'
        )}
      >
        <p className="note">{tmdbAttributionBody}</p>
        <a
          className="btn btn-quiet btn-sm"
          href="https://www.themoviedb.org/api-terms-of-use"
        >
          {tmdbTerms?.[2] ?? 'TMDB API Terms'}
        </a>
      </Section>
    </>
  );
}

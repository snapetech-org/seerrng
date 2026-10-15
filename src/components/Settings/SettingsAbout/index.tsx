import TmdbLogo from '@app/assets/tmdb_logo.svg';
import Alert from '@app/components/Common/Alert';
import Badge from '@app/components/Common/Badge';
import List from '@app/components/Common/List';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import Releases from '@app/components/Settings/SettingsAbout/Releases';
import useSettings from '@app/hooks/useSettings';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type {
  SettingsAboutResponse,
  StatusResponse,
} from '@server/interfaces/api/settingsInterfaces';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Settings.SettingsAbout', {
  about: 'About',
  aboutseerr: 'About SeerrNG',
  version: 'Version',
  totalmedia: 'Total Media',
  totalrequests: 'Total Requests',
  gettingsupport: 'Getting Support',
  githubdiscussions: 'GitHub Discussions',
  timezone: 'Time Zone',
  appDataPath: 'Data Directory',
  supportseerr: 'Support SeerrNG',
  supportdevelopment: 'Support Development',
  kofi: 'Ko-fi',
  documentation: 'Documentation',
  outofdate: 'Out of Date',
  uptodate: 'Up to Date',
  runningMain:
    'You are running the <code>main</code> branch of SeerrNG, which is only recommended for those contributing to development or assisting with bleeding-edge testing.',
  legalUse:
    'SeerrNG is intended for lawful personal media management. The project does not condone piracy or copyright infringement. Users are responsible for complying with applicable laws, licenses, and service terms in their region.',
  legalUseTitle: 'Legal Use',
  metadataAttribution: 'Metadata attribution',
  tmdbLogoLabel: 'The Movie Database (TMDB)',
  tmdbAttributionCopy:
    'This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB. <ApiTermsLink>TMDB API terms</ApiTermsLink>.',
  versionCheckDisabled: 'Version Check Disabled',
});

const SettingsAbout = () => {
  const settings = useSettings();
  const intl = useIntl();
  const { data, error } = useSWR<SettingsAboutResponse>(
    '/api/v1/settings/about'
  );

  const { data: status } = useSWR<StatusResponse>(
    settings.currentSettings.versionCheck ? '/api/v1/status' : null
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={500} />;
  }

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.about),
          intl.formatMessage(globalMessages.settings),
        ]}
      />
      <div className="app-card-sub section">
        <List title={intl.formatMessage(messages.aboutseerr)}>
          {data.version.startsWith('main-') && (
            <Alert
              title={intl.formatMessage(messages.runningMain, {
                code: (msg: React.ReactNode) => (
                  <code className="bg-gray-800/50">{msg}</code>
                ),
              })}
            />
          )}
          <List.Item
            title={intl.formatMessage(messages.version)}
            className="flex flex-row items-center truncate"
          >
            <span className="settings-plain-value truncate">
              {data.version.replace('main-', '')}
            </span>
            {settings.currentSettings.versionCheck ? (
              status && status.commitTag !== 'local' ? (
                status.updateAvailable ? (
                  <a
                    href={
                      data.version.startsWith('main-')
                        ? `https://github.com/snapetech-org/seerrng/compare/${status.commitTag}...main`
                        : 'https://github.com/snapetech-org/seerrng/releases'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Badge
                      badgeType="warning"
                      className="ml-2 !cursor-pointer transition hover:bg-yellow-400"
                    >
                      {intl.formatMessage(messages.outofdate)}
                    </Badge>
                  </a>
                ) : (
                  <a
                    href={
                      data.version.startsWith('main-')
                        ? 'https://github.com/snapetech-org/seerrng/commits/main'
                        : 'https://github.com/snapetech-org/seerrng/releases'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Badge
                      badgeType="success"
                      className="ml-2 !cursor-pointer transition hover:bg-green-400"
                    >
                      {intl.formatMessage(messages.uptodate)}
                    </Badge>
                  </a>
                )
              ) : null
            ) : (
              <a
                href={
                  data.version.startsWith('main-')
                    ? 'https://github.com/snapetech-org/seerrng/commits/main'
                    : 'https://github.com/snapetech-org/seerrng/releases'
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                <Badge
                  badgeType="primary"
                  className="ml-2 !cursor-pointer transition hover:bg-yellow-400"
                >
                  {intl.formatMessage(messages.versionCheckDisabled)}
                </Badge>
              </a>
            )}
          </List.Item>
          <List.Item title={intl.formatMessage(messages.totalmedia)}>
            {intl.formatNumber(data.totalMediaItems)}
          </List.Item>
          <List.Item title={intl.formatMessage(messages.totalrequests)}>
            {intl.formatNumber(data.totalRequests)}
          </List.Item>
          <List.Item title={intl.formatMessage(messages.legalUseTitle)}>
            <span className="text-xs leading-4 text-gray-400">
              {intl.formatMessage(messages.legalUse)}
            </span>
          </List.Item>
          <List.Item title={intl.formatMessage(messages.metadataAttribution)}>
            <div className="media-tmdb-attribution">
              <a
                href="https://www.themoviedb.org/"
                target="_blank"
                rel="noreferrer"
                aria-label={intl.formatMessage(messages.tmdbLogoLabel)}
              >
                <TmdbLogo
                  className="media-tmdb-attribution-logo"
                  aria-hidden="true"
                />
              </a>
              <p className="media-tmdb-attribution-copy">
                {intl.formatMessage(messages.tmdbAttributionCopy, {
                  ApiTermsLink: (msg: React.ReactNode) => (
                    <a
                      className="media-metadata-attribution-link"
                      href="https://www.themoviedb.org/api-terms-of-use"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {msg}
                    </a>
                  ),
                })}
              </p>
            </div>
          </List.Item>
          <List.Item title={intl.formatMessage(messages.appDataPath)}>
            <span className="settings-plain-value">{data.appDataPath}</span>
          </List.Item>
          <List.Item title={intl.formatMessage(messages.timezone)}>
            <span className="settings-plain-value">
              {data.tz || intl.formatMessage(globalMessages.notavailable)}
            </span>
          </List.Item>
        </List>
      </div>
      <div className="app-card-sub section">
        <List title={intl.formatMessage(messages.gettingsupport)}>
          <List.Item title={intl.formatMessage(messages.documentation)}>
            <a
              href="https://github.com/snapetech-org/seerrng/tree/main/docs"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-500 transition duration-300 hover:underline"
            >
              https://github.com/snapetech-org/seerrng/tree/main/docs
            </a>
          </List.Item>
          <List.Item title={intl.formatMessage(messages.githubdiscussions)}>
            <a
              href="https://github.com/snapetech-org/seerrng/discussions"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-500 transition duration-300 hover:underline"
            >
              https://github.com/snapetech-org/seerrng/discussions
            </a>
          </List.Item>
          <List.Item title="Discord">
            <a
              href="https://discord.gg/5PyXBfvS6T"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-500 transition duration-300 hover:underline"
            >
              https://discord.gg/5PyXBfvS6T
            </a>
          </List.Item>
        </List>
      </div>
      <div className="app-card-sub section">
        <List title={intl.formatMessage(messages.supportseerr)}>
          <List.Item title={intl.formatMessage(messages.supportdevelopment)}>
            <div className="flex flex-wrap gap-[5px]">
              <a
                href="https://ko-fi.com/snapetech"
                target="_blank"
                rel="noreferrer"
                className="compact-control inline-flex items-center rounded-full border border-rose-400/40 bg-rose-500/10 px-2 text-xs leading-4 font-semibold text-rose-700 transition hover:border-rose-500 hover:bg-rose-500/20 focus:ring-2 focus:ring-rose-400 focus:outline-none dark:text-rose-300"
              >
                {intl.formatMessage(messages.kofi)}
              </a>
            </div>
          </List.Item>
        </List>
      </div>
      <div className="app-card-sub section">
        <Releases currentVersion={data.version} />
      </div>
    </>
  );
};

export default SettingsAbout;

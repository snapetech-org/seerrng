import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { forget } from '../apiCache';
import { useApi, type PublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';
import { invalidatePublicSettings } from '../mediaServer';
import { sessionGeneration } from '../sessionState';
import { Section } from './cards';
import { ServiceNote } from './extra';

const publicPath = '/settings/public';

type PolicyKey =
  | 'personMovieBulkRequestsEnabled'
  | 'enable4k'
  | 'partialRequestsEnabled'
  | 'enableSpecialEpisodes'
  | 'trackEpisodeAvailability'
  | 'tvSeasonWatchGateEnabled';
type Policy = {
  key: PolicyKey;
  label: string;
  description: string;
  messageKey?: string;
  descriptionKey?: string;
};

const policies: Policy[] = [
  {
    key: 'personMovieBulkRequestsEnabled',
    label: 'Bulk Movie Requests From Person Pages',
    description:
      'Allow users with movie request permission to request eligible movies credited to a person.',
  },
  {
    key: 'enable4k',
    label: 'Enable 4K',
    description:
      'Allow 4K requests, issue reports, and separate availability tracking. Requests still need a configured 4K destination.',
  },
  {
    key: 'partialRequestsEnabled',
    label: 'Allow Partial Series Requests',
    messageKey: 'lumen.adminGeneral.requestSettings.partialRequestsEnabled',
    description: 'Let users request individual seasons of a series.',
    descriptionKey:
      'lumen.adminGeneral.requestSettings.partialRequestsEnabledHelp',
  },
  {
    key: 'enableSpecialEpisodes',
    label: 'Allow Special Episode Requests',
    messageKey: 'lumen.adminGeneral.requestSettings.enableSpecialEpisodes',
    description: 'Include specials when users select seasons to request.',
    descriptionKey:
      'lumen.adminGeneral.requestSettings.enableSpecialEpisodesHelp',
  },
  {
    key: 'trackEpisodeAvailability',
    label: 'Track Individual Episode Availability',
    messageKey: 'lumen.adminGeneral.requestSettings.trackEpisodeAvailability',
    description:
      'Record episode files during Sonarr, Plex, Jellyfin, and Emby scans. Sonarr tracking requires TheTVDB. Match library episode numbering to the selected metadata provider.',
    descriptionKey:
      'lumen.adminGeneral.requestSettings.trackEpisodeAvailabilityHelp',
  },
  {
    key: 'tvSeasonWatchGateEnabled',
    label: 'Require the Previous Season to Be Watched',
    description:
      'Require the previous regular season to be watched before requesting later seasons. SeerrNG checks the requester’s linked media server.',
  },
];
type Policies = Record<PolicyKey, boolean>;

function RequestSettingsForm({
  initial,
  anchorReady,
}: {
  initial: Policies;
  anchorReady: boolean;
}) {
  const { t } = useLumenLocale();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const changed = policies.filter(({ key }) => draft[key] !== saved[key]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);

  useEffect(() => {
    if (anchorReady && window.location.hash === '#enable4k')
      document.getElementById('enable4k')?.scrollIntoView({ block: 'start' });
  }, [anchorReady]);

  async function save() {
    if (pending.current || !changed.length) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const body = Object.fromEntries(
        changed.map(({ key }) => [key, draft[key]])
      );
      const result = await api<Partial<Policies>>('/settings/main', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (generation !== sessionGeneration()) return;
      invalidatePublicSettings();
      forget(publicPath);
      if (changed.some(({ key }) => result[key] !== draft[key])) {
        setFailure(
          t(
            'lumen.adminGeneral.requestSettings.confirmFailure',
            'Could not confirm the saved request setting. Try again.'
          )
        );
        return;
      }
      setSaved(draft);
      setNotice(
        t(
          'lumen.adminGeneral.requestSettings.saved',
          'Instance request settings saved.'
        )
      );
    } catch (error) {
      if (generation === sessionGeneration())
        setFailure(
          error instanceof ApiError && error.status === 403
            ? t(
                'lumen.error.noPermission',
                'You do not have permission to do that.'
              )
            : t(
                'lumen.adminGeneral.requestSettings.saveFailure',
                'Could not save the instance request setting. Try again.'
              )
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="setlist">
        {policies.map(
          ({ key, label, description, messageKey, descriptionKey }) => (
            <label
              className="set cfg-row"
              key={key}
              id={key === 'enable4k' ? key : undefined}
            >
              <span>
                <b>
                  {t(
                    messageKey ?? `components.Settings.SettingsMain.${key}`,
                    label
                  )}
                </b>
                <small>
                  {t(
                    descriptionKey ??
                      `components.Settings.SettingsMain.${key}Tip`,
                    description
                  )}
                </small>
              </span>
              <input
                type="checkbox"
                aria-label={t(
                  messageKey ?? `components.Settings.SettingsMain.${key}`,
                  label
                )}
                checked={draft[key]}
                disabled={busy}
                onChange={(event) => {
                  setDraft({ ...draft, [key]: event.target.checked });
                  setNotice('');
                  setFailure('');
                }}
              />
            </label>
          )
        )}
      </div>
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      <div className="toolbar">
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || !changed.length}
        >
          {t(
            'lumen.adminGeneral.requestSettings.saveButton',
            'Save Instance Request Settings'
          )}
        </button>
      </div>
    </form>
  );
}

export function InstanceRequestSettings({
  anchorReady = true,
}: {
  anchorReady?: boolean;
}) {
  const { t } = useLumenLocale();
  const settings = useApi<PublicSettings>(publicPath);
  return (
    <Section
      title={t(
        'lumen.adminGeneral.requestSettings.title',
        'Instance Request Settings'
      )}
    >
      <ServiceNote
        error={settings.error}
        what="instance request settings"
        retry={settings.reload}
      />
      {settings.data ? (
        <RequestSettingsForm
          anchorReady={anchorReady}
          initial={{
            personMovieBulkRequestsEnabled:
              settings.data.personMovieBulkRequestsEnabled === true,
            enable4k: settings.data.enable4k !== false,
            partialRequestsEnabled:
              settings.data.partialRequestsEnabled !== false,
            enableSpecialEpisodes: settings.data.enableSpecialEpisodes === true,
            trackEpisodeAvailability:
              settings.data.trackEpisodeAvailability === true,
            tvSeasonWatchGateEnabled:
              settings.data.tvSeasonWatchGateEnabled === true,
          }}
        />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            {t(
              'lumen.adminGeneral.requestSettings.loading',
              'Loading instance request settings…'
            )}
          </p>
        )
      )}
    </Section>
  );
}

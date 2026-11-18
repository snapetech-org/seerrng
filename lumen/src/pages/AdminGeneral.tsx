import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { forget } from '../apiCache';
import ApplicationApiKey from '../components/ApplicationApiKey';
import { Section } from '../components/cards';
import DefaultRequestQuotas, {
  type DefaultQuotas,
} from '../components/DefaultRequestQuotas';
import DefaultUserPermissions from '../components/DefaultUserPermissions';
import DownloadPathMappings, {
  type DownloadPathMapping,
} from '../components/DownloadPathMappings';
import { ServiceNote } from '../components/extra';
import { InstanceRequestSettings } from '../components/InstanceRequestSettings';
import SpotifyCredentials from '../components/SpotifyCredentials';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { invalidatePublicSettings } from '../mediaServer';
import { sessionGeneration } from '../sessionState';

const path = '/settings/main';
type Frontend = 'native' | 'lumen' | 'external';
type AvailabilityMode = 'show' | 'distinguish' | 'hide';

interface ApplicationSettings {
  applicationTitle: string;
  applicationUrl: string;
  youtubeUrl: string;
  cacheImages: boolean;
  versionCheck: boolean;
  defaultFrontend: Frontend;
  enforceDefaultFrontend: boolean;
  lockLumenForNonAdmins: boolean;
  lumenPublicUrl: string;
  localLogin: boolean;
  mediaServerLogin: boolean;
  newPlexLogin: boolean;
  jellyfinQuickConnectOnly: boolean;
  otherUsersAvailability: AvailabilityMode;
}

const textFields = [
  { key: 'applicationTitle', label: 'Application Title' },
  { key: 'applicationUrl', label: 'Application URL' },
  { key: 'youtubeUrl', label: 'YouTube Trailer URL' },
] as const;
const switches = [
  {
    key: 'cacheImages',
    label: 'Cache Images',
    help: 'Proxy and cache supported images on the SeerrNG server.',
  },
  {
    key: 'versionCheck',
    label: 'Version Check',
    help: 'Automatically check GitHub for new versions.',
  },
  {
    key: 'enforceDefaultFrontend',
    label: 'Enforce Default Interface',
    help: 'Use the instance default even when a browser remembers a different choice.',
  },
  {
    key: 'lockLumenForNonAdmins',
    label: 'Keep Non-Administrators in Lumen',
    help: 'Redirect signed-in non-administrators from native pages to bundled Lumen.',
  },
  {
    key: 'localLogin',
    label: 'Local Sign-In',
    help: 'Allow users to sign in with their SeerrNG email and password.',
  },
  {
    key: 'mediaServerLogin',
    label: 'Media Server Sign-In',
    help: 'Allow users to sign in with their linked media server account.',
  },
  {
    key: 'newPlexLogin',
    label: 'Allow New Media Server Users',
    help: 'Let eligible media server users sign in without importing their accounts first.',
  },
  {
    key: 'jellyfinQuickConnectOnly',
    label: 'Require Jellyfin Quick Connect',
    help: 'Use Quick Connect for Jellyfin sign-in and disable Jellyfin password and plugin sign-in.',
  },
] as const;

function ApplicationForm({
  initial,
  jellyfin,
}: {
  initial: ApplicationSettings;
  jellyfin: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const values = {
    ...draft,
    applicationTitle: draft.applicationTitle.trim(),
    applicationUrl: draft.applicationUrl.trim(),
    youtubeUrl: draft.youtubeUrl.trim(),
    lumenPublicUrl:
      draft.defaultFrontend === 'external'
        ? draft.lumenPublicUrl.trim()
        : saved.lumenPublicUrl,
    lockLumenForNonAdmins:
      draft.defaultFrontend === 'lumen' && draft.lockLumenForNonAdmins,
  };
  const changed = (Object.keys(values) as (keyof ApplicationSettings)[]).filter(
    (key) => values[key] !== saved[key]
  );
  const loginChanged =
    changed.includes('localLogin') || changed.includes('mediaServerLogin');
  const loginValid =
    !loginChanged || values.localLogin || values.mediaServerLogin;
  const valid =
    Boolean(values.applicationTitle) &&
    (values.defaultFrontend !== 'external' || Boolean(values.lumenPublicUrl)) &&
    loginValid;

  function change<Key extends keyof ApplicationSettings>(
    key: Key,
    value: ApplicationSettings[Key]
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice('');
    setFailure('');
  }

  async function save() {
    if (pending.current || !changed.length || !valid) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<ApplicationSettings>(path, {
        method: 'POST',
        body: JSON.stringify(
          Object.fromEntries(changed.map((key) => [key, values[key]]))
        ),
      });
      if (generation !== sessionGeneration()) return;
      invalidatePublicSettings();
      forget('/settings/public');
      if (changed.some((key) => result[key] !== values[key])) {
        setFailure('Could not confirm the saved application settings.');
        return;
      }
      setDraft(values);
      setSaved(values);
      setNotice('Application settings saved.');
    } catch (error) {
      if (generation === sessionGeneration())
        setFailure(
          friendlyError(error, 'Could not save application settings.')
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
        {textFields.map(({ key, label }) => (
          <label className="set cfg-row" key={key}>
            <span>
              <b>{label}</b>
              {key === 'applicationUrl' && (
                <small>Public address used in links sent by SeerrNG.</small>
              )}
              {key === 'youtubeUrl' && (
                <small>
                  Optional URL prefix for a self-hosted YouTube player. SeerrNG
                  appends the video ID.
                </small>
              )}
            </span>
            <input
              className="cfg-input"
              type={key === 'applicationTitle' ? 'text' : 'url'}
              required={key === 'applicationTitle'}
              aria-label={label}
              maxLength={512}
              disabled={busy}
              value={draft[key]}
              onChange={(event) => change(key, event.target.value)}
            />
          </label>
        ))}
        <label className="set cfg-row">
          <b>Default Interface</b>
          <select
            className="cfg-input"
            aria-label="Default Interface"
            disabled={busy}
            value={draft.defaultFrontend}
            onChange={(event) =>
              change('defaultFrontend', event.target.value as Frontend)
            }
          >
            <option value="native">Full SeerrNG</option>
            <option value="lumen">Bundled Lumen</option>
            <option value="external">Standalone Lumen</option>
          </select>
        </label>
        {draft.defaultFrontend === 'external' && (
          <label className="set cfg-row">
            <b>Lumen Companion URL</b>
            <input
              className="cfg-input"
              type="url"
              aria-label="Lumen Companion URL"
              required
              maxLength={512}
              disabled={busy}
              value={draft.lumenPublicUrl}
              onChange={(event) => change('lumenPublicUrl', event.target.value)}
            />
          </label>
        )}
        <label className="set cfg-row">
          <span>
            <b>Other Users’ Availability</b>
            <small>
              Choose how availability appears when the viewer has no approved or
              completed request for that copy.
            </small>
          </span>
          <select
            className="cfg-input"
            aria-label="Other Users’ Availability"
            disabled={busy}
            value={draft.otherUsersAvailability}
            onChange={(event) =>
              change(
                'otherUsersAvailability',
                event.target.value as AvailabilityMode
              )
            }
          >
            <option value="show">Show Availability for Everyone</option>
            <option value="distinguish">Mark Shared Availability</option>
            <option value="hide">Hide Shared Availability</option>
          </select>
        </label>
        {switches
          .filter(({ key }) => {
            if (key === 'lockLumenForNonAdmins')
              return draft.defaultFrontend === 'lumen';
            if (key === 'jellyfinQuickConnectOnly')
              return jellyfin && draft.mediaServerLogin;
            if (key === 'newPlexLogin') return draft.mediaServerLogin;
            return true;
          })
          .map(({ key, label, help }) => (
            <label className="set cfg-row" key={key}>
              <span>
                <b>{label}</b>
                <small>{help}</small>
              </span>
              <input
                type="checkbox"
                aria-label={label}
                disabled={busy}
                checked={draft[key]}
                onChange={(event) => change(key, event.target.checked)}
              />
            </label>
          ))}
      </div>
      {!loginValid && (
        <p className="note" role="alert">
          Keep at least one sign-in method enabled.
        </p>
      )}
      {loginChanged && !draft.mediaServerLogin && draft.localLogin && (
        <p className="note">
          Users who rely on media server sign-in need a SeerrNG password to sign
          in.
        </p>
      )}
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
          disabled={busy || !changed.length || !valid}
        >
          Save Application Settings
        </button>
      </div>
    </form>
  );
}

export default function AdminGeneral() {
  const settings = useApi<
    ApplicationSettings & {
      mediaServerType?: number;
      defaultQuotas?: DefaultQuotas;
      defaultPermissions?: number;
      apiKey?: string;
      downloadPathMappings?: DownloadPathMapping[];
      spotifyClientId?: string;
      spotifyClientSecret?: string;
    }
  >(path);
  return (
    <>
      <header className="ph">
        <h1>General Settings</h1>
        <div className="toolbar">
          <Link className="btn btn-quiet btn-sm" to="/me">
            Back to Account
          </Link>
          <Link className="btn btn-quiet btn-sm" to="/admin/categories">
            Media Categories
          </Link>
        </div>
      </header>
      <Section title="Application">
        <ServiceNote
          error={settings.error}
          what="application settings"
          retry={settings.reload}
        />
        {settings.data ? (
          <ApplicationForm
            jellyfin={settings.data.mediaServerType === 2}
            initial={{
              applicationTitle: settings.data.applicationTitle ?? '',
              applicationUrl: settings.data.applicationUrl ?? '',
              youtubeUrl: settings.data.youtubeUrl ?? '',
              cacheImages: settings.data.cacheImages === true,
              versionCheck: settings.data.versionCheck === true,
              defaultFrontend: settings.data.defaultFrontend ?? 'native',
              enforceDefaultFrontend:
                settings.data.enforceDefaultFrontend === true,
              lockLumenForNonAdmins:
                settings.data.lockLumenForNonAdmins === true,
              lumenPublicUrl: settings.data.lumenPublicUrl ?? '',
              localLogin: settings.data.localLogin !== false,
              mediaServerLogin: settings.data.mediaServerLogin !== false,
              newPlexLogin: settings.data.newPlexLogin !== false,
              jellyfinQuickConnectOnly:
                settings.data.jellyfinQuickConnectOnly === true,
              otherUsersAvailability:
                settings.data.otherUsersAvailability ?? 'show',
            }}
          />
        ) : (
          !settings.error && (
            <p className="note" role="status">
              Loading application settings…
            </p>
          )
        )}
      </Section>
      {settings.data?.apiKey && (
        <ApplicationApiKey initial={settings.data.apiKey} />
      )}
      {settings.data && <SpotifyCredentials initial={settings.data} />}
      {settings.data && (
        <DownloadPathMappings
          initial={settings.data.downloadPathMappings ?? []}
        />
      )}
      <InstanceRequestSettings
        anchorReady={Boolean(settings.data || settings.error)}
      />
      {settings.data?.defaultQuotas && (
        <DefaultRequestQuotas
          initial={settings.data.defaultQuotas}
          showPermissionsLink={
            typeof settings.data.defaultPermissions === 'number'
          }
        />
      )}
      {typeof settings.data?.defaultPermissions === 'number' &&
        Number.isSafeInteger(settings.data.defaultPermissions) &&
        settings.data.defaultPermissions >= 0 && (
          <DefaultUserPermissions initial={settings.data.defaultPermissions} />
        )}
    </>
  );
}

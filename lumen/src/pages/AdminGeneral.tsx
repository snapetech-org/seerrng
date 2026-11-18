import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { forget } from '../apiCache';
import { Section } from '../components/cards';
import DefaultRequestQuotas, {
  type DefaultQuotas,
} from '../components/DefaultRequestQuotas';
import DefaultUserPermissions from '../components/DefaultUserPermissions';
import { ServiceNote } from '../components/extra';
import { InstanceRequestSettings } from '../components/InstanceRequestSettings';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { invalidatePublicSettings } from '../mediaServer';
import { sessionGeneration } from '../sessionState';

const path = '/settings/main';
type Frontend = 'native' | 'lumen' | 'external';

interface ApplicationSettings {
  applicationTitle: string;
  applicationUrl: string;
  cacheImages: boolean;
  versionCheck: boolean;
  defaultFrontend: Frontend;
  enforceDefaultFrontend: boolean;
  lockLumenForNonAdmins: boolean;
  lumenPublicUrl: string;
  localLogin: boolean;
  mediaServerLogin: boolean;
  jellyfinQuickConnectOnly: boolean;
}

const textFields = [
  { key: 'applicationTitle', label: 'Application Title' },
  { key: 'applicationUrl', label: 'Application URL' },
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
            </span>
            <input
              className="cfg-input"
              type={key === 'applicationUrl' ? 'url' : 'text'}
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
        {switches
          .filter(({ key }) => {
            if (key === 'lockLumenForNonAdmins')
              return draft.defaultFrontend === 'lumen';
            if (key === 'jellyfinQuickConnectOnly')
              return jellyfin && draft.mediaServerLogin;
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
              jellyfinQuickConnectOnly:
                settings.data.jellyfinQuickConnectOnly === true,
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
      <InstanceRequestSettings />
      {settings.data?.defaultQuotas && (
        <DefaultRequestQuotas initial={settings.data.defaultQuotas} />
      )}
      {typeof settings.data?.defaultPermissions === 'number' &&
        Number.isSafeInteger(settings.data.defaultPermissions) &&
        settings.data.defaultPermissions >= 0 && (
          <DefaultUserPermissions initial={settings.data.defaultPermissions} />
        )}
    </>
  );
}

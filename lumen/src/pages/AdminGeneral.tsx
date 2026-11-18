import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { forget } from '../apiCache';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { InstanceRequestSettings } from '../components/InstanceRequestSettings';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { invalidatePublicSettings } from '../mediaServer';
import { sessionGeneration } from '../sessionState';

const path = '/settings/main';

interface ApplicationSettings {
  applicationTitle: string;
  applicationUrl: string;
  cacheImages: boolean;
  versionCheck: boolean;
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
] as const;

function ApplicationForm({ initial }: { initial: ApplicationSettings }) {
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
  };
  const changed = [...textFields, ...switches].filter(
    ({ key }) => values[key] !== saved[key]
  );

  function change<Key extends keyof ApplicationSettings>(
    key: Key,
    value: ApplicationSettings[Key]
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice('');
    setFailure('');
  }

  async function save() {
    if (pending.current || !changed.length || !values.applicationTitle) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<ApplicationSettings>(path, {
        method: 'POST',
        body: JSON.stringify(
          Object.fromEntries(changed.map(({ key }) => [key, values[key]]))
        ),
      });
      if (generation !== sessionGeneration()) return;
      invalidatePublicSettings();
      forget('/settings/public');
      if (changed.some(({ key }) => result[key] !== values[key])) {
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
        {switches.map(({ key, label, help }) => (
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
          disabled={busy || !changed.length || !values.applicationTitle}
        >
          Save Application Settings
        </button>
      </div>
    </form>
  );
}

export default function AdminGeneral() {
  const settings = useApi<ApplicationSettings>(path);
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
            initial={{
              applicationTitle: settings.data.applicationTitle ?? '',
              applicationUrl: settings.data.applicationUrl ?? '',
              cacheImages: settings.data.cacheImages === true,
              versionCheck: settings.data.versionCheck === true,
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
    </>
  );
}

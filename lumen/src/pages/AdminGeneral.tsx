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

interface Identity {
  applicationTitle: string;
  applicationUrl: string;
}

const fields = [
  { key: 'applicationTitle', label: 'Application Title' },
  { key: 'applicationUrl', label: 'Application URL' },
] as const;

function IdentityForm({ initial }: { initial: Identity }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const values = {
    applicationTitle: draft.applicationTitle.trim(),
    applicationUrl: draft.applicationUrl.trim(),
  };
  const changed = fields.filter(({ key }) => values[key] !== saved[key]);

  async function save() {
    if (pending.current || !changed.length || !values.applicationTitle) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<Identity>(path, {
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
        {fields.map(({ key, label }) => (
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
              onChange={(event) => {
                setDraft({ ...draft, [key]: event.target.value });
                setNotice('');
                setFailure('');
              }}
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
  const settings = useApi<Identity>(path);
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
          <IdentityForm
            initial={{
              applicationTitle: settings.data.applicationTitle ?? '',
              applicationUrl: settings.data.applicationUrl ?? '',
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

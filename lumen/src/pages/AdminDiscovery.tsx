import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';

const path = '/integrations/discovery/configuration';
const providers = [
  { id: 'trakt', name: 'Trakt', fields: ['clientId'] },
  { id: 'anilist', name: 'AniList', fields: ['clientId', 'clientSecret'] },
  { id: 'simkl', name: 'Simkl', fields: ['clientId'] },
  { id: 'mdblist', name: 'MDBList', fields: ['apiKey'] },
] as const;
const labels = {
  clientId: 'Client ID',
  clientSecret: 'Client Secret',
  apiKey: 'API Key',
};
type Configuration = Record<
  (typeof providers)[number]['id'],
  { clientId?: string; configured: boolean }
>;
type Changes = Record<string, Record<string, string>>;

function DiscoveryForm({ initial }: { initial: Configuration }) {
  const [current, setCurrent] = useState(initial);
  const [changes, setChanges] = useState<Changes>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const dirty = Object.keys(changes).length > 0;

  function stage(provider: string, fields: Record<string, string>) {
    setChanges((previous) => ({
      ...previous,
      [provider]: { ...previous[provider], ...fields },
    }));
    setSaved(false);
    setFailure('');
  }

  async function save() {
    if (!dirty || pending.current) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setFailure('');
    try {
      const updated = await api<Configuration>(path, {
        method: 'PUT',
        body: JSON.stringify(changes),
      });
      if (generation !== sessionGeneration()) return;
      setCurrent(updated);
      setChanges({});
      setSaved(true);
    } catch (error) {
      if (generation !== sessionGeneration()) return;
      setFailure(
        error instanceof ApiError && error.status === 403
          ? 'You do not have permission to change integration credentials.'
          : 'Could not save discovery credentials. Try again.'
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
      {providers.map(({ id, name, fields }) => (
        <Section key={id} title={name}>
          <p className="note">
            {current[id].configured ? 'Configured' : 'Unconfigured'}
          </p>
          <div className="setlist">
            {fields.map((field) => {
              const secret = field !== 'clientId';
              const fieldId = `discovery-${id}-${field}`;
              return (
                <label key={field} className="set cfg-row" htmlFor={fieldId}>
                  <span>{labels[field]}</span>
                  <input
                    id={fieldId}
                    className="cfg-input"
                    type={secret ? 'password' : 'text'}
                    autoComplete={secret ? 'new-password' : 'off'}
                    maxLength={4096}
                    disabled={busy}
                    value={
                      changes[id]?.[field] ??
                      (secret ? '' : (current[id].clientId ?? ''))
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!secret || value) stage(id, { [field]: value });
                      else {
                        setChanges((previous) => {
                          const next = { ...previous };
                          const fields = { ...next[id] };
                          delete fields[field];
                          if (Object.keys(fields).length) next[id] = fields;
                          else delete next[id];
                          return next;
                        });
                        setFailure('');
                      }
                    }}
                  />
                </label>
              );
            })}
          </div>
          <div className="toolbar">
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() =>
                stage(
                  id,
                  Object.fromEntries(fields.map((field) => [field, '']))
                )
              }
            >
              Clear {name} Credentials
            </button>
          </div>
        </Section>
      ))}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {saved && (
        <p className="note" role="status">
          Discovery credentials saved.
        </p>
      )}
      <div className="toolbar">
        <button className="btn btn-primary btn-sm" disabled={busy || !dirty}>
          {busy ? 'Saving…' : 'Save Discovery Credentials'}
        </button>
      </div>
    </form>
  );
}

export default function AdminDiscovery() {
  const settings = useApi<Configuration>(path);
  return (
    <>
      <header className="ph">
        <h1>Discovery Integrations</h1>
        <div className="toolbar">
          <Link className="btn btn-quiet btn-sm" to="/me">
            Back to Account
          </Link>
        </div>
      </header>
      <ServiceNote
        error={settings.error}
        what="discovery credentials"
        retry={settings.reload}
      />
      {settings.data ? (
        <>
          <p className="note">
            Enter new credentials or use Clear to remove a provider’s saved
            credentials. Select Save to apply changes.
          </p>
          <DiscoveryForm initial={settings.data} />
        </>
      ) : (
        !settings.error && (
          <p className="note" role="status">
            Loading discovery credentials…
          </p>
        )
      )}
    </>
  );
}

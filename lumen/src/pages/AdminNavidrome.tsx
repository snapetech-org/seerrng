import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { sessionGeneration } from '../sessionState';

const endpoint = '/settings/navidrome';
interface Settings {
  url: string;
  username: string;
  password: string;
  syncEnabled: boolean;
}
const empty: Settings = {
  url: '',
  username: '',
  password: '',
  syncEnabled: true,
};

function Connection({ initial }: { initial: Settings | null }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState({ ...(initial ?? empty), password: '' });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const password = draft.password || (saved?.password ? '[REDACTED]' : '');
  const ready = !!(draft.url.trim() && draft.username.trim() && password);
  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify({ ...(saved ?? empty), password: '' });

  function update(patch: Partial<Settings>) {
    setDraft((value) => ({ ...value, ...patch }));
    setError('');
    setNotice('');
  }

  async function submit(action: 'test' | 'save' | 'disconnect') {
    if (pending.current || (action === 'disconnect' ? !confirm : !ready))
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const generation = sessionGeneration();
    const body = JSON.stringify({
      ...draft,
      url: draft.url.trim(),
      username: draft.username.trim(),
      password,
    });
    try {
      if (action === 'test') {
        await api(endpoint + '/test', { method: 'POST', body }, 'empty');
      } else {
        let next: Settings | null = null;
        if (action === 'save')
          next = await api<Settings>(endpoint, { method: 'PUT', body });
        else await api(endpoint, { method: 'DELETE' }, 'empty');
        if (generation !== sessionGeneration()) return;
        setSaved(next);
        setDraft({ ...(next ?? empty), password: '' });
        setConfirm(false);
      }
      if (generation === sessionGeneration()) {
        setNotice(
          action === 'test'
            ? 'Navidrome connection verified.'
            : action === 'save'
              ? 'Navidrome settings saved.'
              : 'Navidrome disconnected.'
        );
      }
    } catch (failure) {
      if (generation === sessionGeneration())
        setError(
          failure instanceof ApiError
            ? failure.message
            : 'Could not complete the Navidrome action.'
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title="Navidrome Connection">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (dirty) void submit('save');
        }}
      >
        <div className="setlist">
          <label className="set cfg-row">
            <span>Server URL</span>
            <input
              className="cfg-input"
              type="url"
              maxLength={512}
              disabled={busy}
              value={draft.url}
              onChange={(event) => update({ url: event.target.value })}
            />
          </label>
          <label className="set cfg-row">
            <span>Username</span>
            <input
              className="cfg-input"
              maxLength={256}
              disabled={busy}
              value={draft.username}
              onChange={(event) => update({ username: event.target.value })}
            />
          </label>
          <label className="set cfg-row">
            <span>Password</span>
            <input
              className="cfg-input"
              type="password"
              autoComplete="new-password"
              maxLength={512}
              disabled={busy}
              value={draft.password}
              placeholder={saved?.password ? 'Saved password' : undefined}
              onChange={(event) => update({ password: event.target.value })}
            />
          </label>
          <label className="set cfg-row">
            <span>Enable Library Scan</span>
            <input
              type="checkbox"
              disabled={busy}
              checked={draft.syncEnabled}
              onChange={(event) =>
                update({ syncEnabled: event.target.checked })
              }
            />
          </label>
        </div>
        {notice && (
          <p className="note" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="note" role="alert">
            {error}
          </p>
        )}
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy || !ready}
            onClick={() => void submit('test')}
          >
            Test Connection
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={busy || !ready || !dirty}
          >
            Save Changes
          </button>
          {saved && !confirm && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => setConfirm(true)}
            >
              Disconnect
            </button>
          )}
        </div>
        {confirm && (
          <>
            <p className="note">
              Disconnect Navidrome and stop future library scans?
            </p>
            <div className="toolbar">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => void submit('disconnect')}
              >
                Confirm Disconnect
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Keep Connection
              </button>
            </div>
          </>
        )}
      </form>
    </Section>
  );
}

export default function AdminNavidrome() {
  const [settings, setSettings] = useState<Settings | null>();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const generation = sessionGeneration();
    const current = () =>
      !controller.signal.aborted && generation === sessionGeneration();
    api<Settings | null>(endpoint, { signal: controller.signal })
      .then((value) => {
        if (current()) setSettings(value);
      })
      .catch(() => {
        if (current()) setError('Could not load the Navidrome connection.');
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <>
      <h1>Navidrome Settings</h1>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me">
          Back to Account
        </Link>
      </div>
      <ServiceNote
        what="Navidrome settings"
        error={error}
        retry={() => {
          setError(null);
          setAttempt((value) => value + 1);
        }}
      />
      {settings !== undefined ? (
        <Connection initial={settings} />
      ) : (
        !error && (
          <p className="note" role="status">
            Loading Navidrome settings…
          </p>
        )
      )}
    </>
  );
}

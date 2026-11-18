import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { sessionGeneration } from '../sessionState';

type Provider = 'navidrome' | 'jellystat';
const names = { navidrome: 'Navidrome', jellystat: 'Jellystat' };
interface Settings {
  url: string;
  username?: string;
  password?: string;
  apiKey?: string;
  syncEnabled?: boolean;
}
const empty: Settings = {
  url: '',
  username: '',
  password: '',
  syncEnabled: true,
};

function Connection({
  provider,
  initial,
}: {
  provider: Provider;
  initial: Settings | null;
}) {
  const name = names[provider];
  const endpoint = `/settings/${provider}`;
  const navidrome = provider === 'navidrome';
  const secretField = navidrome ? 'password' : 'apiKey';
  const secretLabel = navidrome ? 'Password' : 'API Key';
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState({
    ...(initial ?? empty),
    [secretField]: '',
  });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const secret =
    draft[secretField] || (saved?.[secretField] ? '[REDACTED]' : '');
  const ready = !!(
    draft.url.trim() &&
    (!navidrome || draft.username?.trim()) &&
    secret
  );
  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify({ ...(saved ?? empty), [secretField]: '' });

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
      url: draft.url.trim(),
      [secretField]: secret,
      ...(navidrome
        ? { username: draft.username?.trim(), syncEnabled: draft.syncEnabled }
        : {}),
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
        setDraft({ ...(next ?? empty), [secretField]: '' });
        setConfirm(false);
      }
      if (generation === sessionGeneration()) {
        setNotice(
          action === 'test'
            ? `${name} connection verified.`
            : action === 'save'
              ? `${name} settings saved.`
              : `${name} disconnected.`
        );
      }
    } catch (failure) {
      if (generation === sessionGeneration())
        setError(
          failure instanceof ApiError
            ? failure.message
            : `Could not complete the ${name} action.`
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title={`${name} Connection`}>
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
          {navidrome && (
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
          )}
          <label className="set cfg-row">
            <span>{secretLabel}</span>
            <input
              className="cfg-input"
              type="password"
              autoComplete="new-password"
              maxLength={512}
              disabled={busy}
              value={draft[secretField] ?? ''}
              placeholder={
                saved?.[secretField]
                  ? `Saved ${secretLabel.toLowerCase()}`
                  : undefined
              }
              onChange={(event) =>
                update({ [secretField]: event.target.value })
              }
            />
          </label>
          {navidrome && (
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
          )}
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
              Disconnect {name}
              {navidrome && ' and stop future library scans'}?
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

export default function AdminUrlConnection({
  provider,
}: {
  provider: Provider;
}) {
  const name = names[provider];
  const endpoint = `/settings/${provider}`;
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
        if (current()) setError(`Could not load the ${name} connection.`);
      });
    return () => controller.abort();
  }, [attempt, endpoint, name]);
  return (
    <>
      <h1>{name} Settings</h1>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me">
          Back to Account
        </Link>
      </div>
      <ServiceNote
        what={`${name} settings`}
        error={error}
        retry={() => {
          setError(null);
          setAttempt((value) => value + 1);
        }}
      />
      {settings !== undefined ? (
        <Connection provider={provider} initial={settings} />
      ) : (
        !error && (
          <p className="note" role="status">
            Loading {name} settings…
          </p>
        )
      )}
    </>
  );
}

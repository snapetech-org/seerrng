import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { SavedConnectionHost } from '../components/SavedConnectionHost';
import { sessionGeneration } from '../sessionState';

type Provider = 'audiobookshelf' | 'kavita';
const names = { audiobookshelf: 'Audiobookshelf', kavita: 'Kavita' };
interface Settings {
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
  externalUrl?: string;
  name?: string;
  libraryId?: string;
  libraryName?: string;
  syncEnabled?: boolean;
}
interface Library {
  id: string | number;
  name: string;
}

function Connection({
  provider,
  initial,
}: {
  provider: Provider;
  initial: Settings | null;
}) {
  const name = names[provider];
  const endpoint = `/settings/${provider}`;
  const audio = provider === 'audiobookshelf';
  const empty: Settings = {
    hostname: '',
    port: audio ? 13378 : 5000,
    apiKey: '',
    useSsl: false,
    ...(audio ? { name, syncEnabled: true } : {}),
  };
  const [libraries, setLibraries] = useState<Library[]>();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState({ ...(initial ?? empty), apiKey: '' });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const apiKey = draft.apiKey || (saved?.apiKey ? '[REDACTED]' : '');
  const ready = !!(
    draft.hostname.trim() &&
    apiKey &&
    Number.isInteger(draft.port) &&
    draft.port > 0 &&
    draft.port <= 65535
  );
  const canSave =
    ready &&
    (!audio || !!(draft.name?.trim() && draft.libraryId && draft.libraryName));
  const available =
    libraries ??
    (saved?.libraryId && saved.libraryName
      ? [{ id: saved.libraryId, name: saved.libraryName }]
      : []);
  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify({ ...(saved ?? empty), apiKey: '' });

  function update(patch: Partial<Settings>) {
    setDraft((value) => ({ ...value, ...patch }));
    setError('');
    setNotice('');
  }

  function updateConnection(patch: Partial<Settings>) {
    setLibraries(undefined);
    update({ ...patch, libraryId: undefined, libraryName: undefined });
  }

  async function submit(action: 'test' | 'save' | 'disconnect') {
    if (
      pending.current ||
      (action === 'disconnect'
        ? !confirm
        : action === 'test'
          ? !ready
          : !canSave)
    )
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const generation = sessionGeneration();
    const body = JSON.stringify({
      ...draft,
      hostname: draft.hostname.trim(),
      apiKey,
    });
    try {
      if (action === 'test') {
        const response = await api<{ libraries: Library[] }>(
          endpoint + '/test',
          { method: 'POST', body }
        );
        if (generation !== sessionGeneration()) return;
        setLibraries(response.libraries);
        if (
          audio &&
          !response.libraries.some(({ id }) => id === draft.libraryId)
        )
          update({ libraryId: undefined, libraryName: undefined });
      } else {
        let next: Settings | null = null;
        if (action === 'save')
          next = await api<Settings>(endpoint, { method: 'PUT', body });
        else await api(endpoint, { method: 'DELETE' }, 'empty');
        if (generation !== sessionGeneration()) return;
        setSaved(next);
        setDraft({ ...(next ?? empty), apiKey: '' });
        setConfirm(false);
        setLibraries(undefined);
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
          <SavedConnectionHost
            disabled={busy}
            onSelect={(hostname) => updateConnection({ hostname })}
          />
          {audio && (
            <label className="set cfg-row">
              <span>Service Name</span>
              <input
                className="cfg-input"
                maxLength={128}
                disabled={busy}
                value={draft.name ?? ''}
                onChange={(event) => update({ name: event.target.value })}
              />
            </label>
          )}
          {(
            [
              ['hostname', 'Hostname'],
              ['baseUrl', 'Base Path'],
              ['externalUrl', 'External URL'],
            ] as const
          ).map(([key, label]) => (
            <label className="set cfg-row" key={key}>
              <span>{label}</span>
              <input
                className="cfg-input"
                disabled={busy}
                value={draft[key] ?? ''}
                onChange={(event) =>
                  key === 'externalUrl'
                    ? update({ externalUrl: event.target.value })
                    : updateConnection({ [key]: event.target.value })
                }
              />
            </label>
          ))}
          <label className="set cfg-row">
            <span>Port</span>
            <input
              className="cfg-input"
              type="number"
              min={1}
              max={65535}
              disabled={busy}
              value={draft.port || ''}
              onChange={(event) =>
                updateConnection({ port: Number(event.target.value) })
              }
            />
          </label>
          <label className="set cfg-row">
            <span>Use HTTPS</span>
            <input
              type="checkbox"
              disabled={busy}
              checked={draft.useSsl}
              onChange={(event) =>
                updateConnection({ useSsl: event.target.checked })
              }
            />
          </label>
          <label className="set cfg-row">
            <span>API Key</span>
            <input
              className="cfg-input"
              type="password"
              autoComplete="new-password"
              disabled={busy}
              value={draft.apiKey}
              placeholder={saved?.apiKey ? 'Saved key' : undefined}
              onChange={(event) =>
                updateConnection({ apiKey: event.target.value })
              }
            />
          </label>
          {audio && (
            <>
              <label className="set cfg-row">
                <span>Audiobook Library</span>
                <select
                  className="cfg-select"
                  disabled={busy || !available.length}
                  value={draft.libraryId ?? ''}
                  onChange={(event) => {
                    const selection = available.find(
                      ({ id }) => id === event.target.value
                    );
                    update({
                      libraryId: selection ? String(selection.id) : undefined,
                      libraryName: selection?.name,
                    });
                  }}
                >
                  <option value="">Choose a Library</option>
                  {available.map(({ id, name: label }) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="set cfg-row">
                <span>Enable Library Scan</span>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={draft.syncEnabled ?? true}
                  onChange={(event) =>
                    update({ syncEnabled: event.target.checked })
                  }
                />
              </label>
            </>
          )}
        </div>
        {audio && !available.length && !libraries && (
          <p className="note">
            Test the connection to load audiobook libraries.
          </p>
        )}
        {libraries && (
          <p className="note" role="status">
            {libraries.length
              ? audio
                ? 'Select the audiobook library to scan.'
                : libraries.map(({ name: label }) => label).join(', ')
              : 'No compatible libraries found.'}
          </p>
        )}
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
            disabled={busy || !canSave || !dirty}
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
              Disconnect {name}?{' '}
              {audio &&
                'This removes availability and playback links supplied by this library.'}
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

export default function AdminReaders({ provider }: { provider: Provider }) {
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
        <Link className="btn btn-quiet btn-sm" to="/admin">
          Administration
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

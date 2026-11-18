import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { SavedConnectionHost } from '../components/SavedConnectionHost';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';

const endpoint = '/settings/download-clients';
const types = {
  qbittorrent: ['qBittorrent', 8080],
  transmission: ['Transmission', 9091],
  deluge: ['Deluge', 8112],
  torrentng: ['TorrentNG', 8080],
  rtorrent: ['rTorrent', 80],
  sabnzbd: ['SABnzbd', 8080],
} as const;
type ClientType = keyof typeof types;
interface Client {
  id?: number;
  type: ClientType;
  name: string;
  hostname: string;
  port: number;
  useSsl: boolean;
  enabled: boolean;
  baseUrl: string;
  username: string;
  passwordConfigured?: boolean;
}
interface Settings {
  pollIntervalSeconds: number;
  clients: Client[];
}
interface Draft extends Client {
  row: number;
  secret: string;
  clearPassword: boolean;
}
function toDraft(client: Client, row: number): Draft {
  return { ...client, row, secret: '', clearPassword: false };
}
function payload(client: Draft) {
  const {
    id,
    type,
    name,
    hostname,
    port,
    useSsl,
    enabled,
    baseUrl,
    username,
    secret,
    clearPassword,
  } = client;
  return {
    id,
    type,
    name,
    hostname,
    port,
    useSsl,
    enabled,
    baseUrl,
    username,
    clearPassword,
    ...(secret && !clearPassword ? { password: secret } : {}),
  };
}

function Editor({
  initial,
  onDirtyChange,
  inSetup,
}: {
  initial: Settings;
  onDirtyChange?: (dirty: boolean) => void;
  inSetup: boolean;
}) {
  const [interval, setInterval] = useState(initial.pollIntervalSeconds);
  const [clients, setClients] = useState(initial.clients.map(toDraft));
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState('both');
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const health = useApi<{ clients: { clientId: number; ok: boolean }[] }>(
    endpoint + '/status'
  );
  const nextRow = useRef(initial.clients.length);
  const pending = useRef(false);
  const dirty =
    interval !== saved.pollIntervalSeconds ||
    JSON.stringify(clients.map(payload)) !==
      JSON.stringify(saved.clients.map(toDraft).map(payload));

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  function update(row: number, patch: Partial<Draft>) {
    setClients((current) =>
      current.map((client) =>
        client.row === row ? { ...client, ...patch } : client
      )
    );
    setFeedback(undefined);
  }

  function addClient(type: ClientType) {
    const row = nextRow.current++;
    setClients((current) => [
      ...current,
      toDraft(
        {
          type,
          name: '',
          hostname: '',
          port: types[type][1],
          enabled: true,
          useSsl: false,
          baseUrl: '',
          username: '',
        },
        row
      ),
    ]);
  }

  function reset(settings: Settings) {
    setClients(
      settings.clients.map((client) => toDraft(client, nextRow.current++))
    );
    setInterval(settings.pollIntervalSeconds);
    setFeedback(undefined);
  }

  async function submit(client?: Draft) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFeedback(undefined);
    const generation = sessionGeneration();
    try {
      if (client) {
        const result = await api<{ version?: string }>(endpoint + '/test', {
          method: 'POST',
          body: JSON.stringify(payload(client)),
        });
        if (generation === sessionGeneration())
          setFeedback({
            text: result.version
              ? `Connected to ${client.name} (${result.version}).`
              : `Connected to ${client.name}.`,
          });
      } else {
        const result = await api<Settings>(endpoint, {
          method: 'PUT',
          body: JSON.stringify({
            pollIntervalSeconds: interval,
            clients: clients.map(payload),
          }),
        });
        if (generation !== sessionGeneration()) return;
        setSaved(result);
        reset(result);
        health.refresh();
        setFeedback({ text: 'Download client settings saved.' });
      }
    } catch (failure) {
      if (generation === sessionGeneration())
        setFeedback({
          text:
            failure instanceof ApiError
              ? failure.message
              : 'Could not update download client settings.',
          error: true,
        });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title="Live Download Progress">
      {inSetup && (
        <label className="sel">
          Download Setup Profile
          <select
            value={profile}
            onChange={(event) => setProfile(event.target.value)}
          >
            <option value="both">Usenet and Torrents</option>
            <option value="usenet">Usenet</option>
            <option value="torrent">Torrents</option>
          </select>
        </label>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="setlist">
          <label className="set cfg-row">
            <span>Refresh Interval (Seconds)</span>
            <input
              className="cfg-input"
              type="number"
              required
              min={1}
              max={60}
              disabled={busy}
              value={interval || ''}
              onChange={(event) => setInterval(Number(event.target.value))}
            />
          </label>
        </div>
        {!clients.length && (
          <p className="note">No download clients configured.</p>
        )}
        {clients.map((client) => {
          const { row, type } = client;
          const secretLabel =
            type === 'sabnzbd'
              ? 'API Key'
              : type === 'torrentng'
                ? 'API Token'
                : 'Password';
          const usesUsername =
            type === 'qbittorrent' || type === 'transmission';
          const status = health.data?.clients?.find(
            ({ clientId }) => clientId === client.id
          );
          return (
            <details className="adv" key={row}>
              <summary>{client.name || 'New Download Client'}</summary>
              <div className="setlist">
                <label className="set cfg-row">
                  <span>Client Type</span>
                  <select
                    className="cfg-select"
                    disabled={busy}
                    value={type}
                    onChange={(event) => {
                      const selected = event.target.value as ClientType;
                      update(row, {
                        type: selected,
                        port: types[selected][1],
                        username: '',
                        secret: '',
                        clearPassword: !!client.passwordConfigured,
                      });
                    }}
                  >
                    {Object.entries(types)
                      .filter(
                        ([key]) =>
                          !inSetup ||
                          profile === 'both' ||
                          key === type ||
                          (profile === 'usenet'
                            ? key === 'sabnzbd'
                            : key !== 'sabnzbd')
                      )
                      .map(([key, [label]]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                  </select>
                </label>
                <SavedConnectionHost
                  disabled={busy}
                  onSelect={(hostname) => update(row, { hostname })}
                />
                {(
                  [
                    ['name', 'Name', 80],
                    ['hostname', 'Hostname', 255],
                    ['baseUrl', 'URL Base', 512],
                    ...(usesUsername
                      ? [['username', 'Username', 2048] as const]
                      : []),
                  ] as const
                ).map(([field, label, maxLength]) => (
                  <label className="set cfg-row" key={field}>
                    <span>{label}</span>
                    <input
                      className="cfg-input"
                      required={field === 'name' || field === 'hostname'}
                      maxLength={maxLength}
                      disabled={busy}
                      value={client[field] ?? ''}
                      onChange={(event) =>
                        update(row, { [field]: event.target.value })
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
                    required
                    disabled={busy}
                    value={client.port || ''}
                    onChange={(event) =>
                      update(row, { port: Number(event.target.value) })
                    }
                  />
                </label>
                {(
                  [
                    ['useSsl', 'Use HTTPS'],
                    ['enabled', 'Read Live Progress'],
                  ] as const
                ).map(([field, label]) => (
                  <label className="set cfg-row" key={field}>
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={client[field]}
                      disabled={busy}
                      onChange={(event) =>
                        update(row, { [field]: event.target.checked })
                      }
                    />
                  </label>
                ))}
                <label className="set cfg-row">
                  <span>{secretLabel}</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    className="cfg-input"
                    maxLength={2048}
                    disabled={busy || client.clearPassword}
                    value={client.secret}
                    placeholder={
                      client.passwordConfigured ? 'Saved credential' : undefined
                    }
                    onChange={(event) =>
                      update(row, { secret: event.target.value })
                    }
                  />
                </label>
                {client.passwordConfigured && (
                  <label className="set cfg-row">
                    <span>Remove Saved Credential</span>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={client.clearPassword}
                      onChange={(event) =>
                        update(row, { clearPassword: event.target.checked })
                      }
                    />
                  </label>
                )}
              </div>
              {status && (
                <p className="note">
                  {status.ok ? 'Last check passed.' : 'Last check failed.'}
                </p>
              )}
              <div className="toolbar">
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={
                    busy ||
                    !client.name.trim() ||
                    !client.hostname.trim() ||
                    !client.port
                  }
                  onClick={() => void submit(client)}
                >
                  Test Client
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={() =>
                    setClients((current) =>
                      current.filter((item) => item.row !== row)
                    )
                  }
                >
                  Remove Client
                </button>
              </div>
            </details>
          );
        })}
        {feedback && (
          <p className="note" role={feedback.error ? 'alert' : 'status'}>
            {feedback.text}
          </p>
        )}
        <div className="toolbar">
          {inSetup && profile !== 'torrent' && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy || clients.length >= 8}
              onClick={() => addClient('sabnzbd')}
            >
              Add Usenet Client
            </button>
          )}
          {(!inSetup || profile !== 'usenet') && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy || clients.length >= 8}
              onClick={() => addClient('qbittorrent')}
            >
              {inSetup ? 'Add Torrent Client' : 'Add Download Client'}
            </button>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={busy}
          >
            Save Changes
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={() => reset(saved)}
          >
            Discard Changes
          </button>
        </div>
      </form>
    </Section>
  );
}

export default function AdminDownloadClients({
  inSetup = false,
  onDirtyChange,
}: { inSetup?: boolean; onDirtyChange?: (dirty: boolean) => void } = {}) {
  const settings = useApi<Settings>(endpoint);
  return (
    <>
      {!inSetup && (
        <>
          <h1>Download Client Settings</h1>
          <div className="toolbar">
            <Link className="btn btn-quiet btn-sm" to="/me">
              Back to Account
            </Link>
          </div>
        </>
      )}
      <ServiceNote
        what="download client settings"
        error={settings.error}
        retry={settings.reload}
      />
      {settings.data ? (
        <Editor
          initial={settings.data}
          onDirtyChange={onDirtyChange}
          inSetup={inSetup}
        />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            Loading download client settings…
          </p>
        )
      )}
    </>
  );
}

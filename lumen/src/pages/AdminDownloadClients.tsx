import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { SavedConnectionHost } from '../components/SavedConnectionHost';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';

const refreshIntervalId = 'download-clients-interval';

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
  const { t } = useLumenLocale();
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
              ? t(
                  'lumen.adminDownloadClients.testConnectedVersion',
                  'Connected to {client} ({version}).',
                  { client: client.name, version: result.version }
                )
              : t(
                  'lumen.adminDownloadClients.testConnected',
                  'Connected to {client}.',
                  { client: client.name }
                ),
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
        const readback = await api<Settings>(endpoint);
        if (generation !== sessionGeneration()) return;
        const expectedClients = clients.map((client) => {
          const existing = saved.clients.find((item) => item.id === client.id);
          return {
            ...(client.id === undefined ? {} : { id: client.id }),
            type: client.type,
            name: client.name.trim(),
            hostname: client.hostname.trim(),
            port: client.port,
            useSsl: client.useSsl,
            enabled: client.enabled,
            baseUrl: client.baseUrl.trim()
              ? `/${client.baseUrl.trim().replace(/^\/+|\/+$/g, '')}`
              : '',
            username:
              client.type === 'qbittorrent' ||
              client.type === 'transmission' ||
              client.type === 'rtorrent'
                ? client.username
                : '',
            passwordConfigured: client.clearPassword
              ? false
              : Boolean(client.secret || existing?.passwordConfigured),
          };
        });
        const matches = (candidate: Settings) =>
          candidate.pollIntervalSeconds === interval &&
          candidate.clients.length === expectedClients.length &&
          expectedClients.every((expected, index) =>
            Object.entries(expected).every(
              ([field, value]) =>
                candidate.clients[index]?.[
                  field as keyof (typeof candidate.clients)[number]
                ] === value
            )
          );
        if (!matches(result) || !matches(readback)) {
          setFeedback({
            text: t(
              'lumen.adminDownloadClients.saveFailure',
              'Could not update download client settings.'
            ),
            error: true,
          });
          return;
        }
        setSaved(readback);
        reset(readback);
        health.refresh();
        setFeedback({
          text: t(
            'lumen.adminDownloadClients.settingsSaved',
            'Download client settings saved.'
          ),
        });
      }
    } catch (failure) {
      if (generation === sessionGeneration())
        setFeedback({
          text:
            failure instanceof ApiError
              ? failure.message
              : t(
                  'lumen.adminDownloadClients.saveFailure',
                  'Could not update download client settings.'
                ),
          error: true,
        });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!inSetup && window.location.hash === `#${refreshIntervalId}`) {
      document
        .getElementById(refreshIntervalId)
        ?.scrollIntoView({ block: 'center' });
    }
  }, [inSetup]);

  return (
    <Section
      title={t(
        'lumen.adminDownloadClients.sectionTitle',
        'Live Download Progress'
      )}
    >
      {inSetup && (
        <label className="sel">
          {t(
            'lumen.adminDownloadClients.setupProfile',
            'Download Setup Profile'
          )}
          <select
            value={profile}
            onChange={(event) => setProfile(event.target.value)}
          >
            <option value="both">
              {t(
                'lumen.adminDownloadClients.profile.both',
                'Usenet and Torrents'
              )}
            </option>
            <option value="usenet">
              {t('lumen.adminDownloadClients.profile.usenet', 'Usenet')}
            </option>
            <option value="torrent">
              {t('lumen.adminDownloadClients.profile.torrent', 'Torrents')}
            </option>
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
            <span>
              {t(
                'lumen.adminDownloadClients.refreshInterval',
                'Refresh Interval (Seconds)'
              )}
            </span>
            <input
              id={inSetup ? undefined : refreshIntervalId}
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
          <p className="note">
            {t(
              'lumen.adminDownloadClients.noClients',
              'No download clients configured.'
            )}
          </p>
        )}
        {clients.map((client) => {
          const { row, type } = client;
          const secretLabel =
            type === 'sabnzbd'
              ? t('lumen.adminDownloadClients.apiKey', 'API Key')
              : type === 'torrentng'
                ? t('lumen.adminDownloadClients.apiToken', 'API Token')
                : t('lumen.adminDownloadClients.password', 'Password');
          const usesUsername =
            type === 'qbittorrent' ||
            type === 'transmission' ||
            type === 'rtorrent';
          const status = health.data?.clients?.find(
            ({ clientId }) => clientId === client.id
          );
          return (
            <details className="adv" key={row}>
              <summary>
                {client.name ||
                  t(
                    'lumen.adminDownloadClients.newClient',
                    'New Download Client'
                  )}
              </summary>
              <div className="setlist">
                <label className="set cfg-row">
                  <span>
                    {t('lumen.adminDownloadClients.clientType', 'Client Type')}
                  </span>
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
                    ['name', t('lumen.adminDownloadClients.name', 'Name'), 80],
                    [
                      'hostname',
                      t('lumen.adminDownloadClients.hostname', 'Hostname'),
                      255,
                    ],
                    [
                      'baseUrl',
                      t('lumen.adminDownloadClients.urlBase', 'URL Base'),
                      512,
                    ],
                    ...(usesUsername
                      ? [
                          [
                            'username',
                            t(
                              'lumen.adminDownloadClients.username',
                              'Username'
                            ),
                            2048,
                          ] as const,
                        ]
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
                  <span>{t('lumen.adminDownloadClients.port', 'Port')}</span>
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
                    [
                      'useSsl',
                      t('lumen.adminDownloadClients.useHttps', 'Use HTTPS'),
                    ],
                    [
                      'enabled',
                      t(
                        'lumen.adminDownloadClients.readLiveProgress',
                        'Read Live Progress'
                      ),
                    ],
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
                      client.passwordConfigured
                        ? t(
                            'lumen.adminDownloadClients.savedCredential',
                            'Saved credential'
                          )
                        : undefined
                    }
                    onChange={(event) =>
                      update(row, { secret: event.target.value })
                    }
                  />
                </label>
                {client.passwordConfigured && (
                  <label className="set cfg-row">
                    <span>
                      {t(
                        'lumen.adminDownloadClients.removeSavedCredential',
                        'Remove Saved Credential'
                      )}
                    </span>
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
                  {status.ok
                    ? t(
                        'lumen.adminDownloadClients.lastCheckPassed',
                        'Last check passed.'
                      )
                    : t(
                        'lumen.adminDownloadClients.lastCheckFailed',
                        'Last check failed.'
                      )}
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
                  {t('lumen.adminDownloadClients.testClient', 'Test Client')}
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
                  {t(
                    'lumen.adminDownloadClients.removeClient',
                    'Remove Client'
                  )}
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
              {t('lumen.adminDownloadClients.addUsenet', 'Add Usenet Client')}
            </button>
          )}
          {(!inSetup || profile !== 'usenet') && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy || clients.length >= 8}
              onClick={() => addClient('qbittorrent')}
            >
              {inSetup
                ? t(
                    'lumen.adminDownloadClients.addTorrent',
                    'Add Torrent Client'
                  )
                : t(
                    'lumen.adminDownloadClients.addDownload',
                    'Add Download Client'
                  )}
            </button>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={busy}
          >
            {t('lumen.adminDownloadClients.saveChanges', 'Save Changes')}
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={() => reset(saved)}
          >
            {t('lumen.adminDownloadClients.discardChanges', 'Discard Changes')}
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
  const { t } = useLumenLocale();
  const settings = useApi<Settings>(endpoint);
  return (
    <>
      {!inSetup && (
        <>
          <h1>
            {t(
              'lumen.adminDownloadClients.pageTitle',
              'Download Client Settings'
            )}
          </h1>
          <div className="toolbar">
            <Link className="btn btn-quiet btn-sm" to="/admin">
              {t('lumen.nav.administration', 'Administration')}
            </Link>
          </div>
        </>
      )}
      <ServiceNote
        what="download client settings"
        title={t(
          'lumen.adminDownloadClients.loadFailureTitle',
          'Couldn’t load Download Client Settings'
        )}
        error={settings.error}
        retryLabel={t('lumen.common.retry', 'Retry')}
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
            {t(
              'lumen.adminDownloadClients.loading',
              'Loading download client settings…'
            )}
          </p>
        )
      )}
    </>
  );
}

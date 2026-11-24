import { useState, type RefObject } from 'react';
import { api } from '../api';
import { forget } from '../apiCache';
import { useLumenLocale } from '../i18n';
import { invalidatePublicSettings } from '../mediaServer';
import { sessionGeneration } from '../sessionState';
import { Section } from './cards';
import { SavedConnectionHost } from './SavedConnectionHost';

const redacted = '[REDACTED]';

class ConnectionReadbackError extends Error {}

export interface ConnectionSettings {
  ip?: string;
  hostname?: string;
  externalUrl?: string;
  port?: number;
  useSsl?: boolean;
  urlBase?: string;
  externalHostname?: string;
  jellyfinForgotPasswordUrl?: string;
  webAppUrl?: string;
  analyzeOnPlayback?: boolean;
  apiKey?: string;
  bridgeLoginEnabled?: boolean;
}

type PlexDevice = {
  name: string;
  clientIdentifier: string;
  connection: {
    address: string;
    port: number;
    protocol: string;
    local?: boolean;
    status?: number;
  }[];
};

type Provider = 'plex' | 'jellyfin' | 'tautulli';
const defaultPorts = { plex: 32400, jellyfin: 8096, tautulli: 8181 };

function toDraft(settings: ConnectionSettings, provider: Provider) {
  return {
    ip: (provider === 'tautulli' ? settings.hostname : settings.ip) ?? '',
    port: String(settings.port || defaultPorts[provider]),
    useSsl: settings.useSsl ?? false,
    urlBase: settings.urlBase ?? '',
    externalHostname:
      (provider === 'tautulli'
        ? settings.externalUrl
        : settings.externalHostname) ?? '',
    jellyfinForgotPasswordUrl: settings.jellyfinForgotPasswordUrl ?? '',
    webAppUrl: settings.webAppUrl ?? '',
    analyzeOnPlayback: settings.analyzeOnPlayback ?? false,
    apiKey: '',
  };
}

const addressFields = [
  ['ip', 'Server Hostname', 'text'],
  ['port', 'Server Port', 'number'],
] as const;
const jellyfinFields = [
  ['urlBase', 'Server Base Path', 'text'],
  ['externalHostname', 'External Server URL', 'url'],
  ['jellyfinForgotPasswordUrl', 'Password Reset URL', 'url'],
  ['apiKey', 'Server API Key', 'password'],
] as const;

export default function MediaServerConnection<T extends ConnectionSettings>({
  provider,
  name,
  initial,
  onSaved,
  busy,
  setBusy,
  pending,
}: {
  provider: Provider;
  name: string;
  initial: T;
  onSaved?: (settings: T) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  pending: RefObject<boolean>;
}) {
  const { t } = useLumenLocale();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial, provider));
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const [devices, setDevices] = useState<PlexDevice[]>();
  const path = `/settings/${provider}`;
  const plex = provider === 'plex';
  const tautulli = provider === 'tautulli';
  const configuredKey = Boolean(saved.apiKey);
  const port = Number(draft.port);
  const valid =
    (tautulli && !draft.ip.trim()) ||
    (draft.ip.trim() &&
      Number.isInteger(port) &&
      port >= 1 &&
      port <= 65535 &&
      (plex || configuredKey || draft.apiKey.trim()));
  const changed =
    JSON.stringify(draft) !== JSON.stringify(toDraft(saved, provider));

  function change(patch: Partial<typeof draft>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setNotice('');
    setFailure('');
  }

  async function perform(action: () => Promise<void>, fallback: string) {
    if (pending.current) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await action();
    } catch (error) {
      if (generation === sessionGeneration())
        setFailure(
          error instanceof ConnectionReadbackError ? error.message : fallback
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function save() {
    if (!valid || !changed) return;
    const generation = sessionGeneration();
    const connection = {
      ...(tautulli ? { hostname: draft.ip.trim() } : { ip: draft.ip.trim() }),
      port: tautulli && !draft.port ? null : port,
      useSsl: draft.useSsl,
    };
    const options = plex
      ? {
          webAppUrl: draft.webAppUrl.trim(),
          analyzeOnPlayback: draft.analyzeOnPlayback,
        }
      : tautulli
        ? {
            urlBase: draft.urlBase.trim(),
            externalUrl: draft.externalHostname.trim(),
            apiKey: draft.apiKey || (configuredKey ? redacted : ''),
          }
        : {
            urlBase: draft.urlBase.trim(),
            externalHostname: draft.externalHostname.trim(),
            jellyfinForgotPasswordUrl: draft.jellyfinForgotPasswordUrl.trim(),
            apiKey: draft.apiKey || redacted,
          };
    const submitted = { ...connection, ...options };
    await perform(
      async () => {
        await api<T>(path, {
          method: 'POST',
          body: JSON.stringify(submitted),
        });
        if (generation !== sessionGeneration()) return;
        const readback = await api<T>(path);
        if (generation !== sessionGeneration()) return;
        const mismatch = Object.entries(submitted).some(([key, value]) => {
          if (key === 'apiKey') return Boolean(value) && !readback.apiKey;
          if (value === null) {
            const persisted = readback[key as keyof T];
            return persisted !== null && persisted !== undefined;
          }
          return (readback as Record<string, unknown>)[key] !== value;
        });
        if (mismatch)
          throw new ConnectionReadbackError(
            t(
              'lumen.mediaServerConnection.confirmFailure',
              'Could not confirm the saved connection settings.'
            )
          );
        setSaved(readback);
        setDraft(toDraft(readback, provider));
        onSaved?.(readback);
        if (!tautulli) {
          invalidatePublicSettings();
          forget('/settings/public');
        }
        setNotice(
          t('lumen.mediaServerConnection.saved', 'Connection settings saved.')
        );
      },
      t(
        'lumen.mediaServerConnection.saveFailed',
        'Could not save the {provider} connection. Check the address and credentials, then try again.',
        { provider: name }
      )
    );
  }

  async function changeBridge(enabled: boolean) {
    const generation = sessionGeneration();
    await perform(
      async () => {
        const result = await api<{ bridgeLoginEnabled: boolean }>(
          `${path}/bridge-login`,
          {
            method: 'POST',
            body: JSON.stringify({ enabled }),
          }
        );
        if (generation !== sessionGeneration()) return;
        setSaved((previous) => ({
          ...previous,
          bridgeLoginEnabled: result.bridgeLoginEnabled,
        }));
        setNotice(
          t(
            'lumen.mediaServerConnection.bridgeSaved',
            'Bridge sign-in settings saved.'
          )
        );
      },
      t(
        'lumen.mediaServerConnection.bridgeFailed',
        'Could not change bridge sign-in. Check that Jellyfin is connected and media-server sign-in is enabled.'
      )
    );
  }

  const serverOptions = (devices ?? []).map((device) => {
    const seen = new Set<string>();
    const connections = device.connection
      .filter((connection) => {
        const key = `${connection.protocol}|${connection.address}|${connection.port}`;
        if (seen.has(key) || !['http', 'https'].includes(connection.protocol))
          return false;
        seen.add(key);
        return true;
      })
      .sort(
        (left, right) =>
          Number(right.status === 200) - Number(left.status === 200) ||
          Number(!!right.local) - Number(!!left.local) ||
          Number(right.protocol === 'https') - Number(left.protocol === 'https')
      );
    return {
      ...device,
      connections: connections.map((connection, index) => ({
        ...connection,
        id: `${device.clientIdentifier}|${index}`,
      })),
    };
  });
  const discoveredConnections = serverOptions.flatMap(
    ({ connections }) => connections
  );
  const selectedConnection = discoveredConnections.find(
    ({ address, port, protocol, status }) =>
      status === 200 &&
      address === draft.ip &&
      port === Number(draft.port) &&
      (protocol === 'https') === draft.useSsl
  );
  async function discoverPlex() {
    const generation = sessionGeneration();
    await perform(
      async () => {
        const result = await api<PlexDevice[]>(
          '/settings/plex/devices/servers',
          {
            cache: 'no-store',
          }
        );
        if (generation !== sessionGeneration()) return;
        setDevices(result);
      },
      t(
        'lumen.mediaServerConnection.discoverFailed',
        'Could not discover Plex servers. Retry or enter the address manually.'
      )
    );
  }

  const fields = tautulli
    ? ([
        ['ip', 'Tautulli Hostname', 'text'],
        ['port', 'Tautulli Port', 'number'],
        ['urlBase', 'Tautulli Base Path', 'text'],
        ['externalHostname', 'Tautulli External URL', 'url'],
        ['apiKey', 'Tautulli API Key', 'password'],
      ] as const)
    : [
        ...addressFields,
        ...(plex
          ? ([['webAppUrl', 'Plex Web App URL', 'url']] as const)
          : jellyfinFields),
      ];
  return (
    <Section
      title={t(
        'lumen.mediaServerConnection.connection',
        '{provider} Connection',
        { provider: name }
      )}
    >
      {plex && (
        <>
          <div className="toolbar">
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => void discoverPlex()}
            >
              {t(
                'lumen.mediaServerConnection.discover',
                'Discover Plex Servers'
              )}
            </button>
          </div>
          {devices && (
            <>
              {devices.length > 0 && (
                <div className="setlist">
                  <label className="set cfg-row">
                    <span>
                      {t(
                        'lumen.mediaServerConnection.discoveredConnection',
                        'Discovered Plex Connection'
                      )}
                    </span>
                    <select
                      className="cfg-select"
                      value={selectedConnection?.id ?? ''}
                      disabled={busy}
                      onChange={(event) => {
                        const connection = discoveredConnections.find(
                          ({ id }) => id === event.target.value
                        );
                        if (connection?.status !== 200) return;
                        change({
                          ip: connection.address,
                          port: String(connection.port),
                          useSsl: connection.protocol === 'https',
                        });
                      }}
                    >
                      <option value="" disabled>
                        {t(
                          'lumen.mediaServerConnection.chooseConnection',
                          'Choose a Connection'
                        )}
                      </option>
                      {serverOptions.map((server) => (
                        <optgroup
                          key={server.clientIdentifier}
                          label={server.name}
                        >
                          {server.connections.map((connection, index) => (
                            <option
                              key={connection.id}
                              value={connection.id}
                              disabled={connection.status !== 200}
                            >
                              {`${connection.local ? t('lumen.mediaServerConnection.local', 'Local') : t('lumen.mediaServerConnection.remote', 'Remote')} ${connection.protocol.toUpperCase()} · ${connection.address}:${connection.port}${connection.status !== 200 ? ` · ${t('lumen.mediaServerConnection.unreachableShort', 'Unreachable')}` : index === 0 ? ` · ${t('lumen.mediaServerConnection.recommended', 'Recommended')}` : ''}`}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              {!discoveredConnections.some(({ status }) => status === 200) && (
                <p className="note">
                  {devices.length
                    ? t(
                        'lumen.mediaServerConnection.unreachable',
                        'No discovered Plex connection is reachable.'
                      )
                    : t(
                        'lumen.mediaServerConnection.noServers',
                        'No Plex servers were found.'
                      )}{' '}
                  {t(
                    'lumen.mediaServerConnection.enterAddress',
                    'Enter the address manually or retry discovery.'
                  )}
                </p>
              )}
            </>
          )}
        </>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="setlist">
          <SavedConnectionHost
            disabled={busy}
            onSelect={(hostname) => change({ ip: hostname })}
          />
          {fields.map(([key, label, type]) => (
            <label className="set cfg-row" key={key}>
              <span>
                {t(
                  `${tautulli ? 'lumen.mediaServerConnection.tautulliField' : 'lumen.mediaServerConnection.field'}.${key}`,
                  label
                )}
              </span>
              <input
                className="cfg-input"
                type={type}
                value={draft[key]}
                disabled={busy}
                min={key === 'port' ? 1 : undefined}
                max={key === 'port' ? 65535 : undefined}
                autoComplete={key === 'apiKey' ? 'new-password' : undefined}
                placeholder={
                  key === 'apiKey' && configuredKey
                    ? t('lumen.mediaServerConnection.savedKey', 'Saved key')
                    : undefined
                }
                onChange={(event) => change({ [key]: event.target.value })}
              />
            </label>
          ))}
          <label className="set cfg-row">
            <span>
              {tautulli
                ? t(
                    'lumen.mediaServerConnection.useHttpsTautulli',
                    'Use HTTPS for Tautulli'
                  )
                : t('lumen.mediaServerConnection.useHttps', 'Use HTTPS')}
            </span>
            <input
              type="checkbox"
              checked={draft.useSsl}
              disabled={busy}
              onChange={(event) => change({ useSsl: event.target.checked })}
            />
          </label>
          {plex && (
            <label className="set cfg-row">
              <span>
                {t(
                  'lumen.mediaServerConnection.analyzePlayback',
                  'Analyze Media on Playback'
                )}
              </span>
              <input
                type="checkbox"
                checked={draft.analyzeOnPlayback}
                disabled={busy}
                onChange={(event) =>
                  change({ analyzeOnPlayback: event.target.checked })
                }
              />
            </label>
          )}
        </div>
        <div className="toolbar">
          <button
            className="btn btn-primary btn-sm"
            disabled={busy || !valid || !changed}
          >
            {t(
              'lumen.mediaServerConnection.saveConnection',
              'Save {provider} Connection',
              { provider: name }
            )}
          </button>
        </div>
      </form>
      {name === 'Jellyfin' && (
        <div className="setlist">
          <label className="set cfg-row">
            <span>
              {t(
                'lumen.mediaServerConnection.enableBridge',
                'Enable Jellyfin Bridge Sign-In'
              )}
            </span>
            <input
              type="checkbox"
              checked={saved.bridgeLoginEnabled === true}
              disabled={busy}
              onChange={(event) => void changeBridge(event.target.checked)}
            />
          </label>
        </div>
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
    </Section>
  );
}

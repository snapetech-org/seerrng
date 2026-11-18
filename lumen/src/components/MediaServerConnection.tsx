import { useState, type RefObject } from 'react';
import { api } from '../api';
import { forget } from '../apiCache';
import { invalidatePublicSettings } from '../mediaServer';
import { sessionGeneration } from '../sessionState';
import { Section } from './cards';

const redacted = '[REDACTED]';

export interface ConnectionSettings {
  ip?: string;
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

type Provider = 'plex' | 'jellyfin';

function toDraft(settings: ConnectionSettings, provider: Provider) {
  return {
    ip: settings.ip ?? '',
    port: String(settings.port || (provider === 'plex' ? 32400 : 8096)),
    useSsl: settings.useSsl ?? false,
    urlBase: settings.urlBase ?? '',
    externalHostname: settings.externalHostname ?? '',
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
  onSaved: (settings: T) => void;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  pending: RefObject<boolean>;
}) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial, provider));
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const [devices, setDevices] = useState<PlexDevice[]>();
  const path = `/settings/${provider}`;
  const plex = provider === 'plex';
  const configuredKey = Boolean(saved.apiKey);
  const port = Number(draft.port);
  const valid =
    draft.ip.trim() &&
    Number.isInteger(port) &&
    port >= 1 &&
    port <= 65535 &&
    (plex || configuredKey || draft.apiKey.trim());
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
    } catch {
      if (generation === sessionGeneration()) setFailure(fallback);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function save() {
    if (!valid || !changed) return;
    const generation = sessionGeneration();
    const connection = { ip: draft.ip.trim(), port, useSsl: draft.useSsl };
    const options = plex
      ? {
          webAppUrl: draft.webAppUrl.trim(),
          analyzeOnPlayback: draft.analyzeOnPlayback,
        }
      : {
          urlBase: draft.urlBase.trim(),
          externalHostname: draft.externalHostname.trim(),
          jellyfinForgotPasswordUrl: draft.jellyfinForgotPasswordUrl.trim(),
          apiKey: draft.apiKey || redacted,
        };
    await perform(async () => {
      const result = await api<T>(path, {
        method: 'POST',
        body: JSON.stringify({ ...connection, ...options }),
      });
      if (generation !== sessionGeneration()) return;
      setSaved(result);
      setDraft(toDraft(result, provider));
      onSaved(result);
      invalidatePublicSettings();
      forget('/settings/public');
      setNotice('Connection settings saved.');
    }, `Could not save the ${name} connection. Check the address and credentials, then try again.`);
  }

  async function changeBridge(enabled: boolean) {
    const generation = sessionGeneration();
    await perform(async () => {
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
      setNotice('Bridge sign-in settings saved.');
    }, 'Could not change bridge sign-in. Check that Jellyfin is connected and media-server sign-in is enabled.');
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
    await perform(async () => {
      const result = await api<PlexDevice[]>('/settings/plex/devices/servers', {
        cache: 'no-store',
      });
      if (generation !== sessionGeneration()) return;
      setDevices(result);
    }, 'Could not discover Plex servers. Retry or enter the address manually.');
  }

  const fields = [
    ...addressFields,
    ...(plex
      ? ([['webAppUrl', 'Plex Web App URL', 'url']] as const)
      : jellyfinFields),
  ];
  return (
    <Section title={`${name} Connection`}>
      {plex && (
        <>
          <div className="toolbar">
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => void discoverPlex()}
            >
              Discover Plex Servers
            </button>
          </div>
          {devices && (
            <>
              {devices.length > 0 && (
                <div className="setlist">
                  <label className="set cfg-row">
                    <span>Discovered Plex Connection</span>
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
                        Choose a Connection
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
                              {`${connection.local ? 'Local' : 'Remote'} ${connection.protocol.toUpperCase()} · ${connection.address}:${connection.port}${connection.status !== 200 ? ' · Unreachable' : index === 0 ? ' · Recommended' : ''}`}
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
                    ? 'No discovered Plex connection is reachable.'
                    : 'No Plex servers were found.'}{' '}
                  Enter the address manually or retry discovery.
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
          {fields.map(([key, label, type]) => (
            <label className="set cfg-row" key={key}>
              <span>{label}</span>
              <input
                className="cfg-input"
                type={type}
                value={draft[key]}
                disabled={busy}
                min={key === 'port' ? 1 : undefined}
                max={key === 'port' ? 65535 : undefined}
                autoComplete={key === 'apiKey' ? 'new-password' : undefined}
                placeholder={
                  key === 'apiKey' && configuredKey ? 'Saved key' : undefined
                }
                onChange={(event) => change({ [key]: event.target.value })}
              />
            </label>
          ))}
          <label className="set cfg-row">
            <span>Use HTTPS</span>
            <input
              type="checkbox"
              checked={draft.useSsl}
              disabled={busy}
              onChange={(event) => change({ useSsl: event.target.checked })}
            />
          </label>
          {plex && (
            <label className="set cfg-row">
              <span>Analyze Media on Playback</span>
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
            Save {name} Connection
          </button>
        </div>
      </form>
      {name === 'Jellyfin' && (
        <div className="setlist">
          <label className="set cfg-row">
            <span>Enable Jellyfin Bridge Sign-In</span>
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

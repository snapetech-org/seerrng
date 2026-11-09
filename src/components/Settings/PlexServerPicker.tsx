import Button from '@app/components/Common/Button';
import PageErrorMessage from '@app/components/Common/PageErrorMessage';
import SettingsFormRow from '@app/components/Settings/SettingsFormRow';
import useApiRateLimit from '@app/hooks/useApiRateLimit';
import { isRateLimitError } from '@app/utils/apiRateLimit';
import defineMessages from '@app/utils/defineMessages';
import {
  buildPlexServerOptions,
  matchesPlexConnection,
  plexConnectionFailure,
  type PlexConnectionOption,
} from '@app/utils/plexConnectionOptions';
import type { PlexDevice } from '@server/interfaces/api/plexInterfaces';
import axios from 'axios';
import { useFormikContext } from 'formik';
import { useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Settings.PlexServerPicker', {
  server: 'Plex Server',
  description:
    'Load your servers to find a working connection. We recommend a local network address and prefer HTTPS when available. Your choice is saved when you save these settings.',
  load: 'Load Servers',
  refresh: 'Refresh Servers',
  loading: 'Checking Connections…',
  manual: 'Manual Configuration',
  recommendedDescription: 'Recommended connection: {connection}.',
  local: 'Local Network',
  remote: 'Remote',
  loopback: 'Same Host Only',
  linkLocal: 'Link-Local Network',
  unavailable: 'Unavailable',
  certificate: 'Certificate could not be verified',
  timeout: 'Connection timed out',
  advanced: 'Other Connections (Advanced)',
  connection: 'Connection Address',
  advancedDescription:
    'These are alternative routes to the same servers, not separate servers. Connections are tested from SeerrNG. Container, loopback and remote addresses are only useful when reachable from SeerrNG. Unavailable connections cannot be selected; you can still enter a hostname manually.',
  failed: 'Could Not Load Plex Servers',
  failedDescription:
    'Check your Plex account connection, then retry. Any previously loaded servers and your current settings have been kept.',
  empty: 'No Plex Servers Found',
  emptyDescription:
    'No servers owned by the connected Plex account were found. Check that Plex is running and signed in to that account, or enter its address manually.',
  unreachable: 'No Working Plex Connection Found',
  unreachableDescription:
    'SeerrNG could not reach any of the advertised connections. Check the network between SeerrNG and Plex, then refresh. Other Connections shows which addresses failed. For certificate errors, check trusted certificates, the system clock and DNS settings; certificate checks remain enabled.',
});

interface ConnectionValues {
  hostname?: string;
  port: number | string;
  useSsl?: boolean;
}

export default function PlexServerPicker() {
  const intl = useIntl();
  const { values, setValues } = useFormikContext<ConnectionValues>();
  const [devices, setDevices] = useState<PlexDevice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [manual, setManual] = useState(false);
  const active = useRef(false);
  const seconds = useApiRateLimit();
  const servers = useMemo(
    () => buildPlexServerOptions(devices ?? []),
    [devices]
  );
  const connections = servers.flatMap((server) => server.connections);
  const selected = connections.find((option) =>
    matchesPlexConnection(option, values)
  );
  const selectedServer = selected
    ? servers.find((server) => server.recommended?.id === selected.id)
    : undefined;

  const choose = (option: PlexConnectionOption) => {
    if (option.connection.status !== 200) return;
    setManual(false);
    void setValues((current) => ({
      ...current,
      hostname: option.connection.address,
      port: option.connection.port,
      useSsl: option.connection.protocol === 'https',
    }));
  };

  const refresh = async () => {
    if (active.current || seconds) return;
    active.current = true;
    setLoading(true);
    setFailed(false);
    try {
      const { data } = await axios.get<PlexDevice[]>(
        '/api/v1/settings/plex/devices/servers'
      );
      setDevices(data);
      const discovered = buildPlexServerOptions(data);
      const recommended =
        discovered.length === 1 ? discovered[0].recommended : undefined;
      if (recommended) {
        // Read the latest draft: a delayed discovery response must not replace
        // a hostname typed while discovery was running.
        void setValues((current) =>
          current.hostname
            ? current
            : {
                ...current,
                hostname: recommended.connection.address,
                port: recommended.connection.port,
                useSsl: recommended.connection.protocol === 'https',
              }
        );
      }
    } catch (error) {
      if (!isRateLimitError(error)) setFailed(true);
    } finally {
      active.current = false;
      setLoading(false);
    }
  };

  const connectionLabel = (option: PlexConnectionOption) =>
    [
      intl.formatMessage(messages[option.kind]),
      option.connection.protocol.toUpperCase(),
      ...(option.connection.status === 200
        ? []
        : [intl.formatMessage(messages[plexConnectionFailure(option)])]),
    ].join(' · ');

  return (
    <>
      <SettingsFormRow
        htmlFor="preset"
        label={intl.formatMessage(messages.server)}
        description={[
          ...(selectedServer?.recommended
            ? [
                intl.formatMessage(messages.recommendedDescription, {
                  connection: connectionLabel(selectedServer.recommended),
                }),
              ]
            : []),
          intl.formatMessage(messages.description),
        ].join(' ')}
      >
        <div className="form-input-field">
          <select
            id="preset"
            name="preset"
            value={manual ? 'manual' : (selectedServer?.id ?? 'manual')}
            disabled={!devices || loading}
            onChange={(event) => {
              const option = servers.find(
                (server) => server.id === event.target.value
              )?.recommended;
              if (option) choose(option);
              else setManual(true);
            }}
          >
            <option value="manual">
              {intl.formatMessage(messages.manual)}
            </option>
            {servers.map((server) => (
              <option
                key={server.id}
                value={server.id}
                disabled={!server.recommended}
              >
                {server.name}
                {server.recommended
                  ? ''
                  : ' — ' + intl.formatMessage(messages.unavailable)}
              </option>
            ))}
          </select>
          <Button
            type="button"
            buttonSize="standard"
            buttonIcon="retry"
            disabled={loading || seconds > 0}
            aria-busy={loading}
            onClick={() => void refresh()}
          >
            {intl.formatMessage(
              loading
                ? messages.loading
                : devices
                  ? messages.refresh
                  : messages.load
            )}
          </Button>
        </div>
      </SettingsFormRow>
      {failed && !seconds && (
        <PageErrorMessage
          title={intl.formatMessage(messages.failed)}
          description={intl.formatMessage(messages.failedDescription)}
          retry={{
            onClick: refresh,
            tooltip: intl.formatMessage(messages.refresh),
          }}
        />
      )}
      {devices && !failed && !servers.length && (
        <PageErrorMessage
          severity="empty"
          title={intl.formatMessage(messages.empty)}
          description={intl.formatMessage(messages.emptyDescription)}
        />
      )}
      {servers.length > 0 && !servers.some((server) => server.recommended) && (
        <PageErrorMessage
          severity="empty"
          title={intl.formatMessage(messages.unreachable)}
          description={intl.formatMessage(messages.unreachableDescription)}
        />
      )}
      {connections.length > 0 && (
        <details className="settings-help">
          <summary>{intl.formatMessage(messages.advanced)}</summary>
          <SettingsFormRow
            htmlFor="plexConnection"
            label={intl.formatMessage(messages.connection)}
            description={intl.formatMessage(messages.advancedDescription)}
          >
            <select
              id="plexConnection"
              value={selected?.id ?? 'manual'}
              onChange={(event) => {
                const option = connections.find(
                  (candidate) => candidate.id === event.target.value
                );
                if (option) choose(option);
              }}
            >
              <option value="manual">
                {intl.formatMessage(messages.manual)}
              </option>
              {servers.map((server) => (
                <optgroup key={server.id} label={server.name}>
                  {server.connections.map((option) => (
                    <option
                      key={option.id}
                      value={option.id}
                      disabled={option.connection.status !== 200}
                    >
                      {option.connection.address}:{option.connection.port}
                      {' — ' + connectionLabel(option)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </SettingsFormRow>
        </details>
      )}
    </>
  );
}

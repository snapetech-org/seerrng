import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';

const path = '/settings/network';

type Value = string | boolean;
type Settings = Record<string, unknown>;
type Field = {
  key: string;
  label: string;
  kind?: 'checkbox' | 'number' | 'password' | 'mode' | 'multiline';
  fallback?: Value;
  min?: number;
  max?: number;
  help?: string;
  message?: string;
  helpMessage?: string;
  warningMessage?: string;
};

const sections: {
  title: string;
  titleMessage?: string;
  group: string;
  fields: Field[];
}[] = [
  {
    title: 'Network',
    titleMessage: 'components.Settings.SettingsNetwork.network',
    group: '',
    fields: [
      {
        key: 'csrfProtection',
        label: 'CSRF Protection',
        kind: 'checkbox',
        message: 'components.Settings.SettingsNetwork.csrfProtection',
        help: 'Reject cross-site state-changing browser requests (requires HTTPS).',
        helpMessage:
          'components.Settings.SettingsNetwork.csrfProtectionDescription',
        warningMessage:
          'components.Settings.SettingsNetwork.csrfProtectionWarning',
      },
      {
        key: 'forceIpv4First',
        label: 'Prefer IPv4',
        kind: 'checkbox',
        message: 'components.Settings.SettingsNetwork.forceIpv4First',
        help: 'Resolve IPv4 addresses before IPv6.',
        helpMessage: 'components.Settings.SettingsNetwork.forceIpv4FirstTip',
      },
      {
        key: 'trustProxy',
        label: 'Trust Reverse Proxy',
        kind: 'checkbox',
        help: 'Enable only when requests reach SeerrNG through a trusted reverse proxy.',
        message: 'components.Settings.SettingsNetwork.trustProxy',
        helpMessage: 'components.Settings.SettingsNetwork.trustProxyTip',
      },
      {
        key: 'restrictAdministratorSignInToNetworks',
        label: 'Restrict Administrator Sign-In',
        kind: 'checkbox',
        message:
          'components.Settings.SettingsNetwork.restrictAdministratorSignInToNetworks',
        help: 'Administrators must sign in from an allowed network; regular users and API-key integrations are unaffected.',
        helpMessage:
          'components.Settings.SettingsNetwork.administratorSignInRestrictionTip',
      },
      {
        key: 'administratorSignInAllowedNetworks',
        label: 'Allowed Administrator Networks',
        kind: 'multiline',
        help: 'Enter IP addresses or CIDR ranges. Include your current client IP before enabling the restriction.',
        message:
          'components.Settings.SettingsNetwork.administratorSignInAllowedNetworks',
        helpMessage:
          'components.Settings.SettingsNetwork.administratorSignInAllowedNetworksTip',
      },
      {
        key: 'apiRequestTimeout',
        label: 'API Request Timeout (seconds)',
        kind: 'number',
        min: 0,
        max: 300,
        fallback: '10',
        message: 'components.Settings.SettingsNetwork.apiRequestTimeout',
        help: 'Maximum wait for responses from external services, in seconds. Set to 0 for no timeout.',
        helpMessage: 'components.Settings.SettingsNetwork.apiRequestTimeoutTip',
      },
    ],
  },
  {
    title: 'DNS Cache',
    titleMessage: 'components.Settings.SettingsNetwork.dnsCache',
    group: 'dnsCache',
    fields: [
      {
        key: 'enabled',
        label: 'Enable DNS Cache',
        kind: 'checkbox',
        message: 'components.Settings.SettingsNetwork.dnsCache',
        help: 'Cache DNS lookups to reduce repeated requests.',
        helpMessage: 'components.Settings.SettingsNetwork.dnsCacheTip',
        warningMessage: 'components.Settings.SettingsNetwork.dnsCacheHoverTip',
      },
      {
        key: 'forceMinTtl',
        label: 'Minimum TTL (seconds)',
        kind: 'number',
        min: 0,
        max: 86400,
        fallback: '0',
        message: 'components.Settings.SettingsNetwork.dnsCacheForceMinTtl',
      },
      {
        key: 'forceMaxTtl',
        label: 'Maximum TTL (seconds)',
        kind: 'number',
        min: -1,
        max: 86400,
        fallback: '-1',
        message: 'components.Settings.SettingsNetwork.dnsCacheForceMaxTtl',
      },
    ],
  },
  {
    title: 'Outbound Proxy',
    titleMessage: 'lumen.adminNetwork.outboundProxy',
    group: 'proxy',
    fields: [
      {
        key: 'enabled',
        label: 'Enable Outbound Proxy',
        kind: 'checkbox',
        message: 'components.Settings.SettingsNetwork.proxyEnabled',
        help: 'Send outgoing HTTP and HTTPS requests through this proxy.',
        helpMessage: 'components.Settings.SettingsNetwork.proxyEnabledTip',
      },
      {
        key: 'hostname',
        label: 'Proxy Hostname',
        message: 'components.Settings.SettingsNetwork.proxyHostname',
      },
      {
        key: 'port',
        label: 'Proxy Port',
        kind: 'number',
        min: 1,
        max: 65535,
        message: 'components.Settings.SettingsNetwork.proxyPort',
      },
      {
        key: 'useSsl',
        label: 'Use HTTPS for Proxy',
        kind: 'checkbox',
        message: 'components.Settings.SettingsNetwork.proxySsl',
      },
      {
        key: 'user',
        label: 'Proxy Username',
        message: 'components.Settings.SettingsNetwork.proxyUser',
      },
      {
        key: 'password',
        label: 'New Proxy Password',
        kind: 'password',
        help: 'Leave blank to keep the saved password.',
        message: 'components.Settings.SettingsNetwork.proxyPassword',
        helpMessage: 'lumen.adminNetwork.passwordHelp',
      },
      {
        key: 'bypassFilter',
        label: 'Proxy Bypass Filter',
        message: 'components.Settings.SettingsNetwork.proxyBypassFilter',
        help: 'Separate addresses with commas; use *. for subdomains.',
        helpMessage: 'components.Settings.SettingsNetwork.proxyBypassFilterTip',
      },
      {
        key: 'bypassLocalAddresses',
        label: 'Bypass Proxy for Local Addresses',
        kind: 'checkbox',
        message:
          'components.Settings.SettingsNetwork.proxyBypassLocalAddresses',
      },
    ],
  },
  {
    title: 'HTTP and HTTPS',
    titleMessage: 'components.Settings.SettingsNetwork.transportSecurity',
    group: 'tls',
    fields: [
      {
        key: 'mode',
        label: 'Built-in HTTPS',
        kind: 'mode',
        fallback: 'disabled',
        message: 'components.Settings.SettingsNetwork.tlsMode',
      },
      {
        key: 'httpsPort',
        label: 'HTTPS Port',
        kind: 'number',
        min: 1,
        max: 65535,
        fallback: '5056',
        message: 'components.Settings.SettingsNetwork.httpsPort',
        help: 'The listener port must differ from the HTTP port.',
        helpMessage: 'components.Settings.SettingsNetwork.httpsPortTip',
      },
      {
        key: 'hosts',
        label: 'Self-Signed Certificate Hosts',
        message: 'components.Settings.SettingsNetwork.tlsHosts',
        help: 'Comma-separated hostnames and IPs included in the generated certificate.',
        helpMessage: 'components.Settings.SettingsNetwork.tlsHostsTip',
      },
      {
        key: 'certificateFile',
        label: 'Certificate File',
        message: 'components.Settings.SettingsNetwork.certificateFile',
      },
      {
        key: 'keyFile',
        label: 'Private Key File',
        message: 'components.Settings.SettingsNetwork.keyFile',
      },
      {
        key: 'caFile',
        label: 'CA Chain File',
        message: 'components.Settings.SettingsNetwork.caFile',
      },
      {
        key: 'redirectHttpToHttps',
        label: 'Redirect HTTP to HTTPS',
        kind: 'checkbox',
        message: 'components.Settings.SettingsNetwork.redirectHttpToHttps',
        help: 'Verify HTTPS access before turning on the HTTP redirect.',
        helpMessage:
          'components.Settings.SettingsNetwork.redirectHttpToHttpsTip',
      },
      {
        key: 'showProvidedCertificateNotice',
        label: 'Show Certificate Notice',
        kind: 'checkbox',
        fallback: true,
        message:
          'components.Settings.SettingsNetwork.showProvidedCertificateNotice',
        help: 'Show the provided certificate fingerprint on login and setup pages.',
        helpMessage:
          'components.Settings.SettingsNetwork.showProvidedCertificateNoticeTip',
      },
      {
        key: 'allowHttpAuth',
        label: 'Allow Sign-In over HTTP',
        kind: 'checkbox',
        fallback: true,
        message: 'components.Settings.SettingsNetwork.allowHttpAuth',
        help: 'Use only on trusted LANs when devices cannot install the local CA.',
        helpMessage: 'components.Settings.SettingsNetwork.allowHttpAuthTip',
      },
      {
        key: 'httpAuthAcknowledged',
        label: 'I understand that HTTP does not encrypt sign-in traffic',
        kind: 'checkbox',
        fallback: true,
        message: 'components.Settings.SettingsNetwork.acknowledgeHttpRisk',
      },
    ],
  },
];

function fieldId(group: string, key: string) {
  return group ? `${group}.${key}` : key;
}

const nativeSelectLabels: Record<string, string> = {
  disabled: 'components.Settings.SettingsNetwork.tlsDisabled',
  'self-signed': 'components.Settings.SettingsNetwork.tlsSelfSigned',
  provided: 'components.Settings.SettingsNetwork.tlsProvided',
};

function formatNetworkSaveError(
  error: unknown,
  t: ReturnType<typeof useLumenLocale>['t']
) {
  if (error instanceof ApiError) {
    const messages: Record<string, [string, string]> = {
      'Add at least one administrator network before enabling the restriction.':
        [
          'components.Settings.SettingsNetwork.validationAdministratorSignInNetworksRequired',
          'Enter at least one allowed administrator network.',
        ],
      'The current client IP must be included in the allowed networks before enabling or changing this restriction.':
        [
          'lumen.adminNetwork.currentIpRequired',
          'Include your current client IP in the allowed networks before enabling or changing this restriction.',
        ],
      'tls.httpsPort must differ from the HTTP PORT.': [
        'lumen.adminNetwork.differentHttpsPort',
        'The HTTPS port must differ from the HTTP port.',
      ],
      'tls.httpAuthAcknowledged must be true before HTTP authentication can be enabled.':
        [
          'lumen.adminNetwork.ackRequired',
          'Confirm the HTTP authentication risk before enabling sign-in over HTTP.',
        ],
      'proxy hostname and port are required when proxy is enabled.': [
        'lumen.adminNetwork.proxyRequired',
        'Enter a proxy hostname and port before enabling the proxy.',
      ],
    };
    const translated = messages[error.message];
    if (translated) return t(translated[0], translated[1]);
  }
  return friendlyError(
    error,
    t(
      'components.Settings.SettingsNetwork.toastSettingsFailure',
      'Could not save network settings.'
    ),
    t
  );
}

function isFieldVisible(
  group: string,
  key: string,
  values: Record<string, Value>
) {
  if (
    group === 'dnsCache' &&
    key !== 'enabled' &&
    values['dnsCache.enabled'] !== true
  )
    return false;
  if (
    group === 'proxy' &&
    key !== 'enabled' &&
    values['proxy.enabled'] !== true
  )
    return false;
  if (
    !group &&
    key === 'administratorSignInAllowedNetworks' &&
    values.restrictAdministratorSignInToNetworks !== true
  )
    return false;

  if (group !== 'tls') return true;
  const mode = String(values['tls.mode'] ?? 'disabled');
  if (key === 'httpsPort' || key === 'redirectHttpToHttps')
    return mode !== 'disabled';
  if (key === 'hosts') return mode === 'self-signed';
  if (
    [
      'certificateFile',
      'keyFile',
      'caFile',
      'showProvidedCertificateNotice',
    ].includes(key)
  )
    return mode === 'provided';
  if (key === 'allowHttpAuth') return mode === 'disabled';
  if (key === 'httpAuthAcknowledged')
    return mode === 'disabled' && values['tls.allowHttpAuth'] === true;
  return true;
}

function readSettings(settings: Settings): Record<string, Value> {
  const values: Record<string, Value> = {};
  for (const { group, fields } of sections) {
    const source = (group ? settings[group] : settings) as Settings | undefined;
    for (const field of fields) {
      const value = source?.[field.key];
      values[fieldId(group, field.key)] =
        field.kind === 'password'
          ? ''
          : value === undefined
            ? (field.fallback ?? (field.kind === 'checkbox' ? false : ''))
            : typeof value === 'boolean'
              ? value
              : String(
                  field.key === 'apiRequestTimeout'
                    ? Number(value) / 1000
                    : value
                );
    }
  }
  values['proxy.clearPassword'] = false;
  return values;
}

function NetworkForm({
  initial,
  environmentOverrides,
}: {
  initial: Settings;
  environmentOverrides: string[] | undefined;
}) {
  const { t } = useLumenLocale();
  const [saved, setSaved] = useState(() => readSettings(initial));
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const dirty = Object.keys(draft).some((id) => draft[id] !== saved[id]);

  function change(id: string, value: Value) {
    setDraft((previous) => ({
      ...previous,
      [id]: value,
      ...(id === 'tls.mode' && value !== 'disabled'
        ? { 'tls.allowHttpAuth': false, 'tls.httpAuthAcknowledged': false }
        : id === 'tls.allowHttpAuth' && value === false
          ? { 'tls.httpAuthAcknowledged': false }
          : {}),
    }));
    setNotice('');
    setFailure('');
  }

  async function save() {
    if (pending.current || !dirty) return;
    const patch: Settings = {};
    for (const { group, fields } of sections) {
      const changes: Settings = {};
      for (const field of fields) {
        const id = fieldId(group, field.key);
        const value = draft[id];
        if (id === 'proxy.password' && draft['proxy.clearPassword']) {
          changes.password = '';
        } else if (value !== saved[id]) {
          if (field.kind === 'number' && value === '') {
            setFailure(
              t(
                field.key === 'apiRequestTimeout'
                  ? 'components.Settings.SettingsNetwork.validationApiRequestTimeout'
                  : group === 'dnsCache'
                    ? field.key === 'forceMinTtl'
                      ? 'components.Settings.SettingsNetwork.validationDnsCacheMinTtl'
                      : 'components.Settings.SettingsNetwork.validationDnsCacheMaxTtl'
                    : group === 'proxy'
                      ? 'components.Settings.SettingsNetwork.validationProxyPort'
                      : 'components.Settings.SettingsNetwork.validationApiRequestTimeout',
                `Enter a value for ${field.label}.`
              )
            );
            return;
          }
          if (
            group === 'proxy' &&
            field.key === 'port' &&
            draft['proxy.enabled'] === true &&
            (!Number.isInteger(Number(value)) ||
              Number(value) < 1 ||
              Number(value) > 65535)
          ) {
            setFailure(
              t(
                'components.Settings.SettingsNetwork.validationProxyPort',
                'Enter a valid proxy port.'
              )
            );
            return;
          }
          changes[field.key] =
            field.kind !== 'number'
              ? value
              : field.key === 'apiRequestTimeout'
                ? Math.round(Number(value) * 1000)
                : Number(value);
        }
      }

      if (
        draft.restrictAdministratorSignInToNetworks === true &&
        String(draft.administratorSignInAllowedNetworks ?? '').trim() === ''
      ) {
        setFailure(
          t(
            'components.Settings.SettingsNetwork.validationAdministratorSignInNetworksRequired',
            'Enter at least one allowed administrator network.'
          )
        );
        return;
      }
      if (
        draft['tls.allowHttpAuth'] === true &&
        draft['tls.httpAuthAcknowledged'] !== true
      ) {
        setFailure(
          t(
            'lumen.adminNetwork.ackRequired',
            'Confirm that HTTP login sessions can be intercepted before enabling sign-in over HTTP.'
          )
        );
        return;
      }
      if (!Object.keys(changes).length) continue;
      if (group) patch[group] = changes;
      else Object.assign(patch, changes);
    }

    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<Settings>(path, {
        method: 'POST',
        body: JSON.stringify(patch),
      });
      if (generation !== sessionGeneration()) return;
      const values = readSettings(result);
      setSaved(values);
      setDraft(values);
      setNotice(
        t(
          'lumen.adminNetwork.saved',
          'Network settings saved. Restart SeerrNG to apply changes that affect server startup.'
        )
      );
    } catch (error) {
      if (generation === sessionGeneration()) {
        setFailure(formatNetworkSaveError(error, t));
      }
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
      {sections.map(({ title, titleMessage, group, fields }) => (
        <Section
          key={title}
          title={titleMessage ? t(titleMessage, title) : title}
        >
          {group === 'tls' && (
            <p className="note">
              {!environmentOverrides
                ? t(
                    'lumen.adminNetwork.tlsUnavailable',
                    'Transport controls are unavailable until runtime settings load.'
                  )
                : environmentOverrides.length
                  ? t(
                      'components.Settings.SettingsNetwork.environmentOverride',
                      'Transport settings are overridden by environment variables: {variables}. Remove those variables before using these controls.',
                      { variables: environmentOverrides.join(', ') }
                    )
                  : t(
                      'components.Settings.SettingsNetwork.transportSecurityDescription',
                      'Choose how SeerrNG protects browser login sessions. Listener changes require a server restart.'
                    )}
            </p>
          )}
          <div className="setlist">
            {fields.map((field) => {
              const id = fieldId(group, field.key);
              const value = draft[id];
              if (!isFieldVisible(group, field.key, draft)) return null;
              const label = field.message
                ? t(field.message, field.label)
                : field.label;
              const help = field.helpMessage
                ? t(field.helpMessage, field.help)
                : field.help;
              const warning = field.warningMessage
                ? t(field.warningMessage)
                : undefined;
              const disabled =
                busy ||
                (group === 'tls' &&
                  (!environmentOverrides || environmentOverrides.length > 0)) ||
                ((id === 'tls.allowHttpAuth' ||
                  id === 'tls.httpAuthAcknowledged') &&
                  draft['tls.mode'] !== 'disabled') ||
                (id === 'proxy.password' &&
                  draft['proxy.clearPassword'] === true);
              return (
                <label key={id} id={id} className="set cfg-row">
                  <span>
                    <b>{label}</b>
                    {help && <small>{help}</small>}
                    {warning && <small>{warning}</small>}
                  </span>
                  {field.kind === 'checkbox' ? (
                    <input
                      type="checkbox"
                      checked={value === true}
                      disabled={disabled}
                      aria-label={label}
                      title={warning}
                      onChange={(event) => change(id, event.target.checked)}
                    />
                  ) : field.kind === 'mode' ? (
                    <select
                      className="cfg-select"
                      value={String(value)}
                      disabled={disabled}
                      aria-label={label}
                      onChange={(event) => change(id, event.target.value)}
                    >
                      {Object.entries(nativeSelectLabels).map(
                        ([option, message]) => (
                          <option value={option} key={option}>
                            {t(message)}
                          </option>
                        )
                      )}
                    </select>
                  ) : field.kind === 'multiline' ? (
                    <textarea
                      className="cfg-input"
                      disabled={disabled}
                      aria-label={label}
                      value={String(value)}
                      onChange={(event) => change(id, event.target.value)}
                    />
                  ) : (
                    <input
                      className="cfg-input"
                      type={field.kind ?? 'text'}
                      value={String(value)}
                      disabled={disabled}
                      aria-label={label}
                      min={field.min}
                      max={field.max}
                      step={id === 'apiRequestTimeout' ? 0.001 : undefined}
                      autoComplete={
                        field.kind === 'password' ? 'new-password' : undefined
                      }
                      onChange={(event) => change(id, event.target.value)}
                    />
                  )}
                </label>
              );
            })}
            {group === 'proxy' && draft['proxy.enabled'] === true && (
              <label className="set cfg-row" htmlFor="clear-proxy-password">
                <span>
                  {t(
                    'lumen.adminNetwork.clearProxyPassword',
                    'Clear Saved Proxy Password'
                  )}
                </span>
                <input
                  type="checkbox"
                  id="clear-proxy-password"
                  disabled={busy}
                  checked={draft['proxy.clearPassword'] === true}
                  onChange={(event) =>
                    change('proxy.clearPassword', event.target.checked)
                  }
                />
              </label>
            )}
          </div>
          {!group && draft.restrictAdministratorSignInToNetworks === true && (
            <p className="note">
              {t(
                'components.Settings.SettingsNetwork.administratorSignInProxyWarning',
                'When SeerrNG is behind a reverse proxy, enable Trust Reverse Proxy and ensure the proxy overwrites X-Forwarded-For.'
              )}
            </p>
          )}
          {group === 'tls' && draft['tls.mode'] !== 'disabled' && (
            <p className="note">
              {t(
                'components.Settings.SettingsNetwork.tlsSaveRestart',
                'Save the choice, restart SeerrNG, verify HTTPS, then enable the HTTP redirect if desired.'
              )}
            </p>
          )}
        </Section>
      ))}
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
        <button className="btn btn-primary btn-sm" disabled={busy || !dirty}>
          {busy
            ? t('lumen.account.saving', 'Saving…')
            : t('lumen.adminNetwork.save', 'Save Network Settings')}
        </button>
      </div>
    </form>
  );
}

export default function AdminNetwork() {
  const { t } = useLumenLocale();
  const settings = useApi<Settings>(path);
  const tls = useApi<{ environmentOverrides?: string[] }>('/status/tls');
  useEffect(() => {
    if (!settings.data || !window.location.hash) return;
    const target = document.getElementById(
      decodeURIComponent(window.location.hash.slice(1))
    );
    target?.scrollIntoView({ block: 'center' });
  }, [settings.data]);
  return (
    <>
      <header className="ph">
        <h1>
          {t(
            'components.Settings.SettingsNetwork.networksettings',
            'Network Settings'
          )}
        </h1>
        <div className="toolbar">
          <Link className="btn btn-quiet btn-sm" to="/me">
            {t('lumen.adminConnectionHosts.backToAccount', 'Back to Account')}
          </Link>
        </div>
      </header>
      <ServiceNote
        error={tls.error}
        what={t('lumen.adminNetwork.whatTransport', 'transport status')}
        title={t(
          'lumen.adminNetwork.loadTransportFailure',
          'Could not load transport status'
        )}
        retryLabel={t('lumen.adminNetwork.retry', 'Retry')}
        retry={tls.reload}
      />
      <ServiceNote
        error={settings.error}
        what={t('lumen.adminNetwork.whatNetwork', 'network settings')}
        title={t(
          'lumen.adminNetwork.loadFailure',
          'Could not load network settings'
        )}
        retryLabel={t('lumen.adminNetwork.retry', 'Retry')}
        retry={settings.reload}
      />
      {settings.data ? (
        <NetworkForm
          initial={settings.data}
          environmentOverrides={
            tls.data ? (tls.data.environmentOverrides ?? []) : undefined
          }
        />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            {t('lumen.adminNetwork.loading', 'Loading network settings…')}
          </p>
        )
      )}
    </>
  );
}

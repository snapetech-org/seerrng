import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
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
};

const sections: { title: string; group: string; fields: Field[] }[] = [
  {
    title: 'Network',
    group: '',
    fields: [
      { key: 'csrfProtection', label: 'CSRF Protection', kind: 'checkbox' },
      { key: 'forceIpv4First', label: 'Prefer IPv4', kind: 'checkbox' },
      {
        key: 'trustProxy',
        label: 'Trust Reverse Proxy',
        kind: 'checkbox',
        help: 'Enable only when requests reach SeerrNG through a trusted reverse proxy.',
      },
      {
        key: 'restrictAdministratorSignInToNetworks',
        label: 'Restrict Administrator Sign-In',
        kind: 'checkbox',
      },
      {
        key: 'administratorSignInAllowedNetworks',
        label: 'Allowed Administrator Networks',
        kind: 'multiline',
        help: 'Enter IP addresses or CIDR ranges. Include your current client IP before enabling the restriction.',
      },
      {
        key: 'apiRequestTimeout',
        label: 'API Request Timeout (seconds)',
        kind: 'number',
        min: 0,
        fallback: '10',
      },
    ],
  },
  {
    title: 'DNS Cache',
    group: 'dnsCache',
    fields: [
      { key: 'enabled', label: 'Enable DNS Cache', kind: 'checkbox' },
      {
        key: 'forceMinTtl',
        label: 'Minimum TTL (seconds)',
        kind: 'number',
        min: 0,
        fallback: '0',
      },
      {
        key: 'forceMaxTtl',
        label: 'Maximum TTL (seconds)',
        kind: 'number',
        min: -1,
        fallback: '-1',
      },
    ],
  },
  {
    title: 'Outbound Proxy',
    group: 'proxy',
    fields: [
      { key: 'enabled', label: 'Enable Outbound Proxy', kind: 'checkbox' },
      { key: 'hostname', label: 'Proxy Hostname' },
      { key: 'port', label: 'Proxy Port', kind: 'number', min: 0, max: 65535 },
      { key: 'useSsl', label: 'Use HTTPS for Proxy', kind: 'checkbox' },
      { key: 'user', label: 'Proxy Username' },
      {
        key: 'password',
        label: 'New Proxy Password',
        kind: 'password',
        help: 'Leave blank to keep the saved password.',
      },
      { key: 'bypassFilter', label: 'Proxy Bypass Filter' },
      {
        key: 'bypassLocalAddresses',
        label: 'Bypass Proxy for Local Addresses',
        kind: 'checkbox',
      },
    ],
  },
  {
    title: 'HTTP and HTTPS',
    group: 'tls',
    fields: [
      {
        key: 'mode',
        label: 'Built-in HTTPS',
        kind: 'mode',
        fallback: 'disabled',
      },
      {
        key: 'httpsPort',
        label: 'HTTPS Port',
        kind: 'number',
        min: 1,
        max: 65535,
        fallback: '5056',
      },
      { key: 'hosts', label: 'Self-Signed Certificate Hosts' },
      { key: 'certificateFile', label: 'Certificate File' },
      { key: 'keyFile', label: 'Private Key File' },
      { key: 'caFile', label: 'CA Chain File' },
      {
        key: 'redirectHttpToHttps',
        label: 'Redirect HTTP to HTTPS',
        kind: 'checkbox',
      },
      {
        key: 'showProvidedCertificateNotice',
        label: 'Show Certificate Notice',
        kind: 'checkbox',
        fallback: true,
      },
      {
        key: 'allowHttpAuth',
        label: 'Allow Sign-In over HTTP',
        kind: 'checkbox',
        fallback: true,
      },
      {
        key: 'httpAuthAcknowledged',
        label: 'I understand that HTTP does not encrypt sign-in traffic',
        kind: 'checkbox',
        fallback: true,
      },
    ],
  },
];

function fieldId(group: string, key: string) {
  return group ? `${group}.${key}` : key;
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
            setFailure(`Enter a value for ${field.label}.`);
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
        'Network settings saved. Restart SeerrNG to apply changes that affect server startup.'
      );
    } catch (error) {
      if (generation === sessionGeneration()) {
        setFailure(friendlyError(error, 'Could not save network settings.'));
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
      {sections.map(({ title, group, fields }) => (
        <Section key={title} title={title}>
          {group === 'tls' && (
            <p className="note">
              {!environmentOverrides
                ? 'Transport controls are unavailable until runtime settings load.'
                : environmentOverrides.length
                  ? `Environment variables override transport settings: ${environmentOverrides.join(', ')}.`
                  : 'Restart SeerrNG and verify HTTPS before enabling the HTTP redirect.'}
            </p>
          )}
          <div className="setlist">
            {fields.map((field) => {
              const id = fieldId(group, field.key);
              const value = draft[id];
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
                <label key={id} className="set cfg-row">
                  <span>
                    <b>{field.label}</b>
                    {field.help && <small>{field.help}</small>}
                  </span>
                  {field.kind === 'checkbox' ? (
                    <input
                      type="checkbox"
                      checked={value === true}
                      disabled={disabled}
                      onChange={(event) => change(id, event.target.checked)}
                    />
                  ) : field.kind === 'mode' ? (
                    <select
                      className="cfg-select"
                      value={String(value)}
                      disabled={disabled}
                      onChange={(event) => change(id, event.target.value)}
                    >
                      <option value="disabled">Disabled</option>
                      <option value="self-signed">
                        Self-signed certificate
                      </option>
                      <option value="provided">Provided certificate</option>
                    </select>
                  ) : field.kind === 'multiline' ? (
                    <textarea
                      className="cfg-input"
                      disabled={disabled}
                      value={String(value)}
                      onChange={(event) => change(id, event.target.value)}
                    />
                  ) : (
                    <input
                      className="cfg-input"
                      type={field.kind ?? 'text'}
                      value={String(value)}
                      disabled={disabled}
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
            {group === 'proxy' && (
              <label className="set cfg-row" htmlFor="clear-proxy-password">
                <span>Clear Saved Proxy Password</span>
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
          {busy ? 'Saving…' : 'Save Network Settings'}
        </button>
      </div>
    </form>
  );
}

export default function AdminNetwork() {
  const settings = useApi<Settings>(path);
  const tls = useApi<{ environmentOverrides?: string[] }>('/status/tls');
  return (
    <>
      <header className="ph">
        <h1>Network Settings</h1>
        <div className="toolbar">
          <Link className="btn btn-quiet btn-sm" to="/me">
            Back to Account
          </Link>
        </div>
      </header>
      <ServiceNote
        error={tls.error}
        what="transport status"
        retry={tls.reload}
      />
      <ServiceNote
        error={settings.error}
        what="network settings"
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
            Loading network settings…
          </p>
        )
      )}
    </>
  );
}

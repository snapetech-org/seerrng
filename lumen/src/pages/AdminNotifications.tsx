import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { forget } from '../apiCache';
import { EventChoices } from '../components/NotificationEventChoices';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { invalidatePublicSettings } from '../mediaServer';
import { sessionGeneration } from '../sessionState';

type Channel = 'email' | 'webpush' | 'telegram' | 'pushbullet' | 'pushover';
type Configuration = {
  enabled: boolean;
  embedPoster: boolean;
  types?: number;
  options: Record<string, string | number | boolean>;
};
const titles = {
  email: 'Email',
  webpush: 'Web Push',
  telegram: 'Telegram',
  pushbullet: 'Pushbullet',
  pushover: 'Pushover',
};
const redacted = '[REDACTED]';
const emailFields = [
  { key: 'senderName', label: 'Sender Name', kind: 'text' },
  { key: 'emailFrom', label: 'Sender Email', kind: 'email' },
  { key: 'smtpHost', label: 'SMTP Host', kind: 'text' },
  { key: 'smtpPort', label: 'SMTP Port', kind: 'number' },
  { key: 'authUser', label: 'SMTP Username', kind: 'text' },
  { key: 'authPass', label: 'SMTP Password', kind: 'password' },
  { key: 'pgpPrivateKey', label: 'PGP Private Key', kind: 'secret-multiline' },
  { key: 'pgpPassword', label: 'PGP Passphrase', kind: 'password' },
] as const;
const emailSwitches = [
  ['userEmailRequired', 'Require an Email Address for All Users'],
  ['usePublicLogo', 'Use the Public Logo'],
  ['allowSelfSigned', 'Allow Self-Signed SMTP Certificates'],
] as const;

const fields = {
  email: emailFields,
  webpush: [],
  telegram: [
    { key: 'botAPI', label: 'Bot Token', kind: 'password' },
    { key: 'botUsername', label: 'Bot Username', kind: 'text' },
    { key: 'chatId', label: 'Chat ID', kind: 'text' },
    { key: 'messageThreadId', label: 'Message Thread ID', kind: 'text' },
  ],
  pushbullet: [
    { key: 'accessToken', label: 'Access Token', kind: 'password' },
    { key: 'channelTag', label: 'Channel Tag', kind: 'text' },
  ],
  pushover: [
    { key: 'accessToken', label: 'Application Token', kind: 'password' },
    { key: 'userToken', label: 'User Key', kind: 'password' },
  ],
} as const;
const required = {
  telegram: ['botAPI', 'chatId'],
  pushbullet: ['accessToken'],
  pushover: ['accessToken', 'userToken'],
} as const;

function AgentForm({
  channel,
  endpoint,
  initial,
}: {
  channel: Channel;
  endpoint: string;
  initial: Configuration;
}) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const options = draft.options;
  const eventChannel = channel !== 'email' && channel !== 'webpush';
  const sounds = useApi<{ name: string; description: string }[]>(
    channel === 'pushover' && saved.options.accessToken
      ? '/settings/notifications/pushover/sounds'
      : null
  );
  const valid = eventChannel
    ? required[channel].every((key) => String(options[key] ?? '').trim())
    : channel === 'webpush' ||
      (typeof options.emailFrom === 'string' &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(options.emailFrom) &&
        typeof options.senderName === 'string' &&
        !!options.senderName.trim() &&
        typeof options.smtpHost === 'string' &&
        !!options.smtpHost.trim() &&
        Number.isInteger(options.smtpPort) &&
        Number(options.smtpPort) >= 1 &&
        Number(options.smtpPort) <= 65535);
  const encryption = options.secure
    ? 'implicit'
    : options.requireTls
      ? 'required'
      : options.ignoreTls
        ? 'none'
        : 'default';

  function update(next: Configuration) {
    setDraft(next);
    setNotice('');
    setFailure('');
  }

  function setOptions(next: Configuration['options']) {
    update({ ...draft, options: { ...options, ...next } });
  }

  async function submit(test: boolean) {
    if (
      pending.current ||
      (!test && !changed) ||
      (!valid && (test || draft.enabled)) ||
      (!test && draft.enabled && eventChannel && !draft.types)
    )
      return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const request: RequestInit = {
        method: 'POST',
        body: JSON.stringify({
          ...draft,
          ...(test ? { enabled: true } : {}),
          ...(eventChannel ? { types: draft.types ?? 0 } : {}),
        }),
      };
      if (test) {
        await api(`${endpoint}/test`, request, 'empty');
        if (generation === sessionGeneration())
          setNotice('Test notification sent.');
      } else {
        const updated = await api<Configuration>(endpoint, request);
        if (generation !== sessionGeneration()) return;
        setSaved(updated);
        setDraft(updated);
        if (
          channel === 'pushover' &&
          draft.options.accessToken !== saved.options.accessToken
        )
          sounds.reload();
        invalidatePublicSettings();
        forget('/settings/public');
        setNotice('Notification settings saved.');
      }
    } catch {
      if (generation === sessionGeneration())
        setFailure(
          test
            ? 'Could not send the test notification. Check the settings and try again.'
            : 'Could not save notification settings. Try again.'
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit(false);
      }}
    >
      <div className="setlist">
        {(
          [
            ['enabled', 'Enable Notifications'],
            ['embedPoster', 'Include Poster Images'],
          ] as const
        ).map(([key, label]) => (
          <label className="set cfg-row" key={key}>
            <span>{label}</span>
            <input
              type="checkbox"
              checked={draft[key]}
              disabled={busy}
              onChange={(event) =>
                update({ ...draft, [key]: event.target.checked })
              }
            />
          </label>
        ))}
        {fields[channel].map(({ key, label, kind }) => {
          const id = `notification-${channel}-${key}`;
          const value = options[key];
          const secret =
            key === 'smtpHost' ||
            key === 'authUser' ||
            kind === 'password' ||
            kind === 'secret-multiline';
          const configured = secret && saved.options[key] === redacted;
          const displayed =
            secret && value === redacted ? '' : String(value ?? '');
          return (
            <div className="set cfg-row" key={key}>
              <span>
                <label htmlFor={id}>{label}</label>
                {configured && (
                  <small>
                    Credential saved. Enter a replacement or clear it.
                  </small>
                )}
              </span>
              {kind === 'secret-multiline' ? (
                <textarea
                  id={id}
                  className="cfg-input"
                  value={displayed}
                  maxLength={128 * 1024}
                  disabled={busy}
                  onChange={(event) =>
                    setOptions({
                      [key]: event.target.value || (configured ? redacted : ''),
                    })
                  }
                />
              ) : (
                <input
                  id={id}
                  className="cfg-input"
                  type={kind}
                  value={displayed}
                  disabled={busy}
                  autoComplete={secret ? 'new-password' : undefined}
                  onChange={(event) =>
                    setOptions({
                      [key]:
                        kind === 'number'
                          ? Number(event.target.value)
                          : event.target.value || (configured ? redacted : ''),
                    })
                  }
                />
              )}
              {configured && (
                <button
                  className="btn btn-quiet btn-sm"
                  type="button"
                  disabled={busy || value === ''}
                  onClick={() => setOptions({ [key]: '' })}
                >
                  Clear {label}
                </button>
              )}
            </div>
          );
        })}
        {channel === 'email' && (
          <>
            <label className="set cfg-row">
              <span>SMTP Encryption</span>
              <select
                className="cfg-select"
                value={encryption}
                disabled={busy}
                onChange={(event) =>
                  setOptions({
                    secure: event.target.value === 'implicit',
                    requireTls: event.target.value === 'required',
                    ignoreTls: event.target.value === 'none',
                  })
                }
              >
                <option value="default">Automatic</option>
                <option value="implicit">Implicit TLS</option>
                <option value="required">Require STARTTLS</option>
                <option value="none">None</option>
              </select>
            </label>
            {emailSwitches.map(([key, label]) => (
              <label className="set cfg-row" key={key}>
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={options[key] === true}
                  disabled={busy}
                  onChange={(event) =>
                    setOptions({ [key]: event.target.checked })
                  }
                />
              </label>
            ))}
          </>
        )}
        {channel === 'telegram' && (
          <label className="set cfg-row">
            <span>Send Silently</span>
            <input
              type="checkbox"
              disabled={busy}
              checked={options.sendSilently === true}
              onChange={(event) =>
                setOptions({ sendSilently: event.target.checked })
              }
            />
          </label>
        )}
        {channel === 'pushover' && (
          <label className="set cfg-row">
            <span>Notification Sound</span>
            <select
              className="cfg-select"
              value={String(options.sound ?? '')}
              disabled={busy}
              onChange={(event) => setOptions({ sound: event.target.value })}
            >
              <option value="">Device Default</option>
              {typeof options.sound === 'string' &&
                options.sound &&
                !sounds.data?.some(({ name }) => name === options.sound) && (
                  <option value={options.sound}>{options.sound}</option>
                )}
              {sounds.data?.map(({ name, description }) => (
                <option key={name} value={name}>
                  {description}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {channel === 'pushover' && (
        <ServiceNote
          error={sounds.error}
          what="Pushover sounds"
          retry={sounds.reload}
        />
      )}
      {eventChannel && (
        <>
          <p className="note">Notification Events</p>
          <EventChoices
            mask={draft.types ?? 0}
            disabled={busy}
            change={(types) => update({ ...draft, types })}
          />
          {draft.enabled && !draft.types && (
            <p className="note">Select at least one notification event.</p>
          )}
          {!valid && (
            <p className="note">
              Set the channel credentials and destination before enabling or
              testing notifications.
            </p>
          )}
        </>
      )}
      {!valid && channel === 'email' && (
        <p className="note">
          Enter a sender name and email, SMTP host, and port to enable or test
          email.
        </p>
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
      <div className="toolbar">
        <button
          className="btn btn-primary btn-sm"
          disabled={
            busy ||
            !changed ||
            (draft.enabled && (!valid || (eventChannel && !draft.types)))
          }
        >
          Save {titles[channel]}
        </button>
        <button
          className="btn btn-quiet btn-sm"
          type="button"
          disabled={busy || !valid}
          onClick={() => void submit(true)}
        >
          Send {titles[channel]} Test
        </button>
      </div>
    </form>
  );
}

function AgentSection({ channel }: { channel: Channel }) {
  const endpoint = `/settings/notifications/${channel}`;
  const { data, error, reload } = useApi<Configuration>(endpoint);
  return (
    <Section title={titles[channel]} id={channel}>
      {channel === 'webpush' && (
        <p className="note">
          Test delivery requires a browser subscribed to Web Push on your
          account.
        </p>
      )}
      <ServiceNote
        error={error}
        what={`${titles[channel]} settings`}
        retry={reload}
      />
      {data ? (
        <AgentForm channel={channel} endpoint={endpoint} initial={data} />
      ) : (
        !error && (
          <p className="note" role="status">
            Loading settings…
          </p>
        )
      )}
    </Section>
  );
}

export default function AdminNotifications() {
  return (
    <>
      <header className="ph">
        <h1>Instance Notifications</h1>
        <div className="toolbar">
          <Link className="btn btn-quiet btn-sm" to="/me">
            Back to Account
          </Link>
        </div>
      </header>
      <AgentSection channel="email" />
      <AgentSection channel="telegram" />
      <AgentSection channel="pushbullet" />
      <AgentSection channel="pushover" />
      <AgentSection channel="webpush" />
    </>
  );
}

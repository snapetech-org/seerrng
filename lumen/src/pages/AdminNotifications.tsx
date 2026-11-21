import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { forget } from '../apiCache';
import { EventChoices } from '../components/NotificationEventChoices';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { invalidatePublicSettings } from '../mediaServer';
import { sessionGeneration } from '../sessionState';

type Channel =
  | 'email'
  | 'webpush'
  | 'telegram'
  | 'pushbullet'
  | 'pushover'
  | 'gotify'
  | 'ntfy'
  | 'apprise'
  | 'discord'
  | 'slack'
  | 'webhook';
type Header = { key: string; value: string };
type Configuration = {
  enabled: boolean;
  embedPoster: boolean;
  types?: number;
  options: Record<string, string | number | boolean | Header[]>;
};
const titles = {
  email: 'Email',
  webpush: 'Web Push',
  telegram: 'Telegram',
  pushbullet: 'Pushbullet',
  pushover: 'Pushover',
  gotify: 'Gotify',
  ntfy: 'ntfy',
  apprise: 'Apprise',
  discord: 'Discord',
  slack: 'Slack',
  webhook: 'Webhook',
};
const channels: Channel[] = [
  'email',
  'telegram',
  'pushbullet',
  'pushover',
  'gotify',
  'ntfy',
  'apprise',
  'discord',
  'slack',
  'webhook',
  'webpush',
];
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

const urlField = { key: 'url', label: 'Server URL', kind: 'url' } as const;
const localeField = {
  key: 'locale',
  label: 'Notification Locale',
  kind: 'text',
} as const;
const userFields = [
  { key: 'username', label: 'Username', kind: 'text' },
  { key: 'password', label: 'Password', kind: 'password' },
] as const;
const tokenField = {
  key: 'token',
  label: 'Access Token',
  kind: 'password',
} as const;

const webhookField = {
  key: 'webhookUrl',
  label: 'Webhook URL',
  kind: 'password',
} as const;
const slackActionFields = [
  { key: 'workspaceId', label: 'Slack Workspace ID', kind: 'text' },
  { key: 'signingSecret', label: 'Slack Signing Secret', kind: 'password' },
  {
    key: 'requestManagerMappings',
    label: 'Request Manager Mappings',
    kind: 'multiline',
  },
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
  gotify: [
    urlField,
    tokenField,
    { key: 'priority', label: 'Priority', kind: 'number' },
    localeField,
  ],
  ntfy: [
    urlField,
    { key: 'topic', label: 'Topic', kind: 'text' },
    { key: 'tags', label: 'Tags', kind: 'text' },
    localeField,
  ],
  apprise: [
    urlField,
    { key: 'configKey', label: 'Configuration Key', kind: 'text' },
    { key: 'tag', label: 'Tag', kind: 'text' },
    localeField,
  ],
  discord: [
    webhookField,
    { key: 'botUsername', label: 'Bot Username', kind: 'text' },
    { key: 'botAvatarUrl', label: 'Bot Avatar URL', kind: 'url' },
    { key: 'webhookRoleId', label: 'Role ID', kind: 'text' },
    { key: 'webhookThreadId', label: 'Thread ID', kind: 'text' },
    localeField,
  ],
  slack: [webhookField, localeField],
  webhook: [
    webhookField,
    { key: 'authHeader', label: 'Authorization Header', kind: 'password' },
    { key: 'jsonPayload', label: 'JSON Payload', kind: 'multiline' },
  ],
} as const;
const required = {
  telegram: ['botAPI', 'chatId'],
  pushbullet: ['accessToken'],
  pushover: ['accessToken', 'userToken'],
  gotify: ['url', 'token'],
  ntfy: ['url', 'topic'],
  apprise: ['url', 'configKey'],
  discord: ['webhookUrl'],
  slack: ['webhookUrl'],
  webhook: ['webhookUrl'],
} as const;

function webhookError(options: Configuration['options'], headers: Header[]) {
  try {
    JSON.parse(String(options.jsonPayload ?? ''));
  } catch {
    return 'Enter a valid JSON payload.';
  }
  if (headers.some(({ key, value }) => !key.trim() !== !value.trim()))
    return 'Enter both a name and value for each custom header.';
  if (
    options.authHeader &&
    headers.some(({ key }) => key.trim().toLowerCase() === 'authorization')
  )
    return 'Use either the Authorization field or a custom Authorization header.';
  return '';
}

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
  const headers = Array.isArray(options.customHeaders)
    ? options.customHeaders
    : [];
  const headerError =
    channel === 'webhook' ? webhookError(options, headers) : '';
  const eventChannel = channel !== 'email' && channel !== 'webpush';
  const sounds = useApi<{ name: string; description: string }[]>(
    channel === 'pushover' && saved.options.accessToken
      ? '/settings/notifications/pushover/sounds'
      : null
  );
  const supportsAuth = channel === 'ntfy' || channel === 'apprise';
  const authMode = options.authMethodUsernamePassword
    ? 'password'
    : options.authMethodToken
      ? 'token'
      : 'none';
  const authValid =
    !supportsAuth ||
    authMode === 'none' ||
    (authMode === 'token'
      ? Boolean(options.token)
      : Boolean(options.username && options.password));
  const priorityValid =
    channel !== 'gotify' ||
    (Number.isInteger(options.priority) &&
      Number(options.priority) >= 0 &&
      Number(options.priority) <= 1000);
  const appriseKeyValid =
    channel !== 'apprise' ||
    /^[A-Za-z0-9_-]{1,64}$/.test(String(options.configKey ?? ''));
  const slackActions =
    channel === 'slack' && options.requestActionsEnabled === true;
  const slackActionsValid =
    !slackActions ||
    Boolean(
      options.workspaceId &&
      options.signingSecret &&
      options.requestManagerMappings
    );
  const valid = eventChannel
    ? authValid &&
      priorityValid &&
      appriseKeyValid &&
      required[channel].every((key) => String(options[key] ?? '').trim())
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
      (!test && (!changed || !slackActionsValid)) ||
      headerError ||
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
          ...(channel === 'webhook'
            ? {
                options: {
                  ...options,
                  customHeaders: headers
                    .map(({ key, value }) => ({
                      key: key.trim(),
                      value: value.trim(),
                    }))
                    .filter(({ key }) => key),
                },
              }
            : {}),
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
        const active =
          channel === 'webhook'
            ? {
                ...updated,
                options: {
                  ...updated.options,
                  jsonPayload: options.jsonPayload,
                },
              }
            : updated;
        setSaved(active);
        setDraft(active);
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
        {[
          ...fields[channel],
          ...(slackActions ? slackActionFields : []),
          ...(supportsAuth && authMode === 'password' ? userFields : []),
          ...(channel === 'ntfy' && authMode === 'token' ? [tokenField] : []),
        ].map(({ key, label, kind }) => {
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
              {kind === 'secret-multiline' || kind === 'multiline' ? (
                <textarea
                  id={id}
                  className={key === 'jsonPayload' ? 'cfg-json' : 'cfg-input'}
                  rows={key === 'jsonPayload' ? 8 : undefined}
                  value={displayed}
                  maxLength={
                    kind === 'secret-multiline' ? 128 * 1024 : undefined
                  }
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
        {channel === 'webhook' && (
          <label className="set cfg-row">
            <span>Support URL Variables</span>
            <input
              type="checkbox"
              disabled={busy}
              checked={options.supportVariables === true}
              onChange={(event) =>
                setOptions({ supportVariables: event.target.checked })
              }
            />
          </label>
        )}
        {channel === 'discord' &&
          (
            [
              ['enableMentions', 'Enable Mentions'],
              ['useUserLocale', 'Use the Recipient’s Locale'],
            ] as const
          ).map(([key, label]) => (
            <label className="set cfg-row" key={key}>
              <span>{label}</span>
              <input
                type="checkbox"
                disabled={busy}
                checked={options[key] === true}
                onChange={(event) =>
                  setOptions({ [key]: event.target.checked })
                }
              />
            </label>
          ))}
        {channel === 'slack' && (
          <label className="set cfg-row">
            <span>Enable Request Approval Actions</span>
            <input
              type="checkbox"
              disabled={busy}
              checked={slackActions}
              onChange={(event) =>
                setOptions({ requestActionsEnabled: event.target.checked })
              }
            />
          </label>
        )}
        {supportsAuth && (
          <label className="set cfg-row">
            <span>Authentication</span>
            <select
              className="cfg-select"
              disabled={busy}
              value={authMode}
              onChange={(event) =>
                setOptions({
                  authMethodUsernamePassword: event.target.value === 'password',
                  ...(channel === 'ntfy'
                    ? { authMethodToken: event.target.value === 'token' }
                    : {}),
                })
              }
            >
              <option value="none">None</option>
              <option value="password">Username and Password</option>
              {channel === 'ntfy' && (
                <option value="token">Access Token</option>
              )}
            </select>
          </label>
        )}
        {channel === 'ntfy' && (
          <label className="set cfg-row">
            <span>Priority</span>
            <select
              className="cfg-select"
              value={Number(options.priority || 3)}
              disabled={busy}
              onChange={(event) =>
                setOptions({ priority: Number(event.target.value) })
              }
            >
              <option value={1}>Minimum</option>
              <option value={2}>Low</option>
              <option value={3}>Default</option>
              <option value={4}>High</option>
              <option value={5}>Urgent</option>
            </select>
          </label>
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
        {channel === 'webhook' && (
          <>
            <p className="note">Custom Headers</p>
            <div className="setlist">
              {headers.map((header, index) => (
                <div key={index} className="set cfg-row">
                  <input
                    className="cfg-input"
                    aria-label={`Header ${index + 1} Name`}
                    placeholder="Header Name"
                    disabled={busy}
                    value={header.key}
                    onChange={(event) =>
                      setOptions({
                        customHeaders: headers.map((item, current) =>
                          current === index
                            ? {
                                key: event.target.value,
                                value:
                                  item.value === redacted ? '' : item.value,
                              }
                            : item
                        ),
                      })
                    }
                  />
                  <input
                    className="cfg-input"
                    type="password"
                    aria-label={`Header ${index + 1} Value`}
                    autoComplete="new-password"
                    maxLength={4096}
                    disabled={busy}
                    placeholder={
                      header.value === redacted ? 'Saved value' : 'Header Value'
                    }
                    value={header.value === redacted ? '' : header.value}
                    onChange={(event) =>
                      setOptions({
                        customHeaders: headers.map((item, current) =>
                          current === index
                            ? { ...item, value: event.target.value }
                            : item
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    disabled={busy}
                    onClick={() =>
                      setOptions({
                        customHeaders: headers.filter(
                          (_, current) => current !== index
                        ),
                      })
                    }
                  >
                    Remove Header {index + 1}
                  </button>
                </div>
              ))}
            </div>
            <div className="toolbar">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy || headers.length >= 20}
                onClick={() =>
                  setOptions({
                    customHeaders: [...headers, { key: '', value: '' }],
                  })
                }
              >
                Add Header
              </button>
            </div>
            {headerError && (
              <p className="note" role="alert">
                {headerError}
              </p>
            )}
          </>
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
      {slackActions && (
        <p className="note">
          Enter one Slack user ID=SeerrNG user ID mapping per line. Each mapped
          user needs request management permission. Select Request awaiting
          approval to include approval actions in notifications.
        </p>
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
            !!headerError ||
            !slackActionsValid ||
            (draft.enabled && (!valid || (eventChannel && !draft.types)))
          }
        >
          Save {titles[channel]}
        </button>
        <button
          className="btn btn-quiet btn-sm"
          type="button"
          disabled={busy || !valid || !!headerError}
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
  const { channel } = useParams();
  const { t } = useLumenLocale();
  const message = (key: string, fallback: string) =>
    t(`lumen.adminNotifications.${key}`, fallback);
  const selected = channels.find((item) => item === channel);
  return (
    <>
      <header className="ph">
        <h1>{message('title', 'Instance Notifications')}</h1>
        <div className="toolbar">
          <Link className="btn btn-quiet btn-sm" to="/me">
            {message('backToAccount', 'Back to Account')}
          </Link>
        </div>
      </header>
      <nav
        className="toolbar"
        aria-label={message('channels', 'Notification Channels')}
      >
        {channel && (
          <Link className="btn btn-quiet btn-sm" to="/admin/notifications">
            {message('allChannels', 'All Channels')}
          </Link>
        )}
        {channels.map((item) => (
          <Link
            key={item}
            className={
              item === selected
                ? 'btn btn-tonal btn-sm'
                : 'btn btn-quiet btn-sm'
            }
            to={`/admin/notifications/${item}`}
            aria-current={item === selected ? 'page' : undefined}
          >
            {titles[item]}
          </Link>
        ))}
      </nav>
      {selected ? (
        <AgentSection key={selected} channel={selected} />
      ) : channel ? (
        <p className="note" role="alert">
          {message('unknownChannel', 'Unknown notification channel.')}
        </p>
      ) : (
        channels.map((item) => <AgentSection key={item} channel={item} />)
      )}
    </>
  );
}

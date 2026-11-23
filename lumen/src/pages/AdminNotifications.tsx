import { useCallback, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { forget } from '../apiCache';
import { EventChoices } from '../components/NotificationEventChoices';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
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
const rootNotificationChannels = new Set<Channel>([
  'email',
  'telegram',
  'discord',
]);
const fieldMessageKeys: Partial<Record<Channel, Record<string, string>>> = {
  email: {
    senderName: 'senderName',
    emailFrom: 'emailsender',
    smtpHost: 'smtpHost',
    smtpPort: 'smtpPort',
    authUser: 'authUser',
    authPass: 'authPass',
    pgpPrivateKey: 'pgpPrivateKey',
    pgpPassword: 'pgpPassword',
  },
  telegram: {
    botAPI: 'botAPI',
    botUsername: 'botUsername',
    chatId: 'chatId',
    messageThreadId: 'messageThreadId',
  },
  pushbullet: { accessToken: 'accessToken', channelTag: 'channelTag' },
  pushover: {
    accessToken: 'accessToken',
    userToken: 'userToken',
    sound: 'sound',
  },
  gotify: {
    url: 'url',
    token: 'token',
    priority: 'priority',
    locale: 'lumen.adminNotifications.notificationLocale',
  },
  ntfy: {
    url: 'url',
    topic: 'topic',
    tags: 'tags',
    locale: 'lumen.adminNotifications.notificationLocale',
    username: 'username',
    password: 'password',
    token: 'token',
  },
  apprise: {
    url: 'url',
    configKey: 'configKey',
    tag: 'tag',
    locale: 'lumen.adminNotifications.notificationLocale',
    username: 'username',
    password: 'password',
  },
  discord: {
    webhookUrl: 'webhookUrl',
    botUsername: 'botUsername',
    botAvatarUrl: 'botAvatarUrl',
    webhookRoleId: 'webhookRoleId',
    webhookThreadId: 'webhookThreadId',
    locale: 'lumen.adminNotifications.notificationLocale',
  },
  slack: {
    webhookUrl: 'webhookUrl',
    workspaceId: 'workspaceId',
    signingSecret: 'signingSecret',
    requestManagerMappings: 'requestManagerMappings',
    locale: 'lumen.adminNotifications.notificationLocale',
  },
  webhook: {
    webhookUrl: 'webhookUrl',
    authHeader: 'authheader',
    jsonPayload: 'customJson',
  },
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

function notificationMessageKey(channel: Channel, key: string) {
  if (rootNotificationChannels.has(channel))
    return `components.Settings.Notifications.${key}`;
  const channelName =
    channel === 'webpush'
      ? 'WebPush'
      : channel[0].toUpperCase() + channel.slice(1);
  return `components.Settings.Notifications.Notifications${channelName}.${key}`;
}

function useAdminNotificationMessage() {
  const { t } = useLumenLocale();
  return useCallback(
    (key: string, fallback: string, values?: Record<string, string | number>) =>
      t(key, fallback, values),
    [t]
  );
}
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
const settingsSavedMessage: Record<Channel, string> = {
  email: 'emailsettingssaved',
  webpush: 'webpushsettingssaved',
  telegram: 'telegramsettingssaved',
  pushbullet: 'pushbulletSettingsSaved',
  pushover: 'pushoversettingssaved',
  gotify: 'gotifysettingssaved',
  ntfy: 'ntfysettingssaved',
  apprise: 'apprisesettingssaved',
  discord: 'discordsettingssaved',
  slack: 'slacksettingssaved',
  webhook: 'webhooksettingssaved',
};
const settingsFailedMessage: Record<Channel, string> = {
  email: 'emailsettingsfailed',
  webpush: 'webpushsettingsfailed',
  telegram: 'telegramsettingsfailed',
  pushbullet: 'pushbulletSettingsFailed',
  pushover: 'pushoversettingsfailed',
  gotify: 'gotifysettingsfailed',
  ntfy: 'ntfysettingsfailed',
  apprise: 'apprisesettingsfailed',
  discord: 'discordsettingsfailed',
  slack: 'slacksettingsfailed',
  webhook: 'webhooksettingsfailed',
};
const testSuccessMessage: Record<Channel, string> = {
  email: 'toastEmailTestSuccess',
  webpush: 'toastWebPushTestSuccess',
  telegram: 'toastTelegramTestSuccess',
  pushbullet: 'toastPushbulletTestSuccess',
  pushover: 'toastPushoverTestSuccess',
  gotify: 'toastGotifyTestSuccess',
  ntfy: 'toastNtfyTestSuccess',
  apprise: 'toastAppriseTestSuccess',
  discord: 'toastDiscordTestSuccess',
  slack: 'toastSlackTestSuccess',
  webhook: 'toastWebhookTestSuccess',
};
const testFailedMessage: Record<Channel, string> = {
  email: 'toastEmailTestFailed',
  webpush: 'toastWebPushTestFailed',
  telegram: 'toastTelegramTestFailed',
  pushbullet: 'toastPushbulletTestFailed',
  pushover: 'toastPushoverTestFailed',
  gotify: 'toastGotifyTestFailed',
  ntfy: 'toastNtfyTestFailed',
  apprise: 'toastAppriseTestFailed',
  discord: 'toastDiscordTestFailed',
  slack: 'toastSlackTestFailed',
  webhook: 'toastWebhookTestFailed',
};

function webhookError(
  options: Configuration['options'],
  headers: Header[],
  message: (key: string, fallback: string) => string
) {
  try {
    JSON.parse(String(options.jsonPayload ?? ''));
  } catch {
    return message(
      'lumen.adminNotifications.validJson',
      'Enter a valid JSON payload.'
    );
  }
  if (headers.some(({ key, value }) => !key.trim() !== !value.trim()))
    return message(
      notificationMessageKey('webhook', 'customHeadersIncomplete'),
      'Enter both a name and value for each custom header.'
    );
  if (
    options.authHeader &&
    headers.some(({ key }) => key.trim().toLowerCase() === 'authorization')
  )
    return message(
      notificationMessageKey('webhook', 'customHeadersAuthConflict'),
      'Use either the Authorization field or a custom Authorization header.'
    );
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
  const n = useAdminNotificationMessage();
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
    channel === 'webhook' ? webhookError(options, headers, n) : '';
  const eventChannel = channel !== 'email' && channel !== 'webpush';
  const formatError = useCallback(
    (error: unknown, fallback: string) => friendlyError(error, fallback, n),
    [n]
  );
  const sounds = useApi<{ name: string; description: string }[]>(
    channel === 'pushover' && saved.options.accessToken
      ? '/settings/notifications/pushover/sounds'
      : null,
    { formatError }
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
          setNotice(
            n(
              notificationMessageKey(channel, testSuccessMessage[channel]),
              'Test notification sent.'
            )
          );
      } else {
        const submitted = JSON.parse(String(request.body)) as Configuration;
        const updated = await api<Configuration>(endpoint, request);
        if (generation !== sessionGeneration()) return;
        const readback = await api<Configuration>(endpoint);
        if (generation !== sessionGeneration()) return;
        const secretOptions = new Set([
          'accessToken',
          'authHeader',
          'authPass',
          'botAPI',
          'password',
          'pgpPassword',
          'pgpPrivateKey',
          'signingSecret',
          'token',
          'userToken',
          'webhookUrl',
        ]);
        const optionsMatch = (actual: Configuration['options']) =>
          Object.entries(submitted.options).every(([key, expected]) => {
            if (channel === 'webhook' && key === 'jsonPayload') return true;
            const received = actual[key];
            if (key === 'customHeaders' && Array.isArray(expected)) {
              return (
                Array.isArray(received) &&
                received.length === expected.length &&
                expected.every((header, index) => {
                  const current = received[index];
                  return (
                    current?.key === header.key &&
                    (header.value === redacted
                      ? current.value === redacted
                      : header.value
                        ? Boolean(current.value)
                        : current.value === '')
                  );
                })
              );
            }
            if (secretOptions.has(key))
              return expected === redacted
                ? received === redacted
                : expected
                  ? received === redacted || received === expected
                  : received === '';
            return JSON.stringify(received) === JSON.stringify(expected);
          });
        const matches = (value: Configuration) =>
          value.enabled === submitted.enabled &&
          value.embedPoster === submitted.embedPoster &&
          (!eventChannel || value.types === submitted.types) &&
          optionsMatch(value.options);
        if (!matches(updated) || !matches(readback)) {
          setFailure(
            n(
              notificationMessageKey(channel, settingsFailedMessage[channel]),
              'Could not save notification settings. Try again.'
            )
          );
          return;
        }
        const active =
          channel === 'webhook'
            ? {
                ...readback,
                options: {
                  ...readback.options,
                  jsonPayload: options.jsonPayload,
                },
              }
            : readback;
        setSaved(active);
        setDraft(active);
        if (
          channel === 'pushover' &&
          draft.options.accessToken !== saved.options.accessToken
        )
          sounds.reload();
        invalidatePublicSettings();
        forget('/settings/public');
        setNotice(
          n(
            notificationMessageKey(channel, settingsSavedMessage[channel]),
            'Notification settings saved.'
          )
        );
      }
    } catch {
      if (generation === sessionGeneration())
        setFailure(
          n(
            notificationMessageKey(
              channel,
              test ? testFailedMessage[channel] : settingsFailedMessage[channel]
            ),
            test
              ? 'Could not send the test notification. Check the settings and try again.'
              : 'Could not save notification settings. Try again.'
          )
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
            <span>
              {n(
                `components.Settings.Notifications.${key === 'enabled' ? 'agentenabled' : 'embedPoster'}`,
                label
              )}
            </span>
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
          const labelKey = fieldMessageKeys[channel]?.[key];
          const localizedLabel = labelKey
            ? n(
                labelKey.startsWith('lumen.') ||
                  labelKey.startsWith('components.')
                  ? labelKey
                  : notificationMessageKey(channel, labelKey),
                label
              )
            : label;
          const displayed =
            secret && value === redacted ? '' : String(value ?? '');
          return (
            <div className="set cfg-row" key={key}>
              <span>
                <label htmlFor={id}>{localizedLabel}</label>
                {configured && (
                  <small>
                    {n(
                      'lumen.adminNotifications.credentialSaved',
                      'Credential saved. Enter a replacement or clear it.'
                    )}
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
                  {n('lumen.adminNotifications.clearField', 'Clear {field}', {
                    field: localizedLabel,
                  })}
                </button>
              )}
            </div>
          );
        })}
        {channel === 'email' && (
          <>
            <label className="set cfg-row">
              <span>
                {n(
                  'components.Settings.Notifications.encryption',
                  'SMTP Encryption'
                )}
              </span>
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
                <option value="default">
                  {n(
                    'components.Settings.Notifications.encryptionDefault',
                    'Automatic'
                  )}
                </option>
                <option value="implicit">
                  {n(
                    'components.Settings.Notifications.encryptionImplicitTls',
                    'Implicit TLS'
                  )}
                </option>
                <option value="required">
                  {n(
                    'components.Settings.Notifications.encryptionOpportunisticTls',
                    'Require STARTTLS'
                  )}
                </option>
                <option value="none">
                  {n(
                    'components.Settings.Notifications.encryptionNone',
                    'None'
                  )}
                </option>
              </select>
            </label>
            {emailSwitches.map(([key, label]) => (
              <label className="set cfg-row" key={key}>
                <span>
                  {n(
                    `components.Settings.Notifications.${
                      {
                        userEmailRequired: 'userEmailRequired',
                        usePublicLogo: 'usePublicLogo',
                        allowSelfSigned: 'allowselfsigned',
                      }[key]
                    }`,
                    label
                  )}
                </span>
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
            <span>
              {n(
                notificationMessageKey('webhook', 'supportVariables'),
                'Support URL Variables'
              )}
            </span>
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
              <span>
                {n(
                  notificationMessageKey(
                    'discord',
                    key === 'enableMentions' ? key : 'useUserLocale'
                  ),
                  label
                )}
              </span>
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
            <span>
              {n(
                notificationMessageKey('slack', 'requestActionsEnabled'),
                'Enable Request Approval Actions'
              )}
            </span>
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
            <span>
              {n('lumen.adminNotifications.authentication', 'Authentication')}
            </span>
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
              <option value="none">
                {n('lumen.adminNotifications.none', 'None')}
              </option>
              <option value="password">
                {n(
                  notificationMessageKey(channel, 'usernamePasswordAuth'),
                  'Username and Password'
                )}
              </option>
              {channel === 'ntfy' && (
                <option value="token">
                  {n(
                    notificationMessageKey(channel, 'tokenAuth'),
                    'Access Token'
                  )}
                </option>
              )}
            </select>
          </label>
        )}
        {channel === 'ntfy' && (
          <label className="set cfg-row">
            <span>
              {n(notificationMessageKey('ntfy', 'priority'), 'Priority')}
            </span>
            <select
              className="cfg-select"
              value={Number(options.priority || 3)}
              disabled={busy}
              onChange={(event) =>
                setOptions({ priority: Number(event.target.value) })
              }
            >
              <option value={1}>
                {n(
                  notificationMessageKey('ntfy', 'priorityMinimum'),
                  'Minimum'
                )}
              </option>
              <option value={2}>
                {n(notificationMessageKey('ntfy', 'priorityLow'), 'Low')}
              </option>
              <option value={3}>
                {n(
                  notificationMessageKey('ntfy', 'priorityDefault'),
                  'Default'
                )}
              </option>
              <option value={4}>
                {n(notificationMessageKey('ntfy', 'priorityHigh'), 'High')}
              </option>
              <option value={5}>
                {n(notificationMessageKey('ntfy', 'priorityUrgent'), 'Urgent')}
              </option>
            </select>
          </label>
        )}
        {channel === 'telegram' && (
          <label className="set cfg-row">
            <span>
              {n(
                'components.Settings.Notifications.sendSilently',
                'Send Silently'
              )}
            </span>
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
            <p className="note">
              {n(
                notificationMessageKey('webhook', 'customHeaders'),
                'Custom Headers'
              )}
            </p>
            <div className="setlist">
              {headers.map((header, index) => (
                <div key={index} className="set cfg-row">
                  <input
                    className="cfg-input"
                    aria-label={n(
                      'lumen.adminNotifications.headerName',
                      'Header {number} Name',
                      { number: index + 1 }
                    )}
                    placeholder={n(
                      notificationMessageKey('webhook', 'customHeadersKey'),
                      'Header Name'
                    )}
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
                    aria-label={n(
                      'lumen.adminNotifications.headerValue',
                      'Header {number} Value',
                      { number: index + 1 }
                    )}
                    autoComplete="new-password"
                    maxLength={4096}
                    disabled={busy}
                    placeholder={
                      header.value === redacted
                        ? n(
                            'lumen.adminNotifications.savedValue',
                            'Saved value'
                          )
                        : n(
                            notificationMessageKey(
                              'webhook',
                              'customHeadersValue'
                            ),
                            'Header Value'
                          )
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
                    {n(
                      'components.Settings.Notifications.NotificationsWebhook.customHeadersRemove',
                      'Remove'
                    )}{' '}
                    {index + 1}
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
                {n(
                  notificationMessageKey('webhook', 'customHeadersAdd'),
                  'Add Header'
                )}
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
            <span>
              {n(
                notificationMessageKey('pushover', 'sound'),
                'Notification Sound'
              )}
            </span>
            <select
              className="cfg-select"
              value={String(options.sound ?? '')}
              disabled={busy}
              onChange={(event) => setOptions({ sound: event.target.value })}
            >
              <option value="">
                {n(
                  notificationMessageKey('pushover', 'deviceDefault'),
                  'Device Default'
                )}
              </option>
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
          title={n(
            'lumen.adminNotifications.loadPushoverSoundsFailure',
            'Could not load Pushover sounds.'
          )}
          retryLabel={n('lumen.adminNotifications.retry', 'Retry')}
          retry={sounds.reload}
        />
      )}
      {eventChannel && (
        <>
          <p className="note">
            {n(
              'lumen.adminNotifications.notificationEvents',
              'Notification Events'
            )}
          </p>
          <EventChoices
            mask={draft.types ?? 0}
            disabled={busy}
            change={(types) => update({ ...draft, types })}
          />
          {draft.enabled && !draft.types && (
            <p className="note">
              {n(
                notificationMessageKey(channel, 'validationTypes'),
                'Select at least one notification event.'
              )}
            </p>
          )}
          {!valid && (
            <p className="note">
              {n(
                'lumen.adminNotifications.channelCredentialsRequired',
                'Set the channel credentials and destination before enabling or testing notifications.'
              )}
            </p>
          )}
        </>
      )}
      {slackActions && (
        <p className="note">
          {n(
            notificationMessageKey('slack', 'requestManagerMappingsTip'),
            'Enter one Slack user ID=SeerrNG user ID mapping per line. Each mapped user needs request management permission. Select Request awaiting approval to include approval actions in notifications.'
          )}
        </p>
      )}
      {!valid && channel === 'email' && (
        <p className="note">
          {n(
            'components.Settings.Notifications.validationEmail',
            'Enter a sender name and email, SMTP host, and port to enable or test email.'
          )}
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
          {n('lumen.adminNotifications.saveChannel', 'Save {channel}', {
            channel: titles[channel],
          })}
        </button>
        <button
          className="btn btn-quiet btn-sm"
          type="button"
          disabled={busy || !valid || !!headerError}
          onClick={() => void submit(true)}
        >
          {n('lumen.adminNotifications.sendTest', 'Send {channel} Test', {
            channel: titles[channel],
          })}
        </button>
      </div>
    </form>
  );
}

function AgentSection({ channel }: { channel: Channel }) {
  const n = useAdminNotificationMessage();
  const endpoint = `/settings/notifications/${channel}`;
  const formatError = useCallback(
    (error: unknown, fallback: string) => friendlyError(error, fallback, n),
    [n]
  );
  const { data, error, reload } = useApi<Configuration>(endpoint, {
    formatError,
  });
  return (
    <Section title={titles[channel]} id={channel}>
      {channel === 'webpush' && (
        <p className="note">
          {n(
            'lumen.adminNotifications.testDeliveryWebPush',
            'Test delivery requires a browser subscribed to Web Push on your account.'
          )}
        </p>
      )}
      <ServiceNote
        error={error}
        what={`${titles[channel]} settings`}
        title={n(
          'lumen.adminNotifications.loadChannelFailure',
          'Could not load {channel} settings.',
          { channel: titles[channel] }
        )}
        retryLabel={n('lumen.adminNotifications.retry', 'Retry')}
        retry={reload}
      />
      {data ? (
        <AgentForm channel={channel} endpoint={endpoint} initial={data} />
      ) : (
        !error && (
          <p className="note" role="status">
            {n('components.Persius.loading', 'Loading settings…')}
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
          <Link className="btn btn-quiet btn-sm" to="/admin">
            {t('lumen.nav.administration', 'Administration')}
          </Link>
        </div>
      </header>
      <nav
        className="chips wrap"
        aria-label={message('channels', 'Notification Channels')}
      >
        <Link
          className="chip"
          to="/admin/notifications"
          aria-current={!channel ? 'page' : undefined}
        >
          {message('allChannels', 'All Channels')}
        </Link>
        {channels.map((item) => (
          <Link
            key={item}
            className="chip"
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
        <Section title={message('channels', 'Channels')}>
          <div className="setlist">
            {channels.map((item) => (
              <div className="set" key={item}>
                <b>{titles[item]}</b>
                <Link
                  className="go"
                  to={`/admin/notifications/${item}`}
                  aria-label={`${t('lumen.admin.open', 'Open')} ${titles[item]}`}
                >
                  {t('lumen.admin.open', 'Open')} <Icon name="chev" size="sm" />
                </Link>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

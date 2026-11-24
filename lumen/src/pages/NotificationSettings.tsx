import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { forget } from '../apiCache';
import { useAuth } from '../auth';
import {
  defaultMask,
  EventChoices,
} from '../components/NotificationEventChoices';
import { PushDevices } from '../components/PushDevices';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';

const notificationMessagePrefix =
  'components.UserProfile.UserSettings.UserNotificationSettings.';

function useNotificationMessage() {
  const { t } = useLumenLocale();
  return (
    key: string,
    fallback: string,
    values?: Record<string, string | number>
  ) =>
    t(
      key.startsWith('lumen.') ? key : `${notificationMessagePrefix}${key}`,
      fallback,
      values
    );
}

interface Preferences {
  emailEnabled?: boolean;
  webPushEnabled?: boolean;
  pgpKey?: string | null;
  pushoverApplicationToken?: string | null;
  pushoverUserKey?: string | null;
  pushoverSound?: string | null;
  pushbulletAccessToken?: string | null;
  discordEnabled?: boolean;
  discordEnabledTypes?: number;
  discordIds?: string[];
  telegramEnabled?: boolean;
  telegramBotUsername?: string;
  telegramChatId?: string | null;
  telegramMessageThreadId?: string | null;
  telegramSendSilently?: boolean | null;
  notificationTypes: {
    email?: number;
    telegram?: number;
    discord?: number;
    pushbullet?: number;
    pushover?: number;
    webpush?: number;
  };
}

function EventForm({
  path,
  mask,
  channel,
  label,
}: {
  path: string;
  mask: number;
  channel: 'email' | 'webpush';
  label: string;
}) {
  const n = useNotificationMessage();
  const [saved, setSaved] = useState(mask);
  const [draft, setDraft] = useState(mask);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);

  async function save() {
    if (pending.current || draft === saved) return;
    pending.current = true;
    setBusy(true);
    setNotice('');
    setError('');
    const generation = sessionGeneration();
    try {
      await api<Preferences>(path, {
        method: 'POST',
        body: JSON.stringify({ notificationTypes: { [channel]: draft } }),
      });
      if (generation !== sessionGeneration()) return;
      const readback = await api<Preferences>(path, { cache: 'no-store' });
      if (generation !== sessionGeneration()) return;
      if (readback.notificationTypes?.[channel] !== draft) {
        setError(
          n(
            `${channel}settingsfailed`,
            'Could not confirm the saved preferences. Try again.'
          )
        );
        return;
      }
      forget(path);
      setSaved(draft);
      setNotice(n(`${channel}settingssaved`, `${label} preferences saved.`));
    } catch {
      if (generation === sessionGeneration())
        setError(
          n(
            `${channel}settingsfailed`,
            `Could not save ${label} preferences. Try again.`
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
        void save();
      }}
    >
      <p className="note">
        {n(
          'lumen.notifications.chooseEvents',
          'Choose which events send notifications.'
        )}
      </p>
      <EventChoices mask={draft} disabled={busy} change={setDraft} />
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      <div className="toolbar">
        <button className="btn btn-tonal" disabled={busy || draft === saved}>
          {busy
            ? n('lumen.notifications.saving', 'Saving…')
            : n(
                'lumen.notifications.savePreferences',
                'Save {label} Preferences',
                { label }
              )}
        </button>
      </div>
    </form>
  );
}

function OpenPgpForm({
  path,
  configured,
}: {
  path: string;
  configured: boolean;
}) {
  const n = useNotificationMessage();
  const [draft, setDraft] = useState('');
  const [hasKey, setHasKey] = useState(configured);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const key = draft.trim();

  async function save(value: string | null) {
    if (pending.current) return;
    setNotice('');
    if (value !== null) {
      const lines = value.split(/\r?\n/);
      if (
        lines[0] !== '-----BEGIN PGP PUBLIC KEY BLOCK-----' ||
        lines.at(-1) !== '-----END PGP PUBLIC KEY BLOCK-----' ||
        !lines.slice(1, -1).some((line) => line.trim()) ||
        // nosemgrep: generic.secrets.security.detected-pgp-private-key-block.detected-pgp-private-key-block -- the armor header identifies private-key input for rejection
        value.includes('-----BEGIN PGP PRIVATE KEY BLOCK-----')
      ) {
        setError(
          n('validationPgpPublicKey', 'Paste an armored OpenPGP public key.')
        );
        return;
      }
    }
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await api<Preferences>(path, {
        method: 'POST',
        body: JSON.stringify({ pgpKey: value }),
      });
      if (generation !== sessionGeneration()) return;
      const readback = await api<Preferences>(path, { cache: 'no-store' });
      if (generation !== sessionGeneration()) return;
      if (
        value === null
          ? readback.pgpKey !== null
          : readback.pgpKey !== value && readback.pgpKey !== '[REDACTED]'
      ) {
        setError(
          n(
            'lumen.notifications.confirmPublicKeyFailure',
            'Could not confirm the saved key. Reload settings and try again.'
          )
        );
        return;
      }
      forget(path);
      setHasKey(value !== null);
      setConfirmRemove(false);
      setDraft('');
      setNotice(
        value === null
          ? n('lumen.notifications.publicKeyRemoved', 'Public key removed.')
          : n('lumen.notifications.publicKeySaved', 'Public key saved.')
      );
    } catch {
      if (generation === sessionGeneration())
        setError(
          n(
            'lumen.notifications.publicKeySaveFailure',
            'Could not save the public key. Try again.'
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
        if (key && !confirmRemove) void save(key);
      }}
    >
      <p className="note">
        {hasKey
          ? n(
              'lumen.notifications.publicKeyConfigured',
              'A public key is configured for notification email.'
            )
          : n(
              'lumen.notifications.addPublicKey',
              'Add a public key to encrypt notification email.'
            )}
      </p>
      <label>
        <span className="note">
          {hasKey
            ? n(
                'lumen.notifications.replacementPublicKey',
                'Replacement OpenPGP Public Key'
              )
            : n('pgpPublicKey', 'OpenPGP Public Key')}
        </span>
        <textarea
          className="cfg-json"
          rows={5}
          maxLength={65536}
          autoComplete="off"
          spellCheck={false}
          disabled={busy || confirmRemove}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {confirmRemove && (
        <p className="note">
          {n(
            'lumen.notifications.confirmRemovePublicKey',
            'Remove the key and turn off OpenPGP encryption for your notifications?'
          )}
        </p>
      )}
      <div className="toolbar">
        {confirmRemove ? (
          <>
            <button
              className="btn btn-tonal"
              type="button"
              disabled={busy}
              onClick={() => void save(null)}
            >
              {n('lumen.notifications.confirmRemoveKey', 'Confirm Remove Key')}
            </button>
            <button
              className="btn btn-quiet"
              type="button"
              disabled={busy}
              onClick={() => setConfirmRemove(false)}
            >
              {n('lumen.notifications.keepKey', 'Keep Key')}
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-tonal" disabled={busy || !key}>
              {n('lumen.notifications.savePublicKey', 'Save Public Key')}
            </button>
            {hasKey && (
              <button
                className="btn btn-quiet"
                type="button"
                disabled={busy}
                onClick={() => setConfirmRemove(true)}
              >
                {n('lumen.notifications.removePublicKey', 'Remove Public Key')}
              </button>
            )}
          </>
        )}
      </div>
    </form>
  );
}

function telegramValues(data: Preferences) {
  return {
    chatId: data.telegramChatId ?? '',
    threadId: data.telegramMessageThreadId ?? '',
    silent: data.telegramSendSilently === true,
    mask: data.notificationTypes?.telegram ?? 0,
  };
}

function TelegramForm({ path, data }: { path: string; data: Preferences }) {
  const n = useNotificationMessage();
  const [saved, setSaved] = useState(() => telegramValues(data));
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const chatId = draft.chatId.trim();
  const threadId = draft.threadId.trim();
  const changed =
    chatId !== saved.chatId ||
    threadId !== saved.threadId ||
    draft.silent !== saved.silent ||
    draft.mask !== saved.mask;

  async function save() {
    if (pending.current || !changed) return;
    setNotice('');
    if ((chatId || draft.mask !== 0) && !/^-?\d+$/.test(chatId)) {
      setError(
        n('validationTelegramChatId', 'Enter a numeric Telegram chat ID.')
      );
      return;
    }
    if (threadId && !/^\d+$/.test(threadId)) {
      setError(
        n(
          'validationTelegramMessageThreadId',
          'Enter a numeric topic ID or leave it blank.'
        )
      );
      return;
    }
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await api<Preferences>(path, {
        method: 'POST',
        body: JSON.stringify({
          telegramChatId: chatId || null,
          telegramMessageThreadId: threadId || null,
          telegramSendSilently: draft.silent,
          notificationTypes: { telegram: draft.mask },
        }),
      });
      if (generation !== sessionGeneration()) return;
      const readback = await api<Preferences>(path, { cache: 'no-store' });
      if (generation !== sessionGeneration()) return;
      const confirmed = telegramValues(readback);
      if (
        confirmed.chatId !== chatId ||
        confirmed.threadId !== threadId ||
        confirmed.silent !== draft.silent ||
        readback.notificationTypes?.telegram !== draft.mask
      ) {
        setError(
          n(
            'telegramsettingsfailed',
            'Could not confirm the saved Telegram settings. Try again.'
          )
        );
        return;
      }
      forget(path);
      setSaved(confirmed);
      setDraft(confirmed);
      setNotice(n('telegramsettingssaved', 'Telegram settings saved.'));
    } catch {
      if (generation === sessionGeneration())
        setError(
          n(
            'telegramsettingsfailed',
            'Could not save Telegram settings. Try again.'
          )
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const bot = data.telegramBotUsername;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <p className="note">
        {n(
          'lumen.notifications.telegramStartChat',
          'Start a conversation with the configured Telegram bot before enabling notifications.'
        )}
        {bot && /^[A-Za-z0-9_]+$/.test(bot) && (
          <>
            {' '}
            <a
              className="go"
              href={`https://t.me/${bot}`}
              target="_blank"
              rel="noreferrer"
            >
              {n('lumen.notifications.openBot', 'Open @{bot}', { bot })}
            </a>
          </>
        )}
      </p>
      <div className="setlist">
        <label className="set cfg-row">
          <b>{n('telegramChatId', 'Chat ID')}</b>
          <input
            className="cfg-input"
            type="text"
            maxLength={128}
            value={draft.chatId}
            disabled={busy}
            onChange={(event) =>
              setDraft({ ...draft, chatId: event.target.value })
            }
          />
        </label>
        <label className="set cfg-row">
          <span>
            <b>{n('telegramMessageThreadId', 'Topic ID')}</b>
            <small>
              {n(
                'lumen.notifications.optionalForumTopic',
                'Optional for forum topics.'
              )}
            </small>
          </span>
          <input
            className="cfg-input"
            type="text"
            inputMode="numeric"
            aria-label={n('telegramMessageThreadId', 'Topic ID')}
            maxLength={128}
            value={draft.threadId}
            disabled={busy}
            onChange={(event) =>
              setDraft({ ...draft, threadId: event.target.value })
            }
          />
        </label>
        <label className="set cfg-row">
          <b>{n('sendSilently', 'Send Silently')}</b>
          <input
            type="checkbox"
            checked={draft.silent}
            disabled={busy}
            onChange={(event) =>
              setDraft({ ...draft, silent: event.target.checked })
            }
          />
        </label>
      </div>
      <p className="note">
        {n(
          'lumen.notifications.telegramEvents',
          'Choose the events to send to Telegram.'
        )}
      </p>
      <EventChoices
        mask={draft.mask}
        disabled={busy}
        change={(mask) => setDraft({ ...draft, mask })}
      />
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      <div className="toolbar">
        <button className="btn btn-tonal" disabled={busy || !changed}>
          {busy
            ? n('lumen.notifications.saving', 'Saving…')
            : n('lumen.notifications.saveTelegram', 'Save Telegram Settings')}
        </button>
      </div>
    </form>
  );
}

function DiscordForm({ path, data }: { path: string; data: Preferences }) {
  const n = useNotificationMessage();
  const enabledMask = data.discordEnabledTypes ?? 0;
  const [saved, setSaved] = useState(() => ({
    ids: (data.discordIds ?? []).join('\n'),
    mask: (data.notificationTypes?.discord ?? 0) & enabledMask,
  }));
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const ids = draft.ids
    .split(/\r?\n/)
    .map((id) => id.trim())
    .filter(Boolean);
  const normalizedIds = ids.join('\n');
  const changed = normalizedIds !== saved.ids || draft.mask !== saved.mask;

  async function save() {
    if (pending.current || !changed) return;
    setNotice('');
    if (
      ids.length > 10 ||
      ids.some(
        (id) =>
          !/^[1-9]\d{0,19}$/.test(id) ||
          BigInt(id) > 18_446_744_073_709_551_615n
      )
    ) {
      setError(
        n(
          'lumen.notifications.discordIdLimit',
          'Enter up to ten valid Discord user IDs, one per line.'
        )
      );
      return;
    }
    if (draft.mask && !ids.length) {
      setError(
        n(
          'lumen.notifications.discordIdRequired',
          'Enter at least one Discord user ID to receive mentions.'
        )
      );
      return;
    }
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await api<Preferences>(path, {
        method: 'POST',
        body: JSON.stringify({
          discordIds: ids,
          notificationTypes: { discord: draft.mask },
        }),
      });
      if (generation !== sessionGeneration()) return;
      const readback = await api<Preferences>(path, { cache: 'no-store' });
      if (generation !== sessionGeneration()) return;
      if (
        readback.discordIds?.join('\n') !== normalizedIds ||
        readback.notificationTypes?.discord !== draft.mask
      ) {
        setError(
          n(
            'discordsettingsfailed',
            'Could not confirm the saved Discord settings. Try again.'
          )
        );
        return;
      }
      forget(path);
      const confirmed = { ids: normalizedIds, mask: draft.mask };
      setSaved(confirmed);
      setDraft(confirmed);
      setNotice(n('discordsettingssaved', 'Discord settings saved.'));
    } catch {
      if (generation === sessionGeneration())
        setError(
          n(
            'discordsettingsfailed',
            'Could not save Discord settings. Try again.'
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
        void save();
      }}
    >
      <label>
        <span className="note">{n('discordId', 'Discord User IDs')}</span>
        <textarea
          className="cfg-json"
          rows={4}
          maxLength={256}
          spellCheck={false}
          disabled={busy}
          value={draft.ids}
          onChange={(event) => setDraft({ ...draft, ids: event.target.value })}
        />
      </label>
      <p className="note">
        {n(
          'lumen.notifications.discordIdTip',
          'Enter one user ID per line. The server controls which events can send mentions.'
        )}
      </p>
      {enabledMask !== 0 && (
        <EventChoices
          mask={draft.mask}
          enabledMask={enabledMask}
          disabled={busy}
          change={(mask) => setDraft({ ...draft, mask })}
        />
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      <div className="toolbar">
        <button className="btn btn-tonal" disabled={busy || !changed}>
          {busy
            ? n('lumen.notifications.saving', 'Saving…')
            : n('lumen.notifications.saveDiscord', 'Save Discord Settings')}
        </button>
      </div>
    </form>
  );
}

function PushbulletForm({ path, data }: { path: string; data: Preferences }) {
  const n = useNotificationMessage();
  const [configured, setConfigured] = useState(!!data.pushbulletAccessToken);
  const [saved, setSaved] = useState(data.notificationTypes?.pushbullet ?? 0);
  const [mask, setMask] = useState(saved);
  const [token, setToken] = useState('');
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const replacement = token.trim();
  const changed = remove || !!replacement || mask !== saved;

  async function save() {
    if (pending.current || !changed) return;
    setNotice('');
    if (
      !remove &&
      (replacement === '[REDACTED]' || (mask && !configured && !replacement))
    ) {
      setError(
        n(
          'validationPushbulletAccessToken',
          'Enter a Pushbullet access token to enable notification events.'
        )
      );
      return;
    }
    const generation = sessionGeneration();
    const nextMask = remove ? 0 : mask;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await api<Preferences>(path, {
        method: 'POST',
        body: JSON.stringify({
          notificationTypes: { pushbullet: nextMask },
          ...(remove
            ? { pushbulletAccessToken: null }
            : replacement
              ? { pushbulletAccessToken: replacement }
              : {}),
        }),
      });
      if (generation !== sessionGeneration()) return;
      const readback = await api<Preferences>(path, { cache: 'no-store' });
      if (generation !== sessionGeneration()) return;
      const expectedConfigured = !remove && (configured || !!replacement);
      if (
        readback.notificationTypes?.pushbullet !== nextMask ||
        !!readback.pushbulletAccessToken !== expectedConfigured
      ) {
        setError(
          n(
            'pushbulletsettingsfailed',
            'Could not confirm the saved Pushbullet settings. Reload settings and try again.'
          )
        );
        return;
      }
      forget(path);
      setConfigured(expectedConfigured);
      setSaved(nextMask);
      setMask(nextMask);
      setToken('');
      setRemove(false);
      setNotice(n('pushbulletsettingssaved', 'Pushbullet settings saved.'));
    } catch {
      if (generation === sessionGeneration())
        setError(
          n(
            'pushbulletsettingsfailed',
            'Could not save Pushbullet settings. Try again.'
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
        void save();
      }}
    >
      <div className="setlist">
        <label className="set cfg-row">
          <b>
            {configured
              ? n(
                  'lumen.notifications.replacementAccessToken',
                  'Replacement Access Token'
                )
              : n('pushbulletAccessToken', 'Access Token')}
          </b>
          <input
            className="cfg-input"
            type="password"
            autoComplete="new-password"
            maxLength={512}
            value={token}
            disabled={busy || remove}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
        {configured && (
          <label className="set cfg-row">
            <b>
              {n(
                'lumen.notifications.removePushbulletToken',
                'Remove Token and Disable Pushbullet Events'
              )}
            </b>
            <input
              type="checkbox"
              checked={remove}
              disabled={busy}
              onChange={(event) => setRemove(event.target.checked)}
            />
          </label>
        )}
      </div>
      {configured && (
        <p className="note">
          {n(
            'lumen.notifications.keepPushbulletToken',
            'An access token is configured. Leave the replacement field empty to keep it.'
          )}
        </p>
      )}
      <EventChoices
        mask={remove ? 0 : mask}
        disabled={busy || remove}
        change={setMask}
      />
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      <div className="toolbar">
        <button className="btn btn-tonal" disabled={busy || !changed}>
          {busy
            ? n('lumen.notifications.saving', 'Saving…')
            : n(
                'lumen.notifications.savePushbullet',
                'Save Pushbullet Settings'
              )}
        </button>
      </div>
    </form>
  );
}

function PushoverForm({
  path,
  id,
  data,
}: {
  path: string;
  id: number;
  data: Preferences;
}) {
  const n = useNotificationMessage();
  const [saved, setSaved] = useState(() => ({
    application: !!data.pushoverApplicationToken,
    user: !!data.pushoverUserKey,
    sound: data.pushoverSound ?? '',
    mask: data.notificationTypes?.pushover ?? 0,
  }));
  const [draft, setDraft] = useState({
    application: '',
    user: '',
    sound: saved.sound,
    mask: saved.mask,
  });
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const soundPath = saved.application
    ? `/settings/notifications/pushover/sounds?userId=${id}`
    : null;
  const sounds = useApi<{ name: string; description: string }[]>(soundPath);
  const application = draft.application.trim();
  const userKey = draft.user.trim();
  const changed =
    remove ||
    application ||
    userKey ||
    draft.sound !== saved.sound ||
    draft.mask !== saved.mask;

  async function save() {
    if (pending.current || !changed) return;
    setNotice('');
    if (
      !remove &&
      ([application, userKey].some(
        (value) => value && !/^[a-z0-9]{30}$/i.test(value)
      ) ||
        (draft.mask !== 0 && !(saved.application || application)) ||
        (draft.mask !== 0 && !(saved.user || userKey)))
    ) {
      setError(
        n(
          'lumen.notifications.validationPushoverCredentials',
          'Enter a 30-character application token and user or group key to enable Pushover events.'
        )
      );
      return;
    }
    const generation = sessionGeneration();
    const next = {
      application: !remove && (saved.application || !!application),
      user: !remove && (saved.user || !!userKey),
      sound: remove ? '' : draft.sound,
      mask: remove ? 0 : draft.mask,
    };
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await api<Preferences>(path, {
        method: 'POST',
        body: JSON.stringify({
          ...(remove || application
            ? { pushoverApplicationToken: remove ? null : application }
            : {}),
          ...(remove || userKey
            ? { pushoverUserKey: remove ? null : userKey }
            : {}),
          pushoverSound: next.sound || null,
          notificationTypes: { pushover: next.mask },
        }),
      });
      if (generation !== sessionGeneration()) return;
      const readback = await api<Preferences>(path, { cache: 'no-store' });
      if (generation !== sessionGeneration()) return;
      if (
        !!readback.pushoverApplicationToken !== next.application ||
        !!readback.pushoverUserKey !== next.user ||
        (readback.pushoverSound ?? '') !== next.sound ||
        readback.notificationTypes?.pushover !== next.mask
      ) {
        setError(
          n(
            'pushoversettingsfailed',
            'Could not confirm the saved Pushover settings. Try again.'
          )
        );
        return;
      }
      forget(path);
      setSaved(next);
      setDraft({
        application: '',
        user: '',
        sound: next.sound,
        mask: next.mask,
      });
      setRemove(false);
      if (application && soundPath) sounds.reload();
      setNotice(n('pushoversettingssaved', 'Pushover settings saved.'));
    } catch {
      if (generation === sessionGeneration())
        setError(
          n(
            'pushoversettingsfailed',
            'Could not save Pushover settings. Try again.'
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
        void save();
      }}
    >
      <p className="note">
        {n(
          'lumen.notifications.keepPushoverCredentials',
          'Leave the credential fields empty to keep configured credentials.'
        )}
      </p>
      <div className="setlist">
        <label className="set cfg-row">
          <b>
            {saved.application
              ? n(
                  'lumen.notifications.replacementApplicationToken',
                  'Replacement Application Token'
                )
              : n('pushoverApplicationToken', 'Application Token')}
          </b>
          <input
            className="cfg-input"
            type="password"
            autoComplete="new-password"
            maxLength={30}
            value={draft.application}
            disabled={busy || remove}
            onChange={(event) =>
              setDraft({ ...draft, application: event.target.value })
            }
          />
        </label>
        <label className="set cfg-row">
          <b>
            {saved.user
              ? n(
                  'lumen.notifications.replacementUserKey',
                  'Replacement User or Group Key'
                )
              : n('pushoverUserKey', 'User or Group Key')}
          </b>
          <input
            className="cfg-input"
            type="password"
            autoComplete="new-password"
            maxLength={30}
            value={draft.user}
            disabled={busy || remove}
            onChange={(event) =>
              setDraft({ ...draft, user: event.target.value })
            }
          />
        </label>
        {(saved.application || saved.user) && (
          <label className="set cfg-row">
            <b>
              {n(
                'lumen.notifications.removePushoverCredentials',
                'Remove Credentials and Disable Pushover Events'
              )}
            </b>
            <input
              type="checkbox"
              checked={remove}
              disabled={busy}
              onChange={(event) => setRemove(event.target.checked)}
            />
          </label>
        )}
      </div>
      <div className="toolbar">
        <label className="sel">
          <span className="lbl">{n('sound', 'Sound')}</span>
          <select
            value={remove ? '' : draft.sound}
            disabled={busy || remove || (!sounds.data?.length && !draft.sound)}
            onChange={(event) =>
              setDraft({ ...draft, sound: event.target.value })
            }
          >
            <option value="">{n('deviceDefault', 'Device default')}</option>
            {draft.sound &&
              !sounds.data?.some(({ name }) => name === draft.sound) && (
                <option value={draft.sound}>{draft.sound}</option>
              )}
            {sounds.data?.map(({ name, description }) => (
              <option key={name} value={name}>
                {description}
              </option>
            ))}
          </select>
        </label>
      </div>
      {soundPath && (
        <ServiceNote
          error={sounds.error}
          what={n('lumen.notifications.pushoverSounds', 'Pushover sounds')}
          retry={sounds.reload}
        />
      )}
      <EventChoices
        mask={remove ? 0 : draft.mask}
        disabled={busy || remove}
        change={(mask) => setDraft({ ...draft, mask })}
      />
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      <div className="toolbar">
        <button className="btn btn-tonal" disabled={busy || !changed}>
          {busy
            ? n('lumen.notifications.saving', 'Saving…')
            : n('lumen.notifications.savePushover', 'Save Pushover Settings')}
        </button>
      </div>
    </form>
  );
}

export function UserNotifications({
  id,
  manageBrowser = true,
}: {
  id: number;
  manageBrowser?: boolean;
}) {
  const n = useNotificationMessage();
  const { hash } = useLocation();
  const path = `/user/${id}/settings/notifications`;
  const { data, error, reload } = useApi<Preferences>(path);
  useEffect(() => {
    if (
      data &&
      /^#notification-(email|discord|telegram|pushbullet|pushover|webpush)$/.test(
        hash
      )
    ) {
      document
        .getElementById(hash.slice(1))
        ?.scrollIntoView({ block: 'start' });
    }
  }, [data, hash]);
  const emailMask = data?.notificationTypes?.email;
  const mask =
    typeof emailMask === 'number' &&
    Number.isSafeInteger(emailMask) &&
    emailMask >= 0
      ? emailMask
      : defaultMask;
  return (
    <>
      <Section title={n('email', 'Email')} id="notification-email">
        <ServiceNote
          error={error}
          what={n('notificationsettings', 'notification settings')}
          title={n(
            'lumen.notifications.loadFailure',
            'Could not load notification settings.'
          )}
          retryLabel={n('lumen.account.retry', 'Retry')}
          retry={reload}
        />
        {!data && !error && (
          <p className="note" role="status">
            {n('lumen.notifications.loading', 'Loading notification settings…')}
          </p>
        )}
        {data &&
          (data.emailEnabled ? (
            <>
              <EventForm
                key={mask}
                path={path}
                mask={mask}
                channel="email"
                label={n('email', 'Email')}
              />
              <Section title={n('pgpPublicKey', 'OpenPGP')}>
                <OpenPgpForm
                  path={path}
                  configured={!!data.pgpKey}
                  key={String(!!data.pgpKey)}
                />
              </Section>
            </>
          ) : (
            <p className="note">
              {n(
                'lumen.notifications.emailDisabled',
                'Email notifications are disabled on this server.'
              )}
            </p>
          ))}
      </Section>
      {data?.discordEnabled && (
        <Section title="Discord" id="notification-discord">
          <DiscordForm
            key={JSON.stringify([
              data.discordIds,
              data.discordEnabledTypes,
              data.notificationTypes?.discord,
            ])}
            path={path}
            data={data}
          />
        </Section>
      )}
      {data?.telegramEnabled && (
        <Section title="Telegram" id="notification-telegram">
          <TelegramForm
            key={JSON.stringify(telegramValues(data))}
            path={path}
            data={data}
          />
        </Section>
      )}
      {data && (
        <Section title="Pushbullet" id="notification-pushbullet">
          <PushbulletForm
            key={JSON.stringify([
              !!data.pushbulletAccessToken,
              data.notificationTypes?.pushbullet,
            ])}
            path={path}
            data={data}
          />
        </Section>
      )}
      {data && (
        <Section title="Pushover" id="notification-pushover">
          <PushoverForm
            key={JSON.stringify([
              !!data.pushoverApplicationToken,
              !!data.pushoverUserKey,
              data.pushoverSound,
              data.notificationTypes?.pushover,
            ])}
            path={path}
            id={id}
            data={data}
          />
        </Section>
      )}
      {data?.webPushEnabled && (
        <Section title={n('webpush', 'Browser Push')} id="notification-webpush">
          <EventForm
            key={data.notificationTypes?.webpush ?? defaultMask}
            path={path}
            mask={data.notificationTypes?.webpush ?? defaultMask}
            channel="webpush"
            label={n('webpush', 'Browser Push')}
          />
          {manageBrowser && <PushDevices id={id} />}
        </Section>
      )}
    </>
  );
}

export default function NotificationSettings() {
  const n = useNotificationMessage();
  const { user } = useAuth();
  return (
    <>
      <header className="ph">
        <h1>{n('notificationsettings', 'Notification Settings')}</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me/account">
          {n('lumen.notifications.accountSettings', 'Account Settings')}
        </Link>
      </div>
      {user && <UserNotifications key={user.id} id={user.id} />}
    </>
  );
}

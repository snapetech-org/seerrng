import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { forget } from '../apiCache';
import { useAuth } from '../auth';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';

const notificationEvents = [
  [2, 'Request awaiting approval'],
  [4, 'Request approved'],
  [8, 'Media available'],
  [16, 'Request failed'],
  [64, 'Request declined'],
  [128, 'Request automatically approved'],
  [256, 'Issue reported'],
  [512, 'Issue comment added'],
  [1024, 'Issue resolved'],
  [2048, 'Issue reopened'],
  [4096, 'Media automatically requested'],
  [8192, 'Software available'],
  [16384, 'Software request status changed'],
  [32768, 'Pending request updated'],
] as const;

interface Preferences {
  emailEnabled?: boolean;
  pgpKey?: string | null;
  discordEnabled?: boolean;
  discordEnabledTypes?: number;
  discordIds?: string[];
  telegramEnabled?: boolean;
  telegramBotUsername?: string;
  telegramChatId?: string | null;
  telegramMessageThreadId?: string | null;
  telegramSendSilently?: boolean | null;
  notificationTypes: { email?: number; telegram?: number; discord?: number };
}

const defaultMask = 65534; // Native default includes all current bits and the test bit.

function EventChoices({
  mask,
  enabledMask = defaultMask,
  disabled,
  change,
}: {
  mask: number;
  enabledMask?: number;
  disabled: boolean;
  change: (mask: number) => void;
}) {
  return (
    <div className="setlist">
      {notificationEvents
        .filter(([bit]) => (enabledMask & bit) !== 0)
        .map(([bit, label]) => (
          <label key={bit} className="set cfg-row">
            <b>{label}</b>
            <input
              type="checkbox"
              disabled={disabled}
              checked={(BigInt(mask) & BigInt(bit)) !== 0n}
              onChange={() => change(Number(BigInt(mask) ^ BigInt(bit)))}
            />
          </label>
        ))}
    </div>
  );
}

function EmailForm({ path, mask }: { path: string; mask: number }) {
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
      const result = await api<Preferences>(path, {
        method: 'POST',
        body: JSON.stringify({ notificationTypes: { email: draft } }),
      });
      if (generation !== sessionGeneration()) return;
      if (result.notificationTypes?.email !== draft) {
        setError('Could not confirm the saved preferences. Try again.');
        return;
      }
      forget(path);
      setSaved(draft);
      setNotice('Email preferences saved.');
    } catch {
      if (generation === sessionGeneration())
        setError('Could not save email preferences. Try again.');
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
      <p className="note">Choose which events SeerrNG can email you about.</p>
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
          {busy ? 'Saving…' : 'Save Email Preferences'}
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
        value.includes('-----BEGIN PGP PRIVATE KEY BLOCK-----')
      ) {
        setError('Paste an armored OpenPGP public key.');
        return;
      }
    }
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<Preferences>(path, {
        method: 'POST',
        body: JSON.stringify({ pgpKey: value }),
      });
      if (generation !== sessionGeneration()) return;
      if (
        value === null
          ? result.pgpKey !== null
          : result.pgpKey !== value && result.pgpKey !== '[REDACTED]'
      ) {
        setError(
          'Could not confirm the saved key. Reload settings and try again.'
        );
        return;
      }
      forget(path);
      setHasKey(value !== null);
      setConfirmRemove(false);
      setDraft('');
      setNotice(value === null ? 'Public key removed.' : 'Public key saved.');
    } catch {
      if (generation === sessionGeneration())
        setError('Could not save the public key. Try again.');
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
          ? 'A public key is configured for notification email.'
          : 'Add a public key to encrypt notification email.'}
      </p>
      <label>
        <span className="note">
          {hasKey ? 'Replacement OpenPGP Public Key' : 'OpenPGP Public Key'}
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
          Remove the key and turn off OpenPGP encryption for your notifications?
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
              Confirm Remove Key
            </button>
            <button
              className="btn btn-quiet"
              type="button"
              disabled={busy}
              onClick={() => setConfirmRemove(false)}
            >
              Keep Key
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-tonal" disabled={busy || !key}>
              Save Public Key
            </button>
            {hasKey && (
              <button
                className="btn btn-quiet"
                type="button"
                disabled={busy}
                onClick={() => setConfirmRemove(true)}
              >
                Remove Public Key
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
      setError('Enter a numeric Telegram chat ID.');
      return;
    }
    if (threadId && !/^\d+$/.test(threadId)) {
      setError('Enter a numeric topic ID or leave it blank.');
      return;
    }
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<Preferences>(path, {
        method: 'POST',
        body: JSON.stringify({
          telegramChatId: chatId || null,
          telegramMessageThreadId: threadId || null,
          telegramSendSilently: draft.silent,
          notificationTypes: { telegram: draft.mask },
        }),
      });
      if (generation !== sessionGeneration()) return;
      const confirmed = telegramValues(result);
      if (
        confirmed.chatId !== chatId ||
        confirmed.threadId !== threadId ||
        confirmed.silent !== draft.silent ||
        result.notificationTypes?.telegram !== draft.mask
      ) {
        setError('Could not confirm the saved Telegram settings. Try again.');
        return;
      }
      forget(path);
      setSaved(confirmed);
      setDraft(confirmed);
      setNotice('Telegram settings saved.');
    } catch {
      if (generation === sessionGeneration())
        setError('Could not save Telegram settings. Try again.');
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
        Start a conversation with the configured Telegram bot before enabling
        notifications.
        {bot && /^[A-Za-z0-9_]+$/.test(bot) && (
          <>
            {' '}
            <a
              className="go"
              href={`https://t.me/${bot}`}
              target="_blank"
              rel="noreferrer"
            >
              Open @{bot}
            </a>
          </>
        )}
      </p>
      <div className="setlist">
        <label className="set cfg-row">
          <b>Chat ID</b>
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
            <b>Topic ID</b>
            <small>Optional for forum topics.</small>
          </span>
          <input
            className="cfg-input"
            type="text"
            inputMode="numeric"
            aria-label="Topic ID"
            maxLength={128}
            value={draft.threadId}
            disabled={busy}
            onChange={(event) =>
              setDraft({ ...draft, threadId: event.target.value })
            }
          />
        </label>
        <label className="set cfg-row">
          <b>Send Silently</b>
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
      <p className="note">Choose the events to send to Telegram.</p>
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
          {busy ? 'Saving…' : 'Save Telegram Settings'}
        </button>
      </div>
    </form>
  );
}

function DiscordForm({ path, data }: { path: string; data: Preferences }) {
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
      setError('Enter up to ten valid Discord user IDs, one per line.');
      return;
    }
    if (draft.mask && !ids.length) {
      setError('Enter at least one Discord user ID to receive mentions.');
      return;
    }
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<Preferences>(path, {
        method: 'POST',
        body: JSON.stringify({
          discordIds: ids,
          notificationTypes: { discord: draft.mask },
        }),
      });
      if (generation !== sessionGeneration()) return;
      if (
        result.discordIds?.join('\n') !== normalizedIds ||
        result.notificationTypes?.discord !== draft.mask
      ) {
        setError('Could not confirm the saved Discord settings. Try again.');
        return;
      }
      forget(path);
      const confirmed = { ids: normalizedIds, mask: draft.mask };
      setSaved(confirmed);
      setDraft(confirmed);
      setNotice('Discord settings saved.');
    } catch {
      if (generation === sessionGeneration())
        setError('Could not save Discord settings. Try again.');
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
        <span className="note">Discord User IDs</span>
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
        Enter one user ID per line. The server controls which events can send
        mentions.
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
          {busy ? 'Saving…' : 'Save Discord Settings'}
        </button>
      </div>
    </form>
  );
}

function UserNotifications({ id }: { id: number }) {
  const path = `/user/${id}/settings/notifications`;
  const { data, error, reload } = useApi<Preferences>(path);
  const emailMask = data?.notificationTypes?.email;
  const mask =
    typeof emailMask === 'number' &&
    Number.isSafeInteger(emailMask) &&
    emailMask >= 0
      ? emailMask
      : defaultMask;
  return (
    <>
      <Section title="Email">
        <ServiceNote
          error={error}
          what="notification settings"
          retry={reload}
        />
        {!data && !error && (
          <p className="note" role="status">
            Loading notification settings…
          </p>
        )}
        {data &&
          (data.emailEnabled ? (
            <>
              <EmailForm key={mask} path={path} mask={mask} />
              <Section title="OpenPGP">
                <OpenPgpForm
                  path={path}
                  configured={!!data.pgpKey}
                  key={String(!!data.pgpKey)}
                />
              </Section>
            </>
          ) : (
            <p className="note">
              Email notifications are disabled on this server.
            </p>
          ))}
      </Section>
      {data?.discordEnabled && (
        <Section title="Discord">
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
        <Section title="Telegram">
          <TelegramForm
            key={JSON.stringify(telegramValues(data))}
            path={path}
            data={data}
          />
        </Section>
      )}
    </>
  );
}

export default function NotificationSettings() {
  const { user } = useAuth();
  return (
    <>
      <header className="ph">
        <h1>Notification Settings</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me/account">
          Account Settings
        </Link>
      </div>
      {user && <UserNotifications key={user.id} id={user.id} />}
    </>
  );
}

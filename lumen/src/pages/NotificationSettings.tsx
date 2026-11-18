import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { forget } from '../apiCache';
import { useAuth } from '../auth';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';

const emailEvents = [
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
  notificationTypes: { email?: number };
}

const defaultMask = 65534; // Native default includes all current bits and the test bit.

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
      <div className="setlist">
        {emailEvents.map(([bit, label]) => (
          <label key={bit} className="set cfg-row">
            <b>{label}</b>
            <input
              type="checkbox"
              disabled={busy}
              checked={(BigInt(draft) & BigInt(bit)) !== 0n}
              onChange={() =>
                setDraft((current) => Number(BigInt(current) ^ BigInt(bit)))
              }
            />
          </label>
        ))}
      </div>
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
    <Section title="Email">
      <ServiceNote error={error} what="notification settings" retry={reload} />
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

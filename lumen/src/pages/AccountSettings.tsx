import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';

interface Profile {
  username?: string | null;
  email?: string | null;
  metadataLocale?: string | null;
  formatRegion?: string | null;
}

function profileDraft(profile: Profile) {
  return {
    username: profile.username ?? '',
    email: profile.email ?? '',
    metadataLocale: profile.metadataLocale ?? '',
    formatRegion: profile.formatRegion ?? '',
  };
}

function ProfileForm({
  path,
  profile,
  plex,
}: {
  path: string;
  profile: Profile;
  plex: boolean;
}) {
  const { refresh } = useAuth();
  const [saved, setSaved] = useState(() => profileDraft(profile));
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const working = useRef(false);
  const fields = [
    { key: 'username', label: 'Display Name', max: 100 },
    { key: 'email', label: 'Email', max: 254 },
    {
      key: 'metadataLocale',
      label: 'Metadata Language Code',
      help: 'Leave empty to use the server default.',
      max: 35,
    },
    {
      key: 'formatRegion',
      label: 'Regional Format Code',
      help: 'Use a two-letter region such as CA, or leave empty for the default.',
      max: 2,
    },
  ] as const;
  const editable = fields.filter(({ key }) => key !== 'email' || !plex);
  const normalized = {
    ...draft,
    username: draft.username.trim(),
    email: draft.email.trim(),
    metadataLocale: draft.metadataLocale.trim(),
    formatRegion: draft.formatRegion.trim().toUpperCase(),
  };
  const changes = editable.filter(({ key }) => normalized[key] !== saved[key]);
  const invalid = changes.some(
    ({ key }) => (key === 'username' || key === 'email') && !normalized[key]
  );

  async function save() {
    if (working.current || !changes.length || invalid) return;
    working.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    const generation = sessionGeneration();
    const body = Object.fromEntries(
      changes.map(({ key }) => [key, normalized[key] || null])
    );
    try {
      await api<Profile>(path, { method: 'POST', body: JSON.stringify(body) });
      if (generation !== sessionGeneration()) return;
      try {
        const confirmed = profileDraft(
          await api<Profile>(path, { cache: 'no-store' })
        );
        if (generation !== sessionGeneration()) return;
        setSaved(confirmed);
        setDraft(confirmed);
        if (changes.every(({ key }) => confirmed[key] === normalized[key])) {
          setNotice('Profile saved.');
        } else {
          setFailure(
            'SeerrNG saved different values. Review the updated profile.'
          );
        }
      } catch {
        setFailure(
          'SeerrNG accepted the save, but the updated profile could not be loaded.'
        );
      }
      await refresh();
    } catch (error) {
      if (generation === sessionGeneration()) {
        setFailure(
          error instanceof ApiError && error.status === 403
            ? 'You do not have permission to change these settings.'
            : 'Could not save the profile. Check the values and try again.'
        );
      }
    } finally {
      working.current = false;
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
        {fields.map(({ key, label, max, ...field }) => (
          <label className="set cfg-row" key={key}>
            <span>
              <b>{label}</b>
              {'help' in field && <small>{field.help}</small>}
              {plex && key === 'email' && <small>Managed by Plex.</small>}
            </span>
            <input
              className="cfg-input"
              type={key === 'email' ? 'email' : 'text'}
              maxLength={max}
              aria-label={label}
              value={draft[key]}
              disabled={busy || (plex && key === 'email')}
              onChange={(event) =>
                setDraft({ ...draft, [key]: event.target.value })
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
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      <div className="toolbar">
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || !changes.length || invalid}
        >
          Save Profile
        </button>
      </div>
    </form>
  );
}

function PasswordForm({
  path,
  initialHasPassword,
}: {
  path: string;
  initialHasPassword: boolean;
}) {
  const [hasPassword, setHasPassword] = useState(initialHasPassword);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const working = useRef(false);
  const valid =
    (!hasPassword || current.length > 0) &&
    password.trim().length >= 8 &&
    password === confirmation;

  async function save() {
    if (working.current || !valid) return;
    working.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    const generation = sessionGeneration();
    try {
      await api<void>(path, {
        method: 'POST',
        body: JSON.stringify({
          ...(hasPassword ? { currentPassword: current } : {}),
          newPassword: password,
        }),
      });
      if (generation !== sessionGeneration()) return;
      setHasPassword(true);
      setNotice('Password saved. Sign in again if prompted.');
    } catch (error) {
      if (generation !== sessionGeneration()) return;
      setFailure(
        error instanceof ApiError && error.status === 403
          ? 'Check your current password and account permissions.'
          : 'Could not confirm the password change. Check your credentials before trying again.'
      );
    } finally {
      setCurrent('');
      setPassword('');
      setConfirmation('');
      working.current = false;
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
      {!hasPassword && (
        <p className="note">This account does not have a local password.</p>
      )}
      <div className="setlist">
        {hasPassword && (
          <label className="set cfg-row">
            <b>Current Password</b>
            <input
              className="cfg-input"
              type="password"
              autoComplete="current-password"
              maxLength={1024}
              value={current}
              disabled={busy}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </label>
        )}
        <label className="set cfg-row">
          <span>
            <b>New Password</b>
            <small>Use at least eight characters.</small>
          </span>
          <input
            className="cfg-input"
            type="password"
            aria-label="New Password"
            autoComplete="new-password"
            maxLength={1024}
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="set cfg-row">
          <b>Confirm Password</b>
          <input
            className="cfg-input"
            type="password"
            autoComplete="new-password"
            maxLength={1024}
            value={confirmation}
            disabled={busy}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
      </div>
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      <div className="toolbar">
        <button className="btn btn-primary btn-sm" disabled={busy || !valid}>
          Save Password
        </button>
      </div>
    </form>
  );
}

function Settings({ id, plex }: { id: number; plex: boolean }) {
  const base = `/user/${id}/settings`;
  const profile = useApi<Profile>(base + '/main');
  const password = useApi<{ hasPassword: boolean }>(base + '/password');
  return (
    <>
      <Section title="Profile">
        <ServiceNote
          error={profile.error}
          what="profile settings"
          retry={profile.reload}
        />
        {profile.data ? (
          <ProfileForm
            path={base + '/main'}
            profile={profile.data}
            plex={plex}
          />
        ) : (
          !profile.error && (
            <p className="note" role="status">
              Loading profile settings…
            </p>
          )
        )}
      </Section>
      <Section title="Password">
        <ServiceNote
          error={password.error}
          what="password settings"
          retry={password.reload}
        />
        {password.data ? (
          <PasswordForm
            path={base + '/password'}
            initialHasPassword={password.data.hasPassword}
          />
        ) : (
          !password.error && (
            <p className="note" role="status">
              Loading password settings…
            </p>
          )
        )}
      </Section>
    </>
  );
}

export default function AccountSettings() {
  const { user } = useAuth();
  return (
    <>
      <header className="ph">
        <h1>Account Settings</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me/account/client-tokens">
          Client Tokens
        </Link>
        <Link className="btn btn-quiet btn-sm" to="/me">
          Back to You
        </Link>
      </div>
      {user && (
        <Settings id={user.id} key={user.id} plex={user.userType === 1} />
      )}
    </>
  );
}

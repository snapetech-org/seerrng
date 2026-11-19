import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, ApiError } from '../api';
import { isAdministrator, useAuth } from '../auth';
import AccountThemeOverrides from '../components/AccountThemeOverrides';
import { Section } from '../components/cards';
import { CardTitlePreferences } from '../components/CardTitlePreferences';
import { ServiceNote } from '../components/extra';
import { StreamingSubscriptions } from '../components/StreamingSubscriptions';
import { useApi, usePublicSettings } from '../hooks';
import { permissionOptions } from '../permissionOptions';
import { sessionGeneration } from '../sessionState';

const accountTypes: Readonly<Record<number, string>> = {
  1: 'Plex User',
  2: 'Local User',
  3: 'Jellyfin User',
  4: 'Emby User',
};

const watchlistFields = [
  {
    key: 'watchlistSyncMovies',
    label: 'Auto-Request Movies',
    source: 'Plex Watchlist',
    plex: true,
    permission: 16777216n,
  },
  {
    key: 'watchlistSyncTv',
    label: 'Auto-Request Series',
    source: 'Plex Watchlist',
    plex: true,
    permission: 33554432n,
  },
  {
    key: 'watchlistSyncMusic',
    label: 'Auto-Request Music',
    source: 'SeerrNG music watchlists',
    permission: 8589934592n,
  },
  {
    key: 'watchlistSyncBooks',
    label: 'Auto-Request Books',
    source: 'SeerrNG book watchlists',
    permission: 68719476736n,
  },
  {
    key: 'watchlistSyncComics',
    label: 'Auto-Request Comics',
    source: 'your SeerrNG comic watchlist',
    permission: 549755813888n,
  },
  {
    key: 'watchlistSyncMagazines',
    label: 'Auto-Request Magazines',
    source: 'your SeerrNG magazine watchlist',
    permission: 4398046511104n,
  },
] as const;

type WatchlistField = (typeof watchlistFields)[number]['key'];

const preferredLanguageFields = [
  ['all', 'Preferred Language for All Media'],
  ['movie', 'Movie Language Override'],
  ['tv', 'Series Language Override'],
  ['music', 'Music Language Override'],
  ['book', 'Book Language Override'],
] as const;

type PreferredLanguage = (typeof preferredLanguageFields)[number][0];
type PreferredLanguages = Partial<Record<PreferredLanguage, string | null>>;

function languageDraft(preferences?: PreferredLanguages | null) {
  return Object.fromEntries(
    preferredLanguageFields.map(([key]) => [
      key,
      preferences?.[key] ??
        (key === 'all' || preferences?.[key] === null ? '' : 'inherit'),
    ])
  ) as Record<PreferredLanguage, string>;
}

interface Profile extends Partial<Record<WatchlistField, boolean | null>> {
  username?: string | null;
  email?: string | null;
  metadataLocale?: string | null;
  preferredLanguages?: PreferredLanguages | null;
  formatRegion?: string | null;
  discoverRegion?: string | null;
  streamingRegion?: string | null;
  originalLanguage?: string | null;
  streamingSubscriptionProviderIds?: number[];
}

function profileDraft(profile: Profile) {
  return {
    watchlistSyncMovies: profile.watchlistSyncMovies ?? false,
    watchlistSyncTv: profile.watchlistSyncTv ?? false,
    watchlistSyncMusic: profile.watchlistSyncMusic ?? false,
    watchlistSyncBooks: profile.watchlistSyncBooks ?? false,
    watchlistSyncComics: profile.watchlistSyncComics ?? false,
    watchlistSyncMagazines: profile.watchlistSyncMagazines ?? false,
    username: profile.username ?? '',
    email: profile.email ?? '',
    metadataLocale: profile.metadataLocale ?? '',
    preferredLanguages: languageDraft(profile.preferredLanguages),
    formatRegion: profile.formatRegion ?? '',
    discoverRegion: normalizeRegion(profile.discoverRegion ?? ''),
    streamingRegion: normalizeRegion(profile.streamingRegion ?? ''),
    originalLanguage: (profile.originalLanguage ?? '').trim().toLowerCase(),
  };
}

function normalizeRegion(value: string) {
  const trimmed = value.trim();
  return trimmed.toLowerCase() === 'all' ? 'all' : trimmed.toUpperCase();
}

function ProfileForm({
  path,
  profile,
  plex,
  onSaved,
}: {
  path: string;
  profile: Profile;
  plex: boolean;
  onSaved: () => void;
}) {
  const { refresh, user } = useAuth();
  const languages =
    useApi<{ iso_639_1: string; english_name: string }[]>('/languages');
  const languageOptions = (Array.isArray(languages.data) ? languages.data : [])
    .filter(({ iso_639_1 }) => /^[a-z]{2}$/.test(iso_639_1))
    .sort((left, right) => left.english_name.localeCompare(right.english_name));
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
    {
      key: 'discoverRegion',
      label: 'Discover Region',
      help: 'Enter a two-letter region code, all, or leave empty for the server default.',
      max: 16,
    },
    {
      key: 'streamingRegion',
      label: 'Streaming Region',
      help: 'Enter a two-letter region code or leave empty for the server default.',
      max: 16,
    },
    {
      key: 'originalLanguage',
      label: 'Original Language',
      help: 'Enter a two-letter language code, all, or leave empty for the server default.',
      max: 16,
    },
  ] as const;
  const permissions = user?.permissions;
  const mask =
    typeof permissions === 'number' &&
    Number.isSafeInteger(permissions) &&
    permissions >= 0
      ? BigInt(permissions)
      : 0n;
  const visibleWatchlists = watchlistFields.filter(
    (field) =>
      (!('plex' in field) || plex) &&
      (isAdministrator(permissions) ||
        (mask & (8388608n | field.permission)) !== 0n)
  );
  const editable = [
    ...fields.filter(({ key }) => key !== 'email' || !plex),
    ...visibleWatchlists,
  ];
  const normalized = {
    ...draft,
    username: draft.username.trim(),
    email: draft.email.trim(),
    metadataLocale: draft.metadataLocale.trim(),
    formatRegion: draft.formatRegion.trim().toUpperCase(),
    discoverRegion: normalizeRegion(draft.discoverRegion),
    streamingRegion: normalizeRegion(draft.streamingRegion),
    originalLanguage: draft.originalLanguage.trim().toLowerCase(),
  };
  const changes = editable.filter(({ key }) => normalized[key] !== saved[key]);
  const languageChanged = preferredLanguageFields.some(
    ([key]) => draft.preferredLanguages[key] !== saved.preferredLanguages[key]
  );
  const invalid = changes.some(
    ({ key }) => (key === 'username' || key === 'email') && !normalized[key]
  );

  async function save() {
    if (working.current || (!changes.length && !languageChanged) || invalid)
      return;
    working.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    const generation = sessionGeneration();
    const body: Record<string, unknown> = Object.fromEntries(
      changes.map(({ key }) => [
        key,
        normalized[key] === '' ? null : normalized[key],
      ])
    );
    if (languageChanged)
      body.preferredLanguages = Object.fromEntries(
        preferredLanguageFields.flatMap(([key]) => {
          const value = draft.preferredLanguages[key];
          return value === 'inherit' ? [] : [[key, value || null]];
        })
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
        onSaved();
        if (
          changes.every(({ key }) => confirmed[key] === normalized[key]) &&
          (!languageChanged ||
            preferredLanguageFields.every(
              ([key]) =>
                confirmed.preferredLanguages[key] ===
                draft.preferredLanguages[key]
            ))
        ) {
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
        <ServiceNote
          error={languages.error}
          what="media languages"
          retry={languages.reload}
        />
        {preferredLanguageFields.map(([key, label]) => {
          const value = draft.preferredLanguages[key];
          return (
            <label className="set cfg-row" key={key}>
              <b>{label}</b>
              <select
                className="cfg-input"
                value={value}
                disabled={busy || !Array.isArray(languages.data)}
                onChange={(event) => {
                  const language = event.target.value;
                  setDraft((current) => ({
                    ...current,
                    preferredLanguages: {
                      ...current.preferredLanguages,
                      [key]: language,
                    },
                  }));
                }}
              >
                {key !== 'all' && (
                  <option value="inherit">Use All-Media Preference</option>
                )}
                <option value="">Any Language</option>
                {value &&
                  value !== 'inherit' &&
                  !languageOptions.some(
                    ({ iso_639_1 }) => iso_639_1 === value
                  ) && <option value={value}>{value}</option>}
                {languageOptions.map(({ iso_639_1, english_name }) => (
                  <option key={iso_639_1} value={iso_639_1}>
                    {english_name}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
        {visibleWatchlists.map(({ key, label, source }) => (
          <label className="set cfg-row" key={key}>
            <span>
              <b>{label}</b>
              <small>Automatically request titles added to {source}.</small>
            </span>
            <input
              type="checkbox"
              aria-label={label}
              checked={draft[key]}
              disabled={busy}
              onChange={(event) =>
                setDraft({ ...draft, [key]: event.target.checked })
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
          disabled={busy || (!changes.length && !languageChanged) || invalid}
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
  const { user } = useAuth();
  const accountType = user?.userType ? accountTypes[user.userType] : undefined;
  const role =
    user?.id === 1
      ? 'Owner'
      : isAdministrator(user?.permissions)
        ? 'Admin'
        : 'User';
  const mask = user?.permissions ?? 0;
  const permissionBits =
    Number.isSafeInteger(mask) && mask >= 0 ? BigInt(mask) : 0n;
  const grants = permissionOptions.filter(
    ([bit]) => (permissionBits & bit) !== 0n
  );
  const { hash } = useLocation();
  const base = `/user/${id}/settings`;
  const profile = useApi<Profile>(base + '/main', { keepDuringRefresh: true });
  const publicSettings = usePublicSettings();
  const region =
    profile.data?.streamingRegion || publicSettings?.streamingRegion || 'US';
  const password = useApi<{ hasPassword: boolean }>(base + '/password');
  const loaded = Boolean(
    (profile.data || profile.error) && (password.data || password.error)
  );
  useEffect(() => {
    if (
      hash === '#advanced-theme' ||
      (loaded && (hash === '#password' || hash === '#account-permissions'))
    ) {
      document
        .getElementById(hash.slice(1))
        ?.scrollIntoView({ block: 'start' });
    }
  }, [hash, loaded]);
  return (
    <>
      <Section title="Profile">
        <dl className="setlist">
          {accountType && (
            <div className="set">
              <dt>
                <b>Account Type</b>
              </dt>
              <dd>
                <small>{accountType}</small>
              </dd>
            </div>
          )}
          <div className="set">
            <dt>
              <b>Role</b>
            </dt>
            <dd>
              <small>{role}</small>
            </dd>
          </div>
        </dl>
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
            onSaved={profile.refresh}
          />
        ) : (
          !profile.error && (
            <p className="note" role="status">
              Loading profile settings…
            </p>
          )
        )}
      </Section>
      {profile.data && (
        <StreamingSubscriptions
          path={base + '/main'}
          region={region === 'all' ? '' : region}
          initialIds={profile.data.streamingSubscriptionProviderIds ?? []}
        />
      )}
      <CardTitlePreferences path={base + '/card-text'} />
      <Section title="Password" id="password">
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
      <Section title="Account Permissions" id="account-permissions">
        {isAdministrator(mask) ? (
          <p className="note">This account has administrator access.</p>
        ) : grants.length ? (
          <ul className="setlist">
            {grants.map(([bit, label]) => (
              <li className="set" key={String(bit)}>
                {label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="note">
            No additional permissions are assigned to this account.
          </p>
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
        <Link className="btn btn-quiet btn-sm" to="#advanced-theme">
          Theme Colors
        </Link>
        <Link className="btn btn-quiet btn-sm" to="#account-permissions">
          Account Permissions
        </Link>
        <Link className="btn btn-quiet btn-sm" to="/me/account/tv-requests">
          TV Request Settings
        </Link>
        <Link className="btn btn-quiet btn-sm" to="/me/account/linked-accounts">
          Linked Accounts
        </Link>
        <Link className="btn btn-quiet btn-sm" to="/me/account/client-tokens">
          Client Tokens
        </Link>
        <Link className="btn btn-quiet btn-sm" to="/me/account/notifications">
          Notification Settings
        </Link>
        <Link className="btn btn-quiet btn-sm" to="/me">
          Back to You
        </Link>
      </div>
      {user && (
        <Settings id={user.id} key={user.id} plex={user.userType === 1} />
      )}
      {user && <AccountThemeOverrides key={`theme:${user.id}`} />}
    </>
  );
}

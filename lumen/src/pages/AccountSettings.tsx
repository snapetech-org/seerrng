import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, ApiError } from '../api';
import { isAdministrator, useAuth } from '../auth';
import AccountThemeOverrides from '../components/AccountThemeOverrides';
import { BookHomeSections } from '../components/BookHomeSections';
import { Section } from '../components/cards';
import { CardTitlePreferences } from '../components/CardTitlePreferences';
import { ExternalRequestLists } from '../components/ExternalRequestLists';
import { ServiceNote } from '../components/extra';
import ManagedMaturity from '../components/ManagedMaturity';
import { RequestRootFolders } from '../components/RequestRootFolders';
import { StreamingSubscriptions } from '../components/StreamingSubscriptions';
import { useApi, usePublicSettings } from '../hooks';
import { lumenLocales, useLumenLocale } from '../i18n';
import { permissionOptions } from '../permissionOptions';
import { sessionGeneration } from '../sessionState';

const accountTypes: Readonly<Record<number, string>> = {
  1: 'components.UserProfile.UserSettings.UserGeneralSettings.plexuser',
  2: 'components.UserProfile.UserSettings.UserGeneralSettings.localuser',
  3: 'components.UserProfile.UserSettings.UserGeneralSettings.mediaServerUser',
  4: 'components.UserProfile.UserSettings.UserGeneralSettings.mediaServerUser',
};

const watchlistFields = [
  {
    key: 'watchlistSyncMovies',
    label: 'Auto-Request Movies',
    source: 'Plex Watchlist',
    plex: true,
    permission: 16777216n,
    helpKey: '',
    labelKey:
      'components.UserProfile.UserSettings.UserGeneralSettings.plexwatchlistsyncmovies',
  },
  {
    key: 'watchlistSyncTv',
    label: 'Auto-Request Series',
    source: 'Plex Watchlist',
    plex: true,
    permission: 33554432n,
    helpKey: '',
    labelKey:
      'components.UserProfile.UserSettings.UserGeneralSettings.plexwatchlistsyncseries',
  },
  {
    key: 'watchlistSyncMusic',
    label: 'Auto-Request Music',
    source: 'SeerrNG music watchlists',
    permission: 8589934592n,
    labelKey:
      'components.UserProfile.UserSettings.UserGeneralSettings.musicwatchlistsync',
    helpKey:
      'components.UserProfile.UserSettings.UserGeneralSettings.musicwatchlistsynctip',
  },
  {
    key: 'watchlistSyncBooks',
    label: 'Auto-Request Books',
    source: 'SeerrNG book watchlists',
    permission: 68719476736n,
    labelKey:
      'components.UserProfile.UserSettings.UserGeneralSettings.bookwatchlistsync',
    helpKey:
      'components.UserProfile.UserSettings.UserGeneralSettings.bookwatchlistsynctip',
  },
  {
    key: 'watchlistSyncComics',
    label: 'Auto-Request Comics',
    source: 'your SeerrNG comic watchlist',
    permission: 549755813888n,
    labelKey:
      'components.UserProfile.UserSettings.UserGeneralSettings.comicwatchlistsync',
    helpKey:
      'components.UserProfile.UserSettings.UserGeneralSettings.comicwatchlistsynctip',
  },
  {
    key: 'watchlistSyncMagazines',
    label: 'Auto-Request Magazines',
    source: 'your SeerrNG magazine watchlist',
    permission: 4398046511104n,
    labelKey:
      'components.UserProfile.UserSettings.UserGeneralSettings.magazinewatchlistsync',
    helpKey:
      'components.UserProfile.UserSettings.UserGeneralSettings.magazinewatchlistsynctip',
  },
] as const;

type WatchlistField = (typeof watchlistFields)[number]['key'];

const preferredLanguageFields = [
  ['all', 'Preferred Language for All Media', 'preferredLanguageAll'],
  ['movie', 'Movie Language Override', 'preferredLanguageMovie'],
  ['tv', 'Series Language Override', 'preferredLanguageTv'],
  ['music', 'Music Language Override', 'preferredLanguageMusic'],
  ['book', 'Book Language Override', 'preferredLanguageBook'],
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
  locale?: string | null;
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
    locale: profile.locale ?? '',
    metadataLocale: profile.metadataLocale ?? '',
    preferredLanguages: languageDraft(profile.preferredLanguages),
    formatRegion: profile.formatRegion ?? '',
    discoverRegion: normalizeRegion(profile.discoverRegion ?? ''),
    streamingRegion: normalizeRegion(profile.streamingRegion ?? ''),
    originalLanguage: (profile.originalLanguage ?? '').trim().toLowerCase(),
  };
}

function accountLoadError(
  error: string | null,
  t: ReturnType<typeof useLumenLocale>['t']
) {
  if (!error) return null;
  const genericMessages = [
    ['Your session ended. Sign in again.', 'lumen.account.loadSessionExpired'],
    ['You don’t have permission to do that.', 'lumen.account.loadForbidden'],
    [
      'The server took too long to answer. Try again.',
      'lumen.account.loadTimeout',
    ],
    [
      'Too many requests. Wait a minute and try again.',
      'lumen.account.loadRateLimited',
    ],
    [
      'The server had a problem. Try again in a moment.',
      'lumen.account.loadServerFailure',
    ],
    [
      'Couldn’t reach the server. Check your connection and try again.',
      'lumen.account.loadNetworkFailure',
    ],
    [
      'You’re offline. Check your connection and try again.',
      'lumen.account.loadOffline',
    ],
    ['Failed to load', 'lumen.account.loadUnknownFailure'],
  ] as const;
  const match = genericMessages.find(([message]) => message === error);
  return match ? t(match[1], error) : error;
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
  const { locale, setLocale: setLumenLocale, t } = useLumenLocale();
  const languages =
    useApi<{ iso_639_1: string; english_name: string }[]>('/languages');
  const languageOptions = (Array.isArray(languages.data) ? languages.data : [])
    .filter(({ iso_639_1 }) => /^[a-z]{2}$/.test(iso_639_1))
    .filter(({ english_name }) => typeof english_name === 'string');
  const languageNames = useMemo(
    () => new Intl.DisplayNames([locale], { type: 'language' }),
    [locale]
  );
  const localizedLanguageOptions = useMemo(
    () =>
      languageOptions
        .map(({ iso_639_1, english_name }) => {
          const localized = languageNames.of(iso_639_1);
          return {
            iso_639_1,
            name:
              localized && localized.toLowerCase() !== iso_639_1.toLowerCase()
                ? localized
                : english_name,
          };
        })
        .sort((left, right) => left.name.localeCompare(right.name, locale)),
    [languageOptions, languageNames, locale]
  );
  const [saved, setSaved] = useState(() => profileDraft(profile));
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const working = useRef(false);
  const generalKey = 'components.UserProfile.UserSettings.UserGeneralSettings.';
  const fields = [
    {
      key: 'username',
      label: 'Display Name',
      labelKey: generalKey + 'displayName',
      max: 100,
    },
    {
      key: 'email',
      label: 'Email',
      labelKey: generalKey + 'email',
      max: 254,
    },
    {
      key: 'metadataLocale',
      label: 'Metadata Language Code',
      help: 'Leave empty to use the server default.',
      labelKey: generalKey + 'metadataLanguage',
      helpKey: generalKey + 'metadataLanguageTip',
      max: 35,
    },
    {
      key: 'formatRegion',
      label: 'Regional Format Code',
      help: 'Use a two-letter region such as CA, or leave empty for the default.',
      labelKey: generalKey + 'formatRegion',
      helpKey: generalKey + 'formatRegionTip',
      max: 2,
    },
    {
      key: 'discoverRegion',
      label: 'Discover Region',
      help: 'Enter a two-letter region code, all, or leave empty for the server default.',
      labelKey: generalKey + 'discoverRegion',
      helpKey: generalKey + 'discoverRegionTip',
      max: 16,
    },
    {
      key: 'streamingRegion',
      label: 'Streaming Region',
      help: 'Enter a two-letter region code or leave empty for the server default.',
      labelKey: generalKey + 'streamingRegion',
      helpKey: generalKey + 'streamingRegionTip',
      max: 16,
    },
    {
      key: 'originalLanguage',
      label: 'Discover Language',
      help: 'Enter a two-letter language code, all, or leave empty for the server default.',
      labelKey: generalKey + 'originallanguage',
      helpKey: generalKey + 'originallanguageTip',
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
    {
      key: 'locale',
      label: 'Display Language',
      labelKey: generalKey + 'applanguage',
    } as const,
    ...visibleWatchlists,
  ];
  const normalized = {
    ...draft,
    username: draft.username.trim(),
    email: draft.email.trim(),
    locale: draft.locale.trim(),
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
        setLumenLocale(confirmed.locale || null);
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
          setNotice('profile-saved');
        } else {
          setFailure(
            t(
              'lumen.account.profileSaveMismatch',
              'SeerrNG saved different values. Review the updated profile.'
            )
          );
        }
      } catch {
        setFailure(
          t(
            'lumen.account.profileConfirmFailure',
            'SeerrNG accepted the save, but the updated profile could not be loaded.'
          )
        );
      }
      await refresh();
    } catch (error) {
      if (generation === sessionGeneration()) {
        setFailure(
          error instanceof ApiError && error.status === 403
            ? t(
                'lumen.account.profileSaveForbidden',
                'You do not have permission to change these settings.'
              )
            : t(
                'lumen.account.profileSaveFailure',
                'Could not save the profile. Check the values and try again.'
              )
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
        <label className="set cfg-row">
          <span>
            <b>
              {t(
                'components.UserProfile.UserSettings.UserGeneralSettings.applanguage',
                'Display Language'
              )}
            </b>
            <small>
              {t(
                'components.UserProfile.UserSettings.UserGeneralSettings.languageBrowserDefault',
                'Use Browser Language ({language})',
                { language: navigator.language }
              )}
            </small>
          </span>
          <select
            className="cfg-input"
            aria-label={t(
              'components.UserProfile.UserSettings.UserGeneralSettings.applanguage',
              'Display Language'
            )}
            value={draft.locale}
            disabled={busy}
            onChange={(event) =>
              setDraft({ ...draft, locale: event.target.value })
            }
          >
            <option value="">
              {t(
                'components.UserProfile.UserSettings.UserGeneralSettings.languageBrowserDefault',
                'Use Browser Language ({language})',
                { language: navigator.language }
              )}
            </option>
            {lumenLocales.map(({ tag, nativeName }) => (
              <option key={tag} value={tag}>
                {nativeName}
              </option>
            ))}
          </select>
        </label>
        {fields.map(({ key, label, labelKey, max, ...field }) => (
          <label className="set cfg-row" key={key}>
            <span>
              <b>{t(labelKey, label)}</b>
              {'help' in field && <small>{t(field.helpKey, field.help)}</small>}
              {plex && key === 'email' && (
                <small>
                  {t('lumen.account.managedByPlex', 'Managed by Plex.')}
                </small>
              )}
            </span>
            <input
              className="cfg-input"
              type={key === 'email' ? 'email' : 'text'}
              maxLength={max}
              aria-label={t(labelKey, label)}
              value={draft[key]}
              disabled={busy || (plex && key === 'email')}
              onChange={(event) =>
                setDraft({ ...draft, [key]: event.target.value })
              }
            />
          </label>
        ))}
        <ServiceNote
          error={accountLoadError(languages.error, t)}
          what="media languages"
          title={t(
            'lumen.account.loadMediaLanguagesFailure',
            'Could not load media languages'
          )}
          retryLabel={t('lumen.account.retry', 'Retry')}
          retry={languages.reload}
        />
        {preferredLanguageFields.map(([key, label, messageKey]) => {
          const value = draft.preferredLanguages[key];
          return (
            <label className="set cfg-row" key={key}>
              <b>
                {t(
                  `components.UserProfile.UserSettings.UserGeneralSettings.${messageKey}`,
                  label
                )}
              </b>
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
                  <option value="inherit">
                    {t(
                      'components.UserProfile.UserSettings.UserGeneralSettings.preferredLanguageInherit',
                      'Use all-media preference'
                    )}
                  </option>
                )}
                <option value="">
                  {t(
                    'components.UserProfile.UserSettings.UserGeneralSettings.preferredLanguageAny',
                    'Any language'
                  )}
                </option>
                {value &&
                  value !== 'inherit' &&
                  !languageOptions.some(
                    ({ iso_639_1 }) => iso_639_1 === value
                  ) && <option value={value}>{value}</option>}
                {localizedLanguageOptions.map(({ iso_639_1, name }) => (
                  <option key={iso_639_1} value={iso_639_1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
        {visibleWatchlists.map(({ key, label, labelKey, helpKey, source }) => (
          <label className="set cfg-row" key={key}>
            <span>
              <b>{t(labelKey, label)}</b>
              <small>
                {helpKey
                  ? t(
                      helpKey,
                      `Automatically request titles added to ${source}.`
                    )
                  : t(
                      'lumen.account.plexWatchlistTip',
                      `Automatically request titles added to ${source}.`
                    )}
              </small>
            </span>
            <input
              type="checkbox"
              aria-label={t(labelKey, label)}
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
          {notice === 'profile-saved'
            ? t(
                'components.UserProfile.UserSettings.UserGeneralSettings.toastSettingsSuccess',
                'Settings saved successfully!'
              )
            : notice}
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
          {t(
            'components.UserProfile.UserSettings.UserGeneralSettings.save',
            'Save Changes'
          )}
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
  const { t } = useLumenLocale();
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
      setNotice(
        t(
          'components.UserProfile.UserSettings.UserPasswordChange.toastSettingsSuccess',
          'Password saved successfully!'
        )
      );
    } catch (error) {
      if (generation !== sessionGeneration()) return;
      setFailure(
        error instanceof ApiError && error.status === 403
          ? t(
              'lumen.account.passwordChangeForbidden',
              'Check your current password and account permissions.'
            )
          : t(
              'lumen.account.passwordChangeUnconfirmed',
              'Could not confirm the password change. Check your credentials before trying again.'
            )
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
        <p className="note">
          {t(
            'lumen.account.noLocalPassword',
            'This account does not have a local password.'
          )}
        </p>
      )}
      <div className="setlist">
        {hasPassword && (
          <label className="set cfg-row">
            <b>
              {t(
                'components.UserProfile.UserSettings.UserPasswordChange.currentpassword',
                'Current Password'
              )}
            </b>
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
            <b>
              {t(
                'components.UserProfile.UserSettings.UserPasswordChange.newpassword',
                'New Password'
              )}
            </b>
            <small>
              {t(
                'components.UserProfile.UserSettings.UserPasswordChange.validationNewPasswordLength',
                'Use at least eight characters.'
              )}
            </small>
          </span>
          <input
            className="cfg-input"
            type="password"
            aria-label={t(
              'components.UserProfile.UserSettings.UserPasswordChange.newpassword',
              'New Password'
            )}
            autoComplete="new-password"
            maxLength={1024}
            value={password}
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="set cfg-row">
          <b>
            {t(
              'components.UserProfile.UserSettings.UserPasswordChange.confirmpassword',
              'Confirm Password'
            )}
          </b>
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
          {t('lumen.account.savePassword', 'Save Password')}
        </button>
      </div>
    </form>
  );
}

function Settings({ id, plex }: { id: number; plex: boolean }) {
  const { user } = useAuth();
  const { t } = useLumenLocale();
  const accountType = user?.userType ? accountTypes[user.userType] : undefined;
  const mediaServerName =
    user?.userType === 3 ? 'Jellyfin' : user?.userType === 4 ? 'Emby' : '';
  const role =
    user?.id === 1
      ? 'Owner'
      : isAdministrator(user?.permissions)
        ? 'Admin'
        : 'User';
  const roleKey =
    user?.id === 1
      ? 'components.UserProfile.UserSettings.UserGeneralSettings.owner'
      : isAdministrator(user?.permissions)
        ? 'components.UserProfile.UserSettings.UserGeneralSettings.admin'
        : 'components.UserProfile.UserSettings.UserGeneralSettings.user';
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
      (loaded &&
        (hash === '#password' ||
          hash === '#account-permissions' ||
          hash === '#maturity-controls'))
    ) {
      document
        .getElementById(hash.slice(1))
        ?.scrollIntoView({ block: 'start' });
    }
  }, [hash, loaded]);
  return (
    <>
      <Section
        title={t(
          'components.UserProfile.UserSettings.UserGeneralSettings.generalsettings',
          'General Settings'
        )}
      >
        <dl className="setlist">
          {accountType && (
            <div className="set">
              <dt>
                <b>
                  {t(
                    'components.UserProfile.UserSettings.UserGeneralSettings.accounttype',
                    'Account Type'
                  )}
                </b>
              </dt>
              <dd>
                <small>
                  {t(accountType, accountType, { mediaServerName })}
                </small>
              </dd>
            </div>
          )}
          <div className="set">
            <dt>
              <b>
                {t(
                  'components.UserProfile.UserSettings.UserGeneralSettings.role',
                  'Role'
                )}
              </b>
            </dt>
            <dd>
              <small>{t(roleKey, role)}</small>
            </dd>
          </div>
        </dl>
        <ServiceNote
          error={accountLoadError(profile.error, t)}
          what="profile settings"
          title={t(
            'lumen.account.loadProfileFailure',
            'Could not load profile settings'
          )}
          retryLabel={t('lumen.account.retry', 'Retry')}
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
              {t(
                'lumen.account.loadingProfileSettings',
                'Loading profile settings…'
              )}
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
      {user && (
        <RequestRootFolders userId={id} permissions={user.permissions ?? 0} />
      )}
      <ExternalRequestLists />
      <BookHomeSections userId={id} />
      <CardTitlePreferences path={base + '/card-text'} />
      <Section
        title={t(
          'components.UserProfile.UserSettings.menuChangePass',
          'Password'
        )}
        id="password"
      >
        <ServiceNote
          error={accountLoadError(password.error, t)}
          what="password settings"
          title={t(
            'lumen.account.loadPasswordFailure',
            'Could not load password settings'
          )}
          retryLabel={t('lumen.account.retry', 'Retry')}
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
              {t(
                'lumen.account.loadingPasswordSettings',
                'Loading password settings…'
              )}
            </p>
          )
        )}
      </Section>
      <Section
        title={t(
          'components.UserProfile.UserSettings.menuPermissions',
          'Permissions'
        )}
        id="account-permissions"
      >
        {isAdministrator(mask) ? (
          <p className="note">
            {t(
              'lumen.account.administratorAccess',
              'This account has administrator access.'
            )}
          </p>
        ) : grants.length ? (
          <ul className="setlist">
            {grants.map(([bit, label, messageKey]) => (
              <li className="set" key={String(bit)}>
                {t(messageKey, label)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="note">
            {t(
              'lumen.account.noAdditionalPermissions',
              'No additional permissions are assigned to this account.'
            )}
          </p>
        )}
      </Section>
    </>
  );
}

export default function AccountSettings() {
  const { user } = useAuth();
  const { t } = useLumenLocale();
  const canManageTheme = isAdministrator(user?.permissions);
  const canManageUsers =
    isAdministrator(user?.permissions) || ((user?.permissions ?? 0) & 8) !== 0;
  return (
    <>
      <header className="ph">
        <h1>{t('i18n.usersettings', 'User Settings')}</h1>
      </header>
      <div className="toolbar">
        {canManageTheme && (
          <Link className="btn btn-quiet btn-sm" to="#advanced-theme">
            {t(
              'components.UserProfile.UserSettings.menuAdvancedTheme',
              'Advanced Theme'
            )}
          </Link>
        )}
        <Link className="btn btn-quiet btn-sm" to="#account-permissions">
          {t(
            'components.UserProfile.UserSettings.menuPermissions',
            'Permissions'
          )}
        </Link>
        {canManageUsers && (
          <Link className="btn btn-quiet btn-sm" to="#maturity-controls">
            {t(
              'components.UserProfile.UserSettings.menuMaturityControls',
              'Maturity Controls'
            )}
          </Link>
        )}
        <Link className="btn btn-quiet btn-sm" to="/me/account/tv-requests">
          {t('lumen.account.tvRequestSettings', 'TV Request Settings')}
        </Link>
        <Link className="btn btn-quiet btn-sm" to="/me/account/linked-accounts">
          {t(
            'components.UserProfile.UserSettings.menuLinkedAccounts',
            'Linked Accounts'
          )}
        </Link>
        <Link className="btn btn-quiet btn-sm" to="/me/account/client-tokens">
          {t(
            'components.UserProfile.UserSettings.menuClientTokens',
            'Client Tokens'
          )}
        </Link>
        <Link className="btn btn-quiet btn-sm" to="/me/account/notifications">
          {t(
            'components.UserProfile.UserSettings.menuNotifications',
            'Notifications'
          )}
        </Link>
        <Link className="btn btn-quiet btn-sm" to="/me">
          {t('lumen.account.backToYou', 'Back to You')}
        </Link>
      </div>
      {user && (
        <Settings id={user.id} key={user.id} plex={user.userType === 1} />
      )}
      {user && canManageUsers && (
        <Section
          id="maturity-controls"
          title={t(
            'components.UserProfile.UserSettings.menuMaturityControls',
            'Maturity Controls'
          )}
        >
          <ManagedMaturity id={user.id} />
        </Section>
      )}
      {user && canManageTheme && (
        <AccountThemeOverrides key={`theme:${user.id}`} />
      )}
    </>
  );
}

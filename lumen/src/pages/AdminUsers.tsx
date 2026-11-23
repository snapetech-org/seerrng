import {
  lazy,
  Suspense,
  useCallback,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { isAdministrator, useAuth } from '../auth';
import { Section } from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { canViewAllRequests } from '../components/detail';
import { ServiceNote } from '../components/extra';
import ImportMediaServerUsers from '../components/ImportMediaServerUsers';
import ManagedEpisodeQueue from '../components/ManagedEpisodeQueue';
import ManagedLinkedAccounts from '../components/ManagedLinkedAccounts';
import ManagedLoginLinks from '../components/ManagedLoginLinks';
import ManagedMaturity from '../components/ManagedMaturity';
import ManagedMediaCategories from '../components/ManagedMediaCategories';
import ManagedPassword from '../components/ManagedPassword';
import ManagedPermissions from '../components/ManagedPermissions';
import ManagedQuotas from '../components/ManagedQuotas';
import ManagedTvAccess from '../components/ManagedTvAccess';
import { friendlyError } from '../errors';
import { useApi, usePublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';
import { canViewUserWatchlist } from './Watchlist';

const UserNotifications = lazy(() =>
  import('./NotificationSettings').then(({ UserNotifications }) => ({
    default: UserNotifications,
  }))
);

interface DirectoryUser {
  id: number;
  displayName: string;
  email?: string;
  permissions: number;
  requestCount?: number;
  userType?: number;
  plexId?: number | null;
  plexUsername?: string;
  jellyfinUserId?: string | null;
  jellyfinUsername?: string;
}

const pageSize = 25;
const sorts = {
  displayname: 'Name',
  requests: 'Request Count',
  created: 'Date Added',
  updated: 'Last Updated',
  usertype: 'Account Type',
  role: 'Role',
};

function CreateLocalUser({
  onCreated,
  onClose,
}: {
  onCreated: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useLumenLocale();
  const [emailSetup, setEmailSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const working = useRef(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working.current) return;
    const fields = new FormData(event.currentTarget);
    const username = String(fields.get('username') ?? '').trim();
    const email = String(fields.get('email') ?? '').trim();
    const password = String(fields.get('password') ?? '');
    if (!username) {
      setError(t('lumen.adminUsers.usernameRequired', 'Enter a username.'));
      return;
    }
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await api('/user', {
        method: 'POST',
        body: JSON.stringify({
          username,
          ...(email ? { email } : {}),
          ...(emailSetup ? {} : { password }),
        }),
      });
      onCreated(username);
    } catch (failure) {
      setError(
        friendlyError(
          failure,
          t('lumen.adminUsers.createFailure', 'Could not create the account.'),
          t
        )
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title={t('lumen.adminUsers.createLocalUser', 'Create Local User')}>
      <form onSubmit={create} autoComplete="off">
        <div className="setlist">
          <label className="set">
            <span>{t('lumen.adminUsers.username', 'Username')}</span>
            <input
              className="cfg-json"
              name="username"
              maxLength={100}
              required
              disabled={busy}
            />
          </label>
          <label className="set">
            <span>{t('lumen.adminUsers.email', 'Email')}</span>
            <input
              className="cfg-json"
              name="email"
              type="email"
              maxLength={254}
              required={emailSetup}
              disabled={busy}
            />
          </label>
          <label className="set">
            <span>
              {t(
                'lumen.adminUsers.emailSetupLink',
                'Email a password setup link'
              )}
            </span>
            <input
              type="checkbox"
              checked={emailSetup}
              disabled={busy}
              onChange={(event) => setEmailSetup(event.target.checked)}
            />
          </label>
          {!emailSetup && (
            <label className="set">
              <span>{t('lumen.adminUsers.password', 'Password')}</span>
              <input
                className="cfg-json"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={1024}
                required
                disabled={busy}
              />
            </label>
          )}
        </div>
        {emailSetup && (
          <p className="note">
            {t(
              'lumen.adminUsers.setupLinkRequirement',
              'Setup links require an application URL and email notifications.'
            )}
          </p>
        )}
        {error && (
          <p className="note" role="alert">
            {error}
          </p>
        )}
        <div className="toolbar">
          <button className="btn btn-tonal btn-sm" disabled={busy}>
            {busy
              ? t('lumen.adminUsers.creating', 'Creating…')
              : t('lumen.adminUsers.createUser', 'Create User')}
          </button>
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            {t('lumen.adminUsers.cancel', 'Cancel')}
          </button>
        </div>
      </form>
    </Section>
  );
}

function EditProfile({
  id,
  canEditEmail,
  onSaved,
}: {
  id: number;
  canEditEmail: boolean;
  onSaved: () => void;
}) {
  const { t } = useLumenLocale();
  const path = `/user/${id}/settings/main`;
  const formatError = useCallback(
    (error: unknown, fallback: string) => friendlyError(error, fallback, t),
    [t]
  );
  const profile = useApi<{
    username?: string | null;
    email?: string | null;
  }>(path, { formatError });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const working = useRef(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile.data || working.current) return;
    const fields = new FormData(event.currentTarget);
    const username = String(fields.get('username') ?? '').trim();
    const email = String(fields.get('email') ?? '').trim();
    const update: { username?: string; email?: string } = {};
    if (username !== (profile.data.username ?? '')) {
      if (!username) {
        setError(t('lumen.adminUsers.usernameRequired', 'Enter a username.'));
        return;
      }
      update.username = username;
    }
    if (canEditEmail && email !== (profile.data.email ?? '')) {
      if (!email) {
        setError(
          t('lumen.adminUsers.emailRequired', 'Enter an email address.')
        );
        return;
      }
      update.email = email;
    }
    if (!Object.keys(update).length) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await api<{ username?: string; email?: string }>(path, {
        method: 'POST',
        body: JSON.stringify(update),
      });
      const readback = await api<{ username?: string; email?: string }>(path);
      if (
        (update.username !== undefined &&
          (saved.username !== update.username ||
            readback.username !== update.username)) ||
        (update.email !== undefined &&
          (saved.email !== update.email || readback.email !== update.email))
      ) {
        throw new Error(
          t(
            'lumen.adminUsers.profileSaveFailure',
            'Could not save the profile.'
          )
        );
      }
      setNotice(t('lumen.adminUsers.profileSaved', 'Profile saved.'));
      profile.reload();
      onSaved();
    } catch (failure) {
      setError(
        friendlyError(
          failure,
          t(
            'lumen.adminUsers.profileSaveFailure',
            'Could not save the profile.'
          ),
          t
        )
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <ServiceNote
        error={profile.error}
        what={t('lumen.adminUsers.profile', 'profile')}
        retry={profile.reload}
      />
      {!profile.data && !profile.error && (
        <p className="note" role="status">
          {t('lumen.adminUsers.profileLoading', 'Loading profile…')}
        </p>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {profile.data && (
        <form className="toolbar" onSubmit={save}>
          <label className="sel">
            <span className="lbl">
              {t('lumen.adminUsers.username', 'Username')}
            </span>
            <input
              className="cfg-json"
              name="username"
              key={profile.data.username ?? ''}
              defaultValue={profile.data.username ?? ''}
              maxLength={100}
              disabled={busy}
            />
          </label>
          {canEditEmail && (
            <label className="sel">
              <span className="lbl">
                {t('lumen.adminUsers.email', 'Email')}
              </span>
              <input
                className="cfg-json"
                name="email"
                type="email"
                key={profile.data.email ?? 'email'}
                defaultValue={profile.data.email ?? ''}
                maxLength={254}
                disabled={busy}
              />
            </label>
          )}
          <button className="btn btn-tonal btn-sm" disabled={busy}>
            {t('lumen.adminUsers.saveProfile', 'Save Profile')}
          </button>
        </form>
      )}
    </div>
  );
}

export default function AdminUsers() {
  const { t } = useLumenLocale();
  const { userId, panel } = useParams();
  const target =
    userId && /^[1-9]\d{0,9}$/.test(userId) && Number(userId) <= 1_000_000_000
      ? Number(userId)
      : undefined;
  const { user: actor, signOut } = useAuth();
  const formatError = useCallback(
    (error: unknown, fallback: string) => friendlyError(error, fallback, t),
    [t]
  );
  const serverType = usePublicSettings()?.mediaServerType;
  const provider =
    serverType === 1
      ? 'Plex'
      : serverType === 2
        ? 'Jellyfin'
        : serverType === 3
          ? 'Emby'
          : undefined;
  const canImport = ((actor?.permissions ?? 0) & 2) !== 0 && provider;
  const [importing, setImporting] = useState(false);
  const [notificationUser, setNotificationUser] = useState<number | undefined>(
    panel === 'notifications' ? target : undefined
  );
  const [linkedUser, setLinkedUser] = useState<number | undefined>(
    panel === 'linked-accounts' ? target : undefined
  );
  const [tvAccessUser, setTvAccessUser] = useState<number | undefined>(
    panel === 'tv-request-access' ? target : undefined
  );
  const [passwordUser, setPasswordUser] = useState<number | undefined>(
    panel === 'password' ? target : undefined
  );
  const [profileUser, setProfileUser] = useState<number | undefined>(
    panel === 'main' ? target : undefined
  );
  const [loginLinksUser, setLoginLinksUser] = useState<number>();
  const [remove, setRemove] = useState<DirectoryUser>();
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const deleting = useRef(false);
  const [quotaUser, setQuotaUser] = useState<number | undefined>();
  const [categoryUser, setCategoryUser] = useState<number | undefined>();
  const [maturityUser, setMaturityUser] = useState<number | undefined>(
    panel === 'maturity' ? target : undefined
  );
  const [permissionsUser, setPermissionsUser] = useState<number | undefined>(
    panel === 'permissions' ? target : undefined
  );
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [queueUser, setQueueUser] = useState<number | undefined>(
    panel === 'episode-queue' ? target : undefined
  );
  const [notice, setNotice] = useState('');
  const search = (params.get('q') ?? '').slice(0, 200);
  const requestedSort = params.get('sort') ?? '';
  const sort = Object.hasOwn(sorts, requestedSort)
    ? requestedSort
    : 'displayname';
  const direction = params.get('direction') === 'desc' ? 'desc' : 'asc';
  const rawPage = params.get('page') ?? '';
  const page = /^[1-9]\d{0,3}$/.test(rawPage) ? Number(rawPage) : 1;
  const query = new URLSearchParams({
    take: String(pageSize),
    skip: String((page - 1) * pageSize),
    sort,
    sortDirection: direction,
  });
  if (target) query.set('includeIds', String(target));
  else if (search) query.set('q', search);
  const { data, error, reload } = useApi<{
    pageInfo: { pages: number; results: number };
    results: DirectoryUser[];
  }>(userId && !target ? null : `/user?${query}`, {
    currentPathOnly: true,
    keepDuringRefresh: true,
    formatError,
  });

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }

  function canDelete(target: DirectoryUser) {
    return (
      !!actor &&
      target.id !== 1 &&
      (actor.id === 1 || (target.permissions & 2) === 0)
    );
  }

  function canManageAuthentication(target: DirectoryUser) {
    return (
      !!actor &&
      (actor.id === target.id ||
        (actor.permissions & 2) !== 0 ||
        (BigInt(target.permissions) & ~BigInt(actor.permissions)) === 0n)
    );
  }

  function canEditUserEmail(target: DirectoryUser) {
    return (
      target.userType !== undefined &&
      target.userType !== 1 &&
      canManageAuthentication(target)
    );
  }

  function canSetUserPassword(target: DirectoryUser) {
    return (
      actor?.id !== target.id &&
      target.id !== 1 &&
      (target.permissions & 2) === 0 &&
      canManageAuthentication(target)
    );
  }

  async function deleteUser() {
    if (!remove || !canDelete(remove) || deleting.current) return;
    deleting.current = true;
    setRemoving(true);
    setRemoveError('');
    try {
      await api(`/user/${remove.id}`, { method: 'DELETE' }, 'empty');
      setRemove(undefined);
      setNotice(
        t('lumen.adminUsers.deleted', 'Deleted {name}.', {
          name: remove.displayName,
        })
      );
      if (remove.id === actor?.id) await signOut();
      else if (page > 1 && data?.results.length === 1)
        update('page', page === 2 ? '' : String(page - 1));
      else reload();
    } catch (failure) {
      setRemoveError(
        friendlyError(
          failure,
          t('lumen.adminUsers.deleteFailure', 'Could not delete the account.'),
          t
        )
      );
      setRemove(undefined);
      reload();
    } finally {
      deleting.current = false;
      setRemoving(false);
    }
  }

  return (
    <>
      <header className="ph">
        <h1>{t('lumen.adminUsers.title', 'Users')}</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin">
          {t('lumen.admin.title', 'Administration')}
        </Link>
        {userId && (
          <Link className="btn btn-quiet btn-sm" to="/admin/users">
            {t('lumen.adminUsers.allUsers', 'All Users')}
          </Link>
        )}
        <button className="btn btn-quiet btn-sm" onClick={reload}>
          {t('lumen.adminUsers.refresh', 'Refresh')}
        </button>
        {canImport && !importing && (
          <button
            className="btn btn-quiet btn-sm"
            onClick={() => setImporting(true)}
          >
            {t('lumen.adminUsers.importUsers', 'Import {provider} Users', {
              provider,
            })}
          </button>
        )}
        {!creating && (
          <button
            className="btn btn-tonal btn-sm"
            onClick={() => {
              setNotice('');
              setCreating(true);
            }}
          >
            {t('lumen.adminUsers.createLocalUser', 'Create Local User')}
          </button>
        )}
      </div>
      {canImport && importing && (
        <ImportMediaServerUsers
          key={provider}
          provider={canImport}
          onComplete={reload}
          onClose={() => setImporting(false)}
        />
      )}
      {creating && (
        <CreateLocalUser
          onCreated={(name) => {
            setCreating(false);
            setNotice(
              t('lumen.adminUsers.created', 'Created {name}.', { name })
            );
            reload();
          }}
          onClose={() => setCreating(false)}
        />
      )}
      {removeError && (
        <p className="note" role="alert">
          {removeError}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {!userId && (
        <form
          className="toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            update(
              'q',
              String(new FormData(event.currentTarget).get('q') ?? '').trim()
            );
          }}
        >
          <span className="toolbar-search">
            <label className="search">
              <input
                key={search}
                name="q"
                type="search"
                aria-label={t('lumen.adminUsers.searchUsers', 'Search Users')}
                placeholder={t('lumen.adminUsers.searchUsers', 'Search Users')}
                defaultValue={search}
                maxLength={200}
              />
            </label>
            <button className="btn btn-tonal btn-sm">
              {t('lumen.adminUsers.search', 'Search')}
            </button>
          </span>
          <label className="sel">
            <span className="lbl">
              {t('lumen.adminUsers.sortBy', 'Sort By')}
            </span>
            <select
              value={sort}
              onChange={(event) => update('sort', event.target.value)}
            >
              {Object.entries(sorts).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(`lumen.adminUsers.sort.${value}`, label)}
                </option>
              ))}
            </select>
          </label>
          <label className="sel">
            <span className="lbl">
              {t('lumen.adminUsers.sortDirection', 'Sort Direction')}
            </span>
            <select
              value={direction}
              onChange={(event) => update('direction', event.target.value)}
            >
              <option value="asc">
                {t('lumen.adminUsers.ascending', 'Ascending')}
              </option>
              <option value="desc">
                {t('lumen.adminUsers.descending', 'Descending')}
              </option>
            </select>
          </label>
        </form>
      )}
      <ServiceNote
        error={error}
        what={t('lumen.adminUsers.users', 'users')}
        retry={reload}
      />
      {userId && !target && (
        <p className="note">
          {t('lumen.adminUsers.invalidUserId', 'Invalid user ID.')}
        </p>
      )}
      {(!userId || target) && !data && !error && (
        <p className="note" role="status">
          {t('lumen.adminUsers.loading', 'Loading users…')}
        </p>
      )}
      {data?.results.length === 0 && (
        <p className="note">
          {t('lumen.adminUsers.empty', 'No users match this search.')}
        </p>
      )}
      {!!data?.results.length && (
        <ul className="setlist">
          {data.results
            .filter((user) => !target || user.id === target)
            .map((user) => (
              <li className="set user-row" key={user.id}>
                <div>
                  <Link className="go" to={`/household/${user.id}`}>
                    {user.displayName}
                  </Link>
                  {user.email && user.email !== user.displayName && (
                    <small>{user.email}</small>
                  )}
                </div>
                <div>
                  <small>
                    {user.id === 1
                      ? t('lumen.adminUsers.role.owner', 'Owner')
                      : (user.permissions & 2) !== 0
                        ? t(
                            'lumen.adminUsers.role.administrator',
                            'Administrator'
                          )
                        : (user.permissions & 8) !== 0
                          ? t(
                              'lumen.adminUsers.role.userManager',
                              'User Manager'
                            )
                          : t('lumen.adminUsers.role.member', 'Member')}
                  </small>
                  {user.requestCount !== undefined && (
                    <small>
                      {t('lumen.adminUsers.requestCount', '{count} requests', {
                        count: user.requestCount.toLocaleString(),
                      })}
                    </small>
                  )}
                </div>
                {actor && canViewUserWatchlist(actor.permissions) && (
                  <Link
                    className="btn btn-quiet btn-sm"
                    to={`/watchlist/user/${user.id}`}
                    aria-label={t(
                      'lumen.adminUsers.viewWatchlist',
                      'View Watchlist for {name}',
                      { name: user.displayName }
                    )}
                  >
                    {t('lumen.adminUsers.watchlist', 'Watchlist')}
                  </Link>
                )}
                {canViewAllRequests(actor?.permissions) && (
                  <Link
                    className="btn btn-quiet btn-sm"
                    to={`/requests?requestedBy=${user.id}`}
                    aria-label={t(
                      'lumen.adminUsers.viewRequests',
                      'View Requests for {name}',
                      { name: user.displayName }
                    )}
                  >
                    {t('lumen.adminUsers.requests', 'Requests')}
                  </Link>
                )}
                {userId ? (
                  <div className="user-manage">
                    <button
                      className="btn btn-quiet btn-sm"
                      aria-expanded={queueUser === user.id}
                      onClick={() =>
                        setQueueUser(
                          queueUser === user.id ? undefined : user.id
                        )
                      }
                    >
                      {t('lumen.adminUsers.episodeQueue', 'Episode Queue')}
                    </button>
                    {queueUser === user.id && (
                      <div
                        className="user-panel"
                        data-title={t(
                          'lumen.adminUsers.episodeQueue',
                          'Episode Queue'
                        )}
                      >
                        <ManagedEpisodeQueue
                          id={user.id}
                          name={user.displayName}
                        />
                      </div>
                    )}
                    {actor &&
                      actor.id !== user.id &&
                      (actor.id === 1 || (user.permissions & 2) === 0) && (
                        <>
                          <button
                            className="btn btn-quiet btn-sm"
                            aria-expanded={quotaUser === user.id}
                            onClick={() =>
                              setQuotaUser(
                                quotaUser === user.id ? undefined : user.id
                              )
                            }
                          >
                            {t(
                              'lumen.adminUsers.requestQuotas',
                              'Request Quotas'
                            )}
                          </button>
                          {quotaUser === user.id && (
                            <div
                              className="user-panel"
                              data-title={t(
                                'lumen.adminUsers.requestQuotas',
                                'Request Quotas'
                              )}
                            >
                              <ManagedQuotas id={user.id} />
                            </div>
                          )}
                        </>
                      )}
                    {(user.permissions & 2) === 0 && (
                      <>
                        <button
                          className="btn btn-quiet btn-sm"
                          aria-expanded={categoryUser === user.id}
                          onClick={() =>
                            setCategoryUser(
                              categoryUser === user.id ? undefined : user.id
                            )
                          }
                        >
                          {t(
                            'lumen.adminUsers.mediaCategories',
                            'Media Categories'
                          )}
                        </button>
                        {categoryUser === user.id && (
                          <div
                            className="user-panel"
                            data-title={t(
                              'lumen.adminUsers.mediaCategories',
                              'Media Categories'
                            )}
                          >
                            <ManagedMediaCategories id={user.id} />
                          </div>
                        )}
                      </>
                    )}
                    {actor &&
                      (actor.id === user.id ||
                        actor.id === 1 ||
                        (user.permissions & 2) === 0) && (
                        <>
                          <button
                            className="btn btn-quiet btn-sm"
                            aria-expanded={maturityUser === user.id}
                            onClick={() =>
                              setMaturityUser(
                                maturityUser === user.id ? undefined : user.id
                              )
                            }
                          >
                            {t(
                              'lumen.adminUsers.maturityLimits',
                              'Maturity Limits'
                            )}
                          </button>
                          {maturityUser === user.id && (
                            <div
                              className="user-panel"
                              data-title={t(
                                'lumen.adminUsers.maturityLimits',
                                'Maturity Limits'
                              )}
                            >
                              <ManagedMaturity id={user.id} />
                            </div>
                          )}
                        </>
                      )}
                    {actor &&
                      user.id !== 1 &&
                      actor.id !== user.id &&
                      (actor.id === 1 || (user.permissions & 2) === 0) && (
                        <>
                          <button
                            className="btn btn-quiet btn-sm"
                            aria-expanded={permissionsUser === user.id}
                            onClick={() =>
                              setPermissionsUser(
                                permissionsUser === user.id
                                  ? undefined
                                  : user.id
                              )
                            }
                          >
                            {t('lumen.adminUsers.permissions', 'Permissions')}
                          </button>
                          {permissionsUser === user.id && (
                            <div
                              className="user-panel"
                              data-title={t(
                                'lumen.adminUsers.permissions',
                                'Permissions'
                              )}
                            >
                              <ManagedPermissions
                                id={user.id}
                                name={user.displayName}
                                actorId={actor.id}
                                actorPermissions={actor.permissions}
                                onSaved={reload}
                              />
                            </div>
                          )}
                        </>
                      )}
                    {actor &&
                      (actor.id === user.id ||
                        actor.id === 1 ||
                        (user.permissions & 2) === 0) && (
                        <>
                          <button
                            className="btn btn-quiet btn-sm"
                            aria-expanded={profileUser === user.id}
                            onClick={() =>
                              setProfileUser(
                                profileUser === user.id ? undefined : user.id
                              )
                            }
                          >
                            {t('lumen.adminUsers.editProfile', 'Edit Profile')}
                          </button>
                          {profileUser === user.id && (
                            <div
                              className="user-panel"
                              data-title={t(
                                'lumen.adminUsers.editProfile',
                                'Edit Profile'
                              )}
                            >
                              <EditProfile
                                id={user.id}
                                canEditEmail={canEditUserEmail(user)}
                                onSaved={reload}
                              />
                            </div>
                          )}
                        </>
                      )}
                    {isAdministrator(actor?.permissions) && (
                      <>
                        <button
                          className="btn btn-quiet btn-sm"
                          aria-expanded={loginLinksUser === user.id}
                          onClick={() =>
                            setLoginLinksUser((current) =>
                              current === user.id ? undefined : user.id
                            )
                          }
                        >
                          {t('lumen.adminUsers.signInLinks', 'Sign-in Links')}
                        </button>
                        {loginLinksUser === user.id && (
                          <div
                            className="user-panel"
                            data-title={t(
                              'lumen.adminUsers.signInLinks',
                              'Sign-in Links'
                            )}
                          >
                            <ManagedLoginLinks key={user.id} id={user.id} />
                          </div>
                        )}
                      </>
                    )}
                    {canSetUserPassword(user) && (
                      <>
                        <button
                          className="btn btn-quiet btn-sm"
                          aria-expanded={passwordUser === user.id}
                          onClick={() =>
                            setPasswordUser(
                              passwordUser === user.id ? undefined : user.id
                            )
                          }
                        >
                          {t(
                            'lumen.adminUsers.setLocalPassword',
                            'Set Local Password'
                          )}
                        </button>
                        {passwordUser === user.id && (
                          <div
                            className="user-panel"
                            data-title={t(
                              'lumen.adminUsers.setLocalPassword',
                              'Set Local Password'
                            )}
                          >
                            <ManagedPassword
                              id={user.id}
                              name={user.displayName}
                            />
                          </div>
                        )}
                      </>
                    )}
                    <button
                      className="btn btn-quiet btn-sm"
                      aria-expanded={tvAccessUser === user.id}
                      onClick={() =>
                        setTvAccessUser(
                          tvAccessUser === user.id ? undefined : user.id
                        )
                      }
                    >
                      {t(
                        'lumen.adminUsers.tvRequestAccess',
                        'TV Request Access'
                      )}
                    </button>
                    {tvAccessUser === user.id && (
                      <div
                        className="user-panel"
                        data-title={t(
                          'lumen.adminUsers.tvRequestAccess',
                          'TV Request Access'
                        )}
                      >
                        <ManagedTvAccess id={user.id} />
                      </div>
                    )}
                    <button
                      className="btn btn-quiet btn-sm"
                      aria-expanded={linkedUser === user.id}
                      onClick={() =>
                        setLinkedUser(
                          linkedUser === user.id ? undefined : user.id
                        )
                      }
                    >
                      {t('lumen.adminUsers.linkedAccounts', 'Linked Accounts')}
                    </button>
                    {linkedUser === user.id && (
                      <div
                        className="user-panel"
                        data-title={t(
                          'lumen.adminUsers.linkedAccounts',
                          'Linked Accounts'
                        )}
                      >
                        <ManagedLinkedAccounts
                          id={user.id}
                          media={
                            provider === 'Plex' && user.plexId
                              ? {
                                  key: 'plex',
                                  name: provider,
                                  username: user.plexUsername,
                                }
                              : (provider === 'Jellyfin' ||
                                    provider === 'Emby') &&
                                  user.jellyfinUserId
                                ? {
                                    key: 'jellyfin',
                                    name: provider,
                                    username: user.jellyfinUsername,
                                  }
                                : undefined
                          }
                          canUnlink={
                            !!actor &&
                            (actor.id === user.id ||
                              actor.id === 1 ||
                              (user.permissions & 2) === 0) &&
                            canManageAuthentication(user)
                          }
                          onSaved={reload}
                        />
                      </div>
                    )}
                    {actor &&
                      (actor.id === user.id ||
                        actor.id === 1 ||
                        (user.permissions & 2) === 0) && (
                        <>
                          <button
                            className="btn btn-quiet btn-sm"
                            aria-expanded={notificationUser === user.id}
                            onClick={() =>
                              setNotificationUser(
                                notificationUser === user.id
                                  ? undefined
                                  : user.id
                              )
                            }
                          >
                            {t(
                              'lumen.adminUsers.notificationSettings',
                              'Notification Settings'
                            )}
                          </button>
                          {notificationUser === user.id && (
                            <div
                              className="user-panel"
                              data-title={t(
                                'lumen.adminUsers.notificationSettings',
                                'Notification Settings'
                              )}
                            >
                              <Suspense
                                fallback={
                                  <p className="note" role="status">
                                    {t(
                                      'lumen.adminUsers.notificationsLoading',
                                      'Loading notification settings…'
                                    )}
                                  </p>
                                }
                              >
                                <UserNotifications
                                  id={user.id}
                                  manageBrowser={actor.id === user.id}
                                />
                              </Suspense>
                            </div>
                          )}
                        </>
                      )}
                    {canDelete(user) && (
                      <button
                        className="btn btn-quiet btn-sm"
                        disabled={removing}
                        onClick={() => {
                          setNotice('');
                          setRemoveError('');
                          setRemove(user);
                        }}
                      >
                        {t('lumen.adminUsers.deleteUser', 'Delete User')}
                      </button>
                    )}
                  </div>
                ) : (
                  <Link
                    className="btn btn-tonal btn-sm"
                    to={`/admin/users/${user.id}`}
                    aria-label={t(
                      'lumen.adminUsers.manageUser',
                      'Manage {name}',
                      { name: user.displayName }
                    )}
                  >
                    {t('lumen.adminUsers.manage', 'Manage')}
                  </Link>
                )}
              </li>
            ))}
        </ul>
      )}
      {(page > 1 || (data?.pageInfo.pages ?? 0) > 1) && (
        <div className="toolbar">
          <button
            className="btn btn-quiet btn-sm"
            disabled={page <= 1}
            onClick={() => update('page', page === 2 ? '' : String(page - 1))}
          >
            {t('lumen.adminUsers.previousPage', 'Previous Page')}
          </button>
          <span>{t('lumen.adminUsers.page', 'Page {page}', { page })}</span>
          <button
            className="btn btn-quiet btn-sm"
            disabled={!data || page >= Math.min(9999, data.pageInfo.pages)}
            onClick={() => update('page', String(page + 1))}
          >
            {t('lumen.adminUsers.nextPage', 'Next Page')}
          </button>
        </div>
      )}
      {remove && (
        <ConfirmSheet
          title={t('lumen.adminUsers.deleteTitle', 'Delete {name}?', {
            name: remove.displayName,
          })}
          body={t(
            'lumen.adminUsers.deleteWarning',
            'This permanently deletes the account and its request history.'
          )}
          confirm={t('lumen.adminUsers.deleteUser', 'Delete User')}
          cancel={t('lumen.adminUsers.keepUser', 'Keep User')}
          busy={removing}
          onConfirm={() => void deleteUser()}
          onClose={() => {
            if (!deleting.current) setRemove(undefined);
          }}
        />
      )}
    </>
  );
}

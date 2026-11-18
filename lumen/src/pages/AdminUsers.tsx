import { lazy, Suspense, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Section } from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { canViewAllRequests } from '../components/detail';
import { ServiceNote } from '../components/extra';
import ImportMediaServerUsers from '../components/ImportMediaServerUsers';
import ManagedEpisodeQueue from '../components/ManagedEpisodeQueue';
import ManagedLinkedAccounts from '../components/ManagedLinkedAccounts';
import ManagedMaturity from '../components/ManagedMaturity';
import ManagedMediaCategories from '../components/ManagedMediaCategories';
import ManagedPassword from '../components/ManagedPassword';
import ManagedPermissions from '../components/ManagedPermissions';
import ManagedQuotas from '../components/ManagedQuotas';
import ManagedTvAccess from '../components/ManagedTvAccess';
import { friendlyError } from '../errors';
import { useApi, usePublicSettings } from '../hooks';
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
      setError('Enter a username.');
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
      setError(friendlyError(failure, 'Could not create the account.'));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title="Create Local User">
      <form onSubmit={create} autoComplete="off">
        <div className="setlist">
          <label className="set">
            <span>Username</span>
            <input
              className="cfg-json"
              name="username"
              maxLength={100}
              required
              disabled={busy}
            />
          </label>
          <label className="set">
            <span>Email</span>
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
            <span>Email a password setup link</span>
            <input
              type="checkbox"
              checked={emailSetup}
              disabled={busy}
              onChange={(event) => setEmailSetup(event.target.checked)}
            />
          </label>
          {!emailSetup && (
            <label className="set">
              <span>Password</span>
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
            Setup links require an application URL and email notifications.
          </p>
        )}
        {error && (
          <p className="note" role="alert">
            {error}
          </p>
        )}
        <div className="toolbar">
          <button className="btn btn-tonal btn-sm" disabled={busy}>
            {busy ? 'Creating…' : 'Create User'}
          </button>
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
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
  const path = `/user/${id}/settings/main`;
  const profile = useApi<{ username?: string | null; email?: string | null }>(
    path
  );
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
        setError('Enter a username.');
        return;
      }
      update.username = username;
    }
    if (canEditEmail && email !== (profile.data.email ?? '')) {
      if (!email) {
        setError('Enter an email address.');
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
      await api(path, { method: 'POST', body: JSON.stringify(update) });
      setNotice('Profile saved.');
      profile.reload();
      onSaved();
    } catch (failure) {
      setError(friendlyError(failure, 'Could not save the profile.'));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <ServiceNote
        error={profile.error}
        what="profile"
        retry={profile.reload}
      />
      {!profile.data && !profile.error && (
        <p className="note" role="status">
          Loading profile…
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
            <span className="lbl">Username</span>
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
              <span className="lbl">Email</span>
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
            Save Profile
          </button>
        </form>
      )}
    </div>
  );
}

export default function AdminUsers() {
  const { userId, panel } = useParams();
  const target =
    userId && /^[1-9]\d{0,9}$/.test(userId) && Number(userId) <= 1_000_000_000
      ? Number(userId)
      : undefined;
  const { user: actor, signOut } = useAuth();
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
      setNotice(`Deleted ${remove.displayName}.`);
      if (remove.id === actor?.id) await signOut();
      else if (page > 1 && data?.results.length === 1)
        update('page', page === 2 ? '' : String(page - 1));
      else reload();
    } catch (failure) {
      setRemoveError(friendlyError(failure, 'Could not delete the account.'));
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
        <h1>Users</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me">
          Back to Account
        </Link>
        {userId && (
          <Link className="btn btn-quiet btn-sm" to="/admin/users">
            All Users
          </Link>
        )}
        <button className="btn btn-quiet btn-sm" onClick={reload}>
          Refresh
        </button>
        {canImport && !importing && (
          <button
            className="btn btn-quiet btn-sm"
            onClick={() => setImporting(true)}
          >
            Import {provider} Users
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
            Create Local User
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
            setNotice(`Created ${name}.`);
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
          <label className="sel">
            <span className="lbl">Search Users</span>
            <input
              className="cfg-json"
              key={search}
              name="q"
              defaultValue={search}
              maxLength={200}
            />
          </label>
          <button className="btn btn-tonal btn-sm">Search</button>
          <label className="sel">
            <span className="lbl">Sort By</span>
            <select
              value={sort}
              onChange={(event) => update('sort', event.target.value)}
            >
              {Object.entries(sorts).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="sel">
            <span className="lbl">Sort Direction</span>
            <select
              value={direction}
              onChange={(event) => update('direction', event.target.value)}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
        </form>
      )}
      <ServiceNote error={error} what="users" retry={reload} />
      {userId && !target && <p className="note">Invalid user ID.</p>}
      {(!userId || target) && !data && !error && (
        <p className="note" role="status">
          Loading users…
        </p>
      )}
      {data?.results.length === 0 && (
        <p className="note">No users match this search.</p>
      )}
      {!!data?.results.length && (
        <ul className="setlist">
          {data.results
            .filter((user) => !target || user.id === target)
            .map((user) => (
              <li className="set" key={user.id}>
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
                      ? 'Owner'
                      : (user.permissions & 2) !== 0
                        ? 'Administrator'
                        : (user.permissions & 8) !== 0
                          ? 'User Manager'
                          : 'Member'}
                  </small>
                  {user.requestCount !== undefined && (
                    <small>{user.requestCount.toLocaleString()} requests</small>
                  )}
                </div>
                {actor && canViewUserWatchlist(actor.permissions) && (
                  <Link
                    className="btn btn-quiet btn-sm"
                    to={`/watchlist/user/${user.id}`}
                    aria-label={`View Watchlist for ${user.displayName}`}
                  >
                    Watchlist
                  </Link>
                )}
                {canViewAllRequests(actor?.permissions) && (
                  <Link
                    className="btn btn-quiet btn-sm"
                    to={`/requests?requestedBy=${user.id}`}
                    aria-label={`View Requests for ${user.displayName}`}
                  >
                    Requests
                  </Link>
                )}
                <button
                  className="btn btn-quiet btn-sm"
                  aria-expanded={queueUser === user.id}
                  onClick={() =>
                    setQueueUser(queueUser === user.id ? undefined : user.id)
                  }
                >
                  Episode Queue
                </button>
                {queueUser === user.id && (
                  <ManagedEpisodeQueue id={user.id} name={user.displayName} />
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
                        Request Quotas
                      </button>
                      {quotaUser === user.id && <ManagedQuotas id={user.id} />}
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
                      Media Categories
                    </button>
                    {categoryUser === user.id && (
                      <ManagedMediaCategories id={user.id} />
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
                        Maturity Limits
                      </button>
                      {maturityUser === user.id && (
                        <ManagedMaturity id={user.id} />
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
                            permissionsUser === user.id ? undefined : user.id
                          )
                        }
                      >
                        Permissions
                      </button>
                      {permissionsUser === user.id && (
                        <ManagedPermissions
                          id={user.id}
                          name={user.displayName}
                          actorId={actor.id}
                          actorPermissions={actor.permissions}
                          onSaved={reload}
                        />
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
                        Edit Profile
                      </button>
                      {profileUser === user.id && (
                        <EditProfile
                          id={user.id}
                          canEditEmail={canEditUserEmail(user)}
                          onSaved={reload}
                        />
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
                      Set Local Password
                    </button>
                    {passwordUser === user.id && (
                      <ManagedPassword id={user.id} name={user.displayName} />
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
                  TV Request Access
                </button>
                {tvAccessUser === user.id && <ManagedTvAccess id={user.id} />}
                <button
                  className="btn btn-quiet btn-sm"
                  aria-expanded={linkedUser === user.id}
                  onClick={() =>
                    setLinkedUser(linkedUser === user.id ? undefined : user.id)
                  }
                >
                  Linked Accounts
                </button>
                {linkedUser === user.id && (
                  <ManagedLinkedAccounts
                    id={user.id}
                    media={
                      provider === 'Plex' && user.plexId
                        ? {
                            key: 'plex',
                            name: provider,
                            username: user.plexUsername,
                          }
                        : (provider === 'Jellyfin' || provider === 'Emby') &&
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
                            notificationUser === user.id ? undefined : user.id
                          )
                        }
                      >
                        Notification Settings
                      </button>
                      {notificationUser === user.id && (
                        <div>
                          <Suspense
                            fallback={
                              <p className="note" role="status">
                                Loading notification settings…
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
                    Delete User
                  </button>
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
            Previous Page
          </button>
          <span>Page {page}</span>
          <button
            className="btn btn-quiet btn-sm"
            disabled={!data || page >= Math.min(9999, data.pageInfo.pages)}
            onClick={() => update('page', String(page + 1))}
          >
            Next Page
          </button>
        </div>
      )}
      {remove && (
        <ConfirmSheet
          title={`Delete ${remove.displayName}?`}
          body="This permanently deletes the account and its request history."
          confirm="Delete User"
          cancel="Keep User"
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

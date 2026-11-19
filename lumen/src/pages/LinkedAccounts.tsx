import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type User } from '../api';
import {
  linkPlexAccount,
  linkQuickConnectAccount,
  startQuickConnect,
  useAuth,
} from '../auth';
import { ConfirmSheet } from '../components/ConfirmSheet';
import DiscoveryAccounts from '../components/DiscoveryAccounts';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi, usePublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';
import { completeOidc, readOidcCallback, startOidcLink } from '../oidc';
import { sessionGeneration } from '../sessionState';

interface Account {
  id: number;
  username: string;
  provider: { name: string; slug: string };
}

function Accounts({ user }: { user: User }) {
  const { t } = useLumenLocale();
  const text = (
    key: string,
    fallback: string,
    values?: Record<string, string | number>
  ) => t(`lumen.account.linked.${key}`, fallback, values);
  const { refresh: refreshUser } = useAuth();
  const settings = usePublicSettings();
  const base = `/user/${user.id}/settings`;
  const path = base + '/linked-accounts';
  const linked = useApi<Account[]>(path);
  const passwordState = useApi<{ hasPassword: boolean }>(base + '/password');
  const [target, setTarget] = useState<{ id: string; name: string }>();
  const [removed, setRemoved] = useState<string[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const working = useRef(false);
  const authorization = useRef<AbortController | undefined>(undefined);
  const [code, setCode] = useState('');
  const [authorizing, setAuthorizing] = useState(false);
  useEffect(() => () => authorization.current?.abort(), []);

  const [callback] = useState(readOidcCallback);
  const callbackWork = useRef<Promise<string> | undefined>(undefined);
  const accountId = user.id;
  const refreshLinks = linked.refresh;
  useEffect(() => {
    if (!callback) return;
    let active = true;
    if (!callbackWork.current) {
      window.history.replaceState(window.history.state, '', callback.pathname);
      callbackWork.current = completeOidc(callback, accountId);
    }
    working.current = true;
    setBusy(true);
    void callbackWork.current
      .then(() => {
        if (!active) return;
        setNotice(text('linkedNotice', 'Account linked.'));
        refreshLinks();
      })
      .catch(() => {
        if (active)
          setFailure(
            text(
              'oidcFailure',
              'Could not complete the identity provider link. Start again from Linked Accounts.'
            )
          );
      })
      .finally(() => {
        if (active) {
          working.current = false;
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [callback, accountId, refreshLinks]);

  async function linkIdentity(slug: string) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setFailure('');
    try {
      await startOidcLink(slug, user.id);
    } catch {
      setFailure(
        text(
          'authorizationStartFailure',
          'Could not start authorization. Check the provider configuration and SeerrNG application URL.'
        )
      );
      working.current = false;
      setBusy(false);
    }
  }

  const accounts = linked.data?.filter(
    (account) => !removed.includes(String(account.id))
  );
  const media =
    user.userType === 1
      ? { id: 'plex', name: 'Plex', username: user.plexUsername }
      : user.userType === 3
        ? { id: 'jellyfin', name: 'Jellyfin', username: user.jellyfinUsername }
        : user.userType === 4
          ? { id: 'jellyfin', name: 'Emby', username: user.jellyfinUsername }
          : undefined;
  const mediaLinked = !!media && !removed.includes(media.id);
  const mediaConfigured =
    media?.name === 'Plex'
      ? settings?.mediaServerType === 1
      : media?.name === 'Jellyfin'
        ? settings?.mediaServerType === 2
        : media?.name === 'Emby' && settings?.mediaServerType === 3;
  const local = passwordState.data?.hasPassword === true;
  const canLink =
    !mediaLinked &&
    (settings?.mediaServerType === 3 ||
      (settings?.mediaServerType === 2 && !settings.jellyfinQuickConnectOnly));
  const provider = settings?.mediaServerType === 3 ? 'Emby' : 'Jellyfin';

  async function linkProvider(kind: 'plex' | 'jellyfin') {
    if (working.current || mediaLinked) return;
    working.current = true;
    const controller = new AbortController();
    authorization.current = controller;
    const generation = sessionGeneration();
    setAuthorizing(true);
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      if (kind === 'plex') {
        await linkPlexAccount(user.id, controller.signal);
      } else {
        const credentials = await startQuickConnect(controller.signal);
        if (controller.signal.aborted || generation !== sessionGeneration())
          return;
        setCode(credentials.code);
        await linkQuickConnectAccount(
          user.id,
          credentials.secret,
          controller.signal
        );
      }
      if (controller.signal.aborted || generation !== sessionGeneration())
        return;
      setRemoved((ids) => ids.filter((id) => id !== kind));
      setNotice(text('linkedNotice', 'Account linked.'));
      linked.refresh();
      await refreshUser();
    } catch {
      if (!controller.signal.aborted && generation === sessionGeneration()) {
        setFailure(
          kind === 'plex'
            ? text(
                'plexFailure',
                'Could not complete Plex authorization or link the account.'
              )
            : text(
                'quickConnectFailure',
                'Could not complete Quick Connect. Start again for a new code.'
              )
        );
      }
    } finally {
      authorization.current = undefined;
      working.current = false;
      setCode('');
      setAuthorizing(false);
      setBusy(false);
    }
  }

  async function change(action: 'link' | 'unlink') {
    if (
      working.current ||
      (action === 'link'
        ? !canLink || !username.trim() || !password.trim()
        : !target)
    )
      return;
    working.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    const generation = sessionGeneration();
    try {
      if (action === 'unlink' && target) {
        await api<void>(`${path}/${encodeURIComponent(target.id)}`, {
          method: 'DELETE',
        });
        if (generation !== sessionGeneration()) return;
        setRemoved((ids) => [...ids, target.id]);
        setNotice(text('unlinkedNotice', 'Account unlinked.'));
      } else {
        await api<void>(path + '/jellyfin', {
          method: 'POST',
          body: JSON.stringify({ username: username.trim(), password }),
        });
        if (generation !== sessionGeneration()) return;
        setRemoved((ids) => ids.filter((id) => id !== 'jellyfin'));
        setUsername('');
        setNotice(text('linkedNotice', 'Account linked.'));
      }
      linked.refresh();
      await refreshUser();
    } catch (err) {
      if (generation !== sessionGeneration()) return;
      setFailure(
        err instanceof ApiError && err.status === 400 && action === 'unlink'
          ? text(
              'unlinkBlocked',
              'SeerrNG blocked unlinking. Check that you have another way to sign in.'
            )
          : action === 'link'
            ? text(
                'linkFailure',
                'Could not link the account. Check your media-server credentials and try again.'
              )
            : text(
                'unlinkFailure',
                'Could not confirm unlinking. Refresh the linked accounts before trying again.'
              )
      );
      linked.reload();
    } finally {
      setPassword('');
      setTarget(undefined);
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <ServiceNote
        error={linked.error}
        what={text('linkedProviders', 'linked providers')}
        retry={linked.reload}
      />
      <ServiceNote
        error={passwordState.error}
        what={text('localSignInStatus', 'local sign-in status')}
        retry={passwordState.reload}
      />
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
      <Section title={text('signInMethods', 'Sign-in Methods')}>
        <ul className="setlist">
          {local && (
            <li className="set">
              <b>{text('localPassword', 'Local Password')}</b>
            </li>
          )}
          {mediaLinked && media && (
            <li className="set">
              <div>
                <b>{media.name}</b>
                {media.username && <small>{media.username}</small>}
              </div>
              {mediaConfigured &&
                user.id !== 1 &&
                (local || !!accounts?.length) && (
                  <button
                    className="btn btn-quiet btn-sm"
                    disabled={busy}
                    onClick={() =>
                      setTarget({ id: media.id, name: media.name })
                    }
                  >
                    {text('unlinkProvider', 'Unlink {provider}', {
                      provider: media.name,
                    })}
                  </button>
                )}
            </li>
          )}
          {accounts?.map((account) => (
            <li className="set" key={account.id}>
              <div>
                <b>{account.provider.name}</b>
                <small>{account.username}</small>
              </div>
              {(local ||
                (mediaLinked && mediaConfigured) ||
                accounts.length > 1) && (
                <button
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={() =>
                    setTarget({
                      id: String(account.id),
                      name: account.provider.name,
                    })
                  }
                >
                  {text('unlinkProvider', 'Unlink {provider}', {
                    provider: account.provider.name,
                  })}
                </button>
              )}
            </li>
          ))}
        </ul>
        {!accounts && !linked.error && (
          <p className="note" role="status">
            {text('loading', 'Loading linked accounts…')}
          </p>
        )}
        {accounts?.length === 0 && !mediaLinked && (
          <p className="note">
            {t(
              'components.UserProfile.UserSettings.UserLinkedAccountsSettings.noLinkedAccounts',
              text('noProviders', 'No linked providers.')
            )}
          </p>
        )}
      </Section>
      {!mediaLinked &&
        (settings?.mediaServerType === 1 ||
          settings?.mediaServerType === 2) && (
          <Section
            title={
              settings.mediaServerType === 1
                ? text('linkMediaServer', 'Link {provider}', {
                    provider: 'Plex',
                  })
                : text('quickConnect', 'Jellyfin Quick Connect')
            }
          >
            <div className="toolbar">
              <button
                className="btn btn-tonal btn-sm"
                disabled={busy}
                onClick={() =>
                  void linkProvider(
                    settings.mediaServerType === 1 ? 'plex' : 'jellyfin'
                  )
                }
              >
                {settings.mediaServerType === 1
                  ? text('authorizePlex', 'Authorize Plex')
                  : text('startQuickConnect', 'Start Quick Connect')}
              </button>
              {authorizing && (
                <button
                  className="btn btn-quiet btn-sm"
                  onClick={() => authorization.current?.abort()}
                >
                  {text('cancelAuthorization', 'Cancel Authorization')}
                </button>
              )}
            </div>
            {authorizing && !code && (
              <p className="note" role="status">
                {text('waitingAuthorization', 'Waiting for authorization…')}
              </p>
            )}
            {code && (
              <p className="note" role="status">
                {text(
                  'quickConnectInstruction',
                  'Enter {code} in a signed-in Jellyfin app to approve linking.',
                  { code }
                )}
              </p>
            )}
          </Section>
        )}
      {accounts &&
        !!settings?.openIdProviders?.some(
          ({ slug }) => !accounts.some(({ provider }) => provider.slug === slug)
        ) && (
          <Section
            title={t(
              'components.UserProfile.UserSettings.UserLinkedAccountsSettings.linkIdentityProvider',
              'Link an Identity Provider'
            )}
          >
            <div className="toolbar">
              {settings.openIdProviders
                .filter(
                  ({ slug }) =>
                    !accounts.some(({ provider }) => provider.slug === slug)
                )
                .map(({ slug, name }) => (
                  <button
                    className="btn btn-tonal btn-sm"
                    key={slug}
                    disabled={busy}
                    onClick={() => void linkIdentity(slug)}
                  >
                    {text('linkProvider', 'Link {provider}', {
                      provider: name,
                    })}
                  </button>
                ))}
            </div>
          </Section>
        )}
      {canLink && (
        <Section
          title={text('linkMediaServer', 'Link {provider}', { provider })}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void change('link');
            }}
          >
            <div className="setlist">
              <label className="set cfg-row">
                <b>{text('mediaServerUsername', 'Media Server Username')}</b>
                <input
                  className="cfg-input"
                  value={username}
                  disabled={busy}
                  autoComplete="username"
                  maxLength={512}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              <label className="set cfg-row">
                <b>{text('mediaServerPassword', 'Media Server Password')}</b>
                <input
                  className="cfg-input"
                  type="password"
                  value={password}
                  disabled={busy}
                  autoComplete="current-password"
                  maxLength={512}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
            </div>
            <div className="toolbar">
              <button
                className="btn btn-primary btn-sm"
                disabled={busy || !username.trim() || !password.trim()}
              >
                {text('linkAccount', 'Link Account')}
              </button>
            </div>
          </form>
        </Section>
      )}
      {target && (
        <ConfirmSheet
          title={text('unlinkTitle', 'Unlink this account?')}
          body={text(
            'unlinkBody',
            'You will lose sign-in through {provider} for this account.',
            { provider: target.name }
          )}
          confirm={text('unlinkAccount', 'Unlink Account')}
          busy={busy}
          onConfirm={() => void change('unlink')}
          onClose={() => {
            if (!working.current) setTarget(undefined);
          }}
        />
      )}
    </>
  );
}

export default function LinkedAccounts() {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  return (
    <>
      <header className="ph">
        <h1>
          {t(
            'components.UserProfile.UserSettings.UserLinkedAccountsSettings.linkedAccounts',
            'Linked Accounts'
          )}
        </h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me/account">
          {t('lumen.account.backToSettings', 'Back to Account Settings')}
        </Link>
        <Link className="btn btn-quiet btn-sm" to="/library">
          {t('lumen.me.openLink', 'Open {resource}', {
            resource: t('components.Layout.Sidebar.myMedia', 'My Media'),
          })}
        </Link>
      </div>
      {user && <Accounts key={user.id} user={user} />}
      {user && (
        <DiscoveryAccounts key={`tracking-${user.id}`} userId={user.id} />
      )}
    </>
  );
}

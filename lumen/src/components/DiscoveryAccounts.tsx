import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { isAdministrator, useAuth } from '../auth';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import { ConfirmSheet } from './ConfirmSheet';
import { Section } from './cards';
import { ServiceNote } from './extra';

const base = '/integrations/discovery/accounts';
const aniListPath = base + '/anilist';
const simklPath = base + '/simkl';
const traktPath = base + '/trakt';
const traktAttemptKey = 'lumen-trakt-attempt';
const providerNames = { trakt: 'Trakt', anilist: 'AniList', simkl: 'Simkl' };
type Provider = keyof typeof providerNames;
type Account = { provider: Provider; username: string; allowWrites: boolean };
type SimklAttempt = { userCode: string; expiresAt: number; interval: number };

export default function DiscoveryAccounts({ userId }: { userId: number }) {
  const { user } = useAuth();
  const { locale, t } = useLumenLocale();
  const text = (
    key: string,
    fallback: string,
    values?: Record<string, string | number>
  ) => t(`lumen.discoveryAccounts.${key}`, fallback, values);
  const [params, setParams] = useSearchParams();
  const accounts = useApi<{ accounts: Account[] }>(base);
  const config = useApi<Partial<Record<Provider, { configured: boolean }>>>(
    '/integrations/discovery/configuration'
  );
  const [authorization, setAuthorization] = useState('');
  const [code, setCode] = useState('');
  const [simkl, setSimkl] = useState<SimklAttempt>();
  const rows = Array.isArray(accounts.data?.accounts)
    ? accounts.data.accounts
    : undefined;
  const loadError =
    accounts.error ||
    (accounts.data && !rows
      ? text('invalidResponse', 'Invalid tracking account response.')
      : null);
  const [disconnect, setDisconnect] = useState<Provider>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const working = useRef(false);
  const reloadAccounts = accounts.reload;
  const reconnect = params.get('reconnect');
  const connected = (provider: Provider) =>
    rows?.some((row) => row?.provider === provider);
  const canConnect = (provider: Provider) =>
    rows &&
    config.data?.[provider]?.configured &&
    (!connected(provider) || reconnect === provider);
  const unconfigured = (Object.keys(providerNames) as Provider[])
    .filter((provider) => config.data?.[provider]?.configured === false)
    .map((provider) => providerNames[provider]);
  function finishConnection() {
    if (reconnect) {
      const next = new URLSearchParams(params);
      next.delete('reconnect');
      setParams(next, { replace: true });
    }
    reloadAccounts();
  }
  const finishSimkl = useEffectEvent(finishConnection);
  const handleTraktReturn = useEffectEvent(() => {
    const completed = params.get('traktComplete') === '1';
    const error = params.get('traktError');
    if (!completed && !error) return;
    const next = new URLSearchParams(params);
    next.delete('traktComplete');
    next.delete('traktError');
    setParams(next, { replace: true });
    if (sessionStorage.getItem(traktAttemptKey) !== String(userId)) return;
    sessionStorage.removeItem(traktAttemptKey);
    if (error) {
      setFailure(
        error === 'denied'
          ? text('traktDenied', 'Trakt authorization was denied.')
          : text('traktExpired', 'Trakt authorization expired. Start again.')
      );
      return;
    }
    void act(
      async () => {
        const result = await api<{ status: string }>(traktPath + '/complete', {
          method: 'POST',
          body: '{}',
        });
        if (result.status !== 'authorized')
          throw new Error(
            text('traktIncomplete', 'Trakt authorization did not complete.')
          );
      },
      reloadAccounts,
      text('connectFailure', 'Could not connect {provider}.', {
        provider: 'Trakt',
      })
    );
  });

  useEffect(() => {
    handleTraktReturn();
  }, [params]);

  function startTrakt() {
    return act(
      async () => {
        const result = await api<{ authorizeUrl: string }>(
          traktPath + '/connect',
          {
            method: 'POST',
            body: JSON.stringify({
              frontend: import.meta.env.BASE_URL.endsWith('/lumen/')
                ? 'bundled'
                : 'standalone',
            }),
          }
        );
        const link = new URL(result.authorizeUrl);
        if (
          link.origin !== 'https://auth.trakt.tv' ||
          link.pathname !== '/oauth/authorize' ||
          link.username ||
          link.password
        )
          throw new Error(
            text('invalidTraktLink', 'Invalid Trakt authorization link.')
          );
        const callback = new URL(link.searchParams.get('redirect_uri') ?? '');
        if (callback.origin !== window.location.origin)
          throw new Error(
            text(
              'applicationUrl',
              'Open Lumen at the configured SeerrNG application URL to connect Trakt.'
            )
          );
        return link.href;
      },
      (url) => {
        sessionStorage.setItem(traktAttemptKey, String(userId));
        window.location.assign(url);
      },
      text('startFailure', 'Could not start {provider} authorization.', {
        provider: 'Trakt',
      })
    );
  }

  useEffect(() => {
    if (!simkl) return;
    const { expiresAt, interval: initialInterval } = simkl;
    const controller = new AbortController();
    const generation = sessionGeneration();
    let timer: ReturnType<typeof setTimeout>;
    const active = () =>
      !controller.signal.aborted && generation === sessionGeneration();
    const expire = () => {
      setSimkl(undefined);
      setFailure(
        text(
          'simklExpired',
          'Simkl authorization expired. Start again for a new code.'
        )
      );
    };
    function schedule(interval: number) {
      const remaining = expiresAt - Date.now();
      timer = setTimeout(
        poll,
        Math.max(0, Math.min(interval * 1000, remaining))
      );
    }
    async function poll() {
      if (!active()) return;
      if (Date.now() >= expiresAt) return expire();
      try {
        const result = await api<{ status: string; interval?: number }>(
          simklPath + '/complete',
          {
            method: 'POST',
            body: '{}',
            signal: controller.signal,
          }
        );
        if (!active()) return;
        if (result.status === 'authorized') {
          setSimkl(undefined);
          finishSimkl();
        } else if (
          result.status === 'pending' ||
          result.status === 'slow_down'
        ) {
          schedule(Math.max(5, result.interval || initialInterval));
        } else {
          expire();
        }
      } catch (error) {
        if (!active()) return;
        setSimkl(undefined);
        setFailure(
          friendlyError(
            error,
            text('connectFailure', 'Could not connect {provider}.', {
              provider: 'Simkl',
            })
          )
        );
      }
    }
    schedule(initialInterval);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [simkl]);

  async function act<T>(
    work: () => Promise<T>,
    onSuccess: (result: T) => void,
    fallback: string
  ) {
    if (working.current || simkl) return;
    const generation = sessionGeneration();
    working.current = true;
    setBusy(true);
    setFailure('');
    try {
      const result = await work();
      if (generation !== sessionGeneration()) return;
      onSuccess(result);
    } catch (error) {
      if (generation === sessionGeneration())
        setFailure(friendlyError(error, fallback));
    } finally {
      working.current = false;
      if (generation === sessionGeneration()) setBusy(false);
    }
  }

  function startSimkl() {
    return act(
      async () => {
        const result = await api<{
          userCode: string;
          expiresIn: number;
          interval: number;
        }>(simklPath + '/connect', { method: 'POST', body: '{}' });
        if (
          !result.userCode ||
          !Number.isFinite(result.expiresIn) ||
          result.expiresIn <= 0
        )
          throw new Error(
            text('invalidSimklCode', 'Invalid Simkl device code.')
          );
        return {
          userCode: result.userCode,
          expiresAt: Date.now() + result.expiresIn * 1000,
          interval: Math.max(5, result.interval || 5),
        };
      },
      setSimkl,
      text('startFailure', 'Could not start {provider} authorization.', {
        provider: 'Simkl',
      })
    );
  }

  function update(provider: Provider, allowWrites?: boolean) {
    const path = `${base}/${provider}`;
    return act(
      () =>
        allowWrites === undefined
          ? api<void>(path, { method: 'DELETE' })
          : api<void>(path + '/preferences', {
              method: 'PUT',
              body: JSON.stringify({ allowWrites }),
            }),
      () => {
        setDisconnect(undefined);
        accounts.reload();
      },
      text('providerUpdateFailure', 'Could not update the tracking account.')
    );
  }

  function startAniList() {
    return act(
      async () => {
        const result = await api<{ verificationUrl: string }>(
          aniListPath + '/connect',
          {
            method: 'POST',
            body: '{}',
          }
        );
        const url = new URL(result.verificationUrl);
        if (
          url.origin !== 'https://anilist.co' ||
          url.pathname !== '/api/v2/oauth/authorize' ||
          url.username ||
          url.password
        )
          throw new Error(
            text('invalidAniListLink', 'Invalid AniList authorization link.')
          );
        return url.href;
      },
      setAuthorization,
      text('startFailure', 'Could not start {provider} authorization.', {
        provider: 'AniList',
      })
    );
  }

  function finishAniList() {
    return act(
      async () => {
        const result = await api<{ status: string }>(
          aniListPath + '/complete',
          {
            method: 'POST',
            body: JSON.stringify({ code: code.trim() }),
          }
        );
        if (result.status !== 'authorized')
          throw new Error(
            text('anilistIncomplete', 'AniList authorization did not complete.')
          );
      },
      () => {
        setCode('');
        setAuthorization('');
        finishConnection();
      },
      text('connectFailure', 'Could not connect {provider}.', {
        provider: 'AniList',
      })
    );
  }

  const startConnection = {
    trakt: startTrakt,
    anilist: startAniList,
    simkl: startSimkl,
  };

  return (
    <Section title={text('heading', 'Tracking Accounts')}>
      <ServiceNote
        error={loadError}
        what={text('accountsWhat', 'tracking accounts')}
        retry={accounts.reload}
      />
      <ServiceNote
        error={config.error}
        what={text('configurationWhat', 'tracking provider configuration')}
        retry={config.reload}
      />
      {unconfigured.length > 0 && (
        <p className="note">
          {text(
            unconfigured.length === 1
              ? 'setupRequiredSingular'
              : 'setupRequiredPlural',
            unconfigured.length === 1
              ? '{providers} requires setup before connecting.'
              : '{providers} require setup before connecting.',
            { providers: unconfigured.join(', ') }
          )}{' '}
          {isAdministrator(user?.permissions) ? (
            <Link to="/admin/discovery">
              {text('openDiscoverySettings', 'Open Discovery Settings')}
            </Link>
          ) : (
            text(
              'askAdministrator',
              'Ask your SeerrNG administrator to configure the integration.'
            )
          )}
        </p>
      )}
      {failure && !disconnect && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {!accounts.data && !loadError && (
        <p className="note" role="status">
          {text('loading', 'Loading tracking accounts…')}
        </p>
      )}
      {rows?.length === 0 && (
        <p className="note">
          {text('empty', 'No tracking accounts are connected.')}
        </p>
      )}
      {!!rows?.length && (
        <ul className="setlist">
          {rows?.map(({ provider, username, allowWrites }) => (
            <li className="set" key={provider}>
              <div>
                <b>{providerNames[provider]}</b>
                <small>{username}</small>
              </div>
              <label className="sel">
                <input
                  type="checkbox"
                  checked={allowWrites}
                  disabled={busy || !!simkl || !!authorization}
                  onChange={(event) =>
                    void update(provider, event.target.checked)
                  }
                />
                {text('allowWrites', 'Allow writes to {provider}', {
                  provider: providerNames[provider],
                })}
              </label>
              {config.data?.[provider]?.configured &&
                reconnect !== provider && (
                  <button
                    className="btn btn-quiet btn-sm"
                    disabled={busy || !!simkl || !!authorization}
                    onClick={() => void startConnection[provider]()}
                  >
                    {text('reconnect', 'Reconnect {provider}', {
                      provider: providerNames[provider],
                    })}
                  </button>
                )}
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy || !!simkl || !!authorization}
                onClick={() => {
                  setFailure('');
                  setDisconnect(provider);
                }}
              >
                {text('disconnectProvider', 'Disconnect {provider}', {
                  provider: providerNames[provider],
                })}
              </button>
            </li>
          ))}
        </ul>
      )}
      {(authorization || canConnect('anilist')) &&
        !simkl &&
        (authorization ? (
          <form
            className="toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              if (code.trim()) void finishAniList();
            }}
          >
            <a
              className="btn btn-tonal btn-sm"
              href={authorization}
              target="_blank"
              rel="noreferrer"
            >
              {text('authorizeProvider', 'Authorize on {provider}', {
                provider: 'AniList',
              })}
            </a>
            <label className="sel">
              {text('authorizationCode', '{provider} authorization code', {
                provider: 'AniList',
              })}
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                maxLength={4096}
                autoComplete="off"
                disabled={busy}
              />
            </label>
            <button
              className="btn btn-primary btn-sm"
              type="submit"
              disabled={busy || !code.trim()}
            >
              {text('completeConnection', 'Complete {provider} Connection', {
                provider: 'AniList',
              })}
            </button>
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              disabled={busy}
              onClick={() => {
                setAuthorization('');
                setCode('');
                setFailure('');
              }}
            >
              {text('cancel', 'Cancel')}
            </button>
          </form>
        ) : (
          <button
            className="btn btn-tonal btn-sm"
            disabled={busy}
            onClick={() => void startAniList()}
          >
            {text(
              connected('anilist') ? 'reconnect' : 'connect',
              connected('anilist')
                ? 'Reconnect {provider}'
                : 'Connect {provider}',
              { provider: 'AniList' }
            )}
          </button>
        ))}
      {simkl ? (
        <div className="toolbar">
          <p className="note" role="status">
            {text(
              'simklInstruction',
              'Enter {code} on Simkl. This code expires at {time}.',
              {
                code: simkl.userCode,
                time: new Date(simkl.expiresAt).toLocaleTimeString(locale),
              }
            )}
          </p>
          <a
            className="btn btn-tonal btn-sm"
            href="https://simkl.com/pin/"
            target="_blank"
            rel="noreferrer"
          >
            {text('authorizeProvider', 'Authorize on {provider}', {
              provider: 'Simkl',
            })}
          </a>
          <button
            className="btn btn-quiet btn-sm"
            onClick={() => setSimkl(undefined)}
          >
            {text('cancelConnection', 'Cancel {provider} Connection', {
              provider: 'Simkl',
            })}
          </button>
        </div>
      ) : (
        canConnect('simkl') &&
        !authorization && (
          <button
            className="btn btn-tonal btn-sm"
            disabled={busy}
            onClick={() => void startSimkl()}
          >
            {text(
              connected('simkl') ? 'reconnect' : 'connect',
              connected('simkl')
                ? 'Reconnect {provider}'
                : 'Connect {provider}',
              { provider: 'Simkl' }
            )}
          </button>
        )
      )}
      {canConnect('trakt') && !authorization && !simkl && (
        <button
          className="btn btn-tonal btn-sm"
          disabled={busy}
          onClick={() => void startTrakt()}
        >
          {text(
            connected('trakt') ? 'reconnect' : 'connect',
            connected('trakt') ? 'Reconnect {provider}' : 'Connect {provider}',
            { provider: 'Trakt' }
          )}
        </button>
      )}
      {disconnect && (
        <ConfirmSheet
          title={text('disconnectTitle', 'Disconnect {provider}?', {
            provider: providerNames[disconnect],
          })}
          body={text(
            'disconnectBody',
            'SeerrNG will stop using this tracking account.'
          )}
          confirm={text('disconnectConfirm', 'Disconnect')}
          cancel={text('keepConnected', 'Keep connected')}
          busy={busy}
          onConfirm={() => void update(disconnect)}
          onClose={() => {
            if (!working.current) {
              setDisconnect(undefined);
              setFailure('');
            }
          }}
        >
          {failure && (
            <p className="note" role="alert">
              {failure}
            </p>
          )}
        </ConfirmSheet>
      )}
    </Section>
  );
}

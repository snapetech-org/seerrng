import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';
import { ConfirmSheet } from './ConfirmSheet';
import { Section } from './cards';
import { ServiceNote } from './extra';

const base = '/integrations/discovery/accounts';
const aniListPath = base + '/anilist';
const simklPath = base + '/simkl';
const providerNames = { trakt: 'Trakt', anilist: 'AniList', simkl: 'Simkl' };
type Provider = keyof typeof providerNames;
type Account = { provider: Provider; username: string; allowWrites: boolean };
type SimklAttempt = { userCode: string; expiresAt: number; interval: number };

export default function DiscoveryAccounts() {
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
    (accounts.data && !rows ? 'Invalid tracking account response.' : null);
  const [disconnect, setDisconnect] = useState<Provider>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const working = useRef(false);
  const reloadAccounts = accounts.reload;

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
      setFailure('Simkl authorization expired. Start again for a new code.');
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
          reloadAccounts();
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
        setFailure(friendlyError(error, 'Could not connect Simkl.'));
      }
    }
    schedule(initialInterval);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [simkl, reloadAccounts]);

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
          throw new Error('Invalid Simkl device code.');
        return {
          userCode: result.userCode,
          expiresAt: Date.now() + result.expiresIn * 1000,
          interval: Math.max(5, result.interval || 5),
        };
      },
      setSimkl,
      'Could not start Simkl authorization.'
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
      'Could not update the tracking account.'
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
          throw new Error('Invalid AniList authorization link.');
        return url.href;
      },
      setAuthorization,
      'Could not start AniList authorization.'
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
          throw new Error('AniList authorization did not complete.');
      },
      () => {
        setCode('');
        setAuthorization('');
        accounts.reload();
      },
      'Could not connect AniList.'
    );
  }

  return (
    <Section title="Tracking Accounts">
      <ServiceNote
        error={loadError}
        what="tracking accounts"
        retry={accounts.reload}
      />
      <ServiceNote
        error={config.error}
        what="tracking provider configuration"
        retry={config.reload}
      />
      {failure && !disconnect && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {!accounts.data && !loadError && (
        <p className="note" role="status">
          Loading tracking accounts…
        </p>
      )}
      {rows?.length === 0 && (
        <p className="note">No tracking accounts are connected.</p>
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
                  disabled={busy || !!simkl}
                  onChange={(event) =>
                    void update(provider, event.target.checked)
                  }
                />
                Allow writes to {providerNames[provider]}
              </label>
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy || !!simkl}
                onClick={() => {
                  setFailure('');
                  setDisconnect(provider);
                }}
              >
                Disconnect {providerNames[provider]}
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows &&
        !simkl &&
        config.data?.anilist?.configured &&
        !rows.some(({ provider }) => provider === 'anilist') &&
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
              Authorize on AniList
            </a>
            <label className="sel">
              AniList authorization code
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
              Complete AniList Connection
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
              Cancel
            </button>
          </form>
        ) : (
          <button
            className="btn btn-tonal btn-sm"
            disabled={busy}
            onClick={() => void startAniList()}
          >
            Connect AniList
          </button>
        ))}
      {simkl ? (
        <div className="toolbar">
          <p className="note" role="status">
            Enter <b>{simkl.userCode}</b> on Simkl. This code expires at{' '}
            <time dateTime={new Date(simkl.expiresAt).toISOString()}>
              {new Date(simkl.expiresAt).toLocaleTimeString()}
            </time>
            .
          </p>
          <a
            className="btn btn-tonal btn-sm"
            href="https://simkl.com/pin/"
            target="_blank"
            rel="noreferrer"
          >
            Authorize on Simkl
          </a>
          <button
            className="btn btn-quiet btn-sm"
            onClick={() => setSimkl(undefined)}
          >
            Cancel Simkl Connection
          </button>
        </div>
      ) : (
        rows &&
        !authorization &&
        config.data?.simkl?.configured &&
        !rows.some(({ provider }) => provider === 'simkl') && (
          <button
            className="btn btn-tonal btn-sm"
            disabled={busy}
            onClick={() => void startSimkl()}
          >
            Connect Simkl
          </button>
        )
      )}
      {disconnect && (
        <ConfirmSheet
          title={`Disconnect ${providerNames[disconnect]}?`}
          body="SeerrNG will stop using this tracking account."
          confirm="Disconnect"
          cancel="Keep connected"
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

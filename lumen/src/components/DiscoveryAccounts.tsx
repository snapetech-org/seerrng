import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';
import { ConfirmSheet } from './ConfirmSheet';
import { Section } from './cards';
import { ServiceNote } from './extra';

const base = '/integrations/discovery/accounts';
const aniListPath = base + '/anilist';
const providerNames = { trakt: 'Trakt', anilist: 'AniList', simkl: 'Simkl' };
type Provider = keyof typeof providerNames;
type Account = { provider: Provider; username: string; allowWrites: boolean };

export default function DiscoveryAccounts() {
  const accounts = useApi<{ accounts: Account[] }>(base);
  const config = useApi<{ anilist: { configured: boolean } }>(
    '/integrations/discovery/configuration'
  );
  const [authorization, setAuthorization] = useState('');
  const [code, setCode] = useState('');
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

  async function act<T>(
    work: () => Promise<T>,
    onSuccess: (result: T) => void,
    fallback: string
  ) {
    if (working.current) return;
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
                  disabled={busy}
                  onChange={(event) =>
                    void update(provider, event.target.checked)
                  }
                />
                Allow writes to {providerNames[provider]}
              </label>
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy}
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

import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';
import { ConfirmSheet } from './ConfirmSheet';
import { Section } from './cards';
import { ServiceNote } from './extra';

const base = '/integrations/discovery/accounts';
const providerNames = { trakt: 'Trakt', anilist: 'AniList', simkl: 'Simkl' };
type Provider = keyof typeof providerNames;
type Account = { provider: Provider; username: string; allowWrites: boolean };

export default function DiscoveryAccounts() {
  const accounts = useApi<{ accounts: Account[] }>(base);
  const rows = accounts.data?.accounts;
  const loadError =
    accounts.error ||
    (accounts.data && !Array.isArray(rows)
      ? 'Invalid tracking account response.'
      : null);
  const [disconnect, setDisconnect] = useState<Provider>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const working = useRef(false);

  async function update(provider: Provider, allowWrites?: boolean) {
    if (working.current) return;
    const generation = sessionGeneration();
    working.current = true;
    setBusy(true);
    setFailure('');
    try {
      const path = `${base}/${provider}`;
      await (allowWrites === undefined
        ? api<void>(path, { method: 'DELETE' })
        : api<void>(path + '/preferences', {
            method: 'PUT',
            body: JSON.stringify({ allowWrites }),
          }));
      if (generation !== sessionGeneration()) return;
      setDisconnect(undefined);
      accounts.reload();
    } catch (error) {
      if (generation === sessionGeneration())
        setFailure(
          friendlyError(error, 'Could not update the tracking account.')
        );
    } finally {
      working.current = false;
      if (generation === sessionGeneration()) setBusy(false);
    }
  }

  return (
    <Section title="Tracking Accounts">
      <ServiceNote
        error={loadError}
        what="tracking accounts"
        retry={accounts.reload}
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

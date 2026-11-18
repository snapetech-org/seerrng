import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { Section } from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';

type Scope = 'discover' | 'request';
interface ClientToken {
  id: number;
  name: string;
  scopes: Scope[];
  expiresAt: string;
}

const PATH = '/auth/client-tokens';
const ACCESS = {
  both: ['discover', 'request'],
  discover: ['discover'],
  request: ['request'],
};

function TokenSettings() {
  const { data, error, reload, refresh } = useApi<ClientToken[]>(PATH);
  const [name, setName] = useState('');
  const [access, setAccess] = useState<keyof typeof ACCESS>('both');
  const [days, setDays] = useState(30);
  const [created, setCreated] = useState<string>();
  const [target, setTarget] = useState<ClientToken>();
  const [revoked, setRevoked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const working = useRef(false);
  const tokens = data?.filter(({ id }) => !revoked.includes(id));
  const canCreate = !!data && !created && !!name.trim();

  async function change() {
    if (working.current || (!target && !canCreate)) return;
    working.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    const generation = sessionGeneration();
    try {
      if (target) {
        await api<void>(`${PATH}/${target.id}`, { method: 'DELETE' });
        if (sessionGeneration() !== generation) return;
        setRevoked((ids) => [...ids, target.id]);
        setNotice('Token revoked.');
      } else {
        const response = await api<{ token: string }>(PATH, {
          method: 'POST',
          cache: 'no-store',
          body: JSON.stringify({
            name: name.trim(),
            scopes: ACCESS[access],
            days,
          }),
        });
        if (sessionGeneration() !== generation) return;
        if (
          typeof response.token !== 'string' ||
          !response.token.startsWith('sngc_')
        )
          throw new Error();
        setCreated(response.token);
        setName('');
      }
      refresh();
    } catch (err) {
      if (sessionGeneration() !== generation) return;
      setFailure(
        target
          ? 'Could not confirm revocation. Refresh the list before trying again.'
          : err instanceof ApiError && err.status === 409
            ? 'Revoke an existing client token before creating another.'
            : 'Could not confirm token creation. Check your token list before trying again.'
      );
      reload();
    } finally {
      working.current = false;
      setBusy(false);
      setTarget(undefined);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setNotice('Token copied.');
    } catch {
      setFailure('Copy the token manually from the field.');
    }
  }

  return (
    <>
      <p className="note">
        Connect a client with your account’s Discover or Request access. Up to
        ten unexpired tokens are allowed. Changing your password invalidates
        them.
      </p>
      <ServiceNote error={error} what="client tokens" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          Loading client tokens…
        </p>
      )}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {created && (
        <Section title="New Token">
          <p className="note">
            Copy this token now. SeerrNG shows it only once.
          </p>
          <textarea
            className="cfg-json"
            aria-label="New Client Token"
            rows={2}
            value={created}
            readOnly
            spellCheck={false}
            autoComplete="off"
          />
          <div className="toolbar">
            <button
              className="btn btn-tonal btn-sm"
              onClick={() => void copy()}
            >
              Copy Token
            </button>
            <button
              className="btn btn-quiet btn-sm"
              onClick={() => {
                setCreated(undefined);
                setNotice('');
                setFailure('');
              }}
            >
              Dismiss Token
            </button>
          </div>
        </Section>
      )}
      <Section title="Create Token">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void change();
          }}
        >
          <div className="setlist">
            <label className="set cfg-row">
              <b>Token Name</b>
              <input
                className="cfg-input"
                maxLength={80}
                required
                value={name}
                disabled={busy || !!created}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="set cfg-row">
              <b>Access</b>
              <select
                className="cfg-select"
                value={access}
                disabled={busy || !!created}
                onChange={(event) =>
                  setAccess(event.target.value as keyof typeof ACCESS)
                }
              >
                <option value="both">Discover and Request</option>
                <option value="discover">Discover Only</option>
                <option value="request">Request Only</option>
              </select>
            </label>
            <label className="set cfg-row">
              <b>Expires After</b>
              <select
                className="cfg-select"
                value={days}
                disabled={busy || !!created}
                onChange={(event) => setDays(Number(event.target.value))}
              >
                {[1, 7, 30, 90].map((value) => (
                  <option key={value} value={value}>
                    {value} {value === 1 ? 'day' : 'days'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="toolbar">
            <button
              className="btn btn-primary btn-sm"
              disabled={busy || !canCreate}
            >
              Create Token
            </button>
          </div>
        </form>
      </Section>
      <Section title="Your Tokens">
        {tokens?.length === 0 && <p className="note">No client tokens yet.</p>}
        {!!tokens?.length && (
          <ul className="setlist">
            {tokens.map((token) => {
              const expiry = new Date(token.expiresAt);
              return (
                <li className="set" key={token.id}>
                  <div>
                    <b>{token.name}</b>
                    <small>
                      {token.scopes
                        .map((scope) =>
                          scope === 'discover' ? 'Discover' : 'Request'
                        )
                        .join(', ')}
                    </small>
                    {Number.isFinite(expiry.valueOf()) && (
                      <small>
                        {expiry.valueOf() <= Date.now() ? 'Expired' : 'Expires'}{' '}
                        {expiry.toLocaleDateString()}
                      </small>
                    )}
                  </div>
                  <button
                    className="btn btn-quiet btn-sm"
                    aria-label={`Revoke token ${token.name}`}
                    disabled={busy || !!created}
                    onClick={() => setTarget(token)}
                  >
                    Revoke
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      {target && (
        <ConfirmSheet
          title="Revoke this token?"
          body={`“${target.name}” will lose access immediately.`}
          confirm="Revoke Token"
          busy={busy}
          onConfirm={() => void change()}
          onClose={() => {
            if (!working.current) setTarget(undefined);
          }}
        />
      )}
    </>
  );
}

export default function ClientTokens() {
  const { user } = useAuth();
  return (
    <>
      <header className="ph">
        <h1>Client Tokens</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me/account">
          Back to Account Settings
        </Link>
      </div>
      {user && <TokenSettings key={user.id} />}
    </>
  );
}

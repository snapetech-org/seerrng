import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { Section } from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
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

function localizedLoadError(
  error: string | null,
  t: ReturnType<typeof useLumenLocale>['t']
) {
  if (!error) return null;
  const messages: Record<string, string> = {
    'Your session ended. Sign in again.':
      'lumen.clientTokens.loadSessionExpired',
    'You don’t have permission to do that.': 'lumen.clientTokens.loadForbidden',
    'The server took too long to answer. Try again.':
      'lumen.clientTokens.loadTimeout',
    'Too many requests. Wait a minute and try again.':
      'lumen.clientTokens.loadRateLimited',
    'The server had a problem. Try again in a moment.':
      'lumen.clientTokens.loadServerFailure',
    'Couldn’t reach the server. Check your connection and try again.':
      'lumen.clientTokens.loadNetworkFailure',
    'You’re offline. Check your connection and try again.':
      'lumen.clientTokens.loadOffline',
    'Failed to load': 'lumen.clientTokens.loadUnknownFailure',
  };
  const key = messages[error];
  return key ? t(key, error) : error;
}

function TokenSettings() {
  const { locale, t } = useLumenLocale();
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
    let succeeded = false;
    try {
      if (target) {
        await api<void>(`${PATH}/${target.id}`, { method: 'DELETE' });
        if (sessionGeneration() !== generation) return;
        succeeded = true;
        setRevoked((ids) => [...ids, target.id]);
        setNotice(t('lumen.clientTokens.revoked', 'Token revoked.'));
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
      if (succeeded) return;
      setFailure(
        target
          ? t(
              'lumen.clientTokens.revokeFailure',
              'Could not confirm revocation. Refresh the list before trying again.'
            )
          : err instanceof ApiError && err.status === 409
            ? t(
                'lumen.clientTokens.limitReached',
                'Revoke an existing client token before creating another.'
              )
            : t(
                'lumen.clientTokens.createFailure',
                'Could not confirm token creation. Check your token list before trying again.'
              )
      );
      reload();
    } finally {
      working.current = false;
      setBusy(false);
      if (!target || succeeded) setTarget(undefined);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setNotice(t('lumen.clientTokens.copied', 'Token copied.'));
    } catch {
      setFailure(
        t(
          'lumen.clientTokens.copyFailure',
          'Copy the token manually from the field.'
        )
      );
    }
  }

  return (
    <>
      <p className="note">
        {t(
          'lumen.clientTokens.description',
          'Connect a client with your account’s Discover or Request access. Up to ten unexpired tokens are allowed. Changing your password invalidates them.'
        )}
      </p>
      <ServiceNote
        error={localizedLoadError(error, t)}
        what="client tokens"
        title={t(
          'lumen.clientTokens.loadFailureTitle',
          'Could not load client tokens'
        )}
        retryLabel={t('lumen.clientTokens.retry', 'Retry')}
        retry={reload}
      />
      {!data && !error && (
        <p className="note" role="status">
          {t('lumen.clientTokens.loading', 'Loading client tokens…')}
        </p>
      )}
      {failure && !target && (
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
        <Section title={t('lumen.clientTokens.newToken', 'New Token')}>
          <p className="note">
            {t(
              'lumen.clientTokens.secretShownOnce',
              'Copy this token now. SeerrNG shows it only once.'
            )}
          </p>
          <textarea
            className="cfg-json"
            aria-label={t(
              'lumen.clientTokens.newTokenLabel',
              'New Client Token'
            )}
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
              {t('lumen.clientTokens.copyToken', 'Copy Token')}
            </button>
            <button
              className="btn btn-quiet btn-sm"
              onClick={() => {
                setCreated(undefined);
                setNotice('');
                setFailure('');
              }}
            >
              {t('lumen.clientTokens.dismissToken', 'Dismiss Token')}
            </button>
          </div>
        </Section>
      )}
      <Section title={t('lumen.clientTokens.createToken', 'Create Token')}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void change();
          }}
        >
          <div className="setlist">
            <label className="set cfg-row">
              <b>{t('lumen.clientTokens.tokenName', 'Token Name')}</b>
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
              <b>{t('lumen.clientTokens.access', 'Access')}</b>
              <select
                className="cfg-select"
                value={access}
                disabled={busy || !!created}
                onChange={(event) =>
                  setAccess(event.target.value as keyof typeof ACCESS)
                }
              >
                <option value="both">
                  {t(
                    'lumen.clientTokens.discoverAndRequest',
                    'Discover and Request'
                  )}
                </option>
                <option value="discover">
                  {t('lumen.clientTokens.discoverOnly', 'Discover Only')}
                </option>
                <option value="request">
                  {t('lumen.clientTokens.requestOnly', 'Request Only')}
                </option>
              </select>
            </label>
            <label className="set cfg-row">
              <b>{t('lumen.clientTokens.expiresAfter', 'Expires After')}</b>
              <select
                className="cfg-select"
                value={days}
                disabled={busy || !!created}
                onChange={(event) => setDays(Number(event.target.value))}
              >
                {[1, 7, 30, 90].map((value) => (
                  <option key={value} value={value}>
                    {t(
                      value === 1
                        ? 'lumen.clientTokens.day'
                        : 'lumen.clientTokens.days',
                      value === 1 ? 'day' : 'days',
                      { count: value }
                    )}
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
              {t('lumen.clientTokens.createToken', 'Create Token')}
            </button>
          </div>
        </form>
      </Section>
      <Section title={t('lumen.clientTokens.yourTokens', 'Your Tokens')}>
        {tokens?.length === 0 && (
          <p className="note">
            {t('lumen.clientTokens.empty', 'No client tokens yet.')}
          </p>
        )}
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
                          scope === 'discover'
                            ? t('lumen.clientTokens.discover', 'Discover')
                            : t('lumen.clientTokens.request', 'Request')
                        )
                        .join(', ')}
                    </small>
                    {Number.isFinite(expiry.valueOf()) && (
                      <small>
                        {t(
                          expiry.valueOf() <= Date.now()
                            ? 'lumen.clientTokens.expired'
                            : 'lumen.clientTokens.expires',
                          expiry.valueOf() <= Date.now() ? 'Expired' : 'Expires'
                        )}{' '}
                        {expiry.toLocaleDateString(locale)}
                      </small>
                    )}
                  </div>
                  <button
                    className="btn btn-quiet btn-sm"
                    aria-label={t(
                      'lumen.clientTokens.revokeNamed',
                      'Revoke token {name}',
                      { name: token.name }
                    )}
                    disabled={busy || !!created}
                    onClick={() => setTarget(token)}
                  >
                    {t('lumen.clientTokens.revoke', 'Revoke')}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
      {target && (
        <ConfirmSheet
          title={t('lumen.clientTokens.revokeTitle', 'Revoke this token?')}
          body={t(
            'lumen.clientTokens.revokeBody',
            '“{name}” will lose access immediately.',
            { name: target.name }
          )}
          confirm={t('lumen.clientTokens.revokeToken', 'Revoke Token')}
          cancel={t('lumen.clientTokens.keepToken', 'Keep Token')}
          busy={busy}
          onConfirm={() => void change()}
          onClose={() => {
            if (!working.current) setTarget(undefined);
          }}
        >
          {failure && (
            <p className="note" role="alert">
              {failure}
            </p>
          )}
        </ConfirmSheet>
      )}
    </>
  );
}

export default function ClientTokens() {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  return (
    <>
      <header className="ph">
        <h1>{t('lumen.clientTokens.title', 'Client Tokens')}</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me/account">
          {t('lumen.account.backToSettings', 'Back to Account Settings')}
        </Link>
      </div>
      {user && <TokenSettings key={user.id} />}
    </>
  );
}

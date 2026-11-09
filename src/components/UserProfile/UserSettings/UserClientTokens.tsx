import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import { PageStatus } from '@app/components/Common/LoadingSpinner';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import { useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import axios from 'axios';
import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages(
  'components.UserProfile.UserSettings.UserClientTokens',
  {
    title: 'Client Tokens',
    description:
      'Connect a browser extension or other client using your own account. Tokens retain your current permissions and content restrictions; they cannot manage users or server settings.',
    lifetime:
      'Tokens expire after at most 90 days. Password changes invalidate them. You can have up to 10 unexpired tokens; revoke any you no longer use.',
    name: 'Token Name',
    access: 'Access',
    discover: 'Discover Only',
    request: 'Request Only',
    both: 'Discover and Request',
    expiry: 'Expires After',
    days: '{days, plural, one {# day} other {# days}}',
    create: 'Create Token',
    empty: 'No client tokens yet.',
    loadFailed: 'Unable to load your client tokens.',
    createFailed:
      'Unable to create the token. Check your settings and revoke an existing token if you have reached the limit.',
    revokeFailed: 'Unable to revoke the token. Please try again.',
    retry: 'Retry',
    newToken: 'New Token',
    copyOnce:
      'Copy this token now. It will not be shown again after you leave this page or dismiss it.',
    copy: 'Copy Token',
    copied: 'Token Copied',
    copyFailed: 'Unable to copy. Reveal and copy the token manually.',
    dismiss: 'Dismiss Token',
    revoke: 'Revoke Token',
    confirmRevoke: 'Confirm Revocation',
    cancel: 'Cancel',
    expires: 'Expires: {date}',
    expired: 'Expired: {date}',
  }
);

interface ClientToken {
  id: number;
  name: string;
  scopes: ('discover' | 'request')[];
  expiresAt: string;
}

const endpoint = '/api/v1/auth/client-tokens';

const TokenSettings = ({ userId }: { userId: number }) => {
  const intl = useIntl();
  // Include account identity in the cache key; never cache the creation response.
  const { data, error, isValidating, mutate } = useSWR<ClientToken[]>(
    [endpoint, userId],
    ([url]: [string, number]) =>
      axios.get<ClientToken[]>(url).then(({ data }) => data)
  );
  const [name, setName] = useState('');
  const [access, setAccess] = useState('both');
  const [days, setDays] = useState('30');
  const [created, setCreated] = useState<
    (ClientToken & { token: string }) | null
  >(null);
  const [copied, setCopied] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const pending = useRef(false);
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending.current || created || !name.trim()) return;
    pending.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const response = await axios.post<ClientToken & { token: string }>(
        endpoint,
        {
          name: name.trim(),
          scopes: access === 'both' ? ['discover', 'request'] : [access],
          days: Number(days),
        }
      );
      setCreated(response.data);
      setCopied(false);
      setName('');
      // Readback failure must not discard the only copy of the new secret.
      void mutate().catch(() => undefined);
    } catch {
      setFailure(intl.formatMessage(messages.createFailed));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const revoke = async (id: number) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await axios.delete(`${endpoint}/${id}`);
      setConfirmId(null);
      if (created?.id === id) setCreated(null);
      // The DELETE is confirmed; remove it locally even if readback fails.
      await mutate((keys) => keys?.filter((key) => key.id !== id), {
        revalidate: false,
      });
      void mutate().catch(() => undefined);
    } catch {
      setFailure(intl.formatMessage(messages.revokeFailed));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="card-layout">
      <div className="page-title-row">
        <h2 className="page-heading">{intl.formatMessage(messages.title)}</h2>
        <PageStatus active={busy || isValidating} />
      </div>
      <p className="card-body-text">
        {intl.formatMessage(messages.description)}
      </p>
      <p className="card-body-text">{intl.formatMessage(messages.lifetime)}</p>
      {failure && <Alert type="error" title={failure} />}
      {error && (
        <div className="card-layout">
          <Alert type="error" title={intl.formatMessage(messages.loadFailed)} />
          <Button
            type="button"
            buttonIcon="retry"
            disabled={isValidating}
            onClick={() => void mutate().catch(() => undefined)}
          >
            {intl.formatMessage(messages.retry)}
          </Button>
        </div>
      )}
      <form onSubmit={(event) => void create(event)}>
        <div className="form-row settings-form-row">
          <label className="text-label" htmlFor="client-token-name">
            {intl.formatMessage(messages.name)}
          </label>
          <div className="form-input-area">
            <div className="form-input-field">
              <input
                id="client-token-name"
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={busy || !!created}
              />
            </div>
          </div>
        </div>
        <div className="form-row settings-form-row">
          <label className="text-label" htmlFor="client-token-access">
            {intl.formatMessage(messages.access)}
          </label>
          <div className="form-input-area">
            <div className="form-input-field">
              <select
                id="client-token-access"
                value={access}
                onChange={(event) => setAccess(event.target.value)}
                disabled={busy || !!created}
              >
                <option value="both">
                  {intl.formatMessage(messages.both)}
                </option>
                <option value="discover">
                  {intl.formatMessage(messages.discover)}
                </option>
                <option value="request">
                  {intl.formatMessage(messages.request)}
                </option>
              </select>
            </div>
          </div>
        </div>
        <div className="form-row settings-form-row">
          <label className="text-label" htmlFor="client-token-days">
            {intl.formatMessage(messages.expiry)}
          </label>
          <div className="form-input-area">
            <div className="form-input-field">
              <select
                id="client-token-days"
                value={days}
                onChange={(event) => setDays(event.target.value)}
                disabled={busy || !!created}
              >
                {[1, 7, 30, 90].map((value) => (
                  <option key={value} value={value}>
                    {intl.formatMessage(messages.days, { days: value })}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="actions">
          <Button
            type="submit"
            buttonType="primary"
            disabled={busy || !!created || !data || !name.trim()}
          >
            {intl.formatMessage(messages.create)}
          </Button>
        </div>
      </form>
      {created && (
        <section
          className="app-card-sub card-layout detail-summary-standalone"
          aria-label={intl.formatMessage(messages.newToken)}
        >
          <p className="card-body-text">
            {intl.formatMessage(messages.copyOnce)}
          </p>
          <label htmlFor="new-client-token">
            {intl.formatMessage(messages.newToken)}
          </label>
          <div className="form-input-field">
            <SensitiveInput
              id="new-client-token"
              readOnly
              value={created.token}
            />
          </div>
          <div className="app-action-row">
            <Button
              type="button"
              onClick={() => {
                void Promise.resolve()
                  .then(() => navigator.clipboard.writeText(created.token))
                  .then(() => setCopied(true))
                  .catch(() =>
                    setFailure(intl.formatMessage(messages.copyFailed))
                  );
              }}
            >
              {intl.formatMessage(copied ? messages.copied : messages.copy)}
            </Button>
            <Button type="button" onClick={() => setCreated(null)}>
              {intl.formatMessage(messages.dismiss)}
            </Button>
          </div>
        </section>
      )}
      {data?.length === 0 && (
        <p className="card-body-text">{intl.formatMessage(messages.empty)}</p>
      )}
      <ul className="card-list" data-list-layout="choices">
        {data?.map((key) => (
          <li key={key.id}>
            <article className="app-card-sub card-layout detail-summary-standalone">
              <h3 className="card-title">{key.name}</h3>
              <p className="card-subheading">
                {intl.formatMessage(
                  key.scopes.length === 2
                    ? messages.both
                    : key.scopes[0] === 'request'
                      ? messages.request
                      : messages.discover
                )}
              </p>
              <p className="card-body-text">
                {intl.formatMessage(
                  Date.parse(key.expiresAt) <= Date.now()
                    ? messages.expired
                    : messages.expires,
                  {
                    date: intl.formatDate(key.expiresAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  }
                )}
              </p>
              <div className="app-action-row">
                <Button
                  type="button"
                  buttonType="danger"
                  disabled={busy}
                  onClick={() => {
                    if (confirmId === key.id) void revoke(key.id);
                    else setConfirmId(key.id);
                  }}
                >
                  {intl.formatMessage(
                    confirmId === key.id
                      ? messages.confirmRevoke
                      : messages.revoke
                  )}
                </Button>
                {confirmId === key.id && (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmId(null)}
                  >
                    {intl.formatMessage(messages.cancel)}
                  </Button>
                )}
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
};

const UserClientTokens = () => {
  const { user } = useUser();
  // Remount on account changes so a previous account's one-time secret vanishes.
  return user ? <TokenSettings key={user.id} userId={user.id} /> : null;
};
export default UserClientTokens;

import { useEffect, useRef, useState } from 'react';
import { Link, useHref, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import {
  captureWatchSessionInviteTokenFromHash,
  clearStoredWatchSessionInviteToken,
  readStoredWatchSessionInviteToken,
} from '../watchSessionInvite';

const joinPath = '/watch-sessions/join';

interface Invite {
  id: number;
  status: 'open' | 'claimed' | 'expired' | 'revoked';
}

export function WatchSessionInvites({
  id,
  draft,
}: {
  id: string;
  draft: boolean;
}) {
  const { t } = useLumenLocale();
  const endpoint = `/watch-sessions/${id}/invites`;
  const invites = useApi<{ invites: Invite[] }>(endpoint);
  const href = useHref(joinPath);
  const [created, setCreated] = useState<{ id: number; url: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const pending = useRef(false);

  async function change(inviteId?: number) {
    if (pending.current || (inviteId === undefined && !draft)) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setCopied(false);
    const generation = sessionGeneration();
    try {
      if (inviteId === undefined) {
        const result = await api<{ id: number; token: string }>(endpoint, {
          method: 'POST',
        });
        if (generation !== sessionGeneration()) return;
        const url = new URL(href, window.location.origin);
        url.hash = new URLSearchParams({ token: result.token }).toString();
        setCreated({ id: result.id, url: url.href });
      } else {
        await api(`${endpoint}/${inviteId}`, { method: 'DELETE' }, 'empty');
        if (generation !== sessionGeneration()) return;
        setCreated((current) =>
          current?.id === inviteId ? undefined : current
        );
      }
      invites.reload();
    } catch (failure) {
      if (generation === sessionGeneration())
        setError(
          failure instanceof ApiError
            ? failure.message
            : t(
                'lumen.watchSessions.inviteUpdateFailed',
                'Could not update the invitation.'
              )
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title={t('lumen.watchSessions.invitations', 'Invitations')}>
      <ServiceNote
        what={t('lumen.watchSessions.invitations', 'invitations')}
        title={t(
          'lumen.watchSessions.invitationsLoadFailed',
          'Could not load invitations'
        )}
        retryLabel={t('lumen.watchSessions.retry', 'Retry')}
        error={invites.error}
        retry={invites.reload}
      />
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {!invites.data && !invites.error && (
        <p className="note" role="status">
          {t('lumen.watchSessions.invitationsLoading', 'Loading invitations…')}
        </p>
      )}
      {invites.data?.invites.length === 0 && (
        <p className="note">
          {t('lumen.watchSessions.noInvitations', 'No invitations created.')}
        </p>
      )}
      <div className="setlist">
        {invites.data?.invites.map((invite) => (
          <div className="set cfg-row" key={invite.id}>
            <span>
              {t('lumen.watchSessions.invitationId', 'Invitation {id}', {
                id: invite.id,
              })}
              <small>
                {t(
                  `lumen.watchSessions.inviteStatus.${invite.status}`,
                  invite.status
                )}
              </small>
            </span>
            {invite.status === 'open' && (
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                aria-label={t(
                  'lumen.watchSessions.revokeInvite',
                  'Revoke Invitation {id}',
                  { id: invite.id }
                )}
                onClick={() => void change(invite.id)}
              >
                {t('lumen.watchSessions.revoke', 'Revoke')}
              </button>
            )}
          </div>
        ))}
      </div>
      {draft && (
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => void change()}
          >
            {t('lumen.watchSessions.createInviteLink', 'Create Invite Link')}
          </button>
        </div>
      )}
      {created && (
        <>
          <label className="set cfg-row">
            <span>{t('lumen.watchSessions.inviteLink', 'Invite Link')}</span>
            <input
              className="cfg-input"
              readOnly
              value={created.url}
              onFocus={(event) => event.target.select()}
            />
          </label>
          <div className="toolbar">
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              onClick={() => {
                if (!navigator.clipboard) {
                  setError(
                    t(
                      'lumen.watchSessions.copyLinkFromField',
                      'Copy the invitation link from the field.'
                    )
                  );
                  return;
                }
                void navigator.clipboard.writeText(created.url).then(
                  () => setCopied(true),
                  () =>
                    setError(
                      t(
                        'lumen.watchSessions.copyLinkFromField',
                        'Copy the invitation link from the field.'
                      )
                    )
                );
              }}
            >
              {t('lumen.watchSessions.copyInviteLink', 'Copy Invite Link')}
            </button>
          </div>
          {copied && (
            <p className="note" role="status">
              {t('lumen.watchSessions.inviteLinkCopied', 'Invite link copied.')}
            </p>
          )}
        </>
      )}
    </Section>
  );
}

export function JoinWatchSession() {
  const { t } = useLumenLocale();
  const navigate = useNavigate();
  const token = useRef<string>(undefined);
  const started = useRef(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    token.current =
      captureWatchSessionInviteTokenFromHash() ??
      readStoredWatchSessionInviteToken();
    if (!token.current) {
      setError(
        t(
          'lumen.watchSessions.invalidInvite',
          'Invite link is invalid or expired.'
        )
      );
      setBusy(false);
      return;
    }
    const generation = sessionGeneration();
    void api<{ sessionId: number }>('/watch-sessions/invites/accept', {
      method: 'POST',
      body: JSON.stringify({ token: token.current }),
    })
      .then(({ sessionId }) => {
        if (generation !== sessionGeneration()) return;
        clearStoredWatchSessionInviteToken();
        navigate(`/watch-sessions/${sessionId}`, { replace: true });
      })
      .catch((failure) => {
        if (generation !== sessionGeneration()) return;
        if (failure instanceof ApiError && [404, 409].includes(failure.status))
          clearStoredWatchSessionInviteToken();
        setError(
          failure instanceof ApiError
            ? failure.message
            : t(
                'lumen.watchSessions.joinFailed',
                'Could not join the watch session. Reopen the invitation to retry.'
              )
        );
      })
      .finally(() => setBusy(false));
  }, [navigate, t]);

  return (
    <>
      <h1>{t('lumen.watchSessions.joinTitle', 'Join Watch Session')}</h1>
      {busy && (
        <p className="note" role="status">
          {t('lumen.watchSessions.joining', 'Joining the watch session…')}
        </p>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/watch-sessions">
          {t('lumen.watchSessions.backToSessions', 'Back to Watch Sessions')}
        </Link>
      </div>
    </>
  );
}

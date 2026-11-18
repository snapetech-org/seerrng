import { useEffect, useRef, useState } from 'react';
import { Link, useHref, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
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
            : 'Could not update the invitation.'
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title="Invitations">
      <ServiceNote
        what="invitations"
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
          Loading invitations…
        </p>
      )}
      {invites.data?.invites.length === 0 && (
        <p className="note">No invitations created.</p>
      )}
      <div className="setlist">
        {invites.data?.invites.map((invite) => (
          <div className="set cfg-row" key={invite.id}>
            <span>
              Invitation {invite.id}
              <small>{invite.status}</small>
            </span>
            {invite.status === 'open' && (
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                aria-label={`Revoke Invitation ${invite.id}`}
                onClick={() => void change(invite.id)}
              >
                Revoke
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
            Create Invite Link
          </button>
        </div>
      )}
      {created && (
        <>
          <label className="set cfg-row">
            <span>Invite Link</span>
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
                  setError('Copy the invitation link from the field.');
                  return;
                }
                void navigator.clipboard.writeText(created.url).then(
                  () => setCopied(true),
                  () => setError('Copy the invitation link from the field.')
                );
              }}
            >
              Copy Invite Link
            </button>
          </div>
          {copied && (
            <p className="note" role="status">
              Invite link copied.
            </p>
          )}
        </>
      )}
    </Section>
  );
}

export function JoinWatchSession() {
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
      setError('Invite link is invalid or expired.');
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
            : 'Could not join the watch session. Reopen the invitation to retry.'
        );
      })
      .finally(() => setBusy(false));
  }, [navigate]);

  return (
    <>
      <h1>Join Watch Session</h1>
      {busy && (
        <p className="note" role="status">
          Joining the watch session…
        </p>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/watch-sessions">
          Back to Watch Sessions
        </Link>
      </div>
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';

const labels = {
  pending: 'Pending Approval',
  searching: 'Searching',
  completed: 'Downloaded',
  failed: 'Failed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};
const actions = {
  approve: 'Approve',
  decline: 'Decline',
  cancel: 'Cancel Request',
};
type Action = keyof typeof actions;
interface TrackRequest {
  id: number;
  title: string;
  artist: string;
  status: keyof typeof labels;
  searchCount: number;
  lastMatchCount: number;
  lastError?: string;
  requestedBy?: { id: number; displayName: string };
}

export default function TrackRequests() {
  const { user } = useAuth();
  const permissions = user?.permissions ?? 0;
  const manage = (permissions & (2 | 16)) !== 0;
  const canViewAll = manage || (permissions & 16384) !== 0;
  const [showAll, setShowAll] = useState(false);
  const [active, setActive] = useState(true);
  const [confirmation, setConfirmation] = useState<{
    track: TrackRequest;
    action: Action;
  }>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const working = useRef(false);
  const service = useApi<{ configured: boolean }>('/soulseek/status');
  const scope = canViewAll && showAll ? 'all' : 'mine';
  const list = useApi<{ results: TrackRequest[] }>(
    service.data?.configured
      ? `/soulseek/track-requests?scope=${scope}&filter=${active ? 'active' : 'all'}&take=100`
      : null
  );
  const reload = list.reload;
  useEffect(() => {
    if (!service.data?.configured) return;
    const timer = window.setInterval(reload, 60_000);
    return () => window.clearInterval(timer);
  }, [reload, service.data?.configured]);

  function allowed(track: TrackRequest, action: Action) {
    const owner = track.requestedBy?.id === user?.id;
    if (action !== 'cancel') return manage && track.status === 'pending';
    return (
      (track.status === 'pending' && owner) ||
      (track.status === 'searching' && (manage || owner))
    );
  }

  async function apply() {
    if (!confirmation || working.current) return;
    const { track, action } = confirmation;
    if (!allowed(track, action)) return;
    working.current = true;
    setBusy(true);
    setFailure('');
    const path = `/soulseek/track-requests/${track.id}`;
    try {
      if (action === 'cancel') await api(path, { method: 'DELETE' });
      else await api(`${path}/${action}`, { method: 'POST' });
    } catch (error) {
      setFailure(friendlyError(error, 'The request could not be updated.'));
    } finally {
      setConfirmation(undefined);
      setBusy(false);
      working.current = false;
      reload();
    }
  }

  return (
    <>
      <header className="ph">
        <h1>Track Requests</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/music">
          Back to Music
        </Link>
        <Link className="btn btn-quiet btn-sm" to="/identify">
          Identify a Song
        </Link>
      </div>
      <ServiceNote
        error={service.error}
        what="track request availability"
        retry={service.reload}
      />
      {service.data?.configured === false && (
        <p className="note">
          Soulseek track requests are unavailable until an administrator
          connects slskdN.
        </p>
      )}
      {service.data?.configured && (
        <>
          <div className="toolbar">
            {canViewAll && (
              <label className="sel">
                <span className="lbl">Scope</span>
                <select
                  value={scope}
                  onChange={(event) => setShowAll(event.target.value === 'all')}
                >
                  <option value="mine">My Requests</option>
                  <option value="all">All Requests</option>
                </select>
              </label>
            )}
            <label className="sel">
              <span className="lbl">Status</span>
              <select
                value={active ? 'active' : 'all'}
                onChange={(event) => setActive(event.target.value === 'active')}
              >
                <option value="active">Active Only</option>
                <option value="all">Show All</option>
              </select>
            </label>
          </div>
          <ServiceNote
            error={list.error}
            what="track requests"
            retry={reload}
          />
          {failure && (
            <p className="note" role="alert">
              {failure}
            </p>
          )}
          {!list.data && !list.error && (
            <p className="note" role="status">
              Loading track requests…
            </p>
          )}
          {list.data?.results.length === 0 && (
            <p className="note">No track requests match these filters.</p>
          )}
          {!!list.data?.results.length && (
            <ul className="setlist">
              {list.data.results.map((track) => (
                <li className="set" key={track.id}>
                  <div>
                    <b>{track.title}</b>
                    <small>
                      {track.artist} · {labels[track.status]}
                    </small>
                    {scope === 'all' && track.requestedBy && (
                      <small>
                        Requested by {track.requestedBy.displayName}
                      </small>
                    )}
                    {track.status === 'searching' && (
                      <small>
                        Searches: {track.searchCount} · Last matches:{' '}
                        {track.lastMatchCount}
                      </small>
                    )}
                    {track.lastError && <small>{track.lastError}</small>}
                  </div>
                  <div className="toolbar">
                    {(['approve', 'decline', 'cancel'] as const)
                      .filter((action) => allowed(track, action))
                      .map((action) => (
                        <button
                          className="btn btn-tonal btn-sm"
                          key={action}
                          disabled={busy}
                          onClick={() => setConfirmation({ track, action })}
                        >
                          {actions[action]}
                        </button>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {confirmation && (
        <ConfirmSheet
          title={`${actions[confirmation.action]}?`}
          body={confirmation.track.title}
          confirm={actions[confirmation.action]}
          cancel="Go Back"
          busy={busy}
          onConfirm={() => void apply()}
          onClose={() => {
            if (!working.current) setConfirmation(undefined);
          }}
        />
      )}
    </>
  );
}

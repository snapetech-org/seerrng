import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { canManageRequests } from '../components/detail';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';
import { bookSeriesCatalogQuery } from './BookSeriesCatalog';

const endpoint = '/book-series/watch/requests';
const actions = [
  {
    id: 'approve',
    label: 'Approve',
    states: ['pending', 'failed', 'stopped', 'declined', 'active'],
  },
  { id: 'decline', label: 'Decline', states: ['pending'] },
  { id: 'stop', label: 'Stop Monitoring', states: ['active', 'failed'] },
] as const;

type RequestRow = {
  id: number;
  title: string;
  format: string;
  status: string;
  includeExtras: boolean;
  serverName?: string;
  destination?: string;
  target?: { serverId: number; scope: string; providerId: string };
};

export default function BookSeriesRequests() {
  const { user } = useAuth();
  const manage = canManageRequests(user?.permissions);
  const requests = useApi<RequestRow[]>(endpoint, { keepDuringRefresh: true });
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  async function update(id: number, action: (typeof actions)[number]['id']) {
    if (pending.current) return;
    pending.current = true;
    const generation = sessionGeneration();
    setBusy(true);
    setFailure('');
    try {
      await api(`${endpoint}/${id}/${action}`, { method: 'POST' });
    } catch (error) {
      if (generation === sessionGeneration())
        setFailure(friendlyError(error, 'Could not update series monitoring.'));
    } finally {
      pending.current = false;
      if (generation === sessionGeneration()) {
        requests.reload();
        setBusy(false);
      }
    }
  }

  return (
    <>
      <ExtraHeader title="Book Series Requests">
        <Link className="chip" to="/requests">
          Back to Requests
        </Link>
      </ExtraHeader>
      <p className="note">
        Stopping monitoring keeps books already added to the service.
      </p>
      <ServiceNote
        error={requests.error}
        what="book series requests"
        retry={requests.reload}
      />
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {!requests.data && !requests.error && (
        <p className="note" role="status">
          Loading book series requests…
        </p>
      )}
      {requests.data?.length === 0 && (
        <p className="note">No book series requests.</p>
      )}
      <ul className="setlist">
        {requests.data?.map((row) => {
          const catalog = row.target && bookSeriesCatalogQuery(row.target);
          return (
            <li className="set" key={row.id}>
              <div>
                {catalog ? (
                  <Link to={`/book-series/catalog?${catalog}`}>
                    <b>{row.title}</b>
                  </Link>
                ) : (
                  <b>{row.title}</b>
                )}
                <p className="note">
                  {row.serverName ? `${row.serverName} · ` : ''}
                  {row.format} · {row.status}
                </p>
                <p className="note">
                  {row.includeExtras ? 'Includes extras' : 'Primary books only'}
                </p>
                {manage && (
                  <p className="note">
                    {row.destination ||
                      'The original service destination is unavailable.'}
                  </p>
                )}
              </div>
              {manage && (
                <div className="toolbar">
                  {actions
                    .filter(({ states }) =>
                      states.some((state) => state === row.status)
                    )
                    .map(({ id, label }) => (
                      <button
                        key={id}
                        className="btn btn-quiet btn-sm"
                        type="button"
                        disabled={busy}
                        onClick={() => void update(row.id, id)}
                      >
                        {label}
                      </button>
                    ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

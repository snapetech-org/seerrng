import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ConfirmSheet } from '../components/ConfirmSheet';
import {
  canChooseRequestOptions,
  canViewAllRequests,
  Pill,
} from '../components/detail';
import { ServiceNote } from '../components/extra';
import FollowedTeams from '../components/FollowedTeams';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLiveTvStatus } from '../liveTv';

const statuses = {
  pending: 'Pending',
  scheduled: 'Scheduled',
  recording: 'Recording',
  completed: 'Completed',
  failed: 'Failed',
  declined: 'Declined',
  cancelled: 'Canceled',
} as const;
type Action = 'approve' | 'decline' | 'cancel';
const labels: Record<Action, string> = {
  approve: 'Approve',
  decline: 'Decline',
  cancel: 'Cancel Recording',
};
const take = 25;
const base = '/live-tv/recordings';

interface Recording {
  id: number;
  kind: 'airing' | 'series';
  status: keyof typeof statuses;
  title: string;
  subTitle?: string;
  mediaType?: 'movie' | 'tv';
  tmdbId?: number;
  channel?: string;
  channelName?: string;
  startsAt?: string;
  completedCount: number;
  failedCount: number;
  lastError?: string;
  requestedBy?: { id: number; displayName: string };
}

const dateLabel = (raw?: string) => {
  const date = raw ? new Date(raw) : undefined;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : '';
};

export default function Recordings() {
  const status = useLiveTvStatus();
  const { user } = useAuth();
  const manage = canChooseRequestOptions(user?.permissions);
  const viewAll = canViewAllRequests(user?.permissions);
  const [scope, setScope] = useState('mine');
  const [filter, setFilter] = useState('active');
  const [skip, setSkip] = useState(0);
  const [selected, setSelected] = useState<{
    action: Action;
    recording: Recording;
  }>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const pending = useRef(false);
  const allUsers = viewAll && scope === 'all';
  const rows = useApi<{ results: Recording[]; pageInfo: { total: number } }>(
    status.data?.configured
      ? `${base}?scope=${allUsers ? 'all' : 'mine'}&filter=${filter}&take=${take}&skip=${skip}`
      : null,
    { currentPathOnly: true, keepDuringRefresh: true }
  );
  const refresh = rows.refresh;
  const configured = status.data?.configured;
  useEffect(() => {
    if (!configured) return;
    const timer = window.setInterval(() => {
      if (!pending.current && document.visibilityState === 'visible') refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [configured, refresh]);

  async function apply() {
    if (!selected || pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice(undefined);
    const path = `${base}/${selected.recording.id}`;
    try {
      if (selected.action === 'cancel') await api(path, { method: 'DELETE' });
      else await api(`${path}/${selected.action}`, { method: 'POST' });
      setNotice({ text: 'Recording updated.' });
    } catch (failure) {
      setNotice({
        text: friendlyError(failure, 'Could not update the recording.'),
        error: true,
      });
    } finally {
      pending.current = false;
      setBusy(false);
      setSelected(undefined);
      rows.reload();
    }
  }

  return (
    <>
      <header className="ph">
        <h1>Recordings</h1>
      </header>
      <ServiceNote
        what="Live TV status"
        error={status.error}
        retry={status.reload}
      />
      {!status.data && !status.error && (
        <p className="note" role="status">
          Checking Live TV…
        </p>
      )}
      {status.data && !configured && (
        <p className="note">
          Live TV recordings are unavailable until Tunerr is configured.
        </p>
      )}
      {configured && (
        <>
          <FollowedTeams canRequest={status.data?.canRequest === true} />
          <div className="toolbar">
            {viewAll && (
              <label className="sel">
                <span className="lbl">Scope</span>
                <select
                  value={scope}
                  onChange={(event) => {
                    setSkip(0);
                    setScope(event.target.value);
                  }}
                >
                  <option value="mine">My Recordings</option>
                  <option value="all">All Users</option>
                </select>
              </label>
            )}
            <label className="sel">
              <span className="lbl">Status Filter</span>
              <select
                value={filter}
                onChange={(event) => {
                  setSkip(0);
                  setFilter(event.target.value);
                }}
              >
                <option value="active">Active</option>
                <option value="all">All Statuses</option>
              </select>
            </label>
            <button
              className="btn btn-tonal btn-sm"
              type="button"
              onClick={rows.reload}
            >
              Refresh Recordings
            </button>
          </div>
          <ServiceNote
            what="recordings"
            error={rows.error}
            retry={rows.reload}
          />
          {notice && (
            <p className="note" role={notice.error ? 'alert' : 'status'}>
              {notice.text}
            </p>
          )}
          {!rows.data && !rows.error && (
            <p className="note" role="status">
              Loading recordings…
            </p>
          )}
          {rows.data?.results.length === 0 && (
            <p className="note">No recordings match this view.</p>
          )}
          {!!rows.data?.results.length && (
            <div className="setlist">
              {rows.data.results.map((recording) => {
                const owner =
                  !allUsers || recording.requestedBy?.id === user?.id;
                const active = ['pending', 'scheduled', 'recording'].includes(
                  recording.status
                );
                const canCancel =
                  active &&
                  ((owner && status.data?.canRequest) ||
                    (manage && (owner || recording.status !== 'pending')));
                const actions: Action[] = [];
                if (manage && recording.status === 'pending')
                  actions.push('approve', 'decline');
                if (canCancel) actions.push('cancel');
                return (
                  <div className="set" key={recording.id}>
                    <div>
                      <b>
                        {recording.tmdbId && recording.mediaType ? (
                          <Link
                            to={`/${recording.mediaType}/${recording.tmdbId}`}
                          >
                            {recording.title}
                          </Link>
                        ) : (
                          recording.title
                        )}
                      </b>
                      {recording.subTitle && (
                        <small>{recording.subTitle}</small>
                      )}
                      <small>
                        {[
                          recording.kind === 'series'
                            ? 'Series'
                            : dateLabel(recording.startsAt),
                          recording.channelName || recording.channel,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                      {recording.kind === 'series' && (
                        <small>
                          {recording.completedCount} recorded ·{' '}
                          {recording.failedCount} failed
                        </small>
                      )}
                      {allUsers && recording.requestedBy && (
                        <small>
                          Requested by {recording.requestedBy.displayName}
                        </small>
                      )}
                      {recording.lastError && (
                        <small>{recording.lastError}</small>
                      )}
                      {!!actions.length && (
                        <div className="toolbar">
                          {actions.map((action) => (
                            <button
                              key={action}
                              className="btn btn-tonal btn-sm"
                              type="button"
                              onClick={() => setSelected({ recording, action })}
                            >
                              {labels[action]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Pill k="neutral">
                      {statuses[recording.status] ?? recording.status}
                    </Pill>
                  </div>
                );
              })}
            </div>
          )}
          {!!rows.data && (skip > 0 || rows.data.pageInfo.total > take) && (
            <div className="toolbar">
              <button
                className="btn btn-tonal btn-sm"
                type="button"
                disabled={!skip}
                onClick={() => setSkip(Math.max(0, skip - take))}
              >
                Previous
              </button>
              <button
                className="btn btn-tonal btn-sm"
                type="button"
                disabled={skip + take >= rows.data.pageInfo.total}
                onClick={() => setSkip(skip + take)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
      {selected && (
        <ConfirmSheet
          title={`${labels[selected.action]}?`}
          body={selected.recording.title}
          confirm={labels[selected.action]}
          cancel="Keep Recording"
          busy={busy}
          onConfirm={() => void apply()}
          onClose={() => {
            if (!pending.current) setSelected(undefined);
          }}
        />
      )}
    </>
  );
}

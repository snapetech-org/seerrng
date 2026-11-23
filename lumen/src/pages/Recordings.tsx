import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ConfirmSheet } from '../components/ConfirmSheet';
import {
  canManageRequests,
  canViewAllRequests,
  Pill,
} from '../components/detail';
import { ServiceNote } from '../components/extra';
import FollowedTeams from '../components/FollowedTeams';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
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
const statusMessages: Record<keyof typeof statuses, string> = {
  pending: 'components.LiveTv.RecordingList.statusPending',
  scheduled: 'components.LiveTv.RecordingList.statusScheduled',
  recording: 'components.LiveTv.RecordingList.statusRecording',
  completed: 'components.LiveTv.RecordingList.statusCompleted',
  failed: 'components.LiveTv.RecordingList.statusFailed',
  declined: 'components.LiveTv.RecordingList.statusDeclined',
  cancelled: 'components.LiveTv.RecordingList.statusCancelled',
};
type Action = 'approve' | 'decline' | 'cancel';
const actionMessages: Record<Action, string> = {
  approve: 'components.LiveTv.RecordingList.approve',
  decline: 'components.LiveTv.RecordingList.decline',
  cancel: 'components.LiveTv.RecordingList.cancel',
};
const actionFallbacks: Record<Action, string> = {
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

const dateLabel = (raw: string | undefined, locale: string) => {
  const date = raw ? new Date(raw) : undefined;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleString(locale)
    : '';
};

export default function Recordings() {
  const { locale, t } = useLumenLocale();
  const status = useLiveTvStatus();
  const { user } = useAuth();
  const manage = canManageRequests(user?.permissions);
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
      setNotice({ text: t('lumen.recordings.updated', 'Recording updated.') });
    } catch (failure) {
      setNotice({
        text: friendlyError(
          failure,
          t(
            'components.LiveTv.RecordingList.actionFailed',
            'The recording could not be updated.'
          )
        ),
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
        <h1>{t('components.LiveTv.RecordingList.title', 'Recordings')}</h1>
      </header>
      <ServiceNote
        what={t('lumen.recordings.liveTvStatus', 'Live TV status')}
        title={t(
          'lumen.recordings.statusLoadError',
          'Live TV status could not be loaded.'
        )}
        error={status.error}
        retry={status.reload}
      />
      {!status.data && !status.error && (
        <p className="note" role="status">
          {t('lumen.recordings.checking', 'Checking Live TV…')}
        </p>
      )}
      {status.data && !configured && (
        <p className="note">
          {t(
            'components.LiveTv.RecordingList.notConfigured',
            'Live TV recording is not set up. An administrator can connect IPTV Tunerr in Settings → Services.'
          )}
        </p>
      )}
      {configured && (
        <>
          <FollowedTeams canRequest={status.data?.canRequest === true} />
          <div className="toolbar">
            {viewAll && (
              <label className="sel">
                <span className="lbl">
                  {t('lumen.recordings.scope', 'Scope')}
                </span>
                <select
                  value={scope}
                  onChange={(event) => {
                    setSkip(0);
                    setScope(event.target.value);
                  }}
                >
                  <option value="mine">
                    {t('components.LiveTv.RecordingList.mine', 'My Recordings')}
                  </option>
                  <option value="all">
                    {t('components.Requests.allUsers', 'All Users')}
                  </option>
                </select>
              </label>
            )}
            <label className="sel">
              <span className="lbl">
                {t('lumen.recordings.statusFilter', 'Status Filter')}
              </span>
              <select
                value={filter}
                onChange={(event) => {
                  setSkip(0);
                  setFilter(event.target.value);
                }}
              >
                <option value="active">
                  {t('lumen.recordings.active', 'Active')}
                </option>
                <option value="all">
                  {t('lumen.recordings.allStatuses', 'All Statuses')}
                </option>
              </select>
            </label>
            <button
              className="btn btn-tonal btn-sm"
              type="button"
              onClick={rows.reload}
            >
              {t('lumen.recordings.refresh', 'Refresh Recordings')}
            </button>
          </div>
          <ServiceNote
            what={t('lumen.recordings.liveTvStatus', 'Live TV status')}
            title={t(
              'components.LiveTv.RecordingList.loadError',
              'Recordings could not be loaded.'
            )}
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
              {t('lumen.recordings.loading', 'Loading recordings…')}
            </p>
          )}
          {rows.data?.results.length === 0 && (
            <p className="note">
              {t(
                'lumen.recordings.emptyView',
                'No recordings match this view.'
              )}
            </p>
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
                            ? t(
                                'components.Discover.DiscoverMediaTabs.series',
                                'Series'
                              )
                            : dateLabel(recording.startsAt, locale),
                          recording.channelName || recording.channel,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                      {recording.kind === 'series' && (
                        <small>
                          {t(
                            'lumen.recordings.countSummary',
                            '{completed} recorded · {failed} failed',
                            {
                              completed: recording.completedCount,
                              failed: recording.failedCount,
                            }
                          )}
                        </small>
                      )}
                      {allUsers && recording.requestedBy && (
                        <small>
                          {t(
                            'components.LiveTv.RecordingList.requestedBy',
                            'Requested By'
                          )}{' '}
                          {recording.requestedBy.displayName}
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
                              {t(
                                actionMessages[action],
                                actionFallbacks[action]
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Pill k="neutral">
                      {t(
                        statusMessages[recording.status],
                        statuses[recording.status] ?? recording.status
                      )}
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
                {t('i18n.previous', 'Previous')}
              </button>
              <button
                className="btn btn-tonal btn-sm"
                type="button"
                disabled={skip + take >= rows.data.pageInfo.total}
                onClick={() => setSkip(skip + take)}
              >
                {t('i18n.next', 'Next')}
              </button>
            </div>
          )}
        </>
      )}
      {selected && (
        <ConfirmSheet
          title={`${t(
            actionMessages[selected.action],
            actionFallbacks[selected.action]
          )}?`}
          body={selected.recording.title}
          confirm={t(
            actionMessages[selected.action],
            actionFallbacks[selected.action]
          )}
          cancel={t('lumen.recordings.keep', 'Keep Recording')}
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

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type MusicServiceSummary } from '../api';
import { useAuth } from '../auth';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { hasAurralMusicService, type TrackRequestStatus } from '../extras';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { songKey, unmarkSongs } from '../musicState';

const pageSize = 100;
type Action = 'approve' | 'decline' | 'cancel';
type TrackStatus =
  'pending' | 'searching' | 'completed' | 'failed' | 'declined' | 'cancelled';

interface TrackRequest {
  id: number;
  title: string;
  artist: string;
  status: TrackStatus;
  searchCount: number;
  lastMatchCount: number;
  lastError?: string;
  requestedBy?: { id: number; displayName: string };
}

export default function TrackRequests() {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const permissions = user?.permissions ?? 0;
  const manage = (permissions & (2 | 16)) !== 0;
  const canViewAll = manage || (permissions & 16384) !== 0;
  const [showAll, setShowAll] = useState(false);
  const [active, setActive] = useState(true);
  const [skip, setSkip] = useState(0);
  const [confirmation, setConfirmation] = useState<{
    track: TrackRequest;
    action: Action;
  }>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const working = useRef(false);
  const service = useApi<TrackRequestStatus>('/soulseek/status');
  const musicServices = useApi<MusicServiceSummary[]>(
    user ? '/service/music' : null
  );
  const scope = canViewAll && showAll ? 'all' : 'mine';
  const list = useApi<{
    results: TrackRequest[];
    pageInfo?: { total: number; skip: number; take: number };
  }>(
    service.data?.configured
      ? `/soulseek/track-requests?scope=${scope}&filter=${active ? 'active' : 'all'}&take=${pageSize}&skip=${skip}`
      : null,
    // this list is never cached: keep it on screen while it refreshes
    { currentPathOnly: true, keepDuringRefresh: true }
  );
  const reload = list.reload;
  const refreshList = list.revalidate;
  const page = list.data?.pageInfo;
  useEffect(() => {
    if (!service.data?.configured) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshList();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [refreshList, service.data?.configured]);
  const statusLabel = (status: TrackRequest['status']) =>
    t(`lumen.trackRequests.status.${status}`, status);
  const actionLabel = (action: Action) =>
    action === 'approve'
      ? t('lumen.trackRequests.approve', 'Approve')
      : action === 'decline'
        ? t('lumen.trackRequests.decline', 'Decline')
        : t('lumen.trackRequests.cancelRequest', 'Cancel Request');

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
    let succeeded = false;
    const path = `/soulseek/track-requests/${track.id}`;
    try {
      if (action === 'cancel') await api(path, { method: 'DELETE' });
      else await api(`${path}/${action}`, { method: 'POST' });
      // a cancelled or declined song can be asked for again
      if (action !== 'approve')
        unmarkSongs([songKey(track.artist, track.title)]);
      succeeded = true;
    } catch (error) {
      setFailure(
        friendlyError(
          error,
          t(
            'lumen.trackRequests.updateFailed',
            'The request could not be updated.'
          )
        )
      );
    } finally {
      if (succeeded) setConfirmation(undefined);
      setBusy(false);
      working.current = false;
      refreshList();
    }
  }

  return (
    <>
      <header className="ph">
        <h1>{t('lumen.trackRequests.title', 'Track Requests')}</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/music">
          {t('lumen.trackRequests.backToMusic', 'Back to Music')}
        </Link>
        <Link className="btn btn-quiet btn-sm" to="/identify">
          {t('lumen.trackRequests.identifySong', 'Identify a Song')}
        </Link>
      </div>
      <ServiceNote
        error={service.error}
        what={t(
          'lumen.trackRequests.availability',
          'track request availability'
        )}
        title={t(
          'lumen.trackRequests.statusLoadFailed',
          'Could not load track request status'
        )}
        retryLabel={t('lumen.trackRequests.retry', 'Retry')}
        retry={service.reload}
      />
      {service.data?.configured === false && (
        <p className="note">
          {hasAurralMusicService(musicServices.data, service.data)
            ? t(
                'lumen.trackRequests.unavailableAurral',
                'Track requests are unavailable until an administrator enables them in Aurral.'
              )
            : t(
                'lumen.trackRequests.unconfigured',
                'Soulseek track requests are unavailable until an administrator connects slskdN.'
              )}
        </p>
      )}
      {service.data?.configured && (
        <>
          <div className="toolbar">
            {canViewAll && (
              <label className="sel">
                <span className="lbl">
                  {t('lumen.trackRequests.scope', 'Scope')}
                </span>
                <select
                  value={scope}
                  onChange={(event) => {
                    setShowAll(event.target.value === 'all');
                    setSkip(0);
                  }}
                >
                  <option value="mine">
                    {t('lumen.trackRequests.myRequests', 'My Requests')}
                  </option>
                  <option value="all">
                    {t('lumen.trackRequests.allRequests', 'All Requests')}
                  </option>
                </select>
              </label>
            )}
            <label className="sel">
              <span className="lbl">
                {t('lumen.trackRequests.status', 'Status')}
              </span>
              <select
                value={active ? 'active' : 'all'}
                onChange={(event) => {
                  setActive(event.target.value === 'active');
                  setSkip(0);
                }}
              >
                <option value="active">
                  {t('lumen.trackRequests.activeOnly', 'Active Only')}
                </option>
                <option value="all">
                  {t('lumen.trackRequests.showAll', 'Show All')}
                </option>
              </select>
            </label>
          </div>
          {(skip > 0 || (page && page.total > pageSize)) && (
            <div
              className="toolbar"
              aria-label={t('lumen.trackRequests.pages', 'Track request pages')}
            >
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy || !skip}
                onClick={() =>
                  setSkip((current) => Math.max(0, current - pageSize))
                }
              >
                {t('lumen.trackRequests.previousPage', 'Previous Page')}
              </button>
              <span>
                {t('lumen.trackRequests.pageNumber', 'Page {page}', {
                  page: skip / pageSize + 1,
                })}
              </span>
              <button
                className="btn btn-quiet btn-sm"
                disabled={
                  busy ||
                  !page ||
                  page.skip !== skip ||
                  skip + pageSize >= page.total
                }
                onClick={() => setSkip((current) => current + pageSize)}
              >
                {t('lumen.trackRequests.nextPage', 'Next Page')}
              </button>
            </div>
          )}
          <ServiceNote
            error={list.error}
            what={t('lumen.trackRequests.requests', 'track requests')}
            title={t(
              'lumen.trackRequests.loadFailed',
              'Could not load track requests'
            )}
            retryLabel={t('lumen.trackRequests.retry', 'Retry')}
            retry={reload}
          />
          {failure && !confirmation && (
            <p className="note" role="alert">
              {failure}
            </p>
          )}
          {!list.data && !list.error && (
            <p className="note" role="status">
              {t('lumen.trackRequests.loading', 'Loading track requests…')}
            </p>
          )}
          {list.data?.results.length === 0 && (
            <p className="note">
              {t(
                'lumen.trackRequests.empty',
                'No track requests match these filters.'
              )}
            </p>
          )}
          {!!list.data?.results.length && (
            <ul className="setlist">
              {list.data.results.map((track) => (
                <li className="set" key={track.id}>
                  <div>
                    <b>{track.title}</b>
                    <small>
                      {track.artist} · {statusLabel(track.status)}
                    </small>
                    {scope === 'all' && track.requestedBy && (
                      <small>
                        {t(
                          'lumen.trackRequests.requestedBy',
                          'Requested by {name}',
                          { name: track.requestedBy.displayName }
                        )}
                      </small>
                    )}
                    {track.status === 'searching' && (
                      <small>
                        {t(
                          'lumen.trackRequests.searchCounts',
                          'Searches: {searches} · Last matches: {matches}',
                          {
                            searches: track.searchCount,
                            matches: track.lastMatchCount,
                          }
                        )}
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
                          {actionLabel(action)}
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
          title={t('lumen.trackRequests.confirmTitle', 'Confirm {action}?', {
            action: actionLabel(confirmation.action),
          })}
          body={confirmation.track.title}
          confirm={actionLabel(confirmation.action)}
          cancel={t('lumen.trackRequests.goBack', 'Go Back')}
          busy={busy}
          onConfirm={() => void apply()}
          onClose={() => {
            if (!working.current) setConfirmation(undefined);
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

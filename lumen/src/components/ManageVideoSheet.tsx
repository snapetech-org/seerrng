import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  api,
  ApiError,
  MediaStatus,
  type JellystatPlaybackSummary,
  type LibraryRemovalPlan,
  type MediaInfo,
  type MediaWatchDataResponse,
} from '../api';
import { isAdministrator, useAuth } from '../auth';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { useDialog } from './useDialog';

type MediaKind = 'movie' | 'tv';
type ManagerAction =
  | { kind: 'remove' }
  | { kind: 'clear'; quality: 'HD' | '4K' }
  | { kind: 'deleteRequest'; requestId: number };

const safeServiceUrl = (value?: string | null) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const statusLabel = (
  status: number | undefined,
  t: (id: string, fallback: string) => string
) => {
  switch (status) {
    case MediaStatus.PENDING:
      return t('lumen.manageVideo.pending', 'Requested');
    case MediaStatus.PROCESSING:
      return t('lumen.manageVideo.processing', 'Processing');
    case MediaStatus.PARTIAL:
      return t('lumen.manageVideo.partial', 'Partially available');
    case MediaStatus.AVAILABLE:
      return t('lumen.manageVideo.available', 'Available');
    case MediaStatus.BLOCKLISTED:
      return t('lumen.manageVideo.blocklisted', 'Blocklisted');
    default:
      return t('lumen.manageVideo.unknown', 'Unknown');
  }
};

const requestStatusLabel = (
  status: number,
  t: (id: string, fallback: string) => string
) => {
  switch (status) {
    case 1:
      return t('lumen.manageVideo.waitingApproval', 'Waiting for approval');
    case 2:
      return t('lumen.manageVideo.approved', 'Approved');
    case 3:
      return t('lumen.manageVideo.declined', 'Declined');
    case 4:
      return t('lumen.manageVideo.failed', 'Failed');
    case 5:
      return t('lumen.manageVideo.completed', 'Completed');
    default:
      return t('lumen.manageVideo.unknown', 'Unknown');
  }
};

export function ManageVideoSheet({
  kind,
  title,
  year,
  media,
  onClose,
  onUpdated,
  mediaServerType,
}: {
  kind: MediaKind;
  title: string;
  year?: string;
  media: MediaInfo & {
    id: number;
    seasons?: { seasonNumber: number; status?: number; status4k?: number }[];
  };
  onClose: () => void;
  onUpdated: () => void;
  mediaServerType?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { t, locale } = useLumenLocale();
  const admin = isAdministrator(user?.permissions);
  const [confirmation, setConfirmation] = useState<ManagerAction>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const [confirmCancel, setConfirmCancel] = useState<HTMLButtonElement | null>(
    null
  );
  const library = useApi<LibraryRemovalPlan>(
    admin ? `/media/${media.id}/library` : null,
    { keepDuringRefresh: true }
  );
  const watchData = useApi<MediaWatchDataResponse>(
    admin && mediaServerType === 1 ? `/media/${media.id}/watch_data` : null
  );
  const jellystat = useApi<JellystatPlaybackSummary>(
    admin ? `/media/${media.id}/jellystat` : null
  );

  useDialog(box, () => {
    if (!confirmation) onClose();
  });

  useEffect(() => {
    if (confirmation) confirmCancel?.focus({ preventScroll: true });
  }, [confirmation, confirmCancel]);

  const noRequests = !media.requests?.length;
  const downloads = [
    ...(media.downloadStatus ?? []).map((item) => ({ item, quality: 'HD' })),
    ...(media.downloadStatus4k ?? []).map((item) => ({ item, quality: '4K' })),
  ];
  const openLinks = [
    { quality: 'HD', url: safeServiceUrl(media.serviceUrl) },
    { quality: '4K', url: safeServiceUrl(media.serviceUrl4k) },
  ].filter((item) => item.url);

  const confirmAction = async () => {
    if (
      !confirmation ||
      busy ||
      (confirmation.kind !== 'deleteRequest' && !library.data)
    )
      return;
    setBusy(true);
    setFailure(undefined);
    try {
      if (confirmation.kind === 'deleteRequest') {
        const request = media.requests?.find(
          (item) => item.id === confirmation.requestId
        );
        if (!request) return;
        await api(
          `/request/${request.id}/status`,
          { method: 'DELETE' },
          'empty'
        );
        setConfirmation(undefined);
        onUpdated();
      } else if (confirmation.kind === 'remove') {
        if (!library.data?.targets.length || !library.data.token) return;
        await api(
          `/media/${media.id}/library`,
          {
            method: 'DELETE',
            body: JSON.stringify({ token: library.data.token }),
          },
          'empty'
        );
        onUpdated();
        onClose();
      } else {
        const quality = confirmation.quality;
        if (
          !library.data?.staleAvailabilityQualities?.includes(quality) ||
          !library.data?.token
        )
          return;
        await api(
          `/media/${media.id}/library/clear-stale-availability`,
          {
            method: 'POST',
            body: JSON.stringify({ token: library.data.token, quality }),
          },
          'empty'
        );
        setConfirmation(undefined);
        library.revalidate();
        onUpdated();
      }
    } catch (error) {
      setFailure(
        error instanceof ApiError &&
          error.status === 409 &&
          confirmation.kind !== 'deleteRequest'
          ? t(
              'lumen.manageVideo.planChanged',
              'The verified library state changed. Refresh the plan and review it again.'
            )
          : confirmation.kind === 'deleteRequest'
            ? t(
                'lumen.manageVideo.deleteRequestFailed',
                'Could not delete the request. Refresh and retry.'
              )
            : t(
                'lumen.manageVideo.actionFailed',
                'The action failed. Refresh the library plan and retry.'
              )
      );
      if (confirmation.kind !== 'deleteRequest') library.revalidate();
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  const staleQuality =
    confirmation?.kind === 'clear' ? confirmation.quality : undefined;
  const requestToDelete =
    confirmation?.kind === 'deleteRequest'
      ? media.requests?.find((item) => item.id === confirmation.requestId)
      : undefined;

  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={box}
        className="sheet"
        role={confirmation ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-label={
          confirmation
            ? confirmation.kind === 'remove'
              ? t(
                  'lumen.manageVideo.confirmRemoveTitle',
                  'Delete from library?'
                )
              : confirmation.kind === 'clear'
                ? t(
                    'lumen.manageVideo.confirmClearTitle',
                    'Clear stale availability?'
                  )
                : t(
                    'lumen.manageVideo.confirmDeleteRequestTitle',
                    'Delete request?'
                  )
            : t('lumen.manageVideo.title', 'Manage {title}', { title })
        }
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h3>
              {confirmation
                ? confirmation.kind === 'remove'
                  ? t(
                      'lumen.manageVideo.confirmRemoveTitle',
                      'Delete from library?'
                    )
                  : confirmation.kind === 'clear'
                    ? t(
                        'lumen.manageVideo.confirmClearTitle',
                        'Clear stale availability?'
                      )
                    : t(
                        'lumen.manageVideo.confirmDeleteRequestTitle',
                        'Delete request?'
                      )
                : t('lumen.manageVideo.title', 'Manage {title}', { title })}
            </h3>
            <span className="sub">
              {confirmation
                ? confirmation.kind === 'remove'
                  ? t(
                      'lumen.manageVideo.confirmRemoveBody',
                      'This permanently removes the verified copies listed below, including their files. This cannot be undone.'
                    )
                  : confirmation.kind === 'clear'
                    ? t(
                        'lumen.manageVideo.confirmClearBody',
                        'This resets the verified stale availability state only. It does not delete media files or requests.'
                      )
                    : t(
                        'lumen.manageVideo.confirmDeleteRequestBody',
                        'This removes the selected request and its history, and may cancel active acquisition work. This cannot be undone.'
                      )
                : [year, kind === 'tv' ? 'Series' : 'Movie']
                    .filter(Boolean)
                    .join(' · ')}
            </span>
          </header>

          {confirmation ? (
            <>
              {confirmation.kind === 'remove' ? (
                <ul className="card-list">
                  {library.data?.targets.map((target) => (
                    <li key={target.key}>
                      <b>{target.service}</b>{' '}
                      <span className="sub">
                        {target.quality} · {target.externalId}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : confirmation.kind === 'clear' ? (
                <p className="note">
                  {t(
                    'lumen.manageVideo.clearQuality',
                    'Clear {quality} availability for {title}?',
                    { quality: staleQuality ?? '', title }
                  )}
                </p>
              ) : requestToDelete ? (
                <ul className="card-list">
                  <li>
                    <b>#{requestToDelete.id}</b>{' '}
                    <span className="sub">
                      {requestToDelete.requestedBy?.displayName ||
                        t('lumen.manageVideo.unknownUser', 'Unknown user')}
                      {requestToDelete.is4k ? ' · 4K' : ''}
                    </span>
                  </li>
                </ul>
              ) : null}
              {failure && (
                <p role="alert" className="note">
                  {failure}
                </p>
              )}
              <div className="pk-foot">
                <button
                  className={`btn ${confirmation.kind === 'remove' || confirmation.kind === 'deleteRequest' ? 'btn-danger' : 'btn-primary'}`}
                  disabled={busy}
                  onClick={() => void confirmAction()}
                >
                  {busy
                    ? t('lumen.manageVideo.working', 'Working…')
                    : confirmation.kind === 'remove'
                      ? t('lumen.manageVideo.delete', 'Delete verified copies')
                      : confirmation.kind === 'clear'
                        ? t('lumen.manageVideo.clear', 'Clear availability')
                        : t(
                            'lumen.manageVideo.deleteRequest',
                            'Delete request'
                          )}
                </button>
                <button
                  ref={setConfirmCancel}
                  className="btn btn-tonal"
                  disabled={busy}
                  onClick={() => {
                    setConfirmation(undefined);
                    setFailure(undefined);
                  }}
                >
                  {t('lumen.manageVideo.cancel', 'Cancel')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div
                className="toolbar"
                aria-label={t('lumen.manageVideo.availability', 'Availability')}
              >
                <span className="chip">
                  HD · {statusLabel(media.status, t)}
                </span>
                <span className="chip">
                  4K · {statusLabel(media.status4k, t)}
                </span>
              </div>
              <section className="card">
                <h4>{t('lumen.manageVideo.requests', 'Requests')}</h4>
                {noRequests ? (
                  <p className="note">
                    {t(
                      'lumen.manageVideo.noRequests',
                      'No requests are linked to this title.'
                    )}
                  </p>
                ) : (
                  <ul className="card-list">
                    {media.requests?.map((request) => (
                      <li key={request.id}>
                        <b>
                          #{request.id} ·{' '}
                          {requestStatusLabel(request.status, t)}
                        </b>{' '}
                        <span className="sub">
                          {request.requestedBy?.displayName ||
                            t('lumen.manageVideo.unknownUser', 'Unknown user')}
                          {request.is4k ? ' · 4K' : ''}
                          {request.seasons?.length
                            ? ` · ${request.seasons.map((season) => season.seasonNumber).join(', ')}`
                            : ''}
                        </span>
                        <button
                          className="btn btn-quiet btn-sm"
                          disabled={busy}
                          onClick={() =>
                            setConfirmation({
                              kind: 'deleteRequest',
                              requestId: request.id,
                            })
                          }
                        >
                          {t(
                            'lumen.manageVideo.deleteRequestAction',
                            'Delete request #{id}',
                            { id: request.id }
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="toolbar">
                  <a
                    className="btn btn-tonal btn-sm"
                    href={`/requests?mediaType=${kind}&search=${encodeURIComponent(title)}`}
                  >
                    {t(
                      'lumen.manageVideo.openRequests',
                      'Open matching requests'
                    )}
                  </a>
                </div>
              </section>

              {downloads.length > 0 && (
                <section className="card">
                  <h4>{t('lumen.manageVideo.downloads', 'Downloads')}</h4>
                  <ul className="card-list">
                    {downloads.map(({ item, quality }, index) => (
                      <li key={`${quality}-${item.downloadId ?? index}`}>
                        <b>
                          {quality} ·{' '}
                          {item.status ||
                            t('lumen.manageVideo.processing', 'Processing')}
                        </b>
                        {typeof item.percent === 'number' && (
                          <span className="sub">
                            {' '}
                            {Math.round(item.percent)}%
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {openLinks.length > 0 && (
                <section className="card">
                  <h4>{t('lumen.manageVideo.services', 'Services')}</h4>
                  <div className="toolbar">
                    {openLinks.map(({ quality, url }) => (
                      <a
                        className="btn btn-tonal btn-sm"
                        key={quality}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {t(
                          'lumen.manageVideo.openService',
                          'Open in {service}',
                          {
                            service: `${kind === 'tv' ? 'Sonarr' : 'Radarr'}${quality === '4K' ? ' 4K' : ''}`,
                          }
                        )}
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {admin && (watchData.data?.data || watchData.data?.data4k) && (
                <section className="card">
                  <h4>
                    {t('lumen.manageVideo.playbackHistory', 'Playback history')}
                  </h4>
                  {(['data', 'data4k'] as const).map((key) => {
                    const counts = watchData.data?.[key];
                    if (!counts) return null;
                    const quality = key === 'data4k' ? '4K' : 'HD';
                    return (
                      <div className="card" key={key}>
                        <b>{quality}</b>
                        <ul className="card-list">
                          <li>
                            {t('lumen.manageVideo.past7Days', 'Past 7 days')}
                            {' · '}
                            {t('lumen.manageVideo.playCount', '{count} plays', {
                              count: counts.playCount7Days,
                            })}
                          </li>
                          <li>
                            {t('lumen.manageVideo.past30Days', 'Past 30 days')}
                            {' · '}
                            {t('lumen.manageVideo.playCount', '{count} plays', {
                              count: counts.playCount30Days,
                            })}
                          </li>
                          <li>
                            {t('lumen.manageVideo.allTime', 'All time')}
                            {' · '}
                            {t('lumen.manageVideo.playCount', '{count} plays', {
                              count: counts.playCount,
                            })}
                          </li>
                        </ul>
                        {counts.users.length > 0 && (
                          <p className="note">
                            {t('lumen.manageVideo.playedBy', 'Played by')}:{' '}
                            {counts.users
                              .map((item) => item.displayName)
                              .join(', ')}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </section>
              )}

              {admin && jellystat.data && (
                <section
                  className="card"
                  aria-label={t(
                    'lumen.manageVideo.jellystatActivity',
                    'Jellystat watch activity'
                  )}
                >
                  <h4>
                    {t(
                      'lumen.manageVideo.jellystatActivity',
                      'Jellystat watch activity'
                    )}
                  </h4>
                  <p className="note">
                    {t('lumen.manageVideo.playCount', '{count} plays', {
                      count: jellystat.data.plays,
                    })}
                    {' · '}
                    {t(
                      'lumen.manageVideo.playbackHours',
                      '{hours} hours of playback',
                      {
                        hours: new Intl.NumberFormat(locale, {
                          maximumFractionDigits: 1,
                        }).format(jellystat.data.playbackSeconds / 3600),
                      }
                    )}
                  </p>
                </section>
              )}

              {admin && (
                <section className="card">
                  <h4>{t('lumen.manageVideo.library', 'Verified library')}</h4>
                  {library.error ? (
                    <div role="alert" className="note">
                      <p>
                        {t(
                          'lumen.manageVideo.libraryFailed',
                          'Couldn’t verify all library services.'
                        )}
                      </p>
                      <button
                        className="btn btn-tonal btn-sm"
                        onClick={library.revalidate}
                      >
                        {t('lumen.manageVideo.retry', 'Retry')}
                      </button>
                    </div>
                  ) : !library.data ? (
                    <p className="note" role="status">
                      {t(
                        'lumen.manageVideo.libraryLoading',
                        'Checking configured library services…'
                      )}
                    </p>
                  ) : (
                    <>
                      <p className="note">
                        {library.data.targets.length
                          ? t(
                              'lumen.manageVideo.copyCount',
                              '{count} verified library copies',
                              {
                                count: library.data.targets.length,
                              }
                            )
                          : t(
                              'lumen.manageVideo.noCopies',
                              'No verified library copies found.'
                            )}
                      </p>
                      {library.data.targets.length > 0 && (
                        <ul className="card-list">
                          {library.data.targets.map((target) => (
                            <li key={target.key}>
                              <b>{target.service}</b>{' '}
                              <span className="sub">
                                {target.quality} · {target.externalId}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {library.data.targets.length > 0 && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setConfirmation({ kind: 'remove' })}
                        >
                          {t(
                            'lumen.manageVideo.deleteFromLibrary',
                            'Delete from library'
                          )}
                        </button>
                      )}
                      {library.data.staleAvailabilityQualities?.map(
                        (quality) => (
                          <button
                            className="btn btn-tonal btn-sm"
                            key={quality}
                            onClick={() =>
                              setConfirmation({ kind: 'clear', quality })
                            }
                          >
                            {t(
                              'lumen.manageVideo.clearStale',
                              'Clear stale {quality} availability',
                              {
                                quality,
                              }
                            )}
                          </button>
                        )
                      )}
                    </>
                  )}
                </section>
              )}

              {failure && (
                <p role="alert" className="note">
                  {failure}
                </p>
              )}
              <div className="pk-foot">
                <button
                  className="btn btn-tonal"
                  data-autofocus
                  onClick={onClose}
                >
                  {t('lumen.manageVideo.close', 'Close')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

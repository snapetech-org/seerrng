import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { sortCrewPriority } from '../../../src/utils/creditPriority';
import {
  formatBytes,
  formatDurationMinutes,
} from '../../../src/utils/numberHelpers';
import {
  api,
  ApiError,
  MediaStatus,
  tmdbImg,
  type JellystatPlaybackSummary,
  type LibraryRemovalPlan,
  type MediaInfo,
  type MediaWatchDataResponse,
  type MovieDetails,
  type TvDetails,
} from '../api';
import { isAdministrator, useAuth } from '../auth';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { canManageIssues, canReadIssues } from '../issuePermissions';
import {
  downloadSubscriptionId,
  useLiveDownloadProgress,
} from '../useLiveDownloadProgress';
import BlocklistButton from './BlocklistButton';
import { Cover } from './cards';
import { ConfirmSheet } from './ConfirmSheet';
import { useToast } from './toast';
import { useDialog } from './useDialog';

type MediaKind = 'movie' | 'tv';
const DECLINED_REQUEST_STATUS = 3;
type ManagerAction =
  | { kind: 'remove' }
  | { kind: 'clear'; quality: 'HD' | '4K' }
  | { kind: 'deleteRequest'; requestId: number };

const safeServiceUrl = (value?: string | null) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
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

type SummaryValue = { label: string; href?: string };
type SummaryRow = { label: string; values: SummaryValue[] };

function VideoDetailsSummary({
  kind,
  details,
  locale,
  t,
}: {
  kind: MediaKind;
  details: MovieDetails | TvDetails;
  locale: string;
  t: (id: string, fallback: string) => string;
}) {
  const unavailable = t('lumen.manageVideo.notAvailable', 'Not available');
  const movie = details as MovieDetails;
  const tv = details as TvDetails;
  const releaseDate = kind === 'movie' ? movie.releaseDate : tv.firstAirDate;
  const runtime =
    kind === 'movie'
      ? movie.runtime
      : (tv.episodeRunTime ?? []).find((minutes) => minutes > 0);
  const genres = (details.genres ?? []).slice(0, 3).map((genre) => ({
    label: genre.name,
    href:
      Number.isSafeInteger(genre.id) && genre.id > 0
        ? `/discover/${kind === 'movie' ? 'movies' : 'tv'}/genre/${genre.id}`
        : undefined,
  }));
  const peopleRows: SummaryRow[] =
    kind === 'movie'
      ? sortCrewPriority(
          (movie.credits?.crew ?? []).filter(
            (person): person is typeof person & { job: string } =>
              typeof person.job === 'string'
          )
        )
          .slice(0, 2)
          .map((person) => ({
            label: person.job,
            values: [
              {
                label: person.name,
                href:
                  Number.isSafeInteger(person.id) && person.id > 0
                    ? `/person/${person.id}`
                    : undefined,
              },
            ],
          }))
      : [
          {
            label: t('lumen.manageVideo.creator', 'Creator'),
            values: (tv.createdBy ?? []).slice(0, 2).map((person) => ({
              label: person.name,
              href:
                typeof person.id === 'number' &&
                Number.isSafeInteger(person.id) &&
                person.id > 0
                  ? `/person/${person.id}`
                  : undefined,
            })),
          },
        ];
  const organizations: SummaryValue[] =
    kind === 'movie'
      ? (movie.productionCompanies ?? []).slice(0, 1).map((company) => ({
          label: company.name,
          href:
            Number.isSafeInteger(company.id) && company.id > 0
              ? `/discover/movies/studio/${company.id}`
              : undefined,
        }))
      : (tv.networks ?? []).slice(0, 2).map((network) => ({
          label: network.name,
          href:
            typeof network.id === 'number' &&
            Number.isSafeInteger(network.id) &&
            network.id > 0
              ? `/discover/tv/network/${network.id}`
              : undefined,
        }));
  const rows: SummaryRow[] = [
    {
      label: t('lumen.manageVideo.mediaFormat', 'Media & Format'),
      values: [
        {
          label:
            kind === 'movie'
              ? t('lumen.manageVideo.movie', 'Movie')
              : t('lumen.manageVideo.series', 'Series'),
        },
      ],
    },
    {
      label: t('lumen.manageVideo.releaseDate', 'Release Date'),
      values: [{ label: releaseDate || unavailable }],
    },
    {
      label: t('lumen.manageVideo.runtime', 'Runtime'),
      values: [
        {
          label:
            typeof runtime === 'number' &&
            Number.isFinite(runtime) &&
            runtime > 0
              ? formatDurationMinutes(Math.round(runtime), locale)
              : unavailable,
        },
      ],
    },
    {
      label: t('lumen.manageVideo.genres', 'Genres'),
      values: genres.length ? genres : [{ label: unavailable }],
    },
    ...peopleRows.map((row) => ({
      ...row,
      values: row.values.length ? row.values : [{ label: unavailable }],
    })),
    {
      label:
        kind === 'movie'
          ? t('lumen.manageVideo.studio', 'Studio')
          : t('lumen.manageVideo.network', 'Network'),
      values: organizations.length ? organizations : [{ label: unavailable }],
    },
  ];
  const posterTitle =
    kind === 'movie' ? details.title || '' : details.name || '';

  return (
    <section
      className="manager-summary"
      aria-label={t('lumen.manageVideo.titleDetails', 'Title Details')}
    >
      <div className="manager-summary-poster">
        <Cover
          src={tmdbImg(details.posterPath, 'w185')}
          title={posterTitle}
          icon={kind === 'movie' ? 'film' : 'tv'}
        />
      </div>
      <dl className="manager-summary-facts">
        {rows.map((row) => (
          <div className="manager-summary-row" key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              {row.values.map((value, index) => (
                <span key={`${value.label}-${index}`}>
                  {index > 0 && ', '}
                  {value.href ? (
                    <Link to={value.href}>{value.label}</Link>
                  ) : (
                    value.label
                  )}
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ManageVideoSheet({
  kind,
  title,
  year,
  media,
  onClose,
  onUpdated,
  mediaServerType,
  tmdbId,
  details,
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
  tmdbId?: number;
  details: MovieDetails | TvDetails;
}) {
  const box = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { t, locale } = useLumenLocale();
  const toast = useToast();
  const admin = isAdministrator(user?.permissions);
  const mayReadIssues = canReadIssues(user?.permissions);
  const mayManageIssues = canManageIssues(user?.permissions);
  const [issueAction, setIssueAction] = useState<{
    action: 'close' | 'delete';
    ids: number[];
  }>();
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

  const requests = (media.requests ?? []).filter(
    (request) => request.status !== DECLINED_REQUEST_STATUS
  );
  const noRequests = requests.length === 0;
  const downloads = [
    ...(media.downloadStatus ?? []).map((item) => ({ item, quality: 'HD' })),
    ...(media.downloadStatus4k ?? []).map((item) => ({ item, quality: '4K' })),
  ];
  const liveDownloads = useLiveDownloadProgress(
    downloads.map(({ item }) => downloadSubscriptionId(item, admin))
  );
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

  const confirmIssueAction = async () => {
    if (!issueAction || busy) return;
    const ids = issueAction.ids;
    if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0))
      return;
    setBusy(true);
    setFailure(undefined);
    try {
      for (const id of ids) {
        await api(
          `/issue/${id}${issueAction.action === 'close' ? '/resolved' : ''}`,
          {
            method: issueAction.action === 'close' ? 'POST' : 'DELETE',
          },
          'empty'
        );
      }
      setIssueAction(undefined);
      toast(
        issueAction.action === 'close'
          ? t(
              'lumen.manageVideo.issuesClosed',
              'Open issues marked as resolved.'
            )
          : t('lumen.manageVideo.issuesDeleted', 'All issues were deleted.')
      );
      onUpdated();
    } catch {
      setIssueAction(undefined);
      setFailure(
        t(
          'lumen.manageVideo.issueActionFailed',
          'Some issues may already have changed. Refresh the title and review the remaining issues.'
        )
      );
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

          <VideoDetailsSummary
            kind={kind}
            details={details}
            locale={locale}
            t={t}
          />

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
                    {requests.map((request) => (
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
                  <Link
                    className="btn btn-tonal btn-sm"
                    to={`/requests?mediaType=${kind}&search=${encodeURIComponent(title)}`}
                  >
                    {t(
                      'lumen.manageVideo.openRequests',
                      'Open matching requests'
                    )}
                  </Link>
                </div>
              </section>

              {downloads.length > 0 && (
                <section className="card">
                  <h4>{t('lumen.manageVideo.downloads', 'Downloads')}</h4>
                  <ul className="card-list">
                    {downloads.map(({ item, quality }, index) => {
                      const liveId = downloadSubscriptionId(item, admin);
                      const live = liveId
                        ? liveDownloads.get(liveId)
                        : undefined;
                      const validSizes =
                        Number.isFinite(item.size) &&
                        item.size > 0 &&
                        Number.isFinite(item.sizeLeft) &&
                        item.sizeLeft >= 0 &&
                        item.sizeLeft <= item.size;
                      const liveSizesValid =
                        live &&
                        Number.isFinite(live.size) &&
                        live.size > 0 &&
                        Number.isFinite(live.sizeLeft) &&
                        live.sizeLeft >= 0 &&
                        live.sizeLeft <= live.size;
                      const percent = liveSizesValid
                        ? ((live.size - live.sizeLeft) / live.size) * 100
                        : validSizes
                          ? ((item.size - item.sizeLeft) / item.size) * 100
                          : item.percent;
                      const liveState =
                        live?.state === 'error'
                          ? t(
                              'components.DownloadBlock.liveError',
                              'Client Error'
                            )
                          : live?.state === 'stalled'
                            ? t(
                                'components.DownloadBlock.liveStalled',
                                'Stalled'
                              )
                            : undefined;
                      const speed =
                        live?.state === 'downloading' &&
                        Number.isFinite(live.downloadRate) &&
                        live.downloadRate > 0
                          ? t('components.DownloadBlock.liveRate', '{rate}/s', {
                              rate: formatBytes(live.downloadRate, 1, locale),
                            })
                          : undefined;
                      const etaSeconds = live?.etaSeconds;
                      const estimatedAt =
                        typeof etaSeconds === 'number' &&
                        Number.isFinite(etaSeconds) &&
                        etaSeconds >= 0
                          ? new Date(
                              Date.now() + etaSeconds * 1000
                            ).toISOString()
                          : item.estimatedCompletionTime &&
                              Number.isFinite(
                                Date.parse(item.estimatedCompletionTime)
                              )
                            ? new Date(
                                item.estimatedCompletionTime
                              ).toISOString()
                            : undefined;
                      const downloadTitle =
                        admin && item.title
                          ? item.title
                          : item.episode &&
                              Number.isSafeInteger(item.episode.seasonNumber) &&
                              Number.isSafeInteger(item.episode.episodeNumber)
                            ? t(
                                'lumen.manageVideo.episodeDownloadTitle',
                                '{title}: Season {seasonNumber} Episode {episodeNumber}',
                                {
                                  title,
                                  seasonNumber: item.episode.seasonNumber,
                                  episodeNumber: item.episode.episodeNumber,
                                }
                              )
                            : title;
                      return (
                        <li key={`${quality}-${item.downloadId ?? index}`}>
                          <b>
                            {quality} ·{' '}
                            {item.status ||
                              t('lumen.manageVideo.processing', 'Processing')}
                          </b>
                          {downloadTitle && (
                            <span className="sub"> · {downloadTitle}</span>
                          )}
                          {typeof percent === 'number' &&
                            Number.isFinite(percent) &&
                            percent >= 0 &&
                            percent <= 100 && (
                              <span className="sub">
                                {' '}
                                {Math.round(percent)}%
                              </span>
                            )}
                          {(item.downloadClient ||
                            live?.clientName ||
                            live?.seeds != null ||
                            liveState ||
                            speed) && (
                            <span className="sub">
                              {' · '}
                              {[
                                live?.clientName || item.downloadClient
                                  ? t(
                                      'lumen.manageVideo.downloadClient',
                                      'Client: {name}',
                                      {
                                        name:
                                          live?.clientName ||
                                          item.downloadClient ||
                                          '',
                                      }
                                    )
                                  : undefined,
                                speed,
                                liveState,
                                live?.seeds != null
                                  ? t(
                                      'lumen.manageVideo.liveSeeds',
                                      'Seeds: {count}',
                                      {
                                        count: live.seeds,
                                      }
                                    )
                                  : undefined,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          )}
                          {estimatedAt && (
                            <span className="sub">
                              {' · '}
                              {t(
                                'lumen.requestHistory.estimatedCompletion',
                                'Estimated completion'
                              )}{' '}
                              <time dateTime={estimatedAt}>
                                {new Date(estimatedAt).toLocaleString(locale)}
                              </time>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              <section className="card">
                <h4>{t('lumen.manageVideo.blocklist', 'Blocklist')}</h4>
                <BlocklistButton
                  mediaType={kind}
                  id={tmdbId}
                  requestedId={tmdbId}
                  title={title}
                  onChange={onUpdated}
                />
              </section>

              {mayReadIssues && (
                <section className="card">
                  <h4>
                    {t('lumen.manageVideo.issues', 'Issues')} ·{' '}
                    {(media.issues ?? []).length}
                  </h4>
                  {media.issues?.length ? (
                    <ul className="card-list">
                      {media.issues.map((issue) => (
                        <li key={issue.id}>
                          <Link to={`/issues/${issue.id}`}>
                            {t(
                              'lumen.manageVideo.issueLink',
                              'Issue #{id} · {status}',
                              {
                                id: issue.id,
                                status:
                                  issue.status === 2
                                    ? t(
                                        'lumen.manageVideo.resolved',
                                        'Resolved'
                                      )
                                    : t('lumen.manageVideo.openIssue', 'Open'),
                              }
                            )}
                          </Link>
                          {issue.comments?.[0]?.message && (
                            <details className="adv">
                              <summary>
                                {t('lumen.issues.viewDetails', 'View Details')}
                              </summary>
                              <p className="note">
                                {issue.comments[0].message}
                              </p>
                            </details>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="note">
                      {t(
                        'lumen.manageVideo.noIssues',
                        'There are no issues for this title.'
                      )}
                    </p>
                  )}
                  {mayManageIssues && !!media.issues?.length && (
                    <div className="toolbar">
                      {!!media.issues.some((issue) => issue.status !== 2) && (
                        <button
                          className="btn btn-quiet btn-sm"
                          disabled={busy}
                          onClick={() =>
                            setIssueAction({
                              action: 'close',
                              ids: [
                                ...new Set(
                                  (media.issues ?? [])
                                    .filter((issue) => issue.status !== 2)
                                    .map((issue) => issue.id)
                                ),
                              ],
                            })
                          }
                        >
                          {t(
                            'lumen.manageVideo.closeIssues',
                            'Close open issues'
                          )}
                        </button>
                      )}
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={busy}
                        onClick={() =>
                          setIssueAction({
                            action: 'delete',
                            ids: [
                              ...new Set(
                                (media.issues ?? []).map((issue) => issue.id)
                              ),
                            ],
                          })
                        }
                      >
                        {t(
                          'lumen.manageVideo.deleteIssues',
                          'Delete all issues'
                        )}
                      </button>
                    </div>
                  )}
                </section>
              )}

              {admin && openLinks.length > 0 && (
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

              {admin &&
                (watchData.data?.data ||
                  watchData.data?.data4k ||
                  safeServiceUrl(media.tautulliUrl) ||
                  safeServiceUrl(media.tautulliUrl4k)) && (
                  <section className="card">
                    <h4>
                      {t(
                        'lumen.manageVideo.playbackHistory',
                        'Playback history'
                      )}
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
                              {t(
                                'lumen.manageVideo.playCount',
                                '{count} plays',
                                {
                                  count: counts.playCount7Days,
                                }
                              )}
                            </li>
                            <li>
                              {t(
                                'lumen.manageVideo.past30Days',
                                'Past 30 days'
                              )}
                              {' · '}
                              {t(
                                'lumen.manageVideo.playCount',
                                '{count} plays',
                                {
                                  count: counts.playCount30Days,
                                }
                              )}
                            </li>
                            <li>
                              {t('lumen.manageVideo.allTime', 'All time')}
                              {' · '}
                              {t(
                                'lumen.manageVideo.playCount',
                                '{count} plays',
                                {
                                  count: counts.playCount,
                                }
                              )}
                            </li>
                          </ul>
                          {counts.users.length > 0 && (
                            <p className="note">
                              {t('lumen.manageVideo.playedBy', 'Played by')}:{' '}
                              {counts.users.map((item, index) => (
                                <span key={item.id}>
                                  {index > 0 ? ', ' : ''}
                                  <Link
                                    to={
                                      item.id === user?.id
                                        ? '/profile'
                                        : `/users/${item.id}`
                                    }
                                  >
                                    {item.displayName}
                                  </Link>
                                </span>
                              ))}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    <div className="toolbar">
                      {[
                        ['HD', safeServiceUrl(media.tautulliUrl)],
                        ['4K', safeServiceUrl(media.tautulliUrl4k)],
                      ].map(([quality, url]) =>
                        url ? (
                          <a
                            className="btn btn-tonal btn-sm"
                            href={url}
                            key={quality}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t(
                              'lumen.manageVideo.openTautulli',
                              'Open in Tautulli'
                            )}{' '}
                            · {quality}
                          </a>
                        ) : null
                      )}
                    </div>
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
      {issueAction && (
        <ConfirmSheet
          title={
            issueAction.action === 'close'
              ? t('lumen.manageVideo.closeIssuesConfirm', 'Close open issues?')
              : t('lumen.manageVideo.deleteIssuesConfirm', 'Delete all issues?')
          }
          body={
            issueAction.action === 'close'
              ? t(
                  'lumen.manageVideo.closeIssuesBody',
                  'Open issues for this title will be marked resolved and their history retained.'
                )
              : t(
                  'lumen.manageVideo.deleteIssuesBody',
                  'All issues and comments for this title will be permanently deleted.'
                )
          }
          confirm={
            issueAction.action === 'close'
              ? t('lumen.manageVideo.closeIssues', 'Close open issues')
              : t('lumen.manageVideo.deleteIssues', 'Delete all issues')
          }
          busy={busy}
          onConfirm={() => void confirmIssueAction()}
          onClose={() => {
            if (!busy) setIssueAction(undefined);
          }}
        />
      )}
    </div>,
    document.body
  );
}

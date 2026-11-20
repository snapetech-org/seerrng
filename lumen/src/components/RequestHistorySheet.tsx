import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { bookRequestLabel, videoDetailPath, type RequestItem } from '../api';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Pill } from './detail';
import { ServiceNote } from './extra';
import { RequestFiles } from './RequestFiles';
import { useDialog } from './useDialog';

interface Status {
  stage: string;
  message?: string | null;
  attempt: number;
}

interface StatusEvent extends Status {
  id: number;
  createdAt: string;
}

interface CurrentStatus extends Status {
  retryable?: boolean;
  percent?: number | null;
  size?: number | null;
  sizeLeft?: number | null;
  downloadCount?: number;
  service?: string | null;
  estimatedCompletionTime?: string | null;
  bookImportProgresses?: {
    format: 'ebook' | 'audiobook';
    attemptCount?: number;
    maxAttempts?: number;
    nextAttemptAt?: string | null;
  }[];
}

interface RequestHistory {
  request: RequestItem;
  current: CurrentStatus;
  history: { results: StatusEvent[]; total: number };
}

const downloadableTypes = new Set(['movie', 'tv', 'book', 'comic', 'magazine']);
const stages = new Map([
  ['requested', 'components.Requests.requested'],
  ['approved', 'components.Requests.approved'],
  ['searching', 'components.Requests.searching'],
  ['downloading', 'components.Requests.downloading'],
  ['importing', 'components.Requests.importing'],
  ['library', 'components.Requests.library'],
  ['available', 'components.Requests.available'],
  ['unavailable', 'components.Requests.unavailable'],
  ['failed', 'components.Requests.failed'],
  ['declined', 'components.Requests.declined'],
  ['cancelled', 'components.Requests.cancelled'],
]);
const seasonStatus = new Map([
  [
    1,
    'components.UserProfile.UserSettings.UserTvSeasonWatchGateAccess.statusPending',
  ],
  [2, 'components.Requests.approved'],
  [3, 'components.Requests.declined'],
  [4, 'components.Requests.failed'],
  [5, 'components.Requests.completed'],
]);

function formatSize(bytes: number, locale: string) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const scale = Math.min(
    units.length - 1,
    bytes > 0 ? Math.floor(Math.log2(bytes) / 10) : 0
  );
  return `${(bytes / 1024 ** scale).toLocaleString(locale, { maximumFractionDigits: 1 })} ${units[scale]}`;
}

function StatusTime({ value, locale }: { value: string; locale: string }) {
  const time = new Date(value);
  if (!Number.isFinite(time.valueOf())) return null;
  return <time dateTime={value}>{time.toLocaleString(locale)}</time>;
}

function RequestProgress({
  current,
  locale,
  t,
}: {
  current: CurrentStatus;
  locale: string;
  t: ReturnType<typeof useLumenLocale>['t'];
}) {
  const {
    percent,
    size,
    sizeLeft,
    downloadCount,
    service,
    estimatedCompletionTime,
  } = current;
  const hasSize =
    typeof size === 'number' &&
    Number.isFinite(size) &&
    size > 0 &&
    typeof sizeLeft === 'number' &&
    Number.isFinite(sizeLeft) &&
    sizeLeft >= 0 &&
    sizeLeft <= size;
  return (
    <>
      <p className="note">
        {t('lumen.requestHistory.currentStatus', 'Current status: {status}', {
          status: t(stages.get(current.stage) ?? 'i18n.unknown', current.stage),
        })}
        {typeof percent === 'number' &&
          Number.isFinite(percent) &&
          percent >= 0 &&
          percent <= 100 &&
          ` · ${Math.round(percent)}%`}
        {service && ` · ${service}`}
      </p>
      {current.message && <p className="note">{current.message}</p>}
      {hasSize && (
        <p className="note">
          {t(
            'lumen.requestHistory.downloadedSize',
            '{complete} of {total} downloaded',
            {
              complete: formatSize(size - sizeLeft, locale),
              total: formatSize(size, locale),
            }
          )}
        </p>
      )}
      {!!downloadCount && downloadCount > 0 && (
        <p className="note">
          {t('lumen.requestHistory.downloadCount', '{count} downloads', {
            count: downloadCount,
          })}
        </p>
      )}
      {estimatedCompletionTime &&
        Number.isFinite(Date.parse(estimatedCompletionTime)) && (
          <p className="note">
            {t(
              'lumen.requestHistory.estimatedCompletion',
              'Estimated completion'
            )}{' '}
            <StatusTime locale={locale} value={estimatedCompletionTime} />
          </p>
        )}
      {current.bookImportProgresses?.map((item) => (
        <p className="note" key={item.format}>
          {t(
            item.format === 'ebook'
              ? 'lumen.requestHistory.ebook'
              : 'lumen.requestHistory.audiobook',
            item.format === 'ebook' ? 'Ebook' : 'Audiobook'
          )}{' '}
          {t('lumen.requestHistory.importPending', 'import pending')}
          {typeof item.attemptCount === 'number' &&
            ` · ${t('lumen.requestHistory.attempt', 'Attempt {count}', { count: item.attemptCount })}`}
          {typeof item.maxAttempts === 'number' &&
            typeof item.attemptCount === 'number' &&
            ` ${t('lumen.requestHistory.ofAttempts', 'of {count}', { count: item.maxAttempts })}`}
          {item.nextAttemptAt &&
            Number.isFinite(Date.parse(item.nextAttemptAt)) && (
              <>
                {' '}
                · {t('lumen.requestHistory.nextAttempt', 'Next attempt')}{' '}
                <StatusTime locale={locale} value={item.nextAttemptAt} />
              </>
            )}
        </p>
      ))}
    </>
  );
}

export default function RequestHistorySheet({
  id,
  title,
  close,
  renderActions,
  describeRequest,
}: {
  id: number;
  title?: string;
  describeRequest?: (
    request: RequestItem
  ) => Promise<{ title: string; href: string }>;
  close: () => void;
  renderActions?: (request: RequestItem, title: string) => ReactNode;
}) {
  const { locale, t } = useLumenLocale();
  const [showFiles, setShowFiles] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, close);
  const history = useApi<RequestHistory>(`/request/status/${id}`);
  const data =
    typeof history.data?.current?.stage === 'string' &&
    Array.isArray(history.data?.history?.results)
      ? history.data
      : null;
  const error =
    history.error ||
    (history.data && !data
      ? t('lumen.requestHistory.invalid', 'Invalid request history response.')
      : null);
  const reload = history.reload;

  const [description, setDescription] = useState<{
    request: RequestItem;
    title: string;
    href: string;
  }>();
  const request = data?.request;
  useEffect(() => {
    if (!describeRequest || request?.id !== id || !request.media) return;
    let active = true;
    void describeRequest(request).then(
      (row) => {
        if (active)
          setDescription({ request, title: row.title, href: row.href });
      },
      () => {}
    );
    return () => {
      active = false;
    };
  }, [describeRequest, id, request]);
  const resolved = description?.request === request ? description : undefined;
  const displayTitle =
    title ||
    resolved?.title ||
    t('lumen.requestHistory.requestNumber', 'Request #{id}', { id });
  const href = resolved?.href;

  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={close} />
      <div
        className="sheet"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t('components.Requests.history', 'History')}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h2>{t('components.Requests.history', 'History')}</h2>
            <p className="note">{displayTitle}</p>
            {href && /^\/(?!\/)[^?]*[^/?](?:\?|$)/.test(href) && (
              <Link className="go" to={href}>
                {t('lumen.requestHistory.openTitle', 'Open Title')}
              </Link>
            )}
            {request?.type === 'book' && (
              <p className="note">{bookRequestLabel(request.bookFormat)}</p>
            )}
            {request?.is4k &&
              (request.type === 'movie' || request.type === 'tv') && (
                <p className="note">
                  {request.type === 'movie' ? 'Movie' : 'Series'} · 4K
                </p>
              )}
          </header>
          <ServiceNote
            error={error}
            what={t('lumen.requestHistory.item', 'request history')}
            retry={reload}
          />
          {!data && !error && (
            <p className="note" role="status">
              {t('lumen.requestHistory.loading', 'Loading request history…')}
            </p>
          )}
          {data && (
            <>
              <RequestProgress current={data.current} locale={locale} t={t} />
              {request?.type === 'tv' && !!request.seasons?.length && (
                <ul
                  className="setlist"
                  aria-label={t(
                    'lumen.requestHistory.requestedSeasons',
                    'Requested seasons'
                  )}
                >
                  {request.seasons.map(
                    ({ seasonNumber, episodeNumbers, status }) => {
                      const name =
                        seasonNumber === 0
                          ? t(
                              'components.RequestModal.RequestTree.specials',
                              'Specials'
                            )
                          : t(
                              'components.RequestModal.RequestTree.seasonNumber',
                              'Season {number}',
                              { number: seasonNumber }
                            );
                      const tmdbId = request.media?.tmdbId;
                      const target =
                        Number.isSafeInteger(tmdbId) && tmdbId > 0
                          ? videoDetailPath(
                              'tv',
                              tmdbId,
                              request.is4k,
                              seasonNumber
                            )
                          : undefined;
                      return (
                        <li className="set" key={seasonNumber}>
                          {target ? (
                            <Link className="go" to={target}>
                              {name}
                            </Link>
                          ) : (
                            <b>{name}</b>
                          )}
                          <small>
                            {episodeNumbers?.length
                              ? t(
                                  'lumen.requestHistory.episodes',
                                  'Episodes {episodes}',
                                  { episodes: episodeNumbers.join(', ') }
                                )
                              : t(
                                  'components.IssueDetails.allepisodes',
                                  'All episodes'
                                )}
                            {status !== undefined &&
                              seasonStatus.has(status) &&
                              ` · ${t(seasonStatus.get(status)!, '')}`}
                          </small>
                        </li>
                      );
                    }
                  )}
                </ul>
              )}
              {data.request?.status === 1 && data.request.quotaException && (
                <Pill k="wait">
                  {t('lumen.requestHistory.overQuota', 'Over Quota')}
                </Pill>
              )}
              {data.request?.id === id &&
                renderActions?.(
                  {
                    ...data.request,
                    currentStatus: {
                      ...data.current,
                      percent: data.current.percent ?? null,
                      message: data.current.message ?? undefined,
                    },
                  },
                  displayTitle
                )}

              {data.current.stage === 'available' &&
                downloadableTypes.has(data.request?.type) &&
                (showFiles ? (
                  <RequestFiles id={id} />
                ) : (
                  <button
                    className="btn btn-tonal btn-sm"
                    onClick={() => setShowFiles(true)}
                  >
                    {t(
                      'lumen.requestHistory.findDownloadFiles',
                      'Find Download Files'
                    )}
                  </button>
                ))}
              {data.history.results.length ? (
                <ol className="setlist">
                  {data.history.results.map((event) => {
                    return (
                      <li className="set" key={event.id}>
                        <div>
                          <b>
                            {t(
                              stages.get(event.stage) ??
                                'components.Requests.statusUpdated',
                              event.stage
                            )}
                          </b>
                          <div className="note">
                            <StatusTime
                              locale={locale}
                              value={event.createdAt}
                            />
                            {event.attempt > 1 &&
                              ` · ${t('lumen.requestHistory.attempt', 'Attempt {count}', { count: event.attempt })}`}
                          </div>
                          {event.message && (
                            <p className="note">{event.message}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="note">
                  {t(
                    'lumen.requestHistory.noHistory',
                    'No history has been recorded for this request.'
                  )}
                </p>
              )}
              {data.history.total > data.history.results.length && (
                <p className="note">
                  {t(
                    'lumen.requestHistory.showingLatest',
                    'Showing the latest {shown} of {total} events.',
                    {
                      shown: data.history.results.length,
                      total: data.history.total,
                    }
                  )}
                </p>
              )}
            </>
          )}
          <div className="pk-foot">
            {data && (
              <button className="btn btn-tonal" onClick={reload}>
                {t('lumen.requestHistory.refresh', 'Refresh Status')}
              </button>
            )}
            <button className="btn btn-quiet" onClick={close}>
              {t('i18n.close', 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

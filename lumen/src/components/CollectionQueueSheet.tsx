import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { useApi, usePublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';
import { canRequest4k, canRequestMovies } from './detail';
import { useDialog } from './useDialog';

const STATUS_FALLBACK = {
  active: 'Queue Active',
  waiting: 'Waiting',
  completed: 'All Movies Queued',
  stopped: 'Queue Stopped',
};
const REASON_FALLBACK = {
  'playback-unlinked': 'Link your Plex, Jellyfin, or Emby account to continue.',
  'request-policy':
    'Review request access, quotas, Blocklist entries, or service settings. Pending requests still require approval.',
  'provider-unavailable':
    'Playback history is unavailable. SeerrNG will retry automatically.',
  'request-cancelled':
    'An earlier request is missing or was interrupted. Restart the queue to request missing movies again.',
};

interface Queue {
  is4k: boolean;
  collectionId: number;
  bufferSize: 1 | 2;
  status: keyof typeof STATUS_FALLBACK;
  reason: keyof typeof REASON_FALLBACK | null;
  requested: number;
  watched: number;
  total: number;
}
interface QueueResponse {
  queue: Queue | null;
}

function QueueControls({
  id,
  is4k,
  canStart,
  onBusy,
}: {
  id: number;
  is4k: boolean;
  canStart: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const { t } = useLumenLocale();
  const base = `/collection/${id}/queue`;
  const path = `${base}?is4k=${is4k}`;
  const [queue, setQueue] = useState<Queue | null>();
  const [buffer, setBuffer] = useState<1 | 2>();
  const [readError, setReadError] = useState(false);
  const [writeError, setWriteError] = useState('');
  const [busy, setBusy] = useState(false);
  const changing = useRef(false);
  const generation = useRef(0);
  const readNow = useRef<() => void>(() => {});

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const read = async () => {
      if (pending || changing.current) return;
      pending = true;
      const current = generation.current;
      try {
        const { queue: result } = await api<QueueResponse>(path, {
          signal: controller.signal,
        });
        if (controller.signal.aborted || current !== generation.current) return;
        if (result && (result.collectionId !== id || result.is4k !== is4k))
          throw new Error();
        setQueue(result);
        setReadError(false);
      } catch {
        if (!controller.signal.aborted && current === generation.current)
          setReadError(true);
      } finally {
        pending = false;
      }
    };
    readNow.current = () => void read();
    readNow.current();
    const timer = window.setInterval(readNow.current, 3000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [id, is4k, path]);

  const active = queue?.status === 'active' || queue?.status === 'waiting';
  const bufferSize = buffer ?? queue?.bufferSize ?? 1;

  async function change() {
    if (
      changing.current ||
      (!active && (readError || queue === undefined || !canStart))
    )
      return;
    changing.current = true;
    generation.current++;
    setBusy(true);
    onBusy(true);
    setWriteError('');
    try {
      if (active) {
        await api<void>(path, { method: 'DELETE' });
        setQueue((previous) =>
          previous ? { ...previous, status: 'stopped', reason: null } : previous
        );
      } else {
        const { queue: result } = await api<QueueResponse>(base, {
          method: 'POST',
          body: JSON.stringify({ bufferSize, is4k }),
        });
        if (result?.collectionId !== id || result.is4k !== is4k)
          throw new Error();
        setQueue(result);
        setBuffer(undefined);
      }
      setReadError(false);
    } catch (error) {
      setReadError(true);
      setWriteError(
        error instanceof ApiError &&
          [400, 403, 409, 503].includes(error.status) &&
          error.message.length <= 512
          ? error.message
          : t(
              'lumen.collectionQueue.confirmFailure',
              'Could not confirm the change. Check the queue before trying again.'
            )
      );
    } finally {
      changing.current = false;
      setBusy(false);
      onBusy(false);
      readNow.current();
    }
  }

  return (
    <>
      <div className="toolbar">
        <label className="sel">
          <span className="lbl">
            {t('lumen.collectionQueue.moviesAhead', 'Movies Ahead')}
          </span>
          <select
            aria-label={t('lumen.collectionQueue.moviesAhead', 'Movies Ahead')}
            value={bufferSize}
            disabled={busy || active}
            onChange={(event) => setBuffer(event.target.value === '2' ? 2 : 1)}
          >
            <option value={1}>
              {t('lumen.collectionQueue.oneMovie', '1 movie')}
            </option>
            <option value={2}>
              {t('lumen.collectionQueue.twoMovies', '2 movies')}
            </option>
          </select>
        </label>
      </div>
      {queue === undefined && !readError && (
        <p className="note" role="status">
          {t('lumen.collectionQueue.loading', 'Loading collection queue…')}
        </p>
      )}
      {readError && (
        <p className="note" role="alert">
          {t(
            'lumen.collectionQueue.refreshFailure',
            'Queue status could not be refreshed. Retrying…'
          )}
        </p>
      )}
      {writeError && (
        <p className="note" role="alert">
          {writeError}
        </p>
      )}
      {queue && (
        <div role="status">
          <b>
            {t(
              `lumen.collectionQueue.status.${queue.status}`,
              STATUS_FALLBACK[queue.status]
            )}
          </b>
          <p className="note">
            {t(
              'lumen.collectionQueue.progress',
              '{watched} watched · {requested} requested by this queue · {total} total',
              {
                watched: queue.watched,
                requested: queue.requested,
                total: queue.total,
              }
            )}
          </p>
          {queue.reason && (
            <p className="note">
              {t(
                `lumen.collectionQueue.reason.${queue.reason}`,
                REASON_FALLBACK[queue.reason]
              )}
            </p>
          )}
        </div>
      )}
      {!canStart && !active && (
        <p className="note">
          {t(
            'lumen.collectionQueue.accessRequired',
            'Movie request access and an enabled quality are required to start a queue.'
          )}
        </p>
      )}
      {active && (
        <p className="note">
          {t(
            'lumen.collectionQueue.stopExplanation',
            'Stopping prevents future requests. Existing requests and downloaded files stay in place.'
          )}
        </p>
      )}
      <div className="toolbar">
        <button
          className={active ? 'btn btn-quiet' : 'btn btn-primary'}
          disabled={
            busy || (!active && (readError || queue === undefined || !canStart))
          }
          onClick={() => void change()}
        >
          {active
            ? t('lumen.collectionQueue.stop', 'Stop Queue')
            : queue
              ? t('lumen.collectionQueue.restart', 'Restart Queue')
              : t('lumen.collectionQueue.start', 'Start Queue')}
        </button>
      </div>
    </>
  );
}

export default function CollectionQueueSheet({
  id,
  title,
  close,
}: {
  id: number;
  title: string;
  close: () => void;
}) {
  const { t } = useLumenLocale();
  const dialog = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [is4k, setIs4k] = useState(false);
  const { user } = useAuth();
  const settings = usePublicSettings();
  const enabled4k = settings?.movie4kEnabled === true;
  const { data: existing4k } = useApi<QueueResponse>(
    enabled4k ? null : `/collection/${id}/queue?is4k=true`
  );
  const permissions = user?.permissions ?? 0;
  const canStart = is4k
    ? enabled4k && canRequest4k(permissions, 'movie')
    : canRequestMovies(permissions);
  const dismiss = () => {
    if (!busy) close();
  };
  useDialog(dialog, dismiss);

  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={dismiss} />
      <div
        className="sheet"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('lumen.collectionQueue.title', 'Queue Collection')}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h2>{t('lumen.collectionQueue.title', 'Queue Collection')}</h2>
            <p className="note">{title}</p>
          </header>
          <p className="note">
            {t(
              'lumen.collectionQueue.description',
              'Request movies in release order as you watch, using your regular request defaults. Already requested movies count toward the buffer.'
            )}
          </p>
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">
                {t('lumen.collectionQueue.quality', 'Quality')}
              </span>
              <select
                aria-label={t('lumen.collectionQueue.quality', 'Quality')}
                disabled={busy}
                value={is4k ? '4k' : 'hd'}
                onChange={(event) => setIs4k(event.target.value === '4k')}
              >
                <option value="hd">HD</option>
                {(enabled4k || existing4k?.queue || is4k) && (
                  <option value="4k">
                    {enabled4k
                      ? '4K'
                      : t(
                          'lumen.collectionQueue.existing4k',
                          '4K (Existing Queue)'
                        )}
                  </option>
                )}
              </select>
            </label>
          </div>
          <QueueControls
            key={String(is4k)}
            id={id}
            is4k={is4k}
            canStart={canStart}
            onBusy={setBusy}
          />
          <div className="pk-foot">
            <button className="btn btn-quiet" disabled={busy} onClick={dismiss}>
              {t('lumen.collectionQueue.close', 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

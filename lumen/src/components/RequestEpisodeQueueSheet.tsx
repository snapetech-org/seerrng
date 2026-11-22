import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type RequestItem } from '../api';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import { ServiceNote } from './extra';
import { useDialog } from './useDialog';

interface QueueSetting {
  episodeCount: number;
  usesUserDefault: boolean;
}

export function canEditEpisodeQueue(
  request: RequestItem,
  permissions?: number
) {
  return (
    ((permissions ?? 0) & (2 | 8)) !== 0 &&
    request.type === 'tv' &&
    !!request.requestedBy?.id &&
    !request.isAutoRequest &&
    !request.watchAheadParentRequestId &&
    [1, 2, 5].includes(request.status)
  );
}

export default function RequestEpisodeQueueSheet({
  request,
  title,
  close,
  saved,
}: {
  request: RequestItem;
  title: string;
  close: () => void;
  saved: (setting: QueueSetting) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLumenLocale();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const { data, error, reload } = useApi<{ defaultEpisodeCount: number }>(
    `/user/${request.requestedBy.id}/settings/episode-queue`
  );
  const initial =
    request.watchAheadUsesUserDefault === false
      ? (request.watchAheadEpisodeCount ?? 0)
      : -1;
  const [draft, setDraft] = useState(initial);
  const dismiss = () => {
    if (!pending.current) close();
  };
  useDialog(ref, dismiss);

  async function apply() {
    if (pending.current || !data || draft === initial) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setFailure('');
    try {
      const result = await api<QueueSetting>(
        `/request/${request.id}/episode-queue`,
        {
          method: 'POST',
          body: JSON.stringify({ episodeCount: draft < 0 ? null : draft }),
        }
      );
      if (generation !== sessionGeneration()) return;
      if (
        result.usesUserDefault !== draft < 0 ||
        !Number.isSafeInteger(result.episodeCount) ||
        result.episodeCount < 0 ||
        result.episodeCount > 5 ||
        (draft >= 0 && result.episodeCount !== draft)
      )
        throw new Error();
      saved(result);
    } catch (err) {
      if (generation === sessionGeneration()) {
        setFailure(
          err instanceof ApiError && err.status === 409
            ? t(
                'lumen.requests.episodeQueue.conflict',
                'This request is no longer eligible for that queue setting. Reload the request and try again.'
              )
            : t(
                'lumen.requests.episodeQueue.saveFailure',
                'Could not confirm the Episode Queue change. Check the request before trying again.'
              )
        );
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={dismiss} />
      <div
        className="sheet"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t('lumen.requests.episodeQueue.title', 'Episode Queue')}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h2>{t('lumen.requests.episodeQueue.title', 'Episode Queue')}</h2>
            <p className="note">{title}</p>
          </header>
          <p className="note">
            {t(
              'lumen.requests.episodeQueue.description',
              'Queue length controls how many upcoming episodes playback keeps requested. Existing requests and downloads stay in place.'
            )}
          </p>
          {request.status === 1 && (
            <p className="note">
              {t(
                'lumen.requests.episodeQueue.pendingHelp',
                'For a pending request, choose one starting episode before approval.'
              )}
            </p>
          )}
          <ServiceNote
            error={error}
            what={t(
              'lumen.requests.episodeQueue.accountDefault',
              'the account default'
            )}
            retry={reload}
          />
          {!data && !error && (
            <p className="note" role="status">
              {t(
                'lumen.requests.episodeQueue.loading',
                'Loading the account default…'
              )}
            </p>
          )}
          {data && (
            <label className="sel">
              <span className="lbl">
                {t('lumen.requests.episodeQueue.length', 'Queue Length')}
              </span>
              <select
                aria-label={t(
                  'lumen.requests.episodeQueue.length',
                  'Queue Length'
                )}
                value={draft}
                disabled={busy}
                onChange={(event) => setDraft(Number(event.target.value))}
              >
                <option value={-1}>
                  {t(
                    'lumen.requests.episodeQueue.defaultOption',
                    'Account default ({count})',
                    {
                      count:
                        data.defaultEpisodeCount ||
                        t('lumen.requests.episodeQueue.off', 'off'),
                    }
                  )}
                </option>
                <option value={0}>
                  {t('lumen.requests.episodeQueue.off', 'Off')}
                </option>
                {[1, 2, 3, 4, 5].map((count) => (
                  <option key={count} value={count}>
                    {count === 1
                      ? t('lumen.requests.episodeQueue.oneEpisode', '1 episode')
                      : t(
                          'lumen.requests.episodeQueue.multipleEpisodes',
                          '{count} episodes',
                          { count }
                        )}
                  </option>
                ))}
              </select>
            </label>
          )}
          {failure && (
            <p className="note" role="alert">
              {failure}
            </p>
          )}
          <div className="pk-foot">
            <button className="btn btn-quiet" disabled={busy} onClick={dismiss}>
              {t('lumen.requests.episodeQueue.cancel', 'Cancel')}
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !data || draft === initial}
              onClick={() => void apply()}
            >
              {t('lumen.requests.episodeQueue.save', 'Save Episode Queue')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

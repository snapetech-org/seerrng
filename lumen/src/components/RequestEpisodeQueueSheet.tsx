import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type RequestItem } from '../api';
import { useApi } from '../hooks';
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
            ? 'This request is no longer eligible for that queue setting. Reload the request and try again.'
            : 'Could not confirm the Episode Queue change. Check the request before trying again.'
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
        aria-label="Episode Queue"
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h2>Episode Queue</h2>
            <p className="note">{title}</p>
          </header>
          <p className="note">
            Queue length controls how many upcoming episodes playback keeps
            requested. Existing requests and downloads stay in place.
          </p>
          {request.status === 1 && (
            <p className="note">
              For a pending request, choose one starting episode before
              approval.
            </p>
          )}
          <ServiceNote
            error={error}
            what="the account default"
            retry={reload}
          />
          {!data && !error && (
            <p className="note" role="status">
              Loading the account default…
            </p>
          )}
          {data && (
            <label className="sel">
              <span className="lbl">Queue Length</span>
              <select
                aria-label="Queue Length"
                value={draft}
                disabled={busy}
                onChange={(event) => setDraft(Number(event.target.value))}
              >
                <option value={-1}>
                  Account default ({data.defaultEpisodeCount || 'off'})
                </option>
                <option value={0}>Off</option>
                {[1, 2, 3, 4, 5].map((count) => (
                  <option key={count} value={count}>
                    {count} {count === 1 ? 'episode' : 'episodes'}
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
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || !data || draft === initial}
              onClick={() => void apply()}
            >
              Save Episode Queue
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

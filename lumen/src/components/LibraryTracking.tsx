import { useRef, useState } from 'react';
import { api } from '../api';
import { sessionGeneration } from '../sessionState';
import { ConfirmSheet } from './ConfirmSheet';
import { type MappingCandidate, videoHref } from './IdentityMapping';

type Provider = 'trakt' | 'anilist' | 'simkl';
type Action = 'watched' | 'rating' | 'progress';
type Change = { action: Action; value: number | boolean };
type TrackingItem = MappingCandidate & {
  sourceId?: string;
  status?: string;
  rating?: number;
  progress?: number;
  totalEpisodes?: number;
};
const base = '/integrations/discovery/tracking';

function actionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export default function LibraryTracking({
  item,
  provider,
  updated,
}: {
  item: TrackingItem;
  provider: Provider;
  updated: () => void;
}) {
  const aniList = provider === 'anilist';
  const aniListId = Number(item.sourceId);
  const target = aniList
    ? Number.isSafeInteger(aniListId) && aniListId > 0
      ? { anilistId: aniListId }
      : null
    : videoHref(item)
      ? { tmdbId: item.tmdbId, mediaType: item.mediaType }
      : null;
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState('');
  const [progress, setProgress] = useState('');
  const [confirm, setConfirm] = useState<Change>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const active = useRef(false);
  const attempts = useRef(new Map<string, string>());
  const watched = item.status === 'watched' || item.status === 'completed';
  const limit = Math.min(item.totalEpisodes ?? 100_000, 100_000);

  async function apply(change: Change) {
    if (active.current || !target) return;
    const generation = sessionGeneration();
    active.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    setConfirm(undefined);
    const signature = JSON.stringify({ ...target, ...change });
    const requestId = attempts.current.get(signature) ?? actionId();
    attempts.current.set(signature, requestId);
    try {
      let result: { state: string };
      try {
        result = await api(base + '/' + provider, {
          method: 'POST',
          body: JSON.stringify({ requestId, ...target, ...change }),
        });
      } catch {
        if (generation !== sessionGeneration()) return;
        result = await api(base + '/actions/' + requestId);
      }
      if (generation !== sessionGeneration()) return;
      if (result.state === 'succeeded') {
        attempts.current.delete(signature);
        setNotice('Provider tracking updated.');
        updated();
      } else {
        setFailure(
          'The provider did not confirm the update. Check your account before retrying.'
        );
      }
    } catch {
      if (generation === sessionGeneration())
        setFailure(
          'Could not confirm the tracking update. Check your account before retrying.'
        );
    } finally {
      active.current = false;
      if (generation === sessionGeneration()) setBusy(false);
    }
  }

  if (!target) return null;
  const validRating =
    rating !== '' &&
    Number(rating) >= 0 &&
    Number(rating) <= 10 &&
    Number.isInteger(Number(rating) * (aniList ? 10 : 1));
  const validProgress =
    progress !== '' &&
    Number.isInteger(Number(progress)) &&
    Number(progress) >= 0 &&
    Number(progress) <= limit;
  return (
    <div>
      <button
        className="btn btn-quiet btn-sm"
        type="button"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen(!open)}
      >
        Update Tracking
      </button>
      {open && (
        <div className="toolbar">
          <button
            className="btn btn-tonal btn-sm"
            type="button"
            disabled={busy}
            onClick={() => {
              const change = { action: 'watched', value: !watched } as const;
              if (watched || item.mediaType === 'tv') setConfirm(change);
              else void apply(change);
            }}
          >
            {watched ? 'Mark Unwatched' : 'Mark Watched'}
          </button>
          <label className="sel">
            <span className="lbl">Rating (0–10)</span>
            <input
              type="number"
              min={0}
              max={10}
              step={aniList ? 0.1 : 1}
              value={rating}
              onChange={(event) => setRating(event.target.value)}
              disabled={busy}
            />
          </label>
          <button
            className="btn btn-tonal btn-sm"
            type="button"
            disabled={busy || !validRating}
            onClick={() =>
              void apply({ action: 'rating', value: Number(rating) })
            }
          >
            Save Rating
          </button>
          {aniList && (
            <>
              <label className="sel">
                <span className="lbl">Episodes Watched</span>
                <input
                  type="number"
                  min={0}
                  max={limit}
                  value={progress}
                  onChange={(event) => setProgress(event.target.value)}
                  disabled={busy}
                />
              </label>
              <button
                className="btn btn-tonal btn-sm"
                type="button"
                disabled={busy || !validProgress}
                onClick={() =>
                  void apply({ action: 'progress', value: Number(progress) })
                }
              >
                Save Progress
              </button>
            </>
          )}
        </div>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {confirm && (
        <ConfirmSheet
          title={confirm.value ? 'Mark Watched?' : 'Mark Unwatched?'}
          body={`Update watched status for ${item.title} on your tracking account?`}
          confirm={confirm.value ? 'Mark Watched' : 'Mark Unwatched'}
          cancel="Cancel"
          onConfirm={() => void apply(confirm)}
          onClose={() => setConfirm(undefined)}
        />
      )}
    </div>
  );
}

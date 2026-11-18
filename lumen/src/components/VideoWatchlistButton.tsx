import { useRef, useState } from 'react';
import { api, MediaStatus, type MediaInfo } from '../api';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import { Icon } from '../icons';
import { sessionGeneration } from '../sessionState';
import { useToast } from './toast';

interface VideoWatchlistTitle {
  id: number;
  onUserWatchlist?: boolean;
  mediaInfo?: Pick<MediaInfo, 'status'> | null;
}

export default function VideoWatchlistButton({
  mediaType,
  detail,
}: {
  mediaType: 'movie' | 'tv';
  detail: VideoWatchlistTitle;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<boolean>();
  const [unavailable, setUnavailable] = useState(false);
  const { id } = detail;
  if (
    unavailable ||
    !user?.userType ||
    user.userType === 1 ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    id > 1_000_000_000 ||
    detail.mediaInfo?.status === MediaStatus.BLOCKLISTED ||
    typeof detail.onUserWatchlist !== 'boolean'
  )
    return null;

  const listed = confirmed ?? detail.onUserWatchlist;

  async function toggle() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    const desired = !listed;
    const session = sessionGeneration();
    try {
      const fresh = await api<VideoWatchlistTitle>(`/${mediaType}/${id}`, {
        cache: 'no-store',
      });
      if (sessionGeneration() !== session) return;
      if (
        fresh.id !== id ||
        fresh.mediaInfo?.status === MediaStatus.BLOCKLISTED ||
        typeof fresh.onUserWatchlist !== 'boolean'
      ) {
        setUnavailable(true);
        toast('Watchlist is unavailable for this title.');
        return;
      }
      if (fresh.onUserWatchlist !== desired) {
        if (desired) {
          const saved = await api<{ id: number }>('/watchlist', {
            method: 'POST',
            body: JSON.stringify({ tmdbId: id, mediaType }),
          });
          if (sessionGeneration() !== session) return;
          if (!saved || !Number.isSafeInteger(saved.id) || saved.id <= 0) {
            toast('Couldn’t confirm the Watchlist change.');
            return;
          }
        } else {
          await api(`/watchlist/${id}?mediaType=${mediaType}`, {
            method: 'DELETE',
          });
        }
      }
      if (sessionGeneration() !== session) return;
      setConfirmed(desired);
      toast(desired ? 'Added to Watchlist' : 'Removed from Watchlist');
    } catch (error) {
      if (sessionGeneration() === session)
        toast(friendlyError(error, 'Couldn’t update your Watchlist'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-quiet btn-sm"
      disabled={busy}
      aria-busy={busy}
      onClick={() => void toggle()}
    >
      <Icon name={listed ? 'check' : 'star'} />
      {listed ? 'Remove From Watchlist' : 'Add To Watchlist'}
    </button>
  );
}

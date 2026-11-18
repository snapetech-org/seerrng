import { useRef, useState } from 'react';
import { api, MediaStatus, type MediaInfo } from '../api';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import { Icon } from '../icons';
import { sessionGeneration } from '../sessionState';
import { useToast } from './toast';

type WatchlistMedia = 'movie' | 'tv' | 'music' | 'book' | 'comic' | 'magazine';

interface WatchlistTitle {
  id: string | number;
  title?: string;
  onUserWatchlist?: boolean;
  mediaInfo?: Pick<MediaInfo, 'status'> | null;
}

function canonicalId(mediaType: WatchlistMedia, input: string | number) {
  const value = String(input).trim();
  switch (mediaType) {
    case 'movie':
    case 'tv': {
      const id = Number(value);
      return /^[1-9]\d*$/.test(value) &&
        Number.isSafeInteger(id) &&
        id <= 1_000_000_000
        ? String(id)
        : undefined;
    }
    case 'music':
      return /^[A-Za-z0-9_-]{1,128}$/.test(value)
        ? value.toLowerCase()
        : undefined;
    case 'book': {
      const workId = value.replace(/^\/?works\//i, '').toUpperCase();
      return /^OL\d{1,124}W$/.test(workId) ? workId : undefined;
    }
    case 'comic':
      return /^\d{1,18}$/.test(value) ? value : undefined;
    case 'magazine': {
      const title = value
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
      return title.length > 0 &&
        title.length <= 256 &&
        title !== '.' &&
        title !== '..'
        ? title
        : undefined;
    }
  }
}

export default function WatchlistButton({
  mediaType,
  detail,
  requestedId = detail.id,
}: {
  mediaType: WatchlistMedia;
  detail: WatchlistTitle;
  requestedId?: string | number;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<boolean>();
  const [unavailable, setUnavailable] = useState(false);
  const id = canonicalId(mediaType, detail.id);
  if (
    unavailable ||
    !user?.userType ||
    user.userType === 1 ||
    !id ||
    id !== canonicalId(mediaType, requestedId) ||
    detail.mediaInfo?.status === MediaStatus.BLOCKLISTED ||
    typeof detail.onUserWatchlist !== 'boolean'
  )
    return null;

  const listed = confirmed ?? detail.onUserWatchlist;
  const encodedId = encodeURIComponent(id);
  const detailPath =
    mediaType === 'magazine'
      ? `/magazine/${encodeURIComponent(requestedId)}`
      : `/${mediaType}/${encodedId}`;

  async function toggle() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    const desired = !listed;
    const session = sessionGeneration();
    try {
      const fresh = await api<WatchlistTitle>(detailPath, {
        cache: 'no-store',
      });
      if (sessionGeneration() !== session) return;
      if (
        canonicalId(mediaType, fresh.id) !== id ||
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
            body: JSON.stringify({
              mediaType,
              ...(mediaType === 'movie' || mediaType === 'tv'
                ? { tmdbId: Number(id) }
                : {
                    ...(mediaType === 'music'
                      ? { mbId: id }
                      : { externalId: id }),
                    title: fresh.title?.slice(0, 512),
                  }),
            }),
          });
          if (sessionGeneration() !== session) return;
          if (!saved || !Number.isSafeInteger(saved.id) || saved.id <= 0) {
            toast('Couldn’t confirm the Watchlist change.');
            return;
          }
        } else {
          await api(`/watchlist/${encodedId}?mediaType=${mediaType}`, {
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

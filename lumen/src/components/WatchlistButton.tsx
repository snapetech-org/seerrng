import { useEffect, useRef, useState } from 'react';
import { api, MediaStatus, type MediaInfo } from '../api';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { canonicalMediaId, type ManagedMediaType } from '../mediaIdentity';
import { sessionGeneration } from '../sessionState';
import { useToast } from './toast';

interface WatchlistTitle {
  id: string | number;
  title?: string;
  onUserWatchlist?: boolean;
  mediaInfo?: Pick<MediaInfo, 'status'> | null;
}

const watchlistConfirmations = new Map<string, boolean>();
const watchlistListeners = new Map<string, Set<(value: boolean) => void>>();
const MAX_WATCHLIST_CONFIRMATIONS = 256;

function confirmationKey(
  userId: number | undefined,
  generation: number,
  mediaType: string,
  id: string
) {
  return `${generation}:${userId ?? 'anonymous'}:${mediaType}:${id}`;
}

function publishConfirmation(key: string, value: boolean) {
  watchlistConfirmations.delete(key);
  watchlistConfirmations.set(key, value);
  while (watchlistConfirmations.size > MAX_WATCHLIST_CONFIRMATIONS) {
    const oldest = watchlistConfirmations.keys().next().value;
    if (oldest === undefined) break;
    watchlistConfirmations.delete(oldest);
  }
  watchlistListeners.get(key)?.forEach((listener) => listener(value));
}

export default function WatchlistButton({
  mediaType,
  detail,
  requestedId = detail.id,
  compact = false,
  touch = false,
}: {
  mediaType: ManagedMediaType;
  detail: WatchlistTitle;
  requestedId?: string | number;
  compact?: boolean;
  touch?: boolean;
}) {
  const { user } = useAuth();
  const { t } = useLumenLocale();
  const toast = useToast();
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const id = canonicalMediaId(mediaType, detail.id);
  const confirmation = confirmationKey(
    user?.id,
    sessionGeneration(),
    mediaType,
    id ?? ''
  );
  const [confirmed, setConfirmed] = useState<boolean | undefined>(() =>
    watchlistConfirmations.get(confirmation)
  );
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const listeners = watchlistListeners.get(confirmation) ?? new Set();
    const sync = (value: boolean) => setConfirmed(value);
    listeners.add(sync);
    watchlistListeners.set(confirmation, listeners);
    const value = watchlistConfirmations.get(confirmation);
    if (value !== undefined) setConfirmed(value);
    return () => {
      listeners.delete(sync);
      if (!listeners.size) watchlistListeners.delete(confirmation);
    };
  }, [confirmation]);
  if (
    unavailable ||
    !user?.userType ||
    user.userType === 1 ||
    !id ||
    id !== canonicalMediaId(mediaType, requestedId) ||
    detail.mediaInfo?.status === MediaStatus.BLOCKLISTED ||
    (!compact && typeof detail.onUserWatchlist !== 'boolean')
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
    const session = sessionGeneration();
    try {
      const fresh = await api<WatchlistTitle>(detailPath, {
        cache: 'no-store',
      });
      if (sessionGeneration() !== session) return;
      if (
        canonicalMediaId(mediaType, fresh.id) !== id ||
        fresh.mediaInfo?.status === MediaStatus.BLOCKLISTED ||
        typeof fresh.onUserWatchlist !== 'boolean'
      ) {
        setUnavailable(true);
        toast(
          t(
            'lumen.watchlist.actionUnavailable',
            'Watchlist is unavailable for this title.'
          )
        );
        return;
      }
      // Poster rows intentionally don't load detail state until the viewer acts.
      // An unknown poster action means Add; never remove a saved item on first click.
      const desired = typeof listed === 'boolean' ? !listed : true;
      const alreadySaved = typeof listed !== 'boolean' && fresh.onUserWatchlist;
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
            toast(
              t(
                'lumen.watchlist.actionConfirmFailure',
                'Couldn’t confirm the Watchlist change.'
              )
            );
            return;
          }
        } else {
          let deleteError: unknown;
          try {
            await api(`/watchlist/${encodedId}?mediaType=${mediaType}`, {
              method: 'DELETE',
            });
          } catch (error) {
            // The server may have committed the deletion before the response
            // was lost. Read the title state before reporting failure.
            deleteError = error;
          }
          let readback: WatchlistTitle;
          try {
            readback = await api<WatchlistTitle>(detailPath, {
              cache: 'no-store',
            });
          } catch {
            toast(
              t(
                'lumen.watchlist.actionConfirmFailure',
                'Couldn’t confirm the Watchlist change.'
              )
            );
            return;
          }
          if (
            sessionGeneration() !== session ||
            canonicalMediaId(mediaType, readback.id) !== id ||
            typeof readback.onUserWatchlist !== 'boolean'
          ) {
            toast(
              t(
                'lumen.watchlist.actionConfirmFailure',
                'Couldn’t confirm the Watchlist change.'
              )
            );
            return;
          }
          if (readback.onUserWatchlist !== desired) {
            if (deleteError) throw deleteError;
            toast(
              t(
                'lumen.watchlist.actionConfirmFailure',
                'Couldn’t confirm the Watchlist change.'
              )
            );
            return;
          }
        }
      }
      if (sessionGeneration() !== session) return;
      publishConfirmation(confirmation, desired);
      setConfirmed(desired);
      toast(
        alreadySaved
          ? t('lumen.watchlist.alreadySaved', 'Already on Watchlist')
          : desired
            ? t('lumen.watchlist.actionAdded', 'Added to Watchlist')
            : t('lumen.watchlist.actionRemoved', 'Removed from Watchlist')
      );
    } catch (error) {
      if (sessionGeneration() === session)
        toast(
          friendlyError(
            error,
            t(
              'lumen.watchlist.actionFailure',
              'Couldn’t update your Watchlist'
            ),
            (id, fallback) => t(id, fallback)
          )
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={
        touch
          ? 'tq tq-watchlist'
          : compact
            ? 'qbtn ghost watchlist-action'
            : 'btn btn-quiet btn-sm'
      }
      disabled={busy}
      aria-busy={busy}
      aria-label={t(
        listed === true
          ? 'lumen.watchlist.actionRemoveTitle'
          : 'lumen.watchlist.actionAddTitle',
        listed === true
          ? 'Remove {title} from your Watchlist'
          : 'Add {title} to your Watchlist',
        { title: detail.title || t('lumen.watchlist.titleFallback', 'title') }
      )}
      title={
        typeof listed === 'boolean'
          ? t(
              listed
                ? 'components.MovieDetails.removefromwatchlist'
                : 'components.MovieDetails.addtowatchlist',
              listed ? 'Remove From Watchlist' : 'Add To Watchlist'
            )
          : t(
              'lumen.watchlist.actionCheckAndToggle',
              'Check Watchlist and toggle'
            )
      }
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggle();
      }}
    >
      <Icon
        name={listed ? 'check' : 'star'}
        size={compact ? 'sm' : undefined}
      />
      {!compact &&
        t(
          listed === true
            ? 'components.MovieDetails.removefromwatchlist'
            : 'components.MovieDetails.addtowatchlist',
          listed === true ? 'Remove From Watchlist' : 'Add To Watchlist'
        )}
    </button>
  );
}

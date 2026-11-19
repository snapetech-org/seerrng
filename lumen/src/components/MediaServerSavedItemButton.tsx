import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import { Icon } from '../icons';
import { sessionGeneration } from '../sessionState';
import { useToast } from './toast';

type SavedItemStatus = {
  serverType: number;
  kind: 'watchlist' | 'favorites';
  available: boolean;
  saved?: boolean;
  reason?: 'account-not-linked' | 'series-not-found';
};

const SERVER_NAMES: Record<number, string> = {
  1: 'Plex',
  2: 'Jellyfin',
  3: 'Emby',
};

const statusOf = (value: unknown, serverType: number): SavedItemStatus => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Media-server saved state could not be verified.');
  const status = value as Record<string, unknown>;
  const expectedKind = serverType === 1 ? 'watchlist' : 'favorites';
  if (
    status.serverType !== serverType ||
    status.kind !== expectedKind ||
    typeof status.available !== 'boolean' ||
    (status.available &&
      (typeof status.saved !== 'boolean' || status.reason !== undefined)) ||
    (!status.available &&
      (status.saved !== undefined || status.reason === undefined)) ||
    (status.reason !== undefined &&
      status.reason !== 'account-not-linked' &&
      status.reason !== 'series-not-found')
  )
    throw new Error('Media-server saved state could not be verified.');
  return status as SavedItemStatus;
};

export default function MediaServerSavedItemButton({
  tvId,
  title,
  serverType,
  is4k,
}: {
  tvId: number;
  title: string;
  serverType: number;
  is4k: boolean;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const server = SERVER_NAMES[serverType];
  const list = serverType === 1 ? 'Watchlist' : 'Favorites';
  const endpoint = `/tv/${tvId}/media-server-saved-item`;
  const readPath = `${endpoint}?is4k=${is4k}`;
  const [status, setStatus] = useState<SavedItemStatus>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const read = useCallback(
    async () =>
      statusOf(await api<unknown>(readPath, { cache: 'no-store' }), serverType),
    [readPath, serverType]
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    const session = sessionGeneration();
    setStatus(undefined);
    setError(undefined);
    setLoading(true);
    void read()
      .then((next) => {
        if (live && sessionGeneration() === session) setStatus(next);
      })
      .catch((cause: unknown) => {
        if (live && sessionGeneration() === session)
          setError(
            friendlyError(cause, `${server} saved state could not load.`)
          );
      })
      .finally(() => {
        if (live && sessionGeneration() === session) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [read, server]);

  const retry = async () => {
    if (inFlight.current || loading) return;
    inFlight.current = true;
    const session = sessionGeneration();
    setLoading(true);
    setError(undefined);
    try {
      const next = await read();
      if (sessionGeneration() === session) setStatus(next);
    } catch (cause) {
      if (sessionGeneration() === session)
        setError(friendlyError(cause, `${server} saved state could not load.`));
    } finally {
      inFlight.current = false;
      if (mounted.current && sessionGeneration() === session) setLoading(false);
    }
  };

  const toggle = async () => {
    if (
      inFlight.current ||
      loading ||
      error ||
      !user ||
      !status?.available ||
      typeof status.saved !== 'boolean'
    )
      return;
    inFlight.current = true;
    const session = sessionGeneration();
    setLoading(true);
    setError(undefined);
    try {
      // Membership may have changed in another client since the detail loaded.
      const fresh = await read();
      if (sessionGeneration() !== session) return;
      if (!fresh.available || typeof fresh.saved !== 'boolean') {
        setStatus(fresh);
        return;
      }
      const desired = !fresh.saved;
      const changed = statusOf(
        await api<unknown>(endpoint, {
          method: 'POST',
          body: JSON.stringify({ saved: desired, is4k }),
        }),
        serverType
      );
      if (sessionGeneration() !== session) return;
      if (!changed.available || changed.saved !== desired)
        throw new Error('Media-server saved change was not confirmed.');
      // Confirm membership from a fresh read. A failed read never reports success.
      const confirmed = await read();
      if (sessionGeneration() !== session) return;
      if (!confirmed.available || confirmed.saved !== desired)
        throw new Error('Media-server saved change was not confirmed.');
      setStatus(confirmed);
      toast(`${desired ? 'Added to' : 'Removed from'} ${server} ${list}`);
    } catch (cause) {
      if (sessionGeneration() === session) {
        setStatus(undefined);
        setError(
          friendlyError(cause, `${server} saved state could not update.`)
        );
        toast(
          `${server} saved state could not be confirmed. Retry before changing it.`
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current && sessionGeneration() === session) setLoading(false);
    }
  };

  if (!server || !user || !Number.isSafeInteger(tvId) || tvId < 1) return null;

  const saved = status?.available ? status.saved : undefined;
  const label = error
    ? `Retry ${server} ${list} status`
    : loading
      ? `Loading ${server} ${list}`
      : !status?.available
        ? `${server} ${list} unavailable`
        : `${saved ? 'Remove' : 'Add'} ${title} ${saved ? 'from' : 'to'} ${server} ${list}`;
  const help = error
    ? 'Retry reads the current saved state. It does not repeat an add or remove action.'
    : status?.reason === 'account-not-linked'
      ? `Link your own ${server} account before saving this series.`
      : status?.reason === 'series-not-found'
        ? `This series is not in your accessible ${server} catalog.`
        : `Save this entire series in your ${server} ${list}. This does not change your SeerrNG Watchlist or request state.`;

  return (
    <span>
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        disabled={loading || (!error && !status?.available)}
        aria-label={label}
        aria-pressed={typeof saved === 'boolean' ? saved : undefined}
        aria-busy={loading}
        title={help}
        onClick={() => void (error ? retry() : toggle())}
      >
        <Icon name={saved ? 'check' : 'star'} />
        {error
          ? 'Retry Saved State'
          : loading
            ? `Loading ${list}…`
            : !status?.available
              ? `${list} Unavailable`
              : `${saved ? 'Remove from' : 'Add to'} ${server} ${list}`}
      </button>
      {status?.reason === 'account-not-linked' && (
        <Link className="chip" to="/me/account/linked-accounts">
          Link {server} Account
        </Link>
      )}
      {status?.reason === 'series-not-found' && (
        <span className="dnote" role="status">
          Not in your accessible {server} catalog.
        </span>
      )}
      {error && (
        <span className="dnote" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

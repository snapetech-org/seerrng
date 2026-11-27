import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import { useLumenLocale } from '../i18n';
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

const statusOf = (
  value: unknown,
  serverType: number,
  verificationError: string
): SavedItemStatus => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(verificationError);
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
    throw new Error(verificationError);
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
  const { t } = useLumenLocale();
  const toast = useToast();
  const server = SERVER_NAMES[serverType] ?? '';
  const list = t(
    serverType === 1
      ? 'lumen.mediaServerSavedItem.watchlist'
      : 'lumen.mediaServerSavedItem.favorites',
    serverType === 1 ? 'Watchlist' : 'Favorites'
  );
  const verificationError = t(
    'lumen.mediaServerSavedItem.verifyFailed',
    'The saved state could not be verified.'
  );
  const loadError = t(
    'lumen.mediaServerSavedItem.loadFailed',
    '{server} saved state could not load.',
    { server }
  );
  const updateError = t(
    'lumen.mediaServerSavedItem.updateFailed',
    '{server} saved state could not update.',
    { server }
  );
  const endpoint = `/tv/${tvId}/media-server-saved-item`;
  const readPath = `${endpoint}?is4k=${is4k}`;
  const [status, setStatus] = useState<SavedItemStatus>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const read = useCallback(
    async () =>
      statusOf(
        await api<unknown>(readPath, { cache: 'no-store' }),
        serverType,
        verificationError
      ),
    [readPath, serverType, verificationError]
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
            friendlyError(cause, loadError, (id, fallback) => t(id, fallback))
          );
      })
      .finally(() => {
        if (live && sessionGeneration() === session) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [read, loadError]);

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
        setError(
          friendlyError(cause, loadError, (id, fallback) => t(id, fallback))
        );
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
        serverType,
        verificationError
      );
      if (sessionGeneration() !== session) return;
      if (!changed.available || changed.saved !== desired)
        throw new Error(
          t(
            'lumen.mediaServerSavedItem.changeNotConfirmed',
            'The saved change could not be confirmed.'
          )
        );
      // Confirm membership from a fresh read. A failed read never reports success.
      const confirmed = await read();
      if (sessionGeneration() !== session) return;
      if (!confirmed.available || confirmed.saved !== desired)
        throw new Error(
          t(
            'lumen.mediaServerSavedItem.changeNotConfirmed',
            'The saved change could not be confirmed.'
          )
        );
      setStatus(confirmed);
      toast(
        t(
          desired
            ? 'lumen.mediaServerSavedItem.added'
            : 'lumen.mediaServerSavedItem.removed',
          desired ? 'Added to {server} {list}' : 'Removed from {server} {list}',
          { server, list }
        )
      );
    } catch (cause) {
      if (sessionGeneration() === session) {
        setStatus(undefined);
        setError(
          friendlyError(cause, updateError, (id, fallback) => t(id, fallback))
        );
        toast(
          t(
            'lumen.mediaServerSavedItem.retryBeforeChange',
            '{server} saved state could not be confirmed. Retry before changing it.',
            { server }
          )
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
    ? t(
        'lumen.mediaServerSavedItem.retryLabel',
        'Retry {server} {list} status',
        {
          server,
          list,
        }
      )
    : loading
      ? t(
          'lumen.mediaServerSavedItem.loadingLabel',
          'Loading {server} {list}',
          {
            server,
            list,
          }
        )
      : !status?.available
        ? t(
            'lumen.mediaServerSavedItem.unavailableLabel',
            '{server} {list} unavailable',
            { server, list }
          )
        : t(
            saved
              ? 'lumen.mediaServerSavedItem.removeLabel'
              : 'lumen.mediaServerSavedItem.addLabel',
            saved
              ? 'Remove {title} from {server} {list}'
              : 'Add {title} to {server} {list}',
            { title, server, list }
          );
  const help = error
    ? t(
        'lumen.mediaServerSavedItem.retryHelp',
        'Retry reads the current saved state. It does not repeat an add or remove action.'
      )
    : status?.reason === 'account-not-linked'
      ? t(
          'lumen.mediaServerSavedItem.linkHelp',
          'Link your own {server} account before saving this series.',
          { server }
        )
      : status?.reason === 'series-not-found'
        ? t(
            'lumen.mediaServerSavedItem.missingHelp',
            'This series is not in your accessible {server} catalog.',
            { server }
          )
        : t(
            'lumen.mediaServerSavedItem.saveHelp',
            'Save this entire series in your {server} {list}. This does not change your SeerrNG Watchlist or request state.',
            { server, list }
          );

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
          ? t('lumen.mediaServerSavedItem.retryButton', 'Retry saved state')
          : loading
            ? t('lumen.mediaServerSavedItem.loadingButton', 'Loading {list}…', {
                list,
              })
            : !status?.available
              ? t(
                  'lumen.mediaServerSavedItem.unavailableButton',
                  '{list} unavailable',
                  { list }
                )
              : t(
                  saved
                    ? 'lumen.mediaServerSavedItem.removeButton'
                    : 'lumen.mediaServerSavedItem.addButton',
                  saved
                    ? 'Remove from {server} {list}'
                    : 'Add to {server} {list}',
                  { server, list }
                )}
      </button>
      {status?.reason === 'account-not-linked' && (
        <Link className="chip" to="/me/account/linked-accounts">
          {t(
            'lumen.mediaServerSavedItem.linkAccount',
            'Link {server} account',
            {
              server,
            }
          )}
        </Link>
      )}
      {status?.reason === 'series-not-found' && (
        <span className="dnote" role="status">
          {t(
            'lumen.mediaServerSavedItem.notInCatalog',
            'Not in your accessible {server} catalog.',
            { server }
          )}
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

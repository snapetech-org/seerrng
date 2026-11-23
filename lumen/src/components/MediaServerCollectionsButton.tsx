import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type MediaServerCollectionsStatus } from '../api';
import { useAuth, useMediaServerName } from '../auth';
import { friendlyError } from '../errors';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { sessionGeneration } from '../sessionState';
import { useToast } from './toast';

const reasons = new Set([
  'account-not-linked',
  'not-authorized',
  'series-not-found',
  'unsupported-server',
  'collection-limit',
]);

function confirmedStatus(value: unknown, serverType: number) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Collection status could not be verified.');
  const status = value as Record<string, unknown>;
  if (
    status.serverType !== serverType ||
    typeof status.available !== 'boolean' ||
    !Array.isArray(status.collections) ||
    status.collections.length > 500 ||
    (status.reason !== undefined && !reasons.has(String(status.reason))) ||
    (!status.available && status.collections.length !== 0) ||
    (status.available && status.reason !== undefined)
  )
    throw new Error('Collection status could not be verified.');
  const ids = new Set<string>();
  for (const item of status.collections) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error('Collection list could not be verified.');
    const collection = item as Record<string, unknown>;
    if (
      typeof collection.id !== 'string' ||
      !/^[a-z\d-]{1,128}$/i.test(collection.id) ||
      typeof collection.name !== 'string' ||
      !collection.name.trim() ||
      collection.name.length > 512 ||
      typeof collection.member !== 'boolean' ||
      ids.has(collection.id)
    )
      throw new Error('Collection list could not be verified.');
    ids.add(collection.id);
  }
  return status as unknown as MediaServerCollectionsStatus;
}

export default function MediaServerCollectionsButton({
  tvId,
  is4k,
  serverType,
}: {
  tvId: number;
  is4k: boolean;
  serverType: number;
}) {
  const { user } = useAuth();
  const server = useMediaServerName();
  const { t } = useLumenLocale();
  const toast = useToast();
  const [loaded, setLoaded] = useState<{
    context: string;
    status: MediaServerCollectionsStatus;
  }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const endpoint = `/tv/${tvId}/media-server-collections`;
  const readPath = `${endpoint}?is4k=${is4k}`;
  const context = JSON.stringify([
    tvId,
    is4k,
    serverType,
    user?.id,
    user?.plexUsername ?? null,
    user?.jellyfinUsername ?? null,
  ]);
  const status = loaded?.context === context ? loaded.status : undefined;
  const currentContext = useRef(context);
  currentContext.current = context;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const read = useCallback(async () => {
    return confirmedStatus(
      await api<unknown>(readPath, { cache: 'no-store' }),
      serverType
    );
  }, [readPath, serverType]);

  useEffect(() => {
    let active = true;
    const generation = sessionGeneration();
    const stillCurrent = () =>
      active &&
      generation === sessionGeneration() &&
      currentContext.current === context;
    setLoaded(undefined);
    setError(false);
    setLoading(!!user);
    if (!user) return;
    void read()
      .then((next) => {
        if (stillCurrent()) setLoaded({ context, status: next });
      })
      .catch(() => {
        if (stillCurrent()) setError(true);
      })
      .finally(() => {
        if (stillCurrent()) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [context, read, user]);

  async function reload() {
    if (pending.current) return;
    pending.current = true;
    const generation = sessionGeneration();
    const requestContext = context;
    const stillCurrent = () =>
      mounted.current &&
      generation === sessionGeneration() &&
      currentContext.current === requestContext;
    setLoading(true);
    setError(false);
    try {
      const fresh = await read();
      if (stillCurrent()) setLoaded({ context, status: fresh });
    } catch {
      if (stillCurrent()) setError(true);
    } finally {
      pending.current = false;
      if (stillCurrent()) setLoading(false);
    }
  }

  async function change(collectionId: string, member: boolean) {
    if (pending.current || loading || error || !status?.available) return;
    pending.current = true;
    const generation = sessionGeneration();
    const actionContext = context;
    const stillCurrent = () =>
      mounted.current &&
      generation === sessionGeneration() &&
      currentContext.current === actionContext;
    setLoading(true);
    setError(false);
    try {
      const fresh = await read();
      if (!stillCurrent()) return;
      const existing = fresh.collections.find(({ id }) => id === collectionId);
      if (!fresh.available || !existing)
        throw new Error('Collection is no longer accessible.');
      let confirmed = fresh;
      if (existing.member !== member) {
        confirmed = confirmedStatus(
          await api<unknown>(
            `${endpoint}/${encodeURIComponent(collectionId)}`,
            {
              method: 'POST',
              body: JSON.stringify({ member, is4k }),
            }
          ),
          serverType
        );
        if (!stillCurrent()) return;
      }
      if (
        !confirmed.available ||
        confirmed.collections.find(({ id }) => id === collectionId)?.member !==
          member
      )
        throw new Error('Collection update was not confirmed.');
      if (!stillCurrent()) return;
      setLoaded({ context, status: confirmed });
      toast(
        t(
          member
            ? 'lumen.mediaServerCollections.added'
            : 'lumen.mediaServerCollections.removed',
          member ? 'Added to {name}' : 'Removed from {name}',
          { name: existing.name }
        )
      );
    } catch (cause) {
      if (stillCurrent()) {
        setError(true);
        toast(
          friendlyError(
            cause,
            t(
              'lumen.mediaServerCollections.updateFailed',
              'Could not confirm the collection change. Reload and retry.'
            ),
            t
          )
        );
      }
    } finally {
      pending.current = false;
      if (stillCurrent()) setLoading(false);
    }
  }

  if (!user || !server || !Number.isSafeInteger(tvId) || tvId < 1) return null;
  const label = t(
    'lumen.mediaServerCollections.title',
    '{server} Collections',
    {
      server,
    }
  );
  const reason =
    status?.reason === 'account-not-linked'
      ? t(
          'lumen.mediaServerCollections.link',
          'Link your {server} account first.',
          {
            server,
          }
        )
      : status?.reason === 'not-authorized'
        ? t(
            'lumen.mediaServerCollections.permission',
            'Your {server} account cannot manage collections.',
            { server }
          )
        : status?.reason === 'series-not-found'
          ? t(
              'lumen.mediaServerCollections.missing',
              'This series is not in your accessible {server} library.',
              { server }
            )
          : status?.reason === 'collection-limit'
            ? t(
                'lumen.mediaServerCollections.limit',
                'The {server} collection list is too large to show safely.',
                { server }
              )
            : status && !status.available
              ? t(
                  'lumen.mediaServerCollections.unavailable',
                  'Collections are unavailable for this server.'
                )
              : !status?.collections.length
                ? t(
                    'lumen.mediaServerCollections.empty',
                    'Create a collection in {server} first.',
                    { server }
                  )
                : '';

  return (
    <details className="adv" data-testid="media-server-collections">
      <summary className="btn btn-quiet btn-sm">
        <Icon name="list" />
        {label}
        {loading && <span aria-label={t('i18n.loading', 'Loading')}>…</span>}
      </summary>
      {loading && !status ? (
        <p className="dnote" aria-busy="true">
          {t('lumen.mediaServerCollections.loading', 'Loading collections…')}
        </p>
      ) : error ? (
        <div className="toolbar" role="alert">
          <span>
            {t(
              'lumen.mediaServerCollections.loadFailed',
              'Collections could not be loaded or confirmed.'
            )}
          </span>
          <button
            type="button"
            className="chip"
            disabled={loading}
            onClick={() => void reload()}
          >
            {t('lumen.mediaServerCollections.retry', 'Reload collections')}
          </button>
        </div>
      ) : reason ? (
        <p className="dnote" role="status">
          {reason}
        </p>
      ) : (
        <div className="toolbar">
          {status?.collections.map((collection) => (
            <button
              key={collection.id}
              type="button"
              className="chip"
              disabled={loading}
              aria-pressed={collection.member}
              onClick={() => void change(collection.id, !collection.member)}
            >
              <Icon name={collection.member ? 'check' : 'plus'} />
              {t(
                collection.member
                  ? 'lumen.mediaServerCollections.remove'
                  : 'lumen.mediaServerCollections.add',
                collection.member ? 'Remove from {name}' : 'Add to {name}',
                { name: collection.name }
              )}
            </button>
          ))}
        </div>
      )}
    </details>
  );
}

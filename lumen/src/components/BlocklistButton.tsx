import { useRef, useState } from 'react';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';
import { canManageBlocklist, notifyBlocklistChanged } from '../blocklist';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { canonicalMediaId, type ManagedMediaType } from '../mediaIdentity';
import { sessionGeneration } from '../sessionState';
import { ConfirmSheet } from './ConfirmSheet';
import { useToast } from './toast';

const PROVIDERS = {
  book: 'openlibrary',
  comic: 'comicvine',
  magazine: 'lazylibrarian',
  music: 'musicbrainz',
} as const;

function BlocklistAction({
  mediaType,
  id,
  title,
  onChange,
}: {
  mediaType: ManagedMediaType;
  id: string;
  title: string;
  onChange: () => void;
}) {
  const { t } = useLumenLocale();
  const path = `/blocklist/${encodeURIComponent(id)}?mediaType=${mediaType}`;
  const { data, error, errorStatus, reload } = useApi<{ id: number }>(path);
  const [choice, setChoice] = useState<'add' | 'remove'>();
  const [failure, setFailure] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const toast = useToast();
  const action = data ? 'remove' : errorStatus === 404 ? 'add' : undefined;

  async function apply() {
    if (!choice || choice !== action || pending.current) return;
    pending.current = true;
    setBusy(true);
    const session = sessionGeneration();
    let succeeded = false;
    try {
      if (choice === 'remove') {
        await api<void>(path, { method: 'DELETE' });
      } else {
        const identity =
          mediaType === 'movie' || mediaType === 'tv'
            ? { tmdbId: Number(id) }
            : { externalId: id, externalProvider: PROVIDERS[mediaType] };
        await api<void>(
          '/blocklist',
          {
            method: 'POST',
            body: JSON.stringify({
              mediaType,
              title: title.slice(0, 512),
              ...identity,
            }),
          },
          'empty'
        );
      }
      succeeded = true;
      if (sessionGeneration() === session) {
        toast(
          choice === 'add'
            ? t('lumen.blocklist.action.added', 'Added to the Blocklist.')
            : t('lumen.blocklist.action.removed', 'Removed from the Blocklist.')
        );
      }
    } catch {
      // The write may have reached the server even when its response was lost. Confirm
      // persisted state before deciding whether the action needs a retry.
      try {
        await api<{ id: number }>(path, { method: 'GET', cache: 'no-store' });
        succeeded = choice === 'add';
      } catch (error) {
        succeeded =
          choice === 'remove' &&
          error instanceof ApiError &&
          error.status === 404;
      }
      if (sessionGeneration() === session && succeeded) {
        toast(
          choice === 'add'
            ? t('lumen.blocklist.action.added', 'Added to the Blocklist.')
            : t('lumen.blocklist.action.removed', 'Removed from the Blocklist.')
        );
      } else if (sessionGeneration() === session) {
        setFailure(true);
      }
    } finally {
      if (sessionGeneration() === session) {
        if (succeeded) {
          setChoice(undefined);
          reload();
          onChange();
          notifyBlocklistChanged();
        }
      }
      pending.current = false;
      setBusy(false);
    }
  }

  if (!action && !choice)
    return error ? (
      <button className="btn btn-quiet btn-sm" onClick={reload}>
        {t('lumen.blocklist.action.retryCheck', 'Retry Blocklist Check')}
      </button>
    ) : null;
  const label =
    (action ?? choice) === 'add'
      ? t('lumen.blocklist.action.add', 'Add to Blocklist')
      : t('lumen.blocklist.action.remove', 'Remove from Blocklist');
  return (
    <>
      <button
        className="btn btn-quiet btn-sm"
        disabled={busy || !action}
        onClick={() => setChoice(action)}
      >
        {label}
      </button>
      {choice && (
        <ConfirmSheet
          title={
            choice === 'add'
              ? t('lumen.blocklist.action.addQuestion', 'Add to the Blocklist?')
              : t(
                  'lumen.blocklist.action.removeQuestion',
                  'Remove from the Blocklist?'
                )
          }
          body={
            choice === 'add'
              ? t(
                  'lumen.blocklist.action.addBody',
                  'New requests for “{title}” will be blocked.',
                  { title }
                )
              : t(
                  'lumen.blocklist.action.removeBody',
                  '“{title}” can be requested again after removal.',
                  { title }
                )
          }
          confirm={
            choice === 'add'
              ? t('lumen.blocklist.action.add', 'Add to Blocklist')
              : t('lumen.blocklist.action.remove', 'Remove from Blocklist')
          }
          cancel={t('lumen.tvRequests.cancel', 'Cancel')}
          busy={busy}
          confirmDisabled={Boolean(action && action !== choice)}
          onConfirm={() => void apply()}
          onClose={() => {
            if (!pending.current) {
              setChoice(undefined);
              setFailure(false);
            }
          }}
        >
          {failure && (
            <p className="note" role="alert">
              {t(
                'lumen.blocklist.action.changeUnconfirmed',
                'Could not confirm the Blocklist change. The title will refresh.'
              )}
            </p>
          )}
        </ConfirmSheet>
      )}
    </>
  );
}

export default function BlocklistButton({
  mediaType,
  id,
  requestedId = id,
  title,
  onChange,
}: {
  mediaType: ManagedMediaType;
  id?: string | number;
  requestedId?: string | number;
  title?: string;
  onChange: () => void;
}) {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  if (
    !canManageBlocklist(user?.permissions) ||
    id == null ||
    requestedId == null
  )
    return null;
  const canonical = canonicalMediaId(mediaType, id);
  if (!canonical || canonical !== canonicalMediaId(mediaType, requestedId))
    return null;
  return (
    <BlocklistAction
      key={`${mediaType}:${canonical}`}
      mediaType={mediaType}
      id={canonical}
      title={
        title?.trim() || t('lumen.blocklist.action.fallbackTitle', 'This title')
      }
      onChange={onChange}
    />
  );
}

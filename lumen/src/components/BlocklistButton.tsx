import { useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { canManageBlocklist, notifyBlocklistChanged } from '../blocklist';
import { useApi } from '../hooks';
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
  const path = `/blocklist/${encodeURIComponent(id)}?mediaType=${mediaType}`;
  const { data, error, errorStatus, reload } = useApi<{ id: number }>(path);
  const [choice, setChoice] = useState<'add' | 'remove'>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const toast = useToast();
  const action = data ? 'remove' : errorStatus === 404 ? 'add' : undefined;

  async function apply() {
    if (!choice || choice !== action || pending.current) return;
    pending.current = true;
    setBusy(true);
    const session = sessionGeneration();
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
      if (sessionGeneration() === session) {
        toast(
          choice === 'add'
            ? 'Added to the Blocklist.'
            : 'Removed from the Blocklist.'
        );
      }
    } catch {
      if (sessionGeneration() === session) {
        toast(
          'Could not confirm the Blocklist change. The title will refresh.'
        );
      }
    } finally {
      if (sessionGeneration() === session) {
        setChoice(undefined);
        reload();
        onChange();
        notifyBlocklistChanged();
      }
      pending.current = false;
      setBusy(false);
    }
  }

  if (!action)
    return error ? (
      <button className="btn btn-quiet btn-sm" onClick={reload}>
        Retry Blocklist Check
      </button>
    ) : null;
  const label = action === 'add' ? 'Add to Blocklist' : 'Remove from Blocklist';
  return (
    <>
      <button
        className="btn btn-quiet btn-sm"
        disabled={busy}
        onClick={() => setChoice(action)}
      >
        {label}
      </button>
      {choice && (
        <ConfirmSheet
          title={
            choice === 'add'
              ? 'Add to the Blocklist?'
              : 'Remove from the Blocklist?'
          }
          body={
            choice === 'add'
              ? `New requests for “${title}” will be blocked.`
              : `“${title}” can be requested again after removal.`
          }
          confirm={
            choice === 'add' ? 'Add to Blocklist' : 'Remove from Blocklist'
          }
          busy={busy}
          onConfirm={() => void apply()}
          onClose={() => {
            if (!pending.current) setChoice(undefined);
          }}
        />
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
      title={title?.trim() || 'This title'}
      onChange={onChange}
    />
  );
}

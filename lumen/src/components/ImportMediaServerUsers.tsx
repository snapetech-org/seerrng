import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { Section } from './cards';
import { ConfirmSheet } from './ConfirmSheet';
import { ServiceNote } from './extra';

interface ProviderUser {
  id: string;
  title?: string;
  username: string;
  isImported?: boolean;
}

export default function ImportMediaServerUsers({
  provider,
  onComplete,
  onClose,
}: {
  provider: 'Plex' | 'Jellyfin' | 'Emby';
  onComplete: () => void;
  onClose: () => void;
}) {
  const plex = provider === 'Plex';
  const backend = plex ? 'plex' : 'jellyfin';
  const { data, error, reload } = useApi<ProviderUser[]>(
    `/settings/${backend}/users`
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [sync, setSync] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const working = useRef(false);
  const eligible = (data ?? []).filter((user) => sync || !user.isImported);
  const ids = selected.filter((id) => eligible.some((user) => user.id === id));
  const syncOnly = plex && data?.length === 0;
  const label = syncOnly ? 'Sync Existing Users' : 'Import Selected Users';

  async function importUsers() {
    if (!data || (!ids.length && !syncOnly) || working.current) return;
    working.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      const outcome = await api<
        { createdUsers: unknown[]; refreshedUsers: number } | unknown[]
      >(`/user/import-from-${backend}`, {
        method: 'POST',
        body: JSON.stringify(
          plex
            ? { plexIds: ids }
            : { jellyfinUserIds: ids, ...(sync && { syncExisting: true }) }
        ),
      });
      const added = Array.isArray(outcome)
        ? outcome.length
        : outcome.createdUsers.length;
      const refreshed = Array.isArray(outcome) ? 0 : outcome.refreshedUsers;
      setNotice(`Imported ${added}, refreshed ${refreshed}.`);
      setSelected([]);
      reload();
      onComplete();
    } catch (error) {
      setFailure(friendlyError(error, 'Could not import users.'));
    } finally {
      setBusy(false);
      setConfirm(false);
      working.current = false;
    }
  }

  return (
    <Section title={`Import ${provider} Users`}>
      <ServiceNote error={error} what={`${provider} users`} retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          Loading provider users…
        </p>
      )}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {data && !plex && (
        <label className="set">
          <span>Sync Existing Users</span>
          <input
            type="checkbox"
            checked={sync}
            disabled={busy}
            onChange={(event) => setSync(event.target.checked)}
          />
        </label>
      )}
      {data && !eligible.length && (
        <p className="note">No new users to import.</p>
      )}
      {!!eligible.length && (
        <div
          className="setlist picklist"
          role="group"
          aria-label={`${provider} users`}
        >
          {eligible.map((user) => (
            <label className="set pick" key={user.id}>
              <span>
                <b>{user.title || user.username}</b>
                {user.isImported && <small>Already Imported</small>}
              </span>
              <input
                type="checkbox"
                disabled={busy || (!ids.includes(user.id) && ids.length >= 250)}
                checked={ids.includes(user.id)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...ids, user.id]
                      : ids.filter((id) => id !== user.id)
                  )
                }
              />
            </label>
          ))}
        </div>
      )}
      <div className="toolbar">
        <button
          className="btn btn-tonal btn-sm"
          disabled={busy || (!ids.length && !syncOnly)}
          onClick={() => setConfirm(true)}
        >
          {label}
        </button>
        <button
          className="btn btn-quiet btn-sm"
          disabled={busy}
          onClick={onClose}
        >
          Close Import
        </button>
      </div>
      {confirm && (
        <ConfirmSheet
          title={`${label}?`}
          body={
            syncOnly
              ? 'Refresh linked Plex accounts and import any newly eligible Plex users.'
              : `${ids.length} selected from ${provider}.`
          }
          confirm={label}
          cancel="Go Back"
          busy={busy}
          onConfirm={() => void importUsers()}
          onClose={() => {
            if (!working.current) setConfirm(false);
          }}
        />
      )}
    </Section>
  );
}

import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { ConfirmSheet } from './ConfirmSheet';
import { ServiceNote } from './extra';

interface LinkedIdentity {
  id: number;
  username?: string;
  provider: { name: string };
}

interface Account {
  key: string;
  name: string;
  username?: string;
}

export default function ManagedLinkedAccounts({
  id,
  media,
  canUnlink,
  onSaved,
}: {
  id: number;
  media?: Account;
  canUnlink: boolean;
  onSaved: () => void;
}) {
  const path = `/user/${id}/settings/linked-accounts`;
  const linked = useApi<LinkedIdentity[]>(path);
  const password = useApi<{ hasPassword: boolean }>(
    canUnlink ? `/user/${id}/settings/password` : null
  );
  const [removed, setRemoved] = useState<string[]>([]);
  const [selected, setSelected] = useState<Account>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const working = useRef(false);
  const accounts = [
    ...(media ? [media] : []),
    ...(linked.data ?? []).map((account) => ({
      key: String(account.id),
      name: account.provider.name,
      username: account.username,
    })),
  ].filter((account) => !removed.includes(account.key));
  const permitted = (account: Account) =>
    canUnlink &&
    !!linked.data &&
    (account.key !== media?.key || id !== 1) &&
    (password.data?.hasPassword || accounts.length > 1);

  async function unlink() {
    if (!selected || !permitted(selected) || working.current) return;
    working.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await api(
        `${path}/${encodeURIComponent(selected.key)}`,
        { method: 'DELETE' },
        'empty'
      );
      setRemoved((current) => [...current, selected.key]);
      setNotice('Account unlinked.');
      linked.reload();
      onSaved();
    } catch (error) {
      setFailure(friendlyError(error, 'Could not unlink the account.'));
      linked.reload();
      password.reload();
    } finally {
      setSelected(undefined);
      setBusy(false);
      working.current = false;
    }
  }

  return (
    <div>
      <ServiceNote
        error={linked.error}
        what="linked accounts"
        retry={linked.reload}
      />
      <ServiceNote
        error={password.error}
        what="password status"
        retry={password.reload}
      />
      {!linked.data && !linked.error && (
        <p className="note" role="status">
          Loading linked accounts…
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
      {linked.data && !accounts.length && (
        <p className="note">No linked accounts.</p>
      )}
      {!!accounts.length && (
        <ul className="setlist">
          {accounts.map((account) => (
            <li className="set" key={account.key}>
              <div>
                <b>{account.name}</b>
                {account.username && <small>{account.username}</small>}
              </div>
              {permitted(account) && (
                <button
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={() => setSelected(account)}
                >
                  Unlink {account.name}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <ConfirmSheet
          title={`Unlink ${selected.name}?`}
          body="This removes the linked sign-in method from this account."
          confirm="Unlink Account"
          cancel="Go Back"
          busy={busy}
          onConfirm={() => void unlink()}
          onClose={() => {
            if (!working.current) setSelected(undefined);
          }}
        />
      )}
    </div>
  );
}

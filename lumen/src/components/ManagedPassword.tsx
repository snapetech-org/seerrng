import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';

export default function ManagedPassword({
  id,
  name,
}: {
  id: number;
  name: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const working = useRef(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const newPassword = String(fields.get('newPassword') ?? '');
    setError('');
    setNotice('');
    if (
      newPassword.length < 8 ||
      newPassword !== fields.get('confirmPassword')
    ) {
      setError('Enter matching passwords of at least 8 characters.');
      return;
    }
    working.current = true;
    setBusy(true);
    try {
      await api(
        `/user/${id}/settings/password`,
        {
          method: 'POST',
          body: JSON.stringify({ newPassword }),
        },
        'empty'
      );
      form.reset();
      setNotice('Local password saved.');
    } catch (failure) {
      setError(friendlyError(failure, 'Could not save the local password.'));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="note">
        Set a new password for {name}’s SeerrNG local login.
      </p>
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      <form className="toolbar" onSubmit={save}>
        <label className="sel">
          <span className="lbl">New Local Password</span>
          <input
            className="cfg-json"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={1024}
            required
            disabled={busy}
          />
        </label>
        <label className="sel">
          <span className="lbl">Confirm New Local Password</span>
          <input
            className="cfg-json"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={1024}
            required
            disabled={busy}
          />
        </label>
        <button className="btn btn-tonal btn-sm" disabled={busy}>
          Save Local Password
        </button>
      </form>
    </div>
  );
}

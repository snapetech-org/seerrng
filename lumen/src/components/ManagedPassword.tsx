import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useLumenLocale } from '../i18n';

export default function ManagedPassword({
  id,
  name,
}: {
  id: number;
  name: string;
}) {
  const { t } = useLumenLocale();
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
      setError(
        t(
          'lumen.managedPassword.mismatch',
          'Enter matching passwords of at least 8 characters.'
        )
      );
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
      setNotice(t('lumen.managedPassword.saved', 'Local password saved.'));
    } catch (failure) {
      setError(
        friendlyError(
          failure,
          t(
            'lumen.managedPassword.saveFailure',
            'Could not save the local password.'
          ),
          t
        )
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="note">
        {t(
          'lumen.managedPassword.description',
          'Set a new password for {name}’s SeerrNG local login.',
          { name }
        )}
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
          <span className="lbl">
            {t('lumen.managedPassword.newPassword', 'New Local Password')}
          </span>
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
          <span className="lbl">
            {t(
              'lumen.managedPassword.confirmPassword',
              'Confirm New Local Password'
            )}
          </span>
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
          {t('lumen.managedPassword.save', 'Save Local Password')}
        </button>
      </form>
    </div>
  );
}

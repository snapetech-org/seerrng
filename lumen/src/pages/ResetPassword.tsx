import { useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { BrandMark } from '../components/brand';
import { useLumenLocale } from '../i18n';

export default function ResetPassword() {
  const { t } = useLumenLocale();
  const { guid } = useParams();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || done) return;
    const fields = new FormData(event.currentTarget);
    const password = fields.get('password');
    if (guid && password !== fields.get('confirmPassword')) {
      setError(
        t('lumen.resetPassword.passwordsMustMatch', 'The passwords must match.')
      );
      return;
    }

    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ status: string }>(
        guid
          ? `/auth/reset-password/${encodeURIComponent(guid)}`
          : '/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify(
            guid ? { password } : { email: fields.get('email') }
          ),
        }
      );
      if (result.status !== 'ok') throw new Error('Unexpected reset response');
      setDone(true);
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.status === 429
          ? t(
              'lumen.resetPassword.tooManyAttempts',
              'Too many attempts. Wait a moment and try again.'
            )
          : failure instanceof ApiError && failure.status === 503 && !guid
            ? t(
                'lumen.resetPassword.emailUnavailable',
                'Password recovery email is unavailable. Contact your administrator.'
              )
            : guid
              ? t(
                  'lumen.resetPassword.resetFailure',
                  'Could not reset your password. Try again or request a new link.'
                )
              : t(
                  'lumen.resetPassword.requestFailure',
                  'Could not request a reset link. Please try again.'
                )
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="login-card">
        <div className="brand">
          <BrandMark />
        </div>
        <h1>{t('lumen.resetPassword.title', 'Reset your password')}</h1>
        {done ? (
          <p className="sub" role="status">
            {guid
              ? t(
                  'lumen.resetPassword.passwordReset',
                  'Your password has been reset.'
                )
              : t(
                  'lumen.resetPassword.requested',
                  'If that address is associated with an account, you’ll receive a password reset link.'
                )}
          </p>
        ) : (
          <form className="login-local" onSubmit={submit}>
            {guid ? (
              <>
                <label>
                  {t('lumen.resetPassword.newPassword', 'New password')}
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    disabled={busy}
                  />
                </label>
                <label>
                  {t('lumen.resetPassword.confirmPassword', 'Confirm password')}
                  <input
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    disabled={busy}
                  />
                </label>
              </>
            ) : (
              <label>
                {t('lumen.resetPassword.email', 'Email')}
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={busy}
                />
              </label>
            )}
            {error && (
              <p className="login-err" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-tonal" disabled={busy}>
              {guid
                ? t('lumen.resetPassword.resetAction', 'Reset password')
                : t('lumen.resetPassword.requestAction', 'Email recovery link')}
            </button>
          </form>
        )}
        {guid && !done && (
          <Link className="btn btn-quiet btn-sm" to="/resetpassword">
            {t('lumen.resetPassword.requestNewLink', 'Request a new link')}
          </Link>
        )}
        <Link className="btn btn-quiet btn-sm" to="/login">
          {t('lumen.resetPassword.backToSignIn', 'Back to sign in')}
        </Link>
      </div>
    </main>
  );
}

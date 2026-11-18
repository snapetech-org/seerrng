import { useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { BrandMark } from '../components/brand';

export default function ResetPassword() {
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
      setError('The passwords must match.');
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
          ? 'Too many attempts. Wait a moment and try again.'
          : failure instanceof ApiError && failure.status === 503 && !guid
            ? 'Password recovery email is unavailable. Contact your administrator.'
            : guid
              ? 'Could not reset your password. Try again or request a new link.'
              : 'Could not request a reset link. Please try again.'
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
        <h1>Reset your password</h1>
        {done ? (
          <p className="sub" role="status">
            {guid
              ? 'Your password has been reset.'
              : 'If that address is associated with an account, you’ll receive a password reset link.'}
          </p>
        ) : (
          <form className="login-local" onSubmit={submit}>
            {guid ? (
              <>
                <label>
                  New password
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
                  Confirm password
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
                Email
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
              {guid ? 'Reset password' : 'Email recovery link'}
            </button>
          </form>
        )}
        {guid && !done && (
          <Link className="btn btn-quiet btn-sm" to="/resetpassword">
            Request a new link
          </Link>
        )}
        <Link className="btn btn-quiet btn-sm" to="/login">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}

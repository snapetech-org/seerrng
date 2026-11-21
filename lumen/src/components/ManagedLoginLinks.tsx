import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { ServiceNote } from './extra';

interface LoginLink {
  id: number;
  expiresAt: string;
  status: 'active' | 'used' | 'revoked' | 'expired';
}

export default function ManagedLoginLinks({ id }: { id: number }) {
  const { locale, t } = useLumenLocale();
  const endpoint = '/settings/login-links';
  const { data, error, reload } = useApi<LoginLink[]>(
    `${endpoint}?userId=${id}`
  );
  const [created, setCreated] = useState('');
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  async function mutate(linkId?: number) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    if (linkId === undefined) setCreated('');
    try {
      if (linkId === undefined) {
        const link = await api<LoginLink & { token: string }>(endpoint, {
          method: 'POST',
          body: JSON.stringify({ userId: id }),
        });
        const url = new URL(import.meta.env.BASE_URL, window.location.origin);
        url.hash = new URLSearchParams({ loginToken: link.token }).toString();
        setCreated(url.href);
      } else {
        await api(`${endpoint}/${linkId}/revoke`, { method: 'POST' });
        setCreated('');
        setNotice(
          t('lumen.managedLoginLinks.revoked', 'Sign-in link revoked.')
        );
      }
      reload();
    } catch (error) {
      setFailure(
        friendlyError(
          error,
          t(
            'lumen.managedLoginLinks.updateFailure',
            'Could not update sign-in links.'
          ),
          t
        )
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(created);
      setNotice(t('lumen.managedLoginLinks.copied', 'Sign-in link copied.'));
    } catch {
      setNotice(
        t(
          'lumen.managedLoginLinks.copyFallback',
          'Select and copy the link from the field.'
        )
      );
    }
  }

  return (
    <div className="setlist">
      <div className="set">
        <div>
          <b>{t('lumen.managedLoginLinks.title', 'One-Time Sign-in Links')}</b>
          <small>
            {t(
              'lumen.managedLoginLinks.description',
              'Each link expires after 30 minutes or one use.'
            )}
          </small>
        </div>
        <button
          className="btn btn-tonal btn-sm"
          disabled={busy}
          onClick={() => void mutate()}
        >
          {t('lumen.managedLoginLinks.create', 'Create Sign-in Link')}
        </button>
      </div>
      {created && (
        <div className="toolbar">
          <label className="sel">
            <span className="lbl">
              {t('lumen.managedLoginLinks.newLink', 'New sign-in link')}
            </span>
            <input className="cfg-json" value={created} readOnly />
          </label>
          <button className="btn btn-quiet btn-sm" onClick={() => void copy()}>
            {t('lumen.managedLoginLinks.copy', 'Copy Link')}
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="note">
          {notice}
        </p>
      )}
      {failure && (
        <p role="alert" className="note">
          {failure}
        </p>
      )}
      <ServiceNote
        error={error}
        what={t('lumen.managedLoginLinks.what', 'sign-in links')}
        retry={reload}
      />
      {!data && !error && (
        <p className="note">
          {t('lumen.managedLoginLinks.loading', 'Loading sign-in links…')}
        </p>
      )}
      {data?.length === 0 && (
        <p className="note">
          {t('lumen.managedLoginLinks.empty', 'No sign-in links yet.')}
        </p>
      )}
      {data?.map((link) => (
        <div className="set" key={link.id}>
          <div>
            <b>
              {t(
                `lumen.managedLoginLinks.status.${link.status}`,
                {
                  active: 'Active',
                  used: 'Used',
                  revoked: 'Revoked',
                  expired: 'Expired',
                }[link.status]
              )}
            </b>
            <small>
              {t('lumen.managedLoginLinks.expires', 'Expires {date}', {
                date: new Date(
                  `${link.expiresAt.slice(0, 10)}T12:00:00Z`
                ).toLocaleDateString(locale, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }),
              })}
            </small>
          </div>
          {link.status === 'active' && (
            <button
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => void mutate(link.id)}
            >
              {t('lumen.managedLoginLinks.revoke', 'Revoke Link')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

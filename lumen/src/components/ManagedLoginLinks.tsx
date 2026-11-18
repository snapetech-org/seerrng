import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { shortDate } from './cards';
import { ServiceNote } from './extra';

interface LoginLink {
  id: number;
  expiresAt: string;
  status: 'active' | 'used' | 'revoked' | 'expired';
}

export default function ManagedLoginLinks({ id }: { id: number }) {
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
        setNotice('Sign-in link revoked.');
      }
      reload();
    } catch (error) {
      setFailure(friendlyError(error, 'Could not update sign-in links.'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(created);
      setNotice('Sign-in link copied.');
    } catch {
      setNotice('Select and copy the link from the field.');
    }
  }

  return (
    <div className="setlist">
      <div className="set">
        <div>
          <b>One-Time Sign-in Links</b>
          <small>Each link expires after 30 minutes or one use.</small>
        </div>
        <button
          className="btn btn-tonal btn-sm"
          disabled={busy}
          onClick={() => void mutate()}
        >
          Create Sign-in Link
        </button>
      </div>
      {created && (
        <div className="toolbar">
          <label className="sel">
            <span className="lbl">New sign-in link</span>
            <input className="cfg-json" value={created} readOnly />
          </label>
          <button className="btn btn-quiet btn-sm" onClick={() => void copy()}>
            Copy Link
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
      <ServiceNote error={error} what="sign-in links" retry={reload} />
      {!data && !error && <p className="note">Loading sign-in links…</p>}
      {data?.length === 0 && <p className="note">No sign-in links yet.</p>}
      {data?.map((link) => (
        <div className="set" key={link.id}>
          <div>
            <b>{link.status[0].toUpperCase() + link.status.slice(1)}</b>
            <small>Expires {shortDate(link.expiresAt)}</small>
          </div>
          {link.status === 'active' && (
            <button
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => void mutate(link.id)}
            >
              Revoke Link
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

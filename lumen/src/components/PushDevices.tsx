import { useRef, useState } from 'react';
import { api } from '../api';
import { useApi } from '../hooks';
import { registerBrowserPush, supportsBrowserPush } from '../pushRegistration';
import { sessionGeneration } from '../sessionState';
import { ConfirmSheet } from './ConfirmSheet';
import { ServiceNote } from './extra';

interface Device {
  endpoint: string;
  userAgent?: string | null;
  createdAt: string;
}

function deviceName(agent?: string | null) {
  if (!agent) return 'Browser device';
  if (/Edg(?:e|A|iOS)?\//.test(agent)) return 'Microsoft Edge';
  if (/(?:Firefox|FxiOS)\//.test(agent)) return 'Firefox';
  if (/(?:Chrome|CriOS)\//.test(agent)) return 'Chrome';
  if (/Safari\//.test(agent)) return 'Safari';
  return 'Browser device';
}

export function PushDevices({ id }: { id: number }) {
  const { data, error, reload } = useApi<Device[]>(
    `/user/${id}/pushSubscriptions`
  );
  const [selection, setSelection] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const dismiss = () => {
    if (!pending.current) setSelection(null);
  };

  async function register() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    const generation = sessionGeneration();
    try {
      if (await registerBrowserPush(id)) {
        setNotice('This browser is registered.');
        reload();
      }
    } catch (cause) {
      if (generation === sessionGeneration()) {
        // Never surface network exceptions that might include subscription details.
        setFailure(
          cause instanceof Error &&
            [
              'Allow notifications in your browser to register this device.',
              'Browser push registration is disabled. Check your notification preferences.',
            ].includes(cause.message)
            ? cause.message
            : 'Could not register this browser. Try again.'
        );
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function remove() {
    if (!selection || pending.current) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await api(
        `/user/${id}/pushSubscription/${encodeURIComponent(selection.endpoint)}`,
        { method: 'DELETE' },
        'empty'
      );
      if (generation !== sessionGeneration()) return;
      setSelection(null);
      setNotice('Browser device removed.');
      reload();
    } catch {
      if (generation === sessionGeneration()) {
        setSelection(null);
        setFailure('Could not remove the browser device. Try again.');
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <h3>Registered Browser Devices</h3>
      {supportsBrowserPush() ? (
        <div className="toolbar">
          <button
            className="btn btn-tonal btn-sm"
            disabled={busy}
            onClick={() => void register()}
          >
            Register This Browser
          </button>
        </div>
      ) : (
        <p className="note">
          Browser registration requires a compatible browser and a secure
          connection.
        </p>
      )}
      <ServiceNote error={error} what="browser devices" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          Loading browser devices…
        </p>
      )}
      {data?.length === 0 && (
        <p className="note">No browser devices are registered.</p>
      )}
      {!!data?.length && (
        <ul className="setlist">
          {data.map((device) => (
            <li className="set cfg-row" key={device.endpoint}>
              <span>
                <b>{deviceName(device.userAgent)}</b>
                {Number.isFinite(Date.parse(device.createdAt)) && (
                  <small>
                    Registered {new Date(device.createdAt).toLocaleString()}
                  </small>
                )}
              </span>
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => setSelection(device)}
              >
                Remove Device
              </button>
            </li>
          ))}
        </ul>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {selection && (
        <ConfirmSheet
          title="Remove this browser device?"
          body={`${deviceName(selection.userAgent)} will stop receiving SeerrNG push notifications.`}
          confirm="Remove Device"
          busy={busy}
          onClose={dismiss}
          onConfirm={() => void remove()}
        />
      )}
    </>
  );
}

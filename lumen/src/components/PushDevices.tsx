import { useEffect, useRef, useState } from 'react';
import { UAParser } from 'ua-parser-js';
import { api } from '../api';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import {
  getBrowserPushSubscription,
  registerBrowserPush,
  supportsBrowserPush,
  unsubscribeBrowserPush,
} from '../pushRegistration';
import { sessionGeneration } from '../sessionState';
import { ConfirmSheet } from './ConfirmSheet';
import { ServiceNote } from './extra';

interface Device {
  endpoint: string;
  userAgent?: string | null;
  createdAt: string;
}

function deviceName(agent?: string | null, generic = 'Browser device') {
  if (!agent) return generic;
  const parsed = UAParser(agent);
  return parsed.device.model || generic;
}

export function PushDevices({ id }: { id: number }) {
  const { t, locale } = useLumenLocale();
  const n = (
    key: string,
    fallback: string,
    values?: Record<string, string | number>
  ) =>
    t(
      key.startsWith('lumen.')
        ? key
        : `components.UserProfile.UserSettings.UserNotificationSettings.UserNotificationsWebPush.${key}`,
      fallback,
      values
    );
  const genericDeviceName = n(
    'lumen.notifications.browserDeviceName',
    'Browser device'
  );
  const unknown = n('unknown', 'Unknown');
  const { data, error, reload } = useApi<Device[]>(
    `/user/${id}/pushSubscriptions`
  );
  const [selection, setSelection] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const [browserEndpoint, setBrowserEndpoint] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getBrowserPushSubscription(id)
      .then((subscription) => {
        if (active) setBrowserEndpoint(subscription?.endpoint ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);
  const currentDevice = data?.some(
    (device) => device.endpoint === browserEndpoint
  );
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
      const endpoint = await registerBrowserPush(id);
      if (endpoint) {
        setBrowserEndpoint(endpoint);
        setNotice(
          n(
            'lumen.notifications.browserRegistered',
            'This browser is registered.'
          )
        );
        reload();
      }
    } catch (cause) {
      if (generation === sessionGeneration()) {
        // Never surface network exceptions that might include subscription details.
        setFailure(
          cause instanceof Error &&
            [
              n(
                'lumen.notifications.allowBrowserNotifications',
                'Allow notifications in your browser to register this device.'
              ),
              n(
                'lumen.notifications.browserPushDisabled',
                'Browser push registration is disabled. Check your notification preferences.'
              ),
            ].includes(cause.message)
            ? cause.message
            : n(
                'lumen.notifications.browserRegisterFailure',
                'Could not register this browser. Try again.'
              )
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
      const endpoint = selection.endpoint;
      setSelection(null);
      setNotice(
        n('lumen.notifications.browserDeviceRemoved', 'Browser device removed.')
      );
      try {
        if (await unsubscribeBrowserPush(id, endpoint))
          setBrowserEndpoint(null);
      } catch {
        // The server subscription is already gone, so delivery is disabled.
      }
      reload();
    } catch {
      if (generation === sessionGeneration()) {
        setSelection(null);
        setFailure(
          n(
            'lumen.notifications.browserRemoveFailure',
            'Could not remove the browser device. Try again.'
          )
        );
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <h3>{n('managedevices', 'Registered Browser Devices')}</h3>
      {currentDevice ? (
        <p className="note">
          {n(
            'lumen.notifications.browserRegistered',
            'This browser is registered.'
          )}
        </p>
      ) : supportsBrowserPush() ? (
        <div className="toolbar">
          <button
            className="btn btn-tonal btn-sm"
            disabled={busy}
            onClick={() => void register()}
          >
            {n(
              'lumen.notifications.registerThisBrowser',
              'Register This Browser'
            )}
          </button>
        </div>
      ) : (
        <p className="note">
          {n(
            'lumen.notifications.browserRegistrationRequirements',
            'Browser registration requires a compatible browser and a secure connection.'
          )}
        </p>
      )}
      <ServiceNote
        error={error}
        what={n('device', 'browser devices')}
        retry={reload}
      />
      {!data && !error && (
        <p className="note" role="status">
          {n(
            'lumen.notifications.loadingBrowserDevices',
            'Loading browser devices…'
          )}
        </p>
      )}
      {data?.length === 0 && (
        <p className="note">
          {n('nodevicestoshow', 'No browser devices are registered.')}
        </p>
      )}
      {!!data?.length && (
        <ul className="setlist">
          {data.map((device) => {
            const parsed = UAParser(device.userAgent ?? undefined);
            return (
              <li className="set cfg-row" key={device.endpoint}>
                <span>
                  <b>{deviceName(device.userAgent, genericDeviceName)}</b>
                  <small>
                    {n('operatingsystem', 'Operating System')}:{' '}
                    {parsed.os.name || unknown}
                    {' · '}
                    {n('browser', 'Browser')}: {parsed.browser.name || unknown}
                    {' · '}
                    {n('engine', 'Engine')}: {parsed.engine.name || unknown}
                  </small>
                  {device.endpoint === browserEndpoint && (
                    <small>
                      {n('lumen.notifications.thisBrowser', 'This browser')}
                    </small>
                  )}
                  {Number.isFinite(Date.parse(device.createdAt)) && (
                    <small>
                      {n(
                        'lumen.notifications.registeredAt',
                        'Registered {date}',
                        {
                          date: new Intl.DateTimeFormat(locale, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }).format(new Date(device.createdAt)),
                        }
                      )}
                    </small>
                  )}
                </span>
                <button
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={() => setSelection(device)}
                >
                  {device.endpoint === browserEndpoint
                    ? n(
                        'lumen.notifications.disableThisBrowser',
                        'Disable This Browser'
                      )
                    : n('deletesubscription', 'Remove Device')}
                </button>
              </li>
            );
          })}
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
          title={n(
            'lumen.notifications.removeBrowserTitle',
            'Remove this browser device?'
          )}
          body={n(
            'lumen.notifications.removeBrowserBody',
            '{device} will stop receiving SeerrNG push notifications.',
            {
              device: deviceName(selection.userAgent, genericDeviceName),
            }
          )}
          confirm={n('deletesubscription', 'Remove Device')}
          busy={busy}
          onClose={dismiss}
          onConfirm={() => void remove()}
        />
      )}
    </>
  );
}

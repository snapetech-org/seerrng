import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, plexUrl } from '../api';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import { ServiceNote } from './extra';
import { useDialog } from './useDialog';

interface PlaybackDevice {
  id: string;
  name: string;
  client: string;
  platform?: string;
}

interface PlaybackCatalog {
  mediaId: number;
  is4k: boolean;
  rootItem?: { id: string; kind: string; available: boolean };
}

function deviceList(value: unknown): PlaybackDevice[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new Error('Playback devices could not be verified.');
  }
  const ids = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error('Playback devices could not be verified.');
    const device = entry as Record<string, unknown>;
    if (
      typeof device.id !== 'string' ||
      !device.id ||
      device.id.length > 512 ||
      typeof device.name !== 'string' ||
      !device.name ||
      device.name.length > 256 ||
      typeof device.client !== 'string' ||
      device.client.length > 256 ||
      (device.platform !== undefined &&
        (typeof device.platform !== 'string' ||
          device.platform.length > 256)) ||
      ids.has(device.id)
    )
      throw new Error('Playback devices could not be verified.');
    ids.add(device.id);
    return device as unknown as PlaybackDevice;
  });
}

function catalogItem(value: unknown, mediaId: number, is4k: boolean) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const catalog = value as Record<string, unknown>;
  if (catalog.mediaId !== mediaId || catalog.is4k !== is4k) return '';
  const item = catalog.rootItem;
  if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
  const root = item as Record<string, unknown>;
  return typeof root.id === 'string' &&
    root.id.length > 0 &&
    root.id.length <= 128 &&
    root.kind === 'movie' &&
    root.available === true
    ? root.id
    : '';
}

function PlaybackSheet({
  mediaId,
  is4k,
  title,
  close,
}: {
  mediaId: number;
  is4k: boolean;
  title: string;
  close: () => void;
}) {
  const { t } = useLumenLocale();
  const dialog = useRef<HTMLDivElement>(null);
  const working = useRef(false);
  const [deviceId, setDeviceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [playlist, setPlaylist] = useState('');
  const catalogPath = `/playback/media/${mediaId}${is4k ? '?is4k=true' : ''}`;
  const catalog = useApi<PlaybackCatalog>(catalogPath);
  const devices = useApi<unknown>('/playback/devices');
  useDialog(dialog, () => {
    if (!working.current) close();
  });
  const itemId = catalogItem(catalog.data, mediaId, is4k);
  const activeDevice = (() => {
    try {
      return deviceList(devices.data).find((device) => device.id === deviceId);
    } catch {
      return undefined;
    }
  })();

  async function start(onDevice: boolean) {
    if (working.current || !itemId || (onDevice && !activeDevice)) return;
    working.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    setPlaylist('');
    const generation = sessionGeneration();
    try {
      if (onDevice && activeDevice) {
        await api<void>(`/playback/media/${mediaId}/play`, {
          method: 'POST',
          body: JSON.stringify({
            deviceId: activeDevice.id,
            itemIds: [itemId],
            is4k,
          }),
        });
        if (generation === sessionGeneration())
          setMessage(
            t('lumen.videoPlayback.started', 'Playback started on {device}.', {
              device: activeDevice.name,
            })
          );
      } else {
        const result = await api<{ url: string }>(
          `/playback/media/${mediaId}/playlist`,
          {
            method: 'POST',
            body: JSON.stringify({ itemIds: [itemId], is4k }),
          }
        );
        const safe = plexUrl({ mediaUrl: result.url });
        if (!safe) throw new Error('Unsafe playback URL.');
        if (generation === sessionGeneration()) setPlaylist(safe);
      }
    } catch {
      if (generation === sessionGeneration())
        setError(
          onDevice
            ? t(
                'lumen.videoPlayback.deviceFailure',
                'Playback could not be started. Check the selected device.'
              )
            : t(
                'lumen.videoPlayback.playlistFailure',
                'Could not create a playback playlist.'
              )
        );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  let deviceRows: PlaybackDevice[] = [];
  let invalidDevices = false;
  try {
    if (devices.data !== null) deviceRows = deviceList(devices.data);
  } catch {
    invalidDevices = true;
  }

  return createPortal(
    <div className="sheet-wrap open">
      <div
        className="sheet-scrim"
        aria-hidden="true"
        onClick={() => !busy && close()}
      />
      <div
        className="sheet"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('lumen.videoPlayback.title', 'Play Movie')}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h2>{t('lumen.videoPlayback.title', 'Play Movie')}</h2>
            <p className="note">{title}</p>
          </header>
          <p className="note">
            {is4k
              ? t('lumen.videoPlayback.quality4k', 'Playback quality: 4K')
              : t('lumen.videoPlayback.qualityHd', 'Playback quality: HD')}
          </p>
          <ServiceNote
            error={catalog.error}
            what={t('lumen.videoPlayback.catalog', 'Playable Movie')}
            title={t(
              'lumen.videoPlayback.catalogFailure',
              'Couldn’t Load Playback Item'
            )}
            retryLabel={t('lumen.videoPlayback.retry', 'Retry')}
            retry={catalog.reload}
          />
          {catalog.data !== null && !itemId && (
            <p className="note" role="status">
              {t(
                'lumen.videoPlayback.unavailable',
                'No playable movie is available at this quality.'
              )}
            </p>
          )}
          <ServiceNote
            error={
              invalidDevices
                ? t(
                    'lumen.videoPlayback.invalidDevices',
                    'Playback devices could not be verified.'
                  )
                : devices.error
            }
            what={t('lumen.videoPlayback.devices', 'Playback Devices')}
            title={t(
              'lumen.videoPlayback.devicesFailure',
              'Couldn’t Load Playback Devices'
            )}
            retryLabel={t('lumen.videoPlayback.retry', 'Retry')}
            retry={devices.reload}
          />
          {!devices.data && !devices.error && (
            <p className="note" role="status">
              {t(
                'lumen.videoPlayback.loadingDevices',
                'Loading playback devices…'
              )}
            </p>
          )}
          {deviceRows.length > 0 && (
            <div className="toolbar">
              <label className="sel">
                <span className="lbl">
                  {t('lumen.videoPlayback.device', 'Device')}
                </span>
                <select
                  aria-label={t('lumen.videoPlayback.device', 'Device')}
                  value={deviceId}
                  disabled={busy}
                  onChange={(event) => setDeviceId(event.target.value)}
                >
                  <option value="">
                    {t('lumen.videoPlayback.chooseDevice', 'Choose…')}
                  </option>
                  {deviceRows.map((device) => (
                    <option key={device.id} value={device.id}>
                      {[device.name, device.client, device.platform]
                        .filter(Boolean)
                        .join(' · ')}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn btn-tonal btn-sm"
                disabled={busy || !itemId || !activeDevice}
                onClick={() => void start(true)}
              >
                {busy
                  ? t('lumen.videoPlayback.starting', 'Starting…')
                  : t('lumen.videoPlayback.playOnDevice', 'Play on Device')}
              </button>
            </div>
          )}
          {deviceRows.length === 0 &&
            devices.data !== null &&
            !devices.error && (
              <p className="note">
                {t(
                  'lumen.videoPlayback.noDevices',
                  'No active, authorized playback devices are available.'
                )}
              </p>
            )}
          {error && (
            <p className="note" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="note" role="status">
              {message}
            </p>
          )}
          <p className="note">
            {t(
              'lumen.videoPlayback.playlistWarning',
              'Creating a playlist replaces the media server’s Current Selection playlist.'
            )}
          </p>
          <div className="toolbar">
            <button
              className="btn btn-tonal btn-sm"
              disabled={busy || !itemId}
              onClick={() => void start(false)}
            >
              {busy
                ? t('lumen.videoPlayback.creating', 'Creating…')
                : t(
                    'lumen.videoPlayback.createPlaylist',
                    'Create Playback Playlist'
                  )}
            </button>
            {playlist && (
              <a
                className="btn btn-quiet btn-sm"
                href={playlist}
                target="_blank"
                rel="noreferrer"
              >
                {t('lumen.videoPlayback.openPlaylist', 'Open on Media Server')}
              </a>
            )}
          </div>
          <div className="toolbar">
            <button
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={close}
            >
              {t('lumen.videoPlayback.close', 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function VideoPlaybackButton({
  mediaId,
  is4k,
  title,
}: {
  mediaId: number;
  is4k: boolean;
  title: string;
}) {
  const { t } = useLumenLocale();
  const [open, setOpen] = useState(false);
  if (!Number.isSafeInteger(mediaId) || mediaId <= 0) return null;
  return (
    <>
      <button className="btn btn-quiet btn-sm" onClick={() => setOpen(true)}>
        {t('lumen.videoPlayback.open', 'Playback Options')}
      </button>
      {open && (
        <PlaybackSheet
          key={`${mediaId}:${is4k ? '4k' : 'hd'}`}
          mediaId={mediaId}
          is4k={is4k}
          title={title}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}

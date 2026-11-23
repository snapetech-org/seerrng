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

type PlaybackKind = 'movie' | 'tv';

function catalogGroups(
  value: unknown,
  mediaId: number,
  is4k: boolean,
  kind: PlaybackKind,
  blocked: number[]
) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const catalog = value as Record<string, unknown>;
  if (
    catalog.mediaId !== mediaId ||
    catalog.is4k !== is4k ||
    !Array.isArray(catalog.groups) ||
    catalog.groups.length > 500
  )
    return undefined;
  if (kind === 'movie') {
    const root = catalog.rootItem;
    if (!root || typeof root !== 'object' || Array.isArray(root))
      return { groups: [], allIds: [] };
    const item = root as Record<string, unknown>;
    if (
      typeof item.id !== 'string' ||
      !item.id ||
      item.id.length > 128 ||
      item.kind !== 'movie' ||
      item.available !== true
    )
      return { groups: [], allIds: [] };
    return { groups: [], allIds: [item.id] };
  }
  const seen = new Set<string>();
  let itemCount = 0;
  const groups: {
    id: string;
    title: string;
    index: number;
    items: { id: string; title: string }[];
  }[] = [];
  for (const raw of catalog.groups) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const group = raw as Record<string, unknown>;
    if (
      typeof group.id !== 'string' ||
      !group.id ||
      group.id.length > 128 ||
      typeof group.title !== 'string' ||
      group.title.length > 256 ||
      !Number.isSafeInteger(group.index) ||
      (group.index as number) < 0 ||
      typeof group.available !== 'boolean' ||
      !Array.isArray(group.items)
    )
      return undefined;
    const items: { id: string; title: string }[] = [];
    for (const rawItem of group.items) {
      itemCount += 1;
      if (itemCount > 1000 || !rawItem || typeof rawItem !== 'object')
        return undefined;
      const item = rawItem as Record<string, unknown>;
      if (
        typeof item.id !== 'string' ||
        !item.id ||
        item.id.length > 128 ||
        typeof item.title !== 'string' ||
        item.title.length > 512 ||
        item.kind !== 'episode' ||
        item.available !== true ||
        seen.has(item.id)
      )
        return undefined;
      seen.add(item.id);
      items.push({ id: item.id, title: item.title });
    }
    if (
      group.available &&
      items.length > 0 &&
      !blocked.includes(group.index as number)
    )
      groups.push({
        id: group.id,
        title: group.title,
        index: group.index as number,
        items,
      });
  }
  return {
    groups,
    allIds: groups.flatMap((group) => group.items.map((item) => item.id)),
  };
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

function PlaybackSheet({
  mediaId,
  is4k,
  mediaType,
  blockedGroupIndexes,
  title,
  close,
}: {
  mediaId: number;
  is4k: boolean;
  mediaType: PlaybackKind;
  blockedGroupIndexes: number[];
  title: string;
  close: () => void;
}) {
  const { t } = useLumenLocale();
  const dialog = useRef<HTMLDivElement>(null);
  const working = useRef(false);
  const [deviceId, setDeviceId] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [playlist, setPlaylist] = useState('');
  const catalogPath = `/playback/media/${mediaId}${is4k ? '?is4k=true' : ''}`;
  const catalog = useApi<unknown>(catalogPath);
  const devices = useApi<unknown>('/playback/devices');
  useDialog(dialog, () => {
    if (!working.current) close();
  });
  const selectionCatalog = catalogGroups(
    catalog.data,
    mediaId,
    is4k,
    mediaType,
    blockedGroupIndexes
  );
  const [selectedItems, setSelectedItems] = useState<Set<string>>();
  const selectedIds = selectionCatalog
    ? selectionCatalog.allIds.filter(
        (id) => !selectedItems || selectedItems.has(id)
      )
    : [];
  const mediaLabel =
    mediaType === 'movie'
      ? t('lumen.videoPlayback.title', 'Play Movie')
      : t('lumen.videoPlayback.seriesTitle', 'Play Series');
  const activeDevice = (() => {
    try {
      return deviceList(devices.data).find((device) => device.id === deviceId);
    } catch {
      return undefined;
    }
  })();

  async function start(onDevice: boolean) {
    if (
      working.current ||
      selectedIds.length === 0 ||
      (onDevice && !activeDevice)
    )
      return;
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
            itemIds: selectedIds,
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
            body: JSON.stringify({ itemIds: selectedIds, is4k }),
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
        aria-label={mediaLabel}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h2>{mediaLabel}</h2>
            <p className="note">{title}</p>
          </header>
          <p className="note">
            {is4k
              ? t('lumen.videoPlayback.quality4k', 'Playback quality: 4K')
              : t('lumen.videoPlayback.qualityHd', 'Playback quality: HD')}
          </p>
          <ServiceNote
            error={
              catalog.error ||
              (catalog.data !== null && !selectionCatalog
                ? t(
                    'lumen.videoPlayback.invalidCatalog',
                    'Playback items could not be verified.'
                  )
                : null)
            }
            what={t(
              'lumen.videoPlayback.catalog',
              mediaType === 'movie' ? 'Playable Movie' : 'Playable Episodes'
            )}
            title={t(
              'lumen.videoPlayback.catalogFailure',
              'Couldn’t Load Playback Item'
            )}
            retryLabel={t('lumen.videoPlayback.retry', 'Retry')}
            retry={catalog.reload}
          />
          {catalog.data !== null &&
            selectionCatalog &&
            selectedIds.length === 0 && (
              <p className="note" role="status">
                {mediaType === 'tv'
                  ? selectionCatalog.allIds.length === 0
                    ? t(
                        'lumen.videoPlayback.episodesUnavailable',
                        'No playable episodes are available at this quality.'
                      )
                    : t(
                        'lumen.videoPlayback.selectEpisode',
                        'Select at least one playable episode.'
                      )
                  : t(
                      'lumen.videoPlayback.unavailable',
                      'No playable movie is available at this quality.'
                    )}
              </p>
            )}
          {mediaType === 'tv' && selectionCatalog && (
            <ul
              className="setlist"
              aria-label={t(
                'lumen.videoPlayback.episodes',
                'Playable Episodes'
              )}
            >
              {selectionCatalog.groups.map((group) => {
                const checked = group.items.every(({ id }) =>
                  selectedIds.includes(id)
                );
                return (
                  <li className="set" key={group.id}>
                    <label>
                      <input
                        type="checkbox"
                        aria-label={t(
                          'lumen.videoPlayback.selectSeason',
                          'Select all episodes from {season}',
                          { season: group.title }
                        )}
                        checked={checked}
                        disabled={busy}
                        onChange={(event) => {
                          const next = new Set(
                            selectedItems ?? selectionCatalog.allIds
                          );
                          for (const item of group.items) {
                            if (event.target.checked) next.add(item.id);
                            else next.delete(item.id);
                          }
                          setSelectedItems(next);
                        }}
                      />{' '}
                      {group.title} · {group.items.length}
                    </label>
                    <details
                      open={expandedGroups.has(group.id)}
                      onToggle={(event) => {
                        const open = event.currentTarget.open;
                        setExpandedGroups((current) => {
                          if (current.has(group.id) === open) return current;
                          const next = new Set(current);
                          if (open) next.add(group.id);
                          else next.delete(group.id);
                          return next;
                        });
                      }}
                    >
                      <summary>
                        {t('lumen.videoPlayback.episodes', 'Playable Episodes')}
                      </summary>
                      <ul>
                        {group.items.map((item) => (
                          <li key={item.id}>
                            <label>
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(item.id)}
                                disabled={busy}
                                onChange={(event) => {
                                  const next = new Set(
                                    selectedItems ?? selectionCatalog.allIds
                                  );
                                  if (event.target.checked) next.add(item.id);
                                  else next.delete(item.id);
                                  setSelectedItems(next);
                                }}
                              />{' '}
                              {item.title}
                            </label>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
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
                disabled={busy || selectedIds.length === 0 || !activeDevice}
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
              disabled={busy || selectedIds.length === 0}
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
  mediaType = 'movie',
  blockedGroupIndexes = [],
  title,
}: {
  mediaId: number;
  is4k: boolean;
  mediaType?: PlaybackKind;
  blockedGroupIndexes?: number[];
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
          mediaType={mediaType}
          blockedGroupIndexes={blockedGroupIndexes}
          title={title}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, MediaStatus, plexUrl, titleOf, type TitleResult } from '../api';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import { ServiceNote } from './extra';
import { useDialog } from './useDialog';

type Quality = 'hd' | '4k';
type Availability = 'show' | 'distinguish' | 'hide' | undefined;
interface Device {
  id: string;
  name: string;
  client: string;
  platform?: string;
}

function playableId(
  part: TitleResult,
  quality: Quality,
  visibility: Availability
) {
  const media = part.mediaInfo;
  const id = media?.id;
  if (
    part.mediaType !== 'movie' ||
    !media ||
    id == null ||
    !Number.isSafeInteger(id) ||
    id <= 0
  )
    return undefined;
  const is4k = quality === '4k';
  const status = is4k ? media.status4k : media.status;
  if (status !== MediaStatus.AVAILABLE && status !== MediaStatus.PARTIAL)
    return undefined;
  const shared = visibility === 'distinguish' || visibility === 'hide';
  if (
    shared &&
    media.viewerRequestCoverage?.[is4k ? 'fourK' : 'standard'] === false
  )
    return undefined;
  return id;
}

export function collectionPlaybackQualities(
  parts: TitleResult[],
  allow4k: boolean,
  visibility: Availability
): Quality[] {
  const supported: Quality[] = allow4k ? ['hd', '4k'] : ['hd'];
  return supported.filter((quality) =>
    parts.some((part) => playableId(part, quality, visibility) !== undefined)
  );
}

export default function CollectionPlaybackSheet({
  title,
  parts,
  qualities,
  visibility,
  close,
}: {
  title: string;
  parts: TitleResult[];
  qualities: Quality[];
  visibility: Availability;
  close: () => void;
}) {
  const { t } = useLumenLocale();
  const dialog = useRef<HTMLDivElement>(null);
  const working = useRef(false);
  const [quality, setQuality] = useState(qualities[0]);
  const [selected, setSelected] = useState<Set<number>>();
  const [deviceId, setDeviceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [playlist, setPlaylist] = useState<string>();
  const {
    data: devices,
    error: deviceError,
    reload,
  } = useApi<Device[]>('/playback/devices');
  const dismiss = () => {
    if (!working.current) close();
  };
  useDialog(dialog, dismiss);

  // The collection response supplies release order. Use internal media IDs for playback.
  const playable = [
    ...new Map(
      parts.flatMap((part) => {
        const id = playableId(part, quality, visibility);
        return id === undefined ? [] : [[id, part] as const];
      })
    ).entries(),
  ];
  const mediaIds = playable
    .map(([id]) => id)
    .filter((id) => !selected || selected.has(id));
  const device = devices?.find(({ id }) => id === deviceId);
  const valid =
    qualities.includes(quality) &&
    mediaIds.length > 0 &&
    mediaIds.length <= 1000;

  function clearResult() {
    setError('');
    setNotice('');
    setPlaylist(undefined);
  }

  async function play(onDevice: boolean) {
    if (working.current || !valid || (onDevice && !device)) return;
    working.current = true;
    setBusy(true);
    clearResult();
    const generation = sessionGeneration();
    const body = { mediaIds, is4k: quality === '4k' };
    try {
      if (onDevice && device) {
        await api<void>('/playback/collection/play', {
          method: 'POST',
          body: JSON.stringify({ ...body, deviceId: device.id }),
        });
        if (generation === sessionGeneration())
          setNotice(
            t(
              'lumen.collectionPlayback.startedOn',
              'Playback Started on {device}.',
              {
                device: device.name,
              }
            )
          );
      } else {
        const { url } = await api<{ url: string }>(
          '/playback/collection/playlist',
          {
            method: 'POST',
            body: JSON.stringify(body),
          }
        );
        const safe = plexUrl({ mediaUrl: url });
        if (!safe) throw new Error();
        if (generation === sessionGeneration()) setPlaylist(safe);
      }
    } catch {
      if (generation === sessionGeneration()) {
        setError(
          t(
            onDevice
              ? 'lumen.collectionPlayback.deviceFailure'
              : 'lumen.collectionPlayback.playlistFailure',
            onDevice
              ? 'Could not Confirm Playback. Check the Selected Device.'
              : 'Could Not Open a Playlist for This Selection.'
          )
        );
        if (onDevice) reload();
      }
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={dismiss} />
      <div
        className="sheet"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t('lumen.collectionPlayback.title', 'Play Collection')}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h2>{t('lumen.collectionPlayback.title', 'Play Collection')}</h2>
            <p className="note">{title}</p>
          </header>
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">
                {t('lumen.collectionPlayback.quality', 'Quality')}
              </span>
              <select
                aria-label={t(
                  'lumen.collectionPlayback.playbackQuality',
                  'Playback Quality'
                )}
                disabled={busy}
                value={quality}
                onChange={(event) => {
                  setQuality(event.target.value === '4k' ? '4k' : 'hd');
                  setSelected(undefined);
                  clearResult();
                }}
              >
                {qualities.map((value) => (
                  <option value={value} key={value}>
                    {value === '4k' ? '4K' : 'HD'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul
            className="setlist"
            aria-label={t(
              'lumen.collectionPlayback.playableMovies',
              'Playable Movies'
            )}
          >
            {playable.map(([id, part]) => (
              <li className="set" key={id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected?.has(id) ?? true}
                    disabled={busy}
                    onChange={(event) => {
                      const next = new Set(mediaIds);
                      if (event.target.checked) next.add(id);
                      else next.delete(id);
                      setSelected(next);
                      clearResult();
                    }}
                  />{' '}
                  {titleOf(part)}
                </label>
              </li>
            ))}
          </ul>
          {mediaIds.length > 1000 && (
            <p className="note">
              {t(
                'lumen.collectionPlayback.selectionLimit',
                'Select 1,000 Movies or Fewer.'
              )}
            </p>
          )}
          <ServiceNote
            error={deviceError}
            what={t('lumen.collectionPlayback.devices', 'Playback Devices')}
            title={t(
              'lumen.collectionPlayback.devicesFailure',
              'Couldn’t Load Playback Devices'
            )}
            retryLabel={t('lumen.collectionPlayback.retry', 'Retry')}
            retry={reload}
          />
          {!devices && !deviceError && (
            <p className="note" role="status">
              {t(
                'lumen.collectionPlayback.loadingDevices',
                'Loading Playback Devices…'
              )}
            </p>
          )}
          {devices?.length === 0 && (
            <p className="note">
              {t(
                'lumen.collectionPlayback.noDevices',
                'No Active, Authorized Devices Are Available.'
              )}
            </p>
          )}
          {!!devices?.length && (
            <div className="toolbar">
              <label className="sel">
                <span className="lbl">
                  {t('lumen.collectionPlayback.device', 'Device')}
                </span>
                <select
                  aria-label={t(
                    'lumen.collectionPlayback.playbackDevice',
                    'Playback Device'
                  )}
                  value={device?.id ?? ''}
                  disabled={busy}
                  onChange={(event) => {
                    setDeviceId(event.target.value);
                    clearResult();
                  }}
                >
                  <option value="">
                    {t('lumen.collectionPlayback.chooseDevice', 'Choose…')}
                  </option>
                  {devices.map(({ id, name, client, platform }) => (
                    <option value={id} key={id}>
                      {[name, client, platform].filter(Boolean).join(' · ')}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn btn-tonal btn-sm"
                disabled={busy || !valid || !device}
                onClick={() => void play(true)}
              >
                {t('lumen.collectionPlayback.playOnDevice', 'Play on Device')}
              </button>
            </div>
          )}
          <p className="note">
            {t(
              'lumen.collectionPlayback.playlistWarning',
              'Creating a Playlist Replaces the Media Server’s Current Selection Playlist.'
            )}
          </p>
          <div className="toolbar">
            <button
              className="btn btn-tonal btn-sm"
              disabled={busy || !valid}
              onClick={() => void play(false)}
            >
              {t(
                'lumen.collectionPlayback.createPlaylist',
                'Create Playback Playlist'
              )}
            </button>
            {playlist && (
              <a
                className="btn btn-quiet btn-sm"
                href={playlist}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('lumen.collectionPlayback.openPlaylist', 'Open Playlist')}
              </a>
            )}
          </div>
          {notice && (
            <p className="note" role="status">
              {notice}
            </p>
          )}
          {error && (
            <p className="note" role="alert">
              {error}
            </p>
          )}
          <div className="pk-foot">
            <button className="btn btn-quiet" disabled={busy} onClick={dismiss}>
              {t('lumen.collectionPlayback.close', 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

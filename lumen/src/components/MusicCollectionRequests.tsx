import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, MediaStatus, type MediaInfo } from '../api';
import { isAdministrator, useAuth } from '../auth';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { ServiceNote } from './extra';
import { useDialog } from './useDialog';

interface Release {
  id: string;
  title: string;
  availableQualities?: ('MP3' | 'FLAC')[];
  mediaInfo?: MediaInfo;
}
interface Lidarr {
  id: number;
  name: string;
  isDefault?: boolean;
  musicQuality?: 'mp3' | 'flac';
}
interface BatchResult {
  created: unknown[];
  skipped: { mediaId: string; title?: string; reason: string }[];
  failed: { mediaId: string; title?: string; reason: string }[];
}
const limit = 100;
const qualityOf = (service: Lidarr) =>
  service.musicQuality ??
  (/\b(?:FLAC|LOSSLESS)\b/i.test(service.name)
    ? 'flac'
    : /\bMP3\b/i.test(service.name)
      ? 'mp3'
      : undefined);

function Sheet({
  releases,
  close,
  refresh,
}: {
  releases: Release[];
  close: () => void;
  refresh: () => void;
}) {
  const { t } = useLumenLocale();
  const dialog = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const services = useApi<Lidarr[]>('/service/lidarr');
  const [quality, setQuality] = useState<'mp3' | 'flac'>();
  const [selected, setSelected] = useState(new Set<string>());
  const [result, setResult] = useState<BatchResult>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const targets = (services.data ?? []).filter((service) => qualityOf(service));
  const forQuality = (value: 'mp3' | 'flac') =>
    targets.filter((target) => qualityOf(target) === value);
  const format = quality ?? (forQuality('mp3').length ? 'mp3' : 'flac');
  const matching = forQuality(format);
  const destination =
    matching.find((target) => target.isDefault) ?? matching[0];
  const unavailable = (release: Release) =>
    release.mediaInfo?.status === MediaStatus.BLOCKLISTED ||
    release.availableQualities?.includes(format === 'flac' ? 'FLAC' : 'MP3');
  const items = releases.filter(
    (release) => selected.has(release.id) && !unavailable(release)
  );

  function finish() {
    if (pending.current) return;
    if (result) refresh();
    close();
  }
  useDialog(dialog, finish);

  async function submit() {
    if (!destination || !items.length || pending.current || result) return;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      setResult(
        await api<BatchResult>('/request/bulk', {
          method: 'POST',
          body: JSON.stringify({
            mediaType: 'music',
            serverId: destination.id,
            items: items.map(({ id, title }) => ({ mediaId: id, title })),
          }),
        })
      );
    } catch (failure) {
      setError(
        friendlyError(
          failure,
          t(
            'lumen.musicCollectionRequests.submitFailed',
            'Could not submit music requests.'
          )
        )
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={finish} />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t(
          'lumen.musicCollectionRequests.title',
          'Request Releases'
        )}
        ref={dialog}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h3>
              {t('lumen.musicCollectionRequests.title', 'Request Releases')}
            </h3>
          </header>
          <ServiceNote
            what={t('lumen.musicCollectionRequests.services', 'music services')}
            error={services.error}
            retry={services.reload}
          />
          {!services.data && !services.error && (
            <p className="note" role="status">
              {t(
                'lumen.musicCollectionRequests.loadingServices',
                'Loading music services…'
              )}
            </p>
          )}
          {services.data && !targets.length && (
            <p className="note">
              {t(
                'lumen.musicCollectionRequests.noServices',
                'No music request services are configured.'
              )}
            </p>
          )}
          {result ? (
            <>
              <p role="status">
                {t(
                  'lumen.musicCollectionRequests.result',
                  '{requested} requested, {skipped} skipped, {failed} failed.',
                  {
                    requested: result.created.length,
                    skipped: result.skipped.length,
                    failed: result.failed.length,
                  }
                )}
              </p>
              {!!(result.skipped.length + result.failed.length) && (
                <ul className="slist">
                  {[...result.skipped, ...result.failed].map((release) => (
                    <li key={release.mediaId}>
                      {release.title || release.mediaId} · {release.reason}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            !!targets.length && (
              <>
                <label className="sel">
                  <span className="lbl">
                    {t('lumen.musicCollectionRequests.quality', 'Quality')}
                  </span>
                  <select
                    disabled={busy}
                    value={format}
                    onChange={(event) => {
                      setQuality(event.target.value as 'mp3' | 'flac');
                      setSelected(new Set());
                      setError(undefined);
                    }}
                  >
                    {!!forQuality('mp3').length && (
                      <option value="mp3">MP3</option>
                    )}
                    {!!forQuality('flac').length && (
                      <option value="flac">FLAC</option>
                    )}
                  </select>
                </label>
                <div className="setlist">
                  {releases.map((release) => (
                    <label className="set cfg-row" key={release.id}>
                      <span>
                        {release.title}
                        {unavailable(release) && (
                          <small>
                            {t(
                              'lumen.musicCollectionRequests.unavailable',
                              'Available in this quality or blocklisted'
                            )}
                          </small>
                        )}
                      </span>
                      <input
                        type="checkbox"
                        checked={selected.has(release.id)}
                        disabled={
                          busy ||
                          !!unavailable(release) ||
                          (!selected.has(release.id) && selected.size >= limit)
                        }
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelected((previous) => {
                            const next = new Set(previous);
                            if (!checked) next.delete(release.id);
                            else if (next.size < limit) next.add(release.id);
                            return next;
                          });
                        }}
                      />
                    </label>
                  ))}
                </div>
                <p className="note" role="status">
                  {t(
                    'lumen.musicCollectionRequests.selected',
                    '{count} of {limit} selected',
                    { count: items.length, limit }
                  )}
                </p>
              </>
            )
          )}
          {error && (
            <p className="note" role="alert">
              {error}
            </p>
          )}
          <div className="pk-foot">
            {!result && (
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy || !destination || !items.length}
                onClick={() => void submit()}
              >
                {t(
                  'lumen.musicCollectionRequests.submit',
                  'Request Selected Releases'
                )}
              </button>
            )}
            <button
              className="btn btn-quiet"
              type="button"
              disabled={busy}
              onClick={finish}
            >
              {t('lumen.musicCollectionRequests.close', 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function MusicCollectionRequests({
  releases,
  refresh,
}: {
  releases: Release[];
  refresh: () => void;
}) {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const permissions = user?.permissions;
  const allowed =
    isAdministrator(permissions) ||
    (typeof permissions === 'number' &&
      Number.isSafeInteger(permissions) &&
      permissions >= 0 &&
      (BigInt(permissions) & (32n | (1n << 32n))) !== 0n);
  if (!allowed || !releases.length) return null;
  return (
    <>
      <button
        className="btn btn-tonal btn-sm"
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {t('lumen.musicCollectionRequests.title', 'Request Releases')}
      </button>
      {open && (
        <Sheet
          releases={releases}
          close={() => setOpen(false)}
          refresh={refresh}
        />
      )}
    </>
  );
}

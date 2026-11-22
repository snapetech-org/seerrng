import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import MediaServerConnection, {
  type ConnectionSettings,
} from '../components/MediaServerConnection';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';

type Library = {
  id: string;
  name: string;
  enabled: boolean;
  type: 'show' | 'movie' | 'music' | 'book';
  episodeOrderProvider?: 'tmdb' | 'tvdb';
};
type Scan = {
  running: boolean;
  progress: number;
  total: number;
  currentLibrary?: Library;
};
const names = { 1: 'Plex', 2: 'Jellyfin', 3: 'Emby' } as const;

function MediaLibraries({
  name,
  provider,
}: {
  name: string;
  provider: 'plex' | 'jellyfin';
}) {
  const { t } = useLumenLocale();
  const path = `/settings/${provider}`;
  const settings = useApi<ConnectionSettings & { libraries: Library[] }>(path);
  const tautulli = useApi<ConnectionSettings>(
    provider === 'plex' ? '/settings/tautulli' : null
  );
  const scan = useApi<Scan>(`${path}/sync`, { keepDuringRefresh: true });
  const refreshScan = scan.refresh;
  const [updated, setUpdated] = useState<Library[]>();
  const [scanOverride, setScanOverride] = useState<Scan>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const libraries = updated ?? settings.data?.libraries;
  const scanStatus = scanOverride ?? scan.data;
  const enabled =
    libraries?.filter((library) => library.enabled).map(({ id }) => id) ?? [];

  useEffect(() => {
    setScanOverride(undefined);
  }, [scan.data]);

  useEffect(() => {
    if (scanStatus?.running === undefined) return;
    const timer = window.setInterval(
      refreshScan,
      scanStatus.running ? 2500 : 10000
    );
    return () => window.clearInterval(timer);
  }, [scanStatus?.running, refreshScan]);

  async function run(action: () => Promise<void>, message: string) {
    if (pending.current) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await action();
      if (generation === sessionGeneration()) setNotice(message);
    } catch (error) {
      if (generation === sessionGeneration())
        setFailure(
          friendlyError(error, 'Could not update media server settings.', t)
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function updateLibraries(body: object) {
    const generation = sessionGeneration();
    void run(
      async () => {
        const result = await api<Library[]>(`${path}/library`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (generation === sessionGeneration()) setUpdated(result);
      },
      t(
        'lumen.adminMediaLibraries.settingsUpdated',
        'Library settings updated.'
      )
    );
  }

  function reclassify(id: string, type: Library['type']) {
    const generation = sessionGeneration();
    void run(
      async () => {
        const result = await api<Library[]>(
          `${path}/library/${encodeURIComponent(id)}/type`,
          {
            method: 'PUT',
            body: JSON.stringify({ type }),
          }
        );
        if (generation === sessionGeneration()) setUpdated(result);
      },
      t('lumen.adminMediaLibraries.typeUpdated', 'Library type updated.')
    );
  }

  function changeScan(action: 'start' | 'cancel') {
    const generation = sessionGeneration();
    void run(
      async () => {
        const result = await api<Scan>(`${path}/sync`, {
          method: 'POST',
          body: JSON.stringify({ [action]: true }),
        });
        if (generation === sessionGeneration()) {
          setScanOverride(result);
          refreshScan();
        }
      },
      action === 'start'
        ? t(
            'lumen.adminMediaLibraries.scanStartRequested',
            'Scan start requested.'
          )
        : t(
            'lumen.adminMediaLibraries.scanCancelRequested',
            'Scan cancellation requested.'
          )
    );
  }

  return (
    <>
      {settings.data && (
        <MediaServerConnection
          provider={provider}
          name={name}
          initial={settings.data}
          busy={busy}
          setBusy={setBusy}
          pending={pending}
          onSaved={(connection) => setUpdated(connection.libraries)}
        />
      )}
      <Section
        title={t(
          'lumen.adminMediaLibraries.providerLibraries',
          '{provider} Libraries',
          { provider: name }
        )}
      >
        <ServiceNote
          title={t(
            'lumen.adminMediaLibraries.loadLibrariesFailure',
            'Couldn’t Load Media Server Libraries'
          )}
          error={settings.error}
          what={t(
            'lumen.adminMediaLibraries.libraries',
            'media server libraries'
          )}
          retryLabel={t('lumen.common.retry', 'Retry')}
          retry={settings.reload}
        />
        {libraries ? (
          <>
            <div className="toolbar">
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => updateLibraries({ sync: true })}
              >
                {t(
                  'lumen.adminMediaLibraries.refreshLibraries',
                  'Refresh Libraries'
                )}
              </button>
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy || enabled.length === libraries.length}
                onClick={() =>
                  updateLibraries({
                    enable: libraries.map(({ id }) => id).join(','),
                  })
                }
              >
                {t('lumen.adminMediaLibraries.enableAll', 'Enable All')}
              </button>
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy || !enabled.length}
                onClick={() => updateLibraries({ enable: '' })}
              >
                {t('lumen.adminMediaLibraries.disableAll', 'Disable All')}
              </button>
            </div>
            {libraries.length === 0 && (
              <p className="note">
                {t(
                  'lumen.adminMediaLibraries.noLibraries',
                  'No libraries found. Refresh the library list after configuring your server.'
                )}
              </p>
            )}
            <div className="setlist">
              {libraries.map((library) => (
                <div className="set cfg-row" key={library.id}>
                  <span>
                    <b>{library.name}</b>
                    <small>
                      {provider === 'plex' && library.type === 'book'
                        ? t(
                            'lumen.adminMediaLibraries.audiobooks',
                            'Audiobooks'
                          )
                        : t(
                            `lumen.adminMediaLibraries.type.${library.type}`,
                            {
                              show: 'Series',
                              movie: 'Movies',
                              music: 'Music',
                              book: 'Books',
                            }[library.type]
                          )}
                    </small>
                  </span>
                  <label className="cfg-on">
                    <input
                      type="checkbox"
                      aria-label={t(
                        'lumen.adminMediaLibraries.enableLibrary',
                        'Enable {name}',
                        { name: library.name }
                      )}
                      checked={library.enabled}
                      disabled={busy}
                      onChange={(event) =>
                        updateLibraries({
                          enable: (event.target.checked
                            ? [...enabled, library.id]
                            : enabled.filter((id) => id !== library.id)
                          ).join(','),
                        })
                      }
                    />
                    {t('lumen.adminMediaLibraries.enabled', 'Enabled')}
                  </label>
                  {library.type === 'show' && (
                    <label className="cfg-on">
                      {t(
                        'lumen.adminMediaLibraries.episodeOrder',
                        'Episode Order'
                      )}
                      <select
                        className="cfg-select"
                        aria-label={t(
                          'lumen.adminMediaLibraries.episodeOrderFor',
                          'Episode Order for {name}',
                          { name: library.name }
                        )}
                        value={library.episodeOrderProvider ?? 'none'}
                        disabled={busy}
                        onChange={(event) =>
                          updateLibraries({
                            episodeOrderLibraryId: library.id,
                            episodeOrderProvider: event.target.value,
                          })
                        }
                      >
                        <option value="none">
                          {t(
                            'lumen.adminMediaLibraries.automatic',
                            'Automatic'
                          )}
                        </option>
                        <option value="tmdb">TMDB</option>
                        <option value="tvdb">TVDB</option>
                      </select>
                    </label>
                  )}
                  {provider === 'plex' &&
                    (library.type === 'music' || library.type === 'book') && (
                      <label className="cfg-on">
                        {t(
                          'lumen.adminMediaLibraries.libraryType',
                          'Library Type'
                        )}
                        <select
                          className="cfg-select"
                          aria-label={t(
                            'lumen.adminMediaLibraries.libraryTypeFor',
                            'Library Type for {name}',
                            { name: library.name }
                          )}
                          value={library.type}
                          disabled={busy}
                          onChange={(event) =>
                            reclassify(
                              library.id,
                              event.target.value as Library['type']
                            )
                          }
                        >
                          <option value="music">
                            {t('lumen.adminMediaLibraries.type.music', 'Music')}
                          </option>
                          <option value="book">
                            {t(
                              'lumen.adminMediaLibraries.audiobooks',
                              'Audiobooks'
                            )}
                          </option>
                        </select>
                      </label>
                    )}
                </div>
              ))}
            </div>
          </>
        ) : (
          !settings.error && (
            <p className="note" role="status">
              {t(
                'lumen.adminMediaLibraries.loadingLibraries',
                'Loading libraries…'
              )}
            </p>
          )
        )}
      </Section>
      <Section
        title={t('lumen.adminMediaLibraries.fullScan', 'Full Library Scan')}
      >
        <ServiceNote
          title={t(
            'lumen.adminMediaLibraries.scanStatusFailure',
            'Couldn’t Load Scan Status'
          )}
          error={scan.error}
          what={t('lumen.adminMediaLibraries.scanStatus', 'scan status')}
          retryLabel={t('lumen.common.retry', 'Retry')}
          retry={scan.reload}
        />
        {scanStatus && (
          <>
            <p className="note" role="status">
              {scanStatus.running
                ? t(
                    'lumen.adminMediaLibraries.scanning',
                    'Scanning{library} · {progress} of {total}',
                    {
                      library: scanStatus.currentLibrary
                        ? ` ${scanStatus.currentLibrary.name}`
                        : '',
                      progress: scanStatus.progress,
                      total: scanStatus.total,
                    }
                  )
                : t('lumen.adminMediaLibraries.noScan', 'No scan is running.')}
            </p>
            <div className="toolbar">
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy || scanStatus.running}
                onClick={() => changeScan('start')}
              >
                {t('lumen.adminMediaLibraries.startScan', 'Start Full Scan')}
              </button>
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy || !scanStatus.running}
                onClick={() => changeScan('cancel')}
              >
                {t('lumen.adminMediaLibraries.cancelScan', 'Cancel Scan')}
              </button>
            </div>
          </>
        )}
      </Section>
      {provider === 'plex' &&
        (tautulli.data ? (
          <MediaServerConnection
            provider="tautulli"
            name="Tautulli"
            initial={tautulli.data}
            busy={busy}
            setBusy={setBusy}
            pending={pending}
          />
        ) : (
          <ServiceNote
            title={t(
              'lumen.adminMediaLibraries.tautulliLoadFailure',
              'Couldn’t Load Tautulli Settings'
            )}
            error={tautulli.error}
            what={t(
              'lumen.adminMediaLibraries.tautulliSettings',
              'Tautulli settings'
            )}
            retryLabel={t('lumen.common.retry', 'Retry')}
            retry={tautulli.reload}
          />
        ))}
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
    </>
  );
}

export default function AdminMediaLibraries({
  mediaServerType,
}: { mediaServerType?: number } = {}) {
  const { t } = useLumenLocale();
  const settings = useApi<{ mediaServerType?: number }>(
    mediaServerType === undefined ? '/settings/public' : null
  );
  const type = mediaServerType ?? settings.data?.mediaServerType;
  const name = type === 1 || type === 2 || type === 3 ? names[type] : undefined;
  return (
    <>
      <header className="ph">
        <h1>
          {t('lumen.adminMediaLibraries.pageTitle', 'Media Server Libraries')}
        </h1>
        <div className="toolbar">
          <Link className="btn btn-quiet btn-sm" to="/admin">
            {t('lumen.adminMediaLibraries.administration', 'Administration')}
          </Link>
        </div>
      </header>
      <ServiceNote
        title={t(
          'lumen.adminMediaLibraries.loadSettingsFailure',
          'Couldn’t Load Media Server Settings'
        )}
        error={settings.error}
        what={t('lumen.adminMediaLibraries.settings', 'media server settings')}
        retryLabel={t('lumen.common.retry', 'Retry')}
        retry={settings.reload}
      />
      {name ? (
        <MediaLibraries
          key={name}
          name={name}
          provider={name === 'Plex' ? 'plex' : 'jellyfin'}
        />
      ) : mediaServerType !== undefined || settings.data ? (
        <p className="note">
          {t(
            'lumen.adminMediaLibraries.configureServer',
            'Configure a media server to manage its libraries.'
          )}
        </p>
      ) : (
        !settings.error && (
          <p className="note" role="status">
            {t(
              'lumen.adminMediaLibraries.loadingServer',
              'Loading media server…'
            )}
          </p>
        )
      )}
    </>
  );
}

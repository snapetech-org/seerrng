import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
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
const libraryTypes = {
  show: 'Series',
  movie: 'Movies',
  music: 'Music',
  book: 'Books',
};

function MediaLibraries({
  name,
  provider,
}: {
  name: string;
  provider: 'plex' | 'jellyfin';
}) {
  const path = `/settings/${provider}`;
  const settings = useApi<{ libraries: Library[] }>(path);
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
          friendlyError(error, 'Could not update media server settings.')
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function updateLibraries(body: object) {
    const generation = sessionGeneration();
    void run(async () => {
      const result = await api<Library[]>(`${path}/library`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (generation === sessionGeneration()) setUpdated(result);
    }, 'Library settings updated.');
  }

  function reclassify(id: string, type: Library['type']) {
    const generation = sessionGeneration();
    void run(async () => {
      const result = await api<Library[]>(
        `${path}/library/${encodeURIComponent(id)}/type`,
        {
          method: 'PUT',
          body: JSON.stringify({ type }),
        }
      );
      if (generation === sessionGeneration()) setUpdated(result);
    }, 'Library type updated.');
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
        ? 'Scan start requested.'
        : 'Scan cancellation requested.'
    );
  }

  return (
    <>
      <Section title={`${name} Libraries`}>
        <ServiceNote
          error={settings.error}
          what="media server libraries"
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
                Refresh Libraries
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
                Enable All
              </button>
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy || !enabled.length}
                onClick={() => updateLibraries({ enable: '' })}
              >
                Disable All
              </button>
            </div>
            {libraries.length === 0 && (
              <p className="note">
                No libraries found. Refresh the library list after configuring
                your server.
              </p>
            )}
            <div className="setlist">
              {libraries.map((library) => (
                <div className="set cfg-row" key={library.id}>
                  <span>
                    <b>{library.name}</b>
                    <small>
                      {provider === 'plex' && library.type === 'book'
                        ? 'Audiobooks'
                        : libraryTypes[library.type]}
                    </small>
                  </span>
                  <label className="cfg-on">
                    <input
                      type="checkbox"
                      aria-label={`Enable ${library.name}`}
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
                    Enabled
                  </label>
                  {library.type === 'show' && (
                    <label className="cfg-on">
                      Episode Order
                      <select
                        className="cfg-select"
                        aria-label={`Episode Order for ${library.name}`}
                        value={library.episodeOrderProvider ?? 'none'}
                        disabled={busy}
                        onChange={(event) =>
                          updateLibraries({
                            episodeOrderLibraryId: library.id,
                            episodeOrderProvider: event.target.value,
                          })
                        }
                      >
                        <option value="none">Automatic</option>
                        <option value="tmdb">TMDB</option>
                        <option value="tvdb">TVDB</option>
                      </select>
                    </label>
                  )}
                  {provider === 'plex' &&
                    (library.type === 'music' || library.type === 'book') && (
                      <label className="cfg-on">
                        Library Type
                        <select
                          className="cfg-select"
                          aria-label={`Library Type for ${library.name}`}
                          value={library.type}
                          disabled={busy}
                          onChange={(event) =>
                            reclassify(
                              library.id,
                              event.target.value as Library['type']
                            )
                          }
                        >
                          <option value="music">Music</option>
                          <option value="book">Audiobooks</option>
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
              Loading libraries…
            </p>
          )
        )}
      </Section>
      <Section title="Full Library Scan">
        <ServiceNote
          error={scan.error}
          what="scan status"
          retry={scan.reload}
        />
        {scanStatus && (
          <>
            <p className="note" role="status">
              {scanStatus.running
                ? `Scanning${scanStatus.currentLibrary ? ` ${scanStatus.currentLibrary.name}` : ''} · ${scanStatus.progress} of ${scanStatus.total}`
                : 'No scan is running.'}
            </p>
            <div className="toolbar">
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy || scanStatus.running}
                onClick={() => changeScan('start')}
              >
                Start Full Scan
              </button>
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy || !scanStatus.running}
                onClick={() => changeScan('cancel')}
              >
                Cancel Scan
              </button>
            </div>
          </>
        )}
      </Section>
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

export default function AdminMediaLibraries() {
  const settings = useApi<{ mediaServerType?: number }>('/settings/public');
  const type = settings.data?.mediaServerType;
  const name = type === 1 || type === 2 || type === 3 ? names[type] : undefined;
  return (
    <>
      <header className="ph">
        <h1>Media Server Libraries</h1>
        <div className="toolbar">
          <Link className="btn btn-quiet btn-sm" to="/me">
            Back to Account
          </Link>
        </div>
      </header>
      <ServiceNote
        error={settings.error}
        what="media server settings"
        retry={settings.reload}
      />
      {name ? (
        <MediaLibraries
          key={name}
          name={name}
          provider={name === 'Plex' ? 'plex' : 'jellyfin'}
        />
      ) : settings.data ? (
        <p className="note">
          Configure a media server to manage its libraries.
        </p>
      ) : (
        !settings.error && (
          <p className="note" role="status">
            Loading media server…
          </p>
        )
      )}
    </>
  );
}

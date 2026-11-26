import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type MusicServiceSummary } from '../api';
import { useAuth } from '../auth';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { hasAurralMusicService, type TrackRequestStatus } from '../extras';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

interface Track {
  recordingId: string;
  title: string;
  artist: string;
  isExact: boolean;
}

interface SongRun {
  id: string;
  status: string;
  summary?: string;
  stage?: string;
  percentComplete?: number;
  queuePosition?: number;
  albums: {
    releaseId: string;
    releaseGroupId?: string;
    title: string;
    artist: string;
    isExact: boolean;
  }[];
  tracks: Track[];
}

const finished = new Set(['completed', 'failed', 'cancelled']);

export default function SongIdentify() {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [source, setSource] = useState(() =>
    (params.get('source') ?? '').slice(0, 2048)
  );
  const [run, setRun] = useState<SongRun>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [requested, setRequested] = useState<string[]>([]);
  const working = useRef(false);
  const formatServiceError = useCallback(
    (failure: unknown, fallback: string) =>
      friendlyError(
        failure,
        t('lumen.songIdentify.availabilityFailure', fallback),
        (id, text) => t(id, text)
      ),
    [t]
  );
  const service = useApi<TrackRequestStatus>('/soulseek/status', {
    formatError: formatServiceError,
  });
  const musicServices = useApi<MusicServiceSummary[]>(
    user ? '/service/music' : null
  );
  const canRequest = service.data?.configured && service.data.canRequest;
  const running = !!run && !finished.has(run.status);

  useEffect(() => {
    if (!run || !running || pollError) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const next = await api<SongRun>(
          `/soulseek/songid/${encodeURIComponent(run.id)}`,
          {
            signal: controller.signal,
          }
        );
        if (!controller.signal.aborted) setRun(next);
      } catch (failure) {
        if (!controller.signal.aborted)
          setPollError(
            friendlyError(
              failure,
              t(
                'lumen.songIdentify.pollFailure',
                'Could not read identification progress.'
              ),
              (id, fallback) => t(id, fallback)
            )
          );
      }
    }, 3000);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [run, running, pollError]);

  async function start() {
    if (
      !canRequest ||
      !source.trim() ||
      working.current ||
      (running && !pollError)
    )
      return;
    working.current = true;
    setBusy(true);
    setError('');
    setPollError('');
    setRun(undefined);
    try {
      setRun(
        await api<SongRun>('/soulseek/songid', {
          method: 'POST',
          body: JSON.stringify({ source: source.trim() }),
        })
      );
      setRequested([]);
    } catch (failure) {
      setError(
        friendlyError(
          failure,
          t('lumen.songIdentify.startFailure', 'Song identification failed.'),
          (id, fallback) => t(id, fallback)
        )
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function requestTrack(track: Track) {
    if (!canRequest || working.current || requested.includes(track.recordingId))
      return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await api('/soulseek/track-requests', {
        method: 'POST',
        body: JSON.stringify({
          tracks: [
            {
              artist: track.artist,
              title: track.title,
              recordingMbid: track.recordingId,
              source: 'songid',
            },
          ],
        }),
      });
      setRequested((current) => [...current, track.recordingId]);
    } catch (failure) {
      setError(
        friendlyError(
          failure,
          t(
            'lumen.songIdentify.requestFailure',
            'The track could not be requested.'
          ),
          (id, fallback) => t(id, fallback)
        )
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  const identifying = running && !pollError;
  return (
    <>
      <header className="ph">
        <h1>{t('lumen.songIdentify.title', 'Identify a Song')}</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/track-requests">
          {t('lumen.songIdentify.trackRequests', 'Track Requests')}
        </Link>
      </div>
      <ServiceNote
        error={service.error}
        what={t(
          'lumen.songIdentify.availability',
          'song identification availability'
        )}
        title={t(
          'lumen.songIdentify.availabilityTitle',
          'Song identification is unavailable'
        )}
        retryLabel={t('lumen.songIdentify.retry', 'Retry')}
        retry={service.reload}
      />
      {service.data?.configured === false && (
        <p className="note">
          {hasAurralMusicService(musicServices.data, service.data)
            ? t(
                'lumen.songIdentify.unavailableAurral',
                'Song identification is unavailable until an administrator enables track requests in Aurral.'
              )
            : t(
                'lumen.songIdentify.requiresService',
                'Song identification requires an administrator to connect slskdN.'
              )}
        </p>
      )}
      {service.data?.configured && !service.data.canRequest && (
        <p className="note">
          {t(
            'lumen.songIdentify.requiresAccess',
            'Song identification requires track request access.'
          )}
        </p>
      )}
      {canRequest && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <label className="cfg-row">
            <span>
              {t('lumen.songIdentify.sourceLabel', 'Link or Description')}
            </span>
            <textarea
              className="cfg-input"
              rows={2}
              maxLength={2048}
              value={source}
              disabled={busy || identifying}
              onChange={(event) => setSource(event.target.value)}
            />
          </label>
          <div className="toolbar">
            <button
              className="btn btn-tonal"
              disabled={busy || identifying || !source.trim()}
            >
              {identifying
                ? t('lumen.songIdentify.identifying', 'Identifying…')
                : t('lumen.songIdentify.identify', 'Identify')}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      <ServiceNote
        error={pollError || null}
        what={t('lumen.songIdentify.progressName', 'identification progress')}
        title={t(
          'lumen.songIdentify.progressTitle',
          'Could not load identification progress'
        )}
        retryLabel={t('lumen.songIdentify.retry', 'Retry')}
        retry={() => setPollError('')}
      />
      {run && identifying && (
        <p className="note" role="status">
          {run.queuePosition
            ? t(
                'lumen.songIdentify.queuePosition',
                'Waiting in queue (position {position})',
                {
                  position: run.queuePosition,
                }
              )
            : `${run.stage ?? run.status} · ${Math.round(run.percentComplete ?? 0)}%`}
        </p>
      )}
      {run && !running && run.status !== 'completed' && (
        <p className="note" role="alert">
          {run.summary ??
            t('lumen.songIdentify.failed', 'Song identification failed.')}
        </p>
      )}
      {run?.status === 'completed' && (
        <>
          {!run.albums.length && !run.tracks.length && (
            <p className="note">
              {t(
                'lumen.songIdentify.noMatches',
                'No matching recordings were found.'
              )}
            </p>
          )}
          {!!run.albums.length && (
            <Section title={t('lumen.songIdentify.albums', 'Albums')}>
              <ul className="setlist">
                {run.albums.map((album) => (
                  <li className="set" key={album.releaseId}>
                    <div>
                      <b>{album.title}</b>
                      <small>
                        {album.artist}
                        {album.isExact
                          ? ` · ${t('lumen.songIdentify.exactMatch', 'Exact match')}`
                          : ''}
                      </small>
                    </div>
                    {album.releaseGroupId && (
                      <Link
                        className="btn btn-quiet btn-sm"
                        to={`/music/${encodeURIComponent(album.releaseGroupId)}`}
                      >
                        {t('lumen.songIdentify.openAlbum', 'Open Album')}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {!!run.tracks.length && (
            <Section title={t('lumen.songIdentify.tracks', 'Tracks')}>
              <ul className="setlist">
                {run.tracks.map((track) => (
                  <li className="set" key={track.recordingId}>
                    <div>
                      <b>{track.title}</b>
                      <small>
                        {track.artist}
                        {track.isExact
                          ? ` · ${t('lumen.songIdentify.exactMatch', 'Exact match')}`
                          : ''}
                      </small>
                    </div>
                    <button
                      className="btn btn-tonal btn-sm"
                      disabled={
                        busy ||
                        !canRequest ||
                        requested.includes(track.recordingId)
                      }
                      onClick={() => void requestTrack(track)}
                    >
                      {requested.includes(track.recordingId)
                        ? t(
                            'lumen.songIdentify.trackRequested',
                            'Track Requested'
                          )
                        : t('lumen.songIdentify.requestTrack', 'Request Track')}
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </>
  );
}

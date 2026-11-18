import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';

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
  const service = useApi<{ configured: boolean; canRequest: boolean }>(
    '/soulseek/status'
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
            friendlyError(failure, 'Could not read identification progress.')
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
      setError(friendlyError(failure, 'Song identification failed.'));
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
      setError(friendlyError(failure, 'The track could not be requested.'));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  const identifying = running && !pollError;
  return (
    <>
      <header className="ph">
        <h1>Identify a Song</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/track-requests">
          Track Requests
        </Link>
      </div>
      <ServiceNote
        error={service.error}
        what="song identification availability"
        retry={service.reload}
      />
      {service.data?.configured === false && (
        <p className="note">
          Song identification requires an administrator to connect slskdN.
        </p>
      )}
      {service.data?.configured && !service.data.canRequest && (
        <p className="note">
          Song identification requires track request access.
        </p>
      )}
      {canRequest && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <label className="sel">
            <span className="lbl">Link or Description</span>
            <textarea
              className="cfg-json"
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
              {identifying ? 'Identifying…' : 'Identify'}
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
        what="identification progress"
        retry={() => setPollError('')}
      />
      {run && identifying && (
        <p className="note" role="status">
          {run.queuePosition
            ? `Waiting in queue (position ${run.queuePosition})`
            : `${run.stage ?? run.status} · ${Math.round(run.percentComplete ?? 0)}%`}
        </p>
      )}
      {run && !running && run.status !== 'completed' && (
        <p className="note" role="alert">
          {run.summary ?? 'Song identification failed.'}
        </p>
      )}
      {run?.status === 'completed' && (
        <>
          {!run.albums.length && !run.tracks.length && (
            <p className="note">No matching recordings were found.</p>
          )}
          {!!run.albums.length && (
            <Section title="Albums">
              <ul className="setlist">
                {run.albums.map((album) => (
                  <li className="set" key={album.releaseId}>
                    <div>
                      <b>{album.title}</b>
                      <small>
                        {album.artist}
                        {album.isExact ? ' · Exact match' : ''}
                      </small>
                    </div>
                    {album.releaseGroupId && (
                      <Link
                        className="btn btn-quiet btn-sm"
                        to={`/music/${encodeURIComponent(album.releaseGroupId)}`}
                      >
                        Open Album
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {!!run.tracks.length && (
            <Section title="Tracks">
              <ul className="setlist">
                {run.tracks.map((track) => (
                  <li className="set" key={track.recordingId}>
                    <div>
                      <b>{track.title}</b>
                      <small>
                        {track.artist}
                        {track.isExact ? ' · Exact match' : ''}
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
                        ? 'Track Requested'
                        : 'Request Track'}
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

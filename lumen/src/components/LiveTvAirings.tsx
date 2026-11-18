import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLiveTvStatus } from '../liveTv';
import { ServiceNote } from './extra';
import { useDialog } from './useDialog';

interface Airing {
  channel: string;
  channelName: string;
  start: string;
  stop: string;
  title: string;
  subTitle?: string;
  season?: number;
  episode?: number;
}

interface Guide {
  configured: boolean;
  guideReady?: boolean;
  airings: Airing[];
}

interface Title {
  title?: string;
  original?: string;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
}

const dateTime = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const time = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

function airingTime(airing: Airing) {
  const start = new Date(airing.start);
  const end = new Date(airing.stop);
  return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
    ? `${dateTime.format(start)} – ${time.format(end)}`
    : '';
}

function AiringsSheet({
  title,
  query,
  canRequest,
  close,
}: {
  title: Title;
  query: string;
  canRequest: boolean;
  close: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const guide = useApi<Guide>(`/live-tv/airings?${query}`, {
    currentPathOnly: true,
  });
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState(new Set<string>());
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const dismiss = () => {
    if (!pending.current) close();
  };
  useDialog(dialog, dismiss);

  async function request(
    key: string,
    airing: Airing,
    kind: 'airing' | 'series'
  ) {
    if (!canRequest || pending.current || recorded.has(key)) return;
    pending.current = true;
    setBusy(true);
    setNotice(undefined);
    try {
      const result = await api<{ status: string }>('/live-tv/recordings', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          title: airing.title,
          mediaType: title.mediaType,
          tmdbId: title.tmdbId,
          ...(kind === 'airing'
            ? { channel: airing.channel, start: airing.start }
            : {}),
        }),
      });
      setRecorded((previous) => new Set(previous).add(key));
      setNotice({
        text:
          result.status === 'pending'
            ? 'Recording requested for approval.'
            : 'Recording scheduled.',
      });
    } catch (failure) {
      setNotice({
        text: friendlyError(failure, 'Could not request the recording.'),
        error: true,
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const airings = guide.data?.airings ?? [];
  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={dismiss} />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Live TV Airings"
        ref={dialog}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h3>Live TV Airings</h3>
            <p className="note">{title.title || title.original}</p>
          </header>
          <ServiceNote
            what="Live TV airings"
            error={guide.error}
            retry={guide.reload}
          />
          {!guide.data && !guide.error && (
            <p className="note" role="status">
              Checking the guide…
            </p>
          )}
          {guide.data?.configured === false && (
            <p className="note">Live TV is unavailable.</p>
          )}
          {guide.data?.configured && guide.data.guideReady === false && (
            <>
              <p className="note">The Live TV guide is not ready yet.</p>
              <div className="toolbar">
                <button
                  className="btn btn-tonal btn-sm"
                  type="button"
                  onClick={guide.reload}
                >
                  Check Again
                </button>
              </div>
            </>
          )}
          {guide.data?.guideReady && !airings.length && (
            <p className="note">No upcoming airings match this title.</p>
          )}
          {!!airings.length && !canRequest && (
            <p className="note">
              Your account can view airings but cannot request recordings.
            </p>
          )}
          {title.mediaType === 'tv' && airings[0] && canRequest && (
            <div className="toolbar">
              <button
                className="btn btn-tonal btn-sm"
                type="button"
                disabled={busy || recorded.has('series')}
                onClick={() => void request('series', airings[0], 'series')}
              >
                {recorded.has('series')
                  ? 'Series Request Submitted'
                  : 'Record Series'}
              </button>
            </div>
          )}
          {!!airings.length && (
            <div className="setlist">
              {airings.map((airing) => {
                const key = JSON.stringify([airing.channel, airing.start]);
                return (
                  <div className="set" key={key}>
                    <span>
                      <b>{airing.subTitle || airing.title}</b>
                      <small>
                        {airing.channelName || airing.channel} ·{' '}
                        {airingTime(airing)}
                      </small>
                      {airing.season !== undefined &&
                        airing.episode !== undefined && (
                          <small>
                            Season {airing.season}, Episode {airing.episode}
                          </small>
                        )}
                    </span>
                    {canRequest && (
                      <button
                        className="btn btn-tonal btn-sm"
                        type="button"
                        disabled={busy || recorded.has(key)}
                        onClick={() => void request(key, airing, 'airing')}
                      >
                        {recorded.has(key)
                          ? 'Request Submitted'
                          : 'Record Airing'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {notice && (
            <p className="note" role={notice.error ? 'alert' : 'status'}>
              {notice.text}
            </p>
          )}
          <div className="toolbar">
            {!busy && (
              <Link
                className="btn btn-tonal btn-sm"
                to="/recordings"
                onClick={dismiss}
              >
                View Recordings
              </Link>
            )}
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              disabled={busy}
              onClick={dismiss}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function LiveTvAirings(title: Title) {
  const status = useLiveTvStatus();
  const [open, setOpen] = useState(false);
  const names = [
    ...new Set(
      [title.title, title.original].flatMap((name) => {
        const value = name?.trim();
        return value && value.length <= 300 ? [value] : [];
      })
    ),
  ];
  if (!status.data?.configured || !names.length) return null;
  const query = new URLSearchParams({ limit: '10' });
  names.forEach((name) => query.append('title', name));
  return (
    <>
      <button
        className="btn btn-tonal btn-sm"
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Find Live TV Airings
      </button>
      {open && (
        <AiringsSheet
          title={title}
          query={query.toString()}
          canRequest={status.data.canRequest}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Section } from '../components/cards';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';

interface PlaylistItem {
  id: string;
  title: string;
  artist?: string;
  sourceTitle: string;
  sourceArtist?: string;
  matchStatus: 'matched' | 'unmatched' | 'ambiguous';
  matchReason?: string;
}

interface Playlist {
  name: string;
  totalItems: number;
  items: PlaylistItem[];
}

export default function PlaylistImport() {
  const [url, setUrl] = useState('');
  const [playlist, setPlaylist] = useState<Playlist>();
  const [selected, setSelected] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState<number[]>([]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const soulseek = useApi<{ configured: boolean; canRequest: boolean }>(
    '/soulseek/status'
  );
  const spotify = useApi<{ connected: boolean; displayName: string | null }>(
    '/playlist/spotify/status'
  );

  function requestable(item: PlaylistItem) {
    return (
      item.matchStatus === 'matched' ||
      (item.matchStatus === 'unmatched' &&
        !!item.artist &&
        !!soulseek.data?.configured &&
        soulseek.data.canRequest)
    );
  }

  async function preview() {
    if (working.current || !url.trim()) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      setPlaylist(
        await api<Playlist>('/playlist/resolve', {
          method: 'POST',
          body: JSON.stringify({ url: url.trim() }),
        })
      );
      setSelected([]);
      setSubmitted([]);
      setErrors({});
    } catch (failure) {
      setError(friendlyError(failure, 'The playlist could not be resolved.'));
    } finally {
      setBusy(false);
      working.current = false;
    }
  }

  async function submit() {
    if (working.current || !playlist || !selected.length) return;
    working.current = true;
    setBusy(true);
    setErrors({});
    try {
      for (const index of selected) {
        const item = playlist.items[index];
        if (!item || !requestable(item) || submitted.includes(index)) continue;
        const matched = item.matchStatus === 'matched';
        try {
          await api(matched ? '/request' : '/soulseek/track-requests', {
            method: 'POST',
            body: JSON.stringify(
              matched
                ? { mediaType: 'music', mediaId: item.id }
                : {
                    tracks: [
                      {
                        title: item.title,
                        artist: item.artist,
                        source: 'playlist',
                      },
                    ],
                  }
            ),
          });
          setSubmitted((current) => [...current, index]);
          setSelected((current) => current.filter((value) => value !== index));
        } catch (failure) {
          setErrors((current) => ({
            ...current,
            [index]: friendlyError(failure, 'Could not submit this request.'),
          }));
        }
      }
    } finally {
      setBusy(false);
      working.current = false;
    }
  }

  return (
    <>
      <header className="ph">
        <h1>Import Playlist</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/music">
          Back to Music
        </Link>
        <a
          className="btn btn-quiet btn-sm"
          href="/api/v1/playlist/spotify/connect"
        >
          {spotify.data?.connected ? 'Reconnect Spotify' : 'Connect Spotify'}
        </a>
        {spotify.data?.displayName && <span>{spotify.data.displayName}</span>}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void preview();
        }}
      >
        <label className="sel">
          <span className="lbl">Spotify or YouTube Playlist URL</span>
          <input
            className="cfg-json"
            type="url"
            maxLength={2048}
            value={url}
            disabled={busy}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <div className="toolbar">
          <button className="btn btn-tonal" disabled={busy || !url.trim()}>
            Preview Matches
          </button>
        </div>
      </form>
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {playlist && (
        <Section title={playlist.name}>
          <p className="note">
            {playlist.totalItems} tracks in the source playlist
          </p>
          {!playlist.items.length && (
            <p className="note">No matches to review.</p>
          )}
          {!!playlist.items.length && (
            <ul className="setlist">
              {playlist.items.map((item, index) => (
                <li className="set" key={index}>
                  <div>
                    <b>{item.title}</b>
                    <small>{item.artist}</small>
                    <small>
                      {item.sourceTitle}
                      {item.sourceArtist ? ` · ${item.sourceArtist}` : ''}
                    </small>
                    <small>{item.matchReason ?? item.matchStatus}</small>
                    {errors[index] && (
                      <small role="alert">{errors[index]}</small>
                    )}
                  </div>
                  {submitted.includes(index) ? (
                    <small>Requested</small>
                  ) : (
                    requestable(item) && (
                      <label>
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={selected.includes(index)}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setSelected((current) =>
                              checked
                                ? [...current, index]
                                : current.filter((value) => value !== index)
                            );
                          }}
                        />
                        {item.matchStatus === 'matched'
                          ? 'Request Album'
                          : 'Request Track'}
                      </label>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="toolbar">
            <button
              className="btn btn-tonal"
              disabled={busy || !selected.length}
              onClick={() => void submit()}
            >
              Request Selected ({selected.length})
            </button>
            <Link to="/track-requests" className="btn btn-quiet btn-sm">
              Track Requests
            </Link>
          </div>
        </Section>
      )}
    </>
  );
}

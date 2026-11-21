import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Section } from '../components/cards';
import { embedded } from '../deployment';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

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
  const { t } = useLumenLocale();
  const [params, setParams] = useSearchParams();
  const [spotifyNotice, setSpotifyNotice] = useState('');
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

  async function disconnectSpotify() {
    if (working.current || !spotify.data?.connected) return;
    working.current = true;
    setBusy(true);
    setError('');
    setSpotifyNotice('');
    try {
      await api('/playlist/spotify/disconnect', { method: 'POST' });
      spotify.reload();
      const next = new URLSearchParams(params);
      next.delete('playlist');
      setParams(next, { replace: true });
      setSpotifyNotice(
        t('lumen.playlist.disconnected', 'Spotify disconnected.')
      );
    } catch (failure) {
      setError(
        friendlyError(
          failure,
          t(
            'lumen.playlist.disconnectFailure',
            'Spotify could not be disconnected.'
          )
        )
      );
    } finally {
      setBusy(false);
      working.current = false;
    }
  }

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
      setError(
        friendlyError(
          failure,
          t(
            'lumen.playlist.resolveFailure',
            'The playlist could not be resolved.'
          )
        )
      );
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
            [index]: friendlyError(
              failure,
              t(
                'lumen.playlist.requestFailure',
                'Could not submit this request.'
              )
            ),
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
        <h1>{t('lumen.playlist.title', 'Import Playlist')}</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/music">
          {t('lumen.playlist.backToMusic', 'Back to Music')}
        </Link>
        <a
          className="btn btn-quiet btn-sm"
          href={`/api/v1/playlist/spotify/connect?frontend=${embedded ? 'bundled' : 'companion'}`}
        >
          {spotify.data?.connected
            ? t('lumen.playlist.reconnect', 'Reconnect Spotify')
            : t('lumen.playlist.connect', 'Connect Spotify')}
        </a>
        {spotify.data?.connected && (
          <button
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={() => void disconnectSpotify()}
          >
            {t('lumen.playlist.disconnect', 'Disconnect Spotify')}
          </button>
        )}
        {spotify.data?.displayName && <span>{spotify.data.displayName}</span>}
      </div>
      {spotifyNotice && (
        <p className="note" role="status">
          {spotifyNotice}
        </p>
      )}
      {params.get('playlist') === 'connected' && spotify.data?.connected && (
        <p className="note" role="status">
          {t('lumen.playlist.connected', 'Spotify connected.')}
        </p>
      )}
      {params.get('playlist') === 'error' && (
        <p className="note" role="alert">
          {t(
            'lumen.playlist.connectFailure',
            'Spotify could not be connected.'
          )}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void preview();
        }}
      >
        <label className="sel">
          <span className="lbl">
            {t('lumen.playlist.urlLabel', 'Spotify or YouTube Playlist URL')}
          </span>
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
            {t('lumen.playlist.preview', 'Preview Matches')}
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
            {t(
              'lumen.playlist.sourceCount',
              '{count} tracks in the source playlist',
              { count: playlist.totalItems }
            )}
          </p>
          {!playlist.items.length && (
            <p className="note">
              {t('lumen.playlist.noMatches', 'No matches to review.')}
            </p>
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
                    <small>
                      {item.matchReason ??
                        t(
                          `lumen.playlist.match.${item.matchStatus}`,
                          item.matchStatus
                        )}
                    </small>
                    {errors[index] && (
                      <small role="alert">{errors[index]}</small>
                    )}
                  </div>
                  {submitted.includes(index) ? (
                    <small>{t('lumen.playlist.requested', 'Requested')}</small>
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
                          ? t('lumen.playlist.requestAlbum', 'Request Album')
                          : t('lumen.playlist.requestTrack', 'Request Track')}
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
              {t(
                'lumen.playlist.requestSelected',
                'Request Selected ({count})',
                { count: selected.length }
              )}
            </button>
            <Link to="/track-requests" className="btn btn-quiet btn-sm">
              {t('lumen.playlist.trackRequests', 'Track Requests')}
            </Link>
          </div>
        </Section>
      )}
    </>
  );
}

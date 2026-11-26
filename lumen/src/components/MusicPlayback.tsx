import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MusicServiceSummary } from '../api';
import { useAuth } from '../auth';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import {
  aurralBaseUrl,
  AVAILABLE_MUSIC_PLAYERS,
  MUSIC_PLAYERS,
  openPlayer,
  playLink,
  previewKey,
  stopPreview,
  togglePreview,
  usePreview,
  usePreviewStatus,
  type MusicPlayer,
  type PlayableTrack,
  type PlayTarget,
} from '../musicPlayback';
import { usePrefs } from '../settings';
import { Cover } from './cards';
import { useDialog } from './useDialog';

// Where Play goes for this person, and whether that app is reachable.
export function useMusicPlayer() {
  const { user } = useAuth();
  const { prefs, set } = usePrefs();
  const services = useApi<MusicServiceSummary[]>(
    user ? '/service/music' : null
  );
  const aurralBase = aurralBaseUrl(services.data);
  const chosen: MusicPlayer = AVAILABLE_MUSIC_PLAYERS.includes(
    prefs.musicPlayer
  )
    ? prefs.musicPlayer
    : 'aurral';
  // no Aurral to open (a Lidarr setup): Play searches Plex instead
  const player: MusicPlayer =
    chosen === 'aurral' && services.data && !aurralBase ? 'plex' : chosen;
  const linkFor = (target: PlayTarget) => playLink(player, target, aurralBase);
  return {
    player,
    previews: prefs.musicPreviews,
    aurralBase,
    linkFor,
    play: (target: PlayTarget) => {
      const url = linkFor(target);
      if (url) openPlayer(url);
    },
    setPlayer: (value: MusicPlayer) => set('musicPlayer', value),
    setPreviews: (value: boolean) => set('musicPreviews', value),
  };
}

const playerName = (
  player: MusicPlayer,
  t: ReturnType<typeof useLumenLocale>['t']
) =>
  player === 'plex'
    ? 'Plex'
    : player === 'shelf'
      ? t('lumen.music.player.shelf', 'Shelf app')
      : 'Aurral';

export function PlayOpensIn() {
  const { t } = useLumenLocale();
  const { player } = useMusicPlayer();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="chip play-opens"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <Icon name="play" size="sm" />
        {t('lumen.music.playOpensIn', 'Play opens in: {app}', {
          app: playerName(player, t),
        })}
      </button>
      {open && <PlayOpensInSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function PlayOpensInSheet({ onClose }: { onClose: () => void }) {
  const { t } = useLumenLocale();
  const box = useRef<HTMLDivElement>(null);
  useDialog(box, onClose);
  const { player, previews, setPlayer, setPreviews, aurralBase } =
    useMusicPlayer();
  const help: Record<MusicPlayer, string> = {
    aurral: aurralBase
      ? t(
          'lumen.music.player.aurralHelp',
          'Opens the song or album in Aurral. Every Play reuses one Aurral tab, so music keeps playing while you browse.'
        )
      : t(
          'lumen.music.player.aurralMissing',
          'Aurral has no web address in SeerrNG yet.'
        ),
    plex: t(
      'lumen.music.player.plexHelp',
      'Searches for it in Plex, in the same reused tab.'
    ),
    shelf: t(
      'lumen.music.player.shelfHelp',
      'The Shelf phone app. Coming once the app can open links.'
    ),
  };
  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={box}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('lumen.music.whenYouPressPlay', 'When you press Play')}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h3>{t('lumen.music.whenYouPressPlay', 'When you press Play')}</h3>
            <span className="sub">
              {t(
                'lumen.music.playHandoff',
                'Lumen hands songs you have to your music app. Saved for your account.'
              )}
            </span>
          </header>
          <div
            className="setlist play-picker"
            role="radiogroup"
            aria-label={t('lumen.music.musicApp', 'Music app')}
          >
            {MUSIC_PLAYERS.map((value) => {
              const available = AVAILABLE_MUSIC_PLAYERS.includes(value);
              return (
                <label
                  className="set"
                  key={value}
                  aria-disabled={!available}
                  aria-label={playerName(value, t)}
                >
                  <span>
                    <b>
                      {playerName(value, t)}
                      {!available && (
                        <span className="badge-soon">
                          {t('lumen.music.comingSoon', 'Coming')}
                        </span>
                      )}
                    </b>
                    <small>{help[value]}</small>
                  </span>
                  <input
                    type="radio"
                    name="music-player"
                    value={value}
                    checked={player === value}
                    disabled={!available}
                    onChange={() => void setPlayer(value)}
                  />
                </label>
              );
            })}
          </div>
          <div className="setlist">
            <label
              className="set cfg-row"
              aria-label={t('lumen.music.previews', '30-second previews')}
            >
              <span>
                <b>{t('lumen.music.previews', '30-second previews')}</b>
                <small>
                  {t(
                    'lumen.music.previewsHelp',
                    'Hear songs you don’t have yet before you get them.'
                  )}
                </small>
              </span>
              <input
                type="checkbox"
                checked={previews}
                onChange={(event) => {
                  if (!event.target.checked) stopPreview();
                  void setPreviews(event.target.checked);
                }}
              />
            </label>
          </div>
          <div className="pk-foot">
            <button
              className="btn btn-primary"
              data-autofocus
              onClick={onClose}
            >
              {t('lumen.common.done', 'Done')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function PreviewButton({
  track,
  cover,
}: {
  track: PlayableTrack;
  cover?: string | null;
}) {
  const { t } = useLumenLocale();
  const status = usePreviewStatus(previewKey(track));
  const playing = status === 'playing';
  const loading = status === 'loading';
  const missing = status === 'missing';
  const label = playing
    ? t('lumen.music.pausePreview', 'Pause preview of {title}', {
        title: track.title,
      })
    : t('lumen.music.playPreview', 'Preview {title}', { title: track.title });
  return (
    <button
      type="button"
      className={playing ? 'btn-icon preview-btn on' : 'btn-icon preview-btn'}
      aria-label={label}
      title={
        missing
          ? t('lumen.music.noPreview', 'No preview for this song')
          : t('lumen.music.preview30', '30-second preview')
      }
      aria-pressed={playing}
      disabled={missing}
      aria-busy={loading}
      onClick={() => togglePreview(track, cover)}
    >
      <Icon name={playing ? 'pause' : 'play'} size="sm" />
    </button>
  );
}

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// One preview at a time, pinned to the bottom of the page while it plays.
export function MusicPreviewBar() {
  const { t } = useLumenLocale();
  const preview = usePreview();
  if (!preview.key || !preview.track) return null;
  const track = preview.track;
  const pct = Math.min(
    100,
    Math.round((preview.position / (preview.duration || 30)) * 100)
  );
  return (
    <div
      className="preview-bar"
      role="region"
      aria-label={t('lumen.music.previewPlayer', 'Preview player')}
    >
      <span className="preview-art">
        <Cover
          src={preview.cover ?? undefined}
          title={track.title}
          icon="music"
        />
      </span>
      <span className="preview-meta">
        <b>{preview.title}</b>
        <small>
          {preview.status === 'missing'
            ? t('lumen.music.noPreview', 'No preview for this song')
            : [preview.artistName, t('lumen.music.previewWord', 'Preview')]
                .filter(Boolean)
                .join(' · ')}
        </small>
      </span>
      <PreviewButton track={track} cover={preview.cover} />
      <span className="preview-time">{clock(preview.position)}</span>
      <span
        className="preview-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={t('lumen.music.previewProgress', 'Preview progress')}
      >
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="preview-time">{clock(preview.duration)}</span>
      <button
        type="button"
        className="btn-icon"
        aria-label={t('lumen.music.closePreview', 'Close preview')}
        onClick={stopPreview}
      >
        <Icon name="x" size="sm" />
      </button>
    </div>
  );
}

export function PlayButton({
  target,
  label,
  className = 'btn btn-primary btn-sm',
}: {
  target: PlayTarget;
  label?: string;
  className?: string;
}) {
  const { t } = useLumenLocale();
  const { linkFor, player } = useMusicPlayer();
  const url = linkFor(target);
  if (!url) return null;
  const name =
    target.kind === 'track'
      ? target.track.title
      : target.kind === 'album'
        ? target.album.title
        : target.artist.name;
  return (
    <a
      className={className}
      href={url}
      target="lumen-music-player"
      rel="noreferrer"
      aria-label={t('lumen.music.playIn', 'Play {title} in {app}', {
        title: name,
        app: playerName(player, t),
      })}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        openPlayer(url);
      }}
    >
      <Icon name="play" size="sm" />
      {label ?? t('lumen.music.play', 'Play')}
    </a>
  );
}

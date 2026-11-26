import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  artUrl,
  MediaStatus,
  strictQuery,
  type Paged,
  type RequestItem,
} from '../api';
import { markAllStale } from '../apiCache';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import {
  fmtTrack,
  requestExtra,
  type AurralAlbum,
  type AurralArtist,
  type AurralTopResult,
  type AurralTrack,
  type TrackRequestItem,
} from '../extras';
import { cachedApi, useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import {
  albumDownloadKeysFor,
  downloadKeysFor,
  isAlbumDownloading,
  isAlbumRequested,
  isSongDownloading,
  isSongRequested,
  markSongsRequested,
  MusicDownloadsContext,
  notifyMusicDownloadsCompleted,
  setServerRequestedSongs,
  songKey,
  unmarkSongs,
  useDownloadingSongs,
  useRequestedSongs,
} from '../musicState';
import { Cover, Section, type Stat } from './cards';
import { canRequestMusic, Pill } from './detail';
import { ExtraCard, extraStat, RequestButton, StatPill } from './extra';
import {
  usePolledApi,
  type ActivityItem,
  type LibraryAlbum,
  type MusicActivity,
} from './MusicHome';
import { PlayButton, PreviewButton, useMusicPlayer } from './MusicPlayback';
import { useToast } from './toast';

export interface MusicLibraryOverview {
  totalAlbums: number | null;
  recentlyAdded: LibraryAlbum[];
  downloadingCount: number;
}

// Library summary (album count, newest albums with covers), refreshed while open.
export function useMusicLibrary(enabled = true) {
  const overview = usePolledApi<MusicLibraryOverview>(
    enabled ? '/music/library-overview' : null,
    30000
  );
  return { ...overview, data: normalizeOverview(overview.data) };
}

// What Aurral is downloading, in order, refreshed every 10 seconds while open.
export function useMusicActivity(enabled = true) {
  const activity = usePolledApi<MusicActivity>(
    enabled ? '/music/activity' : null,
    10000
  );
  return { ...activity, data: normalizeActivity(activity.data) };
}

const arr = <T,>(value: unknown): T[] => (Array.isArray(value) ? value : []);

// Older SeerrNG builds (or a failed answer) may not have these shapes.
const normalizeOverview = (value: unknown): MusicLibraryOverview | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MusicLibraryOverview>;
  return {
    totalAlbums: typeof raw.totalAlbums === 'number' ? raw.totalAlbums : null,
    recentlyAdded: arr<LibraryAlbum>(raw.recentlyAdded),
    downloadingCount:
      typeof raw.downloadingCount === 'number' ? raw.downloadingCount : 0,
  };
};

const normalizeActivity = (value: unknown): MusicActivity | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MusicActivity>;
  return {
    active: arr<ActivityItem>(raw.active),
    queued: arr<ActivityItem>(raw.queued),
    queuedTotal: typeof raw.queuedTotal === 'number' ? raw.queuedTotal : 0,
    recent: arr<ActivityItem>(raw.recent),
    failed: arr<ActivityItem>(raw.failed),
    failedTotal: typeof raw.failedTotal === 'number' ? raw.failedTotal : 0,
    albums: arr<NonNullable<MusicActivity['albums']>[number]>(raw.albums),
  };
};

export const downloadingKeys = (activity?: MusicActivity | null) =>
  new Set([
    ...[...(activity?.active ?? []), ...(activity?.queued ?? [])].flatMap(
      (item) => downloadKeysFor(item)
    ),
    ...(activity?.albums ?? []).flatMap((album) => albumDownloadKeysFor(album)),
  ]);

// Pages that show song lists poll downloads once and share the answer.
export function MusicDownloadsProvider({
  activity,
  enabled = true,
  children,
}: {
  activity?: MusicActivity | null;
  enabled?: boolean;
  children: ReactNode;
}) {
  useServerSongRequests(enabled);
  const own = useMusicActivity(enabled && activity === undefined);
  const data = activity === undefined ? own.data : activity;
  const keys = useMemo(() => downloadingKeys(data), [data]);
  // a song or album that left the downloading set finished (or failed): the
  // lists showing it ask again, so the row turns into Play without a reload
  const previous = useRef<Set<string> | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = keys;
    if (!before) return;
    for (const key of before)
      if (!keys.has(key)) {
        // saved answers (search, charts, artist and album pages) predate it
        markAllStale();
        notifyMusicDownloadsCompleted();
        return;
      }
  }, [keys]);
  return (
    <MusicDownloadsContext.Provider value={keys}>
      {children}
    </MusicDownloadsContext.Provider>
  );
}

type RequestedSongKeys = {
  active?: { artist: string; title: string; recordingMbid?: string }[];
  completed?: { artist: string; title: string; recordingMbid?: string }[];
};

type OpenTrackRequests = {
  results?: {
    artist: string;
    title: string;
    recordingMbid?: string;
    status?: string;
    updatedAt?: string;
  }[];
};

// A song whose request just finished stays "requested" this long, so it never
// flashes back to Get before the library (and the page) shows it as owned.
const COMPLETED_GRACE_MS = 10 * 60_000;

export const recordingRequestKey = (recordingMbid: string) =>
  `mbid:${recordingMbid.toLowerCase()}`;

// Songs asked for earlier still show as requested after a reload: the server's open track
// requests (everyone's when you may see them, else yours) seed the shared requested set.
// Each answer replaces the last, so a request that failed or was cancelled drops out.
export function useServerSongRequests(enabled = true) {
  // every open request (anyone's, without who asked) and the ones that just
  // finished, in one answer; older servers only have the paged list
  const keys = useApi<RequestedSongKeys>(
    enabled ? '/music/track-requests/keys' : null
  );
  // an older server: no such list (an error, or an answer without the list)
  const fallback =
    Boolean(keys.error) ||
    (keys.data != null && !Array.isArray(keys.data.active));
  const { data } = useApi<OpenTrackRequests>(
    enabled && fallback
      ? '/music/track-requests?scope=all&filter=active&take=100'
      : null
  );
  // the newest requests of any state: ones that completed a moment ago
  const { data: recent } = useApi<OpenTrackRequests>(
    enabled && fallback ? '/music/track-requests?scope=all&take=50' : null
  );
  const keyData = keys.data;
  useEffect(() => {
    if (!keyData?.active) return;
    setServerRequestedSongs(
      [...keyData.active, ...(keyData.completed ?? [])].flatMap((request) => [
        songKey(request.artist, request.title),
        ...(request.recordingMbid
          ? [recordingRequestKey(request.recordingMbid)]
          : []),
      ])
    );
  }, [keyData]);
  const results = data?.results;
  const recentResults = recent?.results;
  useEffect(() => {
    if (!results) return;
    const cutoff = Date.now() - COMPLETED_GRACE_MS;
    const justCompleted = (recentResults ?? []).filter(
      (request) =>
        request.status === 'completed' &&
        request.updatedAt !== undefined &&
        Date.parse(request.updatedAt) >= cutoff
    );
    setServerRequestedSongs(
      [...results, ...justCompleted].flatMap((request) => [
        songKey(request.artist, request.title),
        ...(request.recordingMbid
          ? [recordingRequestKey(request.recordingMbid)]
          : []),
      ])
    );
  }, [results, recentResults]);
}

export const songRequestKey = (track: AurralTrack) =>
  `${track.artistName}::${track.albumMbid ?? track.albumTitle ?? ''}::${track.title}`.toLowerCase();

const artistHref = (artist: AurralArtist) =>
  artist.mbid
    ? `/artist/${encodeURIComponent(artist.mbid)}`
    : `/music?q=${encodeURIComponent(artist.name)}`;

const albumHref = (album: AurralAlbum) =>
  album.mbid
    ? `/music/${encodeURIComponent(album.mbid)}`
    : `/music?q=${encodeURIComponent([album.artistName, album.title].filter(Boolean).join(' '))}`;

const albumLinkForTrack = (track: AurralTrack) =>
  track.albumMbid
    ? `/music/${encodeURIComponent(track.albumMbid)}`
    : track.albumTitle
      ? `/music?q=${encodeURIComponent([track.artistName, track.albumTitle].filter(Boolean).join(' '))}`
      : null;

const artistLinkForTrack = (track: AurralTrack) =>
  track.artistMbid
    ? `/artist/${encodeURIComponent(track.artistMbid)}`
    : track.artistName
      ? `/music?q=${encodeURIComponent(track.artistName)}`
      : null;

export async function postSingleTrackRequest(track: AurralTrack) {
  return api<{ results?: { status?: string }[] }>('/music/track-requests', {
    method: 'POST',
    body: JSON.stringify({
      tracks: [
        {
          title: track.title,
          artist: track.artistName || 'Unknown Artist',
          albumMbid: track.albumMbid || undefined,
          albumName: track.albumTitle || undefined,
          artistMbid: track.artistMbid || undefined,
          durationMs:
            track.durationMs && track.durationMs > 0
              ? track.durationMs
              : undefined,
          source: 'album',
        },
      ],
    }),
  });
}

// The year of a release date. Library files sometimes carry a two-digit year
// ("17-11-10"), which is read as this century unless that would be in the future.
export function releaseYear(date: string | null | undefined): string {
  const value = (date || '').trim();
  const full = value.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
  if (full) return full[1];
  const short = value.match(/^(\d{2})-\d{1,2}(?:-\d{1,2})?$/);
  if (!short) return '';
  const year = 2000 + Number(short[1]);
  return String(year > new Date().getFullYear() ? year - 100 : year);
}

/**
 * One album's state, the same on every card, the top result and the album
 * page: in library, blocklisted, downloading (Aurral is working through its
 * songs), requested (an open request, a one-tap Get here, or a single whose
 * only song was asked for), partly in library, or nothing.
 */
export function useAlbumStat(album: {
  mbid?: string | null;
  title?: string | null;
  artistName?: string | null;
  primaryType?: string | null;
  inLibrary?: boolean;
  partial?: boolean;
  requested?: boolean;
  blocklisted?: boolean;
  libraryTrackCount?: number;
  libraryAvailableTrackCount?: number;
  mediaInfo?: AurralAlbum['mediaInfo'];
}): Stat {
  const { t } = useLumenLocale();
  useRequestedSongs();
  const downloading = useDownloadingSongs();
  if (album.inLibrary)
    return {
      k: 'ok',
      word: t('lumen.status.inLibrary', 'In library'),
      ico: 'check',
    };
  if (album.blocklisted || album.mediaInfo?.status === MediaStatus.BLOCKLISTED)
    return {
      k: 'wait',
      word: t('lumen.status.blocklisted', 'Blocklisted'),
      ico: 'lock',
    };
  const fromMedia = extraStat(album.mediaInfo);
  const open =
    album.requested === true ||
    isAlbumRequested(album.mbid) ||
    (fromMedia !== null && fromMedia.k !== 'ok') ||
    // a single is its song: asking for the song asks for the single
    (album.primaryType?.toLowerCase() === 'single' &&
      isSongRequested(songKey(album.artistName, album.title)));
  if (
    (open || album.partial) &&
    isAlbumDownloading(downloading, {
      mbid: album.mbid,
      title: album.title,
      artistName: album.artistName,
    })
  )
    return {
      k: 'dl',
      word: t('lumen.status.downloading', 'Downloading'),
      ico: 'down',
    };
  if (open && fromMedia && fromMedia.k !== 'ok') return fromMedia;
  if (open)
    return {
      k: 'wait',
      word: t('lumen.status.requested', 'Requested'),
      ico: 'clock',
    };
  if (album.mediaInfo?.status === MediaStatus.AVAILABLE && !album.partial)
    return {
      k: 'ok',
      word: t('lumen.status.inLibrary', 'In library'),
      ico: 'check',
    };
  if (album.partial || fromMedia?.k === 'ok')
    return {
      k: 'ok',
      word:
        album.libraryTrackCount && album.libraryAvailableTrackCount
          ? t('lumen.music.partOwned', '{owned} of {total} songs', {
              owned: album.libraryAvailableTrackCount,
              total: album.libraryTrackCount,
            })
          : t('lumen.music.partlyOwned', 'Partly in library'),
      ico: 'check',
    };
  return null;
}

export function AurralAlbumCard({ album }: { album: AurralAlbum }) {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const canGet = Boolean(album.mbid) && canRequestMusic(user?.permissions);
  const stat = useAlbumStat(album);

  return (
    <ExtraCard
      href={albumHref(album)}
      img={albumArt(album.coverUrl, album.mbid, album.artistName, album.title)}
      title={album.title}
      shape="sq"
      titleKind="album"
      icon="music"
      stat={stat}
      watchlist={
        album.mbid ? { mediaType: 'music', id: album.mbid } : undefined
      }
      quick={
        canGet
          ? {
              label: t('lumen.music.getAlbumNamed', 'Get {title}', {
                title: album.title,
              }),
              action: t('lumen.music.get', 'Get'),
              run: () => requestExtra('music', album.mbid!),
            }
          : undefined
      }
      meta={[album.artistName, releaseYear(album.releaseDate)]
        .filter(Boolean)
        .join(' · ')}
      metaHref={
        album.artistMbid
          ? `/artist/${encodeURIComponent(album.artistMbid)}`
          : album.artistName && album.artistName !== 'Various Artists'
            ? `/music?q=${encodeURIComponent(album.artistName)}`
            : undefined
      }
    />
  );
}

// An artist photo: what the list gave us, or the server's lookup by id and name.
export const artistArt = (
  image: string | null | undefined,
  mbid: string | null | undefined,
  name: string
) =>
  image ||
  (mbid
    ? strictQuery(
        `/api/v1/music/artist-image/${encodeURIComponent(mbid)}?name=${encodeURIComponent(name)}`
      )
    : undefined);

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

export function ArtistAvatar({
  image,
  mbid,
  name,
}: {
  image?: string | null;
  mbid?: string | null;
  name: string;
}) {
  const wanted = artUrl(artistArt(image, mbid, name));
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [wanted]);
  return wanted && !failed ? (
    <img
      loading="lazy"
      decoding="async"
      src={wanted}
      referrerPolicy="no-referrer"
      alt=""
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="music-avatar-initials" aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

// Every artist in a row or grid looks the same: a round photo and the name.
export function ArtistCircle({
  name,
  mbid,
  image,
  sub,
  inLibrary = false,
}: {
  name: string;
  mbid: string | null;
  image: string | null;
  sub?: string | null;
  // the library has songs by this artist
  inLibrary?: boolean;
}) {
  const { t } = useLumenLocale();
  const href = artistHref({ name, mbid } as AurralArtist);
  const state = { name, image: artistArt(image, mbid, name) };
  return (
    <div className="music-circle">
      <Link
        className="music-circle-art"
        to={href}
        state={state}
        aria-label={name}
      >
        <ArtistAvatar image={image} mbid={mbid} name={name} />
      </Link>
      <Link
        className="music-circle-name"
        to={href}
        state={state}
        tabIndex={-1}
        aria-hidden="true"
      >
        {name}
      </Link>
      {sub ? (
        <small>{sub}</small>
      ) : inLibrary ? (
        <small className="music-circle-owned">
          {t('lumen.status.inLibrary', 'In library')}
        </small>
      ) : null}
    </div>
  );
}

export function AurralArtistCard({ artist }: { artist: AurralArtist }) {
  return (
    <ArtistCircle
      name={artist.name}
      mbid={artist.mbid ?? null}
      image={artist.image ?? null}
      inLibrary={artist.inLibrary === true}
    />
  );
}

// One button per song, changing with its state: Get, Requested, Downloading,
// then Play once it is in the library (green is used only for "you have it").
function SongRequestAction({
  track,
  requested,
  downloading = false,
  busy,
  canRequest,
  onRequest,
}: {
  track: AurralTrack;
  requested: boolean;
  downloading?: boolean;
  busy: boolean;
  canRequest: boolean;
  onRequest: () => void;
}) {
  const { t } = useLumenLocale();
  const { linkFor } = useMusicPlayer();
  const playable = playableOf(track);
  // a song still downloading is not playable yet, whatever the library says
  if (track.inLibrary && !downloading) {
    return linkFor({ kind: 'track', track: playable }) ? (
      <PlayButton
        className="btn btn-sm music-owned-btn"
        target={{ kind: 'track', track: playable }}
      />
    ) : (
      <Pill k="ok" icon="check">
        {t('lumen.status.inLibrary', 'In library')}
      </Pill>
    );
  }
  if (downloading)
    return (
      <Pill k="dl" icon="down">
        {t('lumen.status.downloading', 'Downloading')}
      </Pill>
    );
  if (requested)
    return (
      <Pill k="wait" icon="clock">
        {t('lumen.status.requested', 'Requested')}
      </Pill>
    );
  if (!canRequest) return null;
  return (
    <button
      type="button"
      className="btn btn-tonal btn-sm"
      disabled={busy}
      onClick={onRequest}
      title={t(
        'lumen.music.getSongOnlyHelp',
        'Downloads this song. It turns into Play when it lands.'
      )}
    >
      <Icon name="plus" />
      {busy
        ? t('lumen.music.requestingTrack', 'Requesting…')
        : t('lumen.music.get', 'Get')}
    </button>
  );
}

// Album covers from Cover Art Archive are often missing for new or less-known
// releases. SeerrNG's album-art route checks it and falls back to Deezer and
// iTunes, so any album with an id goes through it when its art would come from
// there (or is missing). Other covers (Deezer, the library) are used as they are.
export const albumArt = (
  coverUrl: string | null | undefined,
  mbid: string | null | undefined,
  artist?: string | null,
  title?: string | null
): string | undefined => {
  const fromCaa =
    !coverUrl || /^https:\/\/coverartarchive\.org\//.test(coverUrl);
  if (!fromCaa || !mbid || !/^[0-9a-f-]{36}$/i.test(mbid))
    return coverUrl ?? undefined;
  const query = new URLSearchParams();
  if (artist) query.set('artist', artist.slice(0, 200));
  if (title) query.set('title', title.slice(0, 200));
  const qs = query.toString().replace(/\+/g, '%20');
  return strictQuery(
    `/api/v1/music/album-art/${mbid.toLowerCase()}${qs ? `?${qs}` : ''}`
  );
};

// a song's cover by artist and title (song requests carry no album id)
export const songArt = (
  artist: string | null | undefined,
  title: string | null | undefined
): string | undefined => {
  if (!artist?.trim() || !title?.trim()) return undefined;
  const query = new URLSearchParams({
    artist: artist.trim().slice(0, 200),
    title: title.trim().slice(0, 200),
  });
  return strictQuery(
    `/api/v1/music/song-art?${query.toString().replace(/\+/g, '%20')}`
  );
};

export const playableOf = (track: AurralTrack) => ({
  title: track.title,
  artistName: track.artistName,
  albumTitle: track.albumTitle,
  albumMbid: track.albumMbid,
  artistMbid: track.artistMbid,
  previewDeezerId: (track as { previewDeezerId?: string }).previewDeezerId,
});

// The 30-second preview lives on the artwork, only for songs you do not have.
export function PreviewArt({ track }: { track: AurralTrack }) {
  const { previews } = useMusicPlayer();
  // the bar at the bottom shows the same artwork as the row
  const art = albumArt(
    track.coverUrl,
    track.albumMbid,
    track.artistName,
    track.albumTitle
  );
  return (
    <span className="trow-thumb">
      <Cover src={art} title={track.albumTitle || track.title} icon="music" />
      {previews && !track.inLibrary && (
        <PreviewButton track={playableOf(track)} cover={art} />
      )}
    </span>
  );
}

export function MusicSongList({
  tracks,
  maxItems,
  canRequest = true,
  numbered = false,
  columns = false,
}: {
  tracks: AurralTrack[];
  maxItems?: number;
  canRequest?: boolean;
  // a chart: each row shows its place
  numbered?: boolean;
  // wide screens split the list into two side-by-side halves
  columns?: boolean;
}) {
  const { t } = useLumenLocale();
  const toast = useToast();
  // every song asked for and not answered yet stays busy, however many are tapped
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const inFlight = useRef(new Set<string>());
  useServerSongRequests();
  useRequestedSongs();
  const downloading = useDownloadingSongs();

  const visibleTracks = maxItems ? tracks.slice(0, maxItems) : tracks;

  const handleRequest = async (track: AurralTrack) => {
    const key = songRequestKey(track);
    const shared = songKey(track.artistName, track.title);
    if (
      track.inLibrary ||
      inFlight.current.has(key) ||
      isSongRequested(shared)
    ) {
      return;
    }
    inFlight.current.add(key);
    setBusyKeys(new Set(inFlight.current));
    try {
      await postSingleTrackRequest(track);
      markSongsRequested([shared]);
      toast(
        t('lumen.music.requestedSongToast', 'Requested {title}', {
          title: track.title,
        })
      );
    } catch (error) {
      toast(
        friendlyError(
          error,
          t('lumen.music.requestSongFailed', 'Could not request this song.')
        )
      );
    } finally {
      inFlight.current.delete(key);
      setBusyKeys(new Set(inFlight.current));
    }
  };

  const renderRow = (track: AurralTrack, index: number) => {
    const key = songRequestKey(track);
    const artistTo = artistLinkForTrack(track);
    const albumTo = albumLinkForTrack(track);
    const duration = track.durationMs ? fmtTrack(track.durationMs) : '';
    return (
      <li
        key={`${key}-${index}`}
        className={
          numbered ? 'trow trow--actions trow--ranked' : 'trow trow--actions'
        }
      >
        {numbered && <span className="tn">{index + 1}</span>}
        <PreviewArt track={track} />
        <span>
          <b>{track.title}</b>
          <small className="music-song-meta">
            {track.artistName &&
              (artistTo ? (
                <Link to={artistTo}>{track.artistName}</Link>
              ) : (
                track.artistName
              ))}
            {track.artistName && track.albumTitle ? ' · ' : ''}
            {track.albumTitle &&
              (albumTo ? (
                <Link to={albumTo}>{track.albumTitle}</Link>
              ) : (
                track.albumTitle
              ))}
          </small>
        </span>
        <span className="tl">{duration}</span>
        <span className="trow-act">
          <SongRequestAction
            track={track}
            requested={
              track.albumRequested === true ||
              isSongRequested(songKey(track.artistName, track.title))
            }
            downloading={isSongDownloading(downloading, track)}
            busy={busyKeys.has(key)}
            canRequest={canRequest}
            onRequest={() => handleRequest(track)}
          />
        </span>
      </li>
    );
  };
  const half =
    columns && visibleTracks.length > 5
      ? Math.ceil(visibleTracks.length / 2)
      : visibleTracks.length;
  const groups =
    half < visibleTracks.length
      ? [visibleTracks.slice(0, half), visibleTracks.slice(half)]
      : [visibleTracks];

  return (
    <div className={groups.length > 1 ? 'tlist-2col' : undefined}>
      {groups.map((group, groupIndex) => (
        <div className="card" key={groupIndex}>
          <ul className="slist tlist">
            {group.map((track, index) =>
              renderRow(track, groupIndex * half + index)
            )}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function MusicTopHit({
  top,
  canRequest = true,
  canRequestSongs = canRequest,
}: {
  top: NonNullable<AurralTopResult>;
  canRequest?: boolean;
  canRequestSongs?: boolean;
}) {
  const { t } = useLumenLocale();
  const toast = useToast();
  const [songBusy, setSongBusy] = useState(false);
  useServerSongRequests(top.type === 'track');
  useRequestedSongs();
  const downloading = useDownloadingSongs();
  const albumStat = useAlbumStat(top.type === 'album' ? top : {});
  const topKey = top.type === 'track' ? songKey(top.artistName, top.title) : '';
  const songRequested =
    (top.type === 'track' && top.albumRequested === true) ||
    (topKey ? isSongRequested(topKey) : false);

  if (top.type === 'artist') {
    const href = artistHref(top);
    const state = {
      name: top.name,
      image: artistArt(top.image, top.mbid, top.name),
    };
    return (
      <div className="top-hit music-top-artist">
        <div className="music-top-artist-art">
          <ArtistAvatar image={top.image} mbid={top.mbid} name={top.name} />
        </div>
        <div>
          <h3>
            <Link to={href} state={state}>
              {top.name}
            </Link>
          </h3>
          <div className="sub">
            {[
              t('lumen.music.type.artist', 'Artist'),
              top.inLibrary ? t('lumen.status.inLibrary', 'In library') : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <div className="acts">
            <Link className="btn btn-primary btn-sm" to={href} state={state}>
              {t('lumen.music.seeAlbumsAndSongs', 'See albums and songs')}
            </Link>
            {top.inLibrary && (
              <PlayButton
                className="btn btn-sm music-owned-btn"
                target={{
                  kind: 'artist',
                  artist: { name: top.name, mbid: top.mbid ?? undefined },
                }}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  if (top.type === 'album') {
    const href = albumHref(top);
    const stat = albumStat;

    return (
      <div className="top-hit">
        <div className="art sq">
          <Cover
            src={albumArt(top.coverUrl, top.mbid, top.artistName, top.title)}
            title={top.title}
            icon="music"
          />
        </div>
        <div>
          <h3>
            <Link to={href}>{top.title}</Link>
          </h3>
          <div className="sub">
            {[
              top.artistName,
              top.primaryType || t('lumen.music.type.album', 'Album'),
              releaseYear(top.releaseDate),
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <div className="acts">
            {top.mbid && canRequest ? (
              <RequestButton
                stat={stat}
                label={t('lumen.music.requestAlbum', 'Request album')}
                request={() => requestExtra('music', top.mbid!)}
                className="btn btn-primary btn-sm"
              />
            ) : (
              <StatPill s={stat} />
            )}
          </div>
        </div>
      </div>
    );
  }

  const trackHref =
    albumLinkForTrack(top) ||
    artistLinkForTrack(top) ||
    `/music?q=${encodeURIComponent(top.title)}`;

  const handleRequestSong = async () => {
    if (songBusy || songRequested || top.inLibrary) return;
    setSongBusy(true);
    try {
      await postSingleTrackRequest(top);
      markSongsRequested([topKey]);
      toast(
        t('lumen.music.requestedSongToast', 'Requested {title}', {
          title: top.title,
        })
      );
    } catch (error) {
      toast(
        friendlyError(
          error,
          t('lumen.music.requestSongFailed', 'Could not request this song.')
        )
      );
    } finally {
      setSongBusy(false);
    }
  };

  return (
    <div className="top-hit">
      <div className="art sq">
        <Cover
          src={albumArt(
            top.coverUrl,
            top.albumMbid,
            top.artistName,
            top.albumTitle
          )}
          title={top.albumTitle || top.title}
          icon="music"
        />
      </div>
      <div>
        <h3>
          <Link to={trackHref}>{top.title}</Link>
        </h3>
        <div className="sub">
          {[t('lumen.music.type.song', 'Song'), top.artistName, top.albumTitle]
            .filter(Boolean)
            .join(' · ')}
        </div>
        <div className="acts">
          <SongRequestAction
            track={top}
            requested={songRequested}
            downloading={
              top.type === 'track' && isSongDownloading(downloading, top)
            }
            busy={songBusy}
            canRequest={canRequestSongs}
            onRequest={handleRequestSong}
          />
        </div>
      </div>
    </div>
  );
}

interface RequestedAlbumSummary {
  title: string;
  artistName: string;
  posterPath?: string;
}

interface CombinedMusicRequestRow {
  key: string;
  title: string;
  subtitle: string;
  href: string;
  art?: string;
  createdAt: string;
  pillKind: 'ok' | 'wait' | 'dl' | 'bad';
  pillIcon: 'check' | 'clock' | 'down' | 'x';
  pillLabel: string;
  // a failed album request can be sent again
  retryId?: number;
}

type RequestPill = Pick<
  CombinedMusicRequestRow,
  'pillKind' | 'pillIcon' | 'pillLabel'
>;

interface RequestPillLabels {
  inLibrary: string;
  partlyInLibrary: string;
  requested: string;
  downloading: string;
  searching: string;
  declined: string;
  failed: string;
  cancelled: string;
}

const mapAlbumRequestStatus = (
  request: RequestItem,
  labels: RequestPillLabels
): RequestPill => {
  const stage = request.currentStatus?.stage;
  if (stage === 'available' || request.media.status === MediaStatus.AVAILABLE) {
    return { pillKind: 'ok', pillIcon: 'check', pillLabel: labels.inLibrary };
  }
  if (stage === 'downloading') {
    return { pillKind: 'dl', pillIcon: 'down', pillLabel: labels.downloading };
  }
  // a finished request whose album is only partly in the library
  if (request.status === 5 || request.media.status === MediaStatus.PARTIAL) {
    return {
      pillKind: 'ok',
      pillIcon: 'check',
      pillLabel:
        request.media.status === MediaStatus.PARTIAL
          ? labels.partlyInLibrary
          : labels.inLibrary,
    };
  }
  if (stage === 'declined' || request.status === 3) {
    return { pillKind: 'bad', pillIcon: 'x', pillLabel: labels.declined };
  }
  if (stage === 'failed' || request.status === 4) {
    return { pillKind: 'bad', pillIcon: 'x', pillLabel: labels.failed };
  }
  return { pillKind: 'wait', pillIcon: 'clock', pillLabel: labels.requested };
};

const mapTrackRequestStatus = (
  track: TrackRequestItem,
  labels: RequestPillLabels
): RequestPill => {
  if (track.status === 'completed') {
    return { pillKind: 'ok', pillIcon: 'check', pillLabel: labels.inLibrary };
  }
  if (track.status === 'searching') {
    return { pillKind: 'dl', pillIcon: 'down', pillLabel: labels.searching };
  }
  if (
    track.status === 'failed' ||
    track.status === 'declined' ||
    track.status === 'cancelled'
  ) {
    return {
      pillKind: 'bad',
      pillIcon: 'x',
      pillLabel: labels[track.status],
    };
  }
  return { pillKind: 'wait', pillIcon: 'clock', pillLabel: labels.requested };
};

export function YourMusicRequests({
  userId,
  trackRequestsEnabled,
}: {
  userId: number;
  trackRequestsEnabled: boolean;
}) {
  const { t } = useLumenLocale();
  // the lifecycle status (Downloading, In library) like the Requests page,
  // refreshed alongside "Downloading now"
  const albumStatus = usePolledApi<{
    results?: {
      request: RequestItem;
      status?: RequestItem['currentStatus'];
    }[];
  }>(
    `/request/status?take=6&skip=0&filter=all&sort=added&requestedBy=${userId}&mediaType=music`,
    15000
  );
  // servers without the status list fall back to the plain one
  const albumList = useApi<Paged<RequestItem>>(
    albumStatus.error
      ? `/request?take=6&skip=0&filter=all&sort=added&requestedBy=${userId}&mediaType=music`
      : null
  );
  const albumRequests = {
    data: albumStatus.data?.results
      ? {
          results: albumStatus.data.results
            .filter((item) => item?.request)
            .map((item) => ({
              ...item.request,
              currentStatus: item.status ?? item.request.currentStatus,
            })),
        }
      : albumList.data,
    error: albumStatus.error && albumList.error,
    reload: () => {
      albumStatus.reload();
      albumList.reload();
    },
  };
  const trackRequests = usePolledApi<{ results: TrackRequestItem[] }>(
    trackRequestsEnabled
      ? '/music/track-requests?scope=mine&filter=all&take=6'
      : null,
    15000
  );
  const [albumDetailsById, setAlbumDetailsById] = useState<
    Record<string, RequestedAlbumSummary | null>
  >({});

  const albumItems = albumRequests.data?.results ?? [];
  const albumMbidsKey = albumItems
    .map(
      (item) =>
        item.media.mbId ||
        item.media.identifiers?.find((i) => i.provider === 'musicbrainz')
          ?.value ||
        ''
    )
    .filter(Boolean)
    .join(',');

  // the names of the requested albums, all in one light call (not a full album
  // page each); covers come from the album art route
  useEffect(() => {
    const ids = albumMbidsKey ? albumMbidsKey.split(',') : [];
    const missing = [
      ...new Set(ids.filter((id) => !Object.hasOwn(albumDetailsById, id))),
    ].slice(0, 12);
    if (!missing.length) return;

    let live = true;
    cachedApi<{
      results?: { id: string; title: string; artistName: string }[];
    }>(
      // the commas are encoded too: the API validator refuses reserved characters
      `/music/album-summaries?ids=${encodeURIComponent(missing.join(','))}`
    )
      .then((found) => found.results ?? [])
      .catch(() => [])
      .then((results) => {
        if (!live) return;
        const byId = new Map(
          results.map((album) => [album.id.toLowerCase(), album])
        );
        setAlbumDetailsById((current) => ({
          ...current,
          ...Object.fromEntries(
            missing.map((id): [string, RequestedAlbumSummary | null] => {
              const album = byId.get(id.toLowerCase());
              return [
                id,
                album
                  ? {
                      title: album.title,
                      artistName: album.artistName,
                      posterPath: albumArt(
                        null,
                        id,
                        album.artistName,
                        album.title
                      ),
                    }
                  : null,
              ];
            })
          ),
        }));
      });

    return () => {
      live = false;
    };
  }, [albumDetailsById, albumMbidsKey]);

  const trackItems = trackRequests.data?.results;
  // a song whose latest request failed, was declined or was cancelled can be asked again
  useEffect(() => {
    const latest = new Map<string, TrackRequestItem>();
    for (const track of trackItems ?? []) {
      const key = songKey(track.artist, track.title);
      const seen = latest.get(key);
      if (!seen || Date.parse(track.createdAt) > Date.parse(seen.createdAt))
        latest.set(key, track);
    }
    const ended = [...latest]
      .filter(([, track]) =>
        ['failed', 'declined', 'cancelled'].includes(track.status)
      )
      .map(([key]) => key);
    if (ended.length) unmarkSongs(ended);
  }, [trackItems]);
  const toast = useToast();
  const [retrying, setRetrying] = useState<number | null>(null);
  const retry = async (requestId: number, title: string) => {
    setRetrying(requestId);
    try {
      await api(`/request/${requestId}/retry`, { method: 'POST' });
      toast(t('lumen.music.retryToast', 'Asking for {title} again', { title }));
      albumRequests.reload();
    } catch (error) {
      toast(
        friendlyError(
          error,
          t('lumen.music.retryFailed', 'Could not ask again. Try later.')
        )
      );
    } finally {
      setRetrying(null);
    }
  };

  const pillLabels: RequestPillLabels = {
    inLibrary: t('lumen.status.inLibrary', 'In library'),
    partlyInLibrary: t('lumen.music.partlyOwned', 'Partly in library'),

    requested: t('lumen.status.requested', 'Requested'),
    downloading: t('lumen.status.downloading', 'Downloading'),
    searching: t('lumen.music.requestStatus.searching', 'Searching'),
    declined: t('lumen.music.requestStatus.declined', 'Declined'),
    failed: t('lumen.music.requestStatus.failed', 'Failed'),
    cancelled: t('lumen.music.requestStatus.cancelled', 'Cancelled'),
  };

  const combinedRows: CombinedMusicRequestRow[] = [
    ...albumItems.map((request) => {
      const mbId =
        request.media.mbId ||
        request.media.identifiers?.find((i) => i.provider === 'musicbrainz')
          ?.value ||
        '';
      const detail = mbId ? albumDetailsById[mbId] : undefined;
      return {
        key: `album-${request.id}`,
        title: detail?.title || t('lumen.music.type.album', 'Album'),
        subtitle: [t('lumen.music.type.album', 'Album'), detail?.artistName]
          .filter(Boolean)
          .join(' · '),
        href: mbId ? `/music/${encodeURIComponent(mbId)}` : '/requests',
        art: detail?.posterPath,
        createdAt: request.createdAt,
        ...mapAlbumRequestStatus(request, pillLabels),
        retryId: request.status === 4 ? request.id : undefined,
      };
    }),
    ...(trackRequests.data?.results ?? []).map((track) => ({
      key: `track-${track.id}`,
      title: track.title,
      subtitle: [t('lumen.music.type.song', 'Song'), track.artist]
        .filter(Boolean)
        .join(' · '),
      href: `/music?q=${encodeURIComponent(`${track.artist} - ${track.title}`)}`,
      art: songArt(track.artist, track.title),
      createdAt: track.createdAt,
      ...mapTrackRequestStatus(track, pillLabels),
    })),
  ]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 6);

  const loading =
    !albumRequests.data &&
    !albumRequests.error &&
    (!trackRequestsEnabled || (!trackRequests.data && !trackRequests.error));

  return (
    <Section
      title={t('lumen.music.yourRequests', 'Your music requests')}
      link={[t('lumen.music.viewAll', 'View all'), '/requests?mediaType=music']}
    >
      {loading ? (
        <div className="detail-loading" aria-busy="true" />
      ) : !combinedRows.length ? (
        <div className="empty">
          {t('lumen.music.noRequests', 'No music requests yet.')}
        </div>
      ) : (
        <div className="card">
          <ul className="slist tlist">
            {combinedRows.map((row) => (
              <li key={row.key} className="trow">
                <span className="trow-thumb">
                  <Cover src={row.art} title={row.title} icon="music" />
                </span>
                <span>
                  <b>
                    <Link to={row.href}>{row.title}</Link>
                  </b>
                  <small className="music-song-meta">{row.subtitle}</small>
                </span>
                <span className="music-req-state">
                  <Pill k={row.pillKind} icon={row.pillIcon}>
                    {row.pillLabel}
                  </Pill>
                  {row.retryId !== undefined && (
                    <button
                      type="button"
                      className="btn btn-tonal btn-sm"
                      disabled={retrying === row.retryId}
                      onClick={() => void retry(row.retryId!, row.title)}
                    >
                      {t('lumen.common.tryAgain', 'Try again')}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

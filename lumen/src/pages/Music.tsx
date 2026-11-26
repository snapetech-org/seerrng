import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import {
  Link,
  useNavigate,
  useNavigationType,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  api,
  ApiError,
  MediaStatus,
  strictQuery,
  type MusicServiceSummary,
  type RequestOptions,
} from '../api';
import { isAdministrator, useAuth } from '../auth';
import AlbumLibraryHealth from '../components/AlbumLibraryHealth';
import BlocklistButton from '../components/BlocklistButton';
import {
  MoreOnScroll,
  Rail,
  RailSkeleton,
  Section,
  statusOf,
  type QualityStatus,
  type Stat,
} from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import {
  AdvancedOptions,
  canChooseRequestOptions,
  canRequestMusic,
  canUseRequestAccess,
  DetailTop,
  Facts,
  Pill,
  VideoDisclosure,
} from '../components/detail';
import {
  ExtraCard,
  ExtraGate,
  ExtraHeader,
  ExtraSearch,
  extraStat,
  RequestButton,
  ServiceNote,
  StatPill,
} from '../components/extra';
import FollowButton from '../components/FollowButton';
import { GenrePicker } from '../components/GenrePicker';
import IndexerSearchLink from '../components/IndexerSearchLink';
import MusicEditionCompare from '../components/MusicEditionCompare';
import {
  ActivityTab,
  AurralArtistView,
  LibraryTab,
  PlaylistsShelf,
  RecommendedArtists,
  SimilarToYourArtists,
  TrendingArtistsRail,
  useMusicPrefetch,
} from '../components/MusicHome';
import {
  PlayButton,
  PlayOpensIn,
  PreviewButton,
  useMusicPlayer,
} from '../components/MusicPlayback';
import MusicRatings from '../components/MusicRatings';
import {
  albumArt,
  AurralAlbumCard,
  AurralArtistCard,
  MusicDownloadsProvider,
  MusicSongList,
  MusicTopHit,
  recordingRequestKey,
  releaseYear,
  useAlbumStat,
  useMusicActivity,
  useMusicLibrary,
  useServerSongRequests,
  YourMusicRequests,
} from '../components/MusicSections';
import OpenIssueReports from '../components/OpenIssueReports';
import ReportIssueButton from '../components/ReportIssueButton';
import { useToast } from '../components/toast';
import WatchlistButton from '../components/WatchlistButton';
import {
  discoveryVisibility,
  showDiscoveryTitle,
} from '../discoveryVisibility';
import { friendlyError } from '../errors';
import {
  artistOf,
  fmtTrack,
  hasAurralMusicService,
  hasMusicPagesService,
  requestExtra,
  type Album,
  type AlbumDetails,
  type ArtistDetails,
  type AurralGenreResponse,
  type AurralGenresResponse,
  type AurralSearchResponse,
  type AurralTrendingResponse,
  type TrackRequestStatus,
} from '../extras';
import { useApi, usePaged, usePublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { openPlayer } from '../musicPlayback';
import {
  isAlbumDownloading,
  isAlbumRequested,
  isSongDownloading,
  isSongRequested,
  markSongsRequested,
  onMusicDownloadsCompleted,
  songKey,
  useDownloadingSongs,
  useRequestedSongs,
} from '../musicState';
import {
  clearRecentSearches,
  readRecentSearches,
  saveRecentSearches,
} from '../recentSearches';
import { apiQueryString } from '../searchParams';
import { useLiveMediaProgress } from '../useLiveDownloadProgress';
import { AssociationLink } from './Associations';

// Last.fm tags arrive lowercase ("hip hop", "r&b"): show them like titles.
const GENRE_WORDS: Record<string, string> = {
  'r&b': 'R&B',
  'k-pop': 'K-Pop',
  'j-pop': 'J-Pop',
  edm: 'EDM',
  uk: 'UK',
};

const MUSICBRAINZ_UUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const genreLabel = (tag: string) =>
  GENRE_WORDS[tag.toLowerCase()] ??
  tag.replace(
    /(^|[\s/-])(\p{Ll})/gu,
    (_, sep: string, ch: string) => sep + ch.toUpperCase()
  );

const SORTS = [
  ['ranked', 'lumen.music.sort.recommended', 'Recommended'],
  ['popular.week', 'lumen.music.sort.week', 'This week'],
  ['popular.month', 'lumen.music.sort.month', 'This month'],
  ['popular.year', 'lumen.music.sort.year', 'This year'],
  ['listen_count.desc', 'lumen.music.sort.mostPlayed', 'Most played'],
  ['release_date.desc', 'lumen.music.sort.newest', 'Newest'],
  ['release_date.asc', 'lumen.music.sort.oldest', 'Oldest'],
  ['listen_count.asc', 'lumen.music.sort.leastPlayed', 'Least played'],
  [
    'ranked.asc',
    'lumen.music.sort.recommendedAscending',
    'Recommended (ascending)',
  ],
  [
    'popular.week.asc',
    'lumen.music.sort.weekAscending',
    'This week (ascending)',
  ],
  [
    'popular.month.asc',
    'lumen.music.sort.monthAscending',
    'This month (ascending)',
  ],
  [
    'popular.year.asc',
    'lumen.music.sort.yearAscending',
    'This year (ascending)',
  ],
] as const;

type SimilarArtist = {
  id: string;
  name: string;
  type?: string;
  artistThumb?: string | null;
};

function SimilarArtists({ path }: { path: string }) {
  const { t } = useLumenLocale();
  const { data } = useApi<{ results: SimilarArtist[] }>(path);
  if (!data?.results.length) return null;
  return (
    <Section title={t('lumen.music.similarArtists', 'Similar Artists')}>
      <Rail>
        {data.results.map((artist) => (
          <ExtraCard
            key={artist.id}
            href={`/artist/${encodeURIComponent(artist.id)}`}
            img={artist.artistThumb ?? undefined}
            title={artist.name}
            meta={artist.type}
            shape="sq"
            icon="music"
          />
        ))}
      </Rail>
    </Section>
  );
}

interface MusicService {
  id: number;
  name: string;
  isDefault?: boolean;
  musicQuality?: 'mp3' | 'flac';
}

const musicServiceQuality = (
  service: MusicService
): 'mp3' | 'flac' | undefined =>
  service.musicQuality ??
  (/\b(?:FLAC|LOSSLESS)\b/i.test(service.name)
    ? 'flac'
    : /\bMP3\b/i.test(service.name)
      ? 'mp3'
      : undefined);

function MusicRequestSheet({
  album,
  quality,
  services,
  serviceIds,
  initialServerId,
  onClose,
  onComplete,
}: {
  album: AlbumDetails;
  quality: 'mp3' | 'flac';
  services: MusicService[];
  serviceIds: number[];
  initialServerId: number;
  onClose: () => void;
  onComplete: () => void;
}) {
  const { user } = useAuth();
  const { t } = useLumenLocale();
  const toast = useToast();
  const canChoose = canChooseRequestOptions(user?.permissions);
  const [options, setOptions] = useState<RequestOptions>({
    serverId: initialServerId,
  });
  const [optionsReady, setOptionsReady] = useState(!canChoose);
  const [busy, setBusy] = useState(false);
  const quotaUserId = options.userId ?? user?.id;
  const quota = useApi<{
    music?: { limit?: number; remaining?: number; restricted?: boolean };
  }>(quotaUserId ? `/user/${quotaUserId}/quota` : null, {
    currentPathOnly: true,
  });
  const quotaInfo = quota.data?.music;
  const selectedServerId = options.serverId ?? initialServerId;
  const blocked = album.mediaInfo?.status === MediaStatus.BLOCKLISTED;
  const available = album.availableServices?.some(
    (service) =>
      service.serverId === selectedServerId &&
      service.quality.toUpperCase() === quality.toUpperCase()
  );
  const pending = album.mediaInfo?.requests?.some((request) => {
    if (request.status !== 1 && request.status !== 2) return false;
    const targets = request.serviceTargets ?? [];
    return (
      targets.length === 0 ||
      targets.some(
        (target) =>
          target.serviceType === 'lidarr' &&
          target.serverId === selectedServerId
      )
    );
  });
  const destinationCovered = blocked || available || pending;
  const destinationStatus = blocked
    ? t('components.MusicDetails.blocklisted', 'Blocklisted')
    : available
      ? t('components.Common.available', 'Available')
      : pending
        ? t('components.RequestModal.Music.requested', 'Requested')
        : t('components.RequestModal.Music.readyToRequest', 'Ready to Request');
  const selectedService = services.find(
    (service) => service.id === selectedServerId
  );
  const canSubmit =
    !busy &&
    optionsReady &&
    (!!quota.data || !!quota.error) &&
    !quota.error &&
    !quotaInfo?.restricted &&
    !destinationCovered;

  return (
    <ConfirmSheet
      title={t('components.RequestModal.Music.requestmusic', 'Request Music')}
      body={`${album.artist.name} — ${album.title} · ${quality.toUpperCase()}`}
      confirm={t('lumen.common.request', 'Request')}
      cancel={t('components.Common.ButtonHelp.cancel', 'Cancel')}
      busy={busy}
      confirmDisabled={!canSubmit}
      onClose={onClose}
      onConfirm={async () => {
        if (!canSubmit) return;
        setBusy(true);
        try {
          const result = await api<{ status?: number }>('/request', {
            method: 'POST',
            body: JSON.stringify({
              mediaType: 'music',
              mediaId: album.id,
              serverId: options.serverId ?? initialServerId,
              ...(canChoose
                ? {
                    ...options,
                    requesterSelectedOptions: {
                      tags: options.tags !== undefined,
                      profile: options.profileId !== undefined,
                      metadataProfile: options.metadataProfileId !== undefined,
                      rootFolder: !!options.rootFolder,
                    },
                  }
                : {}),
            }),
          });
          if (result?.status === 4)
            throw new Error(
              t(
                'components.RequestModal.Music.backendRequestFailed',
                'The request was submitted, but Lidarr rejected it while processing.'
              )
            );
          onComplete();
          toast(t('lumen.common.requestSubmitted', 'Request submitted.'));
        } catch (error) {
          toast(
            friendlyError(
              error,
              t(
                'components.RequestModal.Music.requesterror',
                'Something went wrong while submitting the request.'
              ),
              t
            )
          );
          setBusy(false);
        }
      }}
    >
      <div className="pk-head">
        <div className="p sq">
          {album.posterPath && <img src={album.posterPath} alt="" />}
        </div>
        <div>
          <h3>{album.title}</h3>
          <p className="meta">
            {album.artist.name} · {quality.toUpperCase()}
          </p>
        </div>
      </div>
      <dl className="facts">
        <div>
          <dt>
            {t(
              'components.RequestModal.Music.mediaAndFormat',
              'Media & Format'
            )}
          </dt>
          <dd>
            {t('components.Discover.DiscoverMusic.music', 'Music')} ·{' '}
            {t('components.Discover.DiscoverMusic.album', 'Album')} ·{' '}
            {quality.toUpperCase()}
          </dd>
        </div>
        <div>
          <dt>{t('components.RequestModal.Music.artist', 'Artist')}</dt>
          <dd>{album.artist.name}</dd>
        </div>
        <div>
          <dt>{t('components.RequestModal.Music.albumType', 'Album Type')}</dt>
          <dd>
            {album.type ||
              t('components.RequestModal.Music.notAvailable', 'Not Available')}
          </dd>
        </div>
        <div>
          <dt>
            {t('components.RequestModal.Music.trackCount', 'Track Count')}
          </dt>
          <dd>{new Intl.NumberFormat().format(album.tracks?.length ?? 0)}</dd>
        </div>
        {album.releaseDate && (
          <div>
            <dt>
              {t('components.RequestModal.Music.releaseDate', 'Release Date')}
            </dt>
            <dd>{album.releaseDate}</dd>
          </div>
        )}
        <div>
          <dt>{t('components.RequestModal.Music.status', 'Status')}</dt>
          <dd>{destinationStatus}</dd>
        </div>
        <div>
          <dt>{t('components.RequestModal.Music.service', 'Service')}</dt>
          <dd>
            {selectedService?.name ??
              t('components.RequestModal.Music.notAvailable', 'Not Available')}
          </dd>
        </div>
      </dl>
      {!!album.tracks?.length && (
        <>
          <p className="note">
            {t(
              'components.RequestModal.Music.entireAlbum',
              'This request includes the entire album.'
            )}
          </p>
          <div>
            <h4 className="card-title">{t('lumen.music.tracks', 'Tracks')}</h4>
            <ol className="slist tlist">
              {album.tracks.map((track) => (
                <li key={track.position} className="trow">
                  <span className="tn">{track.position}</span>
                  <span>
                    <b>{track.name}</b>
                  </span>
                  <span className="tl">{fmtTrack(track.length)}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
      {destinationCovered && (
        <p className="note" role="status">
          {blocked
            ? t(
                'components.MusicDetails.blocklisted',
                'This title is blocklisted.'
              )
            : available
              ? t(
                  `components.MusicDetails.${quality}Available`,
                  `The ${quality.toUpperCase()} version is already available.`
                )
              : t(
                  `components.MusicDetails.${quality}Pending`,
                  `An open ${quality.toUpperCase()} request already exists.`
                )}
        </p>
      )}
      {canChoose && (
        <AdvancedOptions
          kind="music"
          is4k={false}
          inline
          serverIds={serviceIds}
          initial={{ serverId: initialServerId }}
          onChange={setOptions}
          onReady={setOptionsReady}
        />
      )}
      {!!quotaInfo?.limit && (
        <p className="note" role={quotaInfo.restricted ? 'status' : undefined}>
          {quotaInfo.restricted
            ? t(
                'lumen.music.requestQuotaReached',
                'Music request quota reached.'
              )
            : t(
                'lumen.music.requestsRemaining',
                '{remaining} of {limit} Music requests remaining.',
                {
                  remaining: new Intl.NumberFormat().format(
                    quotaInfo.remaining ?? 0
                  ),
                  limit: new Intl.NumberFormat().format(quotaInfo.limit),
                }
              )}
        </p>
      )}
      {quota.error && (
        <ServiceNote
          error={quota.error}
          what={t('components.RequestModal.Music.requestmusic', 'Music quota')}
          retry={quota.reload}
        />
      )}
    </ConfirmSheet>
  );
}

function MusicFormatRequestActions({
  album,
  refresh,
}: {
  album: AlbumDetails;
  refresh: () => void;
}) {
  const { user } = useAuth();
  const { t } = useLumenLocale();
  const serviceState = useApi<MusicService[]>('/service/lidarr');
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [requesting, setRequesting] = useState<{
    quality: 'mp3' | 'flac';
    serverId: number;
    serviceIds: number[];
    services: MusicService[];
  }>();
  const canChooseService = canChooseRequestOptions(user?.permissions);
  const services = Array.isArray(serviceState.data) ? serviceState.data : [];

  if (serviceState.error)
    return (
      <ServiceNote
        error={serviceState.error}
        what={t('components.Settings.lidarrsettings', 'Lidarr settings')}
        retry={serviceState.refresh}
      />
    );

  return (
    <div className="music-format-actions">
      {(['mp3', 'flac'] as const).map((quality) => {
        const options = services.filter(
          (service) => musicServiceQuality(service) === quality
        );
        const configured =
          options.find((service) => service.id === selected[quality]) ??
          options.find((service) => service.isDefault) ??
          options[0];
        const available =
          !!configured &&
          album.availableServices?.some(
            (service) =>
              service.serverId === configured.id &&
              service.quality.toUpperCase() === quality.toUpperCase()
          );
        const pendingRequest =
          !!configured &&
          album.mediaInfo?.requests?.some((request) => {
            if (request.status !== 1 && request.status !== 2) return false;
            const targets = request.serviceTargets ?? [];
            return (
              targets.length === 0 ||
              targets.some(
                (target) =>
                  target.serviceType === 'lidarr' &&
                  target.serverId === configured.id
              )
            );
          });
        const blocked = album.mediaInfo?.status === MediaStatus.BLOCKLISTED;
        const unavailableReason = !configured
          ? t(
              `components.MusicDetails.${quality}ServiceUnavailable`,
              `No ${quality.toUpperCase()} music service is configured.`
            )
          : blocked
            ? t(
                'components.MusicDetails.blocklisted',
                'This title is blocklisted.'
              )
            : available
              ? t(
                  `components.MusicDetails.${quality}Available`,
                  `The ${quality.toUpperCase()} version is already available.`
                )
              : pendingRequest
                ? t(
                    `components.MusicDetails.${quality}Pending`,
                    `An open ${quality.toUpperCase()} request already exists.`
                  )
                : undefined;
        const disabled = !!unavailableReason || requesting !== undefined;
        return (
          <div className="music-format-choice" key={quality}>
            {canChooseService && options.length > 1 && (
              <select
                className="cfg-select"
                aria-label={`${quality.toUpperCase()} ${t('components.RequestModal.AdvancedRequester.destinationserver', 'Destination Server')}`}
                value={configured?.id ?? ''}
                onChange={(event) =>
                  setSelected((current) => ({
                    ...current,
                    [quality]: Number(event.target.value),
                  }))
                }
              >
                {options.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className={`btn ${disabled ? 'btn-tonal' : 'btn-primary'}`}
              disabled={disabled}
              title={unavailableReason}
              aria-label={
                unavailableReason
                  ? `${t('components.Common.FormatRequestControl.request', 'Request')} ${quality.toUpperCase()}: ${unavailableReason}`
                  : `${t('components.Common.FormatRequestControl.request', 'Request')} ${quality.toUpperCase()}`
              }
              onClick={async () => {
                if (!configured || requesting) return;
                setRequesting({
                  quality,
                  serverId: configured.id,
                  serviceIds: options.map((service) => service.id),
                  services: options,
                });
              }}
            >
              {t('components.Common.FormatRequestControl.request', 'Request')}{' '}
              {quality.toUpperCase()}
            </button>
          </div>
        );
      })}
      {requesting && (
        <MusicRequestSheet
          album={album}
          quality={requesting.quality}
          services={requesting.services}
          initialServerId={requesting.serverId}
          serviceIds={requesting.serviceIds}
          onClose={() => setRequesting(undefined)}
          onComplete={() => {
            setRequesting(undefined);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
// Keep these MusicBrainz labels aligned with the server's release type filters.
const RELEASE_TYPES = [
  'Album',
  'Single',
  'EP',
  'Broadcast',
  'Other',
  'Compilation',
  'Soundtrack',
  'Spokenword',
  'Interview',
  'Audiobook',
  'Audio drama',
  'Live',
  'Remix',
  'DJ-mix',
  'Mixtape/Street',
  'Demo',
  'Field recording',
].map((label) => ({ value: label.toLowerCase(), label }));
const MUSIC_FILTERS = [
  {
    key: 'genre',
    label: 'lumen.music.filter.genre',
    fallback: 'Genre',
    type: 'search',
  },
  {
    key: 'artist',
    label: 'lumen.music.filter.artist',
    fallback: 'Artist',
    type: 'search',
  },
  {
    key: 'primaryReleaseDateGte',
    label: 'lumen.music.filter.releasedFrom',
    fallback: 'Released From',
    type: 'date',
  },
  {
    key: 'primaryReleaseDateLte',
    label: 'lumen.music.filter.releasedThrough',
    fallback: 'Released Through',
    type: 'date',
  },
] as const;

function MusicArtistFilter({
  artist,
  artistId,
}: {
  artist: string;
  artistId: string;
}) {
  const { t } = useLumenLocale();
  const [name, setName] = useState(artist);
  const [selectedId, setSelectedId] = useState(artistId);
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(term), 350);
    return () => clearTimeout(timer);
  }, [term]);
  const path =
    term && term === debouncedTerm
      ? '/search?' +
        apiQueryString(new URLSearchParams({ query: term, type: 'artist' }))
      : null;
  const lookup = useApi<{
    results: {
      id: string;
      mediaType: string;
      name: string;
      disambiguation?: string;
    }[];
  }>(path, { currentPathOnly: true });
  const matches =
    lookup.data?.results.filter((result) => result.mediaType === 'artist') ??
    [];
  return (
    <>
      <label className="sel">
        <span className="lbl">{t('lumen.music.filter.artist', 'Artist')}</span>
        <input
          className="cfg-input"
          type="search"
          name="artist"
          maxLength={256}
          value={name}
          onChange={(event) => {
            setName(event.currentTarget.value);
            setTerm(event.currentTarget.value.trim());
            setSelectedId('');
          }}
        />
      </label>
      <input type="hidden" name="artistId" value={selectedId} />
      {matches.length > 0 && (
        <label className="sel">
          <span className="lbl">
            {t('lumen.music.artistMatch', 'Artist Match')}
          </span>
          <select
            value={selectedId}
            onChange={(event) => {
              const match = matches.find(
                ({ id }) => id === event.currentTarget.value
              );
              setSelectedId(match?.id ?? '');
              if (match) setName(match.name);
            }}
          >
            <option value="">
              {t('lumen.music.useArtistText', 'Use Artist Text')}
            </option>
            {matches.map((match) => (
              <option key={match.id} value={match.id}>
                {match.name}
                {match.disambiguation ? ` (${match.disambiguation})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {lookup.error && (
        <button
          className="btn btn-quiet btn-sm"
          type="button"
          onClick={lookup.reload}
        >
          {t('lumen.music.retryArtistLookup', 'Retry Artist Lookup')}
        </button>
      )}
      {lookup.data && matches.length === 0 && (
        <span className="note" role="status">
          {t('lumen.music.noMatchingArtists', 'No matching artists.')}
        </span>
      )}
    </>
  );
}

const big = (n?: number) =>
  !n
    ? ''
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)}M`
      : n >= 1e3
        ? `${Math.round(n / 1e3)}K`
        : String(n);

export const AlbumCard = ({ a }: { a: Album }) => {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const canGet = canRequestMusic(user?.permissions);
  // the same state the Music pages give this album (library, requests)
  const stat = useAlbumStat({
    mbid: a.id,
    title: a.title,
    artistName: artistOf(a),
    primaryType: a['primary-type'],
    inLibrary: a.inLibrary,
    partial: a.partial,
    libraryTrackCount: a.libraryTrackCount,
    libraryAvailableTrackCount: a.libraryAvailableTrackCount,
    mediaInfo: a.mediaInfo,
  });
  const source = a.qualityStatuses?.length
    ? a.qualityStatuses
    : (a.availableQualities ?? []).map((quality) => ({
        quality,
        status: MediaStatus.AVAILABLE,
      }));
  const statusBadges: QualityStatus[] = source.flatMap(
    ({ quality, status }) => {
      const stat =
        status === MediaStatus.PENDING
          ? {
              k: 'wait' as const,
              word: 'Waiting for approval',
              ico: 'clock' as const,
            }
          : status === MediaStatus.PROCESSING
            ? { k: 'dl' as const, word: 'Processing', ico: 'down' as const }
            : status === MediaStatus.PARTIAL
              ? {
                  k: 'ok' as const,
                  word: 'Partly in library',
                  ico: 'check' as const,
                }
              : statusOf({ status }, true);
      return stat ? [{ quality, s: stat }] : [];
    }
  );

  return (
    <ExtraCard
      quick={
        canGet
          ? {
              label: t('lumen.music.getAlbumNamed', 'Get {title}', {
                title: a.title,
              }),
              action: t('lumen.music.get', 'Get'),
              run: () => requestExtra('music', a.id),
            }
          : undefined
      }
      href={`/music/${a.id}`}
      img={a.posterPath}
      title={a.title}
      shape="sq"
      titleKind="album"
      icon="music"
      stat={stat}
      statusBadges={statusBadges}
      watchlist={{ mediaType: 'music', id: a.id }}
      meta={[artistOf(a), (a['first-release-date'] || '').slice(0, 4)]
        .filter(Boolean)
        .join(' · ')}
    />
  );
};

type SearchTab = 'all' | 'songs' | 'albums' | 'singles' | 'artists';

// Music: search-first with Aurral discovery shelves and ListenBrainz/MusicBrainz fallback

// The album "More" menu opens under its button, rightward by default. When that would
// run off a phone screen (More sits at the right end of its row) it opens leftward.
// Each genre keeps its own colour, worked out from its name.
function genreTileStyle(tag: string) {
  let hash = 0;
  for (const ch of tag.toLowerCase())
    hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  // white text needs 4.5:1: yellow to cyan hues are light, so they get a darker shade
  const lightness = hash >= 30 && hash < 200 ? '30%' : '40%';
  return {
    '--tile-hue': String(hash),
    '--tile-l': lightness,
  } as CSSProperties;
}

function fitMoreMenu(details: HTMLDetailsElement) {
  details.classList.remove('flip');
  if (!details.open) return;
  const menu = details.querySelector<HTMLElement>('.music-more-menu');
  if (
    menu &&
    menu.getBoundingClientRect().right >
      document.documentElement.clientWidth - 8
  )
    details.classList.add('flip');
}

// A <details> menu closes on Esc (focus goes back to its button) or a tap outside it.
function useDismissableDetails() {
  const ref = useRef<HTMLDetailsElement>(null);
  // listening for as long as the page is open (not from when React hears of the
  // toggle) means an Esc pressed right after opening still closes it
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const details = ref.current;
      if (details?.open && !details.contains(event.target as Node))
        details.open = false;
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      const details = ref.current;
      if (event.key !== 'Escape' || !details?.open) return;
      event.preventDefault();
      details.open = false;
      details.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  return ref;
}

// Left/Right, Home and End move between tabs, as a screen reader announces them.
function onTabKeys(event: KeyboardEvent<HTMLElement>) {
  const tabs = [
    ...(event.currentTarget
      .closest('[role="tablist"]')
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []),
  ];
  const at = tabs.findIndex((tab) => tab === document.activeElement);
  if (at < 0) return;
  const to =
    event.key === 'ArrowRight'
      ? (at + 1) % tabs.length
      : event.key === 'ArrowLeft'
        ? (at - 1 + tabs.length) % tabs.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? tabs.length - 1
            : -1;
  if (to < 0) return;
  event.preventDefault();
  tabs[to].focus();
  tabs[to].click();
}

const SEARCH_TABS: readonly SearchTab[] = [
  'all',
  'songs',
  'albums',
  'singles',
  'artists',
];

// One Latin letter finds nothing useful (and costs three catalog lookups); a single
// character of a non-Latin script can be a whole word.
const isSearchable = (term: string) =>
  term.length >= 2 || /[^\u0020-\u024f]/u.test(term);

export function Music() {
  const { t } = useLumenLocale();
  const navigate = useNavigate();
  const releaseTypeOptions = RELEASE_TYPES.map(({ value, label }) => ({
    value,
    label: t(`lumen.music.releaseType.${value}`, label),
  }));
  const [p, setP] = useSearchParams();
  const query = p.get('q') || p.get('search') || '';
  const [q, setQ] = useState(query);
  // the search tab and the picked genre live in the address (replaced), so Back and
  // reload keep them
  const wantedSearchTab: SearchTab =
    SEARCH_TABS.find((tab) => tab === p.get('stab')) ?? 'all';
  const setSearchTab = (tab: SearchTab) => {
    const next = new URLSearchParams(p);
    if (tab === 'all') next.delete('stab');
    else next.set('stab', tab);
    setP(next, { replace: true });
  };
  const selectedGenre = p.get('genre')?.trim() ?? '';
  const homeTab =
    (['discover', 'library', 'activity'] as const).find(
      (tab) => tab === p.get('tab')
    ) ?? 'discover';
  const setHomeTab = (tab: 'discover' | 'library' | 'activity') => {
    const next = new URLSearchParams(p);
    if (tab === 'discover') next.delete('tab');
    else next.set('tab', tab);
    setP(next, { replace: true });
  };
  // a picked genre opens its artists under the tiles: bring them into view when one is
  // tapped, or when a Home shelf's "See all" opens the page on it (not on Back)
  const navType = useNavigationType();
  const genreRailRef = useRef<HTMLDivElement>(null);
  const genreScroll = useRef<ScrollLogicalPosition | null>(
    navType !== 'POP' && selectedGenre ? 'start' : null
  );
  const pickGenre = (tag: string) => {
    const next = new URLSearchParams(p);
    if (tag) next.set('genre', tag);
    else next.delete('genre');
    genreScroll.current = tag ? 'nearest' : null;
    setP(next, { replace: true });
  };
  // podcasts moved to their own section; old links still land there
  const oldPodcastsTab = p.get('tab') === 'podcasts';
  useEffect(() => {
    if (oldPodcastsTab) navigate('/podcasts', { replace: true });
  }, [oldPodcastsTab, navigate]);

  const requestedSort = p.get('sort') || p.get('sortBy');
  const sort =
    SORTS.find(([value]) => value === requestedSort)?.[0] ?? 'ranked';
  const requestedTypes = (p.get('type') || p.get('releaseType') || '')
    .split(',')
    .map((type) => type.trim().toLowerCase());
  const types = [...new Set(requestedTypes)].filter((type) =>
    RELEASE_TYPES.some(({ value }) => type === value)
  );
  const filters = new URLSearchParams();
  for (const name of [
    ...MUSIC_FILTERS.map(({ key }) => key),
    'artistId',
    'availability',
  ]) {
    const value = p.get(name)?.trim();
    if (value) filters.set(name, value);
  }
  const qs = new URLSearchParams(filters);
  qs.set('sortBy', sort);
  if (query) qs.set('query', query);
  if (types.length) qs.set('releaseType', types.join(','));
  // "Browse catalog" opens by itself when the address asks for a catalog view (a chart
  // shelf's sort, a release type, a filter other than the genre); ?catalog= remembers
  // opening or closing it by hand
  const catalogAsked =
    (Boolean(requestedSort) && sort !== 'ranked') ||
    types.length > 0 ||
    [...filters.keys()].some((key) => key !== 'genre');
  const catalogParam = p.get('catalog');
  const catalogOpen =
    catalogParam === '1' || (catalogParam !== '0' && catalogAsked);
  const setCatalogOpen = (open: boolean) => {
    if (open === catalogOpen) return;
    const next = new URLSearchParams(p);
    if (open === catalogAsked) next.delete('catalog');
    else next.set('catalog', open ? '1' : '0');
    setP(next, { replace: true });
  };

  const upd = (k: string, v: string) => {
    const n = new URLSearchParams(p);
    if (k === 'sort') n.delete('sortBy');
    if (k === 'type') n.delete('releaseType');
    if (!v || (k === 'sort' && v === 'ranked')) n.delete(k);
    else n.set(k, v);
    setP(n, { replace: true });
  };
  // the last query this box wrote to the address; only outside changes (top bar,
  // Back, a genre link) replace what is in the box
  const committed = useRef(query);
  useEffect(() => {
    const value = q.trim();
    if (value === query) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(p);
      next.delete('search');
      next.delete('stab');
      if (value) next.set('q', value);
      else next.delete('q');
      committed.current = value;
      setP(next, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [p, q, query, setP]);
  useEffect(() => {
    if (query === committed.current) return;
    committed.current = query;
    setQ(query);
  }, [query]);
  const { user } = useAuth();
  const publicSettings = usePublicSettings();
  const musicServices = useApi<MusicServiceSummary[]>(
    user ? '/service/music' : null
  );
  const trackStatus = useApi<TrackRequestStatus>(
    user && publicSettings?.trackRequestsEnabled
      ? '/music/track-requests/status'
      : null
  );
  // the music pages work with Aurral or Lidarr (the server picks which)
  const aurralConfigured = hasMusicPagesService(
    musicServices.data,
    trackStatus.data
  );

  const trimmedQuery = query.trim();
  const searchable = isSearchable(trimmedQuery);
  // The Aurral endpoints need music request access; everyone else keeps the
  // MusicBrainz catalog browser.
  const canRequest = canRequestMusic(user?.permissions);
  const canRequestSongs =
    canRequest && Boolean(publicSettings?.trackRequestsEnabled);
  const aurralEnabled = aurralConfigured && canRequest;
  const aurralSearch = useApi<AurralSearchResponse>(
    aurralEnabled && trimmedQuery && searchable
      ? `/music/search?q=${encodeURIComponent(trimmedQuery)}&limit=12`
      : null,
    { currentPathOnly: true }
  );
  const aurralTrending = useApi<AurralTrendingResponse>(
    aurralEnabled && !trimmedQuery ? '/music/discover/trending' : null
  );
  const aurralGenres = useApi<AurralGenresResponse>(
    aurralEnabled && !trimmedQuery ? '/music/discover/genres' : null
  );
  const aurralGenreArtists = useApi<AurralGenreResponse>(
    aurralEnabled && !trimmedQuery && selectedGenre
      ? `/music/discover/genre?tag=${encodeURIComponent(selectedGenre)}`
      : null,
    { currentPathOnly: true }
  );

  useMusicPrefetch(aurralEnabled);
  // a finished download: search results and charts ask again, so its song
  // turns into Play without a reload
  const { revalidate: revalidateSearch } = aurralSearch;
  const { revalidate: revalidateTrending } = aurralTrending;
  useEffect(
    () =>
      onMusicDownloadsCompleted(() => {
        revalidateSearch();
        revalidateTrending();
      }),
    [revalidateSearch, revalidateTrending]
  );
  // an older server (or an odd answer) may leave the list out: no crash on ?genre=
  const genreArtists = Array.isArray(aurralGenreArtists.data?.artists)
    ? aurralGenreArtists.data!.artists
    : [];
  const libraryOverview = useMusicLibrary(
    aurralEnabled && !trimmedQuery && homeTab !== 'activity'
  );
  const activity = useMusicActivity(aurralEnabled);
  const { aurralBase } = useMusicPlayer();

  const aurralAvailable =
    aurralEnabled &&
    ![403, 404].includes(aurralTrending.errorStatus) &&
    ![403, 404].includes(aurralSearch.errorStatus);
  const showingAurralSearch = aurralAvailable && Boolean(trimmedQuery);
  const showingAurralDiscovery = aurralAvailable && !trimmedQuery;

  const list = usePaged<Album>(
    showingAurralSearch ||
      (showingAurralDiscovery && !(catalogOpen && homeTab === 'discover'))
      ? null
      : `/discover/music?${apiQueryString(qs)}`
  );

  const visibility = discoveryVisibility(publicSettings, user?.permissions);
  // the same hide rules as the home shelves showing this catalog
  if (filters.has('availability')) visibility.hideAvailable = false;

  const items = list.items.filter((album) =>
    showDiscoveryTitle(album, visibility)
  );
  const filtered = items.length < list.items.length;

  const searchTracks = aurralSearch.data?.tracks ?? [];
  const searchAllAlbums = aurralSearch.data?.albums ?? [];
  const searchSingles = searchAllAlbums.filter((album) => {
    const kind = album.primaryType.toLowerCase();
    return kind === 'single' || kind === 'ep';
  });
  const searchAlbums = searchAllAlbums.filter((album) => {
    const kind = album.primaryType.toLowerCase();
    return kind !== 'single' && kind !== 'ep';
  });
  const searchArtists = aurralSearch.data?.artists ?? [];
  const searchTop = aurralSearch.data?.top ?? null;
  const otherArtists =
    searchTop?.type === 'artist'
      ? searchArtists.filter((artist) =>
          // same name with another mbid is another artist (Nirvana, the 1960s UK band)
          searchTop.mbid && artist.mbid
            ? artist.mbid !== searchTop.mbid
            : artist.name.toLowerCase() !== searchTop.name.toLowerCase()
        )
      : searchArtists;
  const library = aurralSearch.data?.library ?? null;
  const libraryTracks = Array.isArray(library?.tracks) ? library.tracks : [];
  const libraryAlbums = Array.isArray(library?.albums) ? library.albums : [];
  const libraryArtists = Array.isArray(library?.artists) ? library.artists : [];
  const linkHit = aurralSearch.data?.link ?? null;
  const linkHref =
    linkHit?.type === 'playlist'
      ? linkHit.provider === 'deezer' && linkHit.id
        ? `/music/playlist/deezer/${encodeURIComponent(linkHit.id)}`
        : `/music/playlist-import?url=${encodeURIComponent(trimmedQuery)}`
      : linkHit?.type === 'artist' && linkHit.mbid
        ? `/artist/${encodeURIComponent(linkHit.mbid)}`
        : linkHit?.type === 'album' && linkHit.mbid
          ? `/music/${encodeURIComponent(linkHit.mbid)}`
          : linkHit?.albumMbid
            ? `/music/${encodeURIComponent(linkHit.albumMbid)}`
            : null;
  const playlistJump =
    linkHit?.type === 'playlist' && linkHref ? linkHref : null;
  useEffect(() => {
    if (playlistJump) navigate(playlistJump, { replace: true });
  }, [playlistJump, navigate]);
  const hasAnySearchResults =
    Boolean(searchTop) ||
    searchTracks.length > 0 ||
    searchAllAlbums.length > 0 ||
    searchArtists.length > 0 ||
    libraryTracks.length > 0 ||
    libraryAlbums.length > 0 ||
    libraryArtists.length > 0;

  const genreTags = aurralGenres.data?.tags ?? [];
  // recent searches are kept per account (and cleared on sign-out)
  const [recent, setRecent] = useState<string[]>(() =>
    readRecentSearches('music')
  );
  useEffect(() => setRecent(readRecentSearches('music')), [user?.id]);
  const rememberSearch = useCallback((term: string) => {
    if (!term) return;
    setRecent((current) => {
      const next = [
        term,
        ...current.filter((q) => q.toLowerCase() !== term.toLowerCase()),
      ].slice(0, 8);
      saveRecentSearches(next, 'music');
      return next;
    });
  }, []);
  // a search joins them once typing has stopped for a moment (or a result is opened),
  // never a half-typed word
  const searchFound = Boolean(aurralSearch.data) && hasAnySearchResults;
  useEffect(() => {
    if (!searchFound || !searchable || !trimmedQuery) return;
    const timer = window.setTimeout(() => rememberSearch(trimmedQuery), 1500);
    return () => window.clearTimeout(timer);
  }, [searchFound, searchable, trimmedQuery, rememberSearch]);
  useEffect(() => {
    const block = genreScroll.current;
    if (!block || !genreRailRef.current) return;
    genreScroll.current = null;
    genreRailRef.current.scrollIntoView({ block, behavior: 'smooth' });
  }, [selectedGenre, showingAurralDiscovery, homeTab, genreTags.length]);
  const trendingTracks = aurralTrending.data?.tracks ?? [];
  const trendingAlbums = aurralTrending.data?.albums ?? [];
  const trendingArtists = aurralTrending.data?.artists ?? [];
  const downloadingCount =
    (activity.data?.active.length ?? 0) + (activity.data?.queuedTotal ?? 0);

  // counts appear once results are in: a 0 while loading reads as "nothing"
  const counted = (n: number) => (aurralSearch.data ? n : undefined);
  const allSearchTabs: readonly [SearchTab, string, number?][] = [
    ['all', t('lumen.music.all', 'All')],
    [
      'artists',
      t('lumen.music.artists', 'Artists'),
      counted(searchArtists.length),
    ],
    ['albums', t('lumen.music.albums', 'Albums'), counted(searchAlbums.length)],
    ['songs', t('lumen.music.songs', 'Songs'), counted(searchTracks.length)],
    [
      'singles',
      t('lumen.music.singlesEps', 'Singles & EPs'),
      counted(searchSingles.length),
    ],
  ];
  // a tab with nothing in it is only a dead end
  const searchTabs = allSearchTabs.filter(
    ([key, , count]) => key === 'all' || count !== 0
  );
  const searchTab = searchTabs.some(([key]) => key === wantedSearchTab)
    ? wantedSearchTab
    : 'all';

  const renderCatalogBrowser = () => (
    <>
      <div className="toolbar">
        <label className="sel">
          <span className="lbl">{t('lumen.music.sort', 'Sort')}</span>
          <select value={sort} onChange={(e) => upd('sort', e.target.value)}>
            {SORTS.map(([v, key, fallback]) => (
              <option key={v} value={v}>
                {t(key, fallback)}
              </option>
            ))}
          </select>
        </label>
        <GenrePicker
          labels={{
            title: t('lumen.music.releaseTypes', 'Release Types'),
            all: t('lumen.music.anyReleaseType', 'Any Release Type'),
          }}
          options={releaseTypeOptions}
          picked={types}
          onChange={(value) => upd('type', value.join(','))}
        />
      </div>
      <details
        className="adv more-filters"
        open={filters.size > 0 || undefined}
      >
        <summary>{t('lumen.browse.moreFilters', 'More Filters')}</summary>
        <form
          className="toolbar"
          aria-label={t(
            'lumen.music.discoveryFilters',
            'Music Discovery Filters'
          )}
          key={filters.toString()}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const next = new URLSearchParams(p);
            for (const key of [
              ...MUSIC_FILTERS.map((field) => field.key),
              'artistId',
              'availability',
            ]) {
              const value = String(form.get(key) ?? '').trim();
              if (value) next.set(key, value);
              else next.delete(key);
            }
            setP(next, { replace: true });
          }}
        >
          {MUSIC_FILTERS.map(({ key, label, fallback, type }) =>
            key === 'artist' ? (
              <MusicArtistFilter
                key={key}
                artist={filters.get(key) ?? ''}
                artistId={filters.get('artistId') ?? ''}
              />
            ) : (
              <label className="sel" key={key}>
                <span className="lbl">{t(label, fallback)}</span>
                <input
                  className="cfg-input"
                  type={type}
                  name={key}
                  defaultValue={filters.get(key) ?? ''}
                  maxLength={type === 'search' ? 256 : undefined}
                />
              </label>
            )
          )}
          <label className="sel">
            <span className="lbl">
              {t('lumen.music.inLibrary', 'In Library')}
            </span>
            <select
              name="availability"
              defaultValue={filters.get('availability') ?? ''}
            >
              <option value="">
                {t('lumen.music.anyQuality', 'Any Quality')}
              </option>
              <option value="mp3">MP3</option>
              <option value="flac">FLAC</option>
            </select>
          </label>
          <button className="btn btn-tonal btn-sm" type="submit">
            {t('lumen.music.applyFilters', 'Apply Music Filters')}
          </button>
          {filters.has('genre') && (
            <button
              className="chip"
              type="button"
              onClick={() => upd('genre', '')}
            >
              {t('lumen.music.clearGenre', 'Clear Genre: {genre}', {
                genre: filters.get('genre') ?? '',
              })}
            </button>
          )}
          {filters.has('artistId') && (
            <button
              className="chip"
              type="button"
              onClick={() => upd('artistId', '')}
            >
              {t('lumen.music.clearExactArtist', 'Clear Exact Artist')}
            </button>
          )}
          {filters.size > 0 && (
            <button
              className="chip"
              type="button"
              onClick={() => {
                const next = new URLSearchParams(p);
                for (const key of filters.keys()) next.delete(key);
                setP(next, { replace: true });
              }}
            >
              {t('lumen.music.clearFilters', 'Clear Music Filters')}
            </button>
          )}
        </form>
      </details>
      <ServiceNote
        error={list.items.length ? null : list.error}
        what="music"
        title={t('lumen.music.loadFailureTitle', 'Could not load music')}
      />
      {!list.error && !items.length && !list.loading && list.done && (
        <div className="empty">
          <b>{t('lumen.music.nothingHere', 'Nothing here')}</b>
          {query
            ? t(
                'lumen.music.searchHint',
                'Try fewer words, or just the artist.'
              )
            : t('lumen.music.releaseTypeHint', 'Try another release type.')}
        </div>
      )}
      <div className="sqg grid">
        {items.map((a) => (
          <AlbumCard key={a.id} a={a} />
        ))}
      </div>
      {filtered && !list.done && !list.error && (
        <div className="more-scroll">
          <button
            className="btn btn-tonal"
            disabled={list.loading}
            onClick={list.more}
          >
            {list.loading
              ? t('lumen.music.loading', 'Loading…')
              : t('lumen.music.showMore', 'Show More Music')}
          </button>
        </div>
      )}
      <MoreOnScroll
        done={list.done || filtered}
        loading={list.loading}
        more={list.more}
        error={list.error}
        retry={list.retry}
        labels={{
          error: t('lumen.music.loadMoreFailure', 'Couldn’t load more.'),
          retry: t('lumen.music.retry', 'Retry'),
          loading: t('lumen.music.loadingMore', 'Loading more…'),
        }}
      />
    </>
  );

  const shortcuts = (
    <div
      className="chips wrap music-head-chips"
      aria-label={t('lumen.music.shortcuts', 'Music shortcuts')}
    >
      <Link className="chip" to="/music/playlist-import">
        <Icon name="plus" size="sm" />
        {t('lumen.music.importPlaylist', 'Import Playlist')}
      </Link>
      {canUseRequestAccess(user?.permissions) && (
        <Link className="chip" to="/music/collectors">
          <Icon name="star" size="sm" />
          {t('lumen.music.collectorPicks', 'Collector Picks')}
        </Link>
      )}
      {aurralAvailable && <PlayOpensIn />}
    </div>
  );

  return (
    <ExtraGate k="music">
      <MusicDownloadsProvider activity={activity.data} enabled={aurralEnabled}>
        <ExtraHeader
          title={t('lumen.music.title', 'Music')}
          sub={
            aurralAvailable
              ? undefined
              : t(
                  'lumen.music.subtitle',
                  'Request an album and it lands in your music library.'
                )
          }
        >
          <div className="music-page-search">
            <ExtraSearch
              value={q}
              onChange={setQ}
              placeholder={
                aurralAvailable
                  ? t(
                      'lumen.music.searchPlaceholderAurral',
                      'Search songs, albums, and artists…'
                    )
                  : t(
                      'lumen.music.searchPlaceholder',
                      'Search albums and artists…'
                    )
              }
            />
          </div>
        </ExtraHeader>
        {!trimmedQuery && !showingAurralDiscovery && shortcuts}

        {showingAurralSearch ? (
          <>
            <div
              className="seg music-home-tabs"
              role="tablist"
              aria-label={t('lumen.music.searchResults', 'Search results')}
            >
              {searchTabs.map(([key, label, count]) => (
                <button
                  key={key}
                  id={`music-stab-${key}`}
                  type="button"
                  role="tab"
                  aria-selected={searchTab === key}
                  aria-controls="music-search-panel"
                  tabIndex={searchTab === key ? 0 : -1}
                  onKeyDown={onTabKeys}
                  onClick={() => setSearchTab(key)}
                >
                  {label}
                  {count !== undefined && <span className="n">{count}</span>}
                </button>
              ))}
            </div>
            <div
              className="music-tabpanel"
              role="tabpanel"
              id="music-search-panel"
              aria-labelledby={`music-stab-${searchTab}`}
              onClickCapture={(event) => {
                // opening a result keeps the search in Recent searches
                if (
                  aurralSearch.data &&
                  searchable &&
                  event.target instanceof Element &&
                  event.target.closest('a')
                )
                  rememberSearch(trimmedQuery);
              }}
            >
              {!searchable && (
                <p className="note" role="status">
                  {t('lumen.music.keepTyping', 'Keep typing to search…')}
                </p>
              )}
              {searchable && !aurralSearch.data && !aurralSearch.error && (
                <div aria-busy="true">
                  <RailSkeleton sq />
                  <RailSkeleton sq />
                </div>
              )}

              {aurralSearch.error && aurralSearch.errorStatus !== 404 && (
                <ServiceNote
                  error={aurralSearch.error}
                  what="music"
                  retry={aurralSearch.reload}
                />
              )}

              {aurralSearch.data && !hasAnySearchResults && !linkHit && (
                <div className="empty">
                  <b>
                    {t(
                      'lumen.music.noResultsFor',
                      'Nothing found for “{query}”',
                      { query: trimmedQuery }
                    )}
                  </b>
                  {t(
                    'lumen.music.noResultsHelp',
                    'Check the spelling, or try just the artist or the song name.'
                  )}
                  {recent.length > 0 && (
                    <div
                      className="chips wrap music-recent"
                      role="group"
                      aria-label={t(
                        'lumen.music.recentSearches',
                        'Recent searches'
                      )}
                    >
                      {recent.map((q) => (
                        <Link
                          key={q}
                          className="chip"
                          to={`/music?q=${encodeURIComponent(q)}`}
                        >
                          {q}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {aurralSearch.data?.correctedQuery && (
                <p className="note" role="status">
                  {t(
                    'lumen.music.showingResultsFor',
                    'Showing results for “{query}”',
                    {
                      query: aurralSearch.data.correctedQuery,
                    }
                  )}
                </p>
              )}
              {aurralSearch.data?.degraded && (
                <p className="note" role="status">
                  {t(
                    'lumen.music.searchDegraded',
                    'Artist and album search is limited right now, so some results may be missing.'
                  )}
                </p>
              )}
              {linkHit && linkHref && (
                <Link className="music-mixes" to={linkHref}>
                  <span>
                    <b>
                      {linkHit.title ||
                        (linkHit.type === 'playlist'
                          ? linkHit.provider === 'deezer'
                            ? t(
                                'lumen.music.openPlaylist',
                                'Open this playlist'
                              )
                            : t(
                                'lumen.music.importThisPlaylist',
                                'Import this playlist'
                              )
                          : t('lumen.music.fromYourLink', 'From your link'))}
                    </b>
                    <small>
                      {[
                        linkHit.type === 'playlist'
                          ? t('lumen.music.type.playlist', 'Playlist')
                          : linkHit.type === 'artist'
                            ? t('lumen.music.type.artist', 'Artist')
                            : linkHit.type === 'album'
                              ? t('lumen.music.type.album', 'Album')
                              : t('lumen.music.type.song', 'Song'),
                        linkHit.artistName,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </span>
                  <Icon name="chev" />
                </Link>
              )}
              {aurralSearch.data &&
                hasAnySearchResults &&
                searchTab === 'all' && (
                  <>
                    <div
                      className={
                        searchTop && searchTracks.length > 0
                          ? 'music-search-lead two'
                          : 'music-search-lead'
                      }
                    >
                      {searchTop && (
                        <Section
                          title={t('lumen.music.topResult', 'Top result')}
                        >
                          <MusicTopHit
                            key={JSON.stringify([
                              searchTop.type,
                              'mbid' in searchTop ? searchTop.mbid : null,
                              'title' in searchTop ? searchTop.title : null,
                              'name' in searchTop ? searchTop.name : null,
                            ])}
                            top={searchTop}
                            canRequest={canRequest}
                            canRequestSongs={canRequestSongs}
                          />
                        </Section>
                      )}

                      {searchTracks.length > 0 && (
                        <Section
                          title={t('lumen.music.songs', 'Songs')}
                          action={
                            searchTracks.length > 4 ? (
                              <button
                                type="button"
                                className="btn btn-quiet btn-sm"
                                onClick={() => setSearchTab('songs')}
                              >
                                {t('lumen.music.moreSongs', 'More songs')}
                              </button>
                            ) : undefined
                          }
                        >
                          <MusicSongList
                            tracks={searchTracks}
                            maxItems={4}
                            canRequest={canRequestSongs}
                          />
                        </Section>
                      )}
                    </div>
                    {otherArtists.length > 0 && (
                      <Section title={t('lumen.music.artists', 'Artists')}>
                        <Rail>
                          {otherArtists.map((artist, index) => (
                            <AurralArtistCard
                              key={artist.mbid ?? `${artist.name}-${index}`}
                              artist={artist}
                            />
                          ))}
                        </Rail>
                      </Section>
                    )}
                    {searchAlbums.length > 0 && (
                      <Section title={t('lumen.music.albums', 'Albums')}>
                        <Rail>
                          {searchAlbums.map((album, index) => (
                            <AurralAlbumCard
                              key={
                                album.mbid ??
                                `${album.artistName}-${album.title}-${index}`
                              }
                              album={album}
                            />
                          ))}
                        </Rail>
                      </Section>
                    )}
                    {searchSingles.length > 0 && (
                      <Section
                        title={t('lumen.music.singlesEps', 'Singles & EPs')}
                      >
                        <Rail>
                          {searchSingles.map((album, index) => (
                            <AurralAlbumCard
                              key={
                                album.mbid ??
                                `${album.artistName}-${album.title}-${index}`
                              }
                              album={album}
                            />
                          ))}
                        </Rail>
                      </Section>
                    )}
                    {(libraryTracks.length > 0 ||
                      libraryAlbums.length > 0 ||
                      libraryArtists.length > 0) && (
                      <Section
                        title={t(
                          'lumen.music.inYourLibrary',
                          'In your library'
                        )}
                      >
                        {libraryArtists.length > 0 && (
                          <Rail>
                            {libraryArtists.map((artist, index) => (
                              <AurralArtistCard
                                key={artist.mbid ?? `${artist.name}-${index}`}
                                artist={artist}
                              />
                            ))}
                          </Rail>
                        )}
                        {libraryAlbums.length > 0 && (
                          <Rail>
                            {libraryAlbums.map((album, index) => (
                              <AurralAlbumCard
                                key={
                                  album.mbid ??
                                  `${album.artistName}-${album.title}-${index}`
                                }
                                album={album}
                              />
                            ))}
                          </Rail>
                        )}
                        {libraryTracks.length > 0 && (
                          <MusicSongList
                            tracks={libraryTracks}
                            maxItems={5}
                            canRequest={false}
                          />
                        )}
                      </Section>
                    )}
                  </>
                )}

              {aurralSearch.data && searchTab === 'songs' && (
                <Section title={t('lumen.music.songs', 'Songs')}>
                  {searchTracks.length > 0 ? (
                    <MusicSongList
                      tracks={searchTracks}
                      canRequest={canRequestSongs}
                    />
                  ) : (
                    <div className="empty">
                      {t(
                        'lumen.music.noResults',
                        'Try another artist, album, or song.'
                      )}
                    </div>
                  )}
                </Section>
              )}

              {aurralSearch.data && searchTab === 'albums' && (
                <Section title={t('lumen.music.albums', 'Albums')}>
                  {searchAlbums.length > 0 ? (
                    <div className="sqg grid">
                      {searchAlbums.map((album, index) => (
                        <AurralAlbumCard
                          key={
                            album.mbid ??
                            `${album.artistName}-${album.title}-${index}`
                          }
                          album={album}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="empty">
                      {t(
                        'lumen.music.noResults',
                        'Try another artist, album, or song.'
                      )}
                    </div>
                  )}
                </Section>
              )}

              {aurralSearch.data && searchTab === 'singles' && (
                <Section title={t('lumen.music.singlesEps', 'Singles & EPs')}>
                  {searchSingles.length > 0 ? (
                    <div className="sqg grid">
                      {searchSingles.map((album, index) => (
                        <AurralAlbumCard
                          key={
                            album.mbid ??
                            `${album.artistName}-${album.title}-${index}`
                          }
                          album={album}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="empty">
                      {t(
                        'lumen.music.noResults',
                        'Try another artist, album, or song.'
                      )}
                    </div>
                  )}
                </Section>
              )}

              {aurralSearch.data && searchTab === 'artists' && (
                <Section title={t('lumen.music.artists', 'Artists')}>
                  {searchArtists.length > 0 ? (
                    <div className="sqg grid">
                      {searchArtists.map((artist, index) => (
                        <AurralArtistCard
                          key={artist.mbid ?? `${artist.name}-${index}`}
                          artist={artist}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="empty">
                      {t(
                        'lumen.music.noResults',
                        'Try another artist, album, or song.'
                      )}
                    </div>
                  )}
                </Section>
              )}
            </div>
          </>
        ) : showingAurralDiscovery ? (
          <>
            <div className="music-tabbar">
              <div
                className="seg music-home-tabs"
                role="tablist"
                aria-label={t('lumen.music.sections', 'Music sections')}
              >
                {(
                  [
                    ['discover', t('lumen.music.discover', 'Discover')],
                    ['library', t('lumen.music.library', 'Library')],
                    ['activity', t('lumen.music.activity', 'Activity')],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    id={`music-htab-${key}`}
                    type="button"
                    role="tab"
                    aria-selected={homeTab === key}
                    aria-controls="music-home-panel"
                    tabIndex={homeTab === key ? 0 : -1}
                    onKeyDown={onTabKeys}
                    onClick={() => setHomeTab(key)}
                  >
                    {label}
                    {key === 'library' &&
                      typeof libraryOverview.data?.totalAlbums === 'number' && (
                        <span
                          className="n"
                          aria-label={t(
                            'lumen.music.albumTotal',
                            '{count} albums',
                            {
                              count:
                                libraryOverview.data.totalAlbums.toLocaleString(),
                            }
                          )}
                        >
                          {libraryOverview.data.totalAlbums.toLocaleString()}
                        </span>
                      )}
                    {key === 'activity' && downloadingCount > 0 && (
                      <span
                        className="n music-tab-busy"
                        aria-label={t(
                          'lumen.music.downloadingCount',
                          '{count} downloading',
                          { count: downloadingCount }
                        )}
                      >
                        <span className="music-act-spin" aria-hidden="true" />
                        {downloadingCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {shortcuts}
            </div>
            <div
              className="music-tabpanel"
              role="tabpanel"
              id="music-home-panel"
              aria-labelledby={`music-htab-${homeTab}`}
            >
              {homeTab === 'discover' && (
                <>
                  {recent.length > 0 && (
                    <div
                      className="chips music-recent-row"
                      role="group"
                      aria-label={t(
                        'lumen.music.recentSearches',
                        'Recent searches'
                      )}
                    >
                      <span className="music-recent-label">
                        {t('lumen.music.recentSearches', 'Recent searches')}
                      </span>
                      {recent.map((q) => (
                        <Link
                          key={q}
                          className="chip"
                          to={`/music?q=${encodeURIComponent(q)}`}
                        >
                          {q}
                        </Link>
                      ))}
                      <button
                        type="button"
                        className="chip music-recent-clear"
                        onClick={() => {
                          clearRecentSearches('music');
                          setRecent([]);
                        }}
                      >
                        {t('lumen.music.clearRecent', 'Clear')}
                      </button>
                    </div>
                  )}
                  {aurralTrending.error && !aurralTrending.data && (
                    <ServiceNote
                      error={aurralTrending.error}
                      what="music"
                      retry={aurralTrending.reload}
                    />
                  )}

                  {trendingAlbums.length > 0 && (
                    <Section
                      title={t('lumen.music.newReleases', 'New releases')}
                    >
                      <Rail>
                        {trendingAlbums.map((album, index) => (
                          <AurralAlbumCard
                            key={
                              album.mbid ??
                              `${album.artistName}-${album.title}-${index}`
                            }
                            album={album}
                          />
                        ))}
                      </Rail>
                    </Section>
                  )}

                  {trendingTracks.length > 0 && (
                    <Section
                      title={t('lumen.music.trendingSongs', 'Trending songs')}
                    >
                      <MusicSongList
                        tracks={trendingTracks}
                        maxItems={10}
                        numbered
                        columns
                        canRequest={canRequestSongs}
                      />
                    </Section>
                  )}
                  {!aurralTrending.data && !aurralTrending.error && (
                    <div aria-busy="true">
                      <RailSkeleton sq />
                      <RailSkeleton sq />
                    </div>
                  )}

                  <RecommendedArtists />

                  <SimilarToYourArtists />

                  <PlaylistsShelf />

                  {(genreTags.length > 0 || selectedGenre) && (
                    <Section
                      title={t('lumen.music.yourGenres', 'Your genres')}
                      action={
                        selectedGenre ? (
                          <button
                            type="button"
                            className="btn btn-quiet btn-sm"
                            onClick={() => pickGenre('')}
                          >
                            {t('lumen.music.clearGenre', 'Clear genre')}
                          </button>
                        ) : undefined
                      }
                    >
                      <div
                        className="genre-tiles"
                        role="group"
                        aria-label={t('lumen.music.genres', 'Genres')}
                      >
                        {genreTags.slice(0, 16).map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className="genre-tile"
                            style={genreTileStyle(tag)}
                            aria-pressed={selectedGenre === tag}
                            onClick={() =>
                              pickGenre(selectedGenre === tag ? '' : tag)
                            }
                          >
                            {genreLabel(tag)}
                          </button>
                        ))}
                      </div>
                      {selectedGenre && (
                        <div className="genre-picked" ref={genreRailRef}>
                          <h3>{genreLabel(selectedGenre)}</h3>
                          {!aurralGenreArtists.data &&
                            !aurralGenreArtists.error && <RailSkeleton sq />}
                          {aurralGenreArtists.error && (
                            <ServiceNote
                              error={aurralGenreArtists.error}
                              what={selectedGenre}
                              retry={aurralGenreArtists.reload}
                            />
                          )}
                          {aurralGenreArtists.data &&
                            (genreArtists.length > 0 ? (
                              <Rail>
                                {genreArtists.map((artist, index) => (
                                  <AurralArtistCard
                                    key={
                                      artist.mbid ?? `${artist.name}-${index}`
                                    }
                                    artist={artist}
                                  />
                                ))}
                              </Rail>
                            ) : (
                              <div className="empty">
                                {t(
                                  'lumen.music.noGenreMatches',
                                  'No artists found for this genre.'
                                )}
                              </div>
                            ))}
                        </div>
                      )}
                    </Section>
                  )}

                  <TrendingArtistsRail fallback={trendingArtists} />

                  {aurralBase && (
                    <a
                      className="music-mixes"
                      href={`${aurralBase}/flows`}
                      target="lumen-music-player"
                      rel="noreferrer"
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey)
                          return;
                        event.preventDefault();
                        openPlayer(`${aurralBase}/flows`);
                      }}
                    >
                      <span>
                        <b>
                          {t(
                            'lumen.music.madeForYou',
                            'Made for you in Aurral'
                          )}
                        </b>
                        <small>
                          {t(
                            'lumen.music.madeForYouHelp',
                            'Your mixes, Discover Weekly and Release Radar live in Aurral and download their own songs.'
                          )}
                        </small>
                      </span>
                      <Icon name="chev" />
                    </a>
                  )}

                  <details
                    className="more-filters music-catalog"
                    open={catalogOpen}
                    onToggle={(event) =>
                      setCatalogOpen(event.currentTarget.open)
                    }
                  >
                    <summary>
                      {t('lumen.music.browseCatalog', 'Browse catalog')}
                    </summary>
                    {renderCatalogBrowser()}
                  </details>
                </>
              )}

              {homeTab === 'library' && <LibraryTab />}

              {homeTab === 'activity' && (
                <>
                  {user && (
                    <YourMusicRequests
                      userId={user.id}
                      trackRequestsEnabled={Boolean(
                        publicSettings?.trackRequestsEnabled
                      )}
                    />
                  )}
                  <ActivityTab
                    activity={activity.data}
                    error={activity.error}
                  />
                </>
              )}
            </div>
          </>
        ) : (
          renderCatalogBrowser()
        )}
      </MusicDownloadsProvider>
    </ExtraGate>
  );
}

// Aurral is the music service: albums are one request, not an MP3/FLAC choice
function useAurralConfigured() {
  const { user } = useAuth();
  const publicSettings = usePublicSettings();
  const musicServices = useApi<MusicServiceSummary[]>(
    user ? '/service/music' : null
  );
  const trackStatus = useApi<TrackRequestStatus>(
    user && publicSettings?.trackRequestsEnabled
      ? '/music/track-requests/status'
      : null
  );
  if (hasAurralMusicService(musicServices.data, trackStatus.data)) return true;
  // undecided until both answers are in, so the other buttons never flash first
  const servicesSettled = Boolean(musicServices.data || musicServices.error);
  const statusSettled =
    (publicSettings != null && !publicSettings.trackRequestsEnabled) ||
    Boolean(trackStatus.data || trackStatus.error);
  return !user || (servicesSettled && statusSettled) ? false : undefined;
}

export function AlbumDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  // a fresh page per album: no state carries over from the last one. The
  // downloads poll lets its songs say Downloading, as on the other pages.
  return (
    <MusicDownloadsProvider enabled={canRequestMusic(user?.permissions)}>
      <AlbumDetailPage key={id} />
    </MusicDownloadsProvider>
  );
}

// how often an album page with songs on their way asks for its state again
const ALBUM_PENDING_POLL_MS = 15_000;

function AlbumDetailPage() {
  const { t } = useLumenLocale();
  const { id } = useParams();
  const { user } = useAuth();
  const publicSettings = usePublicSettings();
  const aurralConfigured = useAurralConfigured();
  const {
    data: a,
    error,
    refresh,
    reload,
    revalidate: revalidateAlbum,
  } = useApi<AlbumDetails>(`/music/${id}`, { currentPathOnly: true });
  useMusicPrefetch();
  useServerSongRequests();
  useRequestedSongs();
  const downloadingKeysNow = useDownloadingSongs();
  // a finished download turns its rows into Play without a reload
  useEffect(
    () => onMusicDownloadsCompleted(() => revalidateAlbum()),
    [revalidateAlbum]
  );
  const { previews } = useMusicPlayer();
  // every song asked for and not answered yet stays busy, however many are tapped
  const [requestingTracks, setRequestingTracks] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const inFlight = useRef(new Set<string>());
  const moreMenu = useDismissableDetails();
  const [requestedTracks, setRequestedTracks] = useState<string[]>([]);
  const [trackNotice, setTrackNotice] = useState('');
  const [trackError, setTrackError] = useState('');
  // "You'll already have these songs from …": asked before requesting anyway
  const [coveredPrompt, setCoveredPrompt] = useState<{
    mbid: string;
    title: string;
  } | null>(null);
  const [forcing, setForcing] = useState(false);
  const toast = useToast();
  const progressMedia = useLiveMediaProgress(
    a?.mediaInfo,
    isAdministrator(user?.permissions)
  );
  // while the album or one of its songs is on its way, ask again now and then
  const albumPending =
    a?.mediaInfo?.status === MediaStatus.PENDING ||
    a?.mediaInfo?.status === MediaStatus.PROCESSING ||
    requestedTracks.length > 0 ||
    Boolean(
      a?.tracks?.some((track) =>
        isSongRequested(songKey(a.artist.name, track.name))
      ) && a.libraryAlbum?.status !== 'owned'
    );
  useEffect(() => {
    if (!albumPending) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') revalidateAlbum();
    }, ALBUM_PENDING_POLL_MS);
    return () => window.clearInterval(timer);
  }, [albumPending, revalidateAlbum]);
  if (error)
    return (
      <ExtraGate k="music">
        <div className="empty">
          <b>{t('lumen.music.albumLoadFailure', 'Couldn’t load this album')}</b>
          {error}
          <button
            type="button"
            className="btn btn-tonal btn-sm"
            onClick={reload}
          >
            {t('lumen.common.tryAgain', 'Try again')}
          </button>
        </div>
      </ExtraGate>
    );
  if (!a) return <div className="detail-loading" aria-busy="true" />;
  const s = extraStat(progressMedia);
  const musicTags = (() => {
    const unique = new Map<string, { tag: string; count: number }>();
    for (const item of [
      ...(a.tags?.releaseGroup ?? []),
      ...(a.tags?.artist ?? []),
    ]) {
      const tag = item.tag.trim();
      if (!tag) continue;
      const key = tag.toLocaleLowerCase();
      const existing = unique.get(key);
      if (!existing || item.count > existing.count)
        unique.set(key, { tag, count: item.count });
    }
    return [...unique.values()]
      .sort(
        (left, right) =>
          right.count - left.count || left.tag.localeCompare(right.tag)
      )
      .slice(0, 50);
  })();
  const tags = musicTags.slice(0, 4).map(({ tag }) => tag);
  const total = (a.tracks || []).reduce((n, t) => n + (t.length || 0), 0);
  const contributors = new Map<
    string,
    { id: string; name: string; role: string }
  >();
  if (a.artist.id && a.artist.name) {
    contributors.set(a.artist.id.toLowerCase(), {
      id: a.artist.id,
      name: a.artist.name,
      role: t('lumen.music.albumArtist', 'Album Artist'),
    });
  }
  for (const track of a.tracks ?? []) {
    for (const artist of track.artists ?? []) {
      const artistId = artist.mbid?.trim();
      const name = artist.name?.trim();
      if (!artistId || !name || contributors.has(artistId.toLowerCase())) {
        continue;
      }
      contributors.set(artistId.toLowerCase(), {
        id: artistId,
        name,
        role: t('lumen.music.trackArtist', 'Track Artist'),
      });
    }
  }
  const artistContributors = [...contributors.values()];
  const canRequestTrack =
    Boolean(publicSettings?.trackRequestsEnabled) &&
    canRequestMusic(user?.permissions);
  const availableTrackIds = new Set(
    [
      ...(a.trackAvailability?.mp3 ?? []),
      ...(a.trackAvailability?.flac ?? []),
    ].map((trackId) => trackId.toLowerCase())
  );
  // owned on another release (a compilation): playable, not to be asked for
  const elsewhereTrackIds = new Set(
    (a.trackAvailability?.elsewhere ?? []).map((trackId) =>
      trackId.toLowerCase()
    )
  );
  const trackCount = a.tracks?.length ?? 0;
  // SeerrNG says the album is in the library but the song ids do not match this
  // edition: trust the album status, every song is there
  const ownedByStatus =
    s?.k === 'ok' && a.mediaInfo?.status === MediaStatus.AVAILABLE;
  const ownedHere = (track: NonNullable<AlbumDetails['tracks']>[number]) =>
    ownedByStatus ||
    Boolean(
      track.recordingMbid &&
      availableTrackIds.has(track.recordingMbid.toLowerCase())
    );
  const ownedElsewhere = (track: NonNullable<AlbumDetails['tracks']>[number]) =>
    Boolean(
      track.recordingMbid &&
      elsewhereTrackIds.has(track.recordingMbid.toLowerCase())
    );
  const trackOwned = (track: NonNullable<AlbumDetails['tracks']>[number]) =>
    ownedHere(track) || ownedElsewhere(track);
  const rowOwnedCount = (a.tracks ?? []).filter(trackOwned).length;
  // The library's own count of this album's songs (the Library tab's "x of
  // y") decides the header, so it says the same as Library, the artist page
  // and search; the rows still match song by song.
  const library = a.libraryAlbum;
  const ownedCount = library
    ? library.status === 'owned'
      ? Math.max(rowOwnedCount, trackCount)
      : library.availableTrackCount
    : rowOwnedCount;
  const ownedTotal =
    library?.status === 'partial' ? library.trackCount : trackCount;
  const partlyOwned = ownedCount > 0 && ownedCount < ownedTotal;
  const albumTarget = {
    kind: 'album' as const,
    album: { title: a.title, artistName: a.artist.name, mbid: a.id },
  };
  const fullyOwned =
    library?.status === 'owned' ||
    (trackCount > 0 && rowOwnedCount === trackCount);
  const rowKey = (track: NonNullable<AlbumDetails['tracks']>[number]) =>
    track.recordingMbid || `${track.position}:${track.name}`;
  const rowRequested = (track: NonNullable<AlbumDetails['tracks']>[number]) =>
    requestedTracks.includes(rowKey(track)) ||
    isSongRequested(songKey(a.artist.name, track.name)) ||
    (!!track.recordingMbid &&
      isSongRequested(recordingRequestKey(track.recordingMbid)));
  // every song is owned or asked for (a single whose song was requested): the
  // album is on its way, not something to get again
  const missingTracks = (a.tracks ?? []).filter((track) => !trackOwned(track));
  const allAsked =
    missingTracks.length > 0 && missingTracks.every(rowRequested);
  const albumDownloading =
    (allAsked || s?.k === 'wait' || s?.k === 'dl') &&
    isAlbumDownloading(downloadingKeysNow, {
      mbid: a.id,
      title: a.title,
      artistName: a.artist.name,
    });
  const headerStat: Stat = albumDownloading
    ? {
        k: 'dl',
        word: t('lumen.status.downloading', 'Downloading'),
        ico: 'down',
      }
    : !s && (allAsked || isAlbumRequested(a.id))
      ? {
          k: 'wait',
          word: t('lumen.status.requested', 'Requested'),
          ico: 'clock',
        }
      : s;
  // Aurral takes one request per album; Lidarr setups keep the MP3/FLAC choice
  const main =
    !canRequestMusic(user?.permissions) ||
    aurralConfigured === undefined ? null : !aurralConfigured ? (
      <MusicFormatRequestActions album={a} refresh={refresh} />
    ) : fullyOwned ? null : (
      <RequestButton
        key={a.id}
        stat={partlyOwned && headerStat?.k === 'ok' ? null : headerStat}
        label={
          partlyOwned
            ? t(
                'lumen.music.getMissingSongs',
                'Get the {count} missing songs',
                {
                  count: ownedTotal - ownedCount,
                }
              )
            : a.type === 'Single'
              ? t('lumen.music.getSingle', 'Get single')
              : a.type === 'EP'
                ? t('lumen.music.getEp', 'Get EP')
                : t('lumen.music.getAlbum', 'Get album')
        }
        request={() => requestExtra('music', a.id)}
        onError={(error) => {
          const body =
            error instanceof ApiError && error.status === 409
              ? (error.body as {
                  code?: string;
                  coveredBy?: { mbid: string; title: string };
                })
              : undefined;
          if (body?.code !== 'MUSIC_RELEASE_REDUNDANT' || !body.coveredBy)
            return false;
          setCoveredPrompt(body.coveredBy);
          return true;
        }}
      />
    );
  const requestAnyway = async () => {
    if (!a || forcing) return;
    setForcing(true);
    try {
      await requestExtra('music', a.id, undefined, undefined, {
        force: true,
      });
      toast(t('lumen.status.requested', 'Requested'));
      setCoveredPrompt(null);
      refresh();
    } catch (error) {
      toast(friendlyError(error, t('lumen.request.failed', 'Request failed')));
    } finally {
      setForcing(false);
    }
  };

  async function requestTrack(
    track: NonNullable<AlbumDetails['tracks']>[number]
  ) {
    if (!a || !track.name) return;
    const key = track.recordingMbid || `${track.position}:${track.name}`;
    if (
      inFlight.current.has(key) ||
      requestedTracks.includes(key) ||
      trackOwned(track)
    )
      return;
    inFlight.current.add(key);
    setRequestingTracks(new Set(inFlight.current));
    setTrackError('');
    setTrackNotice('');
    try {
      const result = await api<{ results?: { status?: string }[] }>(
        '/music/track-requests',
        {
          method: 'POST',
          body: JSON.stringify({
            tracks: [
              {
                title: track.name,
                artist: a.artist.name,
                source: 'album',
                recordingMbid: track.recordingMbid || undefined,
                albumMbid: a.id,
                albumName: a.title,
                artistMbid: a.artist.id || undefined,
                durationMs:
                  track.length && track.length > 0 ? track.length : undefined,
                trackNumber: track.position > 0 ? track.position : undefined,
              },
            ],
          }),
        }
      );
      if (result?.results?.[0]?.status === 'completed') {
        // already in the library: show it as owned, not as on its way
        setTrackNotice(
          t('lumen.music.trackAlreadyOwned', '{title} is already owned.', {
            title: track.name,
          })
        );
        refresh();
      } else {
        setRequestedTracks((current) =>
          current.includes(key) ? current : [...current, key]
        );
        markSongsRequested([songKey(a.artist.name, track.name)]);
        setTrackNotice(
          t('lumen.music.trackRequested', 'Requested {title}.', {
            title: track.name,
          })
        );
      }
    } catch (failure) {
      setTrackError(
        friendlyError(
          failure,
          t('lumen.music.requestTrackFailed', 'Could not request this track.')
        )
      );
    } finally {
      inFlight.current.delete(key);
      setRequestingTracks(new Set(inFlight.current));
    }
  }

  return (
    <ExtraGate k="music">
      <article className="detail">
        <DetailTop
          status={s}
          backdrop={a.artistBackdrop}
          poster={albumArt(a.posterPath, a.id, a.artist.name, a.title)}
          square
          title={a.title}
          by={
            a.artist.id ? (
              <Link
                to={`/artist/${a.artist.id}`}
                state={{ name: a.artist.name }}
              >
                {a.artist.name}
              </Link>
            ) : (
              a.artist.name
            )
          }
          line={[
            releaseYear(a.releaseDate),
            a.type,
            a.tracks?.length
              ? a.tracks.length === 1
                ? t('lumen.music.oneSong', '1 song')
                : t('lumen.music.songCount', '{count} songs', {
                    count: a.tracks.length,
                  })
              : '',
            total
              ? t('lumen.music.durationMinutes', '{duration} min', {
                  duration: fmtTrack(total).replace(/:\d+$/, ''),
                })
              : '',
            a.stats?.totalListenCount
              ? t('lumen.music.playCount', '{count} plays', {
                  count: big(a.stats.totalListenCount),
                })
              : '',
            tags.join(', '),
          ]}
        />
        <div className="dbody">
          {a.redundant?.coveredBy && (
            <p className="music-covered-by">
              <Link
                to={`/music/${encodeURIComponent(a.redundant.coveredBy.mbid)}`}
              >
                {a.redundant.code === 'covered'
                  ? t('lumen.music.songIsOnAlbum', 'This song is on {album}', {
                      album: a.redundant.coveredBy.title,
                    })
                  : t(
                      'lumen.music.anotherEditionOf',
                      'Another edition of {album}',
                      { album: a.redundant.coveredBy.title }
                    )}
              </Link>
            </p>
          )}
          {coveredPrompt && (
            <ConfirmSheet
              title={t(
                'lumen.music.coveredPromptTitle',
                "You'll already have these songs from {album}. Get it anyway?",
                { album: coveredPrompt.title }
              )}
              body={t(
                'lumen.music.coveredPromptBody',
                'Getting it downloads the same songs a second time.'
              )}
              confirm={t('lumen.music.getAnyway', 'Get it anyway')}
              cancel={t('lumen.common.cancel', 'Cancel')}
              busy={forcing}
              onConfirm={() => void requestAnyway()}
              onClose={() => setCoveredPrompt(null)}
            />
          )}
          <div className="dstatus">
            {(ownedCount > 0 || s?.k === 'ok') && (
              <PlayButton
                target={albumTarget}
                label={t('lumen.music.playAlbum', 'Play album')}
              />
            )}
            {fullyOwned && headerStat?.k !== 'ok' ? (
              <Pill k="ok" icon="check">
                {t('lumen.status.inLibrary', 'In library')}
              </Pill>
            ) : partlyOwned && library ? (
              <Pill k="ok" icon="check">
                {t('lumen.music.partlyOwned', 'Partly in library')}
              </Pill>
            ) : (
              <StatPill s={headerStat} />
            )}
            {aurralConfigured &&
              (!headerStat || (partlyOwned && headerStat.k === 'ok')) && (
                <span className="pc music-album-get">{main}</span>
              )}
            {aurralConfigured === false &&
              canRequestMusic(user?.permissions) &&
              a.artist.id && (
                <Link
                  className="btn btn-tonal btn-sm"
                  to={`/collections/music/${encodeURIComponent(a.artist.id)}?view=discography&albumId=${encodeURIComponent(a.id)}`}
                >
                  {t(
                    'components.MusicDetails.requestdiscography',
                    'Request Discography'
                  )}
                </Link>
              )}
            {a.artist.id && (
              <Link
                className="btn btn-tonal"
                to={`/artist/${encodeURIComponent(a.artist.id)}`}
                state={{ name: a.artist.name }}
              >
                {t('lumen.music.moreByArtist', 'More by {name}', {
                  name: a.artist.name,
                })}
              </Link>
            )}
            <details
              className="music-more"
              ref={moreMenu}
              onToggle={(e) => fitMoreMenu(e.currentTarget)}
            >
              <summary className="btn btn-quiet">
                {t('lumen.music.more', 'More')}
              </summary>
              <div className="music-more-menu">
                {a.artist.id && (
                  <Link
                    className="btn btn-quiet btn-sm"
                    to={`/collections/music/${encodeURIComponent(a.artist.id)}?view=discography&albumId=${encodeURIComponent(a.id)}`}
                  >
                    {t('lumen.music.viewDiscography', 'View Discography')}
                  </Link>
                )}
                <IndexerSearchLink category="music" title={a.title} />
                <AssociationLink mediaType="album" id={id} />
                <BlocklistButton
                  mediaType="music"
                  id={a.id}
                  requestedId={id}
                  title={a.title}
                  onChange={refresh}
                />
                <ReportIssueButton
                  type="music"
                  title={a.title}
                  media={a.mediaInfo}
                />
              </div>
            </details>
            <WatchlistButton mediaType="music" detail={a} requestedId={id} />
          </div>
          {/* Lidarr: the MP3/FLAC choice, each with its own availability */}
          {aurralConfigured === false && main && (
            <div className="dacts pc">{main}</div>
          )}
          {artistContributors.length > 0 && (
            <VideoDisclosure
              media="music"
              panel="artists"
              label={t('lumen.music.viewArtists', 'View Artists')}
              testId="music-artist-list"
            >
              <div className="toolbar">
                {artistContributors.map((artist) => (
                  <Link
                    key={artist.id.toLowerCase()}
                    className="chip"
                    to={`/artist/${encodeURIComponent(artist.id)}`}
                  >
                    {artist.name} · {artist.role}
                  </Link>
                ))}
              </div>
            </VideoDisclosure>
          )}
          <VideoDisclosure
            media="music"
            panel="subjectTags"
            label={t('lumen.detail.subjectTags', 'Subject Tags')}
            testId="music-subject-tags"
          >
            {musicTags.length > 0 ? (
              <div className="toolbar">
                {musicTags.map(({ tag }) => (
                  <Link
                    className="chip"
                    key={tag.toLocaleLowerCase()}
                    to={`/music?genre=${encodeURIComponent(tag)}`}
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="note">
                {t('lumen.detail.noSubjectTags', 'No subject tags.')}
              </p>
            )}
          </VideoDisclosure>
          <AlbumLibraryHealth releaseGroupId={a.id} />
          <div className="dcols">
            <div>
              <OpenIssueReports
                id="music-open-issues"
                mediaType="music"
                issues={a.mediaInfo?.issues}
              />
              {!!a.tracks?.length && (
                <>
                  <div className="h2">{t('lumen.music.tracks', 'Tracks')}</div>
                  {partlyOwned && (
                    <div className="music-owned">
                      <b>
                        {t(
                          'lumen.music.ownedOfTotal',
                          '{owned} of {total} songs in your library',
                          { owned: ownedCount, total: ownedTotal }
                        )}
                      </b>
                      <span
                        className="music-owned-bar"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={ownedTotal}
                        aria-valuenow={ownedCount}
                        aria-label={t('lumen.music.songsOwned', 'Songs owned')}
                      >
                        <i
                          style={{
                            width: `${Math.round((ownedCount / ownedTotal) * 100)}%`,
                          }}
                        />
                      </span>
                    </div>
                  )}
                  {trackNotice && (
                    <p className="note" role="status">
                      {trackNotice}
                    </p>
                  )}
                  {trackError && (
                    <p className="note" role="alert">
                      {trackError}
                    </p>
                  )}
                  <ol className="slist tlist">
                    {a.tracks.map((track, index) => {
                      const key =
                        track.recordingMbid ||
                        `${track.position}:${track.name}`;
                      const available = trackOwned(track);
                      // a requested or downloading album covers its songs
                      const requested =
                        rowRequested(track) || s?.k === 'wait' || s?.k === 'dl';
                      const rowDownloading = isSongDownloading(
                        downloadingKeysNow,
                        {
                          artistName: a.artist.name,
                          title: track.name,
                          albumTitle: a.title,
                          albumMbid: a.id,
                        }
                      );
                      const busy = requestingTracks.has(key);
                      return (
                        <li
                          key={`${key}-${index}`}
                          className={
                            available || !partlyOwned
                              ? 'trow trow--actions'
                              : 'trow trow--actions trow--missing'
                          }
                        >
                          <span className="tn">{track.position}</span>
                          <span>
                            <b>{track.name}</b>
                            {!!track.totalListenCount && (
                              <small>
                                {t('lumen.music.playCount', '{count} plays', {
                                  count: big(track.totalListenCount),
                                })}
                              </small>
                            )}
                          </span>
                          <span className="tl">{fmtTrack(track.length)}</span>
                          {(available || track.name) && (
                            <span className="trow-act song-acts">
                              {available ? (
                                <PlayButton
                                  className="btn btn-sm music-owned-btn"
                                  target={{
                                    kind: 'track',
                                    // a song kept on another release is found
                                    // by artist and title, not this album
                                    track: ownedHere(track)
                                      ? {
                                          title: track.name,
                                          artistName: a.artist.name,
                                          albumTitle: a.title,
                                          albumMbid: a.id,
                                        }
                                      : {
                                          title: track.name,
                                          artistName: a.artist.name,
                                        },
                                  }}
                                />
                              ) : (
                                <>
                                  {previews && (
                                    <PreviewButton
                                      track={{
                                        title: track.name,
                                        artistName: a.artist.name,
                                        albumTitle: a.title,
                                      }}
                                      cover={albumArt(
                                        a.posterPath,
                                        a.id,
                                        a.artist.name,
                                        a.title
                                      )}
                                    />
                                  )}
                                  {canRequestTrack && (
                                    <button
                                      type="button"
                                      className="btn btn-quiet btn-sm"
                                      disabled={busy || requested}
                                      onClick={() => void requestTrack(track)}
                                    >
                                      {busy
                                        ? t(
                                            'lumen.music.requestingTrack',
                                            'Requesting…'
                                          )
                                        : rowDownloading
                                          ? t(
                                              'lumen.status.downloading',
                                              'Downloading'
                                            )
                                          : requested
                                            ? t(
                                                'lumen.music.getting',
                                                'Getting…'
                                              )
                                            : t(
                                                'lumen.music.getSong',
                                                'Get song'
                                              )}
                                    </button>
                                  )}
                                </>
                              )}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}
            </div>
            <aside>
              <MusicRatings albumId={a.id} />
              <VideoDisclosure
                media="music"
                panel="details"
                label={t('lumen.detail.albumDetails', 'Album Details')}
              >
                <Facts
                  rows={[
                    [
                      t(
                        'components.MusicDetails.Layout.musicBrainz',
                        'MusicBrainz'
                      ),
                      MUSICBRAINZ_UUID.test(a.id) ? (
                        <a
                          href={`https://musicbrainz.org/release-group/${a.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {a.id}
                        </a>
                      ) : (
                        ''
                      ),
                    ],
                    [
                      t('lumen.music.fact.artist', 'Artist'),
                      <Link
                        key="a"
                        to={
                          a.artist.id
                            ? `/artist/${a.artist.id}`
                            : `/music?q=${encodeURIComponent(a.artist.name)}`
                        }
                      >
                        {a.artist.name}
                      </Link>,
                    ],
                    [t('lumen.music.fact.released', 'Released'), a.releaseDate],
                    [t('lumen.music.fact.label', 'Label'), a.recordLabel],
                    [
                      t(
                        'components.MusicDetails.Layout.artistType',
                        'Artist Type'
                      ),
                      a.artist.type,
                    ],
                    [
                      t('components.MusicDetails.Layout.origin', 'Origin'),
                      a.artist.area ? (
                        <a
                          href={`https://musicbrainz.org/search?${new URLSearchParams({ query: a.artist.area, type: 'area', method: 'indexed' })}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {a.artist.area}
                        </a>
                      ) : (
                        ''
                      ),
                    ],
                    [t('lumen.music.fact.type', 'Type'), a.type],
                  ]}
                />
              </VideoDisclosure>
            </aside>
          </div>
        </div>
        <div className="actionbar music-actionbar">
          <span className="ab-meta">
            <b>{a.title}</b>
            {a.artist.name}
          </span>
          {main ??
            (ownedCount > 0 ? (
              <PlayButton
                target={albumTarget}
                label={t('lumen.music.playAlbum', 'Play album')}
              />
            ) : null)}
        </div>
      </article>
      <SimilarArtists
        path={`/music/${encodeURIComponent(id ?? '')}/artist-similar`}
      />
      <MusicEditionCompare releaseGroupId={a.id} />
    </ExtraGate>
  );
}

export function Artist() {
  const { t } = useLumenLocale();
  const { id = '' } = useParams();
  const { user } = useAuth();
  const publicSettings = usePublicSettings();
  const musicServices = useApi<MusicServiceSummary[]>(
    user ? '/service/music' : null
  );
  const trackStatus = useApi<TrackRequestStatus>(
    user && publicSettings?.trackRequestsEnabled
      ? '/music/track-requests/status'
      : null
  );
  // Aurral or Lidarr: the music artist pages work with either
  const aurralConfigured = hasMusicPagesService(
    musicServices.data,
    trackStatus.data
  );
  // wait for both answers that can reveal Aurral, so the old page never flashes first
  const statusSettled =
    !user ||
    aurralConfigured ||
    (publicSettings != null && !publicSettings.trackRequestsEnabled) ||
    Boolean(trackStatus.data) ||
    Boolean(trackStatus.error);
  const servicesSettled =
    (Boolean(musicServices.data) || Boolean(musicServices.error) || !user) &&
    statusSettled;
  const aurralArtist =
    aurralConfigured &&
    canRequestMusic(user?.permissions) &&
    /^[0-9a-f-]{36}$/i.test(id);
  const {
    data: a,
    error,
    reload,
  } = useApi<ArtistDetails>(
    servicesSettled && !aurralArtist ? `/artist/${id}` : null
  );
  useMusicPrefetch(aurralArtist);
  const artistQueryName = a?.artist.name.trim() ?? '';
  const topSearch = useApi<AurralSearchResponse>(
    aurralConfigured && canRequestMusic(user?.permissions) && artistQueryName
      ? `/music/search?q=${encodeURIComponent(artistQueryName)}&limit=12`
      : null,
    { currentPathOnly: true }
  );
  const [expandedGroups, setExpandedGroups] = useState<Record<string, Album[]>>(
    {}
  );
  const [loadingGroups, setLoadingGroups] = useState<Record<string, boolean>>(
    {}
  );
  if (aurralArtist)
    return (
      <ExtraGate k="music">
        <AurralArtistView key={id} id={id} />
      </ExtraGate>
    );
  if (error)
    return (
      <ExtraGate k="music">
        <div className="empty">
          <b>
            {t('lumen.music.artistLoadFailure', 'Couldn’t load this artist')}
          </b>
          {error}
          <button
            type="button"
            className="btn btn-tonal btn-sm"
            onClick={reload}
          >
            {t('lumen.common.tryAgain', 'Try again')}
          </button>
        </div>
      </ExtraGate>
    );
  if (!a) return <div className="detail-loading" aria-busy="true" />;
  // Aurral finds a photo for most artists MusicBrainz has none for
  const artistImage =
    aurralConfigured && /^[0-9a-f-]{36}$/i.test(id)
      ? strictQuery(
          `/api/v1/music/artist-image/${encodeURIComponent(id)}?name=${encodeURIComponent(a.artist.name)}`
        )
      : undefined;
  const artistMbidLower = id.trim().toLowerCase();
  const artistNameLower = artistQueryName.toLowerCase();
  const topTracks = !topSearch.error
    ? (topSearch.data?.tracks ?? []).filter((track) => {
        if (
          track.artistMbid &&
          track.artistMbid.toLowerCase() === artistMbidLower
        ) {
          return true;
        }
        return track.artistName.trim().toLowerCase() === artistNameLower;
      })
    : [];
  const releaseCount = Object.values(a.typeCounts ?? {}).reduce(
    (count, total) => count + total,
    0
  );
  const totalReleases = releaseCount || a.releaseGroups.length;
  const groups = [
    'Album',
    'EP',
    'Single',
    'Live',
    'Compilation',
    'Remix',
    'Soundtrack',
    'Broadcast',
    'Demo',
    'Other',
  ].map((type) => ({
    type,
    title:
      type === 'Album'
        ? t('lumen.music.albums', 'Albums')
        : t(`lumen.music.releaseType.${type.toLowerCase()}`, type),
  }));
  const toggleGroup = async (
    type: string,
    total: number,
    releases: Album[]
  ) => {
    if (expandedGroups[type]) {
      setExpandedGroups((current) => {
        const next = { ...current };
        delete next[type];
        return next;
      });
      return;
    }
    if (releases.length >= total) {
      setExpandedGroups((current) => ({ ...current, [type]: releases }));
      return;
    }
    setLoadingGroups((current) => ({ ...current, [type]: true }));
    try {
      const pageSize = Math.min(total, 1000);
      const result = await api<ArtistDetails>(
        `/artist/${encodeURIComponent(id)}?albumType=${encodeURIComponent(type)}&pageSize=${pageSize}`
      );
      setExpandedGroups((current) => ({
        ...current,
        [type]: result.releaseGroups.filter((release) => release?.id),
      }));
    } catch {
      // Keep the initial release list usable and let the viewer retry.
    } finally {
      setLoadingGroups((current) => ({ ...current, [type]: false }));
    }
  };
  return (
    <ExtraGate k="music">
      <article className="detail">
        <DetailTop
          backdrop={a.artistBackdrop || artistImage}
          poster={a.artistThumb || artistImage}
          square
          title={a.artist.name}
          line={[
            a.artist.type,
            a.artist.area,
            a.artist.beginYear
              ? t('lumen.music.sinceYear', 'Since {year}', {
                  year: a.artist.beginYear,
                })
              : '',
            totalReleases === 1
              ? t('lumen.music.releaseCountOne', '{count} release', {
                  count: totalReleases,
                })
              : t('lumen.music.releaseCountMany', '{count} releases', {
                  count: totalReleases,
                }),
          ]}
        />
        <div className="dbody">
          <div className="dstatus">
            {topTracks.some((track) => track.inLibrary) && (
              <PlayButton
                target={{
                  kind: 'artist',
                  artist: { name: a.artist.name, mbid: id },
                }}
              />
            )}
            <FollowButton
              label={t(
                'components.ArtistDetails.followreleases',
                'Follow New Albums'
              )}
              subject={{
                kind: 'artist-release-type',
                subjectKey: `mb-artist:${id.toLowerCase()}`,
                subjectLabel: a.artist.name,
                conditions: {
                  includeTypes: ['Album'],
                  excludeTypes: ['Single', 'Compilation', 'Live', 'reissue'],
                  ref: { mbid: id.toLowerCase() },
                },
              }}
            />
            {canRequestMusic(user?.permissions) && (
              <Link
                className="btn btn-tonal btn-sm"
                to={`/collections/music/${encodeURIComponent(id)}?view=discography`}
              >
                {t(
                  'components.ArtistDetails.requestdiscography',
                  'Request Discography'
                )}
              </Link>
            )}
            <Link
              className="btn btn-tonal btn-sm"
              to={`/collections/music/${encodeURIComponent(id)}?view=discography`}
            >
              {t('lumen.music.viewDiscography', 'View Discography')}
            </Link>
            <Link
              className="btn btn-tonal btn-sm"
              to={{
                pathname: '/music',
                search: new URLSearchParams({
                  artist: a.artist.name,
                  artistId: id,
                }).toString(),
              }}
            >
              {t('lumen.music.filterByArtist', 'Filter Music by Artist')}
            </Link>
            <IndexerSearchLink category="music" title={a.artist.name} />
            <AssociationLink mediaType="artist" id={id} />
          </div>
          {(a.wikipedia?.content || a.wikipedia?.extract) && (
            <p className="ov">{a.wikipedia.content || a.wikipedia.extract}</p>
          )}
          {topTracks.length > 0 && (
            <Section title={t('lumen.music.topSongs', 'Top songs')}>
              <MusicSongList
                tracks={topTracks}
                maxItems={8}
                canRequest={
                  Boolean(publicSettings?.trackRequestsEnabled) &&
                  canRequestMusic(user?.permissions)
                }
              />
            </Section>
          )}
          <SimilarArtists path={`/artist/${encodeURIComponent(id)}/similar`} />
          {groups.map(({ type, title }) => {
            const releases = a.releaseGroups.filter(
              (release) =>
                (release.secondary_types?.[0] ??
                  release['primary-type'] ??
                  'Other') === type
            );
            const list = expandedGroups[type] ?? releases;
            const total = a.typeCounts?.[type] ?? releases.length;
            return list.length ? (
              <Section
                key={type}
                title={`${title} (${total})`}
                action={
                  total > 20 ? (
                    <button
                      className="btn btn-tonal btn-sm"
                      type="button"
                      disabled={loadingGroups[type]}
                      onClick={() => void toggleGroup(type, total, releases)}
                    >
                      {loadingGroups[type]
                        ? t('lumen.music.loading', 'Loading…')
                        : expandedGroups[type]
                          ? t('lumen.music.showLess', 'Show Less')
                          : t('lumen.music.showAll', 'Show All')}
                    </button>
                  ) : null
                }
              >
                <div className="sqg grid">
                  {list.map((release) => (
                    <AlbumCard key={release.id} a={release} />
                  ))}
                </div>
              </Section>
            ) : null;
          })}
          {!a.releaseGroups.length && (
            <div className="empty">
              <b>{t('lumen.music.noReleases', 'No releases listed')}</b>
              <Icon name="music" />
            </div>
          )}
        </div>
      </article>
    </ExtraGate>
  );
}

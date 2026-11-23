import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, MediaStatus, type RequestOptions } from '../api';
import { isAdministrator, useAuth } from '../auth';
import BlocklistButton from '../components/BlocklistButton';
import { MoreOnScroll, Section } from '../components/cards';
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
  ServiceNote,
  StatPill,
} from '../components/extra';
import FollowButton from '../components/FollowButton';
import { GenrePicker } from '../components/GenrePicker';
import IndexerSearchLink from '../components/IndexerSearchLink';
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
  type Album,
  type AlbumDetails,
  type ArtistDetails,
} from '../extras';
import { useApi, usePaged, usePublicSettings } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { useLiveMediaProgress } from '../useLiveDownloadProgress';
import { AssociationLink } from './Associations';

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
      confirm={t('components.Common.ButtonHelp.request', 'Request')}
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
              )
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
      ? '/search?' + new URLSearchParams({ query: term, type: 'artist' })
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

export const AlbumCard = ({ a }: { a: Album }) => (
  <ExtraCard
    href={`/music/${a.id}`}
    img={a.posterPath}
    title={a.title}
    shape="sq"
    titleKind="album"
    icon="music"
    stat={extraStat(a.mediaInfo)}
    watchlist={{ mediaType: 'music', id: a.id }}
    meta={[artistOf(a), (a['first-release-date'] || '').slice(0, 4)]
      .filter(Boolean)
      .join(' · ')}
  />
);

// Music: albums from MusicBrainz and ListenBrainz charts; requests go to Lidarr
export function Music() {
  const { t } = useLumenLocale();
  const releaseTypeOptions = RELEASE_TYPES.map(({ value, label }) => ({
    value,
    label: t(`lumen.music.releaseType.${value}`, label),
  }));
  const [p, setP] = useSearchParams();
  const query = p.get('q') || p.get('search') || '';
  const [q, setQ] = useState(query);
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
  const list = usePaged<Album>(`/discover/music?${qs}`);
  const upd = (k: string, v: string) => {
    const n = new URLSearchParams(p);
    if (k === 'sort') n.delete('sortBy');
    if (k === 'type') n.delete('releaseType');
    if (!v || (k === 'sort' && v === 'ranked')) n.delete(k);
    else n.set(k, v);
    setP(n, { replace: true });
  };
  useEffect(() => {
    const value = q.trim();
    if (value === query) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(p);
      next.delete('search');
      if (value) next.set('q', value);
      else next.delete('q');
      setP(next, { replace: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [p, q, query, setP]);
  useEffect(() => {
    setQ((value) => (value.trim() === query ? value : query));
  }, [query]);
  const { user } = useAuth();
  const visibility = discoveryVisibility(
    usePublicSettings(),
    user?.permissions
  );
  if (filters.has('availability')) visibility.hideAvailable = false;
  visibility.hideRequested = false;
  const items = list.items.filter((album) =>
    showDiscoveryTitle(album, visibility)
  );
  const filtered = items.length < list.items.length;

  return (
    <ExtraGate k="music">
      <ExtraHeader
        title={t('lumen.music.title', 'Music')}
        sub={t(
          'lumen.music.subtitle',
          'Request an album and it lands in your music library.'
        )}
      >
        <ExtraSearch
          value={q}
          onChange={setQ}
          placeholder={t(
            'lumen.music.searchPlaceholder',
            'Search albums and artists…'
          )}
        />
      </ExtraHeader>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/track-requests">
          {t('lumen.music.trackRequests', 'Track Requests')}
        </Link>
        <Link className="btn btn-quiet btn-sm" to="/music/playlist-import">
          {t('lumen.music.importPlaylist', 'Import Playlist')}
        </Link>
        {canUseRequestAccess(user?.permissions) && (
          <Link className="btn btn-quiet btn-sm" to="/music/collectors">
            {t('lumen.music.collectorPicks', 'Collector Picks')}
          </Link>
        )}
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
    </ExtraGate>
  );
}

export function AlbumDetail() {
  const { id } = useParams();
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const { data: a, error, refresh } = useApi<AlbumDetails>(`/music/${id}`);
  const progressMedia = useLiveMediaProgress(
    a?.mediaInfo,
    isAdministrator(user?.permissions)
  );
  if (error)
    return (
      <ExtraGate k="music">
        <div className="empty">
          <b>{t('lumen.music.albumLoadFailure', 'Couldn’t load this album')}</b>
          {error}
        </div>
      </ExtraGate>
    );
  if (!a) return <div className="detail-loading" aria-busy="true" />;
  const s = extraStat(progressMedia);
  const tags = (
    a.tags?.releaseGroup?.length ? a.tags.releaseGroup : a.tags?.artist || []
  )
    .sort((x, y) => y.count - x.count)
    .slice(0, 4)
    .map((t) => t.tag);
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
  const main = canRequestMusic(user?.permissions) ? (
    <MusicFormatRequestActions album={a} refresh={refresh} />
  ) : null;
  return (
    <ExtraGate k="music">
      <article className="detail">
        <DetailTop
          status={s}
          backdrop={a.artistBackdrop}
          poster={a.posterPath}
          square
          title={a.title}
          by={<Link to={`/artist/${a.artist.id}`}>{a.artist.name}</Link>}
          line={[
            (a.releaseDate || '').slice(0, 4),
            a.type,
            a.tracks?.length
              ? a.tracks.length === 1
                ? t('lumen.music.trackCountOne', '{count} track', {
                    count: a.tracks.length,
                  })
                : t('lumen.music.trackCountMany', '{count} tracks', {
                    count: a.tracks.length,
                  })
              : '',
            total
              ? t('lumen.music.durationMinutes', '{duration} min', {
                  duration: fmtTrack(total).replace(/:\d+$/, ''),
                })
              : '',
            tags.join(', '),
          ]}
        />
        <div className="dbody">
          <div className="dstatus">
            {canRequestMusic(user?.permissions) && (
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
            <StatPill s={s} />
            {!!a.stats?.totalListenCount && (
              <Pill k="neutral" icon="headphones">
                {t('lumen.music.plays', '{count} plays', {
                  count: big(a.stats.totalListenCount),
                })}
              </Pill>
            )}
            <Link
              className="btn btn-tonal btn-sm"
              to={`/collections/music/${encodeURIComponent(a.artist.id)}?view=discography&albumId=${encodeURIComponent(a.id)}`}
            >
              {t('lumen.music.viewDiscography', 'View Discography')}
            </Link>
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
            <WatchlistButton mediaType="music" detail={a} requestedId={id} />
          </div>
          {artistContributors.length > 0 && (
            <details className="adv" data-testid="music-artist-list">
              <summary>
                <Icon name="chev" size="sm" />
                {t('lumen.music.viewArtists', 'View Artists')}
              </summary>
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
            </details>
          )}
          <div className="dacts pc">{main}</div>
          <div className="dcols">
            <div>
              {!!a.tracks?.length && (
                <>
                  <div className="h2">{t('lumen.music.tracks', 'Tracks')}</div>
                  <ol className="slist tlist">
                    {a.tracks.map((track) => (
                      <li key={track.position} className="trow">
                        <span className="tn">{track.position}</span>
                        <span>
                          <b>{track.name}</b>
                          {!!track.totalListenCount && (
                            <small>
                              {t('lumen.music.plays', '{count} plays', {
                                count: big(track.totalListenCount),
                              })}
                            </small>
                          )}
                        </span>
                        <span className="tl">{fmtTrack(track.length)}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
            <aside>
              <VideoDisclosure
                media="music"
                panel="details"
                label={t('lumen.detail.albumDetails', 'Album Details')}
              >
                <Facts
                  rows={[
                    [
                      t('lumen.music.fact.artist', 'Artist'),
                      <Link key="a" to={`/artist/${a.artist.id}`}>
                        {a.artist.name}
                      </Link>,
                    ],
                    [t('lumen.music.fact.released', 'Released'), a.releaseDate],
                    [t('lumen.music.fact.label', 'Label'), a.recordLabel],
                    [t('lumen.music.fact.from', 'From'), a.artist.area],
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
          {main}
        </div>
      </article>
    </ExtraGate>
  );
}

export function Artist() {
  const { id = '' } = useParams();
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const { data: a, error } = useApi<ArtistDetails>(`/artist/${id}`);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, Album[]>>(
    {}
  );
  const [loadingGroups, setLoadingGroups] = useState<Record<string, boolean>>(
    {}
  );
  if (error)
    return (
      <ExtraGate k="music">
        <div className="empty">
          <b>
            {t('lumen.music.artistLoadFailure', 'Couldn’t load this artist')}
          </b>
          {error}
        </div>
      </ExtraGate>
    );
  if (!a) return <div className="detail-loading" aria-busy="true" />;
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
          backdrop={a.artistBackdrop}
          poster={a.artistThumb}
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
          {a.wikipedia?.extract && <p className="ov">{a.wikipedia.extract}</p>}
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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ApiError,
  mediaLink,
  MediaStatus,
  requestSeries,
  tmdbImg,
  youtubeTrailerUrl,
  type Paged,
  type RequestOptions,
  type SeasonRequestSelection,
  type TitleResult,
  type TvDetails,
} from '../api';
import { isAdministrator, useAuth, useMediaServerName } from '../auth';
import AnimeContinuation from '../components/AnimeContinuation';
import AvailabilitySubscriptionButton from '../components/AvailabilitySubscriptionButton';
import BlocklistButton from '../components/BlocklistButton';
import {
  Rail,
  Section,
  shortDate,
  StatLabel,
  statusOf,
  TitleCard,
} from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import {
  ActionBar,
  AdvancedOptions,
  canManageRequests,
  canRequestSeries,
  CreditsDisclosure,
  DetailTop,
  DiscoverDetailNavigation,
  Facts,
  fmtRun,
  originalLanguageLink,
  OverviewDisclosure,
  Pill,
  productionCountryLinks,
  SubjectTagsDisclosure,
  TrailerButton,
  VideoDisclosure,
} from '../components/detail';
import { EpisodeAvailabilityPanel } from '../components/EpisodeAvailabilityPanel';
import { ServiceNote } from '../components/extra';
import IndexerSearchLink from '../components/IndexerSearchLink';
import LiveTvAirings from '../components/LiveTvAirings';
import { ManageVideoSheet } from '../components/ManageVideoSheet';
import MediaServerCollectionsButton from '../components/MediaServerCollectionsButton';
import MediaServerSavedItemButton from '../components/MediaServerSavedItemButton';
import ReportIssueButton from '../components/ReportIssueButton';
import { useOffers4k, useVideoRequestQuota } from '../components/requestSheet';
import { useToast } from '../components/toast';
import TvCollectionLinks from '../components/TvCollectionLinks';
import TvEpisodeRequestSheet from '../components/TvEpisodeRequestSheet';
import VideoPlaybackButton from '../components/VideoPlaybackButton';
import VideoRatings from '../components/VideoRatings';
import WatchlistButton from '../components/WatchlistButton';
import { localToday } from '../dates';
import { friendlyError } from '../errors';
import { useApi, usePublicSettings, useVisibleMediaRefresh } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { scrollBehavior } from '../motion';
import { seasonList, seriesRequestSummary } from '../seriesRequestSummary';
import { usePrefs } from '../settings';
import { useTitleRegions } from '../streamingRegion';
import { useLiveMediaProgress } from '../useLiveDownloadProgress';
import {
  isSharedVideoCopy,
  isSharedVideoSeason,
  videoPlaybackMedia,
} from '../videoAvailability';
import { AssociationLink } from './Associations';

type SeasonState = 'have' | 'part' | 'asked' | 'none';
const stateOf = (status?: number): SeasonState =>
  status === MediaStatus.AVAILABLE
    ? 'have'
    : status === MediaStatus.PARTIAL
      ? 'part'
      : status === MediaStatus.PENDING || status === MediaStatus.PROCESSING
        ? 'asked'
        : 'none';

// request status: 1 waiting for approval, 2 approved (3 declined, 4 failed, 5 completed)
const live = (status?: number) => status === 1 || status === 2;

export default function TvDetail() {
  const { t: translate } = useLumenLocale();
  const serverName = useMediaServerName();
  const { user } = useAuth();
  const episodeQueue = useApi<{ defaultEpisodeCount: number }>(
    user?.id ? `/user/${user.id}/settings/episode-queue` : null
  ).data;

  const { id } = useParams();
  const [manageOpen, setManageOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const {
    data: t,
    error,
    reload,
    refresh,
    revalidate,
  } = useApi<TvDetails>(`/tv/${id}`, {
    currentPathOnly: true,
    keepDuringRefresh: true,
  });
  const like = useApi<Paged<TitleResult>>(`/tv/${id}/recommendations`).data;
  const similar = useApi<Paged<TitleResult>>(`/tv/${id}/similar`).data;
  const progressMedia = useLiveMediaProgress(
    t?.mediaInfo,
    isAdministrator(user?.permissions)
  );
  const pub = usePublicSettings();
  const { ratingRegion, streamingProviders } = useTitleRegions(
    t?.watchProviders,
    !!t?.contentRatings?.results.length,
    user?.id,
    pub
  );
  const { prefs } = usePrefs();
  const toast = useToast();
  const [sel, setSel] = useState<Set<number>>(new Set());
  const quota = useVideoRequestQuota('tv');
  const [opts, setOpts] = useState<RequestOptions>({});
  const [busy, setBusy] = useState(false);
  const episodeSubmission = useRef(false);
  const [episodesOpen, setEpisodesOpen] = useState(false);
  const [episodeError, setEpisodeError] = useState<string>();
  const [episodeOverride, setEpisodeOverride] = useState<{
    message: string;
    confirm: () => Promise<void>;
  }>();
  const [streamingOverride, setStreamingOverride] = useState<{
    seriesId: number;
    seasons: number[] | 'all';
    options: RequestOptions;
    message: string;
  }>();
  const [watchFailure, setWatchFailure] = useState<{
    selection: string;
    message: string;
    needsAccount: boolean;
  }>();
  const onOpts = useCallback((o: RequestOptions) => setOpts(o), []);
  // people who may request 4K series pick 1080p or 4K here, admins or not
  const offers4k = useOffers4k('tv');
  const params = new URLSearchParams(loc.search);
  const fourK = params.get('quality') === '4k';
  const setFourK = (selected: boolean) => {
    const next = new URLSearchParams(params);
    if (selected) next.set('quality', '4k');
    else next.delete('quality');
    navigate(
      { search: next.toString(), hash: loc.hash },
      { replace: true, preventScrollReset: true }
    );
  };
  const is4k = offers4k && fourK;
  const pending4k = (status?: number) =>
    status === MediaStatus.PENDING || status === MediaStatus.PROCESSING;
  useVisibleMediaRefresh(
    is4k &&
      (pending4k(t?.mediaInfo?.status4k) ||
        !!t?.mediaInfo?.seasons?.some(({ status4k }) => pending4k(status4k))),
    revalidate
  );

  const specials = pub?.enableSpecialEpisodes === true;
  const seasons = useMemo(
    () =>
      (t?.seasons || []).filter(
        (s) => s.seasonNumber > 0 || (specials && s.seasonNumber === 0)
      ),
    [t, specials]
  );
  const stat = useMemo(() => {
    const m = new Map<number, SeasonState>();
    for (const s of t?.mediaInfo?.seasons || [])
      m.set(s.seasonNumber, stateOf(is4k ? s.status4k : s.status));
    // SeerrNG only fills in mediaInfo.seasons once Sonarr has synced them, so a fresh request
    // shows up in the requests alone: its seasons count as asked until then
    for (const r of t?.mediaInfo?.requests || [])
      if (!!r.is4k === !!is4k && live(r.status))
        for (const s of r.seasons || [])
          if (
            live(s.status ?? r.status) &&
            (m.get(s.seasonNumber) ?? 'none') === 'none'
          )
            m.set(s.seasonNumber, 'asked');
    return m;
  }, [t, is4k]);
  const activeRequestSeasons = useMemo(() => {
    const requested = new Set<number>();
    for (const r of t?.mediaInfo?.requests || [])
      if (!!r.is4k === !!is4k && live(r.status))
        for (const s of r.seasons || [])
          if (live(s.status ?? r.status)) requested.add(s.seasonNumber);
    return requested;
  }, [t, is4k]);
  const missing = seasons
    .filter((s) => {
      const st = stat.get(s.seasonNumber) || 'none';
      return (
        (st === 'none' || st === 'part') &&
        !activeRequestSeasons.has(s.seasonNumber)
      );
    })
    .map((s) => s.seasonNumber);
  const mode = pub?.otherUsersAvailability;
  const coverage = t?.mediaInfo?.viewerRequestCoverage;
  const sharedSeasons = new Set(
    seasons
      .filter(({ seasonNumber }) => {
        const state = stat.get(seasonNumber);
        return (
          (state === 'have' || state === 'part') &&
          isSharedVideoSeason(coverage, seasonNumber, !!is4k, mode)
        );
      })
      .map(({ seasonNumber }) => seasonNumber)
  );
  const have = seasons.filter(
    ({ seasonNumber }) =>
      !sharedSeasons.has(seasonNumber) && stat.get(seasonNumber) === 'have'
  ).length;
  const part = seasons.filter(
    ({ seasonNumber }) =>
      !sharedSeasons.has(seasonNumber) && stat.get(seasonNumber) === 'part'
  ).length;
  const watchable = have + part > 0;
  // A series link opens the whole library entry, including any shared seasons.
  const canPlay = watchable && sharedSeasons.size === 0;
  const asked = seasons.filter(
    (s) =>
      stat.get(s.seasonNumber) === 'asked' ||
      (activeRequestSeasons.has(s.seasonNumber) &&
        stat.get(s.seasonNumber) !== 'have')
  ).length;
  // partial requests off on the server = it's the whole show or nothing
  const partialOk = pub?.partialRequestsEnabled !== false;

  // ticks reset when the show (or the defaults) change, not when a background refresh lands
  const showId = t?.id;
  useEffect(() => {
    setSel(new Set(prefs.wholeSeriesDefault || !partialOk ? missing : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId, prefs.wholeSeriesDefault, partialOk, is4k, specials]);
  // seasons that were just requested (or arrived) can no longer be ticked
  const missingKey = missing.join(',');
  useEffect(() => {
    setSel((x) => {
      const keep = [...x].filter((s) => missing.includes(s));
      return keep.length === x.size ? x : new Set(keep);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey]);
  const loaded = !!t;
  const seasonAnchor = /^#season-(0|[1-9]\d*)$/.exec(loc.hash)?.[1];
  const anchor =
    seasonAnchor !== undefined &&
    seasons.some(({ seasonNumber }) => String(seasonNumber) === seasonAnchor)
      ? `season-${seasonAnchor}`
      : loc.hash === '#seasons' || seasonAnchor !== undefined
        ? 'seasons'
        : undefined;
  useEffect(() => {
    if (loaded && anchor)
      document
        .getElementById(anchor)
        ?.scrollIntoView({ behavior: scrollBehavior() });
  }, [loaded, id, anchor]);

  if (error && !t)
    return (
      <ServiceNote
        error={error}
        what="this series"
        title={translate(
          'lumen.detail.loadSeries',
          'Couldn’t load this series'
        )}
        retry={reload}
      />
    );
  if (!t) return <div className="detail-loading" aria-busy="true" />;

  const n = sel.size;
  const requireApproval =
    !!n &&
    (quota.status?.restricted === true ||
      (!!quota.status?.limit && n > (quota.status.remaining ?? 0)));
  const selectedSeasons = [...sel].sort((a, b) => a - b);
  const selectionKey = JSON.stringify([
    t.id,
    is4k,
    opts.userId,
    selectedSeasons,
  ]);
  const gateFailure =
    watchFailure?.selection === selectionKey ? watchFailure : undefined;
  const watchRule =
    pub?.tvSeasonWatchGateEnabled === true ||
    user?.tvSeasonWatchGateStatus === 'enabled';
  const label = !n
    ? translate('lumen.tv.pickSeasons', 'Pick seasons')
    : n === missing.length && n > 1
      ? missing.length === seasons.length
        ? translate('lumen.tv.requestEntireSeries', 'Request entire series')
        : translate(
            asked
              ? 'lumen.tv.requestMoreSeasons'
              : 'lumen.tv.requestMissingSeasons',
            asked
              ? 'Request {count} more seasons'
              : 'Request {count} missing seasons',
            { count: n }
          )
      : n === 1
        ? translate('lumen.tv.requestSeason', 'Request {count} season', {
            count: n,
          })
        : translate('lumen.tv.requestSeasons', 'Request {count} seasons', {
            count: n,
          });
  const toggle = (sn: number) => {
    if (!partialOk) return;
    setSel((x) => {
      const y = new Set(x);
      if (y.has(sn)) y.delete(sn);
      else y.add(sn);
      return y;
    });
  };
  const blocklisted = t.mediaInfo?.status === MediaStatus.BLOCKLISTED;
  const pendingEpisodes = new Map<number, Set<number>>();
  const wholeRequests = new Set<number>();
  for (const request of t.mediaInfo?.requests ?? []) {
    if (!!request.is4k !== is4k || !live(request.status)) continue;
    for (const season of request.seasons ?? []) {
      if (!live(season.status ?? request.status)) continue;
      if (season.episodeNumbers == null) wholeRequests.add(season.seasonNumber);
      else {
        const covered =
          pendingEpisodes.get(season.seasonNumber) ?? new Set<number>();
        season.episodeNumbers.forEach((episode) => covered.add(episode));
        pendingEpisodes.set(season.seasonNumber, covered);
      }
    }
  }
  const episodeSeasons = seasons.filter(({ seasonNumber, episodeCount }) => {
    const media = t.mediaInfo?.seasons?.find(
      (item) => item.seasonNumber === seasonNumber
    );
    const status = is4k ? media?.status4k : media?.status;
    return (
      episodeCount > 0 &&
      !wholeRequests.has(seasonNumber) &&
      status !== MediaStatus.AVAILABLE &&
      status !== MediaStatus.BLOCKLISTED &&
      (status !== MediaStatus.PROCESSING || pendingEpisodes.has(seasonNumber))
    );
  });
  const canPickEpisodes =
    pub?.partialRequestsEnabled === true &&
    !blocklisted &&
    !(is4k && t.mediaInfo?.status4k === MediaStatus.BLOCKLISTED) &&
    !!episodeSeasons.length &&
    (is4k || canRequestSeries(user?.permissions));
  const episodeApproval =
    quota.status?.restricted === true ||
    (!!quota.status?.limit && (quota.status.remaining ?? 0) < 1);
  const submitEpisodes = async (
    selections: SeasonRequestSelection[],
    options: RequestOptions & { seasonRequests: SeasonRequestSelection[] } = {
      ...opts,
      is4k,
      seasonRequests: selections,
      requestQuotaApproval: episodeApproval || undefined,
    }
  ) => {
    if (busy || episodeSubmission.current || !canPickEpisodes) return;
    episodeSubmission.current = true;
    setBusy(true);
    setEpisodeError(undefined);
    try {
      const result = await requestSeries(
        t.id,
        selections.map(({ seasonNumber }) => seasonNumber),
        options
      );
      toast(
        result.quotaException
          ? `Approval requested for ${t.name || 'this series'}`
          : `Episodes requested for ${t.name || 'this series'}`
      );
      setEpisodesOpen(false);
      refresh();
      quota.refresh();
    } catch (error) {
      if (
        !options.bypassStreamingRequestPolicy &&
        error instanceof ApiError &&
        error.code === 'STREAMING_REQUEST_POLICY_REJECTED' &&
        error.allowOverride
      ) {
        setEpisodeOverride({
          message: error.message,
          confirm: () =>
            submitEpisodes(selections, {
              ...options,
              bypassStreamingRequestPolicy: true,
            }),
        });
      } else {
        setEpisodeError(
          friendlyError(error, 'Could not request episodes', (id, fallback) =>
            translate(id, fallback)
          )
        );
      }
      if (error instanceof ApiError && error.code === 'REQUEST_NOT_CONFIRMED')
        refresh();
    } finally {
      episodeSubmission.current = false;
      setBusy(false);
    }
  };
  const submitSeasons = async (
    requestedSeasons: number[] | 'all',
    options: RequestOptions
  ) => {
    if (busy) return;
    setStreamingOverride(undefined);
    setWatchFailure(undefined);
    setBusy(true);
    try {
      const result = await requestSeries(t.id, requestedSeasons, options);
      toast(
        result.quotaException
          ? `Approval requested for ${t.name || 'this series'}`
          : seriesRequestSummary(
              t.name || 'this series',
              result,
              !!options.is4k
            )
      );
      refresh();
      quota.refresh();
    } catch (e) {
      if (
        !options.bypassStreamingRequestPolicy &&
        e instanceof ApiError &&
        e.code === 'STREAMING_REQUEST_POLICY_REJECTED' &&
        e.allowOverride
      ) {
        setStreamingOverride({
          seriesId: t.id,
          seasons: requestedSeasons,
          options,
          message: e.message,
        });
      } else if (e instanceof ApiError && e.code === 'TV_SEASON_WATCH_GATE') {
        setWatchFailure({
          selection: selectionKey,
          message: friendlyError(
            e,
            'Could not verify the previous season. Try again.',
            (id, fallback) => translate(id, fallback)
          ),
          needsAccount: e.reason === 'account-required',
        });
        document
          .getElementById('seasons')
          ?.scrollIntoView({ behavior: scrollBehavior() });
      } else {
        toast(
          friendlyError(e, 'Request failed', (id, fallback) =>
            translate(id, fallback)
          )
        );
        if (e instanceof ApiError && e.code === 'REQUEST_NOT_CONFIRMED')
          refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const request = () => {
    if (!n || blocklisted) return;
    const whole = !partialOk || n === seasons.length;
    return submitSeasons(whole ? 'all' : selectedSeasons, {
      ...opts,
      ...(is4k ? { is4k: true } : {}),
      requestQuotaApproval: requireApproval || undefined,
    });
  };

  const today = localToday();
  const years = [
    (t.firstAirDate || '').slice(0, 4),
    t.status === 'Ended' && t.lastEpisodeToAir
      ? t.lastEpisodeToAir.airDate.slice(0, 4)
      : '',
  ].filter(Boolean);
  const rating = t.contentRatings?.results.find(
    (r) => r.iso_3166_1 === ratingRegion
  )?.rating;
  const statusLine = have
    ? have === seasons.length
      ? translate('lumen.tv.status.everySeasonOn', 'Every season on {server}', {
          server: serverName,
        })
      : translate(
          'lumen.tv.status.seasonsOn',
          '{have} of {total} seasons on {server}',
          { have, total: seasons.length, server: serverName }
        )
    : part
      ? translate('lumen.tv.status.partlyOn', 'Partly on {server}', {
          server: serverName,
        })
      : '';
  // the series' own state, as the poster glyph says it (downloading x%, requested, ...)
  const mine = statusOf(
    is4k && progressMedia
      ? {
          ...progressMedia,
          status: progressMedia.status4k ?? 1,
          status4k: undefined,
          downloadStatus: progressMedia.downloadStatus4k,
        }
      : progressMedia,
    false,
    serverName
  );
  const sharedAvailability =
    sharedSeasons.size > 0 ||
    (!watchable && isSharedVideoCopy(t.mediaInfo, !!is4k, mode));
  const visibleStatus =
    mine?.k === 'ok' && sharedAvailability
      ? watchable
        ? { ...mine, word: statusLine }
        : mode === 'distinguish'
          ? ({
              k: 'wait',
              word: translate(
                'lumen.tv.availableOthers',
                'Available to Other Users'
              ),
              ico: 'user',
            } as const)
          : null
      : mine;
  const playbackMedia = videoPlaybackMedia(t.mediaInfo, mode);
  const trailer = youtubeTrailerUrl(t.relatedVideos, pub?.youtubeUrl);
  const asks = (t.mediaInfo?.requests || []).filter(
    (r) => !!r.is4k === !!is4k && live(r.status)
  );
  const main = blocklisted ? (
    <button className="btn btn-tonal" disabled>
      {translate('lumen.tv.blocklisted', 'Blocklisted')}
    </button>
  ) : missing.length ? (
    <button className="btn btn-primary" disabled={!n || busy} onClick={request}>
      <Icon name="plus" />
      {requireApproval
        ? translate('lumen.tv.requestApproval', 'Request Approval')
        : label}
      {is4k ? translate('lumen.tv.in4k', ' in 4K') : ''}
    </button>
  ) : canPlay ? (
    <a
      className="btn btn-primary"
      {...mediaLink(playbackMedia, !!is4k, 'tv', serverName)}
    >
      <Icon name="play" />
      {translate('lumen.tv.watchOn', 'Watch on {server}', {
        server: serverName,
      })}
    </a>
  ) : sharedAvailability ? null : (
    <button className="btn btn-tonal" disabled>
      <Icon name={mine?.ico || 'clock'} />
      <StatLabel s={mine ?? { word: 'Requested' }} />
    </button>
  );
  return (
    <article className="detail">
      <DetailTop
        navigation={<DiscoverDetailNavigation id={t.id} mediaType="tv" />}
        status={visibleStatus}
        backdrop={tmdbImg(t.backdropPath, 'w1280')}
        poster={tmdbImg(t.posterPath)}
        title={t.name || ''}
        line={[
          years.join('–'),
          rating && <span className="cert">{rating}</span>,
          seasons.length === 1
            ? translate('lumen.tv.oneSeason', '{count} season', { count: 1 })
            : translate('lumen.tv.seasonCount', '{count} seasons', {
                count: seasons.length,
              }),
          t.episodeRunTime?.[0]
            ? translate('lumen.tv.episodesDuration', '{duration} episodes', {
                duration: fmtRun(t.episodeRunTime[0]),
              })
            : '',
          t.genres
            .filter((g) => g.id)
            .slice(0, 3)
            .map((g) => g.name)
            .join(', '),
        ]}
      />
      <div className="dbody">
        <ServiceNote
          error={error}
          what="this series"
          title={translate(
            'lumen.detail.loadSeries',
            'Couldn’t load this series'
          )}
          retry={reload}
        />
        <div className="dstatus">
          {episodeQueue && (
            <Pill
              k={episodeQueue.defaultEpisodeCount > 0 ? 'ok' : 'neutral'}
              icon="clock"
            >
              {episodeQueue.defaultEpisodeCount > 0
                ? translate(
                    episodeQueue.defaultEpisodeCount === 1
                      ? 'lumen.tv.episodeQueue.one'
                      : 'lumen.tv.episodeQueue.many',
                    episodeQueue.defaultEpisodeCount === 1
                      ? 'Episode Queue · 1 episode set by admin'
                      : 'Episode Queue · {count} episodes set by admin',
                    { count: episodeQueue.defaultEpisodeCount }
                  )
                : translate(
                    'lumen.tv.episodeQueue.off',
                    'Episode Queue · off · managed by admin'
                  )}
            </Pill>
          )}
          {watchable && (
            <Pill k="ok" icon="check">
              {statusLine}
            </Pill>
          )}
          {mode === 'distinguish' && sharedAvailability && (
            <Pill k="wait" icon="user">
              {translate(
                'lumen.tv.availableOthers',
                'Available to Other Users'
              )}
            </Pill>
          )}
          {asked > 0 && (
            <Pill k="wait" icon="clock">
              {asked === 1
                ? translate(
                    'lumen.tv.status.seasonRequested',
                    '1 season requested'
                  )
                : translate(
                    'lumen.tv.status.seasonsRequested',
                    '{count} seasons requested',
                    { count: asked }
                  )}
            </Pill>
          )}
          <VideoRatings
            mediaType="tv"
            id={t.id}
            voteAverage={t.voteAverage}
            voteCount={t.voteCount}
          />
          <LiveTvAirings
            key={`live-tv:${t.id}`}
            tmdbId={t.id}
            mediaType="tv"
            title={t.name}
            original={t.originalName}
          />
          <IndexerSearchLink category="tv" title={t.name} />
          <BlocklistButton
            mediaType="tv"
            id={t.id}
            requestedId={id}
            title={t.name}
            onChange={refresh}
          />
          <ReportIssueButton
            type="tv"
            title={t.name}
            media={t.mediaInfo}
            allow4k={offers4k}
            tvId={t.id}
          />
          <WatchlistButton key={t.id} mediaType="tv" detail={t} />
          <AvailabilitySubscriptionButton
            key={t.id}
            mediaType="tv"
            tmdbId={t.id}
          />
        </div>
        {[1, 2, 3].includes(pub?.mediaServerType ?? 0) && (
          <VideoDisclosure
            media="tv"
            panel="mediaServer"
            label={translate('lumen.tv.mediaServerDetails', 'Media Server')}
            testId="tv-media-server"
          >
            <div className="toolbar">
              {t.mediaInfo?.id &&
                user &&
                canRequestSeries(user.permissions) &&
                watchable && (
                  <VideoPlaybackButton
                    mediaId={t.mediaInfo.id}
                    is4k={!!is4k}
                    mediaType="tv"
                    blockedGroupIndexes={[...sharedSeasons]}
                    title={t.name || ''}
                  />
                )}
              <MediaServerSavedItemButton
                key={`media-server-saved:${t.id}:${pub?.mediaServerType}:${is4k}`}
                tvId={t.id}
                title={t.name || 'series'}
                serverType={pub!.mediaServerType!}
                is4k={!!is4k}
              />
              <MediaServerCollectionsButton
                key={`media-server-collections:${t.id}:${pub?.mediaServerType}:${is4k}`}
                tvId={t.id}
                serverType={pub!.mediaServerType!}
                is4k={!!is4k}
              />
            </div>
          </VideoDisclosure>
        )}
        <TvCollectionLinks key={t.id} id={t.id} />
        <div className="dacts pc">
          {t.mediaInfo?.id && canManageRequests(user?.permissions) && (
            <button
              className="btn btn-tonal"
              type="button"
              onClick={() => setManageOpen(true)}
            >
              <Icon name="list" />
              {translate('lumen.manageVideo.open', 'Manage')}
            </button>
          )}
          {main}
          {trailer && <TrailerButton href={trailer} />}
          {canPlay && missing.length > 0 && (
            <a
              className="btn btn-quiet"
              {...mediaLink(playbackMedia, !!is4k, 'tv', serverName)}
            >
              <Icon name="play" />
              {translate('lumen.tv.watchOn', 'Watch on {server}', {
                server: serverName,
              })}
            </a>
          )}
        </div>
        {asks.length > 0 && (
          <ul className="note request-summary rinfo">
            {asks.map((r) => {
              const ss = (r.seasons || [])
                .filter((x) => live(x.status ?? r.status))
                .map((x) => x.seasonNumber);
              return (
                <li key={r.id}>
                  {r.status === 1 ? (
                    translate(
                      'lumen.tv.waitingForApproval',
                      'Waiting for approval'
                    )
                  ) : mine?.k === 'dl' ? (
                    <StatLabel s={mine} />
                  ) : (
                    translate('lumen.tv.approved', 'Approved')
                  )}
                  {' · '}
                  {translate('lumen.tv.requestedBy', 'requested by {name}', {
                    name: r.requestedBy?.displayName || 'someone',
                  })}
                  {r.createdAt
                    ? ' · ' +
                      translate('lumen.tv.requestedOn', 'on {date}', {
                        date: shortDate(r.createdAt),
                      })
                    : ''}
                  {ss.length
                    ? ' · ' +
                      (ss.length === seasons.length
                        ? translate('lumen.tv.entireSeries', 'Entire series')
                        : seasonList(ss))
                    : ''}
                </li>
              );
            })}
          </ul>
        )}
        {offers4k && (
          <div
            className="seg"
            role="group"
            aria-label={translate(
              'lumen.browse.availabilityQuality',
              'Quality'
            )}
            style={{ justifySelf: 'start' }}
          >
            {(
              [
                [false, '1080p'],
                [true, '4K'],
              ] as [boolean, string][]
            ).map(([v, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={fourK === v}
                onClick={() => setFourK(v)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {missing.length > 0 && (
          // keyed by quality: 4K lists the 4K servers with their own defaults
          <AdvancedOptions
            key={is4k ? '4k' : 'hd'}
            kind="tv"
            series={{ id: t.id, tvdbId: t.externalIds?.tvdbId ?? null }}
            is4k={is4k}
            onChange={onOpts}
          />
        )}
        <div className="dcols">
          <div style={{ display: 'grid', gap: 22 }}>
            <OverviewDisclosure overview={t.overview} />
            <div id="seasons">
              <div className="sec-head">
                <h2>{translate('lumen.tv.seasons', 'Seasons')}</h2>
              </div>
              {watchRule && (
                <p className="note">
                  {translate(
                    'lumen.tv.laterSeasonNote',
                    'Later seasons may require finishing the previous regular season on your linked media server.'
                  )}
                </p>
              )}
              {gateFailure && (
                <div className="note" role="alert">
                  <p>{gateFailure.message}</p>
                  {gateFailure.needsAccount && (
                    <Link
                      className="btn btn-tonal btn-sm"
                      to="/me/account/linked-accounts"
                    >
                      Link Playback Account
                    </Link>
                  )}
                </div>
              )}
              {missing.length > 1 && (
                <p className="note" style={{ margin: '-4px 0 12px' }}>
                  {!partialOk
                    ? translate(
                        'lumen.tv.wholeShowOnly',
                        'This server requests whole shows only.'
                      )
                    : prefs.wholeSeriesDefault
                      ? (have
                          ? translate(
                              'lumen.tv.everythingMissingTicked',
                              'Everything you don’t have yet is ticked.'
                            )
                          : translate(
                              'lumen.tv.wholeShowTicked',
                              'The whole show is ticked.'
                            )) +
                        ' ' +
                        translate(
                          'lumen.tv.untickSeasons',
                          'Untick any seasons you don’t want.'
                        )
                      : translate(
                          'lumen.tv.tickSeasons',
                          'Tick the seasons you want.'
                        )}
                </p>
              )}
              {partialOk && missing.length > 1 && (
                <div className="shortcuts" style={{ marginBottom: 12 }}>
                  <button
                    className="chip"
                    onClick={() => setSel(new Set(missing))}
                  >
                    {missing.length === seasons.length
                      ? translate(
                          'lumen.tv.selectEntireSeries',
                          'Select entire series'
                        )
                      : translate(
                          'lumen.tv.allMissing',
                          'All missing ({count})',
                          { count: missing.length }
                        )}
                  </button>
                  <button
                    className="chip"
                    onClick={() => setSel(new Set([Math.max(...missing)]))}
                  >
                    Latest season only
                  </button>
                  <button className="chip" onClick={() => setSel(new Set())}>
                    Clear
                  </button>
                </div>
              )}
              {canPickEpisodes && (
                <div className="toolbar">
                  <button
                    className="btn btn-tonal btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEpisodeError(undefined);
                      setEpisodeOverride(undefined);
                      setEpisodesOpen(true);
                    }}
                  >
                    {translate(
                      'lumen.tvEpisodeRequest.open',
                      'Request Episodes'
                    )}
                  </button>
                </div>
              )}
              {episodesOpen && canPickEpisodes && (
                <TvEpisodeRequestSheet
                  key={String(is4k)}
                  tvId={t.id}
                  title={t.name ?? ''}
                  posterPath={t.posterPath}
                  year={t.firstAirDate?.slice(0, 4)}
                  seasons={episodeSeasons}
                  initialSeason={
                    seasonAnchor === undefined
                      ? undefined
                      : Number(seasonAnchor)
                  }
                  initialEpisode={
                    /^[1-9]\d{0,8}$/.test(params.get('episode') ?? '')
                      ? Number(params.get('episode'))
                      : undefined
                  }
                  pending={pendingEpisodes}
                  is4k={is4k}
                  approval={episodeApproval}
                  busy={busy}
                  error={episodeError}
                  streamingOverride={episodeOverride}
                  close={() => {
                    if (!busy) setEpisodesOpen(false);
                  }}
                  submit={submitEpisodes}
                />
              )}
              <div
                className="slist"
                role="group"
                aria-label={translate('lumen.tv.seasons', 'Seasons')}
              >
                {seasons.map((s) => {
                  const st = stat.get(s.seasonNumber) || 'none';
                  const requested =
                    st === 'asked' || activeRequestSeasons.has(s.seasonNumber);
                  const shared = sharedSeasons.has(s.seasonNumber);
                  const locked = st === 'have' || requested;
                  const on = locked || sel.has(s.seasonNumber);
                  const yr = s.airDate
                    ? s.airDate > today
                      ? translate('lumen.tv.premieres', 'Premieres {date}', {
                          date: shortDate(s.airDate),
                        })
                      : s.airDate.slice(0, 4)
                    : translate('lumen.tv.tba', 'TBA');
                  return (
                    <div
                      key={s.seasonNumber}
                      id={`season-${s.seasonNumber}`}
                      className={`srow ${locked ? 'locked' : ''}`}
                      role="checkbox"
                      aria-checked={on}
                      aria-disabled={locked || !partialOk}
                      tabIndex={locked ? -1 : 0}
                      onClick={() => !locked && toggle(s.seasonNumber)}
                      onKeyDown={(e) => {
                        if (!locked && (e.key === ' ' || e.key === 'Enter')) {
                          e.preventDefault();
                          toggle(s.seasonNumber);
                        }
                      }}
                    >
                      <span className="cbx">
                        <Icon name="check" />
                      </span>
                      <span>
                        <b>
                          {s.name ||
                            (s.seasonNumber === 0
                              ? translate('lumen.tv.specials', 'Specials')
                              : translate(
                                  'lumen.tvEpisodeRequest.seasonNumber',
                                  'Season {number}',
                                  { number: s.seasonNumber }
                                ))}
                        </b>
                        <small>
                          {s.episodeCount}{' '}
                          {s.episodeCount === 1
                            ? translate('lumen.tv.episode', 'episode')
                            : translate('lumen.tv.episodes', 'episodes')}{' '}
                          · {yr}
                        </small>
                      </span>
                      {shared && mode === 'distinguish' && (
                        <Pill k="wait" icon="user">
                          {translate(
                            'lumen.tv.availableOthers',
                            'Available to Other Users'
                          )}
                        </Pill>
                      )}
                      {!shared && st === 'have' && (
                        <Pill k="ok" icon="check">
                          {translate(
                            'lumen.tv.status.onServer',
                            'On {server}',
                            { server: serverName }
                          )}
                        </Pill>
                      )}
                      {!shared && st === 'part' && !requested && (
                        <Pill k="ok" icon="check">
                          {translate(
                            'lumen.tv.status.partlyOnServer',
                            'Partly on {server}',
                            { server: serverName }
                          )}
                        </Pill>
                      )}
                      {!shared && st === 'part' && requested && (
                        <Pill k="wait" icon="clock">
                          {translate(
                            'lumen.tv.status.partlyRequestedOnServer',
                            'Partly on {server} · Requested',
                            { server: serverName }
                          )}
                        </Pill>
                      )}
                      {requested &&
                        (shared || (st !== 'have' && st !== 'part')) && (
                          <Pill k="wait" icon="clock">
                            {translate('lumen.status.requested', 'Requested')}
                          </Pill>
                        )}
                    </div>
                  );
                })}
              </div>
            </div>
            {pub?.trackEpisodeAvailability === true && seasons.length > 0 && (
              <EpisodeAvailabilityPanel
                key={t.id}
                tvId={t.id}
                seasons={seasons}
                coverage={coverage}
              />
            )}
            <CreditsDisclosure
              key={`cast-${t.id}`}
              media="tv"
              credit="cast"
              people={t.credits?.cast}
            />
            <CreditsDisclosure
              key={`crew-${t.id}`}
              media="tv"
              credit="crew"
              people={t.credits?.crew}
            />
            <SubjectTagsDisclosure
              key={`tags-${t.id}`}
              media="tv"
              tags={t.keywords}
            />
            {trailer && (
              <div className="ph-only-row">
                <TrailerButton href={trailer} />
              </div>
            )}
          </div>
          <aside>
            <VideoDisclosure
              media="tv"
              panel="details"
              label={translate('lumen.detail.tvDetails', 'Series Details')}
            >
              <Facts
                rows={[
                  [
                    translate(
                      'lumen.tv.fact.streamingProviders',
                      'Streaming Providers'
                    ),
                    streamingProviders,
                  ],
                  [
                    translate(
                      'lumen.tv.fact.originalLanguage',
                      'Original Language'
                    ),
                    originalLanguageLink(t.originalLanguage, '/series'),
                  ],
                  [
                    translate(
                      'lumen.tv.fact.productionCountries',
                      'Production Countries'
                    ),
                    productionCountryLinks(t.productionCountries, '/series'),
                  ],
                  [
                    translate('lumen.tv.fact.network', 'Network'),
                    t.networks?.length
                      ? t.networks.map(({ id, name }, index) => (
                          <span key={`${id ?? name}:${index}`}>
                            {index > 0 && ', '}
                            {id &&
                            Number.isSafeInteger(id) &&
                            id > 0 &&
                            id <= 1_000_000_000 ? (
                              <Link to={`/series?network=${id}`}>{name}</Link>
                            ) : (
                              name
                            )}
                          </span>
                        ))
                      : null,
                  ],
                  [
                    translate('lumen.tv.fact.status', 'Status'),
                    t.status === 'Returning Series'
                      ? translate('lumen.tv.fact.stillAiring', 'Still airing')
                      : ((
                          {
                            Planned: translate(
                              'lumen.browse.seriesStatusOption.1',
                              'Planned'
                            ),
                            'In Production': translate(
                              'lumen.browse.seriesStatusOption.2',
                              'In Production'
                            ),
                            Ended: translate(
                              'lumen.browse.seriesStatusOption.3',
                              'Ended'
                            ),
                            Canceled: translate(
                              'lumen.browse.seriesStatusOption.4',
                              'Canceled'
                            ),
                            Pilot: translate(
                              'lumen.browse.seriesStatusOption.5',
                              'Pilot'
                            ),
                          } as Record<string, string>
                        )[t.status ?? ''] ?? t.status),
                  ],
                  [
                    translate('lumen.tv.fact.episodeLength', 'Episode length'),
                    fmtRun(t.episodeRunTime?.[0]),
                  ],
                  [
                    translate('lumen.tv.fact.createdBy', 'Created by'),
                    t.createdBy?.map((c) => c.name).join(', '),
                  ],
                  [
                    translate('lumen.tv.fact.lastAired', 'Last aired'),
                    t.lastEpisodeToAir
                      ? `S${t.lastEpisodeToAir.seasonNumber} E${t.lastEpisodeToAir.episodeNumber} · ${shortDate(t.lastEpisodeToAir.airDate)}`
                      : '',
                  ],
                  [
                    translate('lumen.tv.fact.nextEpisode', 'Next episode'),
                    t.nextEpisodeToAir
                      ? `S${t.nextEpisodeToAir.seasonNumber} E${t.nextEpisodeToAir.episodeNumber} · ${shortDate(t.nextEpisodeToAir.airDate)}`
                      : '',
                  ],
                ]}
              />
            </VideoDisclosure>
          </aside>
        </div>
        {t.originalLanguage === 'ja' &&
          t.genres?.some(({ id }) => id === 16) && (
            <AnimeContinuation
              key={id}
              source="tv"
              id={t.id}
              seasons={seasons.filter(({ seasonNumber }) => seasonNumber > 0)}
            />
          )}
        <Section
          title={translate('lumen.tv.relatedTitles', 'Related Titles')}
          link={[
            translate('lumen.tv.recommendations', 'Recommendations'),
            `/tv/${id}/recommendations`,
          ]}
        >
          <div className="toolbar">
            <AssociationLink mediaType="tv" id={id} />
            <Link className="chip" to={`/franchise/tv/${id}`}>
              {translate('lumen.tv.franchise', 'Franchise')}
            </Link>
          </div>
          {!!like?.results.length && (
            <Rail>
              {like.results.map((x) => (
                <TitleCard key={x.id} it={{ ...x, mediaType: 'tv' }} />
              ))}
            </Rail>
          )}
        </Section>
        {!!similar?.results.length && (
          <Section
            title={translate('lumen.tv.similar', 'Similar Series')}
            link={[
              translate('lumen.tv.similar', 'Similar Series'),
              `/tv/${id}/similar`,
            ]}
          >
            <Rail>
              {similar.results.map((item) => (
                <TitleCard key={item.id} it={{ ...item, mediaType: 'tv' }} />
              ))}
            </Rail>
          </Section>
        )}
      </div>
      <ActionBar
        title={t.name || ''}
        meta={
          statusLine ||
          translate('lumen.tv.seasonCount', '{count} seasons', {
            count: seasons.length,
          })
        }
      >
        {t.mediaInfo?.id && canManageRequests(user?.permissions) && (
          <button
            className="btn btn-tonal"
            type="button"
            onClick={() => setManageOpen(true)}
          >
            <Icon name="list" />
            {translate('lumen.manageVideo.open', 'Manage')}
          </button>
        )}
        {/* phones only get this bar: keep a way to watch the seasons already there */}
        {canPlay && missing.length > 0 && (
          <a
            className="icon-btn"
            aria-label={translate('lumen.tv.watchOn', 'Watch on {server}', {
              server: serverName,
            })}
            title={translate('lumen.tv.watchOn', 'Watch on {server}', {
              server: serverName,
            })}
            {...mediaLink(playbackMedia, !!is4k, 'tv', serverName)}
          >
            <Icon name="play" />
          </a>
        )}
        {main}
      </ActionBar>
      {manageOpen && t.mediaInfo?.id && (
        <ManageVideoSheet
          kind="tv"
          title={t.name || ''}
          year={t.firstAirDate?.slice(0, 4)}
          media={
            t.mediaInfo as NonNullable<typeof t.mediaInfo> & { id: number }
          }
          onClose={() => setManageOpen(false)}
          onUpdated={refresh}
          mediaServerType={pub?.mediaServerType}
          tmdbId={t.id}
        />
      )}
      {streamingOverride?.seriesId === t.id && (
        <ConfirmSheet
          title={translate(
            'lumen.tv.streamingPolicy',
            'Streaming Request Policy'
          )}
          body={streamingOverride.message}
          confirm={translate('lumen.tv.requestAnyway', 'Request Anyway')}
          cancel={translate('lumen.tv.cancel', 'Cancel')}
          onClose={() => setStreamingOverride(undefined)}
          onConfirm={() =>
            submitSeasons(streamingOverride.seasons, {
              ...streamingOverride.options,
              bypassStreamingRequestPolicy: true,
            })
          }
        />
      )}
    </article>
  );
}

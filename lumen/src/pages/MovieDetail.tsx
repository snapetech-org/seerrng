import { useCallback, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ApiError,
  mediaLink,
  MediaStatus,
  requestMovie,
  tmdbImg,
  youtubeTrailerUrl,
  type MovieDetails,
  type Paged,
  type RequestOptions,
  type TitleResult,
} from '../api';
import { isAdministrator, useAuth, useMediaServerName } from '../auth';
import AvailabilitySubscriptionButton from '../components/AvailabilitySubscriptionButton';
import BlocklistButton from '../components/BlocklistButton';
import {
  Rail,
  Section,
  shortDate,
  StatLabel,
  statusOf,
  TitleCard,
  withoutPending4k,
} from '../components/cards';
import type { MovieCollection } from '../components/CollectionRequestSheet';
import { ConfirmSheet } from '../components/ConfirmSheet';
import {
  ActionBar,
  AdvancedOptions,
  canRequest4k,
  canRequestMovies,
  CreditsDisclosure,
  DetailTop,
  DiscoverDetailNavigation,
  Facts,
  fmtRun,
  originalLanguageLink,
  Pill,
  productionCountryLinks,
  SubjectTagsDisclosure,
  TrailerButton,
  VideoDisclosure,
} from '../components/detail';
import { ServiceNote } from '../components/extra';
import IndexerSearchLink from '../components/IndexerSearchLink';
import LiveTvAirings from '../components/LiveTvAirings';
import ReportIssueButton from '../components/ReportIssueButton';
import { useVideoRequestQuota } from '../components/requestSheet';
import { useToast } from '../components/toast';
import VideoPlaybackButton from '../components/VideoPlaybackButton';
import WatchlistButton from '../components/WatchlistButton';
import { localToday } from '../dates';
import { friendlyError } from '../errors';
import { useApi, usePublicSettings, useVisibleMediaRefresh } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { useTitleRegions } from '../streamingRegion';
import { useLiveMediaProgress } from '../useLiveDownloadProgress';
import { isSharedVideoCopy, videoPlaybackMedia } from '../videoAvailability';
import { AssociationLink } from './Associations';

const releaseKinds = new Map([
  [3, 'Theatrical'],
  [4, 'Digital'],
  [5, 'Physical'],
]);

const usd = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function movieCurrency(value?: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? usd.format(value)
    : '';
}

function MovieCollectionSummary({ id, name }: { id: number; name: string }) {
  const { t } = useLumenLocale();
  const { data, error, reload } = useApi<MovieCollection>(`/collection/${id}`);
  const collection = data?.id === id ? data : undefined;

  return (
    <section className="card" data-testid="movie-collection-summary">
      <h2>
        <Link to={`/collection/${id}`}>{collection?.name || name}</Link>
      </h2>
      {collection?.overview ? <p>{collection.overview}</p> : null}
      {collection ? (
        <p>
          {t('lumen.movie.collectionSize', 'Collection size: {count} movies', {
            count: collection.parts.length,
          })}
        </p>
      ) : error ? (
        <div role="status">
          <span>
            {t(
              'lumen.movie.collectionLoadFailed',
              'Collection details could not be loaded.'
            )}
          </span>{' '}
          <button className="chip" type="button" onClick={() => void reload()}>
            {t('lumen.common.retry', 'Retry')}
          </button>
        </div>
      ) : (
        <p role="status">
          {t('lumen.movie.collectionLoading', 'Loading collection details…')}
        </p>
      )}
    </section>
  );
}

export default function MovieDetail() {
  const { t } = useLumenLocale();
  const serverName = useMediaServerName();
  const { id } = useParams();
  const [quality] = useSearchParams();
  const {
    data: m,
    error,
    reload,
    refresh,
    revalidate,
  } = useApi<MovieDetails>(`/movie/${id}`, {
    currentPathOnly: true,
    keepDuringRefresh: true,
  });
  const selected4k = quality.get('quality') === '4k';
  const status4k = m?.mediaInfo?.status4k;
  useVisibleMediaRefresh(
    selected4k &&
      (status4k === MediaStatus.PENDING || status4k === MediaStatus.PROCESSING),
    revalidate
  );
  const like = useApi<Paged<TitleResult>>(`/movie/${id}/recommendations`).data;
  const pub = usePublicSettings();
  const { user } = useAuth();
  const { ratingRegion, streamingProviders } = useTitleRegions(
    m?.watchProviders,
    !!m?.releases?.results.length,
    user?.id,
    pub
  );

  const progressMedia = useLiveMediaProgress(
    m?.mediaInfo,
    isAdministrator(user?.permissions)
  );
  const can4k = !!user && canRequest4k(user.permissions, 'movie');
  const toast = useToast();
  const quota = useVideoRequestQuota('movie');
  const requireApproval = quota.status?.restricted === true;
  const [opts, setOpts] = useState<RequestOptions>({});
  const [busy, setBusy] = useState(false);
  const [override, setOverride] = useState<{
    movieId: number;
    options: RequestOptions;
    message: string;
  }>();
  const onOpts = useCallback((o: RequestOptions) => setOpts(o), []);

  if (error && !m)
    return (
      <ServiceNote
        error={error}
        what="this movie"
        title={t('lumen.detail.loadMovie', 'Couldn’t load this movie')}
        retry={reload}
      />
    );
  if (!m) return <div className="detail-loading" aria-busy="true" />;

  const regionReleases =
    m.releases?.results.find((release) => release.iso_3166_1 === ratingRegion)
      ?.release_dates ?? [];
  const certification = regionReleases.find(
    (release) => release.certification
  )?.certification;
  const releaseDates = new Map<number, { label: string; date: string }>();
  for (const release of regionReleases) {
    const label = releaseKinds.get(release.type);
    const day = release.release_date?.slice(0, 10);
    if (!label || !day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const date = new Date(day);
    if (Number.isFinite(date.valueOf()) && date.toISOString().startsWith(day))
      releaseDates.set(release.type, { label, date: day });
  }

  // A pending 4K copy must not make the independent HD request look requested.
  const requestMedia = withoutPending4k(progressMedia);
  const s = statusOf(requestMedia, false, serverName);
  const mode = pub?.otherUsersAvailability;
  const visibleStatus = statusOf(requestMedia, false, serverName, mode);
  const playableStatus =
    mode === 'distinguish'
      ? statusOf(requestMedia, false, serverName, 'hide')
      : visibleStatus;
  const shared4k = isSharedVideoCopy(m.mediaInfo, true, mode);
  const blocklisted = m.mediaInfo?.status === MediaStatus.BLOCKLISTED;
  const s4k = m.mediaInfo?.status4k;
  const progress4k =
    s4k === MediaStatus.PROCESSING && progressMedia?.downloadStatus4k?.length
      ? statusOf(
          { status: s4k, downloadStatus: progressMedia.downloadStatus4k },
          false,
          serverName
        )
      : null;
  const available4k =
    s4k === MediaStatus.AVAILABLE || s4k === MediaStatus.PARTIAL;
  const visible4k = available4k && !(shared4k && mode === 'hide');
  const canPlaySelectedQuality = selected4k
    ? visible4k
    : playableStatus?.k === 'ok';
  const fourKLabel = shared4k
    ? t('lumen.status.shared', 'Available to Other Users')
    : s4k === MediaStatus.PARTIAL
      ? t('lumen.status.partlyOnServer', 'Partly on {server}', {
          server: serverName,
        })
      : t('lumen.status.onServer', 'On {server}', { server: serverName });
  const date = m.releaseDate || '';
  const unreleased = date > localToday();
  const director = (m.credits?.crew || [])
    .filter((c) => c.job === 'Director')
    .map((c) => c.name)
    .join(', ');
  const trailer = youtubeTrailerUrl(m.relatedVideos, pub?.youtubeUrl);
  // a 4K copy is in hand or on its way (requested, downloading, partly or fully there)
  const has4k =
    !!s4k && s4k >= MediaStatus.PENDING && s4k <= MediaStatus.AVAILABLE;
  const submit = async (options: RequestOptions) => {
    if (busy) return;
    setBusy(true);
    setOverride(undefined);
    try {
      const result = await requestMovie(m.id, options);
      toast(
        result.quotaException
          ? `Approval requested for ${m.title}`
          : `Requested ${m.title}${options.is4k ? ' in 4K' : ''}`
      );
      refresh();
      quota.refresh();
    } catch (error) {
      if (
        !options.bypassStreamingRequestPolicy &&
        error instanceof ApiError &&
        error.code === 'STREAMING_REQUEST_POLICY_REJECTED' &&
        error.allowOverride
      ) {
        setOverride({ movieId: m.id, options, message: error.message });
      } else {
        toast(
          friendlyError(error, 'Request failed', (id, fallback) =>
            t(id, fallback)
          )
        );
      }
    } finally {
      setBusy(false);
    }
  };
  const request = (force4k = false) => {
    // A dedicated 4K request must use the 4K server's defaults.
    const destination =
      force4k && !opts.is4k
        ? { is4k: true, userId: opts.userId }
        : { ...opts, is4k: force4k || !!opts.is4k };
    return submit({
      ...destination,
      requestQuotaApproval: requireApproval || undefined,
    });
  };

  const playback = videoPlaybackMedia(m.mediaInfo, mode);
  const fourKPlayback =
    selected4k && visible4k && !shared4k
      ? mediaLink(
          {
            mediaUrl4k: playback?.mediaUrl4k,
            iOSPlexUrl4k: playback?.iOSPlexUrl4k,
          },
          true,
          'movie',
          serverName
        )
      : undefined;
  const main = fourKPlayback?.href ? (
    <a className="btn btn-primary" {...fourKPlayback}>
      <Icon name="play" />
      {t('lumen.movie.watch4kOn', 'Watch 4K on {server}', {
        server: serverName,
      })}
    </a>
  ) : playableStatus?.k === 'ok' ? (
    <a
      className="btn btn-primary"
      {...mediaLink(playback, false, 'movie', serverName)}
    >
      <Icon name="play" />
      {t('lumen.tv.watchOn', 'Watch on {server}', { server: serverName })}
    </a>
  ) : s ? (
    visibleStatus && (
      <button className="btn btn-tonal" disabled>
        <Icon name={visibleStatus.ico} />
        <StatLabel s={visibleStatus} />
      </button>
    )
  ) : (
    <button
      className="btn btn-primary"
      disabled={busy}
      onClick={() => request()}
    >
      <Icon name="plus" />
      {requireApproval
        ? t('lumen.movie.action.requestApproval', 'Request Approval')
        : unreleased
          ? t(
              'lumen.movie.action.requestOnRelease',
              'Request · downloads on release'
            )
          : t('lumen.movie.action.request', 'Request')}
    </button>
  );
  // offered whether or not the HD copy is here or requested: they're separate files
  const fourK =
    !blocklisted && pub?.movie4kEnabled && can4k && !has4k ? (
      <button
        className="btn btn-quiet"
        disabled={busy}
        onClick={() => request(true)}
      >
        <Icon name="plus" />
        {requireApproval
          ? t('lumen.movie.action.request4kApproval', 'Request 4K Approval')
          : t('lumen.movie.action.request4k', 'Request 4K')}
      </button>
    ) : null;
  const trailerBtn = trailer ? <TrailerButton href={trailer} /> : null;

  return (
    <article className="detail">
      <DetailTop
        navigation={<DiscoverDetailNavigation id={m.id} mediaType="movie" />}
        status={visibleStatus}
        backdrop={tmdbImg(m.backdropPath, 'w1280')}
        poster={tmdbImg(m.posterPath)}
        title={m.title || ''}
        line={[
          unreleased
            ? t('lumen.movie.theaters', 'In theaters {date}', {
                date: shortDate(date),
              })
            : date.slice(0, 4),
          certification && <span className="cert">{certification}</span>,
          fmtRun(m.runtime),
          m.genres
            .filter((g) => g.id)
            .slice(0, 3)
            .map((g) => g.name)
            .join(', '),
        ]}
      />
      <div className="dbody">
        <ServiceNote error={error} what="this movie" retry={reload} />
        {selected4k && !fourKPlayback?.href && (
          <p className="note" role="status">
            {t(
              'lumen.movie.playbackUnavailable',
              '4K playback is unavailable.'
            )}
          </p>
        )}
        <div className="dstatus">
          {visibleStatus && (
            <Pill k={visibleStatus.k} icon={visibleStatus.ico}>
              <StatLabel s={visibleStatus} />
            </Pill>
          )}
          {visible4k && (
            <Pill
              k={shared4k ? 'wait' : 'ok'}
              icon={shared4k ? 'user' : 'check'}
            >
              {shared4k
                ? `4K · ${t('lumen.status.shared', 'Available to Other Users')}`
                : s4k === MediaStatus.PARTIAL
                  ? `4K · ${t(
                      'lumen.status.partlyOnServer',
                      'Partly on {server}',
                      {
                        server: serverName,
                      }
                    )}`
                  : t('lumen.status.on4kServer', '4K on {server}', {
                      server: serverName,
                    })}
            </Pill>
          )}
          {(s4k === MediaStatus.PENDING || s4k === MediaStatus.PROCESSING) && (
            <Pill k={progress4k?.k ?? 'wait'} icon={progress4k?.ico ?? 'clock'}>
              {progress4k ? (
                <>
                  4K · <StatLabel s={progress4k} />
                </>
              ) : (
                '4K requested'
              )}
            </Pill>
          )}
          {!!m.voteAverage && (
            <Pill k="neutral" icon="star">
              {m.voteAverage.toFixed(1)} / 10
            </Pill>
          )}
          <LiveTvAirings
            key={`live-tv:${m.id}`}
            tmdbId={m.id}
            mediaType="movie"
            title={m.title}
            original={m.originalTitle}
          />
          <IndexerSearchLink category="movie" title={m.title} />
          <BlocklistButton
            mediaType="movie"
            id={m.id}
            requestedId={id}
            title={m.title}
            onChange={refresh}
          />
          <ReportIssueButton
            type="movie"
            title={m.title}
            media={m.mediaInfo}
            allow4k={!!pub?.movie4kEnabled && can4k}
          />
          <WatchlistButton key={m.id} mediaType="movie" detail={m} />
          <AvailabilitySubscriptionButton
            key={m.id}
            mediaType="movie"
            tmdbId={m.id}
          />
          {m.mediaInfo?.id &&
            user &&
            canRequestMovies(user.permissions) &&
            canPlaySelectedQuality &&
            (!selected4k || (visible4k && !!pub?.movie4kEnabled && can4k)) && (
              <VideoPlaybackButton
                mediaId={m.mediaInfo.id}
                is4k={selected4k}
                title={m.title || ''}
              />
            )}
        </div>
        <div className="dacts pc">
          {main}
          {fourK}
          {trailerBtn}
        </div>
        {m.collection && (
          <VideoDisclosure
            media="movie"
            panel="collection"
            label={t('lumen.movie.collection', 'Collection')}
            testId="movie-collection"
            deferChildrenUntilOpen
          >
            <MovieCollectionSummary
              id={m.collection.id}
              name={m.collection.name}
            />
          </VideoDisclosure>
        )}
        {!s && (
          <AdvancedOptions
            key={pub?.movie4kEnabled && can4k && !has4k ? 'with-4k' : 'hd'}
            kind="movie"
            is4k={false}
            allow4k={!!pub?.movie4kEnabled && can4k && !has4k}
            onChange={onOpts}
          />
        )}
        <div className="dcols">
          <div style={{ display: 'grid', gap: 22 }}>
            {m.tagline && <p className="tagline">{m.tagline}</p>}
            <p className="ov">{m.overview}</p>
            <CreditsDisclosure
              key={`cast-${m.id}`}
              media="movie"
              credit="cast"
              people={m.credits?.cast}
            />
            <CreditsDisclosure
              key={`crew-${m.id}`}
              media="movie"
              credit="crew"
              people={m.credits?.crew}
            />
            <SubjectTagsDisclosure
              key={`tags-${m.id}`}
              media="movie"
              tags={m.keywords}
            />
            {(fourK || trailerBtn) && (
              <div className="ph-only-row">
                {fourK}
                {trailerBtn}
              </div>
            )}
          </div>
          <aside>
            <VideoDisclosure
              media="movie"
              panel="details"
              label={t('lumen.detail.movieDetails', 'Movie Details')}
            >
              <Facts
                rows={[
                  [
                    t(
                      'lumen.movie.fact.streamingProviders',
                      'Streaming Providers'
                    ),
                    streamingProviders,
                  ],
                  [
                    t('lumen.movie.fact.originalLanguage', 'Original Language'),
                    originalLanguageLink(m.originalLanguage, '/movies'),
                  ],
                  [
                    t(
                      'lumen.movie.fact.productionCountries',
                      'Production Countries'
                    ),
                    productionCountryLinks(m.productionCountries, '/movies'),
                  ],
                  [
                    t(
                      'lumen.movie.fact.productionStudios',
                      'Production Studios'
                    ),
                    m.productionCompanies?.length
                      ? m.productionCompanies.map(({ id, name }, index) => (
                          <span key={`${id}:${index}`}>
                            {index > 0 && ', '}
                            {Number.isSafeInteger(id) &&
                            id > 0 &&
                            id <= 1_000_000_000 ? (
                              <Link to={`/movies?studio=${id}`}>{name}</Link>
                            ) : (
                              name
                            )}
                          </span>
                        ))
                      : null,
                  ],
                  [t('lumen.movie.fact.status', 'Status'), m.status],
                  [t('lumen.movie.fact.runtime', 'Runtime'), fmtRun(m.runtime)],
                  [
                    t('lumen.movie.fact.budget', 'Budget'),
                    movieCurrency(m.budget),
                  ],
                  [
                    t('lumen.movie.fact.revenue', 'Revenue'),
                    movieCurrency(m.revenue),
                  ],
                  [
                    releaseDates.size > 1
                      ? t('lumen.movie.fact.releaseDates', 'Release Dates')
                      : t('lumen.movie.fact.released', 'Released'),
                    releaseDates.size
                      ? [...releaseDates.values()].map(
                          ({ label, date }, index) => (
                            <span key={label}>
                              {index > 0 && <br />}
                              {label} · {shortDate(date, false)},{' '}
                              {date.slice(0, 4)}
                            </span>
                          )
                        )
                      : date
                        ? `${shortDate(date, false)}, ${date.slice(0, 4)}`
                        : '',
                  ],
                  [t('lumen.movie.fact.director', 'Director'), director],
                  [t('lumen.movie.fact.rated', 'Rated'), certification],
                  [
                    t('lumen.movie.fact.collection', 'Collection'),
                    m.collection && (
                      <Link to={`/collection/${m.collection.id}`}>
                        {m.collection.name}
                      </Link>
                    ),
                  ],
                  [
                    '4K',
                    pub?.movie4kEnabled
                      ? available4k
                        ? visible4k
                          ? fourKLabel
                          : ''
                        : has4k
                          ? t('lumen.movie.fact.requested', 'Requested')
                          : t('lumen.movie.fact.notYet', 'Not yet')
                      : '',
                  ],
                ]}
              />
            </VideoDisclosure>
          </aside>
        </div>
        <Section
          title={t('lumen.movie.relatedTitles', 'Related Titles')}
          link={['Recommendations', `/movie/${id}/recommendations`]}
          action={
            <Link to={`/movie/${id}/similar`}>
              {t('lumen.movie.similar', 'Similar Movies')}
            </Link>
          }
        >
          <div className="toolbar">
            <AssociationLink mediaType="movie" id={id} />
          </div>
          {!!like?.results.length && (
            <Rail>
              {like.results.map((x) => (
                <TitleCard key={x.id} it={{ ...x, mediaType: 'movie' }} />
              ))}
            </Rail>
          )}
        </Section>
      </div>
      <ActionBar
        title={m.title || ''}
        meta={[fmtRun(m.runtime), certification].filter(Boolean).join(' · ')}
      >
        {main}
      </ActionBar>
      {override?.movieId === m.id && (
        <ConfirmSheet
          title={t('lumen.movie.policy.title', 'Streaming Request Policy')}
          body={override.message}
          confirm={t('lumen.movie.policy.requestAnyway', 'Request Anyway')}
          cancel={t('lumen.movie.policy.cancel', 'Cancel')}
          onClose={() => setOverride(undefined)}
          onConfirm={() =>
            submit({ ...override.options, bypassStreamingRequestPolicy: true })
          }
        />
      )}
    </article>
  );
}

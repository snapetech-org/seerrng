import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  mediaLink,
  MediaStatus,
  requestMovie,
  tmdbImg,
  type MovieDetails,
  type Paged,
  type RequestOptions,
  type TitleResult,
} from '../api';
import { isAdministrator, useAuth, useMediaServerName } from '../auth';
import BlocklistButton from '../components/BlocklistButton';
import {
  Rail,
  Section,
  shortDate,
  statusOf,
  TitleCard,
  withoutPending4k,
} from '../components/cards';
import {
  ActionBar,
  AdvancedOptions,
  canRequest4k,
  CreditsDisclosure,
  DetailTop,
  Facts,
  fmtRun,
  Pill,
  productionCountryLinks,
  SubjectTagsDisclosure,
} from '../components/detail';
import { ServiceNote } from '../components/extra';
import IndexerSearchLink from '../components/IndexerSearchLink';
import LiveTvAirings from '../components/LiveTvAirings';
import ReportIssueButton from '../components/ReportIssueButton';
import { useToast } from '../components/toast';
import WatchlistButton from '../components/WatchlistButton';
import { localToday } from '../dates';
import { friendlyError } from '../errors';
import { useApi, usePublicSettings } from '../hooks';
import { Icon } from '../icons';
import { useLiveMediaProgress } from '../useLiveDownloadProgress';
import { isSharedVideoCopy, videoPlaybackMedia } from '../videoAvailability';
import { AssociationLink } from './Associations';

const cert = (m: MovieDetails) =>
  m.releases?.results
    .find((r) => r.iso_3166_1 === 'US')
    ?.release_dates.find((d) => d.certification)?.certification || '';

export default function MovieDetail() {
  const serverName = useMediaServerName();
  const { id } = useParams();
  const {
    data: m,
    error,
    reload,
    refresh,
  } = useApi<MovieDetails>(`/movie/${id}`);
  const like = useApi<Paged<TitleResult>>(`/movie/${id}/recommendations`).data;
  const pub = usePublicSettings();
  const { user } = useAuth();
  const progressMedia = useLiveMediaProgress(
    m?.mediaInfo,
    isAdministrator(user?.permissions)
  );
  const can4k = !!user && canRequest4k(user.permissions, 'movie');
  const toast = useToast();
  const [opts, setOpts] = useState<RequestOptions>({});
  const [busy, setBusy] = useState(false);
  const onOpts = useCallback((o: RequestOptions) => setOpts(o), []);

  if (error)
    return <ServiceNote error={error} what="this movie" retry={reload} />;
  if (!m) return <div className="detail-loading" aria-busy="true" />;

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
  const fourKLabel = shared4k
    ? 'Available to Other Users'
    : s4k === MediaStatus.PARTIAL
      ? `Partly on ${serverName}`
      : `On ${serverName}`;
  const date = m.releaseDate || '';
  const unreleased = date > localToday();
  const director = (m.credits?.crew || [])
    .filter((c) => c.job === 'Director')
    .map((c) => c.name)
    .join(', ');
  const trailer = m.relatedVideos?.find(
    (v) => v.type === 'Trailer' && v.site === 'YouTube'
  );
  // a 4K copy is in hand or on its way (requested, downloading, partly or fully there)
  const has4k =
    !!s4k && s4k >= MediaStatus.PENDING && s4k <= MediaStatus.AVAILABLE;
  const request = async (force4k = false) => {
    // Advanced options may have picked a 4K server; the Request 4K button always means 4K
    const is4k = force4k || !!opts.is4k;
    setBusy(true);
    try {
      // the Request 4K button ignores options chosen for an HD server and keeps only who
      // it's for, so SeerrNG uses the 4K server's own defaults
      await requestMovie(
        m.id,
        force4k && !opts.is4k
          ? { is4k: true, userId: opts.userId }
          : { ...opts, is4k }
      );
      toast(`Requested ${m.title}${is4k ? ' in 4K' : ''}`);
      refresh();
    } catch (e) {
      toast(friendlyError(e, 'Request failed'));
    } finally {
      setBusy(false);
    }
  };

  const main =
    playableStatus?.k === 'ok' ? (
      <a
        className="btn btn-primary"
        {...mediaLink(
          videoPlaybackMedia(m.mediaInfo, mode),
          false,
          'movie',
          serverName
        )}
      >
        <Icon name="play" />
        Watch on {serverName}
      </a>
    ) : s ? (
      visibleStatus && (
        <button className="btn btn-tonal" disabled>
          <Icon name={visibleStatus.ico} />
          {visibleStatus.word}
        </button>
      )
    ) : (
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={() => request()}
      >
        <Icon name="plus" />
        {unreleased ? 'Request · downloads on release' : 'Request'}
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
        Request 4K
      </button>
    ) : null;
  const trailerBtn = trailer ? (
    <a
      className="btn btn-quiet"
      href={trailer.url}
      target="_blank"
      rel="noreferrer"
    >
      <Icon name="play" />
      Trailer
    </a>
  ) : null;

  return (
    <article className="detail">
      <DetailTop
        status={visibleStatus}
        backdrop={tmdbImg(m.backdropPath, 'w1280')}
        poster={tmdbImg(m.posterPath)}
        title={m.title || ''}
        line={[
          unreleased ? 'In theaters ' + shortDate(date) : date.slice(0, 4),
          cert(m) && <span className="cert">{cert(m)}</span>,
          fmtRun(m.runtime),
          m.genres
            .filter((g) => g.id)
            .slice(0, 3)
            .map((g) => g.name)
            .join(', '),
        ]}
      />
      <div className="dbody">
        <div className="dstatus">
          {visibleStatus && (
            <Pill k={visibleStatus.k} icon={visibleStatus.ico}>
              {visibleStatus.word}
            </Pill>
          )}
          {visible4k && (
            <Pill
              k={shared4k ? 'wait' : 'ok'}
              icon={shared4k ? 'user' : 'check'}
            >
              {shared4k
                ? '4K · Available to Other Users'
                : s4k === MediaStatus.PARTIAL
                  ? `4K partly on ${serverName}`
                  : `4K on ${serverName}`}
            </Pill>
          )}
          {(s4k === MediaStatus.PENDING || s4k === MediaStatus.PROCESSING) && (
            <Pill k={progress4k?.k ?? 'wait'} icon={progress4k?.ico ?? 'clock'}>
              {progress4k ? `4K · ${progress4k.word}` : '4K requested'}
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
        </div>
        <div className="dacts pc">
          {main}
          {fourK}
          {trailerBtn}
        </div>
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
            <Facts
              rows={[
                [
                  'Production Countries',
                  productionCountryLinks(m.productionCountries, '/movies'),
                ],
                [
                  'Production Studios',
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
                ['Runtime', fmtRun(m.runtime)],
                [
                  'Released',
                  date ? `${shortDate(date, false)}, ${date.slice(0, 4)}` : '',
                ],
                ['Director', director],
                ['Rated', cert(m)],
                [
                  'Collection',
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
                        ? 'Requested'
                        : 'Not yet'
                    : '',
                ],
              ]}
            />
          </aside>
        </div>
        <Section
          title="Related Titles"
          link={['Recommendations', `/movie/${id}/recommendations`]}
          action={<Link to={`/movie/${id}/similar`}>Similar Movies</Link>}
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
        meta={[fmtRun(m.runtime), cert(m)].filter(Boolean).join(' · ')}
      >
        {main}
      </ActionBar>
    </article>
  );
}

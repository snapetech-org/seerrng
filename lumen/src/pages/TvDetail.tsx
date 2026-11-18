import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  ApiError,
  mediaLink,
  MediaStatus,
  requestSeries,
  tmdbImg,
  type Paged,
  type RequestOptions,
  type TitleResult,
  type TvDetails,
} from '../api';
import { isAdministrator, useAuth, useMediaServerName } from '../auth';
import BlocklistButton from '../components/BlocklistButton';
import {
  Rail,
  Section,
  shortDate,
  statusOf,
  TitleCard,
} from '../components/cards';
import {
  ActionBar,
  AdvancedOptions,
  CreditsDisclosure,
  DetailTop,
  Facts,
  fmtRun,
  Pill,
  productionCountryLinks,
  SubjectTagsDisclosure,
} from '../components/detail';
import { EpisodeAvailabilityPanel } from '../components/EpisodeAvailabilityPanel';
import { ServiceNote } from '../components/extra';
import IndexerSearchLink from '../components/IndexerSearchLink';
import ReportIssueButton from '../components/ReportIssueButton';
import { useOffers4k } from '../components/requestSheet';
import { useToast } from '../components/toast';
import WatchlistButton from '../components/WatchlistButton';
import { localToday } from '../dates';
import { friendlyError } from '../errors';
import { useApi, usePublicSettings } from '../hooks';
import { Icon } from '../icons';
import { scrollBehavior } from '../motion';
import { seasonList, seriesRequestSummary } from '../seriesRequestSummary';
import { usePrefs } from '../settings';
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
  const serverName = useMediaServerName();
  const { user } = useAuth();
  const { id } = useParams();
  const loc = useLocation();
  const { data: t, error, reload, refresh } = useApi<TvDetails>(`/tv/${id}`);
  const like = useApi<Paged<TitleResult>>(`/tv/${id}/recommendations`).data;
  const progressMedia = useLiveMediaProgress(
    t?.mediaInfo,
    isAdministrator(user?.permissions)
  );
  const pub = usePublicSettings();
  const { prefs } = usePrefs();
  const toast = useToast();
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [opts, setOpts] = useState<RequestOptions>({});
  const [busy, setBusy] = useState(false);
  const [watchFailure, setWatchFailure] = useState<{
    selection: string;
    message: string;
    needsAccount: boolean;
  }>();
  const onOpts = useCallback((o: RequestOptions) => setOpts(o), []);
  // people who may request 4K series pick 1080p or 4K here, admins or not
  const offers4k = useOffers4k('tv');
  const [fourK, setFourK] = useState(false);
  const is4k = offers4k && fourK;

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
  useEffect(() => {
    if (t && loc.hash === '#seasons')
      document
        .getElementById('seasons')
        ?.scrollIntoView({ behavior: scrollBehavior() });
  }, [t, loc.hash]);

  if (error)
    return <ServiceNote error={error} what="this series" retry={reload} />;
  if (!t) return <div className="detail-loading" aria-busy="true" />;

  const n = sel.size;
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
    ? 'Pick seasons'
    : n === missing.length && n > 1
      ? missing.length === seasons.length
        ? 'Request entire series'
        : `Request ${n} ${asked ? 'more' : 'missing'} seasons`
      : `Request ${n}${asked > 0 ? ' more' : ''} season${n === 1 ? '' : 's'}`;
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
  const request = async () => {
    if (!n || blocklisted || busy) return;
    setWatchFailure(undefined);
    setBusy(true);
    try {
      const whole = !partialOk || n === seasons.length;
      const result = await requestSeries(
        t.id,
        whole ? 'all' : selectedSeasons,
        is4k ? { ...opts, is4k: true } : opts
      );
      toast(seriesRequestSummary(t.name || 'this series', result, is4k));
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'TV_SEASON_WATCH_GATE') {
        setWatchFailure({
          selection: selectionKey,
          message: friendlyError(
            e,
            'Could not verify the previous season. Try again.'
          ),
          needsAccount: e.reason === 'account-required',
        });
        document
          .getElementById('seasons')
          ?.scrollIntoView({ behavior: scrollBehavior() });
      } else {
        toast(friendlyError(e, 'Request failed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const today = localToday();
  const years = [
    (t.firstAirDate || '').slice(0, 4),
    t.status === 'Ended' && t.lastEpisodeToAir
      ? t.lastEpisodeToAir.airDate.slice(0, 4)
      : '',
  ].filter(Boolean);
  const rating = t.contentRatings?.results.find(
    (r) => r.iso_3166_1 === 'US'
  )?.rating;
  const statusLine = have
    ? `${have === seasons.length ? 'Every season' : `${have} of ${seasons.length} seasons`} on ${serverName}`
    : part
      ? `Partly on ${serverName}`
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
              word: 'Available to Other Users',
              ico: 'user',
            } as const)
          : null
      : mine;
  const playbackMedia = videoPlaybackMedia(t.mediaInfo, mode);
  const asks = (t.mediaInfo?.requests || []).filter(
    (r) => !!r.is4k === !!is4k && live(r.status)
  );
  const main = blocklisted ? (
    <button className="btn btn-tonal" disabled>
      Blocklisted
    </button>
  ) : missing.length ? (
    <button className="btn btn-primary" disabled={!n || busy} onClick={request}>
      <Icon name="plus" />
      {label}
      {is4k ? ' in 4K' : ''}
    </button>
  ) : canPlay ? (
    <a
      className="btn btn-primary"
      {...mediaLink(playbackMedia, !!is4k, 'tv', serverName)}
    >
      <Icon name="play" />
      Watch on {serverName}
    </a>
  ) : sharedAvailability ? null : (
    <button className="btn btn-tonal" disabled>
      <Icon name={mine?.ico || 'clock'} />
      {mine?.word || 'Requested'}
    </button>
  );
  return (
    <article className="detail">
      <DetailTop
        status={visibleStatus}
        backdrop={tmdbImg(t.backdropPath, 'w1280')}
        poster={tmdbImg(t.posterPath)}
        title={t.name || ''}
        line={[
          years.join('–'),
          rating && <span className="cert">{rating}</span>,
          `${seasons.length} season${seasons.length === 1 ? '' : 's'}`,
          t.episodeRunTime?.[0]
            ? fmtRun(t.episodeRunTime[0]) + ' episodes'
            : '',
          t.genres
            .filter((g) => g.id)
            .slice(0, 3)
            .map((g) => g.name)
            .join(', '),
        ]}
      />
      <div className="dbody">
        <div className="dstatus">
          {watchable && (
            <Pill k="ok" icon="check">
              {statusLine}
            </Pill>
          )}
          {mode === 'distinguish' && sharedAvailability && (
            <Pill k="wait" icon="user">
              Available to Other Users
            </Pill>
          )}
          {asked > 0 && (
            <Pill k="wait" icon="clock">
              {asked === 1 ? '1 season' : asked + ' seasons'} requested
            </Pill>
          )}
          {!!t.voteAverage && (
            <Pill k="neutral" icon="star">
              {t.voteAverage.toFixed(1)} / 10
            </Pill>
          )}
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
        </div>
        <div className="dacts pc">
          {main}
          {canPlay && missing.length > 0 && (
            <a
              className="btn btn-quiet"
              {...mediaLink(playbackMedia, !!is4k, 'tv', serverName)}
            >
              <Icon name="play" />
              Watch on {serverName}
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
                  {r.status === 1
                    ? 'Waiting for approval'
                    : mine?.k === 'dl'
                      ? mine.word
                      : 'Approved'}
                  {' · requested by '}
                  {r.requestedBy?.displayName || 'someone'}
                  {r.createdAt ? ' on ' + shortDate(r.createdAt) : ''}
                  {ss.length
                    ? ' · ' +
                      (ss.length === seasons.length
                        ? 'Entire series'
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
            aria-label="Quality"
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
            is4k={is4k}
            onChange={onOpts}
          />
        )}
        <div className="dcols">
          <div style={{ display: 'grid', gap: 22 }}>
            <p className="ov">{t.overview}</p>
            <div id="seasons">
              <div className="sec-head">
                <h2>Seasons</h2>
              </div>
              {watchRule && (
                <p className="note">
                  Later seasons may require finishing the previous regular
                  season on your linked media server.
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
                    ? 'This server requests whole shows only.'
                    : prefs.wholeSeriesDefault
                      ? (have
                          ? 'Everything you don’t have yet is ticked.'
                          : 'The whole show is ticked.') +
                        ' Untick any seasons you don’t want.'
                      : 'Tick the seasons you want.'}
                </p>
              )}
              {partialOk && missing.length > 1 && (
                <div className="shortcuts" style={{ marginBottom: 12 }}>
                  <button
                    className="chip"
                    onClick={() => setSel(new Set(missing))}
                  >
                    {missing.length === seasons.length
                      ? 'Entire series'
                      : `All missing (${missing.length})`}
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
              <div className="slist" role="group" aria-label="Seasons">
                {seasons.map((s) => {
                  const st = stat.get(s.seasonNumber) || 'none';
                  const requested =
                    st === 'asked' || activeRequestSeasons.has(s.seasonNumber);
                  const shared = sharedSeasons.has(s.seasonNumber);
                  const locked = st === 'have' || requested;
                  const on = locked || sel.has(s.seasonNumber);
                  const yr = s.airDate
                    ? s.airDate > today
                      ? 'Premieres ' + shortDate(s.airDate)
                      : s.airDate.slice(0, 4)
                    : 'TBA';
                  return (
                    <div
                      key={s.seasonNumber}
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
                              ? 'Specials'
                              : `Season ${s.seasonNumber}`)}
                        </b>
                        <small>
                          {s.episodeCount} episode
                          {s.episodeCount === 1 ? '' : 's'} · {yr}
                        </small>
                      </span>
                      {shared && mode === 'distinguish' && (
                        <Pill k="wait" icon="user">
                          Available to Other Users
                        </Pill>
                      )}
                      {!shared && st === 'have' && (
                        <Pill k="ok" icon="check">
                          On {serverName}
                        </Pill>
                      )}
                      {!shared && st === 'part' && !requested && (
                        <Pill k="ok" icon="check">
                          Partly on {serverName}
                        </Pill>
                      )}
                      {!shared && st === 'part' && requested && (
                        <Pill k="wait" icon="clock">
                          Partly on {serverName} · Requested
                        </Pill>
                      )}
                      {requested &&
                        (shared || (st !== 'have' && st !== 'part')) && (
                          <Pill k="wait" icon="clock">
                            Requested
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
          </div>
          <aside>
            <Facts
              rows={[
                [
                  'Production Countries',
                  productionCountryLinks(t.productionCountries, '/series'),
                ],
                [
                  'Network',
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
                  'Status',
                  t.status === 'Returning Series' ? 'Still airing' : t.status,
                ],
                ['Episode length', fmtRun(t.episodeRunTime?.[0])],
                ['Created by', t.createdBy?.map((c) => c.name).join(', ')],
                [
                  'Last aired',
                  t.lastEpisodeToAir
                    ? `S${t.lastEpisodeToAir.seasonNumber} E${t.lastEpisodeToAir.episodeNumber} · ${shortDate(t.lastEpisodeToAir.airDate)}`
                    : '',
                ],
                [
                  'Next episode',
                  t.nextEpisodeToAir
                    ? `S${t.nextEpisodeToAir.seasonNumber} E${t.nextEpisodeToAir.episodeNumber} · ${shortDate(t.nextEpisodeToAir.airDate)}`
                    : '',
                ],
              ]}
            />
          </aside>
        </div>
        <Section
          title="Related Titles"
          link={['Recommendations', `/tv/${id}/recommendations`]}
          action={<Link to={`/tv/${id}/similar`}>Similar Series</Link>}
        >
          <div className="toolbar">
            <AssociationLink mediaType="tv" id={id} />
            <Link className="chip" to={`/franchise/tv/${id}`}>
              Franchise
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
      </div>
      <ActionBar
        title={t.name || ''}
        meta={statusLine || `${seasons.length} seasons`}
      >
        {/* phones only get this bar: keep a way to watch the seasons already there */}
        {canPlay && missing.length > 0 && (
          <a
            className="icon-btn"
            aria-label={`Watch on ${serverName}`}
            title={`Watch on ${serverName}`}
            {...mediaLink(playbackMedia, !!is4k, 'tv', serverName)}
          >
            <Icon name="play" />
          </a>
        )}
        {main}
      </ActionBar>
    </article>
  );
}

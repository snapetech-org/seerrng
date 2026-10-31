import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  MediaStatus,
  plexUrl,
  requestSeries,
  tmdbImg,
  type Paged,
  type RequestOptions,
  type TitleResult,
  type TvDetails,
} from '../api';
import { Rail, Section, shortDate, TitleCard } from '../components/cards';
import {
  ActionBar,
  AdvancedOptions,
  DetailTop,
  Facts,
  fmtRun,
  People,
  Pill,
} from '../components/detail';
import { useToast } from '../components/toast';
import { dropCache, useApi, usePublicSettings } from '../hooks';
import { Icon } from '../icons';
import { usePrefs } from '../settings';

type SeasonState = 'have' | 'part' | 'asked' | 'none';
const stateOf = (status?: number): SeasonState =>
  status === MediaStatus.AVAILABLE
    ? 'have'
    : status === MediaStatus.PARTIAL
      ? 'part'
      : status === MediaStatus.PENDING || status === MediaStatus.PROCESSING
        ? 'asked'
        : 'none';

export default function TvDetail() {
  const { id } = useParams();
  const loc = useLocation();
  const { data: t, error, reload } = useApi<TvDetails>(`/tv/${id}`);
  const like = useApi<Paged<TitleResult>>(`/tv/${id}/recommendations`).data;
  const pub = usePublicSettings();
  const { prefs } = usePrefs();
  const toast = useToast();
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [opts, setOpts] = useState<RequestOptions>({});
  const [busy, setBusy] = useState(false);
  const onOpts = useCallback((o: RequestOptions) => setOpts(o), []);

  const seasons = useMemo(
    () => (t?.seasons || []).filter((s) => s.seasonNumber > 0),
    [t]
  );
  const stat = useMemo(() => {
    const m = new Map<number, SeasonState>();
    for (const s of t?.mediaInfo?.seasons || [])
      m.set(s.seasonNumber, stateOf(s.status));
    return m;
  }, [t]);
  const missing = seasons
    .filter((s) => {
      const st = stat.get(s.seasonNumber) || 'none';
      return st === 'none' || st === 'part';
    })
    .map((s) => s.seasonNumber);
  const have = seasons.filter(
    (s) => stat.get(s.seasonNumber) === 'have'
  ).length;
  // partial requests off on the server = it's the whole show or nothing
  const partialOk = pub?.partialRequestsEnabled !== false;

  useEffect(() => {
    setSel(new Set(prefs.wholeSeriesDefault || !partialOk ? missing : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, prefs.wholeSeriesDefault, partialOk]);
  useEffect(() => {
    if (t && loc.hash === '#seasons')
      document
        .getElementById('seasons')
        ?.scrollIntoView({ behavior: 'smooth' });
  }, [t, loc.hash]);

  if (error)
    return (
      <div className="empty">
        <b>Couldn’t load this series</b>
        {error}
      </div>
    );
  if (!t) return <div className="detail-loading" aria-busy="true" />;

  const n = sel.size;
  const label = !n
    ? 'Pick seasons'
    : n === missing.length && n > 1
      ? missing.length === seasons.length
        ? 'Request entire series'
        : `Request ${n} missing seasons`
      : `Request ${n} season${n === 1 ? '' : 's'}`;
  const toggle = (sn: number) => {
    if (!partialOk) return;
    setSel((x) => {
      const y = new Set(x);
      if (y.has(sn)) y.delete(sn);
      else y.add(sn);
      return y;
    });
  };
  const request = async () => {
    if (!n) return;
    setBusy(true);
    try {
      const whole = n === seasons.length;
      await requestSeries(
        t.id,
        whole ? 'all' : [...sel].sort((a, b) => a - b),
        opts
      );
      toast(
        `Requested ${t.name} · ${whole ? 'entire series' : n === 1 ? 'Season ' + [...sel][0] : n + ' seasons'}`
      );
      dropCache(`/tv/${t.id}`);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

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
    ? `${have === seasons.length ? 'Every season' : `${have} of ${seasons.length} seasons`} on Plex`
    : '';
  const main = missing.length ? (
    <button className="btn btn-primary" disabled={!n || busy} onClick={request}>
      <Icon name="plus" />
      {label}
    </button>
  ) : (
    <a
      className="btn btn-primary"
      href={plexUrl(t.mediaInfo)}
      target="_blank"
      rel="noreferrer"
    >
      <Icon name="play" />
      Watch on Plex
    </a>
  );
  const asked = seasons.filter(
    (s) => stat.get(s.seasonNumber) === 'asked'
  ).length;

  return (
    <article className="detail">
      <DetailTop
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
          {have > 0 && (
            <Pill k="ok" icon="check">
              {statusLine}
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
        </div>
        <div className="dacts pc">
          {main}
          {have > 0 && missing.length > 0 && (
            <a
              className="btn btn-quiet"
              href={plexUrl(t.mediaInfo)}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="play" />
              Watch on Plex
            </a>
          )}
        </div>
        {missing.length > 0 && (
          <AdvancedOptions kind="tv" is4k={false} onChange={onOpts} />
        )}
        <div className="dcols">
          <div style={{ display: 'grid', gap: 22 }}>
            <p className="ov">{t.overview}</p>
            <div id="seasons">
              <div className="sec-head">
                <h2>Seasons</h2>
              </div>
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
                  const locked = st === 'have' || st === 'asked';
                  const on = locked || sel.has(s.seasonNumber);
                  const yr = s.airDate
                    ? s.airDate > new Date().toISOString().slice(0, 10)
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
                        <b>{s.name || `Season ${s.seasonNumber}`}</b>
                        <small>
                          {s.episodeCount} episode
                          {s.episodeCount === 1 ? '' : 's'} · {yr}
                        </small>
                      </span>
                      {st === 'have' && (
                        <Pill k="ok" icon="check">
                          On Plex
                        </Pill>
                      )}
                      {st === 'part' && (
                        <Pill k="ok" icon="check">
                          Partly on Plex
                        </Pill>
                      )}
                      {st === 'asked' && (
                        <Pill k="wait" icon="clock">
                          Requested
                        </Pill>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {!!t.credits?.cast.length && (
              <div>
                <div className="h2">Starring</div>
                <People list={t.credits.cast.slice(0, 10)} />
              </div>
            )}
          </div>
          <aside>
            <Facts
              rows={[
                ['Network', t.networks?.map((x) => x.name).join(', ')],
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
        {!!like?.results.length && (
          <Section title="More like this">
            <Rail>
              {like.results.map((x) => (
                <TitleCard key={x.id} it={{ ...x, mediaType: 'tv' }} />
              ))}
            </Rail>
          </Section>
        )}
      </div>
      <ActionBar
        title={t.name || ''}
        meta={statusLine || `${seasons.length} seasons`}
      >
        {main}
      </ActionBar>
    </article>
  );
}

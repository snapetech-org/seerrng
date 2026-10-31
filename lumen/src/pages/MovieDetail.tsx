import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  MediaStatus,
  plexUrl,
  requestMovie,
  tmdbImg,
  type MovieDetails,
  type Paged,
  type RequestOptions,
  type TitleResult,
} from '../api';
import { useAuth } from '../auth';
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
  DetailTop,
  Facts,
  fmtRun,
  People,
  Pill,
} from '../components/detail';
import { useToast } from '../components/toast';
import { dropCache, useApi, usePublicSettings } from '../hooks';
import { Icon } from '../icons';

const cert = (m: MovieDetails) =>
  m.releases?.results
    .find((r) => r.iso_3166_1 === 'US')
    ?.release_dates.find((d) => d.certification)?.certification || '';

export default function MovieDetail() {
  const { id } = useParams();
  const { data: m, error, reload } = useApi<MovieDetails>(`/movie/${id}`);
  const like = useApi<Paged<TitleResult>>(`/movie/${id}/recommendations`).data;
  const pub = usePublicSettings();
  const { user } = useAuth();
  // ADMIN | REQUEST_4K | REQUEST_4K_MOVIE
  const can4k = !!user && (user.permissions & (2 | 1024 | 2048)) !== 0;
  const toast = useToast();
  const [opts, setOpts] = useState<RequestOptions>({});
  const [busy, setBusy] = useState(false);
  const onOpts = useCallback((o: RequestOptions) => setOpts(o), []);

  if (error)
    return (
      <div className="empty">
        <b>Couldn’t load this movie</b>
        {error}
      </div>
    );
  if (!m) return <div className="detail-loading" aria-busy="true" />;

  const s = statusOf(m.mediaInfo);
  const s4k = m.mediaInfo?.status4k;
  const date = m.releaseDate || '';
  const unreleased = date > new Date().toISOString().slice(0, 10);
  const director = (m.credits?.crew || [])
    .filter((c) => c.job === 'Director')
    .map((c) => c.name)
    .join(', ');
  const trailer = m.relatedVideos?.find(
    (v) => v.type === 'Trailer' && v.site === 'YouTube'
  );
  const request = async (is4k = false) => {
    setBusy(true);
    try {
      await requestMovie(m.id, { ...opts, is4k });
      toast(`Requested ${m.title}${is4k ? ' in 4K' : ''}`);
      dropCache(`/movie/${m.id}`);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  const main =
    s?.k === 'ok' ? (
      <a
        className="btn btn-primary"
        href={plexUrl(m.mediaInfo)}
        target="_blank"
        rel="noreferrer"
      >
        <Icon name="play" />
        Watch on Plex
      </a>
    ) : s ? (
      <button className="btn btn-tonal" disabled>
        <Icon name={s.ico} />
        {s.word}
      </button>
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
  const fourK =
    pub?.movie4kEnabled &&
    can4k &&
    s?.k === 'ok' &&
    !(s4k && s4k >= MediaStatus.PENDING) ? (
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
          {s && (
            <Pill k={s.k} icon={s.ico}>
              {s.word}
            </Pill>
          )}
          {s4k === MediaStatus.AVAILABLE && (
            <Pill k="ok" icon="check">
              4K on Plex
            </Pill>
          )}
          {(s4k === MediaStatus.PENDING || s4k === MediaStatus.PROCESSING) && (
            <Pill k="wait" icon="clock">
              4K requested
            </Pill>
          )}
          {!!m.voteAverage && (
            <Pill k="neutral" icon="star">
              {m.voteAverage.toFixed(1)} / 10
            </Pill>
          )}
        </div>
        <div className="dacts pc">
          {main}
          {fourK}
          {trailerBtn}
        </div>
        {!s && <AdvancedOptions kind="movie" is4k={false} onChange={onOpts} />}
        <div className="dcols">
          <div style={{ display: 'grid', gap: 22 }}>
            {m.tagline && <p className="tagline">{m.tagline}</p>}
            <p className="ov">{m.overview}</p>
            {!!m.credits?.cast.length && (
              <div>
                <div className="h2">Starring</div>
                <People list={m.credits.cast.slice(0, 10)} />
              </div>
            )}
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
                ['Runtime', fmtRun(m.runtime)],
                [
                  'Released',
                  date ? `${shortDate(date)}, ${date.slice(0, 4)}` : '',
                ],
                ['Director', director],
                ['Rated', cert(m)],
                ['Collection', m.collection?.name],
                [
                  '4K',
                  pub?.movie4kEnabled
                    ? s4k === MediaStatus.AVAILABLE
                      ? 'On Plex'
                      : 'Not yet'
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
                <TitleCard key={x.id} it={{ ...x, mediaType: 'movie' }} />
              ))}
            </Rail>
          </Section>
        )}
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

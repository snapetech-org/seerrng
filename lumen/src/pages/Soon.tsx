import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  requestMovie,
  requestSeries,
  tmdbImg,
  type Paged,
  type TitleResult,
} from '../api';
import { useMediaServerName } from '../auth';
import { statusOf } from '../components/cards';
import { Pill } from '../components/detail';
import { ServiceNote } from '../components/extra';
import {
  RequestSheet,
  useAsksRequestOptions,
  useOffers4k,
} from '../components/requestSheet';
import { Avatar } from '../components/Shell';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { Icon } from '../icons';
import { seriesRequestSummary } from '../seriesRequestSummary';
import { useVideoAvailability } from '../videoAvailability';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// upcoming movies and series, grouped by month, requestable ahead of release
export default function Soon() {
  const serverName = useMediaServerName();
  const availability = useVideoAvailability();
  const [params] = useSearchParams();
  const scope = params.get('media');
  const showMovies = scope !== 'tv';
  const showTv = scope !== 'movie';
  const movieList = useApi<Paged<TitleResult>>(
    showMovies ? '/discover/movies/upcoming' : null
  );
  const tvList = useApi<Paged<TitleResult>>(
    showTv ? '/discover/tv/upcoming' : null
  );
  const movies = showMovies ? movieList.data : null;
  const tv = showTv ? tvList.data : null;
  const loading =
    (showMovies && !movies && !movieList.error) ||
    (showTv && !tv && !tvList.error);
  const allSelectedListsLoaded = (!showMovies || !!movies) && (!showTv || !!tv);
  const toast = useToast();
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const asks = useAsksRequestOptions();
  const offers4kMovie = useOffers4k('movie');
  const offers4kTv = useOffers4k('tv');
  const [choosing, setChoosing] = useState<TitleResult | null>(null);
  const items = [
    ...(movies?.results || []).map((m) => ({
      ...m,
      mediaType: 'movie' as const,
      date: m.releaseDate || '',
    })),
    ...(tv?.results || []).map((t) => ({
      ...t,
      mediaType: 'tv' as const,
      date: t.firstAirDate || '',
    })),
  ]
    .filter((x) => x.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const months = new Map<string, typeof items>();
  for (const it of items) {
    const k = it.date.slice(0, 7);
    months.set(k, [...(months.get(k) || []), it]);
  }
  // rows flip to Requested as soon as you tap (the lists are cached, so their status lags)
  const req = async (it: (typeof items)[number]) => {
    const key = it.mediaType + it.id;
    const unask = () =>
      setAsked((a) => {
        const n = new Set(a);
        n.delete(key);
        return n;
      });
    setAsked((a) => new Set(a).add(key));
    try {
      const title = it.title || it.name || 'this title';
      if (it.mediaType === 'tv') {
        toast(seriesRequestSummary(title, await requestSeries(it.id)));
      } else {
        await requestMovie(it.id);
        toast(`Requested ${title}. It downloads when it’s out.`);
      }
    } catch (e) {
      unask();
      toast(friendlyError(e, 'Request failed'));
    }
  };

  return (
    <>
      <header className="ph">
        <div className="ph-row">
          <div>
            <h1>Coming soon</h1>
          </div>
          <Avatar className="avatar ph-only-avatar" />
        </div>
        <p className="sub">Request ahead and it downloads the day it’s out.</p>
        <nav className="toolbar" aria-label="Upcoming Media">
          <Link
            className="chip"
            aria-current={showMovies && showTv ? 'page' : undefined}
            to="/soon"
          >
            All
          </Link>
          <Link
            className="chip"
            aria-current={!showTv ? 'page' : undefined}
            to="/soon?media=movie"
          >
            Movies
          </Link>
          <Link
            className="chip"
            aria-current={!showMovies ? 'page' : undefined}
            to="/soon?media=tv"
          >
            Series
          </Link>
        </nav>
      </header>
      {loading && (
        <p className="note" role="status">
          Loading upcoming titles…
        </p>
      )}
      <ServiceNote
        error={showMovies ? movieList.error : null}
        what="upcoming movies"
        retry={movieList.reload}
      />
      <ServiceNote
        error={showTv ? tvList.error : null}
        what="upcoming series"
        retry={tvList.reload}
      />
      {allSelectedListsLoaded && !months.size && (
        <p className="note">No upcoming titles found.</p>
      )}
      {choosing && (
        <RequestSheet
          it={choosing}
          onClose={() => setChoosing(null)}
          onDone={(is4k, series, quotaException) => {
            setAsked((a) => new Set(a).add(choosing.mediaType + choosing.id));
            toast(
              quotaException
                ? `Approval requested for ${choosing.title || choosing.name}`
                : choosing.mediaType === 'tv'
                  ? seriesRequestSummary(
                      choosing.name || 'this series',
                      series,
                      is4k
                    )
                  : `Requested ${choosing.title || choosing.name}. It downloads when it’s out.`
            );
            setChoosing(null);
          }}
        />
      )}
      {[...months].map(([k, list]) => (
        <section className="month" key={k}>
          <h2>
            {MONTHS[+k.slice(5) - 1]} {k.slice(0, 4)}
          </h2>
          <div className="sl">
            {list.map((it) => {
              const s =
                statusOf(it.mediaInfo, false, serverName) ||
                (asked.has(it.mediaType + it.id)
                  ? ({ k: 'wait', word: 'Requested', ico: 'clock' } as const)
                  : null);
              const visible =
                s?.k === 'ok'
                  ? statusOf(it.mediaInfo, false, serverName, availability)
                  : s;
              return (
                <div className="si" key={it.mediaType + it.id}>
                  <div className="date">
                    <small>
                      {MONTHS[+it.date.slice(5, 7) - 1]
                        .slice(0, 3)
                        .toUpperCase()}
                    </small>
                    <b>{+it.date.slice(8)}</b>
                  </div>
                  <div className="art">
                    {it.backdropPath && (
                      <img
                        src={tmdbImg(it.backdropPath, 'w500')}
                        alt=""
                        loading="lazy"
                      />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="tt">
                      <Link to={`/${it.mediaType}/${it.id}`}>
                        {it.title || it.name}
                      </Link>
                    </div>
                    <div className="sub">
                      {it.mediaType === 'tv' ? 'Series' : 'Movie'}
                    </div>
                    <div className="act">
                      {s ? (
                        visible && (
                          <Pill k={visible.k} icon={visible.ico}>
                            {visible.word}
                          </Pill>
                        )
                      ) : (
                        <button
                          className="btn btn-sm btn-tonal"
                          data-label-wrap
                          onClick={() =>
                            asks ||
                            (it.mediaType === 'tv' ? offers4kTv : offers4kMovie)
                              ? setChoosing(it)
                              : req(it)
                          }
                        >
                          <Icon name="plus" size="sm" />
                          Request
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

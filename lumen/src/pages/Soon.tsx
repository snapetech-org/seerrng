import { useState } from 'react';
import { Link } from 'react-router-dom';
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
import { useApi } from '../hooks';
import { Icon } from '../icons';
import { friendlyError } from '../errors';

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
  const movieList = useApi<Paged<TitleResult>>('/discover/movies/upcoming');
  const tvList = useApi<Paged<TitleResult>>('/discover/tv/upcoming');
  const movies = movieList.data;
  const tv = tvList.data;
  // both lists failed: say so (with Retry) instead of "Loading…" for good
  const failed = !movies && !tv && !!movieList.error && !!tvList.error;
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
      await (it.mediaType === 'tv'
        ? requestSeries(it.id)
        : requestMovie(it.id));
      toast(`Requested ${it.title || it.name}. It downloads when it’s out.`);
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
      </header>
      {!movies && !tv && !failed && <p className="note">Loading…</p>}
      <ServiceNote
        error={failed ? movieList.error : null}
        what="upcoming titles"
        retry={() => {
          movieList.reload();
          tvList.reload();
        }}
      />
      {choosing && (
        <RequestSheet
          it={choosing}
          onClose={() => setChoosing(null)}
          onDone={() => {
            setAsked((a) => new Set(a).add(choosing.mediaType + choosing.id));
            toast(
              `Requested ${choosing.title || choosing.name}. It downloads when it’s out.`
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
                        <Pill k={s.k} icon={s.ico}>
                          {s.word}
                        </Pill>
                      ) : (
                        <button
                          className="btn btn-sm btn-tonal"
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

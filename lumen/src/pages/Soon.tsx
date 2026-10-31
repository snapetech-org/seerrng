import { Link } from 'react-router-dom';
import {
  requestMovie,
  requestSeries,
  tmdbImg,
  type Paged,
  type TitleResult,
} from '../api';
import { statusOf } from '../components/cards';
import { Pill } from '../components/detail';
import { Avatar } from '../components/Shell';
import { useToast } from '../components/toast';
import { useApi } from '../hooks';
import { Icon } from '../icons';

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
  const movies = useApi<Paged<TitleResult>>('/discover/movies/upcoming').data;
  const tv = useApi<Paged<TitleResult>>('/discover/tv/upcoming').data;
  const toast = useToast();
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
  const req = async (it: (typeof items)[number]) => {
    try {
      await (it.mediaType === 'tv'
        ? requestSeries(it.id)
        : requestMovie(it.id));
      toast(`Requested ${it.title || it.name}. It downloads when it’s out.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Request failed');
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
      {!movies && !tv && <p className="note">Loading…</p>}
      {[...months].map(([k, list]) => (
        <section className="month" key={k}>
          <h2>
            {MONTHS[+k.slice(5) - 1]} {k.slice(0, 4)}
          </h2>
          <div className="sl">
            {list.map((it) => {
              const s = statusOf(it.mediaInfo);
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
                          onClick={() => req(it)}
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

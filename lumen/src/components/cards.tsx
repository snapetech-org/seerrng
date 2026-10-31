import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  englishAudioEdition,
  hardcoverWorkId,
  MediaStatus,
  plexUrl,
  requestBook,
  requestMovie,
  requestSeries,
  titleOf,
  tmdbImg,
  yearOf,
  type BookResult,
  type MediaInfo,
  type TitleResult,
} from '../api';
import { dropBookStates, useBookStates } from '../hooks';
import { Icon, type IconName } from '../icons';
import { usePrefs } from '../settings';
import { useToast } from './toast';

// one status vocabulary everywhere (same as the mockup)
export type Stat = {
  k: 'ok' | 'dl' | 'wait';
  word: string;
  ico: IconName;
} | null;
export function statusOf(mi: MediaInfo | undefined, book = false): Stat {
  const s = mi?.status;
  if (s === MediaStatus.AVAILABLE)
    return { k: 'ok', word: book ? 'In library' : 'On Plex', ico: 'check' };
  if (s === MediaStatus.PARTIAL)
    return { k: 'ok', word: 'Partly on Plex', ico: 'check' };
  // processing = handed to Radarr/Sonarr/ChaptarrNG; it's only "downloading" once a download shows up
  if (s === MediaStatus.PROCESSING) {
    const d = mi?.downloadStatus?.[0];
    return d
      ? {
          k: 'dl',
          word: d.size
            ? `Downloading ${Math.round((1 - d.sizeLeft / d.size) * 100)}%`
            : 'Downloading',
          ico: 'down',
        }
      : { k: 'wait', word: 'Requested', ico: 'clock' };
  }
  if (s === MediaStatus.PENDING)
    return { k: 'wait', word: 'Requested', ico: 'clock' };
  return null;
}
export const Glyph = ({ s }: { s: Stat }) =>
  s ? (
    <span className={`glyph ${s.k}`} title={s.word}>
      <Icon name={s.ico} />
      <span className="sr">{s.word}</span>
    </span>
  ) : null;

const TODAY = new Date().toISOString().slice(0, 10);
const MON = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
export const shortDate = (d?: string) =>
  d ? `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8, 10)}` : '';

// local request state so a card flips to "Requested" straight away
function useRequested(initial: Stat) {
  const [s, setS] = useState<Stat>(initial);
  return [
    s,
    () => setS({ k: 'wait', word: 'Requested', ico: 'clock' }),
  ] as const;
}

export function TitleCard({ it, meta }: { it: TitleResult; meta?: string }) {
  const toast = useToast();
  const { prefs } = usePrefs();
  const tv = it.mediaType === 'tv';
  const [s, markRequested] = useRequested(statusOf(it.mediaInfo));
  const date = it.releaseDate || it.firstAirDate;
  const unreleased = !!date && date > TODAY;
  const href = `/${tv ? 'tv' : 'movie'}/${it.id}`;
  const m =
    meta ||
    [unreleased ? shortDate(date) : yearOf(it), tv ? 'Series' : '']
      .filter(Boolean)
      .join(' · ');
  const qm = [
    unreleased ? 'Out ' + shortDate(date) : yearOf(it),
    it.voteAverage ? '★ ' + it.voteAverage.toFixed(1) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const go = async () => {
    try {
      await (tv ? requestSeries(it.id) : requestMovie(it.id));
      markRequested();
      toast(`Requested ${titleOf(it)}${tv ? ' · entire series' : ''}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Request failed');
    }
  };
  let qb: ReactNode;
  const plex = plexUrl(it.mediaInfo);
  if (s?.k === 'ok')
    qb = plex ? (
      <a className="qbtn okb" href={plex} target="_blank" rel="noreferrer">
        <Icon name="play" size="sm" />
        Watch on Plex
      </a>
    ) : (
      <Link className="qbtn okb" to={href}>
        <Icon name="play" size="sm" />
        On Plex
      </Link>
    );
  else if (s)
    qb = (
      <button className="qbtn done" disabled>
        <Icon name={s.ico} size="sm" />
        {s.word}
      </button>
    );
  else if (tv && !prefs.wholeSeriesDefault)
    qb = (
      <Link className="qbtn go" to={href + '#seasons'}>
        <Icon name="list" size="sm" />
        Choose seasons
      </Link>
    );
  else
    qb = (
      <>
        <button className="qbtn go" onClick={go}>
          <Icon name="plus" size="sm" />
          {unreleased ? 'Request early' : 'Request'}
        </button>
        {tv && (
          <Link
            className="qbtn ghost"
            to={href + '#seasons'}
            aria-label="Choose seasons"
            title="Choose seasons"
          >
            <Icon name="list" size="sm" />
          </Link>
        )}
      </>
    );
  return (
    <div className="poster">
      <div className="art">
        {it.posterPath && (
          <img loading="lazy" src={tmdbImg(it.posterPath)} alt="" />
        )}
        <Glyph s={s} />
        <Link className="hit" to={href} aria-label={titleOf(it)} />
        {prefs.hoverRequest && (
          <div className="qa">
            <div className="qt">{titleOf(it)}</div>
            <div className="qm">{qm}</div>
            <div className="qb">{qb}</div>
          </div>
        )}
      </div>
      <div className="t">{titleOf(it)}</div>
      <div className="m">{m}</div>
    </div>
  );
}

export function BookCard({ b }: { b: BookResult }) {
  const audio = b.bookFormat === 'audiobook';
  const { prefs } = usePrefs();
  const toast = useToast();
  const states = useBookStates();
  const known = states?.get(hardcoverWorkId(b.id) || '')?.[
    audio ? 'audiobook' : 'ebook'
  ];
  const [s0, markRequested] = useRequested(statusOf(b.mediaInfo, true));
  const s =
    s0 ||
    (known === 5
      ? statusOf({ status: 5 }, true)
      : known
        ? { k: 'wait' as const, word: 'Requested', ico: 'clock' as const }
        : null);
  // narrator choice off (admin or personal setting) = one straight request, no picker
  const straight = !audio || !prefs.narratorChoice;
  const go = async () => {
    try {
      await requestBook(
        b.id,
        audio ? 'audiobook' : 'ebook',
        audio ? await englishAudioEdition(hardcoverWorkId(b.id)) : undefined,
        'either'
      );
      markRequested();
      dropBookStates();
      toast(`Requested ${b.title} · ${audio ? 'audiobook' : 'ebook'}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Request failed');
    }
  };
  const href = `/book/${encodeURIComponent(b.id)}${audio ? '?f=audio' : ''}`;
  const series = b.series?.[0];
  return (
    <div className={`poster ${audio ? 'sq' : 'book'}`}>
      <div className="art">
        {b.posterPath && <img loading="lazy" src={b.posterPath} alt="" />}
        <Glyph s={s} />
        <Link className="hit" to={href} aria-label={b.title} />
        {prefs.hoverRequest && (
          <div className="qa">
            <div className="qt">{b.title}</div>
            <div className="qm">
              {[
                series?.title ? `${series.title} #${series.position}` : '',
                b.firstPublishYear,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <div className="qb">
              {s?.k === 'ok' ? (
                <>
                  <button className="qbtn okb">
                    <Icon name={audio ? 'play' : 'book'} size="sm" />
                    {audio ? 'Listen' : 'Read'}
                  </button>
                  {audio && prefs.narratorChoice && (
                    <Link
                      className="qbtn ghost"
                      to={href + '#narr'}
                      aria-label="Request another narrator"
                      title="Request another narrator"
                    >
                      <Icon name="plus" size="sm" />
                    </Link>
                  )}
                </>
              ) : s ? (
                <button className="qbtn done" disabled>
                  <Icon name={s.ico} size="sm" />
                  {s.word}
                </button>
              ) : straight ? (
                <button className="qbtn go" onClick={go}>
                  <Icon name="plus" size="sm" />
                  {audio ? 'Request audiobook' : 'Request ebook'}
                </button>
              ) : (
                <Link className="qbtn go" to={href}>
                  <Icon name="headphones" size="sm" />
                  Choose narrator
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="t">{b.title}</div>
      <div className="m">
        {b.author || (audio ? 'Audiobook' : 'Ebook')}
        {b.firstPublishYear ? ' · ' + b.firstPublishYear : ''}
      </div>
    </div>
  );
}

export function FeatCard({
  it,
  eyebrow,
  lazy,
}: {
  it: TitleResult;
  eyebrow: string;
  lazy?: boolean;
}) {
  const tv = it.mediaType === 'tv';
  const s = statusOf(it.mediaInfo);
  const toast = useToast();
  const { prefs } = usePrefs();
  const [done, setDone] = useState(false);
  const mm = [
    yearOf(it),
    tv ? 'Series' : 'Movie',
    it.voteAverage ? '★ ' + it.voteAverage.toFixed(1) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const go = async () => {
    try {
      await (tv ? requestSeries(it.id) : requestMovie(it.id));
      setDone(true);
      toast(`Requested ${titleOf(it)}${tv ? ' · entire series' : ''}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Request failed');
    }
  };
  return (
    <div className="feat">
      <img
        src={tmdbImg(it.backdropPath, 'w780')}
        alt=""
        loading={lazy ? 'lazy' : undefined}
      />
      <Link
        className="hit"
        to={`/${tv ? 'tv' : 'movie'}/${it.id}`}
        aria-label={titleOf(it)}
      />
      <span className="cap">
        <span className="ey">{eyebrow}</span>
        <h3>{titleOf(it)}</h3>
        <span className="row">
          <span className="mm">{mm}</span>
          {s?.k === 'ok' ? (
            <button className="btn go">
              <Icon name="play" size="sm" />
              Watch
            </button>
          ) : s || done ? (
            <span className="btn go done">
              <Icon name="clock" size="sm" />
              {s?.word || 'Requested'}
            </span>
          ) : tv && !prefs.wholeSeriesDefault ? (
            <Link className="btn go" to={`/tv/${it.id}#seasons`}>
              <Icon name="list" size="sm" />
              Choose seasons
            </Link>
          ) : (
            <button className="btn go" onClick={go}>
              <Icon name="plus" size="sm" />
              {tv ? 'Request series' : 'Request'}
            </button>
          )}
        </span>
      </span>
    </div>
  );
}

// a horizontal row with arrow buttons for mouse users (same behaviour as the mockup)
export function Rail({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  useEffect(() => {
    const r = ref.current;
    if (!r) return;
    const upd = () =>
      setEdge({
        start: r.scrollLeft < 8,
        end: r.scrollLeft + r.clientWidth > r.scrollWidth - 8,
      });
    upd();
    r.addEventListener('scroll', upd, { passive: true });
    const ro = new ResizeObserver(upd);
    ro.observe(r);
    return () => {
      r.removeEventListener('scroll', upd);
      ro.disconnect();
    };
  }, []);
  const by = (d: number) =>
    ref.current?.scrollBy({
      left: d * ref.current.clientWidth * 0.85,
      behavior: 'smooth',
    });
  return (
    <div className="rail-wrap">
      <div className={`rail ${className}`} ref={ref}>
        {children}
      </div>
      <button
        className="rail-btn prev"
        aria-label="Scroll back"
        disabled={edge.start}
        onClick={() => by(-1)}
      >
        <Icon name="chevL" />
      </button>
      <button
        className="rail-btn next"
        aria-label="Scroll forward"
        disabled={edge.end}
        onClick={() => by(1)}
      >
        <Icon name="chev" />
      </button>
    </div>
  );
}

export function Section({
  title,
  link,
  children,
}: {
  title: string;
  link?: [string, string];
  children: ReactNode;
}) {
  return (
    <section>
      <div className="sec-head">
        <h2>{title}</h2>
        {link && <Link to={link[1]}>{link[0]}</Link>}
      </div>
      {children}
    </section>
  );
}

// placeholder row while a section loads, so the page doesn't jump
export const RailSkeleton = ({ n = 8, sq }: { n?: number; sq?: boolean }) => (
  <div className="rail">
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className={`poster ${sq ? 'sq' : ''}`}>
        <div className="art skel" />
        <div className="t skel-line" />
      </div>
    ))}
  </div>
);

// endless scrolling: loads the next page when this marker comes within a screen of view
export function MoreOnScroll({
  done,
  loading,
  more,
}: {
  done: boolean;
  loading: boolean;
  more: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ done, loading, more });
  latest.current = { done, loading, more };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const l = latest.current;
        if (entries.some((e) => e.isIntersecting) && !l.done && !l.loading)
          l.more();
      },
      { rootMargin: '0px 0px 900px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // a short page can leave the marker on screen after a load; check again once loading ends
  useEffect(() => {
    const el = ref.current;
    if (!el || done || loading) return;
    if (el.getBoundingClientRect().top < window.innerHeight + 900) more();
  }, [done, loading, more]);
  if (done) return null;
  return (
    <div ref={ref} className="more-scroll" aria-live="polite">
      {loading ? 'Loading more…' : ''}
    </div>
  );
}

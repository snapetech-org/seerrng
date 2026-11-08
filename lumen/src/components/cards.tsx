import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  bookMediaForFormat,
  englishAudioEdition,
  hardcoverWorkId,
  mediaLink,
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
import { useMediaServerName } from '../auth';
import { dropBookStates, useBookStates } from '../hooks';
import { Icon, type IconName } from '../icons';
import { usePrefs } from '../settings';
import { useQuickRequest } from './requestSheet';
import { useToast } from './toast';

// one status vocabulary everywhere (same as the mockup)
export type Stat = {
  k: 'ok' | 'dl' | 'wait';
  word: string;
  ico: IconName;
} | null;
export function statusOf(
  mi: MediaInfo | undefined,
  book = false,
  serverName = 'Plex'
): Stat {
  // SeerrNG's own cards count the 4K copy too: a title that's only in the 4K library
  // (or only requested in 4K) still gets its glyph
  const shown = (x?: number) =>
    !!x && x >= MediaStatus.PENDING && x <= MediaStatus.AVAILABLE;
  const have = (x?: number) =>
    x === MediaStatus.AVAILABLE || x === MediaStatus.PARTIAL;
  const use4k =
    !book &&
    shown(mi?.status4k) &&
    (!shown(mi?.status) || (have(mi?.status4k) && !have(mi?.status)));
  const s = use4k ? mi?.status4k : mi?.status;
  const downloads = use4k ? mi?.downloadStatus4k : mi?.downloadStatus;
  if (s === MediaStatus.AVAILABLE)
    return {
      k: 'ok',
      word: book ? 'In library' : `On ${serverName}`,
      ico: 'check',
    };
  if (s === MediaStatus.PARTIAL)
    return { k: 'ok', word: `Partly on ${serverName}`, ico: 'check' };
  // processing = handed to Radarr/Sonarr/ChaptarrNG; it's only "downloading" once a download shows up
  if (s === MediaStatus.PROCESSING) {
    const d = downloads?.[0];
    return d
      ? {
          k: 'dl',
          // still all to come: waiting its turn in the download client's queue
          word: !d.size
            ? 'Downloading'
            : d.sizeLeft >= d.size
              ? 'Queued'
              : `Downloading ${Math.round((1 - d.sizeLeft / d.size) * 100)}%`,
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

// touch screens can't hover, so posters get a small round request button instead of the overlay
// (CSS shows it only where there's no mouse; the overlay keeps working on desktop)
export function TouchQuick({
  label,
  onClick,
}: {
  label: string;
  onClick: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="tq"
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Icon name="plus" />
    </button>
  );
}

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
  const [requested, setRequested] = useState('');
  return [
    requested && initial?.k !== 'ok'
      ? ({ k: 'wait', word: requested, ico: 'clock' } as const)
      : initial,
    (word = 'Requested') => setRequested(word),
  ] as const;
}

export function TitleCard({ it, meta }: { it: TitleResult; meta?: string }) {
  const serverName = useMediaServerName();
  const toast = useToast();
  const { prefs } = usePrefs();
  const tv = it.mediaType === 'tv';
  const [s, markRequested] = useRequested(
    statusOf(it.mediaInfo, false, serverName)
  );
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
  const quick = useQuickRequest(it, go, (is4k) => {
    markRequested(is4k ? '4K Requested' : 'Requested');
    toast(
      `Requested ${titleOf(it)}${is4k ? ' in 4K' : ''}${tv ? ' · entire series' : ''}`
    );
  });
  let qb: ReactNode;
  const plex = plexUrl(it.mediaInfo);
  if (s?.k === 'ok')
    qb = plex ? (
      <a
        className="qbtn okb"
        {...mediaLink(it.mediaInfo, false, tv ? 'tv' : 'movie', serverName)}
      >
        <Icon name="play" size="sm" />
        Watch on {serverName}
      </a>
    ) : (
      <Link className="qbtn okb" to={href}>
        <Icon name="play" size="sm" />
        On {serverName}
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
        <button className="qbtn go" onClick={quick.request}>
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
        {prefs.hoverRequest && !s && (!tv || prefs.wholeSeriesDefault) && (
          <TouchQuick
            label={`Request ${titleOf(it)}${tv ? ' (entire series)' : ''}`}
            onClick={quick.request}
          />
        )}
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
      {quick.sheet}
    </div>
  );
}

export function BookCard({ b }: { b: BookResult }) {
  const audio = b.bookFormat === 'audiobook';
  const { prefs } = usePrefs();
  const toast = useToast();
  const states = useBookStates();
  const known = states?.get(b.id)?.[audio ? 'audiobook' : 'ebook'];
  const [s0, markRequested] = useRequested(
    statusOf(
      bookMediaForFormat(b.mediaInfo, audio ? 'audiobook' : 'ebook'),
      true
    )
  );
  const s =
    s0 ||
    (known
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
        {prefs.hoverRequest && !s && straight && (
          <TouchQuick
            label={`Request ${b.title} (${audio ? 'audiobook' : 'ebook'})`}
            onClick={go}
          />
        )}
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
                  {/* this button did nothing: the book page has the library links */}
                  <Link className="qbtn okb" to={href}>
                    <Icon name={audio ? 'play' : 'book'} size="sm" />
                    {audio ? 'Listen' : 'Read'}
                  </Link>
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
  const serverName = useMediaServerName();
  const tv = it.mediaType === 'tv';
  const s = statusOf(it.mediaInfo, false, serverName);
  const toast = useToast();
  const { prefs } = usePrefs();
  const [done, setDone] = useState('');
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
      setDone('Requested');
      toast(`Requested ${titleOf(it)}${tv ? ' · entire series' : ''}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Request failed');
    }
  };
  const quick = useQuickRequest(it, go, (is4k) => {
    setDone(is4k ? '4K Requested' : 'Requested');
    toast(
      `Requested ${titleOf(it)}${is4k ? ' in 4K' : ''}${tv ? ' · entire series' : ''}`
    );
  });
  return (
    <div className="feat">
      {quick.sheet}
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
            // this button used to do nothing: open Plex when we have a link, else the title page
            plexUrl(it.mediaInfo) ? (
              <a
                className="btn go"
                {...mediaLink(
                  it.mediaInfo,
                  false,
                  tv ? 'tv' : 'movie',
                  serverName
                )}
              >
                <Icon name="play" size="sm" />
                Watch
              </a>
            ) : (
              <Link className="btn go" to={`/${tv ? 'tv' : 'movie'}/${it.id}`}>
                <Icon name="play" size="sm" />
                Watch
              </Link>
            )
          ) : s || done ? (
            <span className="btn go done">
              <Icon name={s?.ico || 'clock'} size="sm" />
              {s?.word || done}
            </span>
          ) : tv && !prefs.wholeSeriesDefault ? (
            <Link className="btn go" to={`/tv/${it.id}#seasons`}>
              <Icon name="list" size="sm" />
              Choose seasons
            </Link>
          ) : (
            <button className="btn go" onClick={quick.request}>
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
  action,
  children,
}: {
  title: string;
  link?: [string, string];
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="sec-head">
        <h2>{title}</h2>
        {link && <Link to={link[1]}>{link[0]}</Link>}
        {action}
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

// placeholder grid while a list's first page loads, so a slow answer doesn't look empty
export const GridSkeleton = ({
  n = 12,
  sq,
  className = 'grid',
}: {
  n?: number;
  sq?: boolean;
  className?: string;
}) => (
  <div className={className} aria-busy="true" aria-label="Loading">
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
  error,
  retry,
}: {
  done: boolean;
  loading: boolean;
  more: () => void;
  error?: string | null;
  retry?: () => void;
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
    // the marker is removed while done ("Look further" brings it back): watch the new one
  }, [done]);
  // a short page can leave the marker on screen after a load; check again once loading ends
  useEffect(() => {
    const el = ref.current;
    if (!el || done || loading) return;
    if (el.getBoundingClientRect().top < window.innerHeight + 900) more();
  }, [done, loading, more]);
  // a page failed: stop here and let the person ask again (shown where the list stopped)
  if (error && retry)
    return (
      <div className="more-scroll" role="alert">
        Couldn’t load more.{' '}
        <button className="btn btn-tonal btn-sm" onClick={retry}>
          Retry
        </button>
      </div>
    );
  if (done) return null;
  return (
    <div ref={ref} className="more-scroll" aria-live="polite">
      {loading ? 'Loading more…' : ''}
    </div>
  );
}

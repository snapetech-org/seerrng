import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { artUrl, kavitaLink, MediaStatus } from '../api';
import {
  GridSkeleton,
  MoreOnScroll,
  Rail,
  RailSkeleton,
  Section,
  shortDate,
} from '../components/cards';
import {
  ComicCard,
  editionLabel,
  requestComicEdition,
} from '../components/comics';
import { DetailTop, Facts, Pill } from '../components/detail';
import {
  comicState,
  ExtraCard,
  ExtraGate,
  ExtraHeader,
  ExtraSearch,
  extraStat,
  RequestButton,
  ServiceNote,
  StatPill,
} from '../components/extra';
import { GenrePicker } from '../components/GenrePicker';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import {
  editionLine,
  plainText,
  requestExtra,
  type Comic,
  type ComicIssue,
  type ComicLanding,
  type ComicWork,
  type Magazine,
} from '../extras';
import { useApi, usePaged } from '../hooks';
import { Icon } from '../icons';
import { usePrefs } from '../settings';

// the search box writes ?q= after a pause, so typing doesn't fire a request per letter
function useQueryParam() {
  const [p, setP] = useSearchParams();
  const query = p.get('q') || '';
  const [q, setQ] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim() === query) return;
      const n = new URLSearchParams(p);
      if (q.trim()) n.set('q', q.trim());
      else n.delete('q');
      setP(n, { replace: true });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  // ?q= changed from outside (Back, Forward, a link): show that in the box
  useEffect(() => {
    setQ((x) => (x.trim() === query ? x : query));
  }, [query]);
  return { q, setQ, query, p, setP };
}

const MANGA_SORTS = [
  ['popular', 'Popular'],
  ['trending', 'Trending'],
  ['newest', 'Newest'],
  ['title', 'A–Z'],
] as const;
const COMIC_SORTS = [
  ['issues', 'Most issues'],
  ['newest', 'Newest'],
  ['title', 'A–Z'],
] as const;

const DEFAULT_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
];

// a row of comic cards, or its placeholder while the page loads
function ComicRail({
  title,
  works,
  loading,
  link,
}: {
  title: string;
  works?: ComicWork[];
  loading: boolean;
  link?: [string, string];
}) {
  if (!loading && !works?.length) return null;
  return (
    <Section title={title} link={link}>
      {works?.length ? (
        <Rail>
          {works.map((w) => (
            <ComicCard key={w.id} w={w} />
          ))}
        </Rail>
      ) : (
        <RailSkeleton />
      )}
    </Section>
  );
}

// owned, wholly or in part: the same test as the In library list
const inLibrary = (w: ComicWork) =>
  w.mediaInfo?.status === MediaStatus.AVAILABLE ||
  w.mediaInfo?.status === MediaStatus.PARTIAL;

// ---- comics and manga: manga from AniList, Western comics from ComicVine; one card per
// work with its editions inside; searching is the top search bar's job ----
export function Comics() {
  const [p, setP] = useSearchParams();
  const type = (['manga', 'comic'] as const).find((t) => t === p.get('type'));
  // All / In library / Not yet, as on Books: Not yet is the browse feed minus owned works
  const show = (['library', 'not'] as const).find((s) => s === p.get('show'));
  const picked = (p.get('genre') || '').split(',').filter(Boolean);
  const status = p.get('status') || '';
  const publisher = p.get('publisher') || '';
  const sort = p.get('sort') || '';
  const filtered = !!(type || show || picked.length || status || sort);
  const landing = useApi<ComicLanding>('/discover/comics/landing');
  const genres = landing.data?.genres?.length
    ? landing.data.genres
    : DEFAULT_GENRES;
  const publishers = landing.data?.publishers || [];
  const kind = type || 'manga';
  const q = new URLSearchParams({ type: kind });
  if (show === 'library') {
    q.set('show', show);
    if (!type) q.delete('type');
  }
  if (sort) q.set('sort', sort);
  if (kind === 'manga' && picked.length) q.set('genre', picked.join(','));
  if (kind === 'manga' && status) q.set('status', status);
  if (kind === 'comic' && publisher) q.set('publisher', publisher);
  const list = usePaged<ComicWork>(`/discover/comics/browse?${q}`);
  // a work can come back on a later page too
  const seen = new Set<string>();
  const items = list.items.filter((w) =>
    seen.has(w.id) ? false : (seen.add(w.id), !(show === 'not' && inLibrary(w)))
  );
  // Not yet: a page can be all owned works; fetch on until something shows or the feed ends
  const hiddenPage =
    show === 'not' &&
    !items.length &&
    list.page > 0 &&
    !list.done &&
    !list.loading &&
    !list.error;
  useEffect(() => {
    if (hiddenPage) list.more();
  }, [hiddenPage, list]);
  const upd = (changes: Record<string, string | null>) => {
    const n = new URLSearchParams(p);
    for (const [k, v] of Object.entries(changes)) {
      if (v) n.set(k, v);
      else n.delete(k);
    }
    setP(n, { replace: true });
  };
  // genre, status and these sorts only exist for manga: picking one from All shows manga
  const mangaOnly = (changes: Record<string, string | null>) =>
    upd({ ...changes, ...(type ? {} : { type: 'manga' }) });
  const noKey = landing.data?.comicVineConfigured === false;
  const sorts = kind === 'comic' ? COMIC_SORTS : MANGA_SORTS;
  const gridTitle =
    show === 'library'
      ? 'In your library'
      : show === 'not'
        ? 'Not in your library yet'
        : kind === 'comic'
          ? 'Western comics'
          : picked.length || status || sort
            ? 'Manga'
            : 'Popular manga';

  return (
    <ExtraGate k="comic">
      <ExtraHeader
        title="Comics/Manga"
        sub="Request a manga or comic series. New volumes and issues arrive as they come out; manga comes in its English edition unless you pick another."
      >
        <Link className="search search-ph" to="/search?f=comic">
          <Icon name="search" />
          <span className="ph-text">Search comics and manga…</span>
        </Link>
      </ExtraHeader>
      {noKey && (
        <div className="empty">
          <b>Requests need a ComicVine key</b>An admin can add one in SeerrNG
          under Settings › General. You can still browse manga.
        </div>
      )}
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Type">
          {(
            [
              ['', 'All'],
              ['manga', 'Manga'],
              ['comic', 'Comics'],
            ] as const
          ).map(([v, t]) => (
            <button
              key={v || 'all'}
              aria-pressed={(type || '') === v}
              onClick={() =>
                upd({
                  type: v || null,
                  sort: null,
                  // manga filters don't apply to Western comics and back
                  ...(v === 'comic' ? { genre: null, status: null } : {}),
                  ...(v !== 'comic' ? { publisher: null } : {}),
                })
              }
            >
              {t}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Library">
          {(
            [
              ['', 'All'],
              ['library', 'In library'],
              ['not', 'Not yet'],
            ] as const
          ).map(([v, t]) => (
            <button
              key={v || 'all'}
              aria-pressed={(show || '') === v}
              onClick={() => upd({ show: v || null })}
            >
              {t}
            </button>
          ))}
        </div>
        {show !== 'library' && (
          <label className="sel">
            <span className="lbl">Sort</span>
            <select
              value={sort || sorts[0][0]}
              onChange={(e) =>
                kind === 'comic'
                  ? upd({
                      sort: e.target.value === 'issues' ? null : e.target.value,
                    })
                  : mangaOnly({
                      sort:
                        e.target.value === 'popular' && type
                          ? null
                          : e.target.value,
                    })
              }
            >
              {sorts.map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'manga' && show !== 'library' && (
          <label className="sel">
            <span className="lbl">Status</span>
            <select
              value={status}
              onChange={(e) => mangaOnly({ status: e.target.value || null })}
            >
              <option value="">Any</option>
              <option value="ongoing">Ongoing</option>
              <option value="finished">Finished</option>
            </select>
          </label>
        )}
        {kind === 'comic' && !!publishers.length && (
          <label className="sel">
            <span className="lbl">Publisher</span>
            <select
              value={publisher}
              onChange={(e) => upd({ publisher: e.target.value || null })}
            >
              <option value="">All</option>
              {publishers.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'manga' && (
          <GenrePicker
            options={genres.map((g) => ({ value: g, label: g }))}
            picked={picked}
            // a genre narrows All to manga; All genres only clears the genres
            onChange={(next) =>
              next.length
                ? mangaOnly({ genre: next.join(',') })
                : upd({ genre: null })
            }
          />
        )}
      </div>
      {!filtered && (
        <>
          <ComicRail
            title="Your comics & manga"
            works={landing.data?.library}
            loading={false}
            link={['See all', '/comics?show=library']}
          />
          <ComicRail
            title="Trending manga"
            works={landing.data?.trending}
            loading={!landing.data && !landing.error}
            link={['See all', '/comics?type=manga&sort=trending']}
          />
          <ComicRail
            title="New manga"
            works={landing.data?.newest}
            loading={!landing.data && !landing.error}
            link={['See all', '/comics?type=manga&sort=newest']}
          />
          <ComicRail
            title="Western comics"
            works={landing.data?.western}
            loading={false}
            link={['See all', '/comics?type=comic']}
          />
        </>
      )}
      <section>
        <div className="sec-head">
          <h2>{gridTitle}</h2>
        </div>
        {list.error && !items.length && (
          <ServiceNote error={list.error} what="comics" retry={list.retry} />
        )}
        {!list.error &&
          !items.length &&
          !list.loading &&
          list.page > 0 &&
          (show !== 'not' || list.done) && (
            <div className="empty">
              {show === 'library' ? (
                <>
                  <b>Nothing in the library yet</b>
                  Request a series and it shows up here.
                </>
              ) : show === 'not' ? (
                <>
                  <b>You have all of these</b>Try another genre, or switch to
                  All.
                </>
              ) : kind === 'comic' ? (
                <>
                  <b>Western comics are still being catalogued</b>
                  SeerrNG is reading ComicVine’s catalogue in the background.
                  Use the search bar to find a series meanwhile.
                </>
              ) : (
                <>
                  <b>Nothing here</b>Try another genre, or switch to All.
                </>
              )}
            </div>
          )}
        {list.loading && !items.length && list.page === 0 && (
          <GridSkeleton className="comic-grid grid" />
        )}
        <div className="comic-grid grid">
          {items.map((w) => (
            <ComicCard key={w.id} w={w} />
          ))}
        </div>
        <MoreOnScroll
          done={list.done}
          loading={list.loading}
          more={list.more}
          error={list.error}
          retry={list.retry}
        />
      </section>
    </ExtraGate>
  );
}

// the chosen edition's volumes or issues, as ComicVine lists them
function ComicIssues({ id, manga }: { id: string; manga: boolean }) {
  const issues = usePaged<ComicIssue>(`/comic/${id}/issues`);
  if (!issues.items.length)
    return issues.error ? (
      <div>
        <div className="h2">{manga ? 'Volumes' : 'Issues'}</div>
        <ServiceNote
          error={issues.error}
          what={manga ? 'the volumes' : 'the issues'}
          retry={issues.retry}
        />
      </div>
    ) : null;
  return (
    <div>
      <div className="h2">{manga ? 'Volumes' : 'Issues'}</div>
      <ol className="slist tlist">
        {issues.items.map((i) => (
          <li key={i.id} className="trow">
            <span className="tn">#{i.issueNumber || '?'}</span>
            <span>
              <b>
                {i.name || `${manga ? 'Volume' : 'Issue'} #${i.issueNumber}`}
              </b>
              {i.coverDate && (
                <small>
                  {shortDate(i.coverDate, false)}, {i.coverDate.slice(0, 4)}
                </small>
              )}
            </span>
            <span />
          </li>
        ))}
      </ol>
      <MoreOnScroll
        done={issues.done}
        loading={issues.loading}
        more={issues.more}
        error={issues.error}
        retry={issues.retry}
      />
    </div>
  );
}

// ---- one work: its editions to choose from (English recommended), then the chosen
// edition's description and volumes ----
export function ComicDetail() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { kavitaUrl } = usePrefs();
  const {
    data: work,
    error: workError,
    reload,
  } = useApi<ComicWork>(`/comic/work/${encodeURIComponent(id)}`);
  const [pick, setPick] = useState<string | null>(null);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  // set at once, unlike busy: a double tap can't send the request twice
  const sending = useRef(false);
  useEffect(() => setPick(null), [id]);
  // #editions (from a card's "Choose edition") scrolls to the picker once it's there
  useEffect(() => {
    if (work && window.location.hash === '#editions')
      document.getElementById('editions')?.scrollIntoView({ block: 'start' });
  }, [work]);
  const editions = work?.editions || [];
  const stateOf = (editionId: string) => {
    const e = editions.find((x) => x.id === editionId);
    const st = comicState(e?.mediaInfo).stat;
    return asked.has(editionId) && st?.k !== 'ok'
      ? ({ k: 'wait', word: 'Requested', ico: 'clock' } as const)
      : st;
  };
  const chosenId =
    pick ??
    (work?.mediaEditionId && editions.some((e) => e.id === work.mediaEditionId)
      ? work.mediaEditionId
      : work?.recommendedId) ??
    editions[0]?.id;
  const chosen = editions.find((e) => e.id === chosenId);
  const { data: c } = useApi<Comic>(chosen ? `/comic/${chosen.id}` : null);
  if (workError)
    return (
      <ExtraGate k="comic">
        <ServiceNote error={workError} what="this comic" retry={reload} />
      </ExtraGate>
    );
  if (!work) return <div className="detail-loading" aria-busy="true" />;
  const manga = work.kind === 'manga';
  const unit = manga ? 'vol' : 'issue';
  // the chosen edition's own state: an edition not in the library doesn't show the owned
  // edition's progress or reader link
  const shown = chosen
    ? (chosen.mediaInfo ??
      (chosen.id === work.mediaEditionId ? work.mediaInfo : undefined))
    : work.mediaInfo;
  const cs = comicState(shown);
  const s = chosen ? stateOf(chosen.id) : cs.stat;
  const about = work.description
    ? work.description
        .split(/\n+/)
        .map((t) => t.trim())
        .filter(Boolean)
    : plainText(c?.description);
  const request = async () => {
    if (!chosen || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      toast(await requestComicEdition(work, chosen));
      setAsked((x) => new Set(x).add(chosen.id));
    } catch (e) {
      toast(friendlyError(e, 'Request failed'));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  // in the library: complete opens it in Kavita; part of it keeps its state and offers
  // the reader as well. No Kavita link: no button
  const readHref = kavitaLink(shown?.readerUrl, kavitaUrl);
  const complete =
    s?.k === 'ok' && shown?.status === MediaStatus.AVAILABLE;
  const read = readHref ? (
    <a
      className={`btn ${complete ? 'btn-primary' : 'btn-quiet'}`}
      href={readHref}
      target="_blank"
      rel="noopener"
    >
      <Icon name="book" />
      Read in Kavita
    </a>
  ) : null;
  const alsoRead = complete ? null : read;
  const main = !chosen ? (
    <button className="btn btn-tonal" disabled>
      <Icon name="clock" />
      {work.editionsResolved
        ? 'No edition to request yet'
        : 'Looking up editions…'}
    </button>
  ) : complete && read ? (
    read
  ) : s ? (
    <button className="btn btn-tonal" disabled>
      <Icon name={s.ico} />
      {s.word}
    </button>
  ) : (
    <button className="btn btn-primary" disabled={busy} onClick={request}>
      <Icon name="plus" />
      {editions.length > 1
        ? `Request · ${editionLabel(chosen)}`
        : manga
          ? 'Request manga'
          : 'Request series'}
    </button>
  );
  return (
    <ExtraGate k="comic">
      <article className="detail">
        <DetailTop
          status={s}
          poster={artUrl(work.posterPath)}
          whole
          title={work.title}
          line={[
            work.startYear,
            manga ? 'Manga' : 'Comic',
            chosen?.publisher || work.publisher,
            chosen?.issueCount ? `${chosen.issueCount} ${unit}s` : '',
          ]}
        />
        <div className="dbody">
          <div className="dstatus">
            <StatPill s={s} />
            {cs.detail && <span className="dnote">{cs.detail}</span>}
            {(work.genres || []).slice(0, 4).map((g) => (
              <Pill key={g} k="neutral">
                {g}
              </Pill>
            ))}
          </div>
          {alsoRead && <div className="dacts ph">{alsoRead}</div>}
          {cs.pct != null && (
            <div
              className="progress"
              role="progressbar"
              aria-label="Download progress"
              aria-valuenow={cs.pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: `${cs.pct}%` }} />
            </div>
          )}
          <div className="dcols">
            <div style={{ display: 'grid', gap: 22 }}>
              {c?.deck && !work.description && (
                <p className="tagline">{c.deck}</p>
              )}
              {about.slice(0, 4).map((t, i) => (
                <p key={i} className="ov">
                  {t}
                </p>
              ))}
              <div id="editions">
                <div className="sec-head">
                  <h2>
                    {editions.length > 1 ? 'Choose an edition' : 'Edition'}
                  </h2>
                  <span className="note">
                    {editions.length > 1 ? `${editions.length} editions` : ''}
                  </span>
                </div>
                {!editions.length && (
                  <p className="note">
                    {work.editionsResolved
                      ? 'ComicVine has no edition of this series yet, so it can’t be requested.'
                      : 'Couldn’t look up the editions right now. Try again in a minute.'}
                  </p>
                )}
                {!!editions.length && (
                  <div
                    className="nlist"
                    role="radiogroup"
                    aria-label="Editions"
                  >
                    {editions.map((e) => {
                      const st = stateOf(e.id);
                      const on = chosenId === e.id;
                      return (
                        <div
                          key={e.id}
                          className={`nrow ${st?.k === 'ok' ? 'owned' : ''}`}
                          role="radio"
                          aria-checked={on}
                          tabIndex={0}
                          onClick={() => setPick(e.id)}
                          onKeyDown={(ev) => {
                            if (ev.key === ' ' || ev.key === 'Enter') {
                              ev.preventDefault();
                              setPick(e.id);
                            }
                          }}
                        >
                          <span className="radio">
                            {st?.k === 'ok' && <Icon name="check" />}
                          </span>
                          <span className="nart">
                            {e.posterPath ? (
                              <img
                                src={artUrl(e.posterPath)}
                                alt=""
                                loading="lazy"
                              />
                            ) : (
                              <Icon name="comic" />
                            )}
                          </span>
                          <span>
                            <div className="who">
                              {e.languageName || e.publisher || e.title}
                              {e.languageName && e.publisher && (
                                <small> · {e.publisher}</small>
                              )}
                            </div>
                            <div className="det">
                              {[
                                e.title !== work.title ? e.title : '',
                                e.startYear,
                                e.issueCount
                                  ? `${e.issueCount} ${unit}${e.issueCount === 1 ? '' : 's'}`
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' · ') || editionLine(e, unit)}
                            </div>
                            <div className="tags">
                              {e.recommended && (
                                <span className="tag rec">
                                  <Icon name="star" />
                                  Recommended
                                </span>
                              )}
                              {st?.k === 'ok' && (
                                <span className="tag own">
                                  <Icon name="check" />
                                  {st.word}
                                </span>
                              )}
                              {st && st.k !== 'ok' && (
                                <span className="tag wait">
                                  <Icon name={st.ico} />
                                  {st.word}
                                </span>
                              )}
                            </div>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="dacts pc">
                {main}
                {alsoRead}
              </div>
              {chosen && <ComicIssues id={chosen.id} manga={manga} />}
            </div>
            <aside>
              <Facts
                rows={[
                  [
                    'Type',
                    manga
                      ? chosen?.languageName
                        ? `Manga, ${chosen.languageName} edition`
                        : 'Manga'
                      : chosen?.languageName &&
                          chosen.languageName !== 'English'
                        ? `Comic, ${chosen.languageName} edition`
                        : 'Comic',
                  ],
                  ['Publisher', chosen?.publisher || work.publisher],
                  ['Started', chosen?.startYear || work.startYear],
                  [
                    manga ? 'Volumes' : 'Issues',
                    chosen?.issueCount ? String(chosen.issueCount) : '',
                  ],
                  [
                    'Status',
                    work.status === 'ongoing'
                      ? 'Ongoing'
                      : work.status === 'finished'
                        ? 'Finished'
                        : work.status === 'hiatus'
                          ? 'On hiatus'
                          : work.status === 'cancelled'
                            ? 'Cancelled'
                            : '',
                  ],
                  [
                    'In library',
                    chosen?.mediaInfo?.comicProgress?.total
                      ? `${Math.min(chosen.mediaInfo.comicProgress.owned, chosen.mediaInfo.comicProgress.total)} of ${chosen.mediaInfo.comicProgress.total}`
                      : '',
                  ],
                ]}
              />
            </aside>
          </div>
        </div>
        <div className="actionbar">
          <span className="ab-meta">
            <b>{work.title}</b>
            {chosen ? editionLabel(chosen) : work.publisher}
          </span>
          {main}
        </div>
      </article>
    </ExtraGate>
  );
}

// ---- magazines: the tracked list from LazyLibrarian, or a Google Books search ----
export function Magazines() {
  const { q, setQ, query } = useQueryParam();
  // tracked titles are listed by default; a search looks further afield
  const list = usePaged<Magazine>(
    query
      ? `/discover/magazines?catalog=public&query=${encodeURIComponent(query)}`
      : '/discover/magazines?catalog=tracked'
  );
  return (
    <ExtraGate k="magazine">
      <ExtraHeader
        title="Magazines"
        sub={
          query
            ? 'Search results. Request a title to start getting new issues.'
            : 'Titles the library follows. Search to find more.'
        }
      >
        <ExtraSearch
          value={q}
          onChange={setQ}
          placeholder="Search magazines…"
        />
      </ExtraHeader>
      <ServiceNote
        error={list.items.length ? null : list.error}
        what="magazines"
        retry={list.retry}
      />
      {!list.error && !list.items.length && !list.loading && (
        <div className="empty">
          <b>{query ? 'No magazines found' : 'No magazines yet'}</b>
          {query
            ? 'Try the magazine’s full title.'
            : 'Search for a title to request it.'}
        </div>
      )}
      <div className="grid">
        {list.items.map((m) => (
          <ExtraCard
            key={m.id}
            href={`/magazine/${encodeURIComponent(m.title)}`}
            img={m.posterPath}
            title={m.title}
            shape="book"
            icon="magazine"
            stat={extraStat(m.mediaInfo)}
            meta={[
              m.publisher,
              m.latestIssue ? `Latest ${m.latestIssue}` : m.firstPublishYear,
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
      </div>
      <MoreOnScroll
        done={list.done}
        loading={list.loading}
        more={list.more}
        error={list.error}
        retry={list.retry}
      />
    </ExtraGate>
  );
}

export function MagazineDetail() {
  const { title = '' } = useParams();
  const {
    data: m,
    error,
    reload,
  } = useApi<Magazine>(`/magazine/${encodeURIComponent(title)}`);
  if (error)
    return (
      <ExtraGate k="magazine">
        <ServiceNote error={error} what="this magazine" retry={reload} />
      </ExtraGate>
    );
  if (!m) return <div className="detail-loading" aria-busy="true" />;
  const s = extraStat(m.mediaInfo);
  const have = (m.issues || []).filter((i) => i.available).length;
  const main =
    m.requestable === false ? null : (
      <RequestButton
        stat={s}
        label="Request magazine"
        request={() => requestExtra('magazine', m.title)}
      />
    );
  return (
    <ExtraGate k="magazine">
      <article className="detail">
        <DetailTop
          status={s}
          poster={m.posterPath}
          title={m.title}
          line={[
            m.publisher,
            m.firstPublishYear,
            m.issueCount ? `${m.issueCount} issues` : '',
          ]}
        />
        <div className="dbody">
          <div className="dstatus">
            <StatPill s={s} />
            {have > 0 && (
              <Pill k="ok" icon="check">
                {have} issue{have === 1 ? '' : 's'} in library
              </Pill>
            )}
          </div>
          <div className="dacts pc">{main}</div>
          <div className="dcols">
            <div>
              {!!m.issues?.length && (
                <>
                  <div className="h2">Issues</div>
                  <ol className="slist tlist">
                    {m.issues.map((i) => (
                      <li key={i.id} className="trow">
                        <span className="tn" />
                        <span>
                          <b>{i.date || i.id}</b>
                        </span>
                        {i.available ? (
                          <Pill k="ok" icon="check">
                            In library
                          </Pill>
                        ) : (
                          <span className="tl">Not yet</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
            <aside>
              <Facts
                rows={[
                  ['Publisher', m.publisher],
                  ['Latest issue', m.latestIssue],
                  ['Status', m.status],
                  [
                    'Source',
                    m.provider === 'googlebooks'
                      ? 'Google Books'
                      : 'LazyLibrarian',
                  ],
                ]}
              />
            </aside>
          </div>
        </div>
        {main && (
          <div className="actionbar">
            <span className="ab-meta">
              <b>{m.title}</b>
              {m.publisher}
            </span>
            {main}
          </div>
        )}
      </article>
    </ExtraGate>
  );
}

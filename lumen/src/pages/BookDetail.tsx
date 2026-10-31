import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  bookIdFor,
  chaptarrWork,
  englishAudioEdition,
  hardcoverEbookId,
  hardcoverWorkId,
  MediaStatus,
  narratorKey,
  requestAnotherNarration,
  requestBook,
  type BookDetails,
  type ChaptarrEdition,
  type ChaptarrWork,
  type Edition,
} from '../api';
import { statusOf } from '../components/cards';
import {
  ActionBar,
  DetailTop,
  Facts,
  fmtHrs,
  Pill,
} from '../components/detail';
import { useToast } from '../components/toast';
import { dropCache, useApi } from '../hooks';
import { Icon } from '../icons';
import { usePrefs } from '../settings';

const english = (e: Edition) =>
  !e.language || /^(en|eng|english|und)$/i.test(e.language);
const who = (e: Edition) =>
  e.narrators?.length
    ? e.narrators.length > 3
      ? `${e.narrators.slice(0, 3).join(', ')} +${e.narrators.length - 3}`
      : e.narrators.join(' & ')
    : 'Narrator not listed';

// one row per distinct narrator set; the copy with the most detail wins
function narrations(list: Edition[]) {
  const by = new Map<string, Edition>();
  for (const e of list.filter((x) => x.format === 'audiobook' && english(x))) {
    const k = narratorKey(e.narrators) || 'unknown:' + e.id;
    const cur = by.get(k);
    const score = (x: Edition) =>
      (x.durationSeconds ? 2 : 0) +
      (x.publisher ? 1 : 0) +
      (x.owned ? 4 : 0) +
      (x.selected ? 3 : 0);
    if (!cur || score(e) > score(cur))
      by.set(k, {
        ...e,
        owned: e.owned || cur?.owned,
        selected: e.selected || cur?.selected,
      });
  }
  // full-cast productions show up as several listings (different cast subsets, or just "Full Cast");
  // keep one row for them: the one with the most detail
  const castScore = (x: Edition) =>
    (x.durationSeconds ? 4 : 0) +
    (x.owned ? 8 : 0) +
    (x.narrators?.length || 0) / 100;
  const isCast = (x: Edition) =>
    (x.narrators?.length || 0) > 3 || narratorKey(x.narrators) === 'full cast';
  const cast = [...by.values()]
    .filter(isCast)
    .sort((a, b) => castScore(b) - castScore(a));
  const rows = [...by.values()]
    .filter((x) => !isCast(x))
    .concat(cast.slice(0, 1));
  // unnamed recordings only add noise when named ones exist; "Any English narrator" covers them
  const named = rows.filter((r) => r.narrators?.length || r.owned);
  return (named.length ? named : rows).sort(
    (a, b) =>
      Number(!!b.owned) - Number(!!a.owned) ||
      Number(!!b.selected) - Number(!!a.selected) ||
      (b.narrators?.length ? 1 : 0) - (a.narrators?.length ? 1 : 0)
  );
}

// is a ChaptarrNG copy (narrator text) the same recording as a narration row (narrator key)?
// full casts are listed with different subsets of the same cast, so overlap counts
function sameCopy(k: string, narrator?: string) {
  const theirs = narratorKey(String(narrator || '').split(/\s*,\s*/))
    .split('|')
    .filter(Boolean);
  if (!k || !theirs.length) return false;
  if (narratorKey(theirs) === k) return true;
  const mine = new Set(k.split('|'));
  if (mine.size < 3 || theirs.length < 3) return false;
  const shared = theirs.filter((n) => mine.has(n)).length;
  return shared >= 3 || shared >= Math.min(mine.size, theirs.length) / 2;
}

export default function BookDetail() {
  const { id = '' } = useParams();
  const [p] = useSearchParams();
  const f: 'ebook' | 'audiobook' =
    p.get('f') === 'audio' ? 'audiobook' : 'ebook';
  const { prefs } = usePrefs();
  const toast = useToast();
  const plainId = bookIdFor(decodeURIComponent(id), f);
  const first = useApi<BookDetails>(`/book/${encodeURIComponent(plainId)}`);
  // plain ebook id not found (newer SeerrNG looks it up on Goodreads): retry naming Hardcover
  const altId = f === 'ebook' && first.error ? hardcoverEbookId(plainId) : null;
  const second = useApi<BookDetails>(
    altId ? `/book/${encodeURIComponent(altId)}` : null
  );
  const bookId = altId && second.data ? altId : plainId;
  const b = first.data || second.data;
  const error = first.error && (!altId || second.error) ? first.error : null;
  const reload = altId ? second.reload : first.reload;
  const work = hardcoverWorkId(bookId);
  const showNarr = f === 'audiobook' && prefs.narratorChoice;
  const eds = useApi<{ editions: Edition[] }>(
    showNarr && work
      ? `/editions/book?format=audiobook&term=${encodeURIComponent('work:' + work)}`
      : null
  );
  const allRows = useMemo(
    () => narrations(eds.data?.editions || []),
    [eds.data]
  );
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // ChaptarrNG's view of this work: which narrations are already here, and its own ids
  const [cw, setCw] = useState<ChaptarrWork[] | null | undefined>(undefined);
  const [cwTick, setCwTick] = useState(0);
  const [justAsked, setJustAsked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!showNarr || !work) return;
    let live = true;
    chaptarrWork(work)
      .then((d) => live && setCw(d))
      .catch(() => live && setCw(null));
    return () => {
      live = false;
    };
  }, [showNarr, work, cwTick]);
  // ChaptarrNG also lists unmonitored catalogue entries (an author's other books); only copies
  // with files or that are monitored count as "in the library" or "requested"
  const local = useMemo(
    () =>
      (cw || [])
        .flatMap((w) => w.localAudiobookBooks || [])
        .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)
        .filter((x) => x.hasFiles || (x as { monitored?: boolean }).monitored),
    [cw]
  );
  // SeerrNG often leaves an edition's language blank; ChaptarrNG knows it (e.g. German or French
  // narrations listed with no language). Drop narrations ChaptarrNG only has in other languages.
  const langs = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of (cw || []).flatMap((w) => w.editions || [])) {
      const k = narratorKey(
        e.narratorNames?.length
          ? e.narratorNames
          : e.narrator
            ? e.narrator.split(/\s*,\s*/)
            : []
      );
      if (!k) continue;
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add((e.language || 'und').toLowerCase());
    }
    return m;
  }, [cw]);
  const rows = useMemo(
    () =>
      allRows.filter((r) => {
        const l = langs.get(narratorKey(r.narrators));
        if (!l) return true;
        const known = [...l].filter((x) => x !== 'und');
        return !known.length || known.some((x) => /^(en|eng)$/.test(x));
      }),
    [allRows, langs]
  );
  const cEditions = useMemo(
    () =>
      (cw || [])
        .flatMap((w) => w.editions || [])
        .filter((e) => e.bookId > 0 && (!e.format || e.format === 'audiobook')),
    [cw]
  );
  // the library already has (or has asked for) this audiobook: other narrators are added as separate copies
  const anotherMode = local.length > 0;
  const stateOf = (r: Edition): '' | 'library' | 'requested' => {
    const k = narratorKey(r.narrators);
    if (k && justAsked.has(k)) return 'requested';
    const hit = local.filter((l) => sameCopy(k, l.narrator));
    if (k && hit.some((l) => l.hasFiles)) return 'library';
    if (k && hit.length) return 'requested';
    return r.owned ? 'library' : '';
  };
  const chaptarrFor = (r: Edition): ChaptarrEdition | undefined => {
    const num = r.id.replace(/^hc:/, '');
    return (
      cEditions.find((e) => String(e.foreignEditionId) === num) ||
      cEditions.find(
        (e) =>
          narratorKey(
            e.narratorNames?.length
              ? e.narratorNames
              : e.narrator
                ? e.narrator.split(/\s*,\s*/)
                : []
          ) === narratorKey(r.narrators)
      )
    );
  };

  if (error)
    return f === 'ebook' ? (
      <div className="empty">
        <b>No ebook edition found</b>ChaptarrNG only knows this book as an
        audiobook.{' '}
        <Link
          to={`/book/${encodeURIComponent(bookIdFor(bookId, 'audiobook'))}?f=audio`}
          style={{ color: 'var(--accent)' }}
        >
          See the audiobook
        </Link>
      </div>
    ) : (
      <div className="empty">
        <b>Couldn’t load this book</b>
        {error}
      </div>
    );
  if (!b) return <div className="detail-loading" aria-busy="true" />;

  const s = statusOf(b.mediaInfo, true);
  const unlisted = local.filter(
    (l) =>
      l.hasFiles &&
      !rows.some((r) => sameCopy(narratorKey(r.narrators), l.narrator))
  );
  const ownedRows = rows.filter((r) => stateOf(r) === 'library');
  const ownsAny = ownedRows.length > 0 || local.some((l) => l.hasFiles);
  // another-narrator copies need a named narrator and ChaptarrNG's edition id
  const requestable = rows.filter(
    (r) =>
      !stateOf(r) && (!anotherMode || (r.narrators?.length && chaptarrFor(r)))
  );
  const chosen =
    pick ??
    (anotherMode
      ? ''
      : ((requestable.find((r) => r.selected) || requestable[0])?.id ?? '*'));
  const chosenRow = rows.find((r) => r.id === chosen);
  const longest = Math.max(0, ...rows.map((r) => r.durationSeconds || 0));
  const series = b.series?.[0];
  const audio = f === 'audiobook';
  const available = b.mediaInfo?.status === MediaStatus.AVAILABLE;

  const requestAnother = async () => {
    const row = rows.find((r) => r.id === chosen);
    const ce = row && chaptarrFor(row);
    if (!row || !ce) return;
    setBusy(true);
    try {
      const res = await requestAnotherNarration(ce.bookId, ce.id);
      setJustAsked((x) => new Set(x).add(narratorKey(row.narrators)));
      setPick(null);
      toast(
        res.alreadyTracked
          ? `${who(row)} is already in the library or requested`
          : `Requested ${b.title} · ${res.narrators}. It arrives as a separate copy.`
      );
      setCwTick((t) => t + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };
  const request = async () => {
    setBusy(true);
    try {
      // "any narrator" or narrator choice off: still target an English recording
      const exact = audio && showNarr && chosen !== '*' ? chosen : undefined;
      const fallback =
        audio && !exact
          ? rows.find((r) => r.selected && r.narrators?.length)?.id ||
            (await englishAudioEdition(work))
          : undefined;
      await requestBook(
        bookId,
        f,
        exact || fallback,
        exact ? 'only' : 'either'
      );
      if (audio && showNarr && chosenRow)
        setJustAsked((x) => new Set(x).add(narratorKey(chosenRow.narrators)));
      setPick(null);
      setCwTick((t) => t + 1);
      toast(
        `Requested ${b.title} · ${audio ? (showNarr && chosenRow ? who(chosenRow) : 'audiobook') : 'ebook'}`
      );
      dropCache(`/book/${encodeURIComponent(bookId)}`);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };
  const label = !audio
    ? 'Request ebook'
    : showNarr && chosenRow
      ? `Request · ${who(chosenRow)}`
      : 'Request audiobook';
  const listen = (
    <button className="btn btn-ok">
      <Icon name="play" />
      Listen in Audiobookshelf
    </button>
  );
  const main =
    audio && showNarr && anotherMode ? (
      chosenRow ? (
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={requestAnother}
        >
          <Icon name="plus" />
          Request another narrator · {who(chosenRow)}
        </button>
      ) : ownsAny ? (
        listen
      ) : (
        <button className="btn btn-tonal" disabled>
          <Icon name="clock" />
          Requested
        </button>
      )
    ) : available && (!showNarr || !requestable.length) ? (
      <button className="btn btn-ok">
        <Icon name={audio ? 'play' : 'book'} />
        {audio ? 'Listen in Audiobookshelf' : 'Read in Audiobookshelf'}
      </button>
    ) : s && s.k !== 'ok' ? (
      <button className="btn btn-tonal" disabled>
        <Icon name={s.ico} />
        {s.word}
      </button>
    ) : (
      <button className="btn btn-primary" disabled={busy} onClick={request}>
        <Icon name="plus" />
        {label}
      </button>
    );

  return (
    <article className="detail">
      <DetailTop
        poster={b.posterPath || undefined}
        square={audio}
        title={b.title}
        by={
          series?.title ? (
            <>
              {series.title}
              {series.position ? ` #${series.position}` : ''}
            </>
          ) : undefined
        }
        line={[
          b.firstPublishYear,
          audio && longest ? fmtHrs(longest) + ' listen' : '',
          audio ? 'Audiobook' : 'Ebook',
        ]}
      />
      <div className="dbody">
        <div className="fmt">
          <Link
            to={`/book/${encodeURIComponent(bookIdFor(bookId, 'ebook'))}`}
            aria-current={!audio ? 'page' : undefined}
          >
            <b>
              <Icon name="book" size="sm" />
              Ebook
            </b>
            <small>EPUB, works with Kindle</small>
          </Link>
          <Link
            to={`/book/${encodeURIComponent(bookIdFor(bookId, 'audiobook'))}?f=audio`}
            aria-current={audio ? 'page' : undefined}
          >
            <b>
              <Icon name="headphones" size="sm" />
              Audiobook
            </b>
            <small>
              {showNarr && rows.length
                ? `${rows.length} narration${rows.length > 1 ? 's' : ''}${longest ? ' · ' + fmtHrs(longest) : ''}`
                : 'Unabridged'}
            </small>
          </Link>
        </div>
        <div className="dstatus">
          {s && (
            <Pill k={s.k} icon={s.ico}>
              {s.word}
            </Pill>
          )}
        </div>
        <div className="dcols">
          <div style={{ display: 'grid', gap: 22 }}>
            {showNarr ? (
              <div id="narr">
                <div className="sec-head">
                  <h2>{anotherMode ? 'Narrations' : 'Choose a narrator'}</h2>
                  <span className="note">
                    {eds.data
                      ? `${rows.length} English recording${rows.length === 1 ? '' : 's'}`
                      : ''}
                  </span>
                </div>
                {anotherMode && eds.data && (
                  <p className="note" style={{ margin: '-4px 0 12px' }}>
                    {requestable.length
                      ? 'You already have this audiobook. Pick another narrator to add it as a separate copy; nothing you have is replaced.'
                      : 'Every narration we can request is already in the library or on its way.'}
                  </p>
                )}
                {!work && (
                  <p className="note">
                    This listing has no narrator details. Requesting it gets the
                    best available English recording.
                  </p>
                )}
                {work && !eds.data && !eds.error && (
                  <p className="note">Looking up recordings…</p>
                )}
                {eds.error && (
                  <p className="note">
                    Couldn’t load narrators ({eds.error}). You can still request
                    the best available recording.
                  </p>
                )}
                {eds.data && (
                  <div
                    className="nlist"
                    role="radiogroup"
                    aria-label="Narrations"
                  >
                    {rows.map((r) => {
                      const st = stateOf(r);
                      const locked = !!st || !requestable.includes(r);
                      const on = !locked && chosen === r.id;
                      return (
                        <div
                          key={r.id}
                          className={`nrow ${st === 'library' ? 'owned' : ''} ${locked && !st ? 'unavailable' : ''}`}
                          role="radio"
                          aria-checked={on}
                          aria-disabled={locked}
                          tabIndex={locked ? -1 : 0}
                          onClick={() => !locked && setPick(r.id)}
                          onKeyDown={(e) => {
                            if (
                              !locked &&
                              (e.key === ' ' || e.key === 'Enter')
                            ) {
                              e.preventDefault();
                              setPick(r.id);
                            }
                          }}
                        >
                          <span className="radio">
                            {st === 'library' && <Icon name="check" />}
                          </span>
                          <span className="nart">
                            {b.posterPath ? (
                              <img src={b.posterPath} alt="" loading="lazy" />
                            ) : (
                              <Icon name="headphones" />
                            )}
                          </span>
                          <span>
                            <div className="who">{who(r)}</div>
                            <div className="det">
                              {[
                                fmtHrs(r.durationSeconds),
                                r.publisher,
                                r.releaseDate?.slice(0, 4),
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'Details unknown'}
                            </div>
                            <div className="tags">
                              {r.selected && !st && !anotherMode && (
                                <span className="tag rec">
                                  <Icon name="star" />
                                  Recommended
                                </span>
                              )}
                              {st === 'library' && (
                                <span className="tag own">
                                  <Icon name="check" />
                                  In library
                                </span>
                              )}
                              {st === 'requested' && (
                                <span className="tag wait">
                                  <Icon name="clock" />
                                  Requested
                                </span>
                              )}
                              {locked && !st && (
                                <span className="tag">
                                  Can’t be requested yet
                                </span>
                              )}
                              {(r.narrators?.length || 0) > 3 && (
                                <span className="tag">
                                  <Icon name="user" />
                                  Full cast
                                </span>
                              )}
                            </div>
                          </span>
                        </div>
                      );
                    })}
                    {unlisted.map((l) => (
                      <div
                        key={'local' + l.id}
                        className="nrow owned"
                        role="radio"
                        aria-checked={false}
                        aria-disabled
                        tabIndex={-1}
                      >
                        <span className="radio">
                          <Icon name="check" />
                        </span>
                        <span className="nart">
                          {b.posterPath ? (
                            <img src={b.posterPath} alt="" loading="lazy" />
                          ) : (
                            <Icon name="headphones" />
                          )}
                        </span>
                        <span>
                          <div className="who">{l.narrator || l.title}</div>
                          <div className="det">{l.title}</div>
                          <div className="tags">
                            <span className="tag own">
                              <Icon name="check" />
                              In library
                            </span>
                          </div>
                        </span>
                      </div>
                    ))}
                    {!anotherMode && !ownedRows.length && (
                      <div
                        className="nrow nany"
                        role="radio"
                        aria-checked={chosen === '*'}
                        tabIndex={0}
                        onClick={() => setPick('*')}
                      >
                        <span className="radio" />
                        <span className="nart">
                          <Icon name="spark" />
                        </span>
                        <span>
                          <div className="who">Any English narrator</div>
                          <div className="det">
                            Fastest. We grab the best copy we can find.
                          </div>
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="ov">
                {audio
                  ? 'We’ll grab the best available unabridged recording.'
                  : 'The ebook arrives as an EPUB in Audiobookshelf, ready to read or send to your Kindle.'}
              </p>
            )}
            <div className="dacts pc">
              {main}
              {anotherMode && ownsAny && chosenRow ? listen : null}
            </div>
          </div>
          <aside>
            <Facts
              rows={[
                [
                  'Series',
                  series?.title
                    ? `${series.title}${series.position ? ' #' + series.position : ''}`
                    : '',
                ],
                ['First published', b.firstPublishYear],
                ['Listening time', audio && longest ? fmtHrs(longest) : ''],
                ['Subjects', (b.subjects || []).slice(0, 4).join(', ')],
              ]}
            />
          </aside>
        </div>
      </div>
      <ActionBar
        title={audio ? 'Audiobook' : 'Ebook'}
        meta={audio && longest ? fmtHrs(longest) : undefined}
      >
        {main}
      </ActionBar>
    </article>
  );
}

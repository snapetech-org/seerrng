import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { artUrl } from '../api';
import { friendlyError } from '../errors';
import {
  loadComicWork,
  recommendedEdition,
  requestExtra,
  type ComicEdition,
  type ComicWork,
} from '../extras';
import { Icon } from '../icons';
import { usePrefs } from '../settings';
import { Cover, Glyph, TouchQuick, type Stat } from './cards';
import { comicState } from './extra';
import { useToast } from './toast';

// The comic/manga card: same poster, glyph, hover overlay and touch button as
// the series and audiobook cards. Request asks for the recommended (English)
// edition; "Choose edition" opens the work's page at its edition picker, the
// way audiobooks offer "Choose narrator".

export const comicWorkHref = (w: Pick<ComicWork, 'id'>) =>
  `/comic/${encodeURIComponent(w.id)}`;

const STATUS_WORD = {
  ongoing: 'Ongoing',
  finished: 'Finished',
  hiatus: 'On hiatus',
  cancelled: 'Cancelled',
} as const;

// the line under the title: what it is, then publisher or year
export const comicCardMeta = (w: ComicWork) =>
  [
    w.kind === 'manga' ? 'Manga' : 'Comic',
    w.kind === 'comic' ? w.publisher : '',
    w.startYear,
  ]
    .filter(Boolean)
    .join(' · ');

export const editionLabel = (e: ComicEdition) =>
  [e.publisher, e.languageName].filter(Boolean).join(', ');

/** Asks for one edition and says which in the toast. */
export async function requestComicEdition(
  w: ComicWork,
  e: ComicEdition
): Promise<string> {
  await requestExtra('comic', Number(e.id));
  return `Requested ${w.title} · ${editionLabel(e) || 'edition'}`;
}

export function ComicCard({ w }: { w: ComicWork }) {
  const { prefs } = usePrefs();
  const toast = useToast();
  const nav = useNavigate();
  const cs = comicState(w.mediaInfo);
  const [asked, setAsked] = useState('');
  const s: Stat =
    asked && cs.stat?.k !== 'ok'
      ? { k: 'wait', word: 'Requested', ico: 'clock' }
      : cs.stat;
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const href = comicWorkHref(w);
  const editions = w.editions.length;
  const rec = recommendedEdition(w);
  // a manga from AniList with its editions not looked up yet can still be
  // requested: the lookup runs on the tap
  const quick = !!rec || !w.editionsResolved;
  const request = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      let work = w;
      let edition = rec;
      if (!edition) {
        work = await loadComicWork(w.id);
        edition = recommendedEdition(work);
      }
      if (!edition) {
        toast(`No English edition of ${w.title} found. Choose one instead.`);
        nav(href + '#editions');
        return;
      }
      const said = await requestComicEdition(work, edition);
      setAsked(edition.id);
      toast(said);
    } catch (e) {
      toast(friendlyError(e, 'Request failed'));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  const qm = [
    w.startYear,
    w.status ? STATUS_WORD[w.status] : '',
    editions > 1 ? `${editions} editions` : rec?.publisher || w.publisher || '',
  ]
    .filter(Boolean)
    .join(' · ');
  const choose = (
    <Link
      className="qbtn ghost"
      to={href + '#editions'}
      aria-label="Choose edition"
      title="Choose edition"
    >
      <Icon name="list" size="sm" />
    </Link>
  );
  return (
    <div className="poster book comic-card">
      <div className="art">
        <Cover
          src={artUrl(w.posterPath)}
          title={w.title}
          sub={w.startYear}
          icon="comic"
        />
        <Glyph s={s} />
        {cs.pct != null && !asked && (
          <span className="bar" aria-hidden="true">
            <i style={{ width: `${cs.pct}%` }} />
          </span>
        )}
        <Link className="hit" to={href} aria-label={w.title} />
        {prefs.hoverRequest && !s && quick && (
          <TouchQuick
            label={`Request ${w.title}${rec ? ` (${editionLabel(rec)})` : ''}`}
            onClick={request}
            busy={busy}
          />
        )}
        {prefs.hoverRequest && (
          <div className="qa">
            <div className="qt">{w.title}</div>
            <div className="qm">{qm}</div>
            <div className="qb">
              {s?.k === 'ok' ? (
                <>
                  <Link className="qbtn okb" to={href}>
                    <Icon name="book" size="sm" />
                    {s.word}
                  </Link>
                  {editions > 1 && choose}
                </>
              ) : s ? (
                <button className="qbtn done" disabled>
                  <Icon name={s.ico} size="sm" />
                  {s.word}
                </button>
              ) : quick ? (
                <>
                  <button
                    className="qbtn go"
                    disabled={busy}
                    onClick={() => void request()}
                  >
                    <Icon name="plus" size="sm" />
                    Request
                  </button>
                  {choose}
                </>
              ) : (
                <Link className="qbtn go" to={href + '#editions'}>
                  <Icon name="list" size="sm" />
                  Choose edition
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
      <Link className="t" to={href} tabIndex={-1} aria-hidden="true">
        {w.title}
      </Link>
      <div className="m">{comicCardMeta(w)}</div>
      {s && s.k !== 'wait' && cs.detail && (
        <div className="m2">{cs.detail}</div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { artUrl, kavitaLink, MediaStatus } from '../api';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import {
  loadComicWork,
  recommendedEdition,
  requestExtra,
  type ComicEdition,
  type ComicWork,
} from '../extras';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { usePrefs } from '../settings';
import { Cover, Glyph, StatLabel, TouchQuick, type Stat } from './cards';
import { ConfirmSheet } from './ConfirmSheet';
import { canChooseRequestOptions, canRequestComic } from './detail';
import { comicState } from './extra';
import { useToast } from './toast';
import WatchlistButton from './WatchlistButton';

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

export class ComicServiceFailure extends Error {}

export interface ComicRequestOptions {
  serverId?: number;
  rootFolder?: string;
}

interface ComicService {
  id: number;
  name: string;
  isDefault: boolean;
  backendType: 'mylar' | 'kapowarr' | 'backissue';
}

interface ComicRootFolders {
  defaultRootFolder: string | null;
  rootFolders: { id: number; path: string }[];
}

export function ComicRequestOptionsSheet({
  onConfirm,
  onClose,
}: {
  onConfirm: (options: ComicRequestOptions) => void;
  onClose: () => void;
}) {
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const services = useApi<ComicService[]>('/service/comic');
  const [serviceId, setServiceId] = useState('');
  const fallback =
    services.data?.find((service) => service.isDefault) ?? services.data?.[0];
  const service =
    services.data?.find((item) => String(item.id) === serviceId) ?? fallback;
  const rootPath =
    service?.backendType === 'kapowarr'
      ? `/service/comic/${service.id}/rootfolders`
      : null;
  const folders = useApi<ComicRootFolders>(rootPath);
  const preferred = useApi<Record<string, string>>(
    service?.backendType === 'kapowarr' && user?.id
      ? `/user/${user.id}/settings/request-root-folders`
      : null
  );
  const [rootFolder, setRootFolder] = useState('');
  useEffect(() => {
    setRootFolder('');
  }, [service?.id]);
  useEffect(() => {
    if (!service || !folders.data || rootFolder) return;
    const saved = preferred.data?.[`comic-kapowarr:${service.id}`];
    if (
      saved &&
      saved !== folders.data.defaultRootFolder &&
      folders.data.rootFolders.some((folder) => folder.path === saved)
    )
      setRootFolder(saved);
  }, [folders.data, preferred.data, rootFolder, service]);
  const canChoose = canChooseRequestOptions(user?.permissions);
  if (!canChoose) return null;
  return (
    <ConfirmSheet
      title={t(
        'lumen.comicDetail.requestOptionsTitle',
        'Comic request options'
      )}
      body={t(
        'lumen.comicDetail.requestOptionsHelp',
        'Choose a comics service and, for Kapowarr, a root folder.'
      )}
      confirm={t('lumen.comicDetail.submitRequest', 'Submit request')}
      cancel={t('lumen.quickRequest.cancel', 'Cancel')}
      confirmDisabled={
        (!services.data && !services.error) || services.data?.length === 0
      }
      onConfirm={() =>
        onConfirm({
          ...(service && serviceId ? { serverId: service.id } : {}),
          ...(service?.backendType === 'kapowarr' && rootFolder
            ? { rootFolder }
            : {}),
        })
      }
      onClose={onClose}
    >
      <div className="pk-form">
        {services.error && (
          <div className="err" role="alert">
            {t(
              'lumen.comicDetail.serviceLoadFailure',
              'Could not load comic service options. The request will use the default service.'
            )}
          </div>
        )}
        {services.data?.length === 0 && (
          <div className="err" role="alert">
            {t(
              'lumen.comicDetail.noComicService',
              'No comics service is configured. Comic requests are unavailable.'
            )}
          </div>
        )}
        <label className="sel" data-layout="stacked">
          <span className="lbl">
            {t('lumen.comicDetail.service', 'Comics service')}
          </span>
          <select
            value={serviceId}
            disabled={!services.data || services.data.length < 2}
            onChange={(event) => setServiceId(event.target.value)}
          >
            {fallback && (
              <option value="">
                {t('lumen.comicDetail.defaultService', 'Default ({name})', {
                  name: fallback.name,
                })}
              </option>
            )}
            {(services.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.backendType}
              </option>
            ))}
          </select>
        </label>
        {service?.backendType === 'kapowarr' && (
          <label className="sel" data-layout="stacked">
            <span className="lbl">
              {t('lumen.comicDetail.rootFolder', 'Kapowarr root folder')}
            </span>
            <select
              value={rootFolder}
              disabled={!folders.data}
              onChange={(event) => setRootFolder(event.target.value)}
            >
              <option value="">
                {t(
                  'lumen.comicDetail.configuredRootFolder',
                  'Configured default ({path})',
                  { path: folders.data?.defaultRootFolder || 'Not available' }
                )}
              </option>
              {(folders.data?.rootFolders ?? [])
                .filter(
                  (folder) => folder.path !== folders.data?.defaultRootFolder
                )
                .map((folder) => (
                  <option key={folder.id} value={folder.path}>
                    {folder.path}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
    </ConfirmSheet>
  );
}

/** Asks for one edition and says which in the toast. */
export async function requestComicEdition(
  w: ComicWork,
  e: ComicEdition,
  options: ComicRequestOptions = {}
): Promise<string> {
  const result = await requestExtra(
    'comic',
    Number(e.id),
    options.serverId,
    options.rootFolder
  );
  if ((result as { status?: number } | null)?.status === 4)
    throw new ComicServiceFailure();
  return `Requested ${w.title} · ${editionLabel(e) || 'edition'}`;
}

export function ComicCard({ w }: { w: ComicWork }) {
  const { t } = useLumenLocale();
  const { prefs, kavitaUrl } = usePrefs();
  const { user } = useAuth();
  const mayRequest = canRequestComic(user?.permissions);
  const asksOptions =
    prefs.requestOptions && canChooseRequestOptions(user?.permissions);
  const toast = useToast();
  const nav = useNavigate();
  const cs = comicState(w.mediaInfo);
  // in the library: a complete series reads in Kavita, part of one offers it beside its state
  const readHref = kavitaLink(w.mediaInfo?.readerUrl, kavitaUrl);
  const complete = w.mediaInfo?.status === MediaStatus.AVAILABLE;
  const [asked, setAsked] = useState('');
  const s: Stat =
    asked && cs.stat?.k !== 'ok'
      ? { k: 'wait', word: 'Requested', ico: 'clock' }
      : cs.stat;
  const [busy, setBusy] = useState(false);
  const [optionsTarget, setOptionsTarget] = useState<{
    work: ComicWork;
    edition: ComicEdition;
  } | null>(null);
  const running = useRef(false);
  // the card can scroll away (or the page change) while the lookup runs
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const href = comicWorkHref(w);
  const editions = w.editions.length;
  const rec = recommendedEdition(w);
  const watchlistId = w.mediaEditionId || rec?.id;
  // a manga from AniList with its editions not looked up yet can still be
  // requested: the lookup runs on the tap
  const quick = !!rec || !w.editionsResolved;
  const request = async () => {
    if (!mayRequest || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      let work = w;
      let edition = rec;
      if (!edition) {
        work = await loadComicWork(w.id);
        edition = recommendedEdition(work);
        if (!mounted.current) return;
        // the fresh lookup may show it's already here or asked for
        const st = edition && comicState(edition.mediaInfo).stat;
        if (st) {
          toast(`${w.title}: ${st.word}`);
          return;
        }
      }
      if (!edition) {
        toast(`No English edition of ${w.title} found. Choose one instead.`);
        nav(href + '#editions');
        return;
      }
      if (asksOptions) {
        setOptionsTarget({ work, edition });
        return;
      }
      const said = await requestComicEdition(work, edition);
      toast(said);
      if (mounted.current) setAsked(edition.id);
    } catch (e) {
      toast(
        e instanceof ComicServiceFailure
          ? t(
              'lumen.comicDetail.serviceFailure',
              'The request was submitted, but the comics service rejected it while processing.'
            )
          : friendlyError(
              e,
              t('lumen.error.requestFailed', 'Request failed'),
              t
            )
      );
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const submitOptions = async (options: ComicRequestOptions) => {
    if (!optionsTarget || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const said = await requestComicEdition(
        optionsTarget.work,
        optionsTarget.edition,
        options
      );
      toast(said);
      if (mounted.current) setAsked(optionsTarget.edition.id);
      setOptionsTarget(null);
    } catch (e) {
      toast(
        e instanceof ComicServiceFailure
          ? t(
              'lumen.comicDetail.serviceFailure',
              'The request was submitted, but the comics service rejected it while processing.'
            )
          : friendlyError(
              e,
              t('lumen.error.requestFailed', 'Request failed'),
              t
            )
      );
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const qm = [
    w.startYear,
    w.status ? STATUS_WORD[w.status] : '',
    editions > 1 ? `${editions} editions` : rec?.publisher || w.publisher || '',
  ]
    .filter(Boolean)
    .join(' · ');
  const readGhost = readHref ? (
    <a
      className="qbtn ghost"
      href={readHref}
      target="_blank"
      rel="noopener"
      aria-label={t(
        'lumen.accessibility.readInKavita',
        'Read {title} in Kavita',
        {
          title: w.title,
        }
      )}
      title={t('lumen.accessibility.readInKavita', 'Read {title} in Kavita', {
        title: w.title,
      })}
    >
      <Icon name="book" size="sm" />
    </a>
  ) : null;
  const choose = (
    <Link
      className="qbtn ghost"
      to={href + '#editions'}
      aria-label={t('lumen.accessibility.chooseEdition', 'Choose edition')}
      title={t('lumen.accessibility.chooseEdition', 'Choose edition')}
    >
      <Icon name="list" size="sm" />
    </Link>
  );
  return (
    <div className="poster book comic-card">
      {optionsTarget && (
        <ComicRequestOptionsSheet
          onConfirm={(options) => void submitOptions(options)}
          onClose={() => setOptionsTarget(null)}
        />
      )}
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
        {prefs.hoverRequest && mayRequest && !s && quick && (
          <TouchQuick
            label={`Request ${w.title}${rec ? ` (${editionLabel(rec)})` : ''}`}
            onClick={request}
            busy={busy}
          />
        )}
        {watchlistId && (
          <WatchlistButton
            mediaType="comic"
            detail={{ id: watchlistId, title: w.title }}
            requestedId={watchlistId}
            compact
            touch
          />
        )}
        {(prefs.hoverRequest || watchlistId) && (
          <div className="qa">
            {prefs.hoverRequest && mayRequest && (
              <>
                <div className="qt">{w.title}</div>
                <div className="qm">{qm}</div>
                <div className="qb">
                  {s?.k === 'ok' ? (
                    <>
                      {readHref && complete ? (
                        <a
                          className="qbtn okb"
                          href={readHref}
                          target="_blank"
                          rel="noopener"
                          aria-label={t(
                            'lumen.accessibility.readInKavita',
                            'Read {title} in Kavita',
                            { title: w.title }
                          )}
                        >
                          <Icon name="book" size="sm" />
                          {t('lumen.accessibility.read', 'Read')}
                        </a>
                      ) : (
                        // the same page as the poster's own link: kept out of Tab order
                        <Link
                          className="qbtn okb"
                          to={href}
                          tabIndex={-1}
                          aria-hidden="true"
                        >
                          <Icon name="book" size="sm" />
                          <span className="ql">
                            <StatLabel s={s} />
                          </span>
                        </Link>
                      )}
                      {readHref && !complete && readGhost}
                      {editions > 1 && choose}
                    </>
                  ) : s ? (
                    <>
                      <button className="qbtn done" disabled>
                        <Icon name={s.ico} size="sm" />
                        <span className="ql">
                          <StatLabel s={s} />
                        </span>
                      </button>
                      {readHref && readGhost}
                    </>
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
                      {t('lumen.accessibility.chooseEdition', 'Choose edition')}
                    </Link>
                  )}
                </div>
              </>
            )}
            {watchlistId && (
              <div className="qb watchlist-row">
                <WatchlistButton
                  mediaType="comic"
                  detail={{ id: watchlistId, title: w.title }}
                  requestedId={watchlistId}
                  compact
                />
              </div>
            )}
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

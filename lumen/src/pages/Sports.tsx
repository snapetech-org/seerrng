import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { isAdministrator, useAuth } from '../auth';
import {
  MoreOnScroll,
  Section,
  StatLabel,
  type Stat,
} from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import {
  canChooseRequestOptions,
  canRequestAdult,
  DetailTop,
  Facts,
} from '../components/detail';
import {
  ExtraCard,
  ExtraGate,
  ExtraHeader,
  ExtraSearch,
  extraStat,
  RequestButton,
  ServiceNote,
  StatPill,
} from '../components/extra';
import { useVideoRequestQuota } from '../components/requestSheet';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import {
  adultScenePath,
  requestExtra,
  type League,
  type Scene,
} from '../extras';
import { useApi, usePaged } from '../hooks';
import { useLumenLocale } from '../i18n';
import { useLiveTvStatus } from '../liveTv';
import { useLiveMediaProgress } from '../useLiveDownloadProgress';

// Sportarr knows whether a league is followed even before SeerrNG has a request for it
const leagueStat = (
  l: League,
  t: ReturnType<typeof useLumenLocale>['t']
): Stat =>
  extraStat(l.mediaInfo) ||
  (l.libraryState === 'monitored'
    ? { k: 'ok', word: t('lumen.sports.followed', 'Followed'), ico: 'check' }
    : l.libraryState === 'requested'
      ? {
          k: 'wait',
          word: t('lumen.status.requested', 'Requested'),
          ico: 'clock',
        }
      : null);

export function LeagueCard({ league: l }: { league: League }) {
  const { t } = useLumenLocale();
  return (
    <ExtraCard
      href={`/sportarr/${encodeURIComponent(l.id)}`}
      img={l.posterPath}
      title={l.title}
      shape="sq"
      icon="trophy"
      stat={leagueStat(l, t)}
      meta={[l.sport, l.country].filter(Boolean).join(' · ')}
    />
  );
}

function useSearchBox() {
  const [p, setP] = useSearchParams();
  const query = p.get('q') ?? p.get('query') ?? '';
  const [q, setQ] = useState(query);
  useEffect(() => {
    const value = q.trim();
    if (value === query) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(p);
      next.delete('query');
      if (value) next.set('q', value);
      else next.delete('q');
      setP(next, { replace: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [p, q, query, setP]);
  useEffect(() => {
    setQ(query);
  }, [query]);
  return { q, setQ, query, p, setP };
}

// ---- sports: Sportarr leagues; requesting one follows the league's events ----
export function Sports() {
  const { t } = useLumenLocale();
  const liveTv = useLiveTvStatus();
  const { q, setQ, query } = useSearchBox();
  // Sportarr has no browse feed: the page starts with a search
  const list = usePaged<League>(
    `/discover/sports${query ? `?query=${encodeURIComponent(query)}` : ''}`
  );
  return (
    <ExtraGate k="sports">
      <ExtraHeader
        title={t('lumen.sports.catalogTitle', 'Sports')}
        sub={t(
          'lumen.sports.catalogHint',
          'Find a league or competition and follow it; events are recorded as they happen.'
        )}
      >
        <ExtraSearch
          value={q}
          onChange={setQ}
          placeholder={t(
            'lumen.sports.searchPlaceholder',
            'Search leagues — Premier League, NFL, F1…'
          )}
        />
      </ExtraHeader>
      {liveTv.data?.configured && (
        <div className="toolbar">
          <Link className="btn btn-tonal btn-sm" to="/recordings">
            {t('lumen.sports.teamFollows', 'Team Follows and Recordings')}
          </Link>
        </div>
      )}
      <ServiceNote
        error={list.items.length ? null : list.error}
        what={t('lumen.sports.catalogWhat', 'sports')}
      />
      {!query && !list.error && (
        <div className="empty">
          <b>{t('lumen.sports.searchLeague', 'Search for a league')}</b>
          {t('lumen.sports.trySearch', 'Try a sport, a league or a country.')}
        </div>
      )}
      {!!query && !list.error && !list.items.length && !list.loading && (
        <div className="empty">
          <b>{t('lumen.sports.noLeagues', 'No leagues found')}</b>
          {t('lumen.sports.tryFullName', 'Try the league’s full name.')}
        </div>
      )}
      <div className="sqg grid">
        {list.items.map((l) => (
          <LeagueCard key={l.id} league={l} />
        ))}
      </div>
      <MoreOnScroll
        done={list.done || !query}
        loading={list.loading}
        more={list.more}
        error={list.error}
        retry={list.retry}
      />
    </ExtraGate>
  );
}

function leagueEventDate(value?: string, timeZone?: string) {
  const date = value ? new Date(value) : undefined;
  if (!date || !Number.isFinite(date.getTime())) return 'Date not announced';
  const options = { dateStyle: 'medium', timeStyle: 'short' } as const;
  try {
    return new Intl.DateTimeFormat(undefined, {
      ...options,
      timeZone: timeZone || 'UTC',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      ...options,
      timeZone: 'UTC',
    }).format(date);
  }
}

function LeagueEvents({ id }: { id: string }) {
  const [params, setParams] = useSearchParams();
  const requestedPage = params.get('eventPage') ?? '';
  const page = /^[1-9][0-9]{0,3}$/.test(requestedPage)
    ? Math.min(Number(requestedPage), 1000)
    : 1;
  function setPage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage === 1) next.delete('eventPage');
    else next.set('eventPage', String(nextPage));
    setParams(next, { preventScrollReset: true });
  }
  const { data, error, reload } = useApi<{
    eventsAvailable: boolean;
    totalPages: number;
    totalRecords: number;
    results: {
      id: number;
      title: string;
      eventDate?: string;
      season?: string;
      broadcastDate?: string;
      broadcastTimezone?: string;
      monitored: boolean;
      hasFile: boolean;
      fileCount: number;
      quality?: string;
    }[];
  }>(`/sportarr/${encodeURIComponent(id)}/events?page=${page}&pageSize=50`, {
    currentPathOnly: true,
  });

  const lastPage =
    data?.eventsAvailable && Number.isSafeInteger(data.totalPages)
      ? Math.max(1, Math.min(data.totalPages, 1000))
      : undefined;
  const beyondSchedule = lastPage !== undefined && page > lastPage;
  useEffect(() => {
    if (!beyondSchedule) return;
    const next = new URLSearchParams(params);
    if (lastPage === 1) next.delete('eventPage');
    else next.set('eventPage', String(lastPage));
    setParams(next, { replace: true, preventScrollReset: true });
  }, [beyondSchedule, lastPage, params, setParams]);

  return (
    <Section
      title="Events"
      action={
        data?.eventsAvailable && Number.isFinite(data.totalRecords) ? (
          <span className="note">
            {data.totalRecords} {data.totalRecords === 1 ? 'event' : 'events'}
          </span>
        ) : undefined
      }
    >
      <ServiceNote error={error} what="Sportarr events" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          Loading events…
        </p>
      )}
      {data && !beyondSchedule && !data.results.length && (
        <p className="note">
          {data.eventsAvailable
            ? 'Sportarr has no events on this page.'
            : 'Events appear once this league is monitored in Sportarr.'}
        </p>
      )}
      {!beyondSchedule && !!data?.results.length && (
        <ul className="setlist">
          {data.results.map((event) => (
            <li className="set" key={event.id}>
              <div>
                <b>{event.title}</b>
                <small>
                  <time dateTime={event.broadcastDate ?? event.eventDate}>
                    {event.season ? `Season ${event.season} · ` : ''}
                    {leagueEventDate(
                      event.broadcastDate ?? event.eventDate,
                      event.broadcastTimezone
                    )}
                  </time>
                </small>
              </div>
              <small>
                {event.hasFile
                  ? [
                      'In Library',
                      event.fileCount > 1 ? `${event.fileCount} files` : '',
                      event.quality,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : event.monitored
                    ? 'Monitored'
                    : 'Unmonitored'}
              </small>
            </li>
          ))}
        </ul>
      )}
      {!beyondSchedule && (page > 1 || (lastPage ?? 0) > 1) && (
        <nav className="toolbar" aria-label="Event Pages">
          <button
            className="btn btn-quiet btn-sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous Page
          </button>
          <span className="note">Page {page}</span>
          <button
            className="btn btn-quiet btn-sm"
            disabled={lastPage === undefined || page >= lastPage}
            onClick={() => setPage(page + 1)}
          >
            Next Page
          </button>
        </nav>
      )}
    </Section>
  );
}

function LeagueRequestSheet({
  league,
  close,
  done,
}: {
  league: League;
  close: () => void;
  done: () => void;
}) {
  const { user } = useAuth();
  const { t } = useLumenLocale();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [requestError, setRequestError] = useState<string>();
  const [serviceId, setServiceId] = useState<number>();
  const permissions = user?.permissions ?? 0;
  // Admin, Manage Requests, Auto Approve, or Auto Approve Sports.
  const autoApprove =
    Number.isSafeInteger(permissions) &&
    permissions >= 0 &&
    (BigInt(permissions) & (2n | 16n | 128n | (1n << 44n))) !== 0n;
  const advanced = canChooseRequestOptions(user?.permissions);
  const services = useApi<{ id: number; name: string; isDefault?: boolean }[]>(
    advanced ? '/service/sportarr' : null
  );
  const destination = useApi<League>(
    advanced && serviceId !== undefined
      ? `/sportarr/${encodeURIComponent(league.id)}?serverId=${serviceId}`
      : null,
    { currentPathOnly: true }
  );
  const target =
    advanced && serviceId !== undefined ? destination.data : league;
  const status = target && !target.requestable ? leagueStat(target, t) : null;
  const quota = useVideoRequestQuota('tv');
  const restricted = quota.status?.restricted;
  const unavailable = services.data?.length === 0;
  return (
    <ConfirmSheet
      title="Follow League"
      body={league.title}
      confirm="Send Request"
      cancel="Cancel"
      busy={busy}
      confirmDisabled={
        quota.loading || restricted || !target?.requestable || unavailable
      }
      onClose={() => {
        if (!submitting.current) close();
      }}
      onConfirm={async () => {
        if (submitting.current) return;
        submitting.current = true;
        setRequestError(undefined);
        setBusy(true);
        try {
          const result = await requestExtra(
            'sports',
            league.id,
            advanced ? serviceId : undefined
          );
          if ((result as { status?: number } | null)?.status === 4)
            throw new Error('The league request failed.');
          done();
          toast('League requested');
        } catch (error) {
          setRequestError(friendlyError(error, 'Request failed'));
        } finally {
          submitting.current = false;
          setBusy(false);
        }
      }}
    >
      {target?.requestable && (
        <p className="note">
          {autoApprove ? 'Automatically approved' : 'Approval required'}
        </p>
      )}
      {!!quota.status?.limit && (
        <p className="note" role={restricted ? 'status' : undefined}>
          {restricted
            ? 'TV request quota reached.'
            : `${quota.status.remaining ?? 0} of ${quota.status.limit} TV requests remaining.`}
          {' TV seasons and sports leagues share this quota.'}
        </p>
      )}
      {restricted && (
        <button className="chip" type="button" onClick={quota.reload}>
          Recheck Quota
        </button>
      )}
      {!!services.data?.length && (
        <div className="toolbar">
          <label className="sel">
            <span className="lbl">Sportarr Service</span>
            <select
              value={serviceId ?? ''}
              disabled={busy}
              onChange={(event) => {
                setRequestError(undefined);
                setServiceId(
                  event.target.value ? Number(event.target.value) : undefined
                );
              }}
            >
              <option value="">Default Service</option>
              {services.data.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {status && (
        <p className="note" role="status">
          <StatLabel s={status} />
        </p>
      )}
      {unavailable && (
        <p className="note" role="status">
          No Sportarr service is configured.
        </p>
      )}
      {requestError && (
        <p className="note" role="alert">
          {requestError}
        </p>
      )}
      <ServiceNote
        error={destination.error}
        what="the selected Sportarr service"
        retry={destination.reload}
      />
    </ConfirmSheet>
  );
}

export function LeagueDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { t } = useLumenLocale();
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState('');
  const bits = user?.permissions ?? 0;
  const mayRequest =
    Number.isSafeInteger(bits) &&
    bits >= 0 &&
    (BigInt(bits) & (2n | 32n | (1n << 45n))) !== 0n;
  const {
    data: l,
    error,
    refresh,
  } = useApi<League>(`/sportarr/${encodeURIComponent(id)}`);
  if (error)
    return (
      <ExtraGate k="sports">
        <div className="empty">
          <b>Couldn’t load this league</b>
          {error}
        </div>
      </ExtraGate>
    );
  if (!l) return <div className="detail-loading" aria-busy="true" />;
  const s = leagueStat(l, t);
  const choosingService = canChooseRequestOptions(user?.permissions);
  const main =
    mayRequest && requested !== id && (l.requestable || choosingService) ? (
      <button
        className="btn btn-primary"
        type="button"
        onClick={() => setRequesting(true)}
      >
        {l.requestable ? 'Follow league' : 'Choose Sportarr Service'}
      </button>
    ) : s || requested === id ? (
      <button className="btn btn-tonal" disabled>
        <StatLabel s={s ?? { word: 'Requested' }} />
      </button>
    ) : null;
  return (
    <ExtraGate k="sports">
      {requesting && mayRequest && (
        <LeagueRequestSheet
          key={id}
          league={l}
          close={() => setRequesting(false)}
          done={() => {
            setRequested(id);
            setRequesting(false);
            refresh();
          }}
        />
      )}
      <article className="detail">
        <DetailTop
          status={s}
          poster={l.posterPath}
          square
          title={l.title}
          line={[l.sport, l.country, l.year]}
        />
        <div className="dbody">
          <div className="dstatus">
            <StatPill s={s} />
          </div>
          <div className="dacts pc">{main}</div>
          <div className="dcols">
            <div>{l.overview && <p className="ov">{l.overview}</p>}</div>
            <aside>
              <Facts
                rows={[
                  ['Sport', l.sport],
                  ['Country', l.country],
                ]}
              />
            </aside>
          </div>
          {l.eventsAvailable ? (
            <LeagueEvents key={l.id} id={l.id} />
          ) : (
            <Section title="Events">
              <p className="note">
                {l.libraryState === 'unmonitored'
                  ? 'This league is in Sportarr but is not monitored. Enable monitoring in Sportarr to see its events here.'
                  : 'Events appear after the league is added to Sportarr and monitoring is enabled.'}
              </p>
            </Section>
          )}
        </div>
        {main && (
          <div className="actionbar">
            <span className="ab-meta">
              <b>{l.title}</b>
              {l.sport}
            </span>
            {main}
          </div>
        )}
      </article>
    </ExtraGate>
  );
}

// ---- adult: Whisparr scenes. Off unless the admin enables it, and SeerrNG checks each
// person's adult-content permission on every call ----
export function Adult() {
  return (
    <ExtraGate k="adult">
      <AdultCatalogue />
    </ExtraGate>
  );
}

function AdultCatalogue() {
  const { q, setQ, query, p, setP } = useSearchBox();
  const serviceId = p.get('serverId') ?? '';
  const { data: services } =
    useApi<{ id: number; name: string }[]>('/service/whisparr');
  const filters = new URLSearchParams();
  if (query) filters.set('query', query);
  if (serviceId) filters.set('serverId', serviceId);
  const list = usePaged<Scene, { partial?: boolean }>(
    `/adult/search?${filters}`
  );
  const partial = list.firstPage?.partial === true;
  return (
    <>
      <ExtraHeader
        title="Adult"
        sub={
          query
            ? 'Search results.'
            : 'What the library has. Search to find more.'
        }
      >
        <ExtraSearch
          value={q}
          onChange={setQ}
          placeholder="Search scenes, studios, performers…"
        />
      </ExtraHeader>
      {((services?.length ?? 0) > 1 || serviceId) && (
        <div className="toolbar">
          <label className="sel">
            <span className="lbl">Whisparr Service</span>
            <select
              value={serviceId}
              onChange={(event) => {
                const next = new URLSearchParams(p);
                const value = event.target.value;
                if (value) next.set('serverId', value);
                else next.delete('serverId');
                setP(next, { replace: true });
              }}
            >
              <option value="">All Services</option>
              {serviceId &&
                !services?.some(({ id }) => String(id) === serviceId) && (
                  <option value={serviceId}>Bookmarked Service</option>
                )}
              {services?.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <ServiceNote
        error={list.items.length ? null : list.error}
        what="this section"
      />
      {partial && (
        <p className="note" role="status">
          Whisparr returned partial results. Some matches may be missing.
        </p>
      )}
      {!partial && !list.error && !list.items.length && !list.loading && (
        <div className="empty">
          <b>Nothing found</b>Try a studio or performer.
        </div>
      )}
      <div className="wideg grid">
        {list.items.map((x) => (
          <ExtraCard
            key={x.id}
            href={adultScenePath(x.id, x.serviceId)}
            img={x.posterPath}
            title={x.title}
            shape="wide"
            icon="lock"
            stat={extraStat(x.mediaInfo)}
            meta={[x.studio, x.year].filter(Boolean).join(' · ')}
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
    </>
  );
}

export function SceneDetail() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const rawServer = params.get('serverId');
  const serverId =
    rawServer &&
    /^\d{1,10}$/.test(rawServer) &&
    Number(rawServer) <= 1_000_000_000
      ? Number(rawServer)
      : undefined;
  const canChoose = ((user?.permissions ?? 0) & (2 | 16 | 8192)) !== 0;
  const path = `/adult/${encodeURIComponent(id)}`;
  const detail = useApi<Scene>(adultScenePath(id, serverId), {
    currentPathOnly: true,
  });
  const services = useApi<{ id: number; isDefault?: boolean }[]>(
    serverId !== undefined && !canChoose ? '/service/whisparr' : null
  );
  const defaultId = services.data?.find(({ isDefault }) => isDefault)?.id;
  const requestDetail = useApi<Scene>(
    !canChoose && defaultId !== undefined && defaultId !== serverId
      ? `${path}?serverId=${defaultId}`
      : null,
    { currentPathOnly: true }
  );
  const { data: x, error } = detail;
  const destination =
    canChoose || serverId === undefined || serverId === defaultId
      ? x
      : requestDetail.data;
  const isAdmin = isAdministrator(user?.permissions);
  const sceneMedia = useLiveMediaProgress(x?.mediaInfo, isAdmin);
  const otherDestinationMedia = useLiveMediaProgress(
    destination !== x ? destination?.mediaInfo : undefined,
    isAdmin
  );
  if (error)
    return (
      <ExtraGate k="adult">
        <div className="empty">
          <b>Couldn’t load this</b>
          {error}
        </div>
      </ExtraGate>
    );
  if (!x) return <div className="detail-loading" aria-busy="true" />;
  const s = extraStat(sceneMedia);
  const main = destination && canRequestAdult(user?.permissions) && (
    <RequestButton
      key={destination.serviceId}
      stat={destination === x ? s : extraStat(otherDestinationMedia)}
      request={() =>
        requestExtra('adult', destination.id, canChoose ? serverId : undefined)
      }
    />
  );
  return (
    <ExtraGate k="adult">
      <article className="detail">
        <DetailTop
          status={s}
          backdrop={x.posterPath}
          title={x.title}
          line={[x.year, x.studio]}
        />
        <div className="dbody">
          <div className="dstatus">
            <StatPill s={s} />
          </div>
          <div className="dacts pc">{main}</div>
          <div className="dcols">
            <div>{x.overview && <p className="ov">{x.overview}</p>}</div>
            <aside>
              <Facts
                rows={[
                  ['Studio', x.studio],
                  ['Year', x.year ? String(x.year) : ''],
                  ['Performers', x.performers.join(', ')],
                ]}
              />
            </aside>
          </div>
        </div>
        <div className="actionbar">
          <span className="ab-meta">
            <b>{x.title}</b>
            {x.studio}
          </span>
          {main}
        </div>
      </article>
    </ExtraGate>
  );
}

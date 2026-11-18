import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  api,
  tmdbImg,
  type Person,
  type ProductionCountry,
  type RequestOptions,
  type SubjectTag,
  type TvDetails,
  type VideoDetailPins,
} from '../api';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { Icon, type IconName } from '../icons';
import { sessionGeneration } from '../sessionState';
import { Glyph, type Stat } from './cards';
import { useToast } from './toast';

const hue = (s: string) =>
  [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
export const fmtRun = (m?: number) =>
  !m
    ? ''
    : m < 60
      ? `${m}m`
      : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
export const fmtHrs = (sec?: number | null) =>
  !sec ? '' : fmtRun(Math.round(sec / 60));

export function Pill({
  k,
  icon,
  children,
}: {
  k: 'ok' | 'dl' | 'wait' | 'bad' | 'neutral';
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span className={`pill ${k}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

function People({ list }: { list: Person[] }) {
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? list : list.slice(0, 10);
  return (
    <>
      <div id={listId} className="people">
        {visible.map((person, index) => {
          const role = person.character || person.job;
          const portrait = tmdbImg(person.profilePath, 'w185');
          const content = (
            <>
              <i
                aria-hidden="true"
                style={{ background: `hsl(${hue(person.name)} 40% 40%)` }}
              >
                {portrait ? (
                  <img src={portrait} alt="" loading="lazy" />
                ) : (
                  initials(person.name)
                )}
              </i>
              <span>
                {person.name}
                {role && <small>{role}</small>}
              </span>
            </>
          );
          const key = `${person.id}:${role ?? ''}:${index}`;
          return Number.isSafeInteger(person.id) &&
            person.id > 0 &&
            person.id <= 1_000_000_000 ? (
            <Link className="person" key={key} to={`/person/${person.id}`}>
              {content}
            </Link>
          ) : (
            <span className="person" key={key}>
              {content}
            </span>
          );
        })}
      </div>
      {list.length > 10 && (
        <div className="toolbar">
          <button
            className="chip"
            type="button"
            aria-controls={listId}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded
              ? 'Show Fewer Credits'
              : `Show All ${list.length} Credits`}
          </button>
        </div>
      )}
    </>
  );
}

export function CreditsDisclosure({
  media,
  credit,
  people,
}: {
  media: 'movie' | 'tv';
  credit: 'cast' | 'crew';
  people?: Person[];
}) {
  const { hash } = useLocation();
  if (!people?.length && hash !== `#${credit}`) return null;

  return (
    <VideoDisclosure
      media={media}
      panel={credit}
      label={credit === 'cast' ? 'Starring' : 'Crew'}
    >
      {people?.length ? <People list={people} /> : <p>No credits available.</p>}
    </VideoDisclosure>
  );
}

export function SubjectTagsDisclosure({
  media,
  tags,
}: {
  media: 'movie' | 'tv';
  tags?: SubjectTag[];
}) {
  const { user } = useAuth();
  const contentId = useId();
  const storageKey = `seerr.subjectTagVisibility:${user?.id ?? 'anonymous'}`;
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== 'hidden';
    } catch {
      return true;
    }
  });
  const browse = media === 'movie' ? '/movies' : '/series';

  function toggleVisibility() {
    setVisible(!visible);
    try {
      localStorage.setItem(storageKey, visible ? 'hidden' : 'visible');
    } catch {
      // The current panel still works when storage is unavailable.
    }
  }

  return (
    <VideoDisclosure media={media} panel="subjectTags" label="Subject Tags">
      {tags?.length ? (
        <>
          <div className="toolbar">
            <button
              type="button"
              className="chip"
              aria-pressed={visible}
              aria-controls={contentId}
              onClick={toggleVisibility}
            >
              Show Subject Tags
            </button>
          </div>
          <div id={contentId} hidden={!visible}>
            <div className="toolbar">
              {tags.map((tag) => (
                <Link
                  className="chip"
                  key={tag.id}
                  to={`${browse}?keywords=${tag.id}`}
                >
                  {tag.name}
                </Link>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="note">No subject tags.</p>
      )}
    </VideoDisclosure>
  );
}

function VideoDisclosure({
  media,
  panel,
  label,
  children,
}: {
  media: 'movie' | 'tv';
  panel: keyof VideoDetailPins;
  label: string;
  children: ReactNode;
}) {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const disclosure = useRef<HTMLDetailsElement>(null);
  const { hash, key } = useLocation();
  const anchor = panel === 'subjectTags' ? undefined : panel;

  useEffect(() => {
    const element = disclosure.current;
    if (element && anchor && hash === `#${anchor}`) {
      element.open = true;
      element.scrollIntoView();
    }
  }, [anchor, hash, key]);

  const pending = useRef(false);
  const legacy = {
    cast: user?.settings?.detailDisclosureCastPinned,
    crew: user?.settings?.detailDisclosureCrewPinned,
    subjectTags: user?.settings?.detailDisclosureSubjectTagsPinned,
  };
  const pinned =
    user?.settings?.detailDisclosurePins?.[media]?.[panel] ??
    (media === 'movie' && legacy[panel] === true);
  const preference = panel === 'subjectTags' ? 'subject tag' : 'credit';

  async function togglePin() {
    if (!user || pending.current) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    try {
      const result = await api<VideoDetailPins>(
        `/user/${user.id}/settings/detail-disclosures/${media}`,
        { method: 'POST', body: JSON.stringify({ [panel]: !pinned }) }
      );
      if (generation !== sessionGeneration()) return;
      if (result[panel] !== !pinned) {
        toast(`Could not confirm the saved ${preference} preference.`);
        return;
      }
      await refresh();
    } catch {
      if (generation === sessionGeneration())
        toast(`Could not save the ${preference} preference. Try again.`);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <details ref={disclosure} id={anchor} className="adv" open={pinned}>
      <summary>
        <Icon name="chev" size="sm" />
        {label}
      </summary>
      {children}
      {user && (
        <div className="toolbar">
          <button
            className="chip"
            type="button"
            aria-pressed={pinned}
            disabled={busy}
            onClick={() => void togglePin()}
          >
            Keep {label} Open
          </button>
        </div>
      )}
    </details>
  );
}

export function productionCountryLinks(
  countries: ProductionCountry[] | undefined,
  browse: '/movies' | '/series'
) {
  const unique = new Map<string, string>();
  for (const { iso_3166_1: code, name } of countries ?? []) {
    if (/^[A-Z]{2}$/.test(code) && !unique.has(code))
      unique.set(code, name || code);
  }
  if (!unique.size) return null;
  return [...unique].map(([code, name], index) => (
    <span key={code}>
      {index > 0 && ', '}
      <Link to={`${browse}?country=${code}`}>{name}</Link>
    </span>
  ));
}

export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="facts2">
      {rows
        .filter((r) => r[1])
        .map(([a, b]) => (
          <div key={a}>
            <dt>{a}</dt>
            <dd>{b}</dd>
          </div>
        ))}
    </dl>
  );
}

// the shared top of every detail page: backdrop hero, poster, title and one fact line
export function DetailTop({
  backdrop,
  poster,
  square,
  whole,
  title,
  by,
  line,
  status,
}: {
  backdrop?: string;
  poster?: string;
  square?: boolean;
  // book art is not always poster-shaped: show all of it instead of cropping
  whole?: boolean;
  title: string;
  by?: ReactNode;
  line: ReactNode[];
  // in the library, requested or downloading: the posters' corner glyph, on this poster too
  status?: Stat;
}) {
  // the floating back button lives in Shell, so it's there while the page loads or if it fails
  // art that fails to load is left out, as if there were none
  const [failed, setFailed] = useState<string[]>([]);
  const ok = (src?: string) => (src && !failed.includes(src) ? src : undefined);
  const drop = (src: string) => () => setFailed((f) => f.concat(src));
  const hero = ok(backdrop) || ok(poster);
  return (
    <>
      <div className={`dhero ${backdrop ? '' : 'blur'}`}>
        {hero && <img src={hero} alt="" onError={drop(hero)} />}
      </div>
      <div className="dtop">
        <div
          className={`dposter ${square ? 'sq' : ''} ${whole ? 'whole' : ''}`}
        >
          {ok(poster) && <img src={poster} alt="" onError={drop(poster!)} />}
          <Glyph s={status ?? null} />
        </div>
        <div className="dtitle">
          <h1>{title}</h1>
          {by && <div className="by">{by}</div>}
          <div className="dline">
            {line.filter(Boolean).map((x, i) => (
              <span key={i}>{x}</span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export const ActionBar = ({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) => (
  <div className="actionbar">
    <span className="ab-meta">
      <b>{title}</b>
      {meta}
    </span>
    {children}
  </div>
);

// ---- admin-only request options: which server, quality profile and folder ----
const MANAGE = 2 | 16; // ADMIN | MANAGE_REQUESTS
const REQUEST_VIEW = 16384;
interface Server {
  id: number;
  name: string;
  is4k: boolean;
  isDefault: boolean;
}
interface ServerDetail {
  profiles: { id: number; name: string }[];
  rootFolders: { id: number; path: string }[];
  languageProfiles?: { id: number; name: string }[] | null;
  metadataLanguages?: { id: number; name: string }[];
  tags?: { id: number; label: string }[];
  server: {
    activeProfileId: number;
    activeDirectory: string;
    activeLanguageProfileId?: number;
    activeTags?: number[];
  };
}

const permissionBits = (permissions?: number) =>
  typeof permissions === 'number' &&
  Number.isSafeInteger(permissions) &&
  permissions >= 0
    ? permissions
    : 0;

// who may pick the Radarr/Sonarr server, quality and folder for a request
export const canManageRequests = (permissions?: number) =>
  (permissionBits(permissions) & MANAGE) !== 0;
export const canChooseRequestOptions = (permissions?: number) =>
  (permissionBits(permissions) & (MANAGE | 8192)) !== 0;
export const canViewAllRequests = (permissions?: number) =>
  (permissionBits(permissions) & (MANAGE | REQUEST_VIEW)) !== 0;
export const canRequestMovies = (permissions?: number) =>
  (permissionBits(permissions) & (2 | 32 | 262144)) !== 0;
export const canRequestSeries = (permissions?: number) =>
  (permissionBits(permissions) & (2 | 32 | 524288)) !== 0;
// who may request in 4K: Admin, Request 4K, or Request 4K Movies / Request 4K Series
export const canRequest4k = (
  permissions: number | undefined,
  kind: 'movie' | 'tv'
) =>
  (permissionBits(permissions) &
    (2 | 1024 | (kind === 'movie' ? 2048 : 4096))) !==
  0;
// who may make a request in someone else's name: SeerrNG wants Manage Users and Manage
// Requests together (or Admin)
export const canRequestAs = (permissions?: number) => {
  const p = permissionBits(permissions);
  return (p & 2) !== 0 || (p & (8 | 16)) === (8 | 16);
};
interface RequestUser {
  id: number;
  displayName: string;
  permissions?: number;
}

export function AdvancedOptions({
  kind,
  is4k,
  onChange,
  inline = false,
  onReady,
  initial,
  allow4k = false,
  series,
}: {
  kind: 'movie' | 'tv';
  series?: { id: number; tvdbId?: number | null };
  is4k: boolean;
  // also list the 4K servers (for people who may request 4K); picking one makes it a 4K request
  allow4k?: boolean;
  onChange: (o: RequestOptions) => void;
  // changing an existing request: start from its server, quality, folder and requester
  initial?: RequestOptions;
  inline?: boolean; // always open, no "Advanced" toggle (the quick-request sheet)
  onReady?: (ready: boolean) => void;
}) {
  const { user } = useAuth();
  const allowed = canChooseRequestOptions(user?.permissions);
  const svc = kind === 'movie' ? 'radarr' : 'sonarr';
  const [open, setOpen] = useState(inline);
  const [servers, setServers] = useState<Server[] | null>(null);
  const [detail, setDetail] = useState<ServerDetail | null>(null);
  const [err, setErr] = useState('');
  const [o, setO] = useState<RequestOptions>({});
  const asAllowed = canRequestAs(user?.permissions);
  const [people, setPeople] = useState<RequestUser[] | null>(null);
  const [asUser, setAsUser] = useState<number | undefined>(initial?.userId);
  useEffect(() => {
    if (!allowed || !open || !asAllowed || people) return;
    api<{ results: RequestUser[] }>('/user?take=100&skip=0&sort=displayname')
      .then((d) => setPeople(d.results))
      .catch(() => setPeople([])); // the picker just stays hidden
  }, [allowed, open, asAllowed, people]);

  useEffect(() => {
    if (!allowed || !open || servers) return;
    api<Server[]>(`/service/${svc}`)
      .then((s) => {
        const mine = allow4k
          ? [...s].sort((a, b) => Number(a.is4k) - Number(b.is4k))
          : s.filter((x) => x.is4k === is4k);
        setServers(mine);
        const d =
          mine.find((x) => x.id === initial?.serverId) ||
          mine.find((x) => x.isDefault && x.is4k === is4k) ||
          mine.find((x) => x.is4k === is4k) ||
          mine[0];
        if (d) setO((x) => ({ ...x, serverId: d.id }));
      })
      .catch((e) => setErr(friendlyError(e)));
  }, [allowed, open, servers, svc, is4k, allow4k]);
  useEffect(() => {
    if (o.serverId == null) return;
    let live = true;
    const serverId = o.serverId;
    setDetail(null);
    setErr('');
    api<ServerDetail>(`/service/${svc}/${o.serverId}`)
      .then((d) => {
        if (!live) return;
        setDetail(d);
        setO((x) =>
          x.serverId !== serverId
            ? x
            : {
                ...x,
                profileId:
                  x.profileId ??
                  (serverId === initial?.serverId &&
                  d.profiles.some((p) => p.id === initial?.profileId)
                    ? initial?.profileId
                    : d.server.activeProfileId),
                rootFolder:
                  x.rootFolder ??
                  (serverId === initial?.serverId &&
                  d.rootFolders.some((r) => r.path === initial?.rootFolder)
                    ? initial?.rootFolder
                    : d.server.activeDirectory),
                languageProfileId:
                  serverId === initial?.serverId &&
                  d.languageProfiles?.some(
                    ({ id }) => id === initial.languageProfileId
                  )
                    ? initial.languageProfileId
                    : d.languageProfiles?.find(
                        ({ id }) => id === d.server.activeLanguageProfileId
                      )?.id,
                metadataLanguageId:
                  serverId === initial?.serverId &&
                  d.metadataLanguages?.some(
                    ({ id }) => id === initial.metadataLanguageId
                  )
                    ? initial.metadataLanguageId
                    : initial?.metadataLanguageId == null
                      ? undefined
                      : null,
                tags:
                  serverId === initial?.serverId && initial.tags != null
                    ? initial.tags.filter((id) =>
                        d.tags?.some((tag) => tag.id === id)
                      )
                    : initial?.tags != null
                      ? null
                      : undefined,
              }
        );
      })
      .catch(
        (e) =>
          live &&
          setErr(
            `${friendlyError(e)} (the ${svc === 'radarr' ? 'Radarr' : 'Sonarr'} server didn't answer)`
          )
      );
    return () => {
      live = false;
    };
  }, [o.serverId, svc]);
  // with 4K servers listed, the chosen server decides whether this is a 4K request
  const picked4k = allow4k
    ? servers?.find((x) => x.id === o.serverId)?.is4k
    : undefined;
  const seriesId = series?.id;
  const { data: lookupDetails } = useApi<TvDetails>(
    open &&
      allowed &&
      detail &&
      kind === 'tv' &&
      series &&
      series.tvdbId === undefined
      ? `/tv/${series.id}`
      : null,
    { currentPathOnly: true }
  );
  const tvdbId = series?.tvdbId ?? lookupDetails?.externalIds?.tvdbId;
  const lookupPath =
    open &&
    allowed &&
    kind === 'tv' &&
    detail &&
    series &&
    tvdbId &&
    o.serverId != null
      ? `/service/sonarr/lookup/${series.id}?${new URLSearchParams({
          is4k: String(picked4k ?? is4k),
          serverId: String(o.serverId),
          ...(o.metadataLanguageId != null
            ? { language: String(o.metadataLanguageId) }
            : {}),
        })}`
      : null;
  const { data: lookup } = useApi<
    { tvdbId: number; seasonTypes?: { type: string; name: string }[] }[]
  >(lookupPath, { currentPathOnly: true });
  const seasonTypes =
    (Array.isArray(lookup) ? lookup : []).find((item) => item.tvdbId === tvdbId)
      ?.seasonTypes ?? [];
  const [order, setOrder] = useState<{ path: string; type: string }>();
  const proposedOrder =
    order && order.path === lookupPath
      ? order.type
      : o.serverId === initial?.serverId && order === undefined
        ? initial?.sonarrSeasonType
        : undefined;
  const selectedOrder = seasonTypes.find(
    ({ type }) => type === proposedOrder
  )?.type;
  const seasonOverride =
    selectedOrder ??
    (initial?.sonarrSeasonType &&
    (o.serverId !== initial.serverId || (order && order.path === lookupPath))
      ? null
      : undefined);
  // The API evaluates the quota override against the user receiving the request.
  const requesterId = (asAllowed ? asUser : undefined) ?? user?.id;
  const requesterPermissions =
    requesterId === user?.id
      ? user?.permissions
      : people?.find(({ id }) => id === requesterId)?.permissions;
  const quotaRequesterId =
    !initial &&
    open &&
    canManageRequests(user?.permissions) &&
    canManageRequests(requesterPermissions)
      ? requesterId
      : undefined;
  const { data: quotas } = useApi<
    Partial<Record<'movie' | 'tv', { limit?: number }>>
  >(quotaRequesterId ? `/user/${quotaRequesterId}/quota` : null, {
    currentPathOnly: true,
  });
  const canOverrideQuota =
    quotaRequesterId !== undefined && (quotas?.[kind]?.limit ?? 0) > 0;
  const [overrideQuota, setOverrideQuota] = useState(false);
  const ignoreQuota = canOverrideQuota && overrideQuota;
  useEffect(() => {
    if (!open) return onChange({});
    const base = picked4k === undefined ? { ...o } : { ...o, is4k: picked4k };
    if (ignoreQuota) base.ignoreQuota = true;
    if (seriesId) base.sonarrSeasonType = seasonOverride;
    if (!initial && o.tags) {
      base.requesterSelectedOptions = {
        tags: true,
        profile: o.profileId !== undefined,
        rootFolder: !!o.rootFolder,
        ...(kind === 'tv'
          ? { languageProfile: o.languageProfileId !== undefined }
          : {}),
      };
    }
    onChange(
      // a new request is the admin's own unless someone else is picked; a request being
      // changed always says whose it is (picking "Me" moves it to the admin)
      asUser && (asUser !== user?.id || initial?.userId !== undefined)
        ? { ...base, userId: asUser }
        : base
    );
  }, [
    o,
    open,
    asUser,
    user?.id,
    initial,
    kind,
    onChange,
    picked4k,
    seriesId,
    seasonOverride,
    ignoreQuota,
  ]);
  // no server of this kind set up: nothing to choose, SeerrNG decides (as its own dialog does)
  const none = !!servers && !servers.length;
  useEffect(() => {
    onReady?.(
      !err &&
        (none ||
          (!!detail &&
            o.serverId != null &&
            o.profileId != null &&
            !!o.rootFolder))
    );
  }, [detail, err, o, onReady, none]);

  if (!allowed) return null;
  const defaultTags =
    detail?.server.activeTags?.filter((id) =>
      detail.tags?.some((tag) => tag.id === id)
    ) ?? [];
  const selectedTags = o.tags ?? defaultTags;
  const body = (
    <>
      {err && <p className="note">{err}</p>}
      {!servers && !err && open && <p className="note">Loading servers…</p>}
      {none && !err && (
        <p className="note">
          No {svc === 'radarr' ? 'Radarr' : 'Sonarr'} server to choose; SeerrNG
          uses its defaults.
        </p>
      )}
      {servers && !none && (
        <div className="adv-grid">
          {asAllowed && !!people?.length && user && (
            <label className="sel">
              <span className="lbl">Request as</span>
              <select
                value={asUser ?? user.id}
                onChange={(e) => {
                  setOverrideQuota(false);
                  setAsUser(Number(e.target.value));
                }}
              >
                <option value={user.id}>Me ({user.displayName})</option>
                {people
                  .filter((x) => x.id !== user.id)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.displayName}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="sel">
            <span className="lbl">Server</span>
            <select
              value={o.serverId ?? ''}
              onChange={(e) => {
                setDetail(null);
                setOrder(undefined);
                setO({ serverId: +e.target.value });
              }}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {allow4k && s.is4k && !/4k/i.test(s.name) ? ' · 4K' : ''}
                  {s.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </label>
          {detail && (
            <>
              <label className="sel">
                <span className="lbl">Quality</span>
                <select
                  value={o.profileId ?? ''}
                  onChange={(e) =>
                    setO((x) => ({ ...x, profileId: +e.target.value }))
                  }
                >
                  {detail.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sel">
                <span className="lbl">Folder</span>
                <select
                  value={o.rootFolder ?? ''}
                  onChange={(e) =>
                    setO((x) => ({ ...x, rootFolder: e.target.value }))
                  }
                >
                  {detail.rootFolders.map((r) => (
                    <option key={r.id} value={r.path}>
                      {r.path}
                    </option>
                  ))}
                </select>
              </label>
              {kind === 'tv' && !!detail.languageProfiles?.length && (
                <label className="sel">
                  <span className="lbl">Language Profile</span>
                  <select
                    value={o.languageProfileId ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setO((previous) => ({
                        ...previous,
                        languageProfileId:
                          value === '' ? undefined : Number(value),
                      }));
                    }}
                  >
                    <option value="" disabled>
                      Sonarr Default
                    </option>
                    {detail.languageProfiles.map(({ id, name }) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {kind === 'tv' && !!detail.metadataLanguages?.length && (
                <label className="sel">
                  <span className="lbl">Metadata Language</span>
                  <select
                    value={o.metadataLanguageId ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setOrder(undefined);
                      setO((previous) => ({
                        ...previous,
                        metadataLanguageId: value === '' ? null : Number(value),
                      }));
                    }}
                  >
                    <option value="">Sonarr Default</option>
                    {detail.metadataLanguages.map(({ id, name }) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {lookupPath && seasonTypes.length > 1 && (
                <label className="sel">
                  <span className="lbl">Season Order</span>
                  <select
                    value={selectedOrder ?? ''}
                    onChange={(event) =>
                      setOrder({ path: lookupPath, type: event.target.value })
                    }
                  >
                    <option value="">Sonarr Default</option>
                    {seasonTypes.map(({ type, name }) => (
                      <option key={type} value={type}>
                        {name === type ? name : `${name} (${type})`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </div>
      )}
      {canOverrideQuota && (
        <div className="setlist">
          <label className="set cfg-row">
            <span>Ignore Request Quota</span>
            <input
              type="checkbox"
              checked={ignoreQuota}
              onChange={(event) => setOverrideQuota(event.target.checked)}
            />
          </label>
        </div>
      )}
      {!!detail?.tags?.length && (
        <div role="group" aria-label="Request Tags">
          <p className="note">Request Tags</p>
          <div className="setlist">
            {detail.tags.map(({ id, label }) => (
              <label key={id} className="set cfg-row">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={selectedTags.includes(id)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setO((previous) => {
                      const tags = previous.tags ?? defaultTags;
                      return {
                        ...previous,
                        tags: checked
                          ? [...new Set([...tags, id])]
                          : tags.filter((tag) => tag !== id),
                      };
                    });
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
  if (inline) return <div className="adv adv-inline">{body}</div>;
  return (
    <details
      className="adv"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        <Icon name="info" size="sm" />
        Advanced Request Options
      </summary>
      {body}
    </details>
  );
}

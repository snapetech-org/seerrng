import { useEffect, useState, type ReactNode } from 'react';
import { api, type Person, type RequestOptions } from '../api';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import { Icon, type IconName } from '../icons';
import { Glyph, type Stat } from './cards';

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

export function People({ list }: { list: Person[] }) {
  return (
    <div className="people">
      {list.map((p) => (
        <span
          className="person"
          key={p.id + (p.character || p.job || '')}
          title={p.character || p.job}
        >
          <i style={{ background: `hsl(${hue(p.name)} 40% 40%)` }}>
            {p.profilePath ? (
              <img
                src={`/imageproxy/tmdb/t/p/w185${p.profilePath}`}
                alt=""
                loading="lazy"
              />
            ) : (
              initials(p.name)
            )}
          </i>
          {p.name}
        </span>
      ))}
    </div>
  );
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
  server: { activeProfileId: number; activeDirectory: string };
}

const permissionBits = (permissions?: number) =>
  typeof permissions === 'number' &&
  Number.isSafeInteger(permissions) &&
  permissions >= 0
    ? permissions
    : 0;

// who may pick the Radarr/Sonarr server, quality and folder for a request
export const canChooseRequestOptions = (permissions?: number) =>
  (permissionBits(permissions) & MANAGE) !== 0;
export const canViewAllRequests = (permissions?: number) =>
  (permissionBits(permissions) & (MANAGE | REQUEST_VIEW)) !== 0;
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
}

export function AdvancedOptions({
  kind,
  is4k,
  onChange,
  inline = false,
  onReady,
  initial,
  allow4k = false,
}: {
  kind: 'movie' | 'tv';
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
    if (!open || !asAllowed || people) return;
    api<{ results: RequestUser[] }>('/user?take=100&skip=0&sort=displayname')
      .then((d) => setPeople(d.results))
      .catch(() => setPeople([])); // the picker just stays hidden
  }, [open, asAllowed, people]);

  useEffect(() => {
    if (!open || servers) return;
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
  }, [open, servers, svc, is4k, allow4k]);
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
  useEffect(() => {
    if (!open) return onChange({});
    const base = picked4k === undefined ? o : { ...o, is4k: picked4k };
    onChange(
      // a new request is the admin's own unless someone else is picked; a request being
      // changed always says whose it is (picking "Me" moves it to the admin)
      asUser && (asUser !== user?.id || initial?.userId !== undefined)
        ? { ...base, userId: asUser }
        : base
    );
  }, [o, open, asUser, user?.id, initial?.userId, onChange, picked4k]);
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
                onChange={(e) => setAsUser(+e.target.value)}
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
              onChange={(e) => setO({ serverId: +e.target.value })}
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
            </>
          )}
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
        Advanced (admins)
      </summary>
      {body}
    </details>
  );
}

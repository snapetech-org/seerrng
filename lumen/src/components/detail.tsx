import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Person, type RequestOptions } from '../api';
import { useAuth } from '../auth';
import { Icon, type IconName } from '../icons';

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
  title,
  by,
  line,
}: {
  backdrop?: string;
  poster?: string;
  square?: boolean;
  title: string;
  by?: ReactNode;
  line: ReactNode[];
}) {
  const nav = useNavigate();
  return (
    <>
      <button
        className="dback ph-only"
        aria-label="Back"
        onClick={() => nav(-1)}
      >
        <Icon name="chevL" />
      </button>
      <div className={`dhero ${backdrop ? '' : 'blur'}`}>
        {(backdrop || poster) && <img src={backdrop || poster} alt="" />}
      </div>
      <div className="dtop">
        <div className={`dposter ${square ? 'sq' : ''}`}>
          {poster && <img src={poster} alt="" />}
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

export function AdvancedOptions({
  kind,
  is4k,
  onChange,
}: {
  kind: 'movie' | 'tv';
  is4k: boolean;
  onChange: (o: RequestOptions) => void;
}) {
  const { user } = useAuth();
  const allowed = !!user && (user.permissions & MANAGE) !== 0;
  const svc = kind === 'movie' ? 'radarr' : 'sonarr';
  const [open, setOpen] = useState(false);
  const [servers, setServers] = useState<Server[] | null>(null);
  const [detail, setDetail] = useState<ServerDetail | null>(null);
  const [err, setErr] = useState('');
  const [o, setO] = useState<RequestOptions>({});

  useEffect(() => {
    if (!open || servers) return;
    api<Server[]>(`/service/${svc}`)
      .then((s) => {
        const mine = s.filter((x) => x.is4k === is4k);
        setServers(mine);
        const d = mine.find((x) => x.isDefault) || mine[0];
        if (d) setO((x) => ({ ...x, serverId: d.id }));
      })
      .catch((e) => setErr(e.message));
  }, [open, servers, svc, is4k]);
  useEffect(() => {
    if (o.serverId == null) return;
    setDetail(null);
    api<ServerDetail>(`/service/${svc}/${o.serverId}`)
      .then((d) => {
        setDetail(d);
        setO((x) => ({
          ...x,
          profileId: x.profileId ?? d.server.activeProfileId,
          rootFolder: x.rootFolder ?? d.server.activeDirectory,
        }));
      })
      .catch((e) =>
        setErr(
          `${e.message} (the ${svc === 'radarr' ? 'Radarr' : 'Sonarr'} server didn't answer)`
        )
      );
  }, [o.serverId, svc]);
  useEffect(() => onChange(open ? o : {}), [o, open, onChange]);

  if (!allowed) return null;
  return (
    <details
      className="adv"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        <Icon name="info" size="sm" />
        Advanced (admins)
      </summary>
      {err && <p className="note">{err}</p>}
      {servers && (
        <div className="adv-grid">
          <label className="sel">
            <span className="lbl">Server</span>
            <select
              value={o.serverId ?? ''}
              onChange={(e) => setO({ serverId: +e.target.value })}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
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
    </details>
  );
}

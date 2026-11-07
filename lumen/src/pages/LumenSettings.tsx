import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Section } from '../components/cards';
import { useToast } from '../components/toast';
import { Icon } from '../icons';
import { mediaServer } from '../mediaServer';
import {
  DEFAULT_PREFS,
  DISCOVER_ROWS,
  discoverRowLabel,
  usePrefs,
  type AdminConfig,
  type DiscoverRow,
} from '../settings';

// Admins choose what everyone gets. Lumen is static files with no database, so the
// result is a lumen-config.json to download and mount next to the app; every browser
// reads it on its next load.
const SWITCHES = [
  ['hoverRequest', 'Quick request on posters'],
  ['wholeSeriesDefault', 'Request whole series by default'],
  ['requestOptions', 'Admins choose server and folder on quick requests'],
  ['narratorChoice', 'Choose audiobook narrators'],
  ['showBooks', 'Show books and audiobooks'],
] as const;
type Switch = (typeof SWITCHES)[number][0];

export default function LumenSettings() {
  const { user } = useAuth();
  const { adminConfig } = usePrefs();
  const toast = useToast();
  const [cfg, setCfgState] = useState<AdminConfig>(() =>
    JSON.parse(JSON.stringify(adminConfig || {}))
  );
  // lumen-config.json may still be loading when this page opens: follow it until the
  // admin changes something
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current)
      setCfgState(JSON.parse(JSON.stringify(adminConfig || {})));
  }, [adminConfig]);
  const setCfg: typeof setCfgState = (v) => {
    touched.current = true;
    setCfgState(v);
  };
  const isAdmin = ((user?.permissions ?? 0) & 2) !== 0;

  const defaults = { ...DEFAULT_PREFS, ...(cfg.defaults || {}) };
  const rows = { ...DEFAULT_PREFS.rows, ...(cfg.defaults?.rows || {}) };
  const locked = new Set(Array.isArray(cfg.locked) ? cfg.locked : []);
  const setDefault = (path: string, value: boolean | string) =>
    setCfg((c) => {
      const d = { ...(c.defaults || {}) };
      if (path.startsWith('rows.'))
        d.rows = { ...(d.rows || {}), [path.slice(5)]: value as boolean };
      else (d as Record<string, unknown>)[path] = value;
      return { ...c, defaults: d };
    });
  const setLock = (path: string, on: boolean) =>
    setCfg((c) => {
      const l = new Set(Array.isArray(c.locked) ? c.locked : []);
      if (on) l.add(path);
      else l.delete(path);
      return { ...c, locked: [...l] };
    });
  const setBrand = (k: 'name' | 'logo' | 'icon', v: string) =>
    setCfg((c) => {
      const b = { ...(c.branding || {}) };
      if (v === '' && k !== 'name') delete b[k];
      else b[k] = v;
      return { ...c, branding: b };
    });
  const setTop = (k: string, v: string | undefined) =>
    setCfg((c) => {
      const n = { ...c };
      if (v === undefined || v === '') delete n[k];
      else n[k] = v;
      return n;
    });

  const json = useMemo(() => JSON.stringify(cfg, null, 2) + '\n', [cfg]);
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([json], { type: 'application/json' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lumen-config.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = () =>
    navigator.clipboard
      ?.writeText(json)
      .then(() => toast('Copied lumen-config.json'))
      .catch(() => toast('Couldn’t copy. Select the text below instead.'));

  if (!isAdmin)
    return (
      <div className="empty">
        <b>Admins only</b>
        These settings change Lumen for everyone.
      </div>
    );

  // one choice per setting: the starting value, and whether people may change it
  // ("locked" in lumen-config.json)
  const Lock = ({ path }: { path: string }) => (
    <label className="cfg-lock">
      <input
        type="checkbox"
        checked={!locked.has(path)}
        onChange={(e) => setLock(path, !e.target.checked)}
      />
      Let people change it
    </label>
  );
  const Row = ({
    path,
    title,
    on,
  }: {
    path: string;
    title: string;
    on: boolean;
  }) => {
    const value = `${on ? 'on' : 'off'}${locked.has(path) ? '-locked' : ''}`;
    return (
      <label className="set cfg-row">
        <span>
          <b>{title}</b>
        </span>
        <select
          className="cfg-select"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            setDefault(path, v.startsWith('on'));
            setLock(path, v.endsWith('-locked'));
          }}
        >
          <option value="on">On (people can turn it off)</option>
          <option value="off">Off (people can turn it on)</option>
          <option value="on-locked">Always on</option>
          <option value="off-locked">Always off</option>
        </select>
      </label>
    );
  };

  return (
    <>
      <header className="ph">
        <div className="ph-row">
          <div>
            <Link className="btn btn-quiet btn-sm" to="/me">
              <Icon name="chevL" size="sm" /> You
            </Link>
            <h1>Lumen settings for everyone</h1>
          </div>
        </div>
        <p className="sub">
          Pick what everyone gets, then download <b>lumen-config.json</b> and
          put it next to Lumen (see “Admin defaults” in the Lumen guide). People
          see the change the next time they open Lumen. “Always on” and “Always
          off” can’t be changed on anyone’s You page; the others are just where
          everyone starts.
        </p>
      </header>

      <Section title="Sign-in and media server">
        <div className="setlist">
          <label className="set cfg-row">
            <span>
              <b>Media server</b>
              <small>
                Names in every label and the sign-in button. SeerrNG reports{' '}
                {mediaServer().source === 'seerrng'
                  ? mediaServer().name
                  : 'its own server'}
                .
              </small>
            </span>
            <select
              className="cfg-select"
              value={cfg.mediaServer || 'auto'}
              onChange={(e) =>
                setTop(
                  'mediaServer',
                  e.target.value === 'auto' ? undefined : e.target.value
                )
              }
            >
              <option value="auto">Follow SeerrNG</option>
              <option value="plex">Plex</option>
              <option value="jellyfin">Jellyfin</option>
              <option value="emby">Emby</option>
            </select>
          </label>
          <label className="set cfg-row">
            <span>
              <b>Sign-in page</b>
              <small>
                Jellyfin and Emby: show the username and password boxes straight
                away, without naming the media server
              </small>
            </span>
            <select
              className="cfg-select"
              value={cfg.loginStyle || 'buttons'}
              onChange={(e) =>
                setTop(
                  'loginStyle',
                  e.target.value === 'buttons' ? undefined : e.target.value
                )
              }
            >
              <option value="buttons">Buttons (Continue with …)</option>
              <option value="form">Username and password form</option>
            </select>
          </label>
          <label className="set cfg-row">
            <span>
              <b>Full SeerrNG address</b>
              <small>Where “Open full SeerrNG” goes</small>
            </span>
            <input
              className="cfg-input"
              placeholder="https://seerr.example.com"
              value={(cfg.seerrPublicUrl as string) || ''}
              onChange={(e) => setTop('seerrPublicUrl', e.target.value)}
            />
          </label>
        </div>
      </Section>

      <Section title="Logo and tab icon">
        <div className="setlist">
          <label className="set cfg-row">
            <span>
              <b>Name</b>
              <small>
                Next to the logo and in the browser tab. Leave empty to hide the
                text.
              </small>
            </span>
            <input
              className="cfg-input"
              placeholder="SeerrNG"
              value={cfg.branding?.name ?? ''}
              onChange={(e) => setBrand('name', e.target.value)}
            />
          </label>
          <label className="set cfg-row">
            <span>
              <b>Logo</b>
              <small>
                Square image, e.g. /branding/logo.png (mount a branding folder)
                or an https address
              </small>
            </span>
            <input
              className="cfg-input"
              placeholder="/branding/logo.png"
              value={cfg.branding?.logo ?? ''}
              onChange={(e) => setBrand('logo', e.target.value)}
            />
          </label>
          <label className="set cfg-row">
            <span>
              <b>Tab icon</b>
              <small>PNG or SVG, e.g. /branding/icon.png</small>
            </span>
            <input
              className="cfg-input"
              placeholder="/branding/icon.png"
              value={cfg.branding?.icon ?? ''}
              onChange={(e) => setBrand('icon', e.target.value)}
            />
          </label>
          {(cfg.branding?.logo || cfg.branding?.name !== undefined) && (
            <div className="set">
              <span className="brand cfg-preview">
                {cfg.branding?.logo ? (
                  <img
                    className="mark mark-img"
                    src={cfg.branding.logo}
                    alt=""
                  />
                ) : (
                  <span className="mark">
                    <Icon name="play" size="sm" />
                  </span>
                )}
                {cfg.branding?.name ?? 'SeerrNG'}
              </span>
            </div>
          )}
        </div>
      </Section>

      <Section title="Defaults for everyone">
        <div className="setlist">
          {SWITCHES.map(([k, t]) => (
            <Row key={k} path={k} title={t} on={defaults[k as Switch]} />
          ))}
          <div className="set cfg-row">
            <span>
              <b>Theme</b>
            </span>
            <select
              className="cfg-select"
              value={defaults.theme}
              onChange={(e) => setDefault('theme', e.target.value)}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">Device</option>
            </select>
            <Lock path="theme" />
          </div>
        </div>
      </Section>

      <Section title="Discover rows">
        <div className="setlist">
          {(Object.keys(DISCOVER_ROWS) as DiscoverRow[]).map((r) => (
            <Row
              key={r}
              path={`rows.${r}`}
              title={discoverRowLabel(r)}
              on={rows[r]}
            />
          ))}
        </div>
      </Section>

      <Section title="lumen-config.json">
        <div className="cfg-actions">
          <button className="btn btn-primary" onClick={download}>
            Download lumen-config.json
          </button>
          <button className="btn btn-tonal" onClick={copy}>
            Copy
          </button>
        </div>
        <textarea
          className="cfg-json"
          readOnly
          value={json}
          aria-label="lumen-config.json"
          rows={Math.min(30, json.split('\n').length)}
        />
      </Section>
    </>
  );
}

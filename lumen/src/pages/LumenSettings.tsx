import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { csrfHeaders } from '../api';
import { isAdministrator, useAuth } from '../auth';
import { Section } from '../components/cards';
import { InstanceRequestSettings } from '../components/InstanceRequestSettings';
import { useToast } from '../components/toast';
import { isCompanionBrandingPath, parseCompanionConfig } from '../configImport';
import { embedded, lumenAdminUrl } from '../deployment';
import { useLumenLocale } from '../i18n';
import { Icon } from '../icons';
import { logoShapeOf, mediaServer, type LogoShape } from '../mediaServer';
import {
  DEFAULT_PREFS,
  DISCOVER_ROWS,
  discoverRowLabel,
  usePrefs,
  type AdminConfig,
  type DiscoverRow,
} from '../settings';

// Admins choose what everyone gets, saved as lumen-config.json; every browser reads it on its
// next load. Lumen has no database: its nginx saves the file into a mounted /lumen-data folder
// (deploy/lumen-config.js). Without that folder the file is downloaded and mounted by hand.
const SWITCHES = [
  ['hoverRequest', 'quickRequest'],
  ['wholeSeriesDefault', 'wholeSeries'],
  ['requestOptions', 'requestOptions'],
  ['narratorChoice', 'narrators'],
  ['showBooks', 'books'],
] as const;
const switchFallback: Record<(typeof SWITCHES)[number][1], string> = {
  quickRequest: 'Quick request on posters',
  wholeSeries: 'Request whole series by default',
  requestOptions: 'Admins choose server and folder on quick requests',
  narrators: 'Choose audiobook narrators',
  books: 'Show books and audiobooks',
};
type Switch = (typeof SWITCHES)[number][0];
type Edit = (c: AdminConfig) => AdminConfig;

// These stay outside the page: declared inside it, every change would make them new
// components and the select or checkbox in use would lose focus.

// one choice per setting: the starting value, and whether people may change it
// ("locked" in lumen-config.json)
function Lock({
  locked,
  onChange,
}: {
  locked: boolean;
  onChange: (locked: boolean) => void;
}) {
  const { t } = useLumenLocale();
  return (
    <label className="cfg-lock">
      <input
        type="checkbox"
        checked={!locked}
        onChange={(e) => onChange(!e.target.checked)}
      />
      {t('lumen.admin.allowChange', 'Let people change it')}
    </label>
  );
}

function Row({
  title,
  on,
  locked,
  onChange,
}: {
  title: string;
  on: boolean;
  locked: boolean;
  onChange: (on: boolean, locked: boolean) => void;
}) {
  const { t } = useLumenLocale();
  const admin = (key: string, fallback: string) =>
    t(`lumen.admin.${key}`, fallback);
  const value = `${on ? 'on' : 'off'}${locked ? '-locked' : ''}`;
  return (
    <label className="set cfg-row">
      <span>
        <b>{title}</b>
      </span>
      <select
        className="cfg-select"
        aria-label={title}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v.startsWith('on'), v.endsWith('-locked'));
        }}
      >
        <option value="on">
          {admin('onCanChange', 'On (people can turn it off)')}
        </option>
        <option value="off">
          {admin('offCanChange', 'Off (people can turn it on)')}
        </option>
        <option value="on-locked">{admin('alwaysOn', 'Always on')}</option>
        <option value="off-locked">{admin('alwaysOff', 'Always off')}</option>
      </select>
    </label>
  );
}

function Upload({
  kind,
  ready,
  uploading,
  onFile,
}: {
  kind: 'logo' | 'icon';
  ready: boolean; // writable storage and the current settings loaded
  uploading: 'logo' | 'icon' | null;
  onFile: (kind: 'logo' | 'icon', file: File) => void;
}) {
  const { t } = useLumenLocale();
  const admin = (key: string, fallback: string) =>
    t(`lumen.admin.${key}`, fallback);
  const label =
    kind === 'logo' ? admin('logo', 'Logo') : admin('tabIcon', 'Tab icon');
  return ready ? (
    <label className="btn btn-tonal btn-sm cfg-upload">
      {uploading === kind
        ? admin('uploading', 'Uploading…')
        : admin('upload', 'Upload')}
      <input
        type="file"
        className="sr"
        accept={
          embedded
            ? 'image/png,image/jpeg,image/webp'
            : 'image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon'
        }
        aria-label={admin(
          kind === 'logo' ? 'uploadLogo' : 'uploadTabIcon',
          `Upload ${label.toLowerCase()}`
        )}
        disabled={!!uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(kind, f);
        }}
      />
    </label>
  ) : (
    <button
      className="btn btn-tonal btn-sm"
      disabled
      title={admin(
        'uploadUnavailable',
        'Upload needs writable storage and the current settings. See the message above.'
      )}
    >
      {admin('upload', 'Upload')}
    </button>
  );
}

const clone = (c: AdminConfig): AdminConfig =>
  JSON.parse(JSON.stringify(c || {}));

export default function LumenSettings() {
  const { user } = useAuth();
  const { t } = useLumenLocale();
  const admin = (
    key: string,
    fallback: string,
    values?: Record<string, string | number>
  ) => t(`lumen.admin.${key}`, fallback, values);
  const { adminConfig, adminConfigState, retryAdminConfig, adminSaved } =
    usePrefs();
  const toast = useToast();
  // Save writes the whole file, so it must start from the file as it is: until it has
  // loaded, Save and Upload stay off.
  const loaded = adminConfigState === 'ready';
  // The draft is the loaded file with the admin's changes on top. Changes made before the
  // file arrives (or after a save) are replayed onto it instead of replacing it.
  const edits = useRef<Edit[]>([]);
  const replay = (base: AdminConfig) =>
    edits.current.reduce((c, edit) => edit(c), clone(base));
  const [cfg, setCfgState] = useState<AdminConfig>(() => replay(adminConfig));
  useEffect(() => {
    setCfgState(replay(adminConfig));
  }, [adminConfig]);
  const setCfg = (edit: Edit) => {
    edits.current.push(edit);
    setCfgState(edit);
  };
  const isAdmin = isAdministrator(user?.permissions);
  // can this server save the file itself? null while asking
  const [saveState, setSaveState] = useState<{
    canSave: boolean;
    folder?: string;
    uid?: number;
    gid?: number;
    message?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importDraft, setImportDraft] = useState(false);
  const [missingBranding, setMissingBranding] = useState<('logo' | 'icon')[]>(
    []
  );
  const [storageCheck, setStorageCheck] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    fetch(`${lumenAdminUrl}/config`, {
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d) =>
          live &&
          setSaveState(
            d && typeof d.canSave === 'boolean' ? d : { canSave: false }
          )
      )
      .catch(() => live && setSaveState({ canSave: false }));
    return () => {
      live = false;
    };
  }, [isAdmin, storageCheck]);

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
  const setBrand = (k: 'name' | 'logo' | 'icon' | 'logoShape', v: string) =>
    setCfg((c) => {
      const b: Record<string, string> = { ...(c.branding || {}) };
      // "rounded" is the default, so it needn't be written down
      if ((v === '' && k !== 'name') || (k === 'logoShape' && v === 'rounded'))
        delete b[k];
      else b[k] = v;
      return { ...c, branding: b };
    });
  const shape = logoShapeOf(cfg.branding?.logoShape);
  const setTop = (k: string, v: string | undefined) =>
    setCfg((c) => {
      const n = { ...c };
      if (v === undefined || v === '') delete n[k];
      else n[k] = v;
      return n;
    });

  const json = useMemo(() => JSON.stringify(cfg, null, 2) + '\n', [cfg]);
  const importConfig = async (file: File) => {
    if (file.size > 64 * 1024) {
      toast(
        admin(
          'importTooLarge',
          'Choose a Lumen configuration file of up to 64 KiB.'
        )
      );
      return;
    }
    setImporting(true);
    try {
      const imported = parseCompanionConfig(await file.text());
      const missing = (['logo', 'icon'] as const).filter((kind) =>
        isCompanionBrandingPath(imported.branding?.[kind])
      );
      for (const kind of missing) delete imported.branding?.[kind];
      setCfg(() => imported);
      setMissingBranding(missing);
      setImportDraft(true);
      toast(
        admin(
          'importLoaded',
          'Configuration loaded into your draft. Review it before saving.'
        )
      );
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : admin('fileReadFailed', 'Could not read the file.')
      );
    } finally {
      setImporting(false);
    }
  };
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
  const putConfig = async (body: string) => {
    const r = await fetch(`${lumenAdminUrl}/config`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
      body,
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.message || `Couldn’t save (${r.status})`);
  };
  const save = async () => {
    if (!loaded) return;
    setSaving(true);
    // changes made while this save is on its way stay in the draft
    const sent = edits.current.length;
    try {
      await putConfig(json);
      setImportDraft(false);
      edits.current = edits.current.slice(sent);
      adminSaved(JSON.parse(json));
      toast(
        admin(
          'saveSuccess',
          'Saved. Everyone gets it the next time they open Lumen.'
        )
      );
    } catch (e) {
      toast(
        e instanceof Error ? e.message : admin('saveFailed', 'Couldn’t save')
      );
    } finally {
      setSaving(false);
    }
  };
  // Logo and tab icon: the server keeps the image (a new file name each time, so no browser
  // shows an old copy) and its address goes straight into the saved settings. Other changes
  // on this page stay unsaved until Save.
  const [uploading, setUploading] = useState<'logo' | 'icon' | null>(null);
  const upload = async (kind: 'logo' | 'icon', file: File) => {
    if (!loaded) return;
    if (file.size > 2 * 1024 * 1024) {
      toast(admin('imageTooLarge', 'Choose an image of up to 2 MB.'));
      return;
    }
    setUploading(kind);
    try {
      const r = await fetch(`${lumenAdminUrl}/branding/${kind}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          ...csrfHeaders(),
        },
        body: file,
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || typeof d?.url !== 'string')
        throw new Error(d?.message || `Couldn’t upload (${r.status})`);
      if (importDraft) {
        setBrand(kind, d.url);
        setMissingBranding((previous) =>
          previous.filter((item) => item !== kind)
        );
        toast(admin('imageDraftAdded', 'Image added to your draft.'));
        return;
      }
      const saved: AdminConfig = {
        ...adminConfig,
        branding: { ...(adminConfig?.branding || {}), [kind]: d.url },
      };
      await putConfig(JSON.stringify(saved, null, 2) + '\n');
      // the draft shows the new image too, over any address typed in before
      setBrand(kind, d.url);
      adminSaved(saved);
      toast(
        admin('imageSaveSuccess', '{asset} uploaded and saved for everyone.', {
          asset:
            kind === 'logo'
              ? admin('logo', 'Logo')
              : admin('tabIcon', 'Tab icon'),
        })
      );
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : admin('uploadFailed', 'Couldn’t upload')
      );
    } finally {
      setUploading(null);
    }
  };
  const canWrite = !!saveState?.canSave && loaded;
  const onFile = (kind: 'logo' | 'icon', f: File) => void upload(kind, f);
  const row = (path: string) => ({
    locked: locked.has(path),
    onChange: (on: boolean, lock: boolean) => {
      setDefault(path, on);
      setLock(path, lock);
    },
  });
  const copy = () =>
    navigator.clipboard
      ?.writeText(json)
      .then(() => toast(admin('copied', 'Copied lumen-config.json')))
      .catch(() =>
        toast(
          admin('copyFailed', 'Couldn’t copy. Select the text below instead.')
        )
      );

  if (!isAdmin)
    return (
      <div className="empty">
        <b>{admin('adminsOnly', 'Admins only')}</b>
        {admin('adminsOnlyHelp', 'These settings change Lumen for everyone.')}
      </div>
    );

  return (
    <>
      <header className="ph">
        <div className="ph-row">
          <div>
            <Link className="btn btn-quiet btn-sm" to="/me">
              <Icon name="chevL" size="sm" /> {admin('you', 'You')}
            </Link>
            <h1>{admin('title', 'Lumen settings for everyone')}</h1>
          </div>
        </div>
        <p className="sub">
          {saveState?.canSave ? (
            <>
              {admin('introReady', 'Pick what everyone gets, then select')}{' '}
              <b>{admin('saveForEveryone', 'Save for everyone')}</b>.
            </>
          ) : (
            <>
              {admin(
                'introReadOnly',
                'Save and Upload need writable storage. You can still download your settings.'
              )}
            </>
          )}{' '}
          {admin(
            'introApply',
            'People see the change the next time they open Lumen. “Always on” and “Always off” can’t be changed on anyone’s You page; the others are just where everyone starts.'
          )}
        </p>
      </header>

      {saveState && !saveState.canSave && (
        <div className="note" role="status">
          <p>
            {embedded
              ? (saveState.message ??
                admin(
                  'storageIncluded',
                  'Included Lumen cannot save its settings. Check that SeerrNG’s config volume is writable.'
                ))
              : saveState.folder === 'readonly'
                ? admin(
                    'storageReadOnly',
                    'Lumen cannot write to /lumen-data. Mount it read-write and give its host folder to UID:GID {uid}:{gid}.',
                    {
                      uid: saveState.uid ?? 'the container user',
                      gid: saveState.gid ?? 'the container group',
                    }
                  )
                : saveState.folder === 'missing'
                  ? admin(
                      'storageMissing',
                      'Mount a writable host folder at /lumen-data to enable Save and Upload.'
                    )
                  : admin(
                      'storageUnknown',
                      'Could not check Lumen storage. Check the container logs, then try again.'
                    )}
          </p>
          {embedded && saveState.uid != null && saveState.gid != null && (
            <p>
              {admin(
                'containerIdentity',
                'SeerrNG runs as UID {uid} and GID {gid}.',
                { uid: saveState.uid, gid: saveState.gid }
              )}
            </p>
          )}
          <button
            className="btn btn-tonal btn-sm"
            onClick={() => setStorageCheck((n) => n + 1)}
          >
            {admin('checkStorage', 'Check storage again')}
          </button>
          {!embedded && (
            <p>
              {admin('composePrefix', 'Compose: put')}{' '}
              <code>user: "1000:1000"</code> {admin('composeMiddle', 'beside')}{' '}
              <code>environment:</code>
              {admin(
                'composeSuffix',
                ', with the same indentation. It is not an environment variable.'
              )}
            </p>
          )}
          <p>
            {admin('draftRetained', 'Your draft stays here while you check.')}
          </p>
        </div>
      )}

      {adminConfigState === 'failed' ? (
        <div className="note" role="alert">
          <p>
            {admin(
              'loadFailed',
              'Couldn’t load the current settings, so Save and Upload are off: they would replace settings this page hasn’t seen.'
            )}
          </p>
          <button className="btn btn-tonal btn-sm" onClick={retryAdminConfig}>
            {admin('tryAgain', 'Try again')}
          </button>
        </div>
      ) : (
        adminConfigState === 'loading' && (
          <div className="note" role="status">
            <p>{admin('loading', 'Loading the current settings…')}</p>
          </div>
        )
      )}

      <InstanceRequestSettings />

      <Section title={admin('signInSection', 'Sign-in and media server')}>
        <div className="setlist">
          <label className="set cfg-row">
            <span>
              <b>{admin('mediaServer', 'Media server')}</b>
              <small>
                {admin(
                  'mediaServerHelp',
                  'Names in every label and the sign-in button. SeerrNG reports {server}.',
                  {
                    server:
                      mediaServer().source === 'seerrng'
                        ? mediaServer().product
                        : 'its own server',
                  }
                )}{' '}
              </small>
            </span>
            <select
              className="cfg-select"
              aria-label={admin('mediaServer', 'Media server')}
              value={cfg.mediaServer || 'auto'}
              onChange={(e) =>
                setTop(
                  'mediaServer',
                  e.target.value === 'auto' ? undefined : e.target.value
                )
              }
            >
              <option value="auto">
                {admin('followSeerr', 'Follow SeerrNG')}
              </option>
              <option value="plex">Plex</option>
              <option value="jellyfin">Jellyfin</option>
              <option value="emby">Emby</option>
            </select>
          </label>
          <label className="set cfg-row">
            <span>
              <b>{admin('mediaServerName', 'Media server name')}</b>
              <small>
                {admin(
                  'mediaServerNameHelp',
                  'Replaces “{product}” everywhere: “On …”, “Watch on …”, filters and sign-in. Leave empty to keep it.',
                  { product: mediaServer().product }
                )}
              </small>
            </span>
            <input
              className="cfg-input"
              aria-label={admin('mediaServerName', 'Media server name')}
              placeholder={mediaServer().product}
              value={(cfg.mediaServerName as string) || ''}
              onChange={(e) => setTop('mediaServerName', e.target.value)}
            />
          </label>
          <label className="set cfg-row">
            <span>
              <b>{admin('signInPage', 'Sign-in page')}</b>
              <small>
                {admin(
                  'signInHelp',
                  'Jellyfin and Emby: show the username and password boxes straight away, without naming the media server. With buttons, each device opens the way it last signed in.'
                )}
              </small>
            </span>
            <select
              className="cfg-select"
              aria-label={admin('signInPage', 'Sign-in page')}
              value={cfg.loginStyle || 'buttons'}
              onChange={(e) =>
                setTop(
                  'loginStyle',
                  e.target.value === 'buttons' ? undefined : e.target.value
                )
              }
            >
              <option value="buttons">
                {admin('signInButtons', 'Buttons (Continue with …)')}
              </option>
              <option value="form">
                {admin('signInForm', 'Username and password form')}
              </option>
            </select>
          </label>
          <label className="set cfg-row">
            <span>
              <b>{admin('fullSeerrAddress', 'Full SeerrNG address')}</b>
              <small>
                {admin(
                  'fullSeerrAddressHelp',
                  'Where “Open full SeerrNG” goes'
                )}
              </small>
            </span>
            <input
              className="cfg-input"
              aria-label={admin('fullSeerrAddress', 'Full SeerrNG address')}
              placeholder="https://seerr.example.com"
              value={(cfg.seerrPublicUrl as string) || ''}
              onChange={(e) => setTop('seerrPublicUrl', e.target.value)}
            />
          </label>
          <label className="set cfg-row">
            <span>
              <b>{admin('audiobookshelfAddress', 'Audiobookshelf address')}</b>
              <small>
                {admin(
                  'audiobookshelfAddressHelp',
                  'Where “Listen in Audiobookshelf” goes'
                )}
              </small>
            </span>
            <input
              className="cfg-input"
              aria-label={admin(
                'audiobookshelfAddress',
                'Audiobookshelf address'
              )}
              placeholder="https://books.example.com"
              value={(cfg.audiobookshelfUrl as string) || ''}
              onChange={(e) => setTop('audiobookshelfUrl', e.target.value)}
            />
          </label>
          <label className="set cfg-row">
            <span>
              <b>{admin('kavitaAddress', 'Kavita address')}</b>
              <small>
                {admin(
                  'kavitaAddressHelp',
                  'Where “Read in Kavita” goes. Leave empty to use SeerrNG’s Kavita address'
                )}
              </small>
            </span>
            <input
              className="cfg-input"
              aria-label={admin('kavitaAddress', 'Kavita address')}
              placeholder="https://manga.example.com"
              value={(cfg.kavitaUrl as string) || ''}
              onChange={(e) => setTop('kavitaUrl', e.target.value)}
            />
          </label>
        </div>
      </Section>

      <Section title={admin('brandingSection', 'Logo and tab icon')}>
        {missingBranding.length > 0 && (
          <p className="note" role="status">
            {admin('missingBrandingPrefix', 'Upload the companion')}{' '}
            {missingBranding
              .map((kind) =>
                kind === 'icon'
                  ? admin('tabIcon', 'tab icon')
                  : admin('logo', 'logo')
              )
              .join(' and ')}{' '}
            {admin(
              'missingBrandingSuffix',
              'as PNG, JPEG, or WebP before saving.'
            )}
          </p>
        )}
        <div className="setlist">
          <label className="set cfg-row">
            <span>
              <b>{admin('name', 'Name')}</b>
              <small>
                {admin(
                  'nameHelp',
                  'Next to the logo and in the browser tab. Leave empty to hide the text.'
                )}
              </small>
            </span>
            <input
              className="cfg-input"
              aria-label={admin('name', 'Name')}
              placeholder="SeerrNG"
              value={cfg.branding?.name ?? ''}
              onChange={(e) => setBrand('name', e.target.value)}
            />
          </label>
          <div className="set cfg-row">
            <span>
              <b>{admin('logo', 'Logo')}</b>
              <small>
                {saveState?.canSave
                  ? admin(
                      'logoUploadHelp',
                      'Square image: upload one, or an address such as /branding/logo.png or https://…'
                    )
                  : admin(
                      'logoManualHelp',
                      'Square image, e.g. /branding/logo.png (mount a branding folder) or an https address'
                    )}
              </small>
            </span>
            <input
              className="cfg-input"
              aria-label={admin('logoAddress', 'Logo address')}
              placeholder="/branding/logo.png"
              value={cfg.branding?.logo ?? ''}
              onChange={(e) => setBrand('logo', e.target.value)}
            />
            <Upload
              kind="logo"
              ready={canWrite && !saving && !importing}
              uploading={uploading}
              onFile={onFile}
            />
          </div>
          <div className="set cfg-row">
            <span>
              <b>{admin('tabIcon', 'Tab icon')}</b>
              <small>
                {saveState?.canSave
                  ? embedded
                    ? admin(
                        'iconUploadEmbedded',
                        'Square PNG, JPEG or WebP: upload one, or use an image address'
                      )
                    : admin(
                        'iconUploadCompanion',
                        'Square PNG or SVG: upload one, or an address such as /branding/icon.png'
                      )
                  : admin(
                      'iconManualHelp',
                      'PNG or SVG, e.g. /branding/icon.png'
                    )}
              </small>
            </span>
            <input
              className="cfg-input"
              aria-label={admin('tabIconAddress', 'Tab icon address')}
              placeholder="/branding/icon.png"
              value={cfg.branding?.icon ?? ''}
              onChange={(e) => setBrand('icon', e.target.value)}
            />
            {cfg.branding?.icon && (
              <img className="cfg-icon" src={cfg.branding.icon} alt="" />
            )}
            <Upload
              kind="icon"
              ready={canWrite && !saving && !importing}
              uploading={uploading}
              onFile={onFile}
            />
          </div>
          <div className="set cfg-row">
            <span>
              <b>{admin('logoShape', 'Logo shape')}</b>
              <small>
                {admin(
                  'logoShapeHelp',
                  'How the logo is framed next to the name. “As uploaded” keeps the file as it is: transparent, uncropped and as wide as it is.'
                )}
              </small>
            </span>
            <div
              className="seg"
              role="group"
              aria-label={admin('logoShape', 'Logo shape')}
            >
              {(
                [
                  ['rounded', 'roundedSquare'],
                  ['circle', 'circle'],
                  ['raw', 'asUploaded'],
                ] as [LogoShape, string][]
              ).map(([v, t]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={shape === v}
                  onClick={() => setBrand('logoShape', v)}
                >
                  {admin(
                    `shape.${t}`,
                    t === 'roundedSquare'
                      ? 'Rounded square'
                      : t === 'circle'
                        ? 'Circle'
                        : 'As uploaded'
                  )}
                </button>
              ))}
            </div>
          </div>
          {(cfg.branding?.logo || cfg.branding?.name !== undefined) && (
            <div className="set cfg-row">
              <span>
                <b>{admin('preview', 'Preview')}</b>
              </span>
              <span
                className="brand cfg-preview"
                aria-label={admin('logoPreview', 'Logo preview')}
              >
                {cfg.branding?.logo ? (
                  <img
                    className={`mark mark-img mark-${shape}`}
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

      <Section title={admin('defaultsSection', 'Defaults for everyone')}>
        <div className="setlist">
          {SWITCHES.map(([k, key]) => (
            <Row
              key={k}
              title={admin(`switch.${key}`, switchFallback[key])}
              on={defaults[k as Switch]}
              {...row(k)}
            />
          ))}
          <div className="set cfg-row">
            <span>
              <b>{admin('theme', 'Theme')}</b>
            </span>
            <select
              className="cfg-select"
              value={defaults.theme}
              onChange={(e) => setDefault('theme', e.target.value)}
            >
              <option value="dark">{admin('dark', 'Dark')}</option>
              <option value="light">{admin('light', 'Light')}</option>
              <option value="system">{admin('device', 'Device')}</option>
            </select>
            <Lock
              locked={locked.has('theme')}
              onChange={(lock) => setLock('theme', lock)}
            />
          </div>
        </div>
      </Section>

      <Section title={t('lumen.me.discoverRows', 'Discover rows')}>
        <div className="setlist">
          {(Object.keys(DISCOVER_ROWS) as DiscoverRow[]).map((r) => (
            <Row
              key={r}
              title={t(
                r === 'newOnPlex'
                  ? 'lumen.me.row.newOnServer'
                  : `lumen.me.row.${r}`,
                discoverRowLabel(r),
                r === 'newOnPlex' ? { server: mediaServer().name } : undefined
              )}
              on={rows[r]}
              {...row(`rows.${r}`)}
            />
          ))}
        </div>
      </Section>

      <Section title="lumen-config.json">
        <div className="cfg-actions">
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={
              saving ||
              importing ||
              !!uploading ||
              missingBranding.length > 0 ||
              !canWrite
            }
            title={
              !saveState?.canSave
                ? admin(
                    'saveStorageTitle',
                    'Saving needs writable storage. See the storage message above.'
                  )
                : !loaded
                  ? admin(
                      'saveLoadTitle',
                      'Saving waits for the current settings. See the message above.'
                    )
                  : undefined
            }
          >
            {saving
              ? admin('saving', 'Saving…')
              : admin('saveForEveryone', 'Save for everyone')}
          </button>
          <button
            className={`btn ${saveState?.canSave ? 'btn-tonal' : 'btn-primary'}`}
            onClick={download}
          >
            {admin('download', 'Download lumen-config.json')}
          </button>
          <button className="btn btn-tonal" onClick={copy}>
            {admin('copy', 'Copy')}
          </button>
          {embedded && (
            <label className="btn btn-tonal cfg-upload">
              {importing
                ? admin('reading', 'Reading…')
                : admin('import', 'Import lumen-config.json')}
              <input
                type="file"
                className="sr"
                accept=".json,application/json"
                aria-label={admin('import', 'Import lumen-config.json')}
                disabled={!loaded || saving || importing || !!uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void importConfig(file);
                }}
              />
            </label>
          )}
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

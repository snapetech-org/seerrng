import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { SavedConnectionHost } from '../components/SavedConnectionHost';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

const path = '/settings/software-acquisition';
const providers = { romarr: 'ROMarrNG', questarr: 'QuestarrNG' } as const;
type Provider = keyof typeof providers;
type Group = 'retro' | 'modern';
type Catalog = 'questarr' | 'romarr' | 'romarr-dat';
interface Connection {
  hostname: string;
  port: number;
  useSsl: boolean;
  baseUrl: string;
  apiKeyConfigured: boolean;
}
interface Settings {
  romarr: Connection;
  questarr: Connection;
  emulationCatalogProvider: Catalog;
  emulationSystemGroups: Record<string, Group>;
  emulationPlatformMappings: Record<string, number>;
  steamApiKeyConfigured: boolean;
}
interface DraftConnection {
  hostname: string;
  port: string;
  useSsl: boolean;
  baseUrl: string;
  apiKey: string;
  clear: boolean;
}

const draftFor = ({
  hostname,
  port,
  useSsl,
  baseUrl,
}: Connection): DraftConnection => ({
  hostname,
  port: String(port),
  useSsl,
  baseUrl,
  apiKey: '',
  clear: false,
});
const payloadFor = ({
  hostname,
  port,
  useSsl,
  baseUrl,
  apiKey,
  clear,
}: DraftConnection) => ({
  hostname,
  port: Number(port),
  useSsl,
  baseUrl,
  ...(clear ? { apiKey: '' } : apiKey ? { apiKey } : {}),
});

interface Preview {
  systems: {
    slug: string;
    name: string;
    automaticMatch: { id: number; name: string } | null;
  }[];
  catalogPlatforms: { id: number; name: string }[];
}

function Editor({ initial }: { initial: Settings }) {
  const { t } = useLumenLocale();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#steam-library-import')
      document
        .getElementById('steam-library-import')
        ?.scrollIntoView({ block: 'start' });
  }, [hash]);
  const [saved, setSaved] = useState(initial);
  const [connections, setConnections] = useState(() => ({
    romarr: draftFor(initial.romarr),
    questarr: draftFor(initial.questarr),
  }));
  const [catalog, setCatalog] = useState(
    initial.emulationCatalogProvider ?? 'questarr'
  );
  const [groups, setGroups] = useState(initial.emulationSystemGroups ?? {});
  const [mappings, setMappings] = useState(
    initial.emulationPlatformMappings ?? {}
  );
  const [steamKey, setSteamKey] = useState('');
  const [removeSteam, setRemoveSteam] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
    provider?: Provider;
  }>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const systems = useApi<{
    results: { slug: string; name: string }[];
    unmatchedDatNames?: string[];
  }>(saved.romarr.hostname ? '/request/software/catalog/systems' : null);
  const preview = useApi<Preview>(
    showPreview ? path + '/platform-mapping/preview' : null
  );
  const systemList = systems.data?.results ?? [];
  const dirty =
    JSON.stringify(connections) !==
      JSON.stringify({
        romarr: draftFor(saved.romarr),
        questarr: draftFor(saved.questarr),
      }) ||
    catalog !== (saved.emulationCatalogProvider ?? 'questarr') ||
    JSON.stringify(groups) !==
      JSON.stringify(saved.emulationSystemGroups ?? {}) ||
    JSON.stringify(mappings) !==
      JSON.stringify(saved.emulationPlatformMappings ?? {}) ||
    !!steamKey ||
    removeSteam;

  function reset(settings: Settings) {
    setConnections({
      romarr: draftFor(settings.romarr),
      questarr: draftFor(settings.questarr),
    });
    setCatalog(settings.emulationCatalogProvider ?? 'questarr');
    setGroups(settings.emulationSystemGroups ?? {});
    setMappings(settings.emulationPlatformMappings ?? {});
    setSteamKey('');
    setRemoveSteam(false);
  }

  function edit(provider: Provider, changes: Partial<DraftConnection>) {
    setConnections((previous) => ({
      ...previous,
      [provider]: { ...previous[provider], ...changes },
    }));
    setNotice(undefined);
  }

  async function run(provider?: Provider) {
    if (pending.current || (!provider && !dirty)) return;
    pending.current = true;
    setBusy(true);
    setNotice(undefined);
    try {
      if (provider) {
        const tested = await api<{
          apiVersion: number;
          capabilities?: { catalog?: boolean; datCatalog?: boolean };
          datCatalogPlatformCount?: number;
          unmatchedDatNames?: string[];
        }>(`${path}/test/${provider}`, {
          method: 'POST',
          body: JSON.stringify(payloadFor(connections[provider])),
        });
        setNotice({
          provider,
          text: [
            `${providers[provider]} connected using integration API v${tested.apiVersion}.`,
            tested.capabilities?.catalog &&
              t('lumen.software.igdbReady', 'IGDB catalog ready.'),
            tested.capabilities?.datCatalog &&
              t(
                'lumen.software.datReady',
                'DAT catalog ready for {count} systems.',
                { count: tested.datCatalogPlatformCount ?? 0 }
              ),
            tested.unmatchedDatNames?.length &&
              t(
                'lumen.software.unmatchedDat',
                'Unmatched DAT names include {names}.',
                { names: tested.unmatchedDatNames.join(', ') }
              ),
          ]
            .filter(Boolean)
            .join(' '),
        });
      } else {
        const payload = {
          romarr: payloadFor(connections.romarr),
          questarr: payloadFor(connections.questarr),
          emulationCatalogProvider: catalog,
          emulationSystemGroups: groups,
          emulationPlatformMappings: mappings,
          ...(removeSteam
            ? { steamApiKey: '' }
            : steamKey
              ? { steamApiKey: steamKey }
              : {}),
        };
        const result = await api<Settings>(path, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        const readback = await api<Settings>(path);
        const expected = {
          romarr: {
            hostname: connections.romarr.hostname.trim(),
            port: Number(connections.romarr.port),
            useSsl: connections.romarr.useSsl,
            baseUrl: connections.romarr.baseUrl.trim()
              ? `/${connections.romarr.baseUrl.trim().replace(/^\/+|\/+$/g, '')}`
              : '',
            apiKeyConfigured: connections.romarr.clear
              ? false
              : connections.romarr.apiKey
                ? true
                : saved.romarr.apiKeyConfigured,
          },
          questarr: {
            hostname: connections.questarr.hostname.trim(),
            port: Number(connections.questarr.port),
            useSsl: connections.questarr.useSsl,
            baseUrl: connections.questarr.baseUrl.trim()
              ? `/${connections.questarr.baseUrl.trim().replace(/^\/+|\/+$/g, '')}`
              : '',
            apiKeyConfigured: connections.questarr.clear
              ? false
              : connections.questarr.apiKey
                ? true
                : saved.questarr.apiKeyConfigured,
          },
          emulationCatalogProvider: catalog,
          emulationSystemGroups: groups,
          emulationPlatformMappings: mappings,
          steamApiKeyConfigured: removeSteam
            ? false
            : steamKey
              ? true
              : saved.steamApiKeyConfigured,
        };
        const matches = (value: Settings) =>
          value.romarr.hostname === expected.romarr.hostname &&
          value.romarr.port === expected.romarr.port &&
          value.romarr.useSsl === expected.romarr.useSsl &&
          value.romarr.baseUrl === expected.romarr.baseUrl &&
          value.romarr.apiKeyConfigured === expected.romarr.apiKeyConfigured &&
          value.questarr.hostname === expected.questarr.hostname &&
          value.questarr.port === expected.questarr.port &&
          value.questarr.useSsl === expected.questarr.useSsl &&
          value.questarr.baseUrl === expected.questarr.baseUrl &&
          value.questarr.apiKeyConfigured ===
            expected.questarr.apiKeyConfigured &&
          value.emulationCatalogProvider ===
            expected.emulationCatalogProvider &&
          JSON.stringify(value.emulationSystemGroups) ===
            JSON.stringify(expected.emulationSystemGroups) &&
          JSON.stringify(value.emulationPlatformMappings) ===
            JSON.stringify(expected.emulationPlatformMappings) &&
          value.steamApiKeyConfigured === expected.steamApiKeyConfigured;
        if (!matches(result) || !matches(readback)) {
          setNotice({
            text: t(
              'lumen.software.saveFailed',
              'Could not save software acquisition settings.'
            ),
            error: true,
          });
          return;
        }
        setSaved(readback);
        reset(readback);
        systems.reload();
        if (showPreview) preview.reload();
        setNotice({
          text: t(
            'lumen.software.saved',
            'Software acquisition settings saved.'
          ),
        });
      }
    } catch (failure) {
      setNotice({
        provider,
        text: friendlyError(
          failure,
          t(
            'lumen.software.operationFailed',
            'Software acquisition operation failed.'
          )
        ),
        error: true,
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void run();
      }}
    >
      {(['romarr', 'questarr'] as const).map((provider) => {
        const name = providers[provider];
        const draft = connections[provider];
        return (
          <Section title={name} key={provider}>
            <div className="setlist">
              <SavedConnectionHost
                disabled={busy}
                onSelect={(hostname) => edit(provider, { hostname })}
              />
              {(
                [
                  ['hostname', 'Hostname', 255],
                  ['baseUrl', 'Base Path', 512],
                ] as const
              ).map(([key, label, max]) => (
                <label className="set cfg-row" key={key}>
                  <span>
                    {name} {t(`lumen.software.${key}`, label)}
                  </span>
                  <input
                    className="cfg-input"
                    maxLength={max}
                    disabled={busy}
                    value={draft[key]}
                    onChange={(event) =>
                      edit(provider, { [key]: event.target.value })
                    }
                  />
                </label>
              ))}
              <label className="set cfg-row">
                <span>
                  {name} {t('lumen.software.port', 'Port')}
                </span>
                <input
                  className="cfg-input"
                  type="number"
                  min={1}
                  max={65535}
                  required
                  disabled={busy}
                  value={draft.port}
                  onChange={(event) =>
                    edit(provider, { port: event.target.value })
                  }
                />
              </label>
              <label className="set cfg-row">
                <span>
                  {t('lumen.software.useHttpsFor', 'Use HTTPS for')} {name}
                </span>
                <input
                  type="checkbox"
                  checked={draft.useSsl}
                  disabled={busy}
                  onChange={(event) =>
                    edit(provider, { useSsl: event.target.checked })
                  }
                />
              </label>
              <label className="set cfg-row">
                <span>
                  {name} {t('lumen.software.apiKey', 'API Key')}
                </span>
                <input
                  className="cfg-input"
                  type="password"
                  autoComplete="new-password"
                  maxLength={2048}
                  placeholder={
                    saved[provider].apiKeyConfigured
                      ? t('lumen.software.savedKey', 'Saved')
                      : undefined
                  }
                  disabled={busy || draft.clear}
                  value={draft.apiKey}
                  onChange={(event) =>
                    edit(provider, { apiKey: event.target.value })
                  }
                />
              </label>
              {saved[provider].apiKeyConfigured && (
                <label className="set cfg-row">
                  <span>
                    {t('lumen.software.removeSaved', 'Remove Saved')} {name}{' '}
                    {t('lumen.software.apiKey', 'API Key')}
                  </span>
                  <input
                    type="checkbox"
                    checked={draft.clear}
                    disabled={busy}
                    onChange={(event) =>
                      edit(provider, { clear: event.target.checked })
                    }
                  />
                </label>
              )}
            </div>
            <div className="toolbar">
              <button
                className="btn btn-tonal btn-sm"
                type="button"
                disabled={busy || !draft.hostname.trim() || draft.clear}
                onClick={() => void run(provider)}
              >
                {t('lumen.software.test', 'Test')} {name}{' '}
                {t('lumen.software.connection', 'Connection')}
              </button>
            </div>
            {notice?.provider === provider && (
              <p className="note" role={notice.error ? 'alert' : 'status'}>
                {notice.text}
              </p>
            )}
          </Section>
        );
      })}
      <Section title={t('lumen.software.catalog', 'Emulation Catalog')}>
        <div className="setlist">
          <label className="set cfg-row">
            <span>{t('lumen.software.catalogSource', 'Catalog Source')}</span>
            <select
              className="cfg-select"
              value={catalog}
              disabled={busy}
              onChange={(event) => setCatalog(event.target.value as Catalog)}
            >
              <option value="questarr">QuestarrNG</option>
              <option value="romarr">ROMarrNG IGDB</option>
              <option value="romarr-dat">ROMarrNG DAT</option>
            </select>
          </label>
        </div>
        <ServiceNote
          what={t('lumen.software.systems', 'supported systems')}
          error={systems.error}
          retry={systems.reload}
        />
        {!!systems.data?.unmatchedDatNames?.length && (
          <p className="note">
            {t(
              'lumen.software.unmatchedDat',
              'Unmatched DAT names include {names}.',
              {
                names: systems.data.unmatchedDatNames.join(', '),
              }
            )}
          </p>
        )}
        {systemList.length > 0 && (
          <>
            <div className="toolbar">
              {(['retro', 'modern'] as const).map((group) => (
                <button
                  key={group}
                  type="button"
                  className="btn btn-quiet btn-sm"
                  disabled={busy}
                  onClick={() =>
                    setGroups((previous) => ({
                      ...previous,
                      ...Object.fromEntries(
                        systemList.map((system) => [system.slug, group])
                      ),
                    }))
                  }
                >
                  {t('lumen.software.assignAll', 'Assign All to')}{' '}
                  {t(
                    `lumen.software.${group}`,
                    group === 'retro' ? 'Retro' : 'Modern'
                  )}
                </button>
              ))}
            </div>
            <div className="setlist">
              {systemList.map((system) => (
                <label className="set cfg-row" key={system.slug}>
                  <span>
                    {system.name} {t('lumen.software.group', 'Group')}
                  </span>
                  <select
                    className="cfg-select"
                    value={groups[system.slug] ?? ''}
                    disabled={busy}
                    onChange={(event) => {
                      const value = event.target.value as Group | '';
                      setGroups((previous) => {
                        const next = { ...previous };
                        if (value) next[system.slug] = value;
                        else delete next[system.slug];
                        return next;
                      });
                    }}
                  >
                    <option value="">
                      {t('lumen.software.unassigned', 'Unassigned')}
                    </option>
                    <option value="retro">
                      {t('lumen.software.retro', 'Retro')}
                    </option>
                    <option value="modern">
                      {t('lumen.software.modern', 'Modern')}
                    </option>
                  </select>
                </label>
              ))}
            </div>
          </>
        )}
      </Section>
      <Section
        title={t('lumen.software.platformMatching', 'IGDB Platform Matching')}
      >
        <div className="toolbar">
          <button
            className="btn btn-tonal btn-sm"
            type="button"
            disabled={busy || !saved.romarr.hostname}
            onClick={() =>
              showPreview ? preview.reload() : setShowPreview(true)
            }
          >
            {t('lumen.software.preview', 'Preview Platform Matches')}
          </button>
        </div>
        <ServiceNote
          what={t('lumen.error.what.platformMatches', 'platform matches')}
          error={preview.error}
          retry={preview.reload}
        />
        {showPreview && !preview.data && !preview.error && (
          <p className="note" role="status">
            {t('lumen.software.loadingMatches', 'Loading platform matches…')}
          </p>
        )}
        {preview.data && (
          <div className="setlist">
            {preview.data.systems.map((system) => {
              const platforms = preview.data?.catalogPlatforms ?? [];
              const selected = mappings[system.slug];
              return (
                <label className="set cfg-row" key={system.slug}>
                  <span>
                    {system.name} {t('lumen.software.platform', 'Platform')}
                  </span>
                  <select
                    className="cfg-select"
                    value={selected ?? ''}
                    disabled={busy}
                    onChange={(event) => {
                      const value = event.target.value;
                      setMappings((previous) => {
                        const next = { ...previous };
                        if (value) next[system.slug] = Number(value);
                        else delete next[system.slug];
                        return next;
                      });
                    }}
                  >
                    <option value="">
                      {system.automaticMatch
                        ? `Automatic · ${system.automaticMatch.name}`
                        : t(
                            'lumen.software.noAutomaticMatch',
                            'No Automatic Match'
                          )}
                    </option>
                    {selected &&
                      !platforms.some(({ id }) => id === selected) && (
                        <option value={selected}>
                          {t(
                            'lumen.software.savedPlatformUnavailable',
                            'Saved Platform {id} Unavailable',
                            { id: selected }
                          )}
                        </option>
                      )}
                    {platforms.map((platform) => (
                      <option key={platform.id} value={platform.id}>
                        {platform.name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        )}
      </Section>
      <Section
        title={t('lumen.software.steamImport', 'Steam Library Import')}
        id="steam-library-import"
      >
        <div className="setlist">
          <label className="set cfg-row">
            <span>{t('lumen.software.steamKey', 'Steam Web API Key')}</span>
            <input
              className="cfg-input"
              type="password"
              autoComplete="new-password"
              maxLength={2048}
              value={steamKey}
              placeholder={
                saved.steamApiKeyConfigured
                  ? t('lumen.software.savedKey', 'Saved')
                  : undefined
              }
              disabled={busy || removeSteam}
              onChange={(event) => setSteamKey(event.target.value)}
            />
          </label>
          {saved.steamApiKeyConfigured && (
            <label className="set cfg-row">
              <span>
                {t('lumen.software.removeSteamKey', 'Remove Saved Steam Key')}
              </span>
              <input
                type="checkbox"
                checked={removeSteam}
                disabled={busy}
                onChange={(event) => setRemoveSteam(event.target.checked)}
              />
            </label>
          )}
        </div>
      </Section>
      {notice && !notice.provider && (
        <p className="note" role={notice.error ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}
      <div className="toolbar">
        {dirty && (
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={busy}
            onClick={() => {
              reset(saved);
              setNotice(undefined);
            }}
          >
            {t('lumen.software.discard', 'Discard Changes')}
          </button>
        )}
        <button
          className="btn btn-primary btn-sm"
          type="submit"
          disabled={busy || !dirty}
        >
          {t('lumen.software.save', 'Save Changes')}
        </button>
      </div>
    </form>
  );
}

export default function AdminSoftwareAcquisition() {
  const { t } = useLumenLocale();
  const settings = useApi<Settings>(path);
  return (
    <>
      <header className="ph">
        <h1>{t('lumen.software.title', 'Software Acquisition')}</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin">
          {t('lumen.admin.title', 'Administration')}
        </Link>
      </div>
      <ServiceNote
        what={t('lumen.software.settings', 'software acquisition settings')}
        error={settings.error}
        retry={settings.reload}
      />
      {settings.data ? (
        <Editor initial={settings.data} />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            {t(
              'lumen.software.loading',
              'Loading software acquisition settings…'
            )}
          </p>
        )
      )}
    </>
  );
}

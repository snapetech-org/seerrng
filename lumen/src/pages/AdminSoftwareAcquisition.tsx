import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { SavedConnectionHost } from '../components/SavedConnectionHost';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';

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
            tested.capabilities?.catalog && 'IGDB catalog ready.',
            tested.capabilities?.datCatalog &&
              `DAT catalog ready for ${tested.datCatalogPlatformCount ?? 0} systems.`,
            tested.unmatchedDatNames?.length &&
              `Unmatched DAT names include ${tested.unmatchedDatNames.join(', ')}.`,
          ]
            .filter(Boolean)
            .join(' '),
        });
      } else {
        const result = await api<Settings>(path, {
          method: 'PUT',
          body: JSON.stringify({
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
          }),
        });
        setSaved(result);
        reset(result);
        systems.reload();
        if (showPreview) preview.reload();
        setNotice({ text: 'Software acquisition settings saved.' });
      }
    } catch (failure) {
      setNotice({
        provider,
        text: friendlyError(failure, 'Software acquisition operation failed.'),
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
                    {name} {label}
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
                <span>{name} Port</span>
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
                <span>Use HTTPS for {name}</span>
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
                <span>{name} API Key</span>
                <input
                  className="cfg-input"
                  type="password"
                  autoComplete="new-password"
                  maxLength={2048}
                  placeholder={
                    saved[provider].apiKeyConfigured ? 'Saved' : undefined
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
                  <span>Remove Saved {name} API Key</span>
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
                Test {name} Connection
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
      <Section title="Emulation Catalog">
        <div className="setlist">
          <label className="set cfg-row">
            <span>Catalog Source</span>
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
          what="supported systems"
          error={systems.error}
          retry={systems.reload}
        />
        {!!systems.data?.unmatchedDatNames?.length && (
          <p className="note">
            Unmatched DAT names include{' '}
            {systems.data.unmatchedDatNames.join(', ')}.
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
                  Assign All to {group === 'retro' ? 'Retro' : 'Modern'}
                </button>
              ))}
            </div>
            <div className="setlist">
              {systemList.map((system) => (
                <label className="set cfg-row" key={system.slug}>
                  <span>{system.name} Group</span>
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
                    <option value="">Unassigned</option>
                    <option value="retro">Retro</option>
                    <option value="modern">Modern</option>
                  </select>
                </label>
              ))}
            </div>
          </>
        )}
      </Section>
      <Section title="IGDB Platform Matching">
        <div className="toolbar">
          <button
            className="btn btn-tonal btn-sm"
            type="button"
            disabled={busy || !saved.romarr.hostname}
            onClick={() =>
              showPreview ? preview.reload() : setShowPreview(true)
            }
          >
            Preview Platform Matches
          </button>
        </div>
        <ServiceNote
          what="platform matches"
          error={preview.error}
          retry={preview.reload}
        />
        {showPreview && !preview.data && !preview.error && (
          <p className="note" role="status">
            Loading platform matches…
          </p>
        )}
        {preview.data && (
          <div className="setlist">
            {preview.data.systems.map((system) => {
              const platforms = preview.data?.catalogPlatforms ?? [];
              const selected = mappings[system.slug];
              return (
                <label className="set cfg-row" key={system.slug}>
                  <span>{system.name} Platform</span>
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
                        : 'No Automatic Match'}
                    </option>
                    {selected &&
                      !platforms.some(({ id }) => id === selected) && (
                        <option value={selected}>
                          Saved Platform {selected} Unavailable
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
      <Section title="Steam Library Import" id="steam-library-import">
        <div className="setlist">
          <label className="set cfg-row">
            <span>Steam Web API Key</span>
            <input
              className="cfg-input"
              type="password"
              autoComplete="new-password"
              maxLength={2048}
              value={steamKey}
              placeholder={saved.steamApiKeyConfigured ? 'Saved' : undefined}
              disabled={busy || removeSteam}
              onChange={(event) => setSteamKey(event.target.value)}
            />
          </label>
          {saved.steamApiKeyConfigured && (
            <label className="set cfg-row">
              <span>Remove Saved Steam Key</span>
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
            Discard Changes
          </button>
        )}
        <button
          className="btn btn-primary btn-sm"
          type="submit"
          disabled={busy || !dirty}
        >
          Save Changes
        </button>
      </div>
    </form>
  );
}

export default function AdminSoftwareAcquisition() {
  const settings = useApi<Settings>(path);
  return (
    <>
      <header className="ph">
        <h1>Software Acquisition</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin">
          Back to Administration
        </Link>
      </div>
      <ServiceNote
        what="software acquisition settings"
        error={settings.error}
        retry={settings.reload}
      />
      {settings.data ? (
        <Editor initial={settings.data} />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            Loading software acquisition settings…
          </p>
        )
      )}
    </>
  );
}

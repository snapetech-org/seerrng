import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';

const endpoint = '/settings/radarr';
interface Radarr {
  id?: number;
  name: string;
  hostname: string;
  port: number;
  apiKey: string;
  baseUrl?: string;
  externalUrl?: string;
  useSsl: boolean;
  activeProfileId: number;
  activeProfileName?: string;
  activeDirectory: string;
  isDefault?: boolean;
  is4k?: boolean;
  syncEnabled?: boolean;
  preventSearch?: boolean;
  tagRequests?: boolean;
  requestButtonAnimeOnly?: boolean;
  requestButtonLabel?: string;
  downloadQueueSize?: number;
  minimumAvailability?: string;
  tags?: number[];
  syncExcludedTags?: number[];
}
interface Options {
  profiles: { id: number; name: string }[];
  rootFolders: { id: number; path: string }[];
  tags: { id: number; label: string }[];
}

const empty: Radarr = {
  name: '',
  hostname: '',
  port: 7878,
  apiKey: '',
  useSsl: false,
  activeProfileId: 0,
  activeDirectory: '',
  minimumAvailability: 'released',
};
const connectionFields = [
  ['name', 'Service Name', 'text'],
  ['hostname', 'Hostname', 'text'],
  ['port', 'Port', 'number'],
  ['baseUrl', 'Base Path', 'text'],
  ['externalUrl', 'External URL', 'url'],
  ['apiKey', 'API Key', 'password'],
] as const;
const flags = [
  ['useSsl', 'Use HTTPS'],
  ['isDefault', 'Default Server'],
  ['is4k', '4K Server'],
  ['syncEnabled', 'Sync Library'],
  ['preventSearch', 'Skip Automatic Search'],
  ['tagRequests', 'Tag Requests'],
  ['requestButtonAnimeOnly', 'Show Request Button for Anime Only'],
] as const;

function RadarrForm({ initial, done }: { initial: Radarr; done: () => void }) {
  const [draft, setDraft] = useState({ ...initial, apiKey: '' });
  const [options, setOptions] = useState<Options>();
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const path =
    initial.id === undefined ? endpoint : `${endpoint}/${initial.id}`;
  const key = draft.apiKey || (initial.apiKey ? '[REDACTED]' : '');
  const connected =
    !!draft.hostname.trim() &&
    !!key &&
    Number.isInteger(draft.port) &&
    draft.port >= 1 &&
    draft.port <= 65535;
  const fieldsChanged =
    JSON.stringify(draft) !== JSON.stringify({ ...initial, apiKey: '' });
  const configurationValid =
    !!draft.name.trim() &&
    draft.activeProfileId > 0 &&
    !!draft.activeDirectory &&
    (!options ||
      (options.profiles.some(({ id }) => id === draft.activeProfileId) &&
        options.rootFolders.some(
          ({ path }) => path === draft.activeDirectory
        )));
  const optionsRequired =
    initial.id === undefined ||
    draft.hostname !== initial.hostname ||
    draft.port !== initial.port ||
    draft.baseUrl !== initial.baseUrl ||
    draft.useSsl !== initial.useSsl ||
    !!draft.apiKey;

  function change(patch: Partial<Radarr>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setFailure('');
    if (
      ['hostname', 'port', 'baseUrl', 'useSsl', 'apiKey'].some(
        (field) => field in patch
      )
    )
      setOptions(undefined);
  }

  async function run(action: () => Promise<void>, error: string) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFailure('');
    const generation = sessionGeneration();
    try {
      await action();
    } catch {
      if (generation === sessionGeneration()) setFailure(error);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function testConnection() {
    if (!connected) return;
    const generation = sessionGeneration();
    void run(async () => {
      const result = await api<Options>(`${endpoint}/test`, {
        method: 'POST',
        body: JSON.stringify({
          id: initial.id,
          hostname: draft.hostname,
          port: draft.port,
          apiKey: key,
          baseUrl: draft.baseUrl,
          useSsl: draft.useSsl,
        }),
      });
      if (generation === sessionGeneration()) setOptions(result);
    }, 'Could not test Radarr. Check the address and API key.');
  }

  function save() {
    if (!connected || !configurationValid || (optionsRequired && !options))
      return;
    const generation = sessionGeneration();
    void run(async () => {
      await api(path, {
        method: initial.id === undefined ? 'POST' : 'PUT',
        body: JSON.stringify({
          ...draft,
          minimumAvailability: draft.minimumAvailability ?? 'released',
          apiKey: key,
          activeProfileName:
            options?.profiles.find(({ id }) => id === draft.activeProfileId)
              ?.name ?? draft.activeProfileName,
        }),
      });
      if (generation === sessionGeneration()) done();
    }, 'Could not save the Radarr service.');
  }

  function remove() {
    if (!confirmation || initial.id === undefined) return;
    const generation = sessionGeneration();
    void run(async () => {
      await api(path, { method: 'DELETE' }, 'empty');
      if (generation === sessionGeneration()) done();
    }, 'Could not remove the Radarr service.');
  }

  return (
    <Section
      title={
        initial.id === undefined ? 'Add Radarr Service' : `Edit ${initial.name}`
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="setlist">
          {connectionFields.map(([field, label, type]) => (
            <label className="set cfg-row" key={field}>
              <span>{label}</span>
              <input
                className="cfg-input"
                type={type}
                disabled={busy}
                value={draft[field] ?? ''}
                placeholder={
                  field === 'apiKey' && initial.apiKey ? 'Saved key' : undefined
                }
                autoComplete={field === 'apiKey' ? 'new-password' : undefined}
                onChange={(event) =>
                  change({
                    [field]:
                      type === 'number'
                        ? Number(event.target.value)
                        : event.target.value,
                  })
                }
              />
            </label>
          ))}
          {flags.map(([field, label]) => (
            <label className="set cfg-row" key={field}>
              <span>{label}</span>
              <input
                type="checkbox"
                disabled={busy}
                checked={draft[field] === true}
                onChange={(event) => change({ [field]: event.target.checked })}
              />
            </label>
          ))}
          <label className="set cfg-row">
            <span>Minimum Availability</span>
            <select
              className="cfg-select"
              value={draft.minimumAvailability ?? 'released'}
              disabled={busy}
              onChange={(event) =>
                change({ minimumAvailability: event.target.value })
              }
            >
              <option value="announced">Announced</option>
              <option value="inCinemas">In Cinemas</option>
              <option value="released">Released</option>
            </select>
          </label>
          <label className="set cfg-row">
            <span>Download Queue Size</span>
            <input
              className="cfg-input"
              type="number"
              value={draft.downloadQueueSize ?? 1000}
              disabled={busy}
              onChange={(event) =>
                change({ downloadQueueSize: Number(event.target.value) })
              }
            />
          </label>
          <label className="set cfg-row">
            <span>Request Button Label</span>
            <input
              className="cfg-input"
              value={draft.requestButtonLabel ?? ''}
              disabled={busy}
              onChange={(event) =>
                change({ requestButtonLabel: event.target.value })
              }
            />
          </label>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy || !connected}
            onClick={testConnection}
          >
            Test Radarr
          </button>
        </div>
        {options && (
          <>
            <p className="note" role="status">
              Radarr connection verified.
            </p>
            <div className="setlist">
              <label className="set cfg-row">
                <span>Quality Profile</span>
                <select
                  className="cfg-select"
                  value={draft.activeProfileId}
                  disabled={busy}
                  onChange={(event) =>
                    change({ activeProfileId: Number(event.target.value) })
                  }
                >
                  <option value={0}>Choose a Profile</option>
                  {options.profiles.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="set cfg-row">
                <span>Root Folder</span>
                <select
                  className="cfg-select"
                  value={draft.activeDirectory}
                  disabled={busy}
                  onChange={(event) =>
                    change({ activeDirectory: event.target.value })
                  }
                >
                  <option value="">Choose a Folder</option>
                  {options.rootFolders.map(({ id, path }) => (
                    <option key={id} value={path}>
                      {path}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {(['tags', 'syncExcludedTags'] as const).map((field) => (
              <details key={field} className="adv">
                <summary>
                  {field === 'tags' ? 'Request Tags' : 'Exclude Tags From Sync'}
                </summary>
                <div className="setlist">
                  {options.tags.map(({ id, label }) => (
                    <label className="set cfg-row" key={id}>
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={draft[field]?.includes(id) ?? false}
                        onChange={(event) =>
                          change({
                            [field]: event.target.checked
                              ? [...(draft[field] ?? []), id]
                              : (draft[field]?.filter((tag) => tag !== id) ??
                                []),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </details>
            ))}
          </>
        )}
        {failure && (
          <p className="note" role="alert">
            {failure}
          </p>
        )}
        <div className="toolbar">
          <button
            className="btn btn-primary btn-sm"
            disabled={
              busy ||
              !connected ||
              !fieldsChanged ||
              !configurationValid ||
              (optionsRequired && !options)
            }
          >
            Save Radarr
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={done}
          >
            Cancel
          </button>
          {initial.id !== undefined && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => setConfirmation(true)}
            >
              Remove Service
            </button>
          )}
        </div>
        {confirmation && (
          <>
            <p className="note" role="alert">
              Remove {initial.name} as a request destination?
            </p>
            <div className="toolbar">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={remove}
              >
                Confirm Removal
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => setConfirmation(false)}
              >
                Keep Service
              </button>
            </div>
          </>
        )}
      </form>
    </Section>
  );
}

export default function AdminRadarr() {
  const services = useApi<Radarr[]>(endpoint);
  const [editing, setEditing] = useState<Radarr>();
  function done() {
    setEditing(undefined);
    services.reload();
  }
  return (
    <>
      <header className="ph">
        <h1>Radarr Services</h1>
        <div className="toolbar">
          <Link className="btn btn-quiet btn-sm" to="/me">
            Back to Account
          </Link>
        </div>
      </header>
      <ServiceNote
        error={services.error}
        what="Radarr services"
        retry={services.reload}
      />
      {editing ? (
        <RadarrForm key={editing.id ?? 'new'} initial={editing} done={done} />
      ) : services.data ? (
        <Section title="Configured Services">
          <div className="toolbar">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setEditing(empty)}
            >
              Add Radarr
            </button>
          </div>
          {services.data.length === 0 && (
            <p className="note">No Radarr services configured.</p>
          )}
          <div className="setlist">
            {services.data.map((service) => (
              <div className="set cfg-row" key={service.id}>
                <span>
                  <b>{service.name}</b>
                  <small>
                    {service.is4k ? '4K' : 'Standard'}
                    {service.isDefault ? ' · Default' : ''}
                  </small>
                </span>
                <button
                  className="btn btn-quiet btn-sm"
                  onClick={() => setEditing(service)}
                >
                  Edit {service.name}
                </button>
              </div>
            ))}
          </div>
        </Section>
      ) : (
        !services.error && (
          <p className="note" role="status">
            Loading Radarr services…
          </p>
        )
      )}
    </>
  );
}

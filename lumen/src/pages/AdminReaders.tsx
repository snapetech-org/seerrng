import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { SavedConnectionHost } from '../components/SavedConnectionHost';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';

type Provider = 'audiobookshelf' | 'kavita';
const names = { audiobookshelf: 'Audiobookshelf', kavita: 'Kavita' };
interface Settings {
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
  externalUrl?: string;
  name?: string;
  libraryId?: string;
  libraryName?: string;
  syncEnabled?: boolean;
}
interface Library {
  id: string | number;
  name: string;
}

function Connection({
  provider,
  initial,
}: {
  provider: Provider;
  initial: Settings | null;
}) {
  const { t } = useLumenLocale();
  const name = names[provider];
  const endpoint = `/settings/${provider}`;
  const audio = provider === 'audiobookshelf';
  const empty: Settings = {
    hostname: '',
    port: audio ? 13378 : 5000,
    apiKey: '',
    useSsl: false,
    ...(audio ? { name, syncEnabled: true } : {}),
  };
  const [libraries, setLibraries] = useState<Library[]>();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState({ ...(initial ?? empty), apiKey: '' });
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const apiKey = draft.apiKey || (saved?.apiKey ? '[REDACTED]' : '');
  const ready = !!(
    draft.hostname.trim() &&
    apiKey &&
    Number.isInteger(draft.port) &&
    draft.port > 0 &&
    draft.port <= 65535
  );
  const canSave =
    ready &&
    (!audio || !!(draft.name?.trim() && draft.libraryId && draft.libraryName));
  const available =
    libraries ??
    (saved?.libraryId && saved.libraryName
      ? [{ id: saved.libraryId, name: saved.libraryName }]
      : []);
  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify({ ...(saved ?? empty), apiKey: '' });

  function update(patch: Partial<Settings>) {
    setDraft((value) => ({ ...value, ...patch }));
    setError('');
    setNotice('');
  }

  function updateConnection(patch: Partial<Settings>) {
    setLibraries(undefined);
    update({ ...patch, libraryId: undefined, libraryName: undefined });
  }

  async function submit(action: 'test' | 'save' | 'disconnect') {
    if (
      pending.current ||
      (action === 'disconnect'
        ? !confirm
        : action === 'test'
          ? !ready
          : !canSave)
    )
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const generation = sessionGeneration();
    let writeAcknowledged = false;
    const body = JSON.stringify({
      ...draft,
      hostname: draft.hostname.trim(),
      apiKey,
    });
    try {
      if (action === 'test') {
        const response = await api<{ libraries: Library[] }>(
          endpoint + '/test',
          { method: 'POST', body }
        );
        if (generation !== sessionGeneration()) return;
        setLibraries(response.libraries);
        if (
          audio &&
          !response.libraries.some(({ id }) => id === draft.libraryId)
        )
          update({ libraryId: undefined, libraryName: undefined });
      } else {
        let next: Settings | null = null;
        if (action === 'save') {
          const written = await api<Settings>(endpoint, {
            method: 'PUT',
            body,
          });
          writeAcknowledged = true;
          const readback = await api<Settings | null>(endpoint);
          if (
            !readback ||
            JSON.stringify(written) !== JSON.stringify(readback) ||
            Object.entries(JSON.parse(body) as Record<string, unknown>).some(
              ([key, value]) =>
                key === 'apiKey'
                  ? written.apiKey !== '[REDACTED]'
                  : written[key as keyof Settings] !==
                    (key === 'hostname' && typeof value === 'string'
                      ? value.trim()
                      : value)
            )
          ) {
            setError(
              t(
                'lumen.adminReaders.actionFailed',
                'Could not complete the {service} action.',
                { service: name }
              )
            );
            return;
          }
          next = readback;
        } else {
          await api(endpoint, { method: 'DELETE' }, 'empty');
          writeAcknowledged = true;
          const readback = await api<Settings | null>(endpoint);
          if (readback !== null) {
            setError(
              t(
                'lumen.adminReaders.actionFailed',
                'Could not complete the {service} action.',
                { service: name }
              )
            );
            return;
          }
        }
        if (generation !== sessionGeneration()) return;
        setSaved(next);
        setDraft({ ...(next ?? empty), apiKey: '' });
        setConfirm(false);
        setLibraries(undefined);
      }
      if (generation === sessionGeneration()) {
        setNotice(
          action === 'test'
            ? t(
                'lumen.adminReaders.connectionVerified',
                '{service} connection verified.',
                { service: name }
              )
            : action === 'save'
              ? t(
                  'lumen.adminReaders.settingsSaved',
                  '{service} settings saved.',
                  { service: name }
                )
              : t(
                  'lumen.adminReaders.disconnected',
                  '{service} disconnected.',
                  { service: name }
                )
        );
      }
    } catch (failure) {
      if (generation === sessionGeneration())
        setError(
          writeAcknowledged
            ? t(
                'lumen.settings.confirmFailed',
                'The server accepted the change, but Lumen could not confirm the saved state. Keep this form open and retry.'
              )
            : failure instanceof ApiError
              ? failure.message
              : t(
                  'lumen.adminReaders.actionFailed',
                  'Could not complete the {service} action.',
                  { service: name }
                )
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section
      title={t('lumen.adminReaders.connection', '{service} Connection', {
        service: name,
      })}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (dirty) void submit('save');
        }}
      >
        <div className="setlist">
          <SavedConnectionHost
            disabled={busy}
            onSelect={(hostname) => updateConnection({ hostname })}
          />
          {audio && (
            <label className="set cfg-row">
              <span>{t('lumen.adminReaders.serviceName', 'Service Name')}</span>
              <input
                className="cfg-input"
                maxLength={128}
                disabled={busy}
                value={draft.name ?? ''}
                onChange={(event) => update({ name: event.target.value })}
              />
            </label>
          )}
          {(
            [
              ['hostname', t('lumen.adminReaders.hostname', 'Hostname')],
              ['baseUrl', t('lumen.adminReaders.basePath', 'Base Path')],
              [
                'externalUrl',
                t('lumen.adminReaders.externalUrl', 'External URL'),
              ],
            ] as const
          ).map(([key, label]) => (
            <label className="set cfg-row" key={key}>
              <span>{label}</span>
              <input
                className="cfg-input"
                disabled={busy}
                value={draft[key] ?? ''}
                onChange={(event) =>
                  key === 'externalUrl'
                    ? update({ externalUrl: event.target.value })
                    : updateConnection({ [key]: event.target.value })
                }
              />
            </label>
          ))}
          <label className="set cfg-row">
            <span>{t('lumen.adminReaders.port', 'Port')}</span>
            <input
              className="cfg-input"
              type="number"
              min={1}
              max={65535}
              disabled={busy}
              value={draft.port || ''}
              onChange={(event) =>
                updateConnection({ port: Number(event.target.value) })
              }
            />
          </label>
          <label className="set cfg-row">
            <span>{t('lumen.adminReaders.useHttps', 'Use HTTPS')}</span>
            <input
              type="checkbox"
              disabled={busy}
              checked={draft.useSsl}
              onChange={(event) =>
                updateConnection({ useSsl: event.target.checked })
              }
            />
          </label>
          <label className="set cfg-row">
            <span>{t('lumen.adminReaders.apiKey', 'API Key')}</span>
            <input
              className="cfg-input"
              type="password"
              autoComplete="new-password"
              disabled={busy}
              value={draft.apiKey}
              placeholder={
                saved?.apiKey
                  ? t('lumen.adminReaders.savedKey', 'Saved key')
                  : undefined
              }
              onChange={(event) =>
                updateConnection({ apiKey: event.target.value })
              }
            />
          </label>
          {audio && (
            <>
              <label className="set cfg-row">
                <span>
                  {t(
                    'lumen.adminReaders.audiobookLibrary',
                    'Audiobook Library'
                  )}
                </span>
                <select
                  className="cfg-select"
                  disabled={busy || !available.length}
                  value={draft.libraryId ?? ''}
                  onChange={(event) => {
                    const selection = available.find(
                      ({ id }) => id === event.target.value
                    );
                    update({
                      libraryId: selection ? String(selection.id) : undefined,
                      libraryName: selection?.name,
                    });
                  }}
                >
                  <option value="">
                    {t('lumen.adminReaders.chooseLibrary', 'Choose a Library')}
                  </option>
                  {available.map(({ id, name: label }) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="set cfg-row">
                <span>
                  {t(
                    'lumen.adminReaders.enableLibraryScan',
                    'Enable Library Scan'
                  )}
                </span>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={draft.syncEnabled ?? true}
                  onChange={(event) =>
                    update({ syncEnabled: event.target.checked })
                  }
                />
              </label>
            </>
          )}
        </div>
        {audio && !available.length && !libraries && (
          <p className="note">
            {t(
              'lumen.adminReaders.testToLoadLibraries',
              'Test the connection to load audiobook libraries.'
            )}
          </p>
        )}
        {libraries && (
          <p className="note" role="status">
            {libraries.length
              ? audio
                ? t(
                    'lumen.adminReaders.selectLibraryToScan',
                    'Select the audiobook library to scan.'
                  )
                : libraries.map(({ name: label }) => label).join(', ')
              : t(
                  'lumen.adminReaders.noCompatibleLibraries',
                  'No compatible libraries found.'
                )}
          </p>
        )}
        {notice && (
          <p className="note" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="note" role="alert">
            {error}
          </p>
        )}
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy || !ready}
            onClick={() => void submit('test')}
          >
            {t('lumen.adminReaders.testConnection', 'Test Connection')}
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={busy || !canSave || !dirty}
          >
            {t('lumen.adminReaders.saveChanges', 'Save Changes')}
          </button>
          {saved && !confirm && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => setConfirm(true)}
            >
              {t('lumen.adminReaders.disconnect', 'Disconnect')}
            </button>
          )}
        </div>
        {confirm && (
          <>
            <p className="note">
              {audio
                ? t(
                    'lumen.adminReaders.confirmDisconnectAudiobookshelf',
                    'Disconnect {service}? This removes availability and playback links supplied by this library.',
                    { service: name }
                  )
                : t(
                    'lumen.adminReaders.confirmDisconnect',
                    'Disconnect {service}?',
                    { service: name }
                  )}
            </p>
            <div className="toolbar">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => void submit('disconnect')}
              >
                {t(
                  'lumen.adminReaders.confirmDisconnectButton',
                  'Confirm Disconnect'
                )}
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                {t('lumen.adminReaders.keepConnection', 'Keep Connection')}
              </button>
            </div>
          </>
        )}
      </form>
    </Section>
  );
}

export default function AdminReaders({ provider }: { provider: Provider }) {
  const { t } = useLumenLocale();
  const name = names[provider];
  const endpoint = `/settings/${provider}`;
  const [settings, setSettings] = useState<Settings | null>();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const generation = sessionGeneration();
    const current = () =>
      !controller.signal.aborted && generation === sessionGeneration();
    api<Settings | null>(endpoint, { signal: controller.signal })
      .then((value) => {
        if (current()) setSettings(value);
      })
      .catch(() => {
        if (current())
          setError(
            t(
              'lumen.adminReaders.loadFailed',
              'Could not load the {service} connection.',
              { service: name }
            )
          );
      });
    return () => controller.abort();
  }, [attempt, endpoint, name, t]);
  return (
    <>
      <h1>
        {t('lumen.adminReaders.title', '{service} Settings', { service: name })}
      </h1>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin">
          {t('lumen.nav.administration', 'Administration')}
        </Link>
      </div>
      <ServiceNote
        what={`${name} settings`}
        title={t(
          'lumen.adminReaders.loadFailureTitle',
          'Couldn’t load {service} settings',
          { service: name }
        )}
        error={error}
        retryLabel={t('lumen.common.retry', 'Retry')}
        retry={() => {
          setError(null);
          setAttempt((value) => value + 1);
        }}
      />
      {settings !== undefined ? (
        <Connection provider={provider} initial={settings} />
      ) : (
        !error && (
          <p className="note" role="status">
            {t('lumen.adminReaders.loading', 'Loading {service} settings…', {
              service: name,
            })}
          </p>
        )
      )}
    </>
  );
}

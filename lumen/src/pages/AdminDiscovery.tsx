import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import AutomaticBlocklistSettings from '../components/AutomaticBlocklistSettings';
import CuratedIdentityPacks from '../components/CuratedIdentityPacks';
import DiscoveryRegionSettings from '../components/DiscoveryRegionSettings';
import StreamingRequestPolicy from '../components/StreamingRequestPolicy';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';

const path = '/integrations/discovery/configuration';
const providers = [
  { id: 'trakt', name: 'Trakt', fields: ['clientId'] },
  { id: 'anilist', name: 'AniList', fields: ['clientId', 'clientSecret'] },
  { id: 'simkl', name: 'Simkl', fields: ['clientId'] },
  { id: 'mdblist', name: 'MDBList', fields: ['apiKey'] },
] as const;
const labels = {
  clientId: 'Client ID',
  clientSecret: 'Client Secret',
  apiKey: 'API Key',
};
type Configuration = Record<
  (typeof providers)[number]['id'],
  { clientId?: string; configured: boolean }
>;
type Changes = Record<string, Record<string, string>>;

function DiscoveryForm({ initial }: { initial: Configuration }) {
  const { t } = useLumenLocale();
  const [current, setCurrent] = useState(initial);
  const [changes, setChanges] = useState<Changes>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const dirty = Object.keys(changes).length > 0;

  function stage(provider: string, fields: Record<string, string>) {
    setChanges((previous) => ({
      ...previous,
      [provider]: { ...previous[provider], ...fields },
    }));
    setSaved(false);
    setFailure('');
  }

  async function save() {
    if (!dirty || pending.current) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setFailure('');
    let writeAcknowledged = false;
    try {
      const updated = await api<Configuration>(path, {
        method: 'PUT',
        body: JSON.stringify(changes),
      });
      writeAcknowledged = true;
      if (generation !== sessionGeneration()) return;
      const readback = await api<Configuration>(path);
      if (generation !== sessionGeneration()) return;
      const confirmed = providers.every(({ id }) => {
        const submitted = changes[id];
        if (!submitted) return true;
        const writeState = updated[id];
        const persistedState = readback[id];
        const clientId = submitted.clientId ?? current[id].clientId ?? '';
        const expectedConfigured = (() => {
          if (id === 'anilist') {
            if (submitted.clientSecret !== undefined)
              return Boolean(clientId) && Boolean(submitted.clientSecret);
            if (!clientId) return false;
            return current[id].clientId ? current[id].configured : undefined;
          }
          if (id === 'mdblist')
            return submitted.apiKey !== undefined
              ? Boolean(submitted.apiKey)
              : current[id].configured;
          return Boolean(clientId);
        })();
        return (
          (expectedConfigured === undefined
            ? writeState.configured === persistedState.configured
            : writeState.configured === expectedConfigured &&
              persistedState.configured === expectedConfigured) &&
          (submitted.clientId === undefined ||
            (writeState.clientId === clientId &&
              persistedState.clientId === clientId))
        );
      });
      if (!confirmed) {
        setFailure(
          t(
            'lumen.adminDiscovery.saveFailure',
            'Could not save discovery credentials. Try again.'
          )
        );
        return;
      }
      setCurrent(readback);
      setChanges({});
      setSaved(true);
    } catch (error) {
      if (generation !== sessionGeneration()) return;
      setFailure(
        writeAcknowledged
          ? t(
              'lumen.adminDiscovery.confirmFailure',
              'Could not confirm the saved discovery credentials. Try again.'
            )
          : error instanceof ApiError && error.status === 403
            ? t(
                'lumen.adminDiscovery.forbidden',
                'You do not have permission to change integration credentials.'
              )
            : t(
                'lumen.adminDiscovery.saveFailure',
                'Could not save discovery credentials. Try again.'
              )
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {providers.map(({ id, name, fields }) => (
        <Section
          key={id}
          title={t(`lumen.adminDiscovery.provider.${id}`, name)}
        >
          <p className="note">
            {current[id].configured
              ? t('lumen.adminDiscovery.configured', 'Configured')
              : t('lumen.adminDiscovery.unconfigured', 'Not configured')}
          </p>
          <div className="setlist">
            {fields.map((field) => {
              const secret = field !== 'clientId';
              const fieldId = `discovery-${id}-${field}`;
              return (
                <label key={field} className="set cfg-row" htmlFor={fieldId}>
                  <span>
                    {t(`lumen.adminDiscovery.field.${field}`, labels[field])}
                  </span>
                  <input
                    id={fieldId}
                    className="cfg-input"
                    type={secret ? 'password' : 'text'}
                    autoComplete={secret ? 'new-password' : 'off'}
                    maxLength={4096}
                    disabled={busy}
                    value={
                      changes[id]?.[field] ??
                      (secret ? '' : (current[id].clientId ?? ''))
                    }
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!secret || value) stage(id, { [field]: value });
                      else {
                        setChanges((previous) => {
                          const next = { ...previous };
                          const fields = { ...next[id] };
                          delete fields[field];
                          if (Object.keys(fields).length) next[id] = fields;
                          else delete next[id];
                          return next;
                        });
                        setFailure('');
                      }
                    }}
                  />
                </label>
              );
            })}
          </div>
          <div className="toolbar">
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() =>
                stage(
                  id,
                  Object.fromEntries(fields.map((field) => [field, '']))
                )
              }
            >
              {t('lumen.adminDiscovery.clear', 'Clear {provider} credentials', {
                provider: t(`lumen.adminDiscovery.provider.${id}`, name),
              })}
            </button>
          </div>
        </Section>
      ))}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {saved && (
        <p className="note" role="status">
          {t('lumen.adminDiscovery.saved', 'Discovery credentials saved.')}
        </p>
      )}
      <div className="toolbar">
        <button className="btn btn-primary btn-sm" disabled={busy || !dirty}>
          {busy
            ? t('lumen.adminDiscovery.saving', 'Saving…')
            : t('lumen.adminDiscovery.save', 'Save Discovery Credentials')}
        </button>
      </div>
    </form>
  );
}

export default function AdminDiscovery() {
  const { t } = useLumenLocale();
  const settings = useApi<Configuration>(path);
  return (
    <>
      <header className="ph">
        <h1>{t('lumen.adminDiscovery.title', 'Discovery Integrations')}</h1>
        <div className="toolbar">
          <Link className="btn btn-quiet btn-sm" to="/admin">
            {t('lumen.admin.title', 'Administration')}
          </Link>
        </div>
      </header>
      <ServiceNote
        error={settings.error}
        what={t('lumen.adminDiscovery.credentials', 'discovery credentials')}
        retry={settings.reload}
      />
      {settings.data ? (
        <>
          <p className="note">
            {t(
              'lumen.adminDiscovery.help',
              'Enter new credentials or use Clear to remove a provider’s saved credentials. Select Save to apply changes.'
            )}
          </p>
          <DiscoveryForm initial={settings.data} />
        </>
      ) : (
        !settings.error && (
          <p className="note" role="status">
            {t(
              'lumen.adminDiscovery.loading',
              'Loading discovery credentials…'
            )}
          </p>
        )
      )}
      <DiscoveryRegionSettings />
      <AutomaticBlocklistSettings />
      <StreamingRequestPolicy />
      <CuratedIdentityPacks />
    </>
  );
}

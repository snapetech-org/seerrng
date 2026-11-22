import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import MetadataCredentials from '../components/MetadataCredentials';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';

const path = '/settings/metadatas';
const providerNames = {
  tmdb: 'The Movie Database',
  tvdb: 'TheTVDB',
  musicbrainz: 'MusicBrainz',
  coverartarchive: 'Cover Art Archive',
};
type Provider = keyof typeof providerNames;
type Status = 'ok' | 'not tested' | 'failed';
type Statuses = Partial<Record<Provider, Status>>;
type Values = Record<string, string>;
type Field = { key: string; label: string; max?: number };
type Configuration = {
  title: string;
  endpoint: string;
  help: string;
  fields: Field[];
  providers?: Provider[];
  read: (settings: Record<string, unknown>) => Values;
  payload: (draft: Values) => object | null;
};
const videoFields = [
  { key: 'tv', label: 'TV Metadata Provider' },
  { key: 'anime', label: 'Anime Metadata Provider' },
];
const musicFields = [
  {
    key: 'maxConcurrentRequests',
    label: 'Maximum Concurrent Requests',
    max: 5,
  },
  {
    key: 'maxRequestsPerSecond',
    label: 'Maximum Requests per Second',
    max: 50,
  },
];
const configurations: Configuration[] = [
  {
    title: 'TV and Anime',
    endpoint: path,
    help: 'Choose the metadata provider for TV and anime.',
    fields: videoFields,
    providers: ['tmdb', 'tvdb'],
    read: (settings) => ({
      tv: String(settings.tv),
      anime: String(settings.anime),
    }),
    payload: (draft) => draft,
  },
  {
    title: 'Music Metadata',
    endpoint: `${path}/music`,
    help: 'Set Cover Art Archive request limits and test both music providers.',
    fields: musicFields,
    providers: ['musicbrainz', 'coverartarchive'],
    read: (settings) =>
      Object.fromEntries(
        musicFields.map(({ key }) => [key, String(settings[key])])
      ),
    payload: (draft) => {
      const values = Object.fromEntries(
        musicFields.map(({ key }) => [key, Number(draft[key])])
      );
      return musicFields.every(
        ({ key, max }) =>
          Number.isSafeInteger(values[key]) &&
          values[key] >= 1 &&
          values[key] <= max!
      )
        ? values
        : null;
    },
  },
  {
    title: 'Book Language Restrictions',
    endpoint: `${path}/books`,
    help: 'Enter up to 50 comma-separated three-letter language codes, such as eng, fre, or ger. Leave blank to allow all languages. Restricted requests require a verified edition in an allowed language.',
    fields: [{ key: 'languages', label: 'Allowed Book Languages' }],
    read: (settings) => ({
      languages: (settings.allowedLanguages as string[]).join(', '),
    }),
    payload: ({ languages }) => {
      const codes = languages.trim()
        ? languages.split(',').map((code) => code.trim().toLowerCase())
        : [];
      return codes.length <= 50 &&
        codes.every((code) => /^[a-z]{3}$/.test(code))
        ? { allowedLanguages: codes }
        : null;
    },
  },
];

function statusValues(result: unknown, providers: Provider[]): Statuses {
  if (!result || typeof result !== 'object') return {};
  const tests = result as Record<string, unknown>;
  const statuses: Statuses = {};
  for (const key of providers) {
    const value = tests[key];
    if (value === 'ok' || value === 'failed' || value === 'not tested')
      statuses[key] = value;
  }
  return statuses;
}

function MetadataForm({
  config,
  initial,
}: {
  config: Configuration;
  initial: Values;
}) {
  const { t } = useLumenLocale();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const [statuses, setStatuses] = useState<Statuses>({});
  const pending = useRef(false);
  const changed = config.fields.some(({ key }) => draft[key] !== saved[key]);
  const payload = config.payload(draft);
  const providers = config.providers ?? [];
  const video = config.endpoint === path;

  async function submit(test: boolean) {
    if (pending.current || (!test && (!changed || !payload))) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    if (test || video) setStatuses({});
    try {
      const body = test
        ? Object.fromEntries(
            providers.map((key) => [
              key,
              !video || draft.tv === key || draft.anime === key,
            ])
          )
        : payload;
      const response = await api<Record<string, unknown>>(
        test ? `${path}/test` : config.endpoint,
        {
          method: test ? 'POST' : 'PUT',
          body: JSON.stringify(body),
        }
      );
      if (generation !== sessionGeneration()) return;
      if (test || video) setStatuses(statusValues(response.tests, providers));
      if (!test) {
        const values = config.read(response);
        setSaved(values);
        setDraft(values);
        setNotice(t('lumen.metadata.saved', 'Settings saved.'));
      }
    } catch (error) {
      if (generation !== sessionGeneration()) return;
      if (error instanceof ApiError && (test || video))
        setStatuses(statusValues(error.testResults, providers));
      setFailure(
        friendlyError(
          error,
          test
            ? t(
                'lumen.metadata.testFailed',
                'Could not test metadata providers.'
              )
            : t(
                'lumen.metadata.saveFailed',
                'Could not save metadata settings.'
              )
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
        void submit(false);
      }}
    >
      <div className="setlist">
        {config.fields.map(({ key, label, max }) => {
          const id = `metadata-${key}`;
          const value = draft[key];
          function change(newValue: string) {
            setDraft((previous) => ({ ...previous, [key]: newValue }));
            setFailure('');
            setNotice('');
            if (video) setStatuses({});
          }
          return (
            <label className="set cfg-row" htmlFor={id} key={key}>
              <span>{t(`lumen.metadata.field.${key}`, label)}</span>
              {video ? (
                <select
                  id={id}
                  className="cfg-select"
                  value={value}
                  disabled={busy}
                  onChange={(event) => change(event.target.value)}
                >
                  <option value="tmdb">{providerNames.tmdb}</option>
                  <option value="tvdb">{providerNames.tvdb}</option>
                </select>
              ) : (
                <input
                  id={id}
                  className="cfg-input"
                  type={max ? 'number' : 'text'}
                  min={max ? 1 : undefined}
                  max={max}
                  value={value}
                  disabled={busy}
                  onChange={(event) => change(event.target.value)}
                />
              )}
            </label>
          );
        })}
        {providers.map((provider) => (
          <div className="set" key={provider}>
            <b>{providerNames[provider]}</b>
            <span aria-live="polite">
              {statuses[provider] === 'ok'
                ? t('lumen.metadata.connected', 'Connected')
                : statuses[provider] === 'failed'
                  ? t('lumen.metadata.failed', 'Failed')
                  : t('lumen.metadata.notTested', 'Not Tested')}
            </span>
          </div>
        ))}
      </div>
      {changed && !payload && (
        <p className="note" role="alert">
          {t(
            'lumen.metadata.invalidValues',
            'Enter values within the supported ranges or language format.'
          )}
        </p>
      )}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      <div className="toolbar">
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || !changed || !payload}
        >
          {t('lumen.metadata.save', 'Save')}{' '}
          {t(
            `lumen.metadata.section.${config.endpoint === path ? 'video' : config.endpoint.endsWith('/music') ? 'music' : 'books'}`,
            config.title
          )}
        </button>
        {providers.length > 0 && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={() => void submit(true)}
          >
            {t('lumen.metadata.test', 'Test')}{' '}
            {t(
              `lumen.metadata.section.${config.endpoint === path ? 'video' : 'music'}`,
              config.title
            )}{' '}
            {t('lumen.metadata.providers', 'Providers')}
          </button>
        )}
      </div>
    </form>
  );
}

function MetadataSection({ config }: { config: Configuration }) {
  const { t } = useLumenLocale();
  const { data, error, reload } = useApi<Record<string, unknown>>(
    config.endpoint
  );
  return (
    <Section
      title={t(
        `lumen.metadata.section.${config.endpoint === path ? 'video' : config.endpoint.endsWith('/music') ? 'music' : 'books'}`,
        config.title
      )}
    >
      <p className="note">{config.help}</p>
      <ServiceNote error={error} what={config.title} retry={reload} />
      {data ? (
        <MetadataForm config={config} initial={config.read(data)} />
      ) : (
        !error && (
          <p className="note" role="status">
            Loading settings…
          </p>
        )
      )}
    </Section>
  );
}

export default function AdminMetadata() {
  const { t } = useLumenLocale();
  return (
    <>
      <header className="ph">
        <h1>{t('lumen.metadata.title', 'Metadata Providers')}</h1>
        <div className="toolbar">
          <Link className="btn btn-quiet btn-sm" to="/admin">
            {t('lumen.admin.back', 'Administration')}
          </Link>
        </div>
      </header>
      {configurations.map((config) => (
        <MetadataSection config={config} key={config.endpoint} />
      ))}
      <MetadataCredentials />
      <Section
        title={t('lumen.metadata.bookshelfCatalog', 'Bookshelf Catalog')}
      >
        <p className="note">
          {t(
            'lumen.metadata.bookshelfCatalogHelp',
            'Hardcover access is configured on the connected BookshelfNG or rreading-glasses server. Shared hosted endpoints manage their own upstream credentials.'
          )}
        </p>
      </Section>
    </>
  );
}

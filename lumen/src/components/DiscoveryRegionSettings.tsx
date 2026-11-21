import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { forget } from '../apiCache';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { invalidatePublicSettings } from '../mediaServer';
import { Section } from './cards';
import { ServiceNote } from './extra';

const endpoint = '/settings/main';
const fields = [
  ['discoverRegion', 'Discover Region', 'region'],
  ['streamingRegion', 'Streaming Region', 'region'],
  ['originalLanguage', 'Original Language', 'language'],
  ['blocklistRegion', 'Blocklist Region', 'region'],
  ['blocklistLanguage', 'Blocklist Language', 'language'],
] as const;

const visibility = [
  ['includeAdult', 'Include Adult Content in TMDB Search and Discovery'],
  ['hideAvailable', 'Hide Available Titles'],
  ['hideRequested', 'Hide Requested Titles'],
  ['hideBlocklisted', 'Hide Blocklisted Titles From Blocklist Managers'],
] as const;

type Field = (typeof fields)[number][0];
type Visibility = (typeof visibility)[number][0];
type Values = Partial<Record<Field, string> & Record<Visibility, boolean>>;
type Region = { iso_3166_1: string; english_name: string };
type Language = { iso_639_1: string; english_name: string };

function SettingsForm({ initial }: { initial: Values }) {
  const { t } = useLumenLocale();
  const regions = useApi<Region[]>('/regions');
  const languages = useApi<Language[]>('/languages');
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const changes = [
    ...fields.flatMap(([key]) =>
      (draft[key] ?? '') === (saved[key] ?? '')
        ? []
        : [[key, draft[key] ?? ''] as const]
    ),
    ...visibility.flatMap(([key]) =>
      Boolean(draft[key]) === Boolean(saved[key])
        ? []
        : [[key, Boolean(draft[key])] as const]
    ),
  ];
  const byName = (a: readonly [string, string], b: readonly [string, string]) =>
    a[1].localeCompare(b[1]);
  const choices = {
    region: (Array.isArray(regions.data) ? regions.data : [])
      .map(
        ({ iso_3166_1, english_name }) => [iso_3166_1, english_name] as const
      )
      .sort(byName),
    language: (Array.isArray(languages.data) ? languages.data : [])
      .map(({ iso_639_1, english_name }) => [iso_639_1, english_name] as const)
      .sort(byName),
  };

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !changes.length) return;
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<Values>(endpoint, {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(changes)),
      });
      if (changes.some(([key, value]) => result[key] !== value))
        throw new Error(
          t(
            'lumen.discoveryRegions.confirmFailure',
            'Could not confirm the saved discovery settings.'
          )
        );
      setSaved(result);
      setDraft(result);
      invalidatePublicSettings();
      forget('/settings/public');
      forget(endpoint);
      setNotice(
        t('lumen.discoveryRegions.saved', 'Discovery region settings saved.')
      );
    } catch (error) {
      setFailure(
        friendlyError(
          error,
          t(
            'lumen.discoveryRegions.saveFailure',
            'Could not save discovery region settings.'
          ),
          t
        )
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)}>
      <ServiceNote
        error={regions.error}
        what={t('lumen.discoveryRegions.regions', 'regions')}
        retry={regions.reload}
      />
      <ServiceNote
        error={languages.error}
        what={t('lumen.discoveryRegions.languages', 'languages')}
        retry={languages.reload}
      />
      <div className="setlist">
        {fields.map(([key, label, kind]) => {
          const value = draft[key] ?? '';
          const list = choices[kind];
          const previous = saved[key];
          return (
            <label className="set cfg-row" key={key}>
              <b>{t(`lumen.discoveryRegions.field.${key}`, label)}</b>
              <select
                className="cfg-input"
                aria-label={t(`lumen.discoveryRegions.field.${key}`, label)}
                value={value}
                disabled={busy || !list.length}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }));
                  setNotice('');
                  setFailure('');
                }}
              >
                <option value="">
                  {t(
                    `lumen.discoveryRegions.any.${kind}`,
                    kind === 'region' ? 'Any region' : 'Any language'
                  )}
                </option>
                {previous && !list.some(([code]) => code === previous) && (
                  <option value={previous}>{previous}</option>
                )}
                {list.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
        {visibility.map(([key, label]) => (
          <label className="set cfg-row" key={key}>
            <b>{t(`lumen.discoveryRegions.visibility.${key}`, label)}</b>
            <input
              type="checkbox"
              aria-label={t(`lumen.discoveryRegions.visibility.${key}`, label)}
              checked={draft[key] === true}
              disabled={busy}
              onChange={(event) => {
                const checked = event.target.checked;
                setDraft((current) => ({ ...current, [key]: checked }));
                setNotice('');
                setFailure('');
              }}
            />
          </label>
        ))}
      </div>
      <div className="toolbar">
        <button
          className="btn btn-tonal btn-sm"
          disabled={busy || !changes.length}
        >
          {t('lumen.discoveryRegions.save', 'Save Discovery Region Settings')}
        </button>
      </div>
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
    </form>
  );
}

export default function DiscoveryRegionSettings() {
  const { t } = useLumenLocale();
  const settings = useApi<Values>(endpoint);
  return (
    <Section
      title={t(
        'lumen.discoveryRegions.title',
        'Discovery Regions and Languages'
      )}
    >
      <ServiceNote
        error={settings.error}
        what={t('lumen.discoveryRegions.settings', 'discovery region settings')}
        retry={settings.reload}
      />
      {settings.data ? (
        <SettingsForm initial={settings.data} />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            {t(
              'lumen.discoveryRegions.loading',
              'Loading discovery region settings…'
            )}
          </p>
        )
      )}
    </Section>
  );
}

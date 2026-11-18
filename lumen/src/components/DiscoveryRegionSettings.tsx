import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { forget } from '../apiCache';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
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

type Field = (typeof fields)[number][0];
type Values = Partial<Record<Field, string>>;
type Region = { iso_3166_1: string; english_name: string };
type Language = { iso_639_1: string; english_name: string };

function SettingsForm({ initial }: { initial: Values }) {
  const regions = useApi<Region[]>('/regions');
  const languages = useApi<Language[]>('/languages');
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const changed = fields.filter(
    ([key]) => (draft[key] ?? '') !== (saved[key] ?? '')
  );
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
    if (pending.current || !changed.length) return;
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<Values>(endpoint, {
        method: 'POST',
        body: JSON.stringify(
          Object.fromEntries(changed.map(([key]) => [key, draft[key] ?? '']))
        ),
      });
      if (changed.some(([key]) => (result[key] ?? '') !== (draft[key] ?? '')))
        throw new Error('Could not confirm the saved discovery settings.');
      setSaved(result);
      setDraft(result);
      invalidatePublicSettings();
      forget('/settings/public');
      forget(endpoint);
      setNotice('Discovery region settings saved.');
    } catch (error) {
      setFailure(
        friendlyError(error, 'Could not save discovery region settings.')
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
        what="regions"
        retry={regions.reload}
      />
      <ServiceNote
        error={languages.error}
        what="languages"
        retry={languages.reload}
      />
      <div className="setlist">
        {fields.map(([key, label, kind]) => {
          const value = draft[key] ?? '';
          const list = choices[kind];
          const previous = saved[key];
          return (
            <label className="set cfg-row" key={key}>
              <b>{label}</b>
              <select
                className="cfg-input"
                aria-label={label}
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
                <option value="">Any {kind}</option>
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
      </div>
      <div className="toolbar">
        <button
          className="btn btn-tonal btn-sm"
          disabled={busy || !changed.length}
        >
          Save Discovery Region Settings
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
  const settings = useApi<Values>(endpoint);
  return (
    <Section title="Discovery Regions and Languages">
      <ServiceNote
        error={settings.error}
        what="discovery region settings"
        retry={settings.reload}
      />
      {settings.data ? (
        <SettingsForm initial={settings.data} />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            Loading discovery region settings…
          </p>
        )
      )}
    </Section>
  );
}

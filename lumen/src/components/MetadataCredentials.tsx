import { Fragment, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { forget } from '../apiCache';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { Section } from './cards';
import { ServiceNote } from './extra';

const endpoint = '/settings/main';
const fields = [
  ['comicVineApiKey', 'ComicVine API Key'],
  ['metronToken', 'Metron API Token'],
  ['googleBooksApiKey', 'Google Books API Key'],
  ['youtubeApiKey', 'YouTube Data API Key'],
] as const;
type Field = (typeof fields)[number][0];
type Settings = Partial<Record<Field, string>>;
type Draft = { value: string; remove: boolean };
const empty: Draft = { value: '', remove: false };

function CredentialsForm({ initial }: { initial: Settings }) {
  const { t } = useLumenLocale();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<Partial<Record<Field, Draft>>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const changes = fields.flatMap(([key]) => {
    const { value, remove } = draft[key] ?? empty;
    return remove || value.trim()
      ? [[key, remove ? '' : value.trim()] as const]
      : [];
  });

  function update(key: Field, value: Draft) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice('');
    setError('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !changes.length) return;
    pending.current = true;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      const result = await api<Settings>(endpoint, {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(changes)),
      });
      if (
        changes.some(([key, value]) => Boolean(result[key]) !== Boolean(value))
      ) {
        throw new Error('Could not confirm the saved credentials.');
      }
      setSaved(result);
      setDraft({});
      forget(endpoint);
      setNotice(
        t('lumen.metadata.credentialsSaved', 'Metadata credentials saved.')
      );
    } catch (error) {
      setError(
        friendlyError(
          error,
          t(
            'lumen.metadata.credentialsSaveFailed',
            'Could not save metadata credentials.'
          )
        )
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)}>
      <div className="setlist">
        {fields.map(([key, label]) => {
          const field = draft[key] ?? empty;
          return (
            <Fragment key={key}>
              <label className="set cfg-row">
                <span>
                  <b>{label}</b>
                </span>
                <input
                  className="cfg-input"
                  aria-label={label}
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    saved[key]
                      ? t('lumen.metadata.savedCredential', 'Saved credential')
                      : undefined
                  }
                  value={field.value}
                  disabled={busy || field.remove}
                  maxLength={512}
                  onChange={(event) =>
                    update(key, { ...field, value: event.target.value })
                  }
                />
              </label>
              {saved[key] && (
                <label className="set cfg-row">
                  <b>
                    {t('lumen.metadata.removeSaved', 'Remove saved')} {label}
                  </b>
                  <input
                    type="checkbox"
                    checked={field.remove}
                    disabled={busy}
                    onChange={(event) =>
                      update(key, { ...field, remove: event.target.checked })
                    }
                  />
                </label>
              )}
            </Fragment>
          );
        })}
      </div>
      <div className="toolbar">
        <button
          className="btn btn-tonal btn-sm"
          disabled={busy || !changes.length}
        >
          {t('lumen.metadata.saveCredentials', 'Save Metadata Credentials')}
        </button>
      </div>
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
    </form>
  );
}

export default function MetadataCredentials() {
  const { t } = useLumenLocale();
  const { data, error, reload } = useApi<Settings>(endpoint);
  return (
    <Section title={t('lumen.metadata.credentials', 'Metadata Credentials')}>
      <ServiceNote error={error} what="metadata credentials" retry={reload} />
      {data ? (
        <CredentialsForm initial={data} />
      ) : (
        !error && (
          <p className="note" role="status">
            {t('lumen.metadata.loadingCredentials', 'Loading credentials…')}
          </p>
        )
      )}
    </Section>
  );
}

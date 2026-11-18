import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { forget } from '../apiCache';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { Section } from './cards';
import { ServiceNote } from './extra';
import { KeywordResults } from './SubjectTagFilter';

const endpoint = '/settings/main';
const defaults = {
  blocklistedTags: '',
  blocklistedGenresMovie: '',
  blocklistedGenresTv: '',
  blocklistedTagsLimit: 50,
};
type Settings = typeof defaults;
const keys = Object.keys(defaults) as (keyof Settings)[];

function GenreField({
  kind,
  value,
  disabled,
  onChange,
}: {
  kind: 'movie' | 'tv';
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const genres = useApi<{ id: number; name: string }[]>(`/genres/${kind}`);
  const selected = value ? value.split(',') : [];
  const catalog = Array.isArray(genres.data) ? genres.data : [];
  return (
    <>
      <ServiceNote error={genres.error} what="genres" retry={genres.reload} />
      <label className="set cfg-row">
        <b>
          {kind === 'movie'
            ? 'Blocklisted Movie Genres'
            : 'Blocklisted TV Genres'}
        </b>
        <select
          multiple
          size={5}
          value={selected}
          disabled={disabled || !Array.isArray(genres.data)}
          onChange={(event) =>
            onChange(
              Array.from(
                event.target.selectedOptions,
                (option) => option.value
              ).join(',')
            )
          }
        >
          {selected
            .filter((id) => !catalog.some((genre) => String(genre.id) === id))
            .map((id) => (
              <option key={id} value={id}>
                Genre #{id}
              </option>
            ))}
          {catalog.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function SettingsForm({ initial }: { initial: Settings }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [pages, setPages] = useState(String(initial.blocklistedTagsLimit));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const [keywordInput, setKeywordInput] = useState('');
  const [keywordQuery, setKeywordQuery] = useState('');
  const [keywordPage, setKeywordPage] = useState(1);
  function findKeywords() {
    setKeywordQuery(keywordInput.trim());
    setKeywordPage(1);
  }
  const tags = draft.blocklistedTags.trim()
    ? draft.blocklistedTags.split(',').map((tag) => tag.trim())
    : [];
  const validTags =
    tags.length <= 100 &&
    tags.every(
      (tag) =>
        /^\d{1,10}$/.test(tag) &&
        Number(tag) >= 1 &&
        Number(tag) <= 1_000_000_000
    );
  const selectedTags = [...new Set(tags)];
  const validPages = /^\d+$/.test(pages) && Number(pages) <= 250;
  const values: Settings = {
    ...draft,
    blocklistedTags: selectedTags.join(','),
    blocklistedTagsLimit: Number(pages),
  };
  const changes = keys.filter((key) => values[key] !== saved[key]);

  function change(
    key: 'blocklistedTags' | 'blocklistedGenresMovie' | 'blocklistedGenresTv',
    value: string
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice('');
    setFailure('');
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending.current || !validTags || !validPages || !changes.length) return;
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<Partial<Settings>>(endpoint, {
        method: 'POST',
        body: JSON.stringify(
          Object.fromEntries(changes.map((key) => [key, values[key]]))
        ),
      });
      if (changes.some((key) => result[key] !== values[key]))
        throw new Error('Could not confirm the saved blocklist settings.');
      setSaved(values);
      setDraft(values);
      setPages(String(values.blocklistedTagsLimit));
      forget(endpoint);
      setNotice('Automatic blocklist settings saved.');
    } catch (error) {
      setFailure(
        friendlyError(error, 'Could not save automatic blocklist settings.')
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)}>
      <div className="setlist">
        <label
          className="set cfg-row"
          aria-label="Blocklisted TMDB Keyword IDs"
        >
          <span>
            <b>Blocklisted TMDB Keyword IDs</b>
            <small>Enter up to 100 IDs, separated by commas.</small>
          </span>
          <input
            className="cfg-input"
            value={draft.blocklistedTags}
            disabled={busy}
            aria-invalid={!validTags}
            onChange={(event) => change('blocklistedTags', event.target.value)}
          />
        </label>
        <div className="toolbar">
          <label className="sel">
            <span className="lbl">Find Blocklist Keywords</span>
            <input
              className="cfg-input"
              type="search"
              maxLength={200}
              value={keywordInput}
              disabled={busy}
              onChange={(event) => setKeywordInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  findKeywords();
                }
              }}
            />
          </label>
          <button
            className="btn btn-tonal btn-sm"
            type="button"
            disabled={busy || !keywordInput.trim()}
            onClick={findKeywords}
          >
            Find Keywords
          </button>
        </div>
        {keywordQuery && (
          <KeywordResults
            key={JSON.stringify([keywordQuery, keywordPage])}
            query={keywordQuery}
            page={keywordPage}
            selected={selectedTags}
            limit={100}
            disabled={busy || !validTags}
            toggle={({ id }) => {
              const key = String(id);
              const next = selectedTags.includes(key)
                ? selectedTags.filter((tag) => tag !== key)
                : [...selectedTags, key];
              change('blocklistedTags', next.join(','));
            }}
            setPage={setKeywordPage}
          />
        )}
        <GenreField
          kind="movie"
          value={draft.blocklistedGenresMovie}
          disabled={busy}
          onChange={(value) => change('blocklistedGenresMovie', value)}
        />
        <GenreField
          kind="tv"
          value={draft.blocklistedGenresTv}
          disabled={busy}
          onChange={(value) => change('blocklistedGenresTv', value)}
        />
        <label
          className="set cfg-row"
          aria-label="Limit Pages per Blocklist Tag or Genre"
        >
          <span>
            <b>Limit Pages per Blocklist Tag or Genre</b>
            <small>Enter a whole number from 0 to 250.</small>
          </span>
          <input
            className="cfg-input"
            type="number"
            min={0}
            max={250}
            step={1}
            value={pages}
            disabled={busy}
            aria-invalid={!validPages}
            onChange={(event) => {
              setPages(event.target.value);
              setNotice('');
              setFailure('');
            }}
          />
        </label>
      </div>
      <div className="toolbar">
        <button
          className="btn btn-tonal btn-sm"
          disabled={busy || !validTags || !validPages || !changes.length}
        >
          Save Automatic Blocklist Settings
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

export default function AutomaticBlocklistSettings() {
  const settings = useApi<Partial<Settings>>(endpoint);
  return (
    <Section title="Automatic Blocklist">
      <ServiceNote
        error={settings.error}
        what="automatic blocklist settings"
        retry={settings.reload}
      />
      {settings.data ? (
        <SettingsForm initial={{ ...defaults, ...settings.data }} />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            Loading automatic blocklist settings…
          </p>
        )
      )}
    </Section>
  );
}

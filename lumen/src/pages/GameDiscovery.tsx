import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { Section } from '../components/cards';
import { ExtraGate, ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { canViewFollowing } from '../followPermissions';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';

const base = '/game-content';
const facets = [
  ['themes', 'Themes'],
  ['gameModes', 'Game Modes'],
  ['perspectives', 'Perspectives'],
  ['genres', 'Genres'],
  ['languages', 'Languages'],
] as const;
type Facet = (typeof facets)[number][0];
type Filters = Partial<Record<Facet, string[]>> & {
  text?: string;
  maxHoursToBeat?: number;
  minYear?: number;
};
type Search = { filters: Filters; exclusions?: Filters };
type SavedSearch = Search & { id: number; name: string; notify: boolean };
type Match = {
  game: { igdbId?: number; title: string };
  reasons?: { values: string[] }[];
};
type Response = {
  available: boolean;
  results: Match[];
  nextCursor?: string | null;
};
type Draft = Partial<
  Record<
    Facet | 'text' | 'excludeThemes' | 'minYear' | 'maxHoursToBeat',
    string
  >
>;

function split(raw?: string) {
  const values = raw
    ?.split(',')
    .map((value) => value.trim().slice(0, 64))
    .filter(Boolean);
  return values?.length ? values.slice(0, 20) : undefined;
}

export default function GameDiscovery() {
  const { user } = useAuth();
  const canSave = canViewFollowing(user?.permissions);
  const saved = useApi<{ results: SavedSearch[] }>(
    canSave ? base + '/saved' : null
  );
  const pending = useRef(false);
  const [draft, setDraft] = useState<Draft>({});
  const [name, setName] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<Response>();
  const [submitted, setSubmitted] = useState<Search>();
  const [remove, setRemove] = useState<SavedSearch>();
  const filters: Filters = { text: draft.text?.trim() || undefined };
  for (const [key] of facets) filters[key] = split(draft[key]);
  for (const key of ['maxHoursToBeat', 'minYear'] as const) {
    const value = Number(draft[key]);
    if (
      Number.isFinite(value) &&
      value > 0 &&
      value <= (key === 'maxHoursToBeat' ? 2000 : 2100)
    )
      filters[key] = value;
  }
  const excluded = split(draft.excludeThemes);
  const search: Search = {
    filters,
    exclusions: excluded ? { themes: excluded } : undefined,
  };
  const canSearch = Object.values(filters).some(Boolean);

  async function act<T>(
    work: () => Promise<T>,
    done: (value: T) => void,
    fallback: string
  ) {
    if (pending.current) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      const value = await work();
      if (generation === sessionGeneration()) done(value);
    } catch (error) {
      if (generation === sessionGeneration())
        setFailure(friendlyError(error, fallback));
    } finally {
      pending.current = false;
      if (generation === sessionGeneration()) setBusy(false);
    }
  }

  function run(criteria: Search, cursor?: string) {
    return act(
      async () => {
        const response = await api<Response>(base + '/discover', {
          method: 'POST',
          invalidateCache: false,
          body: JSON.stringify({
            filters: criteria.filters,
            exclusions: criteria.exclusions,
            cursor,
          }),
        });
        if (!Array.isArray(response.results))
          throw new Error('Invalid game discovery response.');
        return response;
      },
      (response) => {
        setSubmitted(criteria);
        setResult((previous) =>
          cursor && previous && response.available
            ? {
                ...response,
                results: [...previous.results, ...response.results],
              }
            : response
        );
      },
      'Could not run game discovery.'
    );
  }

  function load(entry: SavedSearch) {
    const next: Draft = {
      text: entry.filters.text,
      maxHoursToBeat: entry.filters.maxHoursToBeat?.toString(),
      minYear: entry.filters.minYear?.toString(),
      excludeThemes: entry.exclusions?.themes?.join(', '),
    };
    for (const [key] of facets) next[key] = entry.filters[key]?.join(', ');
    setDraft(next);
    setNotify(entry.notify);
    void run(entry);
  }

  return (
    <ExtraGate k="game">
      <header className="ph">
        <h1>Game Finder</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/games">
          Browse Games
        </Link>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSearch) void run(search);
        }}
      >
        <div className="toolbar">
          <label className="sel">
            <span className="lbl">Keywords</span>
            <input
              value={draft.text ?? ''}
              maxLength={200}
              onChange={(event) =>
                setDraft({ ...draft, text: event.target.value })
              }
            />
          </label>
          {[...facets, ['excludeThemes', 'Exclude Themes'] as const].map(
            ([key, label]) => (
              <label key={key} className="sel">
                <span className="lbl">{label}</span>
                <input
                  value={draft[key] ?? ''}
                  placeholder="Comma-separated"
                  onChange={(event) =>
                    setDraft({ ...draft, [key]: event.target.value })
                  }
                />
              </label>
            )
          )}
          {(
            [
              ['maxHoursToBeat', 'Maximum Hours', 2000],
              ['minYear', 'Earliest Year', 2100],
            ] as const
          ).map(([key, label, max]) => (
            <label key={key} className="sel">
              <span className="lbl">{label}</span>
              <input
                type="number"
                min={1}
                max={max}
                value={draft[key] ?? ''}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: event.target.value })
                }
              />
            </label>
          ))}
          <button
            className="btn btn-primary btn-sm"
            type="submit"
            disabled={busy || !canSearch}
          >
            Show Matches
          </button>
        </div>
        {canSave && (
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">Search Name</span>
              <input
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="sel">
              <input
                type="checkbox"
                checked={notify}
                onChange={(event) => setNotify(event.target.checked)}
              />{' '}
              Notify Me of New Matches
            </label>
            <button
              className="btn btn-tonal btn-sm"
              type="button"
              disabled={busy || !canSearch || !name.trim()}
              onClick={() =>
                void act(
                  () =>
                    api(base + '/saved', {
                      method: 'POST',
                      body: JSON.stringify({
                        ...search,
                        name: name.trim(),
                        notify,
                      }),
                    }),
                  () => {
                    setName('');
                    setNotice('Search saved.');
                    saved.reload();
                  },
                  'Could not save the search.'
                )
              }
            >
              Save Search
            </button>
          </div>
        )}
      </form>
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
      {result?.available === false && (
        <p className="note">
          Game Finder needs a connected QuestarrNG service.
        </p>
      )}
      {result?.available && (
        <Section title="Matches">
          {result.results.length === 0 && (
            <p className="note">No games match these filters.</p>
          )}
          <ul className="setlist">
            {result.results.map(({ game, reasons }, index) => (
              <li className="set" key={`${game.igdbId ?? game.title}:${index}`}>
                <div>
                  {typeof game.igdbId === 'number' &&
                  Number.isSafeInteger(game.igdbId) &&
                  game.igdbId > 0 ? (
                    <Link className="go" to={`/game/game/${game.igdbId}`}>
                      {game.title}
                    </Link>
                  ) : (
                    <b>{game.title}</b>
                  )}
                  {!!reasons?.length && (
                    <small>
                      {reasons.flatMap(({ values }) => values).join(' · ')}
                    </small>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {result.nextCursor && submitted && (
            <button
              className="btn btn-tonal btn-sm"
              disabled={busy}
              onClick={() =>
                void run(submitted, result.nextCursor ?? undefined)
              }
            >
              Load More Matches
            </button>
          )}
        </Section>
      )}
      {canSave && (
        <Section title="Saved Searches">
          <ServiceNote
            error={saved.error}
            what="saved searches"
            retry={saved.reload}
          />
          {saved.data?.results?.length === 0 && (
            <p className="note">No saved searches yet.</p>
          )}
          {!!saved.data?.results?.length && (
            <ul className="setlist">
              {saved.data.results.map((entry) => (
                <li className="set" key={entry.id}>
                  <b>{entry.name}</b>
                  <button
                    className="btn btn-tonal btn-sm"
                    disabled={busy}
                    onClick={() => load(entry)}
                  >
                    Run {entry.name}
                  </button>
                  <button
                    className="btn btn-quiet btn-sm"
                    disabled={busy}
                    onClick={() => setRemove(entry)}
                  >
                    Delete {entry.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
      {remove && (
        <ConfirmSheet
          title="Delete Saved Search?"
          body={remove.name}
          confirm="Delete Search"
          cancel="Keep Search"
          busy={busy}
          onClose={() => {
            if (!pending.current) setRemove(undefined);
          }}
          onConfirm={() =>
            void act(
              () => api(base + '/saved/' + remove.id, { method: 'DELETE' }),
              () => {
                setRemove(undefined);
                saved.reload();
              },
              'Could not delete the search.'
            )
          }
        />
      )}
    </ExtraGate>
  );
}

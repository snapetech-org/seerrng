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
import { useLumenLocale } from '../i18n';
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
  const { t } = useLumenLocale();
  const { user } = useAuth();
  const canSave = canViewFollowing(user?.permissions);
  const saved = useApi<{ results: SavedSearch[] }>(
    canSave ? base + '/saved' : null
  );
  const savedRows =
    Array.isArray(saved.data?.results) &&
    saved.data.results.every(
      (entry) =>
        Number.isSafeInteger(entry?.id) &&
        entry.id > 0 &&
        typeof entry.name === 'string' &&
        typeof entry.notify === 'boolean' &&
        !!entry.filters &&
        typeof entry.filters === 'object' &&
        facets.every(
          ([key]) =>
            entry.filters[key] === undefined ||
            Array.isArray(entry.filters[key])
        ) &&
        (entry.exclusions?.themes === undefined ||
          Array.isArray(entry.exclusions.themes))
    )
      ? saved.data.results
      : undefined;
  const savedError =
    saved.error ||
    (saved.data && !savedRows
      ? t('lumen.gameFinder.invalidSaved', 'Invalid saved searches response.')
      : null);
  const pending = useRef(false);
  const [draft, setDraft] = useState<Draft>({});
  const [name, setName] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<Response>();
  const [submitted, setSubmitted] = useState<Search>();
  const [failedSearch, setFailedSearch] = useState<{
    criteria: Search;
    cursor?: string;
  }>();
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
    fallback: string,
    onFailure?: () => void
  ) {
    if (pending.current) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    setFailedSearch(undefined);
    try {
      const value = await work();
      if (generation === sessionGeneration()) done(value);
    } catch (error) {
      if (generation === sessionGeneration()) {
        setFailure(friendlyError(error, fallback));
        onFailure?.();
      }
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
        if (response?.available === false)
          throw new Error(
            t(
              'lumen.gameFinder.questarrUnavailable',
              'Game Finder could not reach QuestarrNG.'
            )
          );
        if (
          response?.available !== true ||
          !Array.isArray(response.results) ||
          !response.results.every(
            (item) => typeof item?.game?.title === 'string'
          )
        )
          throw new Error(
            t(
              'lumen.gameFinder.invalidResponse',
              'Invalid game discovery response.'
            )
          );
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
      t('lumen.gameFinder.searchFailure', 'Could not run game discovery.'),
      () => setFailedSearch({ criteria, cursor })
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
        <h1>{t('lumen.gameFinder.title', 'Game Finder')}</h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/games">
          {t('lumen.gameFinder.browseGames', 'Browse Games')}
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
            <span className="lbl">
              {t('lumen.gameFinder.keywords', 'Keywords')}
            </span>
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
                <span className="lbl">
                  {t(`lumen.gameFinder.facet.${key}`, label)}
                </span>
                <input
                  value={draft[key] ?? ''}
                  placeholder={t(
                    'lumen.gameFinder.commaSeparated',
                    'Comma-separated'
                  )}
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
              <span className="lbl">
                {t(`lumen.gameFinder.filter.${key}`, label)}
              </span>
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
            {t('lumen.gameFinder.showMatches', 'Show Matches')}
          </button>
        </div>
        {canSave && (
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">
                {t('lumen.gameFinder.searchName', 'Search Name')}
              </span>
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
              {t('lumen.gameFinder.notify', 'Notify Me of New Matches')}
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
                    setNotice(t('lumen.gameFinder.saved', 'Search saved.'));
                    saved.reload();
                  },
                  t(
                    'lumen.gameFinder.saveFailure',
                    'Could not save the search.'
                  )
                )
              }
            >
              {t('lumen.gameFinder.saveSearch', 'Save Search')}
            </button>
          </div>
        )}
      </form>
      {failure && failedSearch ? (
        <ServiceNote
          error={
            result
              ? t(
                  'lumen.gameFinder.showingPrevious',
                  '{error} Showing the previous matches.',
                  { error: failure }
                )
              : failure
          }
          what={t(
            failedSearch.cursor
              ? 'lumen.gameFinder.moreGames'
              : 'lumen.gameFinder.matchingGames',
            failedSearch.cursor ? 'more games' : 'matching games'
          )}
          retry={() => void run(failedSearch.criteria, failedSearch.cursor)}
        />
      ) : (
        failure && (
          <p className="note" role="alert">
            {failure}
          </p>
        )
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {result?.available && (
        <Section title={t('lumen.gameFinder.matches', 'Matches')}>
          {result.results.length === 0 && (
            <p className="note">
              {t('lumen.gameFinder.noMatches', 'No games match these filters.')}
            </p>
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
              {t('lumen.gameFinder.loadMore', 'Load More Matches')}
            </button>
          )}
        </Section>
      )}
      {canSave && (
        <Section title={t('lumen.gameFinder.savedSearches', 'Saved Searches')}>
          <ServiceNote
            error={savedError}
            what={t('lumen.gameFinder.savedSearchesLower', 'saved searches')}
            retry={saved.reload}
          />
          {!savedRows && !savedError && (
            <p className="note" role="status">
              {t('lumen.gameFinder.loadingSaved', 'Loading saved searches…')}
            </p>
          )}
          {savedRows?.length === 0 && (
            <p className="note">
              {t('lumen.gameFinder.noSaved', 'No saved searches yet.')}
            </p>
          )}
          {!!savedRows?.length && (
            <ul className="setlist">
              {savedRows.map((entry) => (
                <li className="set" key={entry.id}>
                  <b>{entry.name}</b>
                  <button
                    className="btn btn-tonal btn-sm"
                    disabled={busy}
                    onClick={() => load(entry)}
                  >
                    {t('lumen.gameFinder.runSearch', 'Run {name}', {
                      name: entry.name,
                    })}
                  </button>
                  <button
                    className="btn btn-quiet btn-sm"
                    disabled={busy}
                    onClick={() => setRemove(entry)}
                  >
                    {t('lumen.gameFinder.deleteNamedSearch', 'Delete {name}', {
                      name: entry.name,
                    })}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
      {remove && (
        <ConfirmSheet
          title={t('lumen.gameFinder.deleteTitle', 'Delete Saved Search?')}
          body={remove.name}
          confirm={t('lumen.gameFinder.deleteConfirm', 'Delete Search')}
          cancel={t('lumen.gameFinder.deleteCancel', 'Keep Search')}
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
              t(
                'lumen.gameFinder.deleteFailure',
                'Could not delete the search.'
              )
            )
          }
        />
      )}
    </ExtraGate>
  );
}

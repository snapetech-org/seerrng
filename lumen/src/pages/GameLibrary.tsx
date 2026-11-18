import { useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import { GAME_LABEL, type GameCategory } from '../extras';
import { useApi } from '../hooks';

const PROGRESS = {
  backlog: 'Backlog',
  playing: 'Playing',
  played: 'Played',
  completed: 'Completed',
  paused: 'Paused',
  dropped: 'Dropped',
};
const PAGE_SIZE = 48;

interface GameEntry {
  id: number;
  title: string;
  category: GameCategory;
  catalogId: number | null;
  status: keyof typeof PROGRESS;
  isOwned: boolean;
  steamOwned: boolean;
  shareWithHousehold: boolean;
  storeName: string;
  platformName: string;
  playtimeMinutes: number;
  request: { id: number; status: string } | null;
}

interface SharedGame {
  key: string;
  title: string;
  category: GameCategory;
  catalogId: number | null;
  playtimeMinutes: number;
  owners: { id: number; displayName: string }[];
}

interface ResultPage<T> {
  results: T[];
  total: number;
  nextOffset: number | null;
}

function Options({ values }: { values: Record<string, string> }) {
  return Object.entries(values).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}

function GameName({
  game,
}: {
  game: Pick<GameEntry, 'title' | 'category' | 'catalogId'>;
}) {
  return game.catalogId ? (
    <Link className="go" to={`/game/${game.category}/${game.catalogId}`}>
      {game.title}
    </Link>
  ) : (
    <b>{game.title}</b>
  );
}

function EntryEditor({
  entry,
  close,
  saved,
}: {
  entry: GameEntry | null;
  close: () => void;
  saved: () => void;
}) {
  const [owned, setOwned] = useState(entry?.isOwned ?? false);
  const [sharing, setSharing] = useState(entry?.shareWithHousehold ?? false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const toast = useToast();
  const mayShare = owned || entry?.steamOwned === true;

  async function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (pending.current || (!event && !entry)) return;
    const form = event ? new FormData(event.currentTarget) : null;
    pending.current = true;
    setBusy(true);
    try {
      if (form) {
        const changes = {
          status: form.get('status'),
          storeName: form.get('storeName'),
          platformName: form.get('platformName'),
          isOwned: owned,
          shareWithHousehold: mayShare && sharing,
        };
        await api(
          entry ? `/game-library/${entry.id}` : '/game-library/manual',
          {
            method: entry ? 'PATCH' : 'POST',
            body: JSON.stringify(
              entry
                ? changes
                : {
                    ...changes,
                    title: form.get('title'),
                    category: form.get('category'),
                  }
            ),
          }
        );
      } else if (entry) {
        await api(`/game-library/${entry.id}`, { method: 'DELETE' });
      }
      saved();
    } catch (error) {
      toast(
        friendlyError(
          error,
          form ? 'Couldn’t save the game' : 'Couldn’t remove the game'
        )
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form className="setlist" onSubmit={(event) => void save(event)}>
      <h2>{entry ? `Edit ${entry.title}` : 'Add a Game'}</h2>
      <fieldset className="setlist" disabled={busy}>
        {!entry && (
          <>
            <label className="set cfg-row">
              <b>Game Title</b>
              <input name="title" required maxLength={512} />
            </label>
            <label className="set cfg-row">
              <b>Game Type</b>
              <select name="category" defaultValue="game">
                <Options values={GAME_LABEL} />
              </select>
            </label>
          </>
        )}
        <label className="set cfg-row">
          <b>Progress</b>
          <select name="status" defaultValue={entry?.status ?? 'backlog'}>
            <Options values={PROGRESS} />
          </select>
        </label>
        <label className="set cfg-row">
          <b>Store or Copy</b>
          <input
            name="storeName"
            maxLength={120}
            defaultValue={entry?.storeName}
          />
        </label>
        <label className="set cfg-row">
          <b>Platform</b>
          <input
            name="platformName"
            maxLength={120}
            defaultValue={entry?.platformName}
          />
        </label>
        <label className="set cfg-row">
          <b>{entry?.steamOwned ? 'Also Owned Outside Steam' : 'Owned'}</b>
          <input
            type="checkbox"
            checked={owned}
            onChange={(event) => setOwned(event.target.checked)}
          />
        </label>
        <label className="set cfg-row">
          <b>Share With Household</b>
          <input
            type="checkbox"
            checked={mayShare && sharing}
            disabled={!mayShare}
            onChange={(event) => setSharing(event.target.checked)}
          />
        </label>
        <div className="toolbar">
          <button className="btn btn-tonal btn-sm" type="submit">
            {entry ? 'Save Changes' : 'Add Game'}
          </button>
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            onClick={close}
          >
            Cancel
          </button>
          {entry && !confirmRemoval && (
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              onClick={() => setConfirmRemoval(true)}
            >
              Remove Game
            </button>
          )}
          {confirmRemoval && (
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              onClick={() => void save()}
            >
              Confirm Removal
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}

export default function GameLibrary() {
  const [params, setParams] = useSearchParams();
  const [editor, setEditor] = useState<GameEntry | null | undefined>();
  const shared = params.get('view') === 'shared';
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  const offsetParam = params.get('offset') ?? '';
  const offset = /^\d{1,7}$/.test(offsetParam) ? Number(offsetParam) : 0;
  query.set('offset', String(offset));
  const search = (params.get('q') ?? '').trim().slice(0, 120);
  const status = params.get('status') ?? '';
  const category = params.get('category') ?? '';
  const multipleOwners = params.get('owners') !== 'all';
  if (search) query.set('q', search);
  if (shared && multipleOwners) query.set('minOwners', '2');
  if (!shared && Object.hasOwn(PROGRESS, status)) query.set('status', status);
  if (!shared && Object.hasOwn(GAME_LABEL, category))
    query.set('category', category);

  const library = useApi<ResultPage<GameEntry>>(
    shared ? null : `/game-library?${query}`
  );
  const household = useApi<ResultPage<SharedGame>>(
    shared ? `/game-library/shared?${query}` : null
  );
  const { data, error, reload } = shared ? household : library;

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const filters = new URLSearchParams();
    if (shared) filters.set('view', 'shared');
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === 'string' && value.trim())
        filters.set(key, value.trim());
    }
    setParams(filters);
  }

  function move(next: number) {
    const filters = new URLSearchParams(params);
    if (next) filters.set('offset', String(next));
    else filters.delete('offset');
    setParams(filters);
  }

  return (
    <>
      <ExtraHeader title="My Games">
        <nav className="toolbar" aria-label="Game Library Views">
          <Link
            className="chip"
            aria-current={!shared ? 'page' : undefined}
            to="/game-library"
          >
            Private Library
          </Link>
          <Link
            className="chip"
            aria-current={shared ? 'page' : undefined}
            to="/game-library?view=shared"
          >
            Household Games
          </Link>
          <Link className="chip" to="/games">
            Browse Game Catalogue
          </Link>
        </nav>
      </ExtraHeader>
      <form className="toolbar" key={params.toString()} onSubmit={applyFilters}>
        <label className="search">
          <input
            name="q"
            type="search"
            aria-label="Search Games"
            defaultValue={search}
            maxLength={120}
          />
        </label>
        {shared ? (
          <label className="sel">
            <span className="lbl">Owner Count</span>
            <select name="owners" defaultValue={multipleOwners ? '' : 'all'}>
              <option value="">2+ Owners</option>
              <option value="all">All Shared Games</option>
            </select>
          </label>
        ) : (
          <>
            <label className="sel">
              <span className="lbl">Progress</span>
              <select name="status" defaultValue={status}>
                <option value="">All Progress</option>
                <Options values={PROGRESS} />
              </select>
            </label>
            <label className="sel">
              <span className="lbl">Game Type</span>
              <select name="category" defaultValue={category}>
                <option value="">All Types</option>
                <Options values={GAME_LABEL} />
              </select>
            </label>
          </>
        )}
        <button className="btn btn-tonal btn-sm" type="submit">
          Apply Filters
        </button>
        {!shared && editor === undefined && (
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            onClick={() => setEditor(null)}
          >
            Add a Game
          </button>
        )}
      </form>

      {!shared && editor !== undefined && (
        <EntryEditor
          key={editor?.id ?? 'new'}
          entry={editor}
          close={() => setEditor(undefined)}
          saved={() => {
            setEditor(undefined);
            reload();
          }}
        />
      )}
      <ServiceNote
        error={error}
        what={shared ? 'household games' : 'your game library'}
        retry={reload}
      />
      {!data && !error && (
        <p className="note" role="status">
          Loading games…
        </p>
      )}
      {data?.results.length === 0 && <p className="note">No games found.</p>}
      <ul className="setlist">
        {shared
          ? household.data?.results.map((game) => (
              <li className="set" key={game.key}>
                <div>
                  <GameName game={game} />
                  <small>
                    {[
                      GAME_LABEL[game.category],
                      ...game.owners.map((owner) => owner.displayName),
                    ].join(' · ')}
                  </small>
                  {game.playtimeMinutes > 0 && (
                    <small>
                      {game.playtimeMinutes} minutes played together
                    </small>
                  )}
                </div>
              </li>
            ))
          : library.data?.results.map((game) => (
              <li className="set" key={game.id}>
                <div>
                  <GameName game={game} />
                  <small>
                    {[
                      GAME_LABEL[game.category],
                      PROGRESS[game.status],
                      game.storeName,
                      game.platformName,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                  <small>
                    {game.steamOwned
                      ? 'Owned on Steam'
                      : game.isOwned
                        ? 'Owned'
                        : 'Not marked owned'}
                    {' · '}
                    {game.shareWithHousehold
                      ? 'Shared with household'
                      : 'Private'}
                    {game.playtimeMinutes > 0 &&
                      ` · ${game.playtimeMinutes} minutes played`}
                  </small>
                  {game.request && (
                    <Link
                      className="go"
                      to={`/requests?softwareRequestId=${game.request.id}`}
                    >
                      Request History
                    </Link>
                  )}
                </div>
                <button
                  className="btn btn-quiet btn-sm"
                  type="button"
                  aria-label={`Edit ${game.title}`}
                  onClick={() => setEditor(game)}
                >
                  Edit
                </button>
              </li>
            ))}
      </ul>
      {(offset > 0 || data?.nextOffset != null) && (
        <nav className="toolbar" aria-label="Game Library Pages">
          <button
            className="btn btn-quiet btn-sm"
            disabled={!offset}
            onClick={() => move(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous Page
          </button>
          <button
            className="btn btn-quiet btn-sm"
            disabled={data?.nextOffset == null}
            onClick={() => data?.nextOffset != null && move(data.nextOffset)}
          >
            Next Page
          </button>
        </nav>
      )}
    </>
  );
}

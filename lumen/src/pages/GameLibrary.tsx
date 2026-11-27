import { useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { canUseRequestAccess } from '../components/detail';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import { GAME_LABEL, type Game, type GameCategory } from '../extras';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

const PROGRESS = {
  backlog: 'Backlog',
  playing: 'Playing',
  played: 'Played',
  completed: 'Completed',
  paused: 'Paused',
  dropped: 'Dropped',
};
const PAGE_SIZE = 48;
const REQUEST_STATUS: Record<string, [string, string]> = {
  pending: ['components.GameLibrary.requestPending', 'Pending approval'],
  approved: ['components.GameLibrary.requestApproved', 'Approved'],
  searching: ['components.GameLibrary.requestSearching', 'Searching'],
  downloading: ['components.GameLibrary.requestDownloading', 'Downloading'],
  importing: ['components.GameLibrary.requestImporting', 'Importing'],
  available: ['components.GameLibrary.requestAvailable', 'Available'],
  failed: ['components.GameLibrary.requestFailed', 'Failed'],
  cancelled: ['components.GameLibrary.requestCancelled', 'Cancelled'],
  declined: ['components.GameLibrary.requestDeclined', 'Declined'],
  withdrawn: ['components.GameLibrary.requestWithdrawn', 'Withdrawn'],
};

const gameCatalogPath = (game: {
  category: GameCategory;
  catalogId: number | null;
  title: string;
}) =>
  game.catalogId !== null
    ? `/game/${game.category}/${game.catalogId}`
    : `/games?${new URLSearchParams({ c: 'game', q: game.title })}`;

const messageKey = (value: string) =>
  `lumen.gameLibrary.${value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/ +/)
    .map((part, index) =>
      index ? part[0].toUpperCase() + part.slice(1) : part.toLowerCase()
    )
    .join('')}`;

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
  ownerCount: number;
  owners: {
    id: number;
    displayName: string;
    status: keyof typeof PROGRESS;
    storeName: string;
    platformName: string;
    playtimeMinutes: number;
  }[];
}

interface ResultPage<T> {
  results: T[];
  total: number;
  nextOffset: number | null;
}

function Options({
  values,
  translate,
}: {
  values: Record<string, string>;
  translate: (value: string) => string;
}) {
  return Object.entries(values).map(([value, label]) => (
    <option key={value} value={value}>
      {translate(label)}
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

function CatalogMatch({
  entry,
  busy,
  match,
  t,
}: {
  entry: GameEntry;
  busy: boolean;
  match: (catalogId: number) => void;
  t: ReturnType<typeof useLumenLocale>['t'];
}) {
  const [term, setTerm] = useState('');
  const tr = (value: string) => t(messageKey(value), value);
  const query = new URLSearchParams({
    category: entry.category,
    q: term,
    limit: '8',
  });
  const { data, error, reload } = useApi<{ results: Game[] }>(
    term ? `/request/software/catalog/search?${query}` : null
  );
  const results = data?.results.flatMap((game) =>
    typeof game.igdbId === 'number' &&
    Number.isSafeInteger(game.igdbId) &&
    game.igdbId > 0 &&
    game.igdbId <= 2_147_483_647
      ? [{ ...game, igdbId: game.igdbId }]
      : []
  );

  return (
    <section className="setlist">
      <h3>{tr('Link a Catalogue Game')}</h3>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          const value = String(
            new FormData(event.currentTarget).get('q') ?? ''
          ).trim();
          if (!value) return;
          if (value === term) reload();
          else setTerm(value);
        }}
      >
        <label className="search">
          <input
            name="q"
            type="search"
            aria-label={tr('Search Game Catalogue')}
            defaultValue={entry.title}
            maxLength={120}
            required
          />
        </label>
        <button className="btn btn-tonal btn-sm" type="submit" disabled={busy}>
          {tr('Search Catalogue')}
        </button>
      </form>
      <ServiceNote error={error} what={tr('game catalogue')} retry={reload} />
      {term && !data && !error && (
        <p className="note" role="status">
          {tr('Searching catalogue…')}
        </p>
      )}
      {results?.length === 0 && (
        <p className="note">{tr('No linkable games found.')}</p>
      )}
      {!!results?.length && (
        <ul className="setlist">
          {results.map((game) => (
            <li className="set" key={game.igdbId}>
              <div>
                <b>{game.title}</b>
                {game.releaseDate && <small>{game.releaseDate}</small>}
              </div>
              <button
                className="btn btn-quiet btn-sm"
                type="button"
                disabled={busy}
                aria-label={t('lumen.gameLibrary.linkNamed', 'Link {name}', {
                  name: game.title,
                })}
                onClick={() => match(game.igdbId)}
              >
                {tr('Link Game')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EntryEditor({
  entry,
  close,
  saved,
  t,
}: {
  entry: GameEntry | null;
  close: () => void;
  saved: () => void;
  t: ReturnType<typeof useLumenLocale>['t'];
}) {
  const tr = (value: string) => t(messageKey(value), value);
  const [owned, setOwned] = useState(entry?.isOwned ?? false);
  const [sharing, setSharing] = useState(entry?.shareWithHousehold ?? false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const editForm = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const mayShare = owned || entry?.steamOwned === true;

  async function save(form?: FormData, catalogId?: number) {
    if (pending.current || (!form && !entry)) return;
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
        if (entry && catalogId) {
          await api(`/game-library/${entry.id}/match`, {
            method: 'POST',
            body: JSON.stringify({
              ...changes,
              category: entry.category,
              catalogId,
            }),
          });
        } else
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
          catalogId
            ? tr('Couldn’t link the game')
            : form
              ? tr('Couldn’t save the game')
              : tr('Couldn’t remove the game')
        )
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <form
        className="setlist"
        ref={editForm}
        onSubmit={(event) => {
          event.preventDefault();
          void save(new FormData(event.currentTarget));
        }}
      >
        <h2>
          {entry
            ? t('lumen.gameLibrary.editNamed', 'Edit {name}', {
                name: entry.title,
              })
            : tr('Add a Game')}
        </h2>
        <fieldset className="setlist" disabled={busy}>
          {!entry && (
            <>
              <label className="set cfg-row">
                <b>{tr('Game Title')}</b>
                <input name="title" required maxLength={512} />
              </label>
              <label className="set cfg-row">
                <b>{tr('Game Type')}</b>
                <select name="category" defaultValue="game">
                  <Options values={GAME_LABEL} translate={tr} />
                </select>
              </label>
            </>
          )}
          <label className="set cfg-row">
            <b>{tr('Progress')}</b>
            <select name="status" defaultValue={entry?.status ?? 'backlog'}>
              <Options values={PROGRESS} translate={tr} />
            </select>
          </label>
          <label className="set cfg-row">
            <b>{tr('Store or Copy')}</b>
            <input
              name="storeName"
              maxLength={120}
              defaultValue={entry?.storeName}
            />
          </label>
          <label className="set cfg-row">
            <b>{tr('Platform')}</b>
            <input
              name="platformName"
              maxLength={120}
              defaultValue={entry?.platformName}
            />
          </label>
          <label className="set cfg-row">
            <b>
              {entry?.steamOwned ? tr('Also Owned Outside Steam') : tr('Owned')}
            </b>
            <input
              type="checkbox"
              checked={owned}
              onChange={(event) => setOwned(event.target.checked)}
            />
          </label>
          <label className="set cfg-row">
            <b>{tr('Share With Household')}</b>
            <input
              type="checkbox"
              checked={mayShare && sharing}
              disabled={!mayShare}
              onChange={(event) => setSharing(event.target.checked)}
            />
          </label>
          <div className="toolbar">
            <button className="btn btn-tonal btn-sm" type="submit">
              {entry ? tr('Save Changes') : tr('Add Game')}
            </button>
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              onClick={close}
            >
              {tr('Cancel')}
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
      {entry?.catalogId === null && (
        <CatalogMatch
          t={t}
          entry={entry}
          busy={busy}
          match={(catalogId) => {
            if (editForm.current)
              void save(new FormData(editForm.current), catalogId);
          }}
        />
      )}
    </>
  );
}

function SteamLibrary({
  result,
  onChange,
  t,
}: {
  result: string | null;
  onChange: () => void;
  t: ReturnType<typeof useLumenLocale>['t'];
}) {
  const { locale } = useLumenLocale();
  const tr = (value: string) => t(messageKey(value), value);
  const [openOnMount] = useState(
    () => result === 'connected' || result === 'error'
  );
  const status = useApi<{
    connected: boolean;
    lastSyncedAt: string | null;
    lastSyncCount: number;
    apiKeyConfigured: boolean;
  }>('/game-library/steam/status');
  const [busy, setBusy] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const pending = useRef(false);
  const toast = useToast();
  const frontend =
    import.meta.env.BASE_URL === '/lumen/'
      ? 'bundled-lumen'
      : 'companion-lumen';

  async function change(action: 'sync' | 'unlink') {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      if (action === 'sync') {
        const synced = await api<{
          imported: number;
          updated: number;
          total: number;
        }>('/game-library/steam/sync', { method: 'POST' });
        toast(
          t(
            'lumen.gameLibrary.steamSyncComplete',
            'Steam sync complete. {added} added, {updated} updated.',
            { added: synced.imported, updated: synced.updated }
          )
        );
      } else {
        await api('/game-library/steam', { method: 'DELETE' });
        setConfirmUnlink(false);
        toast(tr('Steam account unlinked.'));
      }
      status.reload();
      onChange();
    } catch (error) {
      toast(friendlyError(error, tr('Couldn’t update the Steam library')));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <details className="adv" open={openOnMount}>
      <summary>{tr('Steam Library Import')}</summary>
      {result === 'error' && (
        <p className="note" role="alert">
          {tr('Steam could not be linked. Try again.')}
        </p>
      )}
      {result === 'connected' && status.data?.connected && (
        <p className="note" role="status">
          {tr('Steam account linked. Sync to import your games.')}
        </p>
      )}
      <ServiceNote
        error={status.error}
        what={tr('Steam account status')}
        retry={status.reload}
      />
      {!status.data && !status.error && (
        <p className="note" role="status">
          {tr('Loading Steam account status…')}
        </p>
      )}
      {status.data && (
        <>
          {!status.data.apiKeyConfigured && (
            <p className="note">
              {tr(
                'Steam import is unavailable until an administrator configures it.'
              )}
            </p>
          )}
          {status.data.connected && (
            <p className="note">
              {status.data.lastSyncedAt
                ? t(
                    'lumen.gameLibrary.lastSynced',
                    'Last synced {date} · {count} games',
                    {
                      date: new Date(
                        status.data.lastSyncedAt
                      ).toLocaleDateString(locale),
                      count: status.data.lastSyncCount,
                    }
                  )
                : tr('Steam account linked. No sync recorded yet.')}
            </p>
          )}
          <div className="toolbar">
            {status.data.apiKeyConfigured && !status.data.connected && (
              <a
                className="chip"
                href={`/api/v1/game-library/steam/connect?frontend=${frontend}`}
              >
                {tr('Link Steam Account')}
              </a>
            )}
            {status.data.connected && (
              <>
                {status.data.apiKeyConfigured && (
                  <button
                    className="btn btn-tonal btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() => void change('sync')}
                  >
                    {tr('Sync Steam Library')}
                  </button>
                )}
                {confirmUnlink ? (
                  <>
                    <button
                      className="btn btn-quiet btn-sm"
                      type="button"
                      disabled={busy}
                      onClick={() => void change('unlink')}
                    >
                      {tr('Confirm Unlink')}
                    </button>
                    <button
                      className="btn btn-quiet btn-sm"
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmUnlink(false)}
                    >
                      {tr('Cancel')}
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-quiet btn-sm"
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmUnlink(true)}
                  >
                    {tr('Unlink Steam')}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </details>
  );
}

export default function GameLibrary() {
  const { user } = useAuth();
  const { locale, t } = useLumenLocale();
  const tr = (value: string) => t(messageKey(value), value);
  const formatNumber = (value: number) =>
    new Intl.NumberFormat(locale === 'ar' ? 'ar-u-nu-arab' : locale).format(
      value
    );
  const formatMinutes = (key: string, fallback: string, minutes: number) => {
    const number = formatNumber(minutes);
    const marker = '__minutes__';
    const message = t(key, fallback, { minutes: marker });
    return message.includes(marker)
      ? message.replace(marker, number)
      : `${number} ${message}`;
  };
  const formatRequestStatus = (status: string) => {
    const [key, fallback] = REQUEST_STATUS[status] ?? [
      'components.GameLibrary.requestUnknown',
      'In progress',
    ];
    return t(key, fallback);
  };
  const mayRequest = canUseRequestAccess(user?.permissions);
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
      <ExtraHeader title={tr('My Games')}>
        <nav className="toolbar" aria-label={tr('Game Library Views')}>
          <Link
            className="chip"
            aria-current={!shared ? 'page' : undefined}
            to="/game-library"
          >
            {tr('Private Library')}
          </Link>
          <Link
            className="chip"
            aria-current={shared ? 'page' : undefined}
            to="/game-library?view=shared"
          >
            {tr('Household Games')}
          </Link>
          <Link className="chip" to="/games">
            {tr('Browse Game Catalogue')}
          </Link>
        </nav>
      </ExtraHeader>
      <form className="toolbar" key={params.toString()} onSubmit={applyFilters}>
        <label className="search">
          <input
            name="q"
            type="search"
            aria-label={tr('Search Games')}
            defaultValue={search}
            maxLength={120}
          />
        </label>
        {shared ? (
          <label className="sel">
            <span className="lbl">{tr('Owner Count')}</span>
            <select name="owners" defaultValue={multipleOwners ? '' : 'all'}>
              <option value="">{tr('2+ Owners')}</option>
              <option value="all">{tr('All Shared Games')}</option>
            </select>
          </label>
        ) : (
          <>
            <label className="sel">
              <span className="lbl">{tr('Progress')}</span>
              <select name="status" defaultValue={status}>
                <option value="">{tr('All Progress')}</option>
                <Options values={PROGRESS} translate={tr} />
              </select>
            </label>
            <label className="sel">
              <span className="lbl">{tr('Game Type')}</span>
              <select name="category" defaultValue={category}>
                <option value="">{tr('All Types')}</option>
                <Options values={GAME_LABEL} translate={tr} />
              </select>
            </label>
          </>
        )}
        <button className="btn btn-tonal btn-sm" type="submit">
          {tr('Apply Filters')}
        </button>
        {!shared && editor === undefined && (
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            onClick={() => setEditor(null)}
          >
            {tr('Add a Game')}
          </button>
        )}
      </form>

      {!shared && (
        <SteamLibrary
          t={t}
          result={params.get('steam')}
          onChange={() => {
            if (params.has('steam')) {
              const next = new URLSearchParams(params);
              next.delete('steam');
              setParams(next, { replace: true });
            }
            reload();
          }}
        />
      )}
      {!shared && editor !== undefined && (
        <EntryEditor
          t={t}
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
        what={tr(shared ? 'household games' : 'your game library')}
        retry={reload}
      />
      {!data && !error && (
        <p className="note" role="status">
          {tr('Loading games…')}
        </p>
      )}
      {data?.results.length === 0 && (
        <p className="note">{tr('No games found.')}</p>
      )}
      <ul className="setlist">
        {shared
          ? household.data?.results.map((game) => (
              <li className="set" key={game.key}>
                <div>
                  <GameName game={game} />
                  <small>{[tr(GAME_LABEL[game.category])].join(' · ')}</small>
                  <small>
                    {`${tr('Owner Count')}: ${formatNumber(game.ownerCount)}`}
                  </small>
                  <small>
                    {t(
                      'components.GameLibrary.sharedBy',
                      'Shared by {owners}',
                      {
                        owners: game.owners
                          .map((owner) => owner.displayName)
                          .join(', '),
                      }
                    )}
                  </small>
                  <small>
                    {game.owners
                      .map((owner) =>
                        [
                          `${owner.displayName}: ${tr(PROGRESS[owner.status])}`,
                          owner.storeName,
                          owner.platformName,
                          owner.playtimeMinutes > 0 &&
                            formatMinutes(
                              'lumen.gameLibrary.minutesPlayed',
                              '{minutes} minutes played',
                              owner.playtimeMinutes
                            ),
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      )
                      .join(' · ')}
                  </small>
                  {game.playtimeMinutes > 0 && (
                    <small>
                      {formatMinutes(
                        'lumen.gameLibrary.minutesPlayedTogether',
                        '{minutes} minutes played together',
                        game.playtimeMinutes
                      )}
                    </small>
                  )}
                  <Link
                    className="btn btn-tonal btn-sm"
                    to={gameCatalogPath(game)}
                  >
                    {game.catalogId === null && mayRequest
                      ? t(
                          'components.GameLibrary.requestGame',
                          'Request this game'
                        )
                      : t(
                          'components.GameLibrary.openCatalog',
                          'Open in catalog'
                        )}
                  </Link>
                </div>
              </li>
            ))
          : library.data?.results.map((game) => (
              <li className="set" key={game.id}>
                <div>
                  <GameName game={game} />
                  <small>
                    {[
                      tr(GAME_LABEL[game.category]),
                      tr(PROGRESS[game.status]),
                      game.storeName,
                      game.platformName,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                  <small>
                    {game.steamOwned
                      ? tr('Owned on Steam')
                      : game.isOwned
                        ? tr('Owned')
                        : tr('Not marked owned')}
                    {' · '}
                    {game.shareWithHousehold
                      ? tr('Shared with household')
                      : tr('Private')}
                    {game.playtimeMinutes > 0 &&
                      ` · ${t('lumen.gameLibrary.minutesPlayed', '{minutes} minutes played', { minutes: game.playtimeMinutes })}`}
                  </small>
                  {game.request && (
                    <small>
                      {t(
                        'components.GameLibrary.requestStatus',
                        'Request: {status}',
                        { status: formatRequestStatus(game.request.status) }
                      )}
                    </small>
                  )}
                  {(game.request || mayRequest) && (
                    <div className="toolbar">
                      {game.request && (
                        <Link
                          className="go"
                          to={`/requests?softwareRequestId=${game.request.id}`}
                        >
                          {tr('Request History')}
                        </Link>
                      )}
                      {mayRequest && (
                        <Link
                          className="btn btn-tonal btn-sm"
                          to={gameCatalogPath(game)}
                        >
                          {t(
                            'components.GameLibrary.requestGame',
                            'Request this game'
                          )}
                        </Link>
                      )}
                    </div>
                  )}
                </div>
                <button
                  className="btn btn-quiet btn-sm"
                  type="button"
                  aria-label={t('lumen.gameLibrary.editNamed', 'Edit {name}', {
                    name: game.title,
                  })}
                  onClick={() => setEditor(game)}
                >
                  {tr('Edit')}
                </button>
              </li>
            ))}
      </ul>
      {(offset > 0 || data?.nextOffset != null) && (
        <nav className="toolbar" aria-label={tr('Game Library Pages')}>
          <button
            className="btn btn-quiet btn-sm"
            disabled={!offset}
            onClick={() => move(Math.max(0, offset - PAGE_SIZE))}
          >
            {tr('Previous Page')}
          </button>
          <button
            className="btn btn-quiet btn-sm"
            disabled={data?.nextOffset == null}
            onClick={() => data?.nextOffset != null && move(data.nextOffset)}
          >
            {tr('Next Page')}
          </button>
        </nav>
      )}
    </>
  );
}

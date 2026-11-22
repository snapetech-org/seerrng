import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { api, ApiError, artUrl, requestSeries } from '../api';
import { Section } from '../components/cards';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ServiceNote } from '../components/extra';
import { streamingOverrideMessage } from '../components/requestSheet';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import {
  filterSwipeCards,
  MAX_SWIPE_SOFTWARE_CURSOR_LENGTH,
  normalizeSwipeCatalogCards,
  softwareRequestBodyFor,
  swipeCatalogUrl,
  type SwipeCatalogFilters,
  type SwipeSoftwareTarget,
} from '../swipeCatalog';
import SwipeHistory from './SwipeHistory';

const recommendations = { movie: 'Movies', tv: 'Series', book: 'Books' };
type Category = keyof typeof recommendations;
const categories = {
  ...recommendations,
  audiobook: 'Audiobooks',
  comic: 'Comics',
  magazine: 'Magazines',
  music: 'Music',
  sports: 'Sports',
  adult: 'Adult',
  'software-retro': 'Retro Games',
  'software-modern': 'Apps',
  'software-game': 'PC Games',
};
type DeckCategory = keyof typeof categories;
const catalogDefaults: SwipeCatalogFilters = {
  query: '',
  genre: '',
  yearFrom: '',
  yearTo: '',
  minimumRating: '',
  publisher: '',
  magazineCatalog: 'tracked',
};
type Decision = 'want' | 'pass' | 'seen';
interface Card {
  id: string;
  title: string;
  subtitle?: string;
  year?: number;
  tags?: string[];
  rating?: number;
  overview?: string;
  imageUrl?: string;
  authorId?: string;
  reason?: string;
  serviceId?: number;
  software?: SwipeSoftwareTarget;
}
interface Status {
  mediaTypes: string[];
  bookFormats: string[];
}
function DeckFilters({
  category,
  disabled,
  query,
  onApply,
  onReset,
}: {
  category: DeckCategory;
  disabled: boolean;
  query: string;
  onApply: (filters: SwipeCatalogFilters) => void;
  onReset: () => void;
}) {
  const { t } = useLumenLocale();
  const [draft, setDraft] = useState(catalogDefaults);
  const basic = category === 'sports' || category === 'adult';
  const ranged = !basic && category !== 'magazine';
  const inverted =
    !!draft.yearFrom &&
    !!draft.yearTo &&
    Number(draft.yearFrom) > Number(draft.yearTo);
  const fields = [
    ...(!basic
      ? [['genre', t('lumen.swipe.genreSubject', 'Genre or Subject')]]
      : []),
    ...(category === 'comic'
      ? [['publisher', t('lumen.swipe.publisher', 'Publisher')]]
      : []),
  ] as [keyof SwipeCatalogFilters, string][];

  return (
    <details className="adv">
      <summary>{t('lumen.swipe.deckFilters', 'Deck Filters')}</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!inverted) onApply({ ...draft, query });
        }}
      >
        <div className="setlist">
          {fields.map(([key, label]) => (
            <label className="set cfg-row" key={key}>
              <span>{label}</span>
              <input
                className="cfg-input"
                maxLength={128}
                disabled={disabled}
                value={draft[key]}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: event.target.value })
                }
              />
            </label>
          ))}
          {category === 'magazine' && (
            <label className="set cfg-row">
              <span>
                {t('lumen.swipe.magazineCatalog', 'Magazine Catalog')}
              </span>
              <select
                className="cfg-select"
                disabled={disabled}
                value={draft.magazineCatalog}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    magazineCatalog:
                      event.target.value === 'public' ? 'public' : 'tracked',
                  })
                }
              >
                <option value="tracked">
                  {t('lumen.swipe.trackedMagazines', 'Tracked Magazines')}
                </option>
                <option value="public">
                  {t('lumen.swipe.publicCatalog', 'Public Catalog')}
                </option>
              </select>
            </label>
          )}
          {ranged && (
            <>
              {(
                [
                  ['yearFrom', t('lumen.swipe.fromYear', 'From Year')],
                  ['yearTo', t('lumen.swipe.toYear', 'To Year')],
                ] as const
              ).map(([key, label]) => (
                <label className="set cfg-row" key={key}>
                  <span>{label}</span>
                  <input
                    className="cfg-input"
                    type="number"
                    min={1800}
                    max={2200}
                    disabled={disabled}
                    value={draft[key]}
                    onChange={(event) =>
                      setDraft({ ...draft, [key]: event.target.value })
                    }
                  />
                </label>
              ))}
              <label className="set cfg-row">
                <span>{t('lumen.swipe.minimumRating', 'Minimum Rating')}</span>
                <input
                  className="cfg-input"
                  type="number"
                  min={0}
                  max={category === 'book' || category === 'audiobook' ? 5 : 10}
                  step={0.5}
                  disabled={disabled}
                  value={draft.minimumRating}
                  onChange={(event) =>
                    setDraft({ ...draft, minimumRating: event.target.value })
                  }
                />
              </label>
            </>
          )}
        </div>
        {inverted && (
          <p className="note" role="alert">
            {t(
              'lumen.swipe.invalidYearRange',
              'The starting year must be before or equal to the ending year.'
            )}
          </p>
        )}
        <div className="toolbar">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={disabled || inverted}
          >
            {t('lumen.swipe.applyFilters', 'Apply Filters')}
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={disabled}
            onClick={() => {
              setDraft(catalogDefaults);
              onReset();
            }}
          >
            {t('lumen.swipe.resetFilters', 'Reset Filters')}
          </button>
        </div>
      </form>
    </details>
  );
}

interface Favorite {
  mediaType: Category;
  id: string;
  title: string;
}

const sameFavorite = (a: Favorite, b: Favorite) =>
  a.mediaType === b.mediaType && a.id === b.id;

function FavoritePicker({
  available,
  selected,
  disabled,
  onChange,
}: {
  available: Category[];
  selected: Favorite[];
  disabled: boolean;
  onChange: (favorites: Favorite[]) => void;
}) {
  const { t } = useLumenLocale();
  const [preferred, setPreferred] = useState<Category>();
  const category =
    preferred && available.includes(preferred) ? preferred : available[0];
  const favorites = useApi<Favorite[]>(
    category ? `/swipe/favorites?mediaType=${category}` : null,
    { currentPathOnly: true }
  );
  const options = [
    ...(favorites.data ?? []),
    ...selected.filter(
      (seed) =>
        seed.mediaType === category &&
        !favorites.data?.some((option) => sameFavorite(seed, option))
    ),
  ];

  return (
    <fieldset className="setlist">
      <legend>
        {t('lumen.swipe.favoriteTitles', 'Favorite Titles ({count} of 25)', {
          count: selected.length,
        })}
      </legend>
      {category && (
        <label className="set cfg-row">
          <span>{t('lumen.swipe.favoriteCategory', 'Favorite Category')}</span>
          <select
            className="cfg-select"
            value={category}
            disabled={disabled}
            onChange={(event) => setPreferred(event.target.value as Category)}
          >
            {available.map((key) => (
              <option key={key} value={key}>
                {t(`lumen.swipe.category.${key}`, categories[key])}
              </option>
            ))}
          </select>
        </label>
      )}
      <ServiceNote
        what={t('lumen.swipe.favoriteTitlesLabel', 'favorite titles')}
        error={favorites.error}
        retry={favorites.reload}
      />
      {category && !favorites.data && !favorites.error && (
        <p className="note" role="status">
          {t('lumen.swipe.loadingFavorites', 'Loading favorite titles…')}
        </p>
      )}
      {favorites.data && !options.length && (
        <p className="note">
          {t(
            'lumen.swipe.noFavorites',
            'No titles are available from your library or requests.'
          )}
        </p>
      )}
      {options.map((seed) => {
        const checked = selected.some((item) => sameFavorite(seed, item));
        return (
          <label className="set cfg-row" key={`${seed.mediaType}:${seed.id}`}>
            <span>{seed.title}</span>
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled || (!checked && selected.length >= 25)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, seed]
                    : selected.filter((item) => !sameFavorite(seed, item))
                )
              }
            />
          </label>
        );
      })}
    </fieldset>
  );
}

interface Profile {
  seriesRequest: 'first-season' | 'all-seasons';
  bookFormat: 'ebook' | 'audiobook';
  tasteNotes?: string;
  seedScope?: 'full' | 'rated' | 'favorites';
  favoriteSeeds?: Favorite[];
}

function Preferences({
  profile,
  onSave,
  available,
}: {
  profile: Profile;
  onSave: (profile: Profile) => void;
  available: Category[];
}) {
  const { t } = useLumenLocale();
  const [draft, setDraft] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const pending = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile);

  function update(patch: Partial<Profile>) {
    setDraft((current) => ({ ...current, ...patch }));
    setFeedback(undefined);
  }

  async function save() {
    if (pending.current || !dirty) return;
    pending.current = true;
    setBusy(true);
    setFeedback(undefined);
    const generation = sessionGeneration();
    try {
      const {
        seriesRequest,
        bookFormat,
        tasteNotes,
        seedScope,
        favoriteSeeds,
      } = draft;
      const saved = await api<Profile>('/swipe/profile', {
        method: 'PUT',
        body: JSON.stringify({
          seriesRequest,
          bookFormat,
          tasteNotes,
          seedScope,
          ...(favoriteSeeds !== profile.favoriteSeeds ? { favoriteSeeds } : {}),
        }),
      });
      if (generation !== sessionGeneration()) return;
      setDraft(saved);
      onSave(saved);
      setFeedback({
        text: t('lumen.swipe.preferencesSaved', 'Swipe preferences saved.'),
      });
    } catch (failure) {
      if (generation === sessionGeneration())
        setFeedback({
          text:
            failure instanceof ApiError
              ? failure.message
              : t(
                  'lumen.swipe.preferencesSaveError',
                  'Could not save Swipe preferences.'
                ),
          error: true,
        });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <details className="adv">
      <summary>{t('lumen.swipe.preferences', 'Swipe Preferences')}</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="setlist">
          <label className="set cfg-row">
            <span>
              {t('lumen.swipe.seriesRequestDefault', 'Series Request Default')}
            </span>
            <select
              className="cfg-select"
              disabled={busy}
              value={draft.seriesRequest}
              onChange={(event) =>
                update({
                  seriesRequest: event.target.value as Profile['seriesRequest'],
                })
              }
            >
              <option value="first-season">
                {t('lumen.swipe.firstSeason', 'First Season')}
              </option>
              <option value="all-seasons">
                {t('lumen.swipe.allSeasons', 'All Seasons')}
              </option>
            </select>
          </label>
          <label className="set cfg-row">
            <span>
              {t('lumen.swipe.bookRequestFormat', 'Book Request Format')}
            </span>
            <select
              className="cfg-select"
              disabled={busy}
              value={draft.bookFormat}
              onChange={(event) =>
                update({
                  bookFormat: event.target.value as Profile['bookFormat'],
                })
              }
            >
              <option value="ebook">{t('lumen.swipe.ebook', 'Ebook')}</option>
              <option value="audiobook">
                {t('lumen.swipe.audiobook', 'Audiobook')}
              </option>
            </select>
          </label>
          <label className="set cfg-row">
            <span>
              {t('lumen.swipe.recommendationSources', 'Recommendation Sources')}
            </span>
            <select
              className="cfg-select"
              disabled={busy}
              value={draft.seedScope ?? 'full'}
              onChange={(event) =>
                update({
                  seedScope: event.target.value as Profile['seedScope'],
                })
              }
            >
              <option value="full">
                {t('lumen.swipe.fullHistory', 'Full History')}
              </option>
              <option value="rated">
                {t('lumen.swipe.ratedTitles', 'Rated Titles')}
              </option>
              <option value="favorites">
                {t('lumen.swipe.selectedFavorites', 'Selected Favorites')}
              </option>
            </select>
          </label>
          <label className="set cfg-row">
            <span>{t('lumen.swipe.tasteNotes', 'Taste Notes')}</span>
            <textarea
              className="cfg-json"
              maxLength={1000}
              disabled={busy}
              value={draft.tasteNotes ?? ''}
              onChange={(event) => update({ tasteNotes: event.target.value })}
            />
          </label>
        </div>
        {draft.seedScope === 'favorites' && (
          <FavoritePicker
            available={available}
            selected={draft.favoriteSeeds ?? []}
            disabled={busy}
            onChange={(favoriteSeeds) => update({ favoriteSeeds })}
          />
        )}
        {feedback && (
          <p className="note" role={feedback.error ? 'alert' : 'status'}>
            {feedback.text}
          </p>
        )}
        <div className="toolbar">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={busy || !dirty}
          >
            {t('lumen.swipe.savePreferences', 'Save Swipe Preferences')}
          </button>
        </div>
      </form>
    </details>
  );
}

function Deck({
  category,
  formats,
  profile,
}: {
  category: DeckCategory;
  formats: string[];
  profile: Profile | null;
}) {
  const { t } = useLumenLocale();
  const catalog = !Object.hasOwn(recommendations, category);
  const [refresh, setRefresh] = useState(false);
  const software = category.startsWith('software-');
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState<string>();
  const [offset, setOffset] = useState<number>();
  const [selection, setSelection] = useState<{
    cardId: string;
    index: number;
  }>();
  const [filters, setFilters] = useState(catalogDefaults);
  const [queryDraft, setQueryDraft] = useState(filters.query);
  const filtered = Object.keys(catalogDefaults).some(
    (key) =>
      filters[key as keyof SwipeCatalogFilters] !==
      catalogDefaults[key as keyof SwipeCatalogFilters]
  );
  const deckPath = catalog
    ? swipeCatalogUrl(category, filters, page, 'first', cursor, offset).slice(
        '/api/v1'.length
      )
    : `/swipe/deck?mediaType=${category}${refresh ? '&refresh=true' : ''}`;
  const deck = useApi<{
    cards?: Card[];
    remaining?: number;
    totalPages?: number;
    nextCursor?: string | null;
    nextOffset?: number | null;
  }>(deckPath, { currentPathOnly: true });
  const history = useApi<{ decisions: { id: string }[] }>(
    catalog ? `/swipe/decisions?mediaType=${category}` : null
  );
  const [handled, setHandled] = useState<string[]>([]);
  const [restored, setRestored] = useState<Card>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [streamingOverride, setStreamingOverride] = useState<{
    cardId: string;
    generation: number;
    seasons: 'all' | number[];
    message: string;
  }>();
  const pending = useRef(false);
  const catalogCards = catalog
    ? filterSwipeCards(normalizeSwipeCatalogCards(category, deck.data), filters)
    : [];
  const card =
    restored ??
    (catalog
      ? history.data &&
        catalogCards.find(
          ({ id }) =>
            !handled.includes(id) &&
            !history.data?.decisions.some((item) => item.id === id)
        )
      : deck.data?.cards?.find(
          (item) =>
            !handled.includes(item.id) &&
            (!filtered ||
              filterSwipeCards(
                [{ ...item, mediaType: category, tags: item.tags ?? [] }],
                filters
              ).length > 0)
        ));
  const format = formats.includes(profile?.bookFormat ?? '')
    ? profile?.bookFormat
    : formats[0];

  const softwareTarget = card?.software;
  const targets =
    softwareTarget?.category === 'game'
      ? softwareTarget.pcVariants.map((variant) => ({
          label: `${{ windows: 'Windows', linux: 'Linux', macos: 'macOS' }[variant.operatingSystem]} · ${variant.architecture}`,
          variant,
        }))
      : (softwareTarget?.systems.map(({ name, slug }) => ({
          label: name,
          variant: { system: slug },
        })) ?? []);
  const targetIndex =
    selection && selection.cardId === card?.id ? selection.index : -1;
  const target = targets[targetIndex];
  const softwareBody =
    softwareTarget &&
    target &&
    softwareRequestBodyFor(softwareTarget, target.variant);
  const canRequest = software
    ? !!softwareBody
    : !!profile && (category !== 'book' || !!format);
  const nextCursor = deck.data?.nextCursor;
  const nextOffset = deck.data?.nextOffset;
  const moreSoftware = filters.query.trim()
    ? !!nextCursor &&
      nextCursor !== cursor &&
      nextCursor.length <= MAX_SWIPE_SOFTWARE_CURSOR_LENGTH
    : typeof nextOffset === 'number' &&
      Number.isSafeInteger(nextOffset) &&
      nextOffset > (offset ?? 0);

  const gesture = useRef<{
    pointer: number;
    cardId: string;
    x: number;
    y: number;
  }>(undefined);

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.target !== event.currentTarget ||
      event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    const shortcuts: Record<string, Decision | 'undo'> = {
      ArrowLeft: 'pass',
      ArrowRight: 'want',
      ArrowUp: 'seen',
      Backspace: 'undo',
    };
    const decision = Object.hasOwn(shortcuts, event.key)
      ? shortcuts[event.key]
      : undefined;
    if (!decision) return;
    event.preventDefault();
    void act(decision);
  }

  function startGesture(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'touch' || !event.isPrimary || !card || busy)
      return;
    gesture.current = {
      pointer: event.pointerId,
      cardId: card.id,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function finishGesture(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    if (!start || start.pointer !== event.pointerId) return;
    gesture.current = undefined;
    if (start.cardId !== card?.id) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    const threshold = 50;
    if (Math.abs(x) >= threshold && Math.abs(x) > Math.abs(y) * 1.25)
      void act(x < 0 ? 'pass' : 'want');
    else if (y <= -threshold && -y > Math.abs(x) * 1.25) void act('seen');
  }

  function nextDeck(regenerate: boolean) {
    if (catalog) {
      if (software) {
        if (!moreSoftware) return;
        setCursor(nextCursor ?? undefined);
        setOffset(nextOffset ?? undefined);
      }
      setPage((value) => value + 1);
      return;
    }
    setHandled([]);
    setRestored(undefined);
    if (refresh === regenerate) deck.reload();
    else setRefresh(regenerate);
  }

  async function act(
    decision: Decision | 'undo',
    override?: NonNullable<typeof streamingOverride>
  ) {
    if (
      pending.current ||
      (override &&
        (override.cardId !== card?.id ||
          override.generation !== sessionGeneration())) ||
      (decision === 'undo' ? !deck.data : !card) ||
      (decision === 'want' && !canRequest)
    )
      return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    setStreamingOverride(undefined);
    const seasons =
      override?.seasons ??
      (profile?.seriesRequest === 'all-seasons' ? 'all' : [1]);
    const requestOptions = override
      ? { bypassStreamingRequestPolicy: true }
      : {};
    let requested = false;
    const body = (values: object) => ({
      method: 'POST',
      body: JSON.stringify(values),
    });
    try {
      if (decision === 'undo') {
        const result = await api<{ card: Card }>(
          '/swipe/undo',
          body({ mediaType: category })
        );
        if (generation !== sessionGeneration()) return;
        if (catalog) history.reload();
        setSelection(undefined);
        setRestored(result.card);
        return;
      }
      if (!card) return;
      if (decision === 'want') {
        if (category === 'tv')
          await requestSeries(Number(card.id), seasons, requestOptions);
        else
          await api(
            software ? '/request/software' : '/request',
            body(
              softwareBody || {
                mediaType: category === 'audiobook' ? 'book' : category,
                ...requestOptions,
                mediaId:
                  category === 'movie' || category === 'comic'
                    ? Number(card.id)
                    : card.id,
                ...(category === 'book' || category === 'audiobook'
                  ? {
                      authorId: card.authorId,
                      format: category === 'audiobook' ? 'audiobook' : format,
                    }
                  : {}),
                ...(card.serviceId !== undefined &&
                ['magazine', 'sports', 'adult'].includes(category)
                  ? { serverId: card.serviceId }
                  : {}),
              }
            )
          );
        requested = true;
      }
      if (generation !== sessionGeneration()) return;
      await api(
        '/swipe/decisions',
        body({
          mediaType: category,
          id: card.id,
          decision,
          ...(catalog ? { card } : {}),
        })
      );
      if (generation !== sessionGeneration()) return;
      if (requested)
        setNotice(
          t('lumen.swipe.requestedTitle', '{title} requested.', {
            title: card.title,
          })
        );
      setHandled((ids) => [...ids, card.id]);
      setRestored(undefined);
    } catch (failure) {
      if (generation !== sessionGeneration()) return;
      const message = streamingOverrideMessage(failure);
      if (
        !requested &&
        !override &&
        decision === 'want' &&
        card &&
        (category === 'movie' || category === 'tv') &&
        message !== undefined
      ) {
        setStreamingOverride({ cardId: card.id, generation, seasons, message });
      } else if (requested && card) {
        setHandled((ids) => [...ids, card.id]);
        setRestored(undefined);
        setError(
          t(
            'lumen.swipe.historySaveError',
            'The request was created, but Swipe could not save its history.'
          )
        );
      } else {
        setError(
          failure instanceof ApiError
            ? failure.message
            : t('lumen.swipe.updateError', 'Could not update Swipe. Try again.')
        );
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const image = artUrl(card?.imageUrl);

  function applyFilters(next: SwipeCatalogFilters) {
    setFilters(next);
    setQueryDraft(next.query);
    setCursor(undefined);
    setOffset(undefined);
    setPage(1);
    setRestored(undefined);
  }

  return (
    <Section
      title={t(`lumen.swipe.category.${category}`, categories[category])}
    >
      {streamingOverride &&
        streamingOverride.cardId === card?.id &&
        streamingOverride.generation === sessionGeneration() && (
          <ConfirmSheet
            title={t('lumen.swipe.streamingPolicy', 'Streaming Request Policy')}
            body={streamingOverride.message}
            confirm={t('lumen.swipe.requestAnyway', 'Request Anyway')}
            cancel={t('lumen.swipe.cancel', 'Cancel')}
            onClose={() => setStreamingOverride(undefined)}
            onConfirm={() => void act('want', streamingOverride)}
          />
        )}
      <form
        className="toolbar"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters({ ...filters, query: queryDraft.trim() });
        }}
      >
        <label className="sr-only" htmlFor={`swipe-catalog-search-${category}`}>
          {t('lumen.swipe.searchTitles', 'Search Titles')}
        </label>
        <input
          id={`swipe-catalog-search-${category}`}
          className="cfg-input"
          type="search"
          maxLength={128}
          placeholder={t('lumen.swipe.searchTitles', 'Search titles')}
          value={queryDraft}
          disabled={busy}
          onChange={(event) => setQueryDraft(event.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={busy}
        >
          {t('lumen.swipe.searchDeck', 'Search Deck')}
        </button>
      </form>
      <DeckFilters
        category={category}
        disabled={busy}
        query={filters.query}
        onApply={(next) => applyFilters({ ...next, query: filters.query })}
        onReset={() => applyFilters(catalogDefaults)}
      />
      <ServiceNote
        what={t('lumen.swipe.previousDecisions', 'previous decisions')}
        error={history.error}
        retry={history.reload}
      />
      <ServiceNote
        what={t('lumen.swipe.recommendations', 'recommendations')}
        error={deck.error}
        retry={deck.reload}
      />
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- The focusable region exposes keyboard shortcuts alongside native buttons. */}
      <div
        role="application"
        aria-label={t('lumen.swipe.shortcuts', 'Swipe shortcuts')}
        aria-describedby="swipe-shortcuts"
        tabIndex={0}
        onKeyDown={handleKey}
      >
        <p id="swipe-shortcuts" className="note">
          {t(
            'lumen.swipe.shortcutHelp',
            'Focus here for keyboard shortcuts. Left passes, right requests, up marks seen or read, and Backspace undoes.'
          )}
        </p>
      </div>
      {card ? (
        <>
          <div
            className="gesture-surface"
            onPointerDown={startGesture}
            onPointerUp={finishGesture}
            onPointerCancel={() => {
              gesture.current = undefined;
            }}
          >
            {image && (
              <div className="poster">
                <div className="art">
                  <img
                    src={image}
                    referrerPolicy="no-referrer"
                    alt=""
                    draggable={false}
                  />
                </div>
              </div>
            )}
            <h3>{card.title}</h3>
          </div>
          {(card.subtitle || card.year) && (
            <p className="note">
              {[card.subtitle, card.year].filter(Boolean).join(' · ')}
            </p>
          )}
          {card.overview && <p>{card.overview}</p>}
          {card.reason && <p className="note">{card.reason}</p>}
          {softwareTarget && (
            <div className="setlist">
              <label className="set cfg-row">
                <span>
                  {softwareTarget.category === 'game'
                    ? t('lumen.swipe.pcVariant', 'PC Variant')
                    : t('lumen.swipe.targetSystem', 'Target System')}
                </span>
                <select
                  className="cfg-select"
                  value={targetIndex}
                  disabled={busy}
                  onChange={(event) =>
                    setSelection({
                      cardId: card.id,
                      index: Number(event.target.value),
                    })
                  }
                >
                  <option value={-1}>
                    {t('lumen.swipe.chooseTarget', 'Choose a Request Target')}
                  </option>
                  {targets.map(({ label }, index) => (
                    <option key={label} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="toolbar">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !canRequest}
              onClick={() => void act('want')}
            >
              {t('lumen.swipe.request', 'Request')}
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => void act('pass')}
            >
              {t('lumen.swipe.pass', 'Pass')}
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => void act('seen')}
            >
              {['book', 'audiobook', 'comic', 'magazine'].includes(category)
                ? t('lumen.swipe.alreadyRead', 'Already Read')
                : t('lumen.swipe.alreadySeen', 'Already Seen')}
            </button>
          </div>
        </>
      ) : deck.data && (!catalog || history.data) ? (
        <p className="note">
          {filtered
            ? t(
                'lumen.swipe.noFilteredTitles',
                'No more titles match these filters on this page.'
              )
            : t(
                'lumen.swipe.noRecommendations',
                'No more recommendations in this deck.'
              )}
        </p>
      ) : (
        !deck.error &&
        !history.error && (
          <p className="note" role="status">
            {t(
              'lumen.swipe.loadingRecommendations',
              'Loading recommendations…'
            )}
          </p>
        )
      )}
      <div className="toolbar">
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          disabled={busy || !deck.data}
          onClick={() => void act('undo')}
        >
          {t('lumen.swipe.undoDecision', 'Undo Last Decision')}
        </button>
        {!card &&
          deck.data &&
          (!catalog ||
            (software ? moreSoftware : (deck.data.totalPages ?? 0) > page)) && (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() =>
                nextDeck(
                  filtered || (deck.data?.remaining ?? 0) <= handled.length
                )
              }
            >
              {t('lumen.swipe.loadMore', 'Load More Recommendations')}
            </button>
          )}
      </div>
    </Section>
  );
}

export default function Swipe() {
  const { t } = useLumenLocale();
  const status = useApi<Status>('/swipe/status');
  const profile = useApi<Profile>(status.data ? '/swipe/profile' : null);
  const [savedProfile, setSavedProfile] = useState<Profile>();
  const currentProfile = savedProfile ?? profile.data;
  const [showHistory, setShowHistory] = useState(false);
  const [selected, setSelected] = useState<DeckCategory>();
  const available = (Object.keys(categories) as DeckCategory[]).filter(
    (category) => status.data?.mediaTypes.includes(category)
  );
  const category =
    selected && available.includes(selected) ? selected : available[0];
  return (
    <>
      <h1>{t('lumen.swipe.title', 'Swipe')}</h1>
      {status.errorStatus === 404 || status.errorStatus === 403 ? (
        <p className="note">
          {t(
            'lumen.swipe.unavailable',
            'Swipe is unavailable for this account.'
          )}
        </p>
      ) : (
        <ServiceNote
          what={t('lumen.swipe.title', 'Swipe')}
          error={status.error}
          retry={status.reload}
        />
      )}
      {!status.data && !status.error && (
        <p className="note" role="status">
          {t('lumen.swipe.loading', 'Loading Swipe…')}
        </p>
      )}
      {status.data && !category && (
        <p className="note">
          {t(
            'lumen.swipe.noCategories',
            'No recommendation categories are available.'
          )}
        </p>
      )}
      <ServiceNote
        what={t('lumen.swipe.requestPreferences', 'request preferences')}
        error={profile.error}
        retry={profile.reload}
      />
      {currentProfile && (
        <Preferences
          profile={currentProfile}
          onSave={setSavedProfile}
          available={available.filter((key): key is Category =>
            Object.hasOwn(recommendations, key)
          )}
        />
      )}
      {status.data && (
        <div className="toolbar">
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => setShowHistory((value) => !value)}
          >
            {showHistory
              ? t(
                  'lumen.swipe.backToRecommendations',
                  'Back to Recommendations'
                )
              : t('lumen.swipe.viewHistory', 'View Swipe History')}
          </button>
        </div>
      )}
      {showHistory && status.data && (
        <SwipeHistory categories={status.data.mediaTypes} />
      )}
      {category && !showHistory && (
        <>
          <div className="toolbar">
            <label className="set cfg-row">
              <span>{t('lumen.swipe.categoryLabel', 'Category')}</span>
              <select
                className="cfg-select"
                value={category}
                onChange={(event) =>
                  setSelected(event.target.value as DeckCategory)
                }
              >
                {available.map((key) => (
                  <option key={key} value={key}>
                    {t(`lumen.swipe.category.${key}`, categories[key])}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Deck
            key={category}
            category={category}
            formats={status.data?.bookFormats ?? []}
            profile={currentProfile}
          />
        </>
      )}
    </>
  );
}

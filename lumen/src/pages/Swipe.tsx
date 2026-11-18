import { useRef, useState } from 'react';
import { api, ApiError, artUrl } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';

const categories = { movie: 'Movies', tv: 'Series', book: 'Books' };
type Category = keyof typeof categories;
type Decision = 'want' | 'pass' | 'seen';
interface Card {
  id: string;
  title: string;
  subtitle?: string;
  year?: string | number;
  overview?: string;
  imageUrl?: string;
  authorId?: string;
  reason?: string;
}
interface Status {
  mediaTypes: string[];
  bookFormats: string[];
}
interface Profile {
  seriesRequest: 'first-season' | 'all-seasons';
  bookFormat: 'ebook' | 'audiobook';
  tasteNotes?: string;
  seedScope?: 'full' | 'rated' | 'favorites';
}

function Preferences({
  profile,
  onSave,
}: {
  profile: Profile;
  onSave: (profile: Profile) => void;
}) {
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
      const { seriesRequest, bookFormat, tasteNotes, seedScope } = draft;
      const saved = await api<Profile>('/swipe/profile', {
        method: 'PUT',
        body: JSON.stringify({
          seriesRequest,
          bookFormat,
          tasteNotes,
          seedScope,
        }),
      });
      if (generation !== sessionGeneration()) return;
      setDraft(saved);
      onSave(saved);
      setFeedback({ text: 'Swipe preferences saved.' });
    } catch (failure) {
      if (generation === sessionGeneration())
        setFeedback({
          text:
            failure instanceof ApiError
              ? failure.message
              : 'Could not save Swipe preferences.',
          error: true,
        });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <details className="adv">
      <summary>Swipe Preferences</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="setlist">
          <label className="set cfg-row">
            <span>Series Request Default</span>
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
              <option value="first-season">First Season</option>
              <option value="all-seasons">All Seasons</option>
            </select>
          </label>
          <label className="set cfg-row">
            <span>Book Request Format</span>
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
              <option value="ebook">Ebook</option>
              <option value="audiobook">Audiobook</option>
            </select>
          </label>
          <label className="set cfg-row">
            <span>Recommendation Sources</span>
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
              <option value="full">Full History</option>
              <option value="rated">Rated Titles</option>
              <option value="favorites">Selected Favorites</option>
            </select>
          </label>
          <label className="set cfg-row">
            <span>Taste Notes</span>
            <textarea
              className="cfg-json"
              maxLength={1000}
              disabled={busy}
              value={draft.tasteNotes ?? ''}
              onChange={(event) => update({ tasteNotes: event.target.value })}
            />
          </label>
        </div>
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
            Save Swipe Preferences
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
  category: Category;
  formats: string[];
  profile: Profile | null;
}) {
  const [refresh, setRefresh] = useState(false);
  const deck = useApi<{ cards: Card[]; remaining: number }>(
    `/swipe/deck?mediaType=${category}${refresh ? '&refresh=true' : ''}`,
    { currentPathOnly: true }
  );
  const [handled, setHandled] = useState<string[]>([]);
  const [restored, setRestored] = useState<Card>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const card =
    restored ?? deck.data?.cards.find(({ id }) => !handled.includes(id));
  const format = formats.includes(profile?.bookFormat ?? '')
    ? profile?.bookFormat
    : formats[0];

  function nextDeck(regenerate: boolean) {
    setHandled([]);
    setRestored(undefined);
    if (refresh === regenerate) deck.reload();
    else setRefresh(regenerate);
  }

  async function act(decision: Decision | 'undo') {
    if (pending.current || (decision !== 'undo' && !card)) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
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
        setRestored(result.card);
        return;
      }
      if (!card) return;
      if (decision === 'want') {
        if (!profile || (category === 'book' && !format)) return;
        await api(
          '/request',
          body({
            mediaType: category,
            mediaId: category === 'book' ? card.id : Number(card.id),
            ...(category === 'tv'
              ? {
                  seasons:
                    profile.seriesRequest === 'all-seasons' ? 'all' : [1],
                }
              : {}),
            ...(category === 'book' ? { authorId: card.authorId, format } : {}),
          })
        );
        requested = true;
      }
      if (generation !== sessionGeneration()) return;
      await api(
        '/swipe/decisions',
        body({ mediaType: category, id: card.id, decision })
      );
      if (generation !== sessionGeneration()) return;
      if (requested) setNotice(`${card.title} requested.`);
      setHandled((ids) => [...ids, card.id]);
      setRestored(undefined);
    } catch (failure) {
      if (generation !== sessionGeneration()) return;
      if (requested && card) {
        setHandled((ids) => [...ids, card.id]);
        setRestored(undefined);
        setError(
          'The request was created, but Swipe could not save its history.'
        );
      } else {
        setError(
          failure instanceof ApiError
            ? failure.message
            : 'Could not update Swipe. Try again.'
        );
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const image = artUrl(card?.imageUrl);
  return (
    <Section title={categories[category]}>
      <ServiceNote
        what="recommendations"
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
      {card ? (
        <>
          {image && (
            <div className="poster">
              <div className="art">
                <img src={image} alt="" />
              </div>
            </div>
          )}
          <h3>{card.title}</h3>
          {(card.subtitle || card.year) && (
            <p className="note">
              {[card.subtitle, card.year].filter(Boolean).join(' · ')}
            </p>
          )}
          {card.overview && <p>{card.overview}</p>}
          {card.reason && <p className="note">{card.reason}</p>}
          <div className="toolbar">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || !profile || (category === 'book' && !format)}
              onClick={() => void act('want')}
            >
              Request
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => void act('pass')}
            >
              Pass
            </button>
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => void act('seen')}
            >
              {category === 'book' ? 'Already Read' : 'Already Seen'}
            </button>
          </div>
        </>
      ) : deck.data ? (
        <p className="note">No more recommendations in this deck.</p>
      ) : (
        !deck.error && (
          <p className="note" role="status">
            Loading recommendations…
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
          Undo Last Decision
        </button>
        {!card && deck.data && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={() => nextDeck(deck.data!.remaining <= handled.length)}
          >
            Load More Recommendations
          </button>
        )}
      </div>
    </Section>
  );
}

export default function Swipe() {
  const status = useApi<Status>('/swipe/status');
  const profile = useApi<Profile>(status.data ? '/swipe/profile' : null);
  const [savedProfile, setSavedProfile] = useState<Profile>();
  const currentProfile = savedProfile ?? profile.data;
  const [selected, setSelected] = useState<Category>();
  const available = (Object.keys(categories) as Category[]).filter((category) =>
    status.data?.mediaTypes.includes(category)
  );
  const category =
    selected && available.includes(selected) ? selected : available[0];
  return (
    <>
      <h1>Swipe</h1>
      {status.errorStatus === 404 || status.errorStatus === 403 ? (
        <p className="note">Swipe is unavailable for this account.</p>
      ) : (
        <ServiceNote what="Swipe" error={status.error} retry={status.reload} />
      )}
      {!status.data && !status.error && (
        <p className="note" role="status">
          Loading Swipe…
        </p>
      )}
      {status.data && !category && (
        <p className="note">No recommendation categories are available.</p>
      )}
      <ServiceNote
        what="request preferences"
        error={profile.error}
        retry={profile.reload}
      />
      {currentProfile && (
        <Preferences profile={currentProfile} onSave={setSavedProfile} />
      )}
      {category && (
        <>
          <div className="toolbar">
            <label className="set cfg-row">
              <span>Category</span>
              <select
                className="cfg-select"
                value={category}
                onChange={(event) =>
                  setSelected(event.target.value as Category)
                }
              >
                {available.map((key) => (
                  <option key={key} value={key}>
                    {categories[key]}
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

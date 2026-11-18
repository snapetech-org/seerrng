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
  bookFormat: string;
}

function Deck({
  category,
  formats,
}: {
  category: Category;
  formats: string[];
}) {
  const [refresh, setRefresh] = useState(false);
  const deck = useApi<{ cards: Card[]; remaining: number }>(
    `/swipe/deck?mediaType=${category}${refresh ? '&refresh=true' : ''}`,
    { currentPathOnly: true }
  );
  const profile = useApi<Profile>('/swipe/profile');
  const [handled, setHandled] = useState<string[]>([]);
  const [restored, setRestored] = useState<Card>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const card =
    restored ?? deck.data?.cards.find(({ id }) => !handled.includes(id));
  const format = formats.includes(profile.data?.bookFormat ?? '')
    ? profile.data?.bookFormat
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
        if (!profile.data || (category === 'book' && !format)) return;
        await api(
          '/request',
          body({
            mediaType: category,
            mediaId: category === 'book' ? card.id : Number(card.id),
            ...(category === 'tv'
              ? {
                  seasons:
                    profile.data.seriesRequest === 'all-seasons' ? 'all' : [1],
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
      <ServiceNote
        what="request preferences"
        error={profile.error}
        retry={profile.reload}
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
              disabled={
                busy || !profile.data || (category === 'book' && !format)
              }
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
          />
        </>
      )}
    </>
  );
}

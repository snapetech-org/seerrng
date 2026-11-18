import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, bookArt, bookDetailPath } from '../api';
import { Cover, Section } from '../components/cards';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { useToast } from '../components/toast';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';

type Availability = { available: boolean; code?: string };
type Feed = {
  id: number;
  title: string;
  description?: string;
  source: string;
  owner?: string;
  likes: number;
};
type Book = {
  id: number;
  title: string;
  author?: string;
  isbn13?: string;
  imageUrl?: string;
  series?: { name: string; position?: number };
};
type Books = Availability & { books?: Book[]; total?: number };

function unavailable(code?: string) {
  switch (code) {
    case 'no-token':
      return 'Add a Hardcover API token to a Hardcover list in your profile.';
    case 'scope':
      return 'Your Hardcover token needs permission to read recommendation feeds.';
    case 'rejected':
      return 'Hardcover rejected your API token.';
    default:
      return 'Hardcover recommendations are unavailable.';
  }
}

const filters = [
  ['standalones', 'Standalones only'],
  ['firstInSeries', 'Standalones and first books in a series'],
  ['lessPopular', 'Less popular discoveries'],
] as const;

export default function BookRecommendations() {
  const feeds = useApi<Availability & { results?: Feed[] }>(
    '/book-recommendations'
  );
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const feedId = params.get('feed');
  const bookmarkedFeed = feeds.data?.results?.find(
    ({ id }) => String(id) === feedId
  );
  const [selected, select] = useState<Feed>();
  const [books, setBooks] = useState<Books>();
  const [busy, setBusy] = useState(false);
  const loadingFeed = useRef(false);
  const creatingFeed = useRef(false);
  const [feedError, setFeedError] = useState<string>();
  const [flags, setFlags] = useState({
    standalones: false,
    firstInSeries: false,
    lessPopular: false,
  });
  const [include, setInclude] = useState('');
  const [exclude, setExclude] = useState('');
  const [feedback, setFeedback] = useState<Record<number, 'more' | 'less'>>({});
  const format = params.get('format') === 'audiobook' ? 'audiobook' : 'ebook';
  const [title, setTitle] = useState('');
  const [mood, setMood] = useState('');
  const [description, setDescription] = useState('');
  const [genres, setGenres] = useState('');
  const [avoidGenres, setAvoidGenres] = useState('');
  const [seriesPosition, setSeriesPosition] = useState('');
  const [createLessPopular, setCreateLessPopular] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const votes = (value: 'more' | 'less', source = feedback) =>
    Object.keys(source)
      .filter((id) => source[Number(id)] === value)
      .map(Number);
  const names = (value: string) =>
    value
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

  async function load(feed: Feed, next = feedback) {
    if (busy || loadingFeed.current) return;
    loadingFeed.current = true;
    setFeedError(undefined);
    if (selected?.id !== feed.id) {
      setBooks(undefined);
      setFeedback({});
    }
    select(feed);
    setBusy(true);
    try {
      const result = await api<Books>(
        `/book-recommendations/${feed.id}/books`,
        {
          method: 'POST',
          body: JSON.stringify({
            tuning: {
              ...flags,
              includeAuthors: names(include),
              excludeAuthors: names(exclude),
              moreLike: votes('more', next),
              lessLike: votes('less', next),
            },
          }),
        }
      );
      if (!result.available) {
        setFeedError(unavailable(result.code));
        return;
      }
      setBooks(result);
      setFeedback(next);
    } catch (error) {
      setFeedError(friendlyError(error, 'Could not load this feed.'));
    } finally {
      loadingFeed.current = false;
      setBusy(false);
    }
  }

  const loadBookmarkedFeed = useEffectEvent((feed: Feed) => {
    void load(feed, {});
  });
  useEffect(() => {
    if (busy) return;
    if (bookmarkedFeed && bookmarkedFeed.id !== selected?.id) {
      loadBookmarkedFeed(bookmarkedFeed);
    } else if (!feedId && selected) {
      select(undefined);
      setBooks(undefined);
      setFeedback({});
      setFeedError(undefined);
    }
  }, [bookmarkedFeed, busy, feedId, selected]);

  async function openBook(book: Book) {
    setBusy(true);
    try {
      const result = await api<{
        groups: {
          candidates: { id: string; mediaType: string; title?: string }[];
        }[];
      }>('/resolve', {
        method: 'POST',
        body: JSON.stringify({
          isbn: book.isbn13,
          text: book.isbn13
            ? undefined
            : [book.title, book.author].filter(Boolean).join(' by '),
          types: ['book'],
          formatHint: format,
        }),
      });
      const match = result.groups[0]?.candidates.find(
        (candidate) => candidate.mediaType === 'book'
      );
      if (!match?.id) throw new Error('No catalog match was found.');
      navigate(bookDetailPath(match.id, format, match.title || book.title));
    } catch (error) {
      toast(friendlyError(error, 'Could not find this book.'));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!title.trim() || busy || creatingFeed.current) return;
    creatingFeed.current = true;
    setCreateError(undefined);
    setBusy(true);
    try {
      const result = await api<{ id?: number; code?: string }>(
        '/book-recommendations',
        {
          method: 'POST',
          body: JSON.stringify({
            title: title.trim(),
            mood: mood.trim() || undefined,
            description: description.trim() || undefined,
            genres: names(genres),
            avoidGenres: names(avoidGenres),
            seriesPosition: seriesPosition || undefined,
            lessPopular: createLessPopular,
            likeBookIds: votes('more'),
            dislikeBookIds: votes('less'),
          }),
        }
      );
      if (!result.id) throw new Error(unavailable(result.code));
      setTitle('');
      setMood('');
      setDescription('');
      setGenres('');
      setAvoidGenres('');
      setSeriesPosition('');
      setCreateLessPopular(false);
      const next = new URLSearchParams(params);
      next.set('feed', String(result.id));
      setParams(next);
      feeds.reload();
      toast('Recommendation feed created.');
    } catch (error) {
      setCreateError(friendlyError(error, 'Could not create the feed.'));
    } finally {
      creatingFeed.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <ExtraHeader title="Book Recommendations" />
      <ServiceNote
        error={feeds.error}
        what="recommendation feeds"
        retry={feeds.reload}
      />
      {!feeds.data && !feeds.error && (
        <div className="detail-loading" aria-busy="true" />
      )}
      {feeds.data && !feeds.data.available && (
        <p className="note">{unavailable(feeds.data.code)}</p>
      )}
      {feeds.data?.available && (
        <>
          <Section title="Hardcover Feeds">
            <ul className="setlist">
              {feeds.data.results?.map((feed) => (
                <li className="set" key={feed.id}>
                  <span>
                    <b>{feed.title}</b>
                    <small>
                      {[
                        feed.source === 'mine'
                          ? 'Yours'
                          : feed.source === 'featured'
                            ? 'Featured'
                            : 'Popular',
                        feed.owner,
                        `${feed.likes} likes`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                    {feed.description && <small>{feed.description}</small>}
                  </span>
                  <button
                    className="btn btn-quiet btn-sm"
                    disabled={busy}
                    onClick={() => {
                      if (feedId === String(feed.id)) {
                        void load(feed, {});
                      } else {
                        const next = new URLSearchParams(params);
                        next.set('feed', String(feed.id));
                        setParams(next, { preventScrollReset: true });
                      }
                    }}
                    aria-label={`Show Books: ${feed.title}`}
                  >
                    Show Books
                  </button>
                </li>
              ))}
            </ul>
            {feedId && !bookmarkedFeed && (
              <>
                <p className="note" role="status">
                  This recommendation feed is unavailable.
                </p>
                <div className="toolbar">
                  <button
                    className="btn btn-quiet btn-sm"
                    type="button"
                    onClick={feeds.reload}
                  >
                    Refresh Feeds
                  </button>
                  <button
                    className="chip"
                    type="button"
                    onClick={() => {
                      const next = new URLSearchParams(params);
                      next.delete('feed');
                      setParams(next, {
                        replace: true,
                        preventScrollReset: true,
                      });
                    }}
                  >
                    Clear Feed Selection
                  </button>
                </div>
              </>
            )}
            {!feeds.data.results?.length && (
              <p className="note">No recommendation feeds found.</p>
            )}
          </Section>
          {selected && selected.id === bookmarkedFeed?.id && (
            <Section title={selected.title}>
              <form
                className="setlist"
                onSubmit={(event) => {
                  event.preventDefault();
                  void load(selected);
                }}
              >
                {filters.map(([key, label]) => (
                  <label className="set" key={key}>
                    {label}
                    <input
                      type="checkbox"
                      checked={flags[key]}
                      onChange={(event) =>
                        setFlags({ ...flags, [key]: event.target.checked })
                      }
                    />
                  </label>
                ))}
                <label className="set">
                  Only these authors
                  <input
                    value={include}
                    onChange={(event) => setInclude(event.target.value)}
                    placeholder="Comma-separated names"
                  />
                </label>
                <label className="set">
                  Leave out these authors
                  <input
                    value={exclude}
                    onChange={(event) => setExclude(event.target.value)}
                    placeholder="Comma-separated names"
                  />
                </label>
                <label className="set">
                  Format
                  <select
                    value={format}
                    onChange={(event) => {
                      const next = new URLSearchParams(params);
                      if (event.target.value === 'audiobook')
                        next.set('format', 'audiobook');
                      else next.delete('format');
                      setParams(next, { preventScrollReset: true });
                    }}
                  >
                    <option value="ebook">Ebook</option>
                    <option value="audiobook">Audiobook</option>
                  </select>
                </label>
                <button className="btn btn-quiet btn-sm" disabled={busy}>
                  Apply Filters
                </button>
              </form>
              {feedError && (
                <p className="note" role="alert">
                  {feedError}
                </p>
              )}
              {books?.available && (
                <p className="note">
                  {books.books?.length
                    ? `Showing ${books.books.length} of ${books.total ?? books.books.length}.`
                    : 'No books match these filters.'}
                </p>
              )}
              <ul className="setlist">
                {books?.books?.map((book) => (
                  <li className="set" key={book.id}>
                    {book.imageUrl && (
                      <div
                        className={`poster ${format === 'audiobook' ? 'sq' : 'book'}`}
                        aria-hidden="true"
                      >
                        <div className="art">
                          <Cover
                            src={bookArt(book.imageUrl)}
                            title={book.title}
                            icon={
                              format === 'audiobook' ? 'headphones' : 'book'
                            }
                          />
                        </div>
                      </div>
                    )}
                    <span>
                      <b>{book.title}</b>
                      <small>
                        {[book.author, book.series?.name, book.series?.position]
                          .filter(Boolean)
                          .join(' · ')}
                      </small>
                    </span>
                    <div className="toolbar">
                      {(['more', 'less'] as const).map((value) => (
                        <button
                          type="button"
                          className="chip"
                          key={value}
                          disabled={busy}
                          aria-pressed={feedback[book.id] === value}
                          onClick={() => {
                            const next = { ...feedback };
                            if (next[book.id] === value) delete next[book.id];
                            else next[book.id] = value;
                            void load(selected, next);
                          }}
                        >
                          {value === 'more'
                            ? 'More Like This'
                            : 'Less Like This'}
                        </button>
                      ))}
                      <button
                        className="btn btn-quiet btn-sm"
                        disabled={busy}
                        onClick={() => void openBook(book)}
                      >
                        Open Book
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <Section title="Create a Recommendation Feed">
            <form
              className="setlist"
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <label className="set">
                Title
                <input
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label className="set">
                Mood (optional)
                <input
                  value={mood}
                  onChange={(event) => setMood(event.target.value)}
                />
              </label>
              <label className="set">
                Description (optional)
                <textarea
                  value={description}
                  maxLength={500}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <label className="set">
                Genres to Include
                <input
                  value={genres}
                  onChange={(event) => setGenres(event.target.value)}
                  placeholder="Comma-separated genres"
                />
              </label>
              <label className="set">
                Genres to Avoid
                <input
                  value={avoidGenres}
                  onChange={(event) => setAvoidGenres(event.target.value)}
                  placeholder="Comma-separated genres"
                />
              </label>
              <label className="set">
                Series Position
                <select
                  value={seriesPosition}
                  onChange={(event) => setSeriesPosition(event.target.value)}
                >
                  <option value="">Any position</option>
                  <option value="standalone">Standalones only</option>
                  <option value="first_or_standalone">
                    Standalones and first books
                  </option>
                </select>
              </label>
              <label className="set">
                Prefer Less Popular Books
                <input
                  type="checkbox"
                  checked={createLessPopular}
                  onChange={(event) =>
                    setCreateLessPopular(event.target.checked)
                  }
                />
              </label>
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy || !title.trim()}
              >
                Create on Hardcover
              </button>
            </form>
            {createError && (
              <p className="note" role="alert">
                {createError}
              </p>
            )}
          </Section>
        </>
      )}
    </>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Section } from '../components/cards';
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
  const [selected, select] = useState<Feed>();
  const [books, setBooks] = useState<Books>();
  const [busy, setBusy] = useState(false);
  const [flags, setFlags] = useState({
    standalones: false,
    firstInSeries: false,
    lessPopular: false,
  });
  const [include, setInclude] = useState('');
  const [exclude, setExclude] = useState('');
  const [feedback, setFeedback] = useState<Record<number, 'more' | 'less'>>({});
  const [format, setFormat] = useState<'ebook' | 'audiobook'>('ebook');
  const [title, setTitle] = useState('');
  const [mood, setMood] = useState('');
  const [createFirst, setCreateFirst] = useState(false);
  const votes = (value: 'more' | 'less', source = feedback) =>
    Object.keys(source)
      .filter((id) => source[Number(id)] === value)
      .map(Number);
  const authors = (value: string) =>
    value
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

  async function load(feed: Feed, next = feedback) {
    if (selected?.id !== feed.id) setBooks(undefined);
    select(feed);
    setBusy(true);
    try {
      setBooks(
        await api<Books>(`/book-recommendations/${feed.id}/books`, {
          method: 'POST',
          body: JSON.stringify({
            tuning: {
              ...flags,
              includeAuthors: authors(include),
              excludeAuthors: authors(exclude),
              moreLike: votes('more', next),
              lessLike: votes('less', next),
            },
          }),
        })
      );
    } catch (error) {
      toast(friendlyError(error, 'Could not load this feed.'));
    } finally {
      setBusy(false);
    }
  }

  async function openBook(book: Book) {
    setBusy(true);
    try {
      const result = await api<{
        groups: { candidates: { id: string; mediaType: string }[] }[];
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
      navigate(
        `/book/${encodeURIComponent(match.id)}?f=${format === 'audiobook' ? 'audio' : 'book'}`
      );
    } catch (error) {
      toast(friendlyError(error, 'Could not find this book.'));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    try {
      const result = await api<{ id?: number; code?: string }>(
        '/book-recommendations',
        {
          method: 'POST',
          body: JSON.stringify({
            title: title.trim(),
            mood: mood.trim() || undefined,
            seriesPosition: createFirst ? 'first_or_standalone' : undefined,
            lessPopular: flags.lessPopular,
            likeBookIds: votes('more'),
            dislikeBookIds: votes('less'),
          }),
        }
      );
      if (!result.id) throw new Error(unavailable(result.code));
      setTitle('');
      setMood('');
      setCreateFirst(false);
      feeds.reload();
      toast('Recommendation feed created.');
    } catch (error) {
      toast(friendlyError(error, 'Could not create the feed.'));
    } finally {
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
                      setFeedback({});
                      void load(feed, {});
                    }}
                    aria-label={`Show Books: ${feed.title}`}
                  >
                    Show Books
                  </button>
                </li>
              ))}
            </ul>
            {!feeds.data.results?.length && (
              <p className="note">No recommendation feeds found.</p>
            )}
          </Section>
          {selected && (
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
                    onChange={(event) =>
                      setFormat(
                        event.target.value === 'audiobook'
                          ? 'audiobook'
                          : 'ebook'
                      )
                    }
                  >
                    <option value="ebook">Ebook</option>
                    <option value="audiobook">Audiobook</option>
                  </select>
                </label>
                <button className="btn btn-quiet btn-sm" disabled={busy}>
                  Apply Filters
                </button>
              </form>
              {books && !books.available && (
                <p className="note">{unavailable(books.code)}</p>
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
                            setFeedback(next);
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
                Standalones and first books
                <input
                  type="checkbox"
                  checked={createFirst}
                  onChange={(event) => setCreateFirst(event.target.checked)}
                />
              </label>
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy || !title.trim()}
              >
                Create on Hardcover
              </button>
            </form>
          </Section>
        </>
      )}
    </>
  );
}

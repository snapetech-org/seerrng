import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';

const PATH = '/indexer-search';
const LABELS: Record<string, string> = {
  movie: 'Movies',
  tv: 'TV',
  music: 'Music',
  ebook: 'Books',
  audiobook: 'Audiobooks',
  comic: 'Comics',
  magazine: 'Magazines',
  adult: 'Adult',
  retro: 'Retro ROMs',
  modern: 'Modern ROMs',
  game: 'PC Games',
  sports: 'Sports',
};
interface Configuration {
  configured: boolean;
  showIndexerDetails: boolean;
  categories: { category: string; categoryIds: number[]; enabled: boolean }[];
}
interface Release {
  title: string;
  indexer?: string;
  size: number | null;
  seeders: number | null;
  leechers: number | null;
  grabs: number | null;
  protocol: string;
  publishDate: string | null;
  infoUrl: string | null;
  grabId: string | null;
  categories: { id: number; name: string }[];
}
interface SearchPage {
  results: Release[];
  hasMore: boolean;
  limit: number;
}
interface SearchInput {
  category: string;
  query: string;
}
type Handoff = 'sending' | 'sent' | 'failed';

function detailsUrl(value: string | null) {
  try {
    if (!value) return undefined;
    const url = new URL(value);
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
    ) {
      return url.href;
    }
  } catch {
    return undefined;
  }
}

function ReleaseRow({
  release,
  showDetails,
  state,
  send,
}: {
  release: Release;
  showDetails: boolean;
  state?: Handoff;
  send: () => void;
}) {
  const info = showDetails ? detailsUrl(release.infoUrl) : undefined;
  const date = release.publishDate ? new Date(release.publishDate) : null;
  return (
    <li className="set">
      <div>
        <b>{release.title}</b>
        <small>
          {[
            release.protocol,
            release.size === null
              ? null
              : `${(release.size / 1024 ** 2).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`,
            date && Number.isFinite(date.valueOf())
              ? date.toLocaleDateString()
              : null,
            release.seeders === null ? null : `${release.seeders} seeders`,
            release.leechers === null ? null : `${release.leechers} leechers`,
            release.grabs === null ? null : `${release.grabs} grabs`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </small>
        {showDetails && release.indexer && <small>{release.indexer}</small>}
        {!!release.categories.length && (
          <small>{release.categories.map(({ name }) => name).join(', ')}</small>
        )}
        {state === 'sent' && (
          <small role="status">
            Sent to Prowlarr’s configured download client.
          </small>
        )}
        {state === 'failed' && (
          <small role="alert">
            Handoff could not be confirmed. Check the client before searching
            and trying again.
          </small>
        )}
      </div>
      <div className="toolbar">
        {info && (
          <a
            className="btn btn-quiet btn-sm"
            href={info}
            target="_blank"
            rel="noreferrer"
          >
            Open Indexer Details
          </a>
        )}
        {release.grabId && !state && (
          <button className="btn btn-tonal btn-sm" onClick={send}>
            Send to Downloader
          </button>
        )}
        {state === 'sending' && <small role="status">Sending…</small>}
      </div>
    </li>
  );
}

function SearchForm({ configuration }: { configuration: Configuration }) {
  const [params] = useSearchParams();
  const categories = configuration.categories.filter(
    ({ category, enabled, categoryIds }) =>
      Object.hasOwn(LABELS, category) &&
      enabled &&
      categoryIds.some((id) => Number.isSafeInteger(id) && id > 0)
  );
  const [category, setCategory] = useState(params.get('category') ?? '');
  const selected =
    categories.find((item) => item.category === category)?.category ??
    categories[0]?.category ??
    '';
  const [query, setQuery] = useState((params.get('query') ?? '').slice(0, 256));
  const [results, setResults] = useState<Release[]>([]);
  const [submitted, setSubmitted] = useState<SearchInput>();
  const [nextOffset, setNextOffset] = useState<number>();
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const searchingRef = useRef(false);
  const sentHandles = useRef(new Set<string>());
  const [handoffs, setHandoffs] = useState<Record<string, Handoff>>({});

  async function search(input: SearchInput, offset = 0) {
    if (searchingRef.current || !input.category || input.query.length < 2)
      return;
    searchingRef.current = true;
    setSearching(true);
    setError('');
    if (!offset) {
      setResults([]);
      setSubmitted(undefined);
      setNextOffset(undefined);
    }
    try {
      const page = await api<SearchPage>(PATH + '/search', {
        method: 'POST',
        body: JSON.stringify({ ...input, offset }),
      });
      setSubmitted(input);
      setResults((previous) =>
        offset ? [...previous, ...page.results] : page.results
      );
      setNextOffset(page.hasMore ? offset + page.limit : undefined);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Search limit reached. Wait a minute and try again.'
          : err instanceof ApiError && err.status === 409
            ? 'Prowlarr has no available indexers for this media category.'
            : 'Indexer search failed. Try again.'
      );
    } finally {
      searchingRef.current = false;
      setSearching(false);
    }
  }

  async function send(grabId: string) {
    if (sentHandles.current.has(grabId)) return;
    sentHandles.current.add(grabId);
    setHandoffs((current) => ({ ...current, [grabId]: 'sending' }));
    let state: Handoff = 'failed';
    try {
      const result = await api<{ submitted: boolean }>(PATH + '/grab', {
        method: 'POST',
        body: JSON.stringify({ grabId }),
      });
      if (result.submitted === true) state = 'sent';
    } catch {
      // Handles are single-use, including when the service outcome is uncertain.
    }
    setHandoffs((current) => ({ ...current, [grabId]: state }));
  }

  if (!configuration.configured)
    return (
      <p className="note">
        Ask an administrator to connect Prowlarr in service settings.
      </p>
    );
  if (!selected)
    return (
      <p className="note">
        No configured media categories are available to this account.
      </p>
    );

  return (
    <>
      <p className="note">
        Search Prowlarr for releases and send them to its configured download
        client. SeerrNG requests are managed separately.
      </p>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void search({ category: selected, query: query.trim() });
        }}
      >
        <label className="sel">
          <select
            aria-label="Media Category"
            value={selected}
            onChange={(event) => setCategory(event.target.value)}
          >
            {categories.map((item) => (
              <option key={item.category} value={item.category}>
                {LABELS[item.category]}
              </option>
            ))}
          </select>
        </label>
        <label className="search">
          <input
            aria-label="Search Terms"
            type="search"
            placeholder="Title, author or album"
            maxLength={256}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          className="btn btn-tonal btn-sm"
          disabled={searching || query.trim().length < 2}
        >
          Search Indexers
        </button>
      </form>
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {searching && (
        <p className="note" role="status">
          Searching indexers…
        </p>
      )}
      {submitted && (
        <p className="note" role="status">
          {results.length
            ? `${results.length} ${results.length === 1 ? 'release' : 'releases'} for “${submitted.query}” in ${LABELS[submitted.category]}.`
            : 'No releases matched this search.'}
        </p>
      )}
      {!!results.length && (
        <ul className="setlist">
          {results.map((release, index) => (
            <ReleaseRow
              key={index}
              release={release}
              showDetails={configuration.showIndexerDetails}
              state={release.grabId ? handoffs[release.grabId] : undefined}
              send={() => {
                if (release.grabId) void send(release.grabId);
              }}
            />
          ))}
        </ul>
      )}
      {submitted && nextOffset !== undefined && (
        <div className="toolbar">
          <button
            className="btn btn-quiet btn-sm"
            disabled={searching}
            onClick={() => void search(submitted, nextOffset)}
          >
            Load More Results
          </button>
        </div>
      )}
    </>
  );
}

export default function IndexerSearch({ allowed }: { allowed: boolean }) {
  const { data, error, reload } = useApi<Configuration>(
    allowed ? PATH + '/configuration' : null
  );
  const [params] = useSearchParams();
  return (
    <>
      <header className="ph">
        <h1>Indexer Search</h1>
      </header>
      {!allowed && (
        <p className="note">
          You need Manage Requests permission to search indexers.
        </p>
      )}
      <ServiceNote error={error} what="indexer configuration" retry={reload} />
      {allowed && !data && !error && (
        <p className="note" role="status">
          Loading indexer configuration…
        </p>
      )}
      {allowed && data && (
        <SearchForm key={params.toString()} configuration={data} />
      )}
    </>
  );
}

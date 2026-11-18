import { Link, useSearchParams } from 'react-router-dom';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { bookSeriesCatalogQuery } from './BookSeriesCatalog';

type Result = {
  key: string;
  title: string;
  serverName: string;
  format: 'ebook' | 'audiobook';
  source: 'library' | 'catalog';
  href: string;
  variants?: Result[];
};

function resultLink(result: Result) {
  if (result.source === 'library')
    return /^\/book-series\/[1-9]\d*$/.test(result.href) ? result.href : null;
  const prefix = '/book-series/catalog?';
  if (!result.href.startsWith(prefix)) return null;
  const params = new URLSearchParams(result.href.slice(prefix.length));
  const query = bookSeriesCatalogQuery({
    serverId: params.get('serverId') ?? '',
    scope: params.get('scope') ?? '',
    providerId: params.get('providerId') ?? '',
  });
  return query ? prefix + query : null;
}

export default function BookSeriesSearch() {
  const [params, setParams] = useSearchParams();
  const query = (params.get('query') ?? '').trim();
  const format = params.get('format') ?? '';
  return (
    <>
      <ExtraHeader title="Find a Book Series">
        <Link className="chip" to="/book-series/requests">
          Book Series Requests
        </Link>
      </ExtraHeader>
      <form
        className="toolbar"
        key={params.toString()}
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const submitted = new URLSearchParams({
            query: String(fields.get('query')).trim(),
          });
          if (fields.get('format'))
            submitted.set('format', String(fields.get('format')));
          setParams(submitted);
        }}
      >
        <label className="sel">
          Series Name
          <input
            className="cfg-input"
            type="search"
            name="query"
            defaultValue={query}
            minLength={2}
            maxLength={200}
            required
          />
        </label>
        <label className="sel">
          Format
          <select name="format" defaultValue={format}>
            <option value="">All Formats</option>
            <option value="ebook">Ebooks</option>
            <option value="audiobook">Audiobooks</option>
          </select>
        </label>
        <button className="btn btn-primary" type="submit">
          Search Series
        </button>
      </form>
      <BookSeriesResults query={query} format={format} />
    </>
  );
}

export function BookSeriesResults({
  query,
  format,
  limit,
}: {
  query: string;
  format?: string;
  limit?: number;
}) {
  const path =
    query.length >= 2 && query.length <= 200
      ? '/book-series/search?' +
        new URLSearchParams({
          query,
          ...(format === 'ebook' || format === 'audiobook' ? { format } : {}),
        })
      : null;
  const search = useApi<{
    results: Result[];
    status: 'ok' | 'partial' | 'unavailable' | 'unsupported' | 'disabled';
    truncated: boolean;
  }>(path, { currentPathOnly: true });
  const results = Array.isArray(search.data?.results)
    ? search.data.results
    : undefined;
  return (
    <>
      <ServiceNote
        error={
          search.error ||
          (search.data && (!results || search.data.status === 'unavailable')
            ? 'Series search is unavailable.'
            : null)
        }
        what="book series search"
        retry={search.reload}
      />
      {path && !search.data && !search.error && (
        <p className="note" role="status">
          Searching for series…
        </p>
      )}
      {search.data?.status === 'partial' && (
        <p className="note">Some book services could not be searched.</p>
      )}
      {search.data?.status === 'disabled' && (
        <p className="note">Book series search is disabled.</p>
      )}
      {search.data?.status === 'unsupported' && (
        <p className="note">
          No configured services support book series search.
        </p>
      )}
      {search.data?.status === 'ok' && results?.length === 0 && (
        <p className="note">No series found.</p>
      )}
      {search.data?.truncated && (
        <p className="note">
          Some results were omitted. Try a more specific title.
        </p>
      )}
      <ul className="setlist">
        {results
          ?.flatMap((result) =>
            result.variants?.length ? result.variants : [result]
          )
          .slice(0, limit ?? Infinity)
          .map((result) => {
            const href = resultLink(result);
            return (
              <li className="set" key={result.key}>
                <div>
                  <b>{result.title}</b>
                  <p className="note">
                    {result.serverName} · {result.format} ·{' '}
                    {result.source === 'library' ? 'Library' : 'Catalog'}
                  </p>
                </div>
                {href && (
                  <Link
                    className="go"
                    to={href}
                    aria-label={`Open ${result.title} from ${result.serverName}`}
                  >
                    Open
                  </Link>
                )}
              </li>
            );
          })}
      </ul>
    </>
  );
}

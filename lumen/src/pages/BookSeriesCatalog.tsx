import { Link, useSearchParams } from 'react-router-dom';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { useApi } from '../hooks';

type Catalog = {
  title: string;
  description?: string;
  serverName: string;
  format: 'ebook' | 'audiobook';
  bookCount: number;
  resolutionTruncated: boolean;
  books: {
    title: string;
    author?: string;
    position?: string;
    matchStatus: 'matched' | 'unmatched' | 'ambiguous' | 'unavailable';
    book?: { id: string };
  }[];
};

export function bookSeriesCatalogQuery(target: {
  serverId: number | string;
  scope: string;
  providerId: string;
}) {
  const { serverId, scope, providerId } = target;
  const id = String(serverId);
  if (
    !/^(0|[1-9]\d*)$/.test(id) ||
    !Number.isSafeInteger(Number(id)) ||
    !scope ||
    scope.length > 256 ||
    providerId.length > 128 ||
    !/^hc:[1-9]\d*$/.test(providerId)
  )
    return null;
  return new URLSearchParams({ serverId: id, scope, providerId }).toString();
}

export default function BookSeriesCatalog() {
  const [params] = useSearchParams();
  const query = bookSeriesCatalogQuery({
    serverId: params.get('serverId') ?? '',
    scope: params.get('scope') ?? '',
    providerId: params.get('providerId') ?? '',
  });
  const catalog = useApi<Catalog>(
    query ? `/book-series/catalog?${query}` : null,
    {
      currentPathOnly: true,
    }
  );
  const data = catalog.data;
  return (
    <>
      <ExtraHeader
        title={data?.title || 'Book Series Catalog'}
        sub={data?.serverName}
      >
        <Link className="chip" to="/book-series/requests">
          Book Series Requests
        </Link>
      </ExtraHeader>
      {!query && (
        <p className="note" role="alert">
          The series catalog link is incomplete or invalid.
        </p>
      )}
      <ServiceNote
        error={catalog.error}
        what="book series catalog"
        retry={catalog.reload}
      />
      {query && !data && !catalog.error && (
        <p className="note" role="status">
          Loading series catalog…
        </p>
      )}
      {data && (
        <>
          <p className="note">
            {data.format === 'audiobook' ? 'Audiobooks' : 'Ebooks'} ·{' '}
            {data.bookCount} catalog entries
          </p>
          {data.description && <p>{data.description}</p>}
          {data.resolutionTruncated && (
            <p className="note">
              Only part of this catalog could be checked for matches.
            </p>
          )}
          {!data.books.length && (
            <p className="note">No books in this preview.</p>
          )}
          <ul className="setlist">
            {data.books.map((entry, index) => (
              <li className="set" key={index}>
                <div>
                  <b>
                    {entry.position ? `${entry.position}. ` : ''}
                    {entry.title}
                  </b>
                  {entry.author && <p className="note">{entry.author}</p>}
                </div>
                {entry.matchStatus === 'matched' && entry.book?.id ? (
                  <Link
                    className="go"
                    to={`/book/${encodeURIComponent(entry.book.id)}${data.format === 'audiobook' ? '?f=audio' : ''}`}
                  >
                    View Book
                  </Link>
                ) : (
                  <small>
                    {entry.matchStatus === 'ambiguous'
                      ? 'Multiple Possible Matches'
                      : entry.matchStatus === 'unavailable'
                        ? 'Match Unavailable'
                        : 'No Match'}
                  </small>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

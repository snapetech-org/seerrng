import { Link, useSearchParams } from 'react-router-dom';
import { ExtraHeader, ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
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
  const { t } = useLumenLocale();
  const [params, setParams] = useSearchParams();
  const query = (params.get('query') ?? '').trim();
  const format = params.get('format') ?? '';
  return (
    <>
      <ExtraHeader
        title={t('lumen.bookSeries.findTitle', 'Find a Book Series')}
      >
        <Link className="chip" to="/book-series/requests">
          {t('lumen.bookSeries.requests', 'Book Series Requests')}
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
          {t('lumen.bookSeries.seriesName', 'Series Name')}
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
          {t('lumen.bookSeries.format', 'Format')}
          <select name="format" defaultValue={format}>
            <option value="">
              {t('lumen.bookSeries.allFormats', 'All Formats')}
            </option>
            <option value="ebook">
              {t('lumen.bookSeries.ebooks', 'Ebooks')}
            </option>
            <option value="audiobook">
              {t('lumen.bookSeries.audiobooks', 'Audiobooks')}
            </option>
          </select>
        </label>
        <button className="btn btn-primary" type="submit">
          {t('lumen.bookSeries.search', 'Search Series')}
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
  const { t } = useLumenLocale();
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
            ? t(
                'lumen.bookSeries.searchUnavailable',
                'Series search is unavailable.'
              )
            : null)
        }
        what={t('lumen.bookSeries.searchWhat', 'book series search')}
        title={t(
          'lumen.bookSeries.searchLoadFailed',
          'Could not load book series search'
        )}
        retryLabel={t('lumen.bookSeries.retry', 'Retry')}
        retry={search.reload}
      />
      {path && !search.data && !search.error && (
        <p className="note" role="status">
          {t('lumen.bookSeries.searching', 'Searching for series…')}
        </p>
      )}
      {search.data?.status === 'partial' && (
        <p className="note">
          {t(
            'lumen.bookSeries.partial',
            'Some book services could not be searched.'
          )}
        </p>
      )}
      {search.data?.status === 'disabled' && (
        <p className="note">
          {t('lumen.bookSeries.disabled', 'Book series search is disabled.')}
        </p>
      )}
      {search.data?.status === 'unsupported' && (
        <p className="note">
          {t(
            'lumen.bookSeries.unsupported',
            'No configured services support book series search.'
          )}
        </p>
      )}
      {search.data?.status === 'ok' && results?.length === 0 && (
        <p className="note">
          {t('lumen.bookSeries.noResults', 'No series found.')}
        </p>
      )}
      {search.data?.truncated && (
        <p className="note">
          {t(
            'lumen.bookSeries.truncated',
            'Some results were omitted. Try a more specific title.'
          )}
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
                    {result.source === 'library'
                      ? t('lumen.bookSeries.library', 'Library')
                      : t('lumen.bookSeries.catalog', 'Catalog')}
                  </p>
                </div>
                {href && (
                  <Link
                    className="go"
                    to={href}
                    aria-label={t(
                      'lumen.bookSeries.openFromTitle',
                      'Open {title} from {service}',
                      { title: result.title, service: result.serverName }
                    )}
                  >
                    {t('lumen.bookSeries.open', 'Open')}
                  </Link>
                )}
              </li>
            );
          })}
      </ul>
    </>
  );
}

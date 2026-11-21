import { useState } from 'react';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { ServiceNote } from './extra';

export function StudioFilter({
  studio,
  select,
}: {
  studio: string;
  select: (id: string) => void;
}) {
  const { t } = useLumenLocale();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  return (
    <>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(input.trim());
          setPage(1);
        }}
      >
        <label className="sel">
          <span className="lbl">
            {t('lumen.studioFilter.searchLabel', 'Find Production Studios')}
          </span>
          <input
            className="cfg-input"
            type="search"
            maxLength={200}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </label>
        <button className="btn btn-tonal btn-sm" disabled={!input.trim()}>
          {t('lumen.studioFilter.search', 'Find Studios')}
        </button>
      </form>
      {query && (
        <StudioResults
          key={JSON.stringify([query, page])}
          query={query}
          page={page}
          studio={studio}
          select={select}
          setPage={setPage}
        />
      )}
    </>
  );
}

function StudioResults({
  query,
  page,
  studio,
  select,
  setPage,
}: {
  query: string;
  page: number;
  studio: string;
  select: (id: string) => void;
  setPage: (page: number) => void;
}) {
  const results = useApi<{
    results: { id: number; name: string }[];
    total_pages: number;
  }>(`/search/company?query=${encodeURIComponent(query)}&page=${page}`);
  const { t } = useLumenLocale();
  const studios = (results.data?.results ?? []).filter(
    ({ id }) => Number.isSafeInteger(id) && id > 0 && id <= 1_000_000_000
  );
  const total = Math.min(500, results.data?.total_pages ?? page);
  return (
    <>
      <ServiceNote
        error={results.error}
        what={t('lumen.studioFilter.what', 'production studios')}
        retry={results.reload}
      />
      {!results.data && !results.error && (
        <p className="note" role="status">
          {t('lumen.studioFilter.loading', 'Finding production studios…')}
        </p>
      )}
      {results.data && !studios.length && (
        <p className="note">
          {t('lumen.studioFilter.empty', 'No matching production studios.')}
        </p>
      )}
      {!!studios.length && (
        <div
          className="toolbar"
          role="group"
          aria-label={t('lumen.studioFilter.results', 'Studio Results')}
        >
          {studios.map(({ id, name }) => (
            <button
              className="chip"
              type="button"
              key={id}
              aria-pressed={String(id) === studio}
              onClick={() => select(String(id))}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {(page > 1 || total > 1) && (
        <div
          className="toolbar"
          role="group"
          aria-label={t('lumen.studioFilter.pages', 'Studio Pages')}
        >
          <button
            className="btn btn-tonal btn-sm"
            type="button"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            {t('lumen.studioFilter.previous', 'Previous Studio Page')}
          </button>
          <button
            className="btn btn-tonal btn-sm"
            type="button"
            disabled={page >= total}
            onClick={() => setPage(page + 1)}
          >
            {t('lumen.studioFilter.next', 'Next Studio Page')}
          </button>
        </div>
      )}
    </>
  );
}

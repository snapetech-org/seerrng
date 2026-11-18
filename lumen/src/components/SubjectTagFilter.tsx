import { useState } from 'react';
import { type SubjectTag } from '../api';
import { useApi } from '../hooks';
import { ServiceNote } from './extra';

export function SubjectTagFilter({
  included,
  excluded,
  apply,
}: {
  included: string[];
  excluded: string[];
  apply: (included: string[], excluded: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [exclude, setExclude] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const selected = exclude ? excluded : included;

  function toggle(tag: SubjectTag) {
    const id = String(tag.id);
    const next = selected.includes(id)
      ? selected.filter((item) => item !== id)
      : [...selected, id];
    setNames((current) => ({ ...current, [id]: tag.name }));
    if (exclude)
      apply(
        included.filter((item) => item !== id),
        next
      );
    else
      apply(
        next,
        excluded.filter((item) => item !== id)
      );
  }

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
          <span className="lbl">Find Subject Tags</span>
          <input
            className="cfg-input"
            type="search"
            maxLength={200}
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </label>
        <button className="btn btn-tonal btn-sm" disabled={!input.trim()}>
          Find Tags
        </button>
        <label className="sel">
          <span className="lbl">Tag Match</span>
          <select
            value={exclude ? 'exclude' : 'include'}
            onChange={(event) => setExclude(event.target.value === 'exclude')}
          >
            <option value="include">Include</option>
            <option value="exclude">Exclude</option>
          </select>
        </label>
      </form>
      <div className="toolbar" aria-label="Selected Subject Tags">
        {included.map((id) => (
          <button
            className="chip"
            type="button"
            key={`in-${id}`}
            onClick={() =>
              apply(
                included.filter((item) => item !== id),
                excluded
              )
            }
          >
            Remove included {names[id] ?? `tag #${id}`}
          </button>
        ))}
        {excluded.map((id) => (
          <button
            className="chip"
            type="button"
            key={`out-${id}`}
            onClick={() =>
              apply(
                included,
                excluded.filter((item) => item !== id)
              )
            }
          >
            Remove excluded {names[id] ?? `tag #${id}`}
          </button>
        ))}
      </div>
      {query && (
        <KeywordResults
          key={JSON.stringify([query, page])}
          query={query}
          page={page}
          selected={selected}
          toggle={toggle}
          setPage={setPage}
        />
      )}
    </>
  );
}

function KeywordResults({
  query,
  page,
  selected,
  toggle,
  setPage,
}: {
  query: string;
  page: number;
  selected: string[];
  toggle: (tag: SubjectTag) => void;
  setPage: (page: number) => void;
}) {
  const suffix = page > 1 ? `&page=${page}` : '';
  const results = useApi<{ results: SubjectTag[]; total_pages: number }>(
    `/search/keyword?query=${encodeURIComponent(query)}${suffix}`
  );
  const tags = (results.data?.results ?? []).filter(
    ({ id }) => Number.isSafeInteger(id) && id > 0 && id <= 1_000_000_000
  );
  const total = Math.min(500, results.data?.total_pages ?? page);
  return (
    <>
      <ServiceNote
        error={results.error}
        what="subject tags"
        retry={results.reload}
      />
      {!results.data && !results.error && (
        <p className="note" role="status">
          Finding subject tags…
        </p>
      )}
      {results.data && !tags.length && (
        <p className="note">No matching subject tags.</p>
      )}
      {!!tags.length && (
        <div className="toolbar" role="group" aria-label="Subject Tag Results">
          {tags.map((tag) => (
            <button
              className="chip"
              type="button"
              key={tag.id}
              aria-pressed={selected.includes(String(tag.id))}
              disabled={
                selected.length >= 20 && !selected.includes(String(tag.id))
              }
              onClick={() => toggle(tag)}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}
      {(page > 1 || total > 1) && (
        <div className="toolbar" role="group" aria-label="Subject Tag Pages">
          <button
            className="btn btn-tonal btn-sm"
            type="button"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous Tag Page
          </button>
          <span className="note" role="status">
            Tag page {page}
            {results.data ? ` of ${total}` : ''}
          </span>
          <button
            className="btn btn-tonal btn-sm"
            type="button"
            disabled={page >= total}
            onClick={() => setPage(page + 1)}
          >
            Next Tag Page
          </button>
        </div>
      )}
    </>
  );
}

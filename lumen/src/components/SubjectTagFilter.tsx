import { useState } from 'react';
import { type Paged, type SubjectTag } from '../api';
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
  const [exclude, setExclude] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});
  const path = query
    ? `/search/keyword?query=${encodeURIComponent(query)}`
    : null;
  const results = useApi<Paged<SubjectTag>>(path);
  const selected = exclude ? excluded : included;
  const tags = path ? (results.data?.results ?? []) : [];

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
          if (input.trim() === query) results.reload();
          else setQuery(input.trim());
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
      {path && (
        <ServiceNote
          error={results.error}
          what="subject tags"
          retry={results.reload}
        />
      )}
      {path && !results.data && !results.error && (
        <p className="note" role="status">
          Finding subject tags…
        </p>
      )}
      {path && results.data && !tags.length && (
        <p className="note">No matching subject tags.</p>
      )}
      {!!tags.length && (
        <div className="toolbar" aria-label="Subject Tag Results">
          {tags
            .filter(
              ({ id }) =>
                Number.isSafeInteger(id) && id > 0 && id <= 1_000_000_000
            )
            .map((tag) => (
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
    </>
  );
}

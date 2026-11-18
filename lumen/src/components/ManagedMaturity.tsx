import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { ServiceNote } from './extra';

const fields = [
  [
    'movieMaturityRatingLimit',
    'Movie Rating Limit',
    ['G', 'PG', 'PG-13', 'R', 'NC-17'],
  ],
  [
    'tvMaturityRatingLimit',
    'Series Rating Limit',
    ['TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA'],
  ],
] as const;
type Policy = Record<(typeof fields)[number][0], string | null>;

export default function ManagedMaturity({ id }: { id: number }) {
  const path = `/user/${id}/settings/maturity`;
  const { data, error, reload } = useApi<Policy>(path);
  const [draft, setDraft] = useState<Partial<Policy>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const working = useRef(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || working.current || !Object.keys(draft).length) return;
    working.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await api(path, { method: 'POST', body: JSON.stringify(draft) });
      setDraft({});
      setNotice('Maturity limits saved.');
      reload();
    } catch (error) {
      setFailure(friendlyError(error, 'Could not save maturity limits.'));
    } finally {
      setBusy(false);
      working.current = false;
    }
  }

  return (
    <div>
      <ServiceNote error={error} what="maturity limits" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          Loading maturity limits…
        </p>
      )}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {data && (
        <>
          <p className="note">
            A limit applies to browsing and requests. Titles without a
            recognized US rating are blocked when a limit is set.
          </p>
          <form className="toolbar" onSubmit={save}>
            {fields.map(([key, label, ratings]) => (
              <label className="sel" key={key}>
                <span className="lbl">{label}</span>
                <select
                  disabled={busy}
                  value={
                    (Object.hasOwn(draft, key) ? draft[key] : data[key]) ?? ''
                  }
                  onChange={(event) => {
                    const value = event.target.value || null;
                    setNotice('');
                    setDraft((current) => {
                      const next = { ...current };
                      if (value === (data[key] ?? null)) delete next[key];
                      else next[key] = value;
                      return next;
                    });
                  }}
                >
                  <option value="">No Limit</option>
                  {ratings.map((rating) => (
                    <option key={rating}>{rating}</option>
                  ))}
                </select>
              </label>
            ))}
            <button
              className="btn btn-tonal btn-sm"
              disabled={busy || !Object.keys(draft).length}
            >
              Save Maturity Limits
            </button>
          </form>
        </>
      )}
    </div>
  );
}

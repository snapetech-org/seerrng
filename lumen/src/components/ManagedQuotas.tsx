import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { quotaCategories as categories } from '../quotaCategories';
import { ServiceNote } from './extra';

type Category = keyof typeof categories;

export default function ManagedQuotas({ id }: { id: number }) {
  const path = `/user/${id}/settings/main`;
  const { data, error, reload } = useApi<Record<string, number | null>>(path);
  const [category, setCategory] = useState<Category>('movie');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const working = useRef(false);
  const limitKey = `${category}QuotaLimit`;
  const daysKey = `${category}QuotaDays`;
  const global = `global${category[0].toUpperCase()}${category.slice(1)}Quota`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (working.current || !data) return;
    const fields = new FormData(event.currentTarget);
    const limit = fields.get('limit');
    const days = fields.get('days');
    if ((limit === '') !== (days === '')) {
      setFailure('Enter both values or clear both to use the server default.');
      return;
    }
    working.current = true;
    setBusy(true);
    setFailure('');
    setMessage('');
    try {
      await api(path, {
        method: 'POST',
        body: JSON.stringify({
          [limitKey]: limit === '' ? null : Number(limit),
          [daysKey]: days === '' ? null : Number(days),
        }),
      });
      setMessage('Request quota saved.');
      reload();
    } catch (failure) {
      setFailure(friendlyError(failure, 'Could not save the request quota.'));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <ServiceNote error={error} what="request quotas" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          Loading request quotas…
        </p>
      )}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {message && (
        <p className="note" role="status">
          {message}
        </p>
      )}
      {data && (
        <>
          <p className="note">
            Leave both fields blank to use the server default.
          </p>
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">Media Type</span>
              <select
                value={category}
                disabled={busy}
                onChange={(event) => {
                  setCategory(event.target.value as Category);
                  setFailure('');
                  setMessage('');
                }}
              >
                {Object.entries(categories).map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <small>
            Server default {data[global + 'Limit'] ?? 0} requests per{' '}
            {data[global + 'Days'] ?? 0} days
          </small>
          <form className="toolbar" key={category} onSubmit={save}>
            <label className="sel">
              <span className="lbl">Request Limit</span>
              <input
                className="cfg-json"
                type="number"
                name="limit"
                min={0}
                max={100000}
                defaultValue={data[limitKey] ?? ''}
                disabled={busy}
              />
            </label>
            <label className="sel">
              <span className="lbl">Quota Days</span>
              <input
                className="cfg-json"
                type="number"
                name="days"
                min={0}
                max={100000}
                defaultValue={data[daysKey] ?? ''}
                disabled={busy}
              />
            </label>
            <button className="btn btn-tonal btn-sm" disabled={busy}>
              Save Quota
            </button>
          </form>
        </>
      )}
    </div>
  );
}

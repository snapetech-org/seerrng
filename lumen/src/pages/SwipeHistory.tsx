import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { sessionGeneration } from '../sessionState';

const labels: Record<string, string> = {
  movie: 'Movies',
  tv: 'Series',
  book: 'Books',
  audiobook: 'Audiobooks',
  comic: 'Comics',
  magazine: 'Magazines',
  music: 'Music',
  sports: 'Sports',
  adult: 'Adult',
  'software-retro': 'Retro Games',
  'software-modern': 'Apps',
  'software-game': 'Games',
};
interface Decision {
  mediaType: string;
  id: string;
  title: string;
  decision: 'want' | 'pass' | 'seen';
}
const endpoint = '/swipe/history';

export default function SwipeHistory({ categories }: { categories: string[] }) {
  const [category, setCategory] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const path = category
    ? `${endpoint}?mediaType=${encodeURIComponent(category)}`
    : endpoint;
  const history = useApi<{ decisions: Decision[]; hasMore: boolean }>(path, {
    currentPathOnly: true,
  });
  const decisions = history.data?.decisions;

  async function change(item?: Decision) {
    if (pending.current || (!item && !confirm)) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const generation = sessionGeneration();
    try {
      if (item) {
        await api(endpoint + '/restore', {
          method: 'POST',
          body: JSON.stringify({ mediaType: item.mediaType, id: item.id }),
        });
      } else {
        const result = await api<{ cleared: number }>(path, {
          method: 'DELETE',
        });
        if (generation === sessionGeneration())
          setNotice(`Cleared ${result.cleared} decisions.`);
      }
      if (generation !== sessionGeneration()) return;
      if (item) setNotice(`${item.title} restored.`);
      setConfirm(false);
      history.reload();
    } catch (failure) {
      if (generation === sessionGeneration())
        setError(
          failure instanceof ApiError
            ? failure.message
            : 'Could not update Swipe history.'
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title="Swipe History">
      <div className="setlist">
        <label className="set cfg-row">
          <span>History Category</span>
          <select
            className="cfg-select"
            value={category}
            disabled={busy}
            onChange={(event) => {
              setCategory(event.target.value);
              setConfirm(false);
              setError('');
              setNotice('');
            }}
          >
            <option value="">All Categories</option>
            {categories.map((type) => (
              <option key={type} value={type}>
                {labels[type] ?? type}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ServiceNote
        what="Swipe history"
        error={history.error}
        retry={history.reload}
      />
      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {!decisions && !history.error && (
        <p className="note" role="status">
          Loading Swipe history…
        </p>
      )}
      {decisions?.length === 0 && (
        <p className="note">No decisions in this category.</p>
      )}
      {history.data?.hasMore && (
        <p className="note">Showing the latest 200 decisions.</p>
      )}
      <div className="setlist">
        {decisions?.map((item) => (
          <div className="set cfg-row" key={`${item.mediaType}:${item.id}`}>
            <span>
              <b>{item.title}</b>
              <small>
                {item.decision === 'want'
                  ? 'Requested'
                  : item.decision === 'pass'
                    ? 'Passed'
                    : 'Seen or Read'}
              </small>
            </span>
            {item.decision === 'want' ? (
              <Link to="/requests" className="btn btn-quiet btn-sm">
                View Requests
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                aria-label={`Restore ${item.title}`}
                disabled={busy}
                onClick={() => void change(item)}
              >
                Restore
              </button>
            )}
          </div>
        ))}
      </div>
      {decisions?.some(({ decision }) => decision !== 'want') && (
        <div className="toolbar">
          {confirm ? (
            <>
              <p className="note">
                Clear passed, seen, and read titles from{' '}
                {category ? (labels[category] ?? category) : 'all categories'}?
              </p>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => void change()}
              >
                Confirm Clear History
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              disabled={busy}
              onClick={() => setConfirm(true)}
            >
              Clear History
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

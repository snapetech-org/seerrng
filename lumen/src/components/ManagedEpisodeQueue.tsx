import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { ConfirmSheet } from './ConfirmSheet';
import { ServiceNote } from './extra';

export default function ManagedEpisodeQueue({
  id,
  name,
}: {
  id: number;
  name: string;
}) {
  const path = `/user/${id}/settings/episode-queue`;
  const queue = useApi<{ defaultEpisodeCount: number }>(path, {
    keepDuringRefresh: true,
  });
  const [draft, setDraft] = useState<number>();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const working = useRef(false);
  const count = draft ?? queue.data?.defaultEpisodeCount;

  async function save() {
    if (working.current || count === undefined) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(path, {
        method: 'POST',
        body: JSON.stringify({ defaultEpisodeCount: count }),
      });
      setNotice('Episode Queue default saved.');
      setDraft(undefined);
      queue.reload();
    } catch (failure) {
      setError(
        friendlyError(failure, 'Could not save the Episode Queue default.')
      );
    } finally {
      working.current = false;
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <div>
      <ServiceNote
        error={queue.error}
        what="Episode Queue default"
        retry={queue.reload}
      />
      {!queue.data && !queue.error && (
        <p className="note" role="status">
          Loading Episode Queue…
        </p>
      )}
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
      {queue.data && (
        <div className="toolbar">
          <label className="sel">
            <span className="lbl">Episodes Ahead</span>
            <select
              value={count}
              disabled={busy}
              onChange={(event) => {
                setDraft(Number(event.target.value));
                setNotice('');
              }}
            >
              <option value={0}>Off</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-tonal btn-sm"
            disabled={busy || count === queue.data.defaultEpisodeCount}
            onClick={() => setConfirm(true)}
          >
            Save Default
          </button>
        </div>
      )}
      {confirm && (
        <ConfirmSheet
          title={`Save Episode Queue default for ${name}?`}
          body="This applies to existing and future interactive TV requests. Episodes already requested stay in place."
          confirm="Save Default"
          cancel="Go Back"
          busy={busy}
          onConfirm={() => void save()}
          onClose={() => {
            if (!working.current) setConfirm(false);
          }}
        />
      )}
    </div>
  );
}

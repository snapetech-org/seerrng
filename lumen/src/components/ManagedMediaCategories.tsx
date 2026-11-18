import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { ServiceNote } from './extra';

const categories = {
  movie: 'Movies',
  tv: 'Series',
  music: 'Music',
  ebook: 'Ebooks',
  audiobook: 'Audiobooks',
  comic: 'Comics',
  magazine: 'Magazines',
  adult: 'Adult',
  sports: 'Sports',
  retro: 'Retro Software',
  modern: 'Modern Software',
  game: 'Games',
};

export default function ManagedMediaCategories({ id }: { id: number }) {
  const path = `/user/${id}/settings/main`;
  const { data, error, reload } = useApi<{
    enabledMediaCategories: Record<string, boolean>;
    usesDefaultEnabledMediaCategories: boolean;
  }>(path);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const working = useRef(false);

  async function save(categories: Record<string, boolean> | null) {
    if (!data || working.current) return;
    working.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await api(path, {
        method: 'POST',
        body: JSON.stringify({ enabledMediaCategories: categories }),
      });
      setDraft({});
      setNotice('Media categories saved.');
      reload();
    } catch (error) {
      setFailure(friendlyError(error, 'Could not save media categories.'));
    } finally {
      setBusy(false);
      working.current = false;
    }
  }

  return (
    <div>
      <ServiceNote error={error} what="media categories" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          Loading media categories…
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
            {data.usesDefaultEnabledMediaCategories
              ? 'Using server defaults.'
              : 'Using account overrides.'}
          </p>
          <div
            className="setlist"
            role="group"
            aria-label="Enabled media categories"
          >
            {Object.entries(categories).map(([key, label]) => (
              <label className="set" key={key}>
                <span>{label}</span>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={
                    draft[key] ?? data.enabledMediaCategories[key] ?? false
                  }
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setNotice('');
                    setDraft((current) => {
                      const next = { ...current };
                      if (checked === data.enabledMediaCategories[key])
                        delete next[key];
                      else next[key] = checked;
                      return next;
                    });
                  }}
                />
              </label>
            ))}
          </div>
          <div className="toolbar">
            <button
              className="btn btn-tonal btn-sm"
              disabled={busy || !Object.keys(draft).length}
              onClick={() => void save(draft)}
            >
              Save Categories
            </button>
            <button
              className="btn btn-quiet btn-sm"
              disabled={busy || data.usesDefaultEnabledMediaCategories}
              onClick={() => void save(null)}
            >
              Restore Server Defaults
            </button>
          </div>
        </>
      )}
    </div>
  );
}

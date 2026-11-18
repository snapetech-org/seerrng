import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { ServiceNote } from './extra';
import MediaCategorySwitches from './MediaCategorySwitches';

export default function ManagedMediaCategories({ id }: { id: number }) {
  const path = `/user/${id}/settings/main`;
  const { data, error, reload } = useApi<{
    enabledMediaCategories: Record<string, boolean>;
    usesDefaultEnabledMediaCategories: boolean;
    showIndexerDetails?: boolean;
    defaultShowIndexerDetails?: boolean;
    usesDefaultShowIndexerDetails?: boolean;
  }>(path);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const working = useRef(false);

  async function save(
    change:
      | { enabledMediaCategories: Record<string, boolean> | null }
      | { showIndexerDetails: boolean | null }
  ) {
    const categoriesChanged = 'enabledMediaCategories' in change;
    if (!data || working.current) return;
    working.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await api(path, {
        method: 'POST',
        body: JSON.stringify(change),
      });
      if (categoriesChanged) setDraft({});
      setNotice(
        categoriesChanged
          ? 'Media categories saved.'
          : 'Indexer visibility saved.'
      );
      reload();
    } catch (error) {
      setFailure(
        friendlyError(
          error,
          categoriesChanged
            ? 'Could not save media categories.'
            : 'Could not save indexer visibility.'
        )
      );
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
          <MediaCategorySwitches
            values={{ ...data.enabledMediaCategories, ...draft }}
            disabled={busy}
            onChange={(key, checked) => {
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
          <div className="toolbar">
            <button
              className="btn btn-tonal btn-sm"
              disabled={busy || !Object.keys(draft).length}
              onClick={() => void save({ enabledMediaCategories: draft })}
            >
              Save Categories
            </button>
            <button
              className="btn btn-quiet btn-sm"
              disabled={busy || data.usesDefaultEnabledMediaCategories}
              onClick={() => void save({ enabledMediaCategories: null })}
            >
              Restore Server Defaults
            </button>
          </div>
          {data.defaultShowIndexerDetails === false && (
            <p className="note">Indexer details are disabled by the server.</p>
          )}
          {data.defaultShowIndexerDetails === true && (
            <div className="toolbar">
              <label className="sel">
                <span className="lbl">Indexer Details</span>
                <select
                  value={
                    data.usesDefaultShowIndexerDetails
                      ? 'default'
                      : data.showIndexerDetails
                        ? 'show'
                        : 'hide'
                  }
                  disabled={busy}
                  onChange={(event) => {
                    const value = event.target.value;
                    void save({
                      showIndexerDetails:
                        value === 'default' ? null : value === 'show',
                    });
                  }}
                >
                  <option value="default">Use Server Default</option>
                  <option value="show">Show</option>
                  <option value="hide">Hide</option>
                </select>
              </label>
            </div>
          )}
        </>
      )}
    </div>
  );
}

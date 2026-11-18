import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { friendlyError } from '../errors';
import { sessionGeneration } from '../sessionState';
import { useDialog } from './useDialog';

type Destination = {
  libraryId: string;
  libraryName: string;
  state: 'missing' | 'exists' | 'unknown' | 'conflict';
  availableIds?: string[];
  removalToken?: string;
};

export type CollectionSync = {
  supported: boolean;
  destinations: Destination[];
};

type Action = 'add' | 'remove';
type Selection = { action: Action; destinations: Destination[] };

export default function CollectionServerActions({
  endpoint,
  sync,
  visibleIds,
  onComplete,
}: {
  endpoint: string;
  sync: CollectionSync;
  visibleIds: string[];
  onComplete: () => void;
}) {
  const [selection, setSelection] = useState<Selection>();
  if (!sync.supported) return null;
  const visible = new Set(visibleIds);
  const add = sync.destinations.flatMap((destination) => {
    const availableIds = destination.availableIds?.filter((id) =>
      visible.has(id)
    );
    return destination.state === 'missing' && availableIds?.length
      ? [{ ...destination, availableIds }]
      : [];
  });
  const remove = sync.destinations.filter(
    ({ state, removalToken }) =>
      state === 'exists' && /^[a-f0-9]{64}$/.test(removalToken ?? '')
  );

  return (
    <>
      <div className="toolbar">
        <button
          className="btn btn-quiet btn-sm"
          type="button"
          disabled={!add.length}
          onClick={() => setSelection({ action: 'add', destinations: add })}
        >
          Add to Media Server
        </button>
        <button
          className="btn btn-quiet btn-sm"
          type="button"
          disabled={!remove.length}
          onClick={() =>
            setSelection({ action: 'remove', destinations: remove })
          }
        >
          Remove from Media Server
        </button>
      </div>
      {selection && (
        <CollectionServerSheet
          endpoint={endpoint}
          selection={selection}
          close={() => setSelection(undefined)}
          onComplete={onComplete}
        />
      )}
    </>
  );
}

function CollectionServerSheet({
  endpoint,
  selection,
  close,
  onComplete,
}: {
  endpoint: string;
  selection: Selection;
  close: () => void;
  onComplete: () => void;
}) {
  const { action, destinations } = selection;
  const [selected, setSelected] = useState(
    () => new Set(destinations.map(({ libraryId }) => libraryId))
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const working = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const dismiss = () => {
    if (!working.current) close();
  };
  useDialog(dialog, dismiss);
  const libraries = destinations.filter(({ libraryId }) =>
    selected.has(libraryId)
  );
  const selectedIds = [
    ...new Set(libraries.flatMap(({ availableIds }) => availableIds ?? [])),
  ];
  const adding = action === 'add';
  const title = adding
    ? 'Add Collection to Media Server'
    : 'Remove Collection from Media Server';
  const valid =
    libraries.length > 0 &&
    libraries.length <= 50 &&
    (!adding || (selectedIds.length > 0 && selectedIds.length <= 500));

  async function submit() {
    if (working.current || !valid || result || failure) return;
    working.current = true;
    setBusy(true);
    const generation = sessionGeneration();
    try {
      const response = await api<CollectionSync>(endpoint, {
        method: adding ? 'POST' : 'DELETE',
        body: JSON.stringify(
          adding
            ? {
                libraryIds: libraries.map(({ libraryId }) => libraryId),
                selectedIds,
              }
            : {
                destinations: libraries.map(({ libraryId, removalToken }) => ({
                  libraryId,
                  removalToken,
                })),
              }
        ),
      });
      if (generation !== sessionGeneration()) return;
      const expected = adding ? 'exists' : 'missing';
      const verified = libraries.filter(({ libraryId }) =>
        response.destinations.some(
          (entry) => entry.libraryId === libraryId && entry.state === expected
        )
      ).length;
      setResult(`${verified} of ${libraries.length} libraries verified.`);
    } catch (error) {
      if (generation === sessionGeneration())
        setFailure(
          friendlyError(error, 'Could not verify the collection change.')
        );
    } finally {
      working.current = false;
      if (generation === sessionGeneration()) {
        setBusy(false);
        onComplete();
      }
    }
  }

  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={dismiss} />
      <div
        className="sheet"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h3>{title}</h3>
          </header>
          {!result && !failure && (
            <div className="setlist">
              {destinations.map(({ libraryId, libraryName, availableIds }) => (
                <label className="set" key={libraryId}>
                  <span>
                    {libraryName}
                    {adding && ` · ${availableIds?.length ?? 0} available`}
                  </span>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={selected.has(libraryId)}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.target.checked) next.add(libraryId);
                      else next.delete(libraryId);
                      setSelected(next);
                    }}
                  />
                </label>
              ))}
            </div>
          )}
          {result && <p role="status">{result}</p>}
          {failure && <p role="alert">{failure}</p>}
          <div className="toolbar">
            <button
              className="btn btn-quiet"
              type="button"
              disabled={busy}
              onClick={dismiss}
            >
              {result || failure ? 'Done' : 'Cancel'}
            </button>
            {!result && !failure && (
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy || !valid}
                onClick={() => void submit()}
              >
                {title}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

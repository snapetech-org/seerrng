import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  api,
  ApiError,
  MediaStatus,
  requestMovie,
  titleOf,
  type RequestOptions,
  type TitleResult,
} from '../api';
import { sessionGeneration } from '../sessionState';
import { AdvancedOptions, canChooseRequestOptions } from './detail';
import { streamingOverrideMessage } from './requestSheet';
import { useDialog } from './useDialog';
import VideoCollectionFilters, {
  emptyVideoFilters,
  matchesVideoFilters,
} from './VideoCollectionFilters';

export interface MovieCollection {
  id: number;
  name: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  parts: TitleResult[];
}

type Outcome = {
  id: number;
  message: string;
  accepted: boolean;
  overrideOptions?: RequestOptions;
};

function eligibility(part: TitleResult, is4k: boolean) {
  if (
    part.mediaType !== 'movie' ||
    !Number.isSafeInteger(part.id) ||
    part.id <= 0
  )
    return 'Unavailable';
  const status = is4k ? part.mediaInfo?.status4k : part.mediaInfo?.status;
  if (
    part.mediaInfo?.status === MediaStatus.BLOCKLISTED ||
    status === MediaStatus.BLOCKLISTED
  )
    return 'Blocklisted';
  if (status === MediaStatus.AVAILABLE || status === MediaStatus.PARTIAL)
    return 'In Library';
  if (
    status === MediaStatus.PROCESSING ||
    part.mediaInfo?.requests?.some(
      (request) =>
        !!request.is4k === is4k &&
        (request.status === 1 || request.status === 2)
    )
  )
    return 'Already Requested';
}

export default function CollectionRequestSheet({
  collection,
  qualities,
  permissions,
  close,
}: {
  collection: MovieCollection;
  qualities: ('hd' | '4k')[];
  permissions?: number;
  close: (submitted: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const working = useRef(false);
  const [quality, setQuality] = useState(qualities[0]);
  const is4k = quality === '4k';
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState(emptyVideoFilters);
  const [advanced, setAdvanced] = useState(false);
  const [options, setOptions] = useState<RequestOptions>({});
  const [ready, setReady] = useState(false);
  const onOptions = useCallback(
    (value: RequestOptions) => setOptions(value),
    []
  );
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>();
  const [error, setError] = useState('');
  const dismiss = () => {
    if (!working.current) close(!!outcomes);
  };
  useDialog(box, dismiss);

  const parts = [
    ...new Map(collection.parts.map((part) => [part.id, part])).values(),
  ];
  const visible = parts.filter((part) => matchesVideoFilters(part, filters));
  const eligible = visible.filter((part) => !eligibility(part, is4k));
  const targets = eligible.filter((part) => selected.has(part.id));
  const canSubmit =
    qualities.includes(quality) &&
    targets.length > 0 &&
    (!advanced || ready) &&
    !outcomes;

  const permittedOverrides = (outcomes ?? []).flatMap(
    ({ id, overrideOptions }) =>
      overrideOptions ? [{ id, options: overrideOptions }] : []
  );

  async function submit(override = false) {
    if (working.current || (override ? !permittedOverrides.length : !canSubmit))
      return;
    const requests = override
      ? permittedOverrides
      : targets.map(({ id }) => ({
          id,
          options: { ...(advanced ? options : {}), is4k },
        }));
    working.current = true;
    setBusy(true);
    setError('');
    const session = sessionGeneration();
    try {
      const fresh = await api<MovieCollection>(`/collection/${collection.id}`, {
        cache: 'no-store',
      });
      if (sessionGeneration() !== session) return;
      if (fresh.id !== collection.id) throw new Error();
      const current = new Map(fresh.parts.map((part) => [part.id, part]));
      const results: Outcome[] = [];
      for (const { id, options: requestOptions } of requests) {
        if (sessionGeneration() !== session) return;
        const part = current.get(id);
        const reason = part
          ? eligibility(part, is4k)
          : 'No longer in this collection';
        if (reason) {
          results.push({ id, message: reason, accepted: false });
          continue;
        }
        try {
          await requestMovie(
            id,
            override
              ? { ...requestOptions, bypassStreamingRequestPolicy: true }
              : requestOptions
          );
          results.push({ id, message: 'Request Submitted', accepted: true });
        } catch (failure) {
          const message = override
            ? undefined
            : streamingOverrideMessage(failure);
          if (message !== undefined) {
            results.push({
              id,
              message,
              accepted: false,
              overrideOptions: requestOptions,
            });
            continue;
          }
          results.push({
            id,
            message:
              failure instanceof ApiError && failure.status < 500
                ? 'Request Rejected'
                : 'Result Unconfirmed',
            accepted: false,
          });
        }
      }
      if (sessionGeneration() !== session) return;
      setOutcomes(
        override
          ? outcomes?.map(
              (item) => results.find(({ id }) => id === item.id) ?? item
            )
          : results
      );
    } catch {
      setError('Could not verify the collection. Try again before submitting.');
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={dismiss} />
      <div
        className="sheet"
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label="Request Collection"
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h2>Request Collection</h2>
            <p className="note">{collection.name}</p>
          </header>
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">Quality</span>
              <select
                aria-label="Collection Request Quality"
                value={quality}
                disabled={busy || !!outcomes}
                onChange={(event) => {
                  setQuality(event.target.value === '4k' ? '4k' : 'hd');
                  setSelected(new Set());
                  setOptions({});
                  setReady(false);
                }}
              >
                {qualities.map((value) => (
                  <option key={value} value={value}>
                    {value === '4k' ? '4K' : 'HD'}
                  </option>
                ))}
              </select>
            </label>
            {!outcomes && (
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy || !eligible.length}
                onClick={() =>
                  setSelected(
                    targets.length === eligible.length
                      ? new Set()
                      : new Set(eligible.map(({ id }) => id))
                  )
                }
              >
                {targets.length > 0 && targets.length === eligible.length
                  ? 'Clear Selection'
                  : 'Select Eligible Movies'}
              </button>
            )}
          </div>
          {!outcomes && canChooseRequestOptions(permissions) && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={advanced}
                  disabled={busy}
                  onChange={(event) => {
                    setAdvanced(event.target.checked);
                    setReady(false);
                  }}
                />{' '}
                Choose Request Destination
              </label>
              {advanced && !busy && (
                <AdvancedOptions
                  key={quality}
                  inline
                  kind="movie"
                  is4k={is4k}
                  onChange={onOptions}
                  onReady={setReady}
                />
              )}
            </>
          )}
          {!outcomes && (
            <VideoCollectionFilters
              kind="movie"
              filters={filters}
              onChange={setFilters}
              disabled={busy}
            />
          )}
          {!visible.length && (
            <p className="note">No movies match these filters.</p>
          )}
          <ul className="setlist">
            {visible.map((part) => {
              const reason = eligibility(part, is4k);
              const outcome = outcomes?.find(({ id }) => id === part.id);
              return (
                <li className="set" key={part.id}>
                  <label>
                    {!outcomes && (
                      <>
                        <input
                          type="checkbox"
                          checked={selected.has(part.id)}
                          disabled={busy || !!reason}
                          onChange={(event) =>
                            setSelected((previous) => {
                              const next = new Set(previous);
                              if (event.target.checked) next.add(part.id);
                              else next.delete(part.id);
                              return next;
                            })
                          }
                        />{' '}
                      </>
                    )}
                    {titleOf(part)}
                    {(outcome || reason) && (
                      <small>{outcome?.message || reason}</small>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
          {error && (
            <p className="note" role="alert">
              {error}
            </p>
          )}
          {outcomes && (
            <p className="note" role="status">
              {outcomes.filter(({ accepted }) => accepted).length} of{' '}
              {outcomes.length} requests submitted.
              {outcomes.some(({ accepted }) => !accepted) &&
                ' Review the individual results and the refreshed collection before trying again.'}
            </p>
          )}
          <div className="pk-foot">
            <button className="btn btn-quiet" disabled={busy} onClick={dismiss}>
              Close
            </button>
            {permittedOverrides.length > 0 && (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void submit(true)}
              >
                {busy
                  ? 'Submitting Requests…'
                  : `Request Anyway (${permittedOverrides.length})`}
              </button>
            )}
            {!outcomes && (
              <button
                className="btn btn-primary"
                disabled={busy || !canSubmit}
                onClick={() => void submit()}
              >
                {busy
                  ? 'Submitting Requests…'
                  : `Request Selected (${targets.length})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

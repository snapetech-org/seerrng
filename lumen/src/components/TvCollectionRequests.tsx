import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  api,
  requestSeries,
  type RequestOptions,
  type TvDetails,
} from '../api';
import { useAuth } from '../auth';
import { friendlyError } from '../errors';
import { useApi, usePublicSettings } from '../hooks';
import {
  requestableCollectionSeasons,
  type TvPlaybackCatalog,
} from '../tvCollectionSelection';
import { AdvancedOptions } from './detail';
import { ServiceNote } from './extra';
import {
  useAsksRequestOptions,
  useBackCloses,
  useOffers4k,
} from './requestSheet';
import { useDialog } from './useDialog';
import VideoCollectionFilters, {
  emptyVideoFilters,
  matchesVideoFilters,
  type VideoFilterMetadata,
} from './VideoCollectionFilters';

interface Member extends VideoFilterMetadata {
  id: string;
  title: string;
}

interface Quota {
  tv: { limit: number; remaining: number; restricted: boolean };
}

async function mapSeries<T, R>(items: T[], visit: (item: T) => Promise<R>) {
  let next = 0;
  const results: R[] = [];
  await Promise.all(
    Array.from({ length: Math.min(5, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await visit(items[index]);
      }
    })
  );
  return results;
}

function Sheet({
  members,
  canRequestHd,
  offers4k,
  close,
  refresh,
}: {
  members: Member[];
  canRequestHd: boolean;
  offers4k: boolean;
  close: () => void;
  refresh: () => void;
}) {
  const { user } = useAuth();
  const settings = usePublicSettings();
  const advanced = useAsksRequestOptions();
  const [fourK, setFourK] = useState(!canRequestHd);
  const [ready, setReady] = useState(false);
  const [options, setOptions] = useState<RequestOptions>({});
  const onOptions = useCallback(
    (value: RequestOptions) => setOptions(value),
    []
  );
  const quotaId = (advanced ? options.userId : undefined) ?? user?.id;
  const quota = useApi<Quota>(quotaId ? `/user/${quotaId}/quota` : null, {
    currentPathOnly: true,
  });
  const [filters, setFilters] = useState(emptyVideoFilters);
  const [checked, setChecked] = useState(new Set<string>());
  const [results, setResults] = useState<{ title: string; error?: string }[]>();
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<{
    members: Member[];
    fourK: boolean;
    revision: number;
    rows: { member: Member; detail?: TvDetails; catalog?: TvPlaybackCatalog }[];
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void mapSeries(members, async (member) => {
      if (signal.aborted || !/^[1-9]\d*$/.test(member.id)) return { member };
      try {
        const detail = await api<TvDetails>(`/tv/${member.id}`, { signal });
        const catalog = detail.mediaInfo?.id
          ? await api<TvPlaybackCatalog>(
              `/playback/media/${detail.mediaInfo.id}${fourK ? '?is4k=true' : ''}`,
              { signal }
            ).catch(() => undefined)
          : undefined;
        return { member, detail, catalog };
      } catch {
        return { member };
      }
    }).then((rows) => {
      if (!signal.aborted) setLoaded({ members, fourK, revision, rows });
    });
    return () => controller.abort();
  }, [members, fourK, revision]);

  const rows =
    loaded?.members === members &&
    loaded.fourK === fourK &&
    loaded.revision === revision
      ? loaded.rows
          .map(({ member, detail, catalog }) => ({
            member,
            detail,
            selections: detail
              ? requestableCollectionSeasons(
                  detail,
                  fourK,
                  !!settings?.enableSpecialEpisodes,
                  catalog
                )
              : [],
          }))
          .filter(({ member, detail }) =>
            matchesVideoFilters(
              {
                ...member,
                status: member.status ?? detail?.status,
                originalLanguage:
                  member.originalLanguage ?? detail?.originalLanguage,
              },
              filters
            )
          )
      : null;
  const selected =
    rows?.filter(
      ({ member, selections }) => checked.has(member.id) && selections.length
    ) ?? [];
  const count = selected.reduce(
    (total, row) => total + row.selections.length,
    0
  );
  const eligible = rows?.filter(({ selections }) => selections.length) ?? [];
  const allSelected =
    eligible.length > 0 && eligible.length === selected.length;
  const totalSeasons = eligible.reduce(
    (total, row) => total + row.selections.length,
    0
  );
  const ignoreQuota = advanced && options.ignoreQuota === true;
  const canSelectAll =
    !!quota.data &&
    (ignoreQuota ||
      (!quota.data.tv.restricted &&
        (!quota.data.tv.limit || totalSeasons <= quota.data.tv.remaining)));
  const overQuota =
    !ignoreQuota &&
    (!!quota.data?.tv.restricted ||
      (!!quota.data?.tv.limit && count > quota.data.tv.remaining));
  const canSubmit =
    !!settings && !!quota.data && !overQuota && !!count && (!advanced || ready);

  function finish() {
    if (active.current) return;
    if (results) refresh();
    close();
  }
  useDialog(dialog, finish);
  useBackCloses(finish);

  async function submit() {
    if (!canSubmit || active.current || results) return;
    active.current = true;
    setBusy(true);
    try {
      setResults(
        await mapSeries(selected, async ({ member, detail, selections }) => {
          try {
            const result = await requestSeries(
              Number(member.id),
              selections.map(({ seasonNumber }) => seasonNumber),
              {
                ...(advanced ? options : {}),
                is4k: fourK,
                tvdbId: detail?.externalIds?.tvdbId ?? undefined,
                seasonRequests: settings?.partialRequestsEnabled
                  ? selections
                  : undefined,
              }
            );
            return {
              title: member.title,
              error:
                Number.isSafeInteger(result?.id) && result.id > 0
                  ? undefined
                  : 'No selected seasons were added.',
            };
          } catch (error) {
            return {
              title: member.title,
              error: friendlyError(error, 'Request failed'),
            };
          }
        })
      );
    } finally {
      active.current = false;
      setBusy(false);
    }
  }

  return createPortal(
    <div className="sheet-wrap open">
      <div className="sheet-scrim" aria-hidden="true" onClick={finish} />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Request Series"
        ref={dialog}
      >
        <div className="grab" />
        <div className="pk">
          <header>
            <h3>Request Series</h3>
          </header>
          {results ? (
            <>
              <p role="status">
                {results.filter(({ error }) => !error).length} requested,{' '}
                {results.filter(({ error }) => error).length} failed.
              </p>
              <ul className="slist">
                {results.map(
                  ({ title, error }, index) =>
                    error && (
                      <li key={index}>
                        {title} · {error}
                      </li>
                    )
                )}
              </ul>
            </>
          ) : (
            <>
              {offers4k && canRequestHd && (
                <label className="sel">
                  <span className="lbl">Quality</span>
                  <select
                    value={fourK ? '4k' : 'hd'}
                    disabled={busy}
                    onChange={(event) => {
                      setFourK(event.target.value === '4k');
                      setChecked(new Set());
                      setOptions({});
                      setReady(false);
                    }}
                  >
                    <option value="hd">HD</option>
                    <option value="4k">4K</option>
                  </select>
                </label>
              )}
              {advanced && (
                <div inert={busy}>
                  <AdvancedOptions
                    key={String(fourK)}
                    kind="tv"
                    is4k={fourK}
                    onChange={onOptions}
                    onReady={setReady}
                    inline
                  />
                </div>
              )}
              <ServiceNote
                what="request quota"
                error={quota.error}
                retry={quota.reload}
              />
              {!quota.data && !quota.error && (
                <p className="note" role="status">
                  Loading request quota…
                </p>
              )}
              <VideoCollectionFilters
                kind="tv"
                filters={filters}
                onChange={setFilters}
                disabled={busy}
              />
              {!rows ? (
                <p className="note" role="status">
                  Loading series…
                </p>
              ) : (
                <>
                  {!rows.length && (
                    <p className="note">No series match these filters.</p>
                  )}
                  {!!eligible.length && (
                    <div className="toolbar">
                      <button
                        className="btn btn-quiet btn-sm"
                        type="button"
                        disabled={busy || (!allSelected && !canSelectAll)}
                        onClick={() =>
                          setChecked(
                            new Set(
                              allSelected
                                ? []
                                : eligible.map(({ member }) => member.id)
                            )
                          )
                        }
                      >
                        {allSelected ? 'Clear Selection' : 'Select All'}
                      </button>
                    </div>
                  )}
                  <div className="setlist">
                    {rows.map(({ member, detail, selections }) => (
                      <label className="set cfg-row" key={member.id}>
                        <span>
                          {member.title}
                          <small>
                            {!detail
                              ? 'Series details unavailable'
                              : !detail.externalIds?.tvdbId
                                ? 'Request individually to select a TVDB match'
                                : selections.length
                                  ? `${selections.length} requestable ${selections.length === 1 ? 'season' : 'seasons'}`
                                  : 'No requestable seasons'}
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          checked={checked.has(member.id)}
                          disabled={busy || !selections.length}
                          onChange={(event) => {
                            const enabled = event.target.checked;
                            setChecked((previous) => {
                              const next = new Set(previous);
                              if (enabled) next.add(member.id);
                              else next.delete(member.id);
                              return next;
                            });
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  {rows.some(({ detail }) => !detail) && (
                    <button
                      className="btn btn-quiet"
                      type="button"
                      disabled={busy}
                      onClick={() => setRevision((value) => value + 1)}
                    >
                      Retry Series Details
                    </button>
                  )}
                  <p className="note" role="status">
                    {count} {count === 1 ? 'season' : 'seasons'} selected
                    {overQuota ? ' · Request quota exceeded' : ''}
                  </p>
                </>
              )}
            </>
          )}
          <div className="pk-foot">
            {!results && (
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy || !canSubmit}
                onClick={() => void submit()}
              >
                {busy ? 'Requesting…' : 'Request Selected Series'}
              </button>
            )}
            <button
              className="btn btn-quiet"
              type="button"
              disabled={busy}
              onClick={finish}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function TvCollectionRequests({
  members,
  refresh,
}: {
  members: Member[];
  refresh: () => void;
}) {
  const { user } = useAuth();
  const offers4k = useOffers4k('tv');
  const permissions = user?.permissions;
  const canRequestHd =
    typeof permissions === 'number' && (permissions & (2 | 32 | 524288)) !== 0;
  const [open, setOpen] = useState(false);
  if ((!canRequestHd && !offers4k) || !members.length) return null;
  return (
    <>
      <button
        className="btn btn-tonal btn-sm"
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Request Series
      </button>
      {open && (
        <Sheet
          members={members}
          canRequestHd={canRequestHd}
          offers4k={offers4k}
          close={() => setOpen(false)}
          refresh={refresh}
        />
      )}
    </>
  );
}

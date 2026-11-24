import { useRef, useState } from 'react';
import { api } from '../api';
import { forget } from '../apiCache';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';
import { Section } from './cards';
import { ServiceNote } from './extra';

interface Provider {
  id: number;
  name: string;
}

interface ProviderSettings {
  streamingSubscriptionProviderIds?: number[];
}

const MAX_PROVIDERS = 500;

function sameSelection(left: Set<number>, right: Set<number>) {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

export function StreamingSubscriptions({
  path,
  region,
  initialIds,
}: {
  path: string;
  region: string;
  initialIds: number[];
}) {
  const { t } = useLumenLocale();
  const suffix = `?watchRegion=${encodeURIComponent(region)}`;
  const movies = useApi<Provider[]>(`/watchproviders/movies${suffix}`);
  const series = useApi<Provider[]>(`/watchproviders/tv${suffix}`);
  const [saved, setSaved] = useState(() => new Set(initialIds));
  const [draft, setDraft] = useState(saved);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const byId = new Map(
    [
      ...(Array.isArray(movies.data) ? movies.data : []),
      ...(Array.isArray(series.data) ? series.data : []),
    ].map((provider) => [provider.id, provider])
  );
  for (const id of draft) {
    if (!byId.has(id)) byId.set(id, { id, name: `Provider #${id}` });
  }
  const query = search.trim().toLocaleLowerCase();
  const visible = [...byId.values()]
    .filter(({ name }) => name.toLocaleLowerCase().includes(query))
    .sort(
      (a, b) =>
        Number(draft.has(b.id)) - Number(draft.has(a.id)) ||
        a.name.localeCompare(b.name)
    );
  const visibleIds = visible.map(({ id }) => id);
  const selectedVisible = visibleIds.filter((id) => draft.has(id)).length;
  function changeVisible(select: boolean) {
    setDraft((current) => {
      const next = new Set(current);
      for (const id of visibleIds) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    setNotice('');
  }

  const changed = !sameSelection(saved, draft);

  async function save() {
    if (pending.current || !changed || draft.size > MAX_PROVIDERS) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<ProviderSettings>(path, {
        method: 'POST',
        body: JSON.stringify({ streamingSubscriptionProviderIds: [...draft] }),
      });
      if (generation !== sessionGeneration()) return;
      const ids = result.streamingSubscriptionProviderIds;
      const readback = await api<ProviderSettings>(path);
      if (generation !== sessionGeneration()) return;
      const persistedIds = readback.streamingSubscriptionProviderIds;
      if (
        !Array.isArray(ids) ||
        !sameSelection(new Set(ids), draft) ||
        !Array.isArray(persistedIds) ||
        !sameSelection(new Set(persistedIds), draft)
      ) {
        setFailure(
          t(
            'lumen.account.streamingSubscriptionsConfirmFailure',
            'Could not confirm the saved subscriptions. Try again.'
          )
        );
        return;
      }
      forget(path);
      setSaved(draft);
      setNotice(
        t(
          'lumen.account.streamingSubscriptionsSaved',
          'Streaming subscriptions saved.'
        )
      );
    } catch {
      if (generation === sessionGeneration())
        setFailure(
          t(
            'lumen.account.streamingSubscriptionsSaveFailure',
            'Could not save streaming subscriptions. Try again.'
          )
        );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section
      title={t(
        'lumen.account.streamingSubscriptions',
        'Streaming Subscriptions'
      )}
    >
      <p className="note">
        {t(
          'lumen.account.streamingSubscriptionsTip',
          'Select services available in {region} that you subscribe to. SeerrNG uses them in request availability rules.',
          { region: region || 'US' }
        )}
      </p>
      <ServiceNote
        error={movies.error}
        what={t('lumen.error.what.movieProviders', 'movie providers')}
        retry={movies.reload}
      />
      <ServiceNote
        error={series.error}
        what={t('lumen.error.what.seriesProviders', 'series providers')}
        retry={series.reload}
      />
      {((!movies.data && !movies.error) || (!series.data && !series.error)) && (
        <p className="note" role="status">
          {t(
            'lumen.account.loadingStreamingProviders',
            'Loading streaming providers…'
          )}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="toolbar">
          <label className="search">
            <input
              type="search"
              aria-label={t(
                'lumen.account.filterStreamingServices',
                'Filter streaming services'
              )}
              placeholder={t(
                'lumen.account.filterStreamingServices',
                'Filter streaming services'
              )}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy || selectedVisible === visibleIds.length}
            onClick={() => changeVisible(true)}
          >
            {t('lumen.account.selectShown', 'Select Shown')}
          </button>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy || selectedVisible === 0}
            onClick={() => changeVisible(false)}
          >
            {t('lumen.account.clearShown', 'Clear Shown')}
          </button>
          <span className="count">
            {t('lumen.account.selectedCount', '{count} selected', {
              count: draft.size,
            })}
          </span>
        </div>
        {visible.length > 0 ? (
          <div className="setlist picklist">
            {visible.map(({ id, name }) => (
              <label className="set pick" key={id}>
                <b>{name}</b>
                <input
                  type="checkbox"
                  checked={draft.has(id)}
                  disabled={busy}
                  onChange={(event) => {
                    const next = new Set(draft);
                    if (event.target.checked) next.add(id);
                    else next.delete(id);
                    setDraft(next);
                  }}
                />
              </label>
            ))}
          </div>
        ) : movies.data && series.data ? (
          <p className="note">
            {t(
              'lumen.account.noMatchingStreamingServices',
              'No matching streaming services.'
            )}
          </p>
        ) : null}
        {draft.size > MAX_PROVIDERS && (
          <p className="note" role="alert">
            {t(
              'lumen.account.maxStreamingServices',
              'Select at most 500 services.'
            )}
          </p>
        )}
        {notice && (
          <p className="note" role="status">
            {notice}
          </p>
        )}
        {failure && (
          <p className="note" role="alert">
            {failure}
          </p>
        )}
        <div className="toolbar">
          <button
            className="btn btn-primary btn-sm"
            disabled={busy || !changed || draft.size > MAX_PROVIDERS}
          >
            {busy
              ? t('lumen.account.saving', 'Saving…')
              : t(
                  'lumen.account.saveStreamingSubscriptions',
                  'Save Streaming Subscriptions'
                )}
          </button>
        </div>
      </form>
    </Section>
  );
}

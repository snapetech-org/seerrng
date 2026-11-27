import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { quotaCategories as categories } from '../quotaCategories';
import { ServiceNote } from './extra';

type Category = keyof typeof categories;

export default function ManagedQuotas({ id }: { id: number }) {
  const { t } = useLumenLocale();
  const path = `/user/${id}/settings/main`;
  const { data, error, reload } = useApi<Record<string, number | null>>(path);
  const [category, setCategory] = useState<Category>('movie');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [drafts, setDrafts] = useState<
    Partial<Record<Category, { limit: string; days: string }>>
  >({});
  const working = useRef(false);
  const limitKey = `${category}QuotaLimit`;
  const daysKey = `${category}QuotaDays`;
  const global = `global${category[0].toUpperCase()}${category.slice(1)}Quota`;
  const globalLimit = data?.[global + 'Limit'] ?? 0;
  const globalDays = data?.[global + 'Days'] ?? 0;
  const quotaWindow = globalDays
    ? t(
        globalDays === 1
          ? 'lumen.managedQuotas.perDay'
          : 'lumen.managedQuotas.perDays',
        globalDays === 1 ? 'per {count} day' : 'per {count} days',
        { count: globalDays }
      )
    : t('lumen.managedQuotas.allTime', 'across all time');
  const serverDefault = globalLimit
    ? t(
        globalLimit === 1
          ? 'lumen.managedQuotas.requestWindow'
          : 'lumen.managedQuotas.requestsWindow',
        globalLimit === 1
          ? '{count} request {window}'
          : '{count} requests {window}',
        { count: globalLimit, window: quotaWindow }
      )
    : t('lumen.managedQuotas.unlimited', 'unlimited requests');

  const currentDraft = drafts[category] ?? {
    limit: data?.[limitKey] == null ? '' : String(data[limitKey]),
    days: data?.[daysKey] == null ? '' : String(data[daysKey]),
  };

  function updateDraft(field: 'limit' | 'days', value: string) {
    setDrafts((current) => ({
      ...current,
      [category]: {
        ...(current[category] ?? {
          limit: data?.[limitKey] == null ? '' : String(data[limitKey]),
          days: data?.[daysKey] == null ? '' : String(data[daysKey]),
        }),
        [field]: value,
      },
    }));
    setFailure('');
    setMessage('');
  }

  async function save() {
    if (working.current || !data) return;
    const { limit, days } = currentDraft;
    if ((limit === '') !== (days === '')) {
      setFailure(
        t(
          'lumen.managedQuotas.bothValues',
          'Enter both values or clear both to use the server default.'
        )
      );
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
      const confirmed = await api<Record<string, number | null>>(path, {
        cache: 'no-store',
      });
      if (
        (confirmed[limitKey] ?? null) !==
          (limit === '' ? null : Number(limit)) ||
        (confirmed[daysKey] ?? null) !== (days === '' ? null : Number(days))
      ) {
        setFailure(
          t(
            'lumen.managedQuotas.confirmFailure',
            'Could not confirm the saved request quota. Review the current values and retry.'
          )
        );
        reload();
        return;
      }
      setDrafts((current) => {
        const next = { ...current };
        delete next[category];
        return next;
      });
      setMessage(t('lumen.managedQuotas.saved', 'Request quota saved.'));
      reload();
    } catch (failure) {
      setFailure(
        friendlyError(
          failure,
          t(
            'lumen.managedQuotas.saveFailure',
            'Could not save the request quota.'
          ),
          t
        )
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <ServiceNote
        error={error}
        what={t('lumen.managedQuotas.what', 'request quotas')}
        retry={reload}
      />
      {!data && !error && (
        <p className="note" role="status">
          {t('lumen.managedQuotas.loading', 'Loading request quotas…')}
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
            {t(
              'lumen.managedQuotas.description',
              'Leave both fields blank to use the server default.'
            )}
          </p>
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">
                {t('lumen.managedQuotas.mediaType', 'Media Type')}
              </span>
              <select
                value={category}
                disabled={busy}
                onChange={(event) => {
                  setCategory(event.target.value as Category);
                  setFailure('');
                  setMessage('');
                }}
              >
                {Object.entries(categories).map(([value]) => (
                  <option key={value} value={value}>
                    {t(
                      `lumen.managedQuotas.category.${value}`,
                      categories[value as Category]
                    )}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <small>
            {t('lumen.managedQuotas.serverDefault', 'Server default: {value}', {
              value: serverDefault,
            })}
          </small>
          <form
            className="toolbar"
            key={category}
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="sel">
              <span className="lbl">
                {t('lumen.managedQuotas.limit', 'Request Limit')}
              </span>
              <input
                className="cfg-json"
                type="number"
                name="limit"
                min={0}
                max={100000}
                value={currentDraft.limit}
                disabled={busy}
                onChange={(event) => updateDraft('limit', event.target.value)}
              />
            </label>
            <label className="sel">
              <span className="lbl">
                {t('lumen.managedQuotas.days', 'Quota Days')}
              </span>
              <input
                className="cfg-json"
                type="number"
                name="days"
                min={0}
                max={100000}
                value={currentDraft.days}
                disabled={busy}
                onChange={(event) => updateDraft('days', event.target.value)}
              />
            </label>
            <button className="btn btn-tonal btn-sm" disabled={busy}>
              {t('lumen.managedQuotas.save', 'Save Quota')}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

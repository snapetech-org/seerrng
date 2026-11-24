import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { movieCertifications, tvCertifications } from '../maturityRatings';
import { ServiceNote } from './extra';

const fields = [
  ['movieMaturityRatingLimit', 'Movie Rating Limit', movieCertifications],
  ['tvMaturityRatingLimit', 'Series Rating Limit', tvCertifications],
] as const;
type Policy = Record<(typeof fields)[number][0], string | null>;

export default function ManagedMaturity({ id }: { id: number }) {
  const { t } = useLumenLocale();
  const path = `/user/${id}/settings/maturity`;
  const { data, error, reload } = useApi<Policy>(path);
  const [draft, setDraft] = useState<Partial<Policy>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const working = useRef(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || working.current || !Object.keys(draft).length) return;
    working.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      const changes = Object.keys(draft) as (keyof Policy)[];
      const saved = await api<Policy>(path, {
        method: 'POST',
        body: JSON.stringify(draft),
      });
      const readback = await api<Policy>(path);
      if (
        changes.some(
          (key) => saved[key] !== draft[key] || readback[key] !== draft[key]
        )
      ) {
        setFailure(
          t(
            'lumen.managedMaturity.saveFailure',
            'Could not save maturity limits.'
          )
        );
        return;
      }
      setDraft({});
      setNotice(t('lumen.managedMaturity.saved', 'Maturity limits saved.'));
      await reload();
    } catch (error) {
      setFailure(
        friendlyError(
          error,
          t(
            'lumen.managedMaturity.saveFailure',
            'Could not save maturity limits.'
          ),
          t
        )
      );
    } finally {
      setBusy(false);
      working.current = false;
    }
  }

  return (
    <div>
      <ServiceNote
        error={error}
        what={t('lumen.managedMaturity.what', 'maturity limits')}
        retry={reload}
      />
      {!data && !error && (
        <p className="note" role="status">
          {t('lumen.managedMaturity.loading', 'Loading maturity limits…')}
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
            {t(
              'lumen.managedMaturity.description',
              'A limit applies to browsing and requests. Titles without a recognized US rating are blocked when a limit is set.'
            )}
          </p>
          <form className="toolbar" onSubmit={save}>
            {fields.map(([key, label, ratings]) => (
              <label className="sel" key={key}>
                <span className="lbl">
                  {t(`lumen.managedMaturity.${key}`, label)}
                </span>
                <select
                  disabled={busy}
                  value={
                    (Object.hasOwn(draft, key) ? draft[key] : data[key]) ?? ''
                  }
                  onChange={(event) => {
                    const value = event.target.value || null;
                    setNotice('');
                    setDraft((current) => {
                      const next = { ...current };
                      if (value === (data[key] ?? null)) delete next[key];
                      else next[key] = value;
                      return next;
                    });
                  }}
                >
                  <option value="">
                    {t('lumen.managedMaturity.noLimit', 'No Limit')}
                  </option>
                  {ratings.map((rating) => (
                    <option key={rating}>{rating}</option>
                  ))}
                </select>
              </label>
            ))}
            <button
              className="btn btn-tonal btn-sm"
              disabled={busy || !Object.keys(draft).length}
            >
              {t('lumen.managedMaturity.save', 'Save Maturity Limits')}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

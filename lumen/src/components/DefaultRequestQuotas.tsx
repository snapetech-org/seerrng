import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { friendlyError } from '../errors';
import { quotaCategories } from '../quotaCategories';
import { sessionGeneration } from '../sessionState';
import { Section } from './cards';

const categories = { ...quotaCategories, adult: 'Adult' };
const fields = [
  ['quotaLimit', 'Request Limit'],
  ['quotaDays', 'Quota Days'],
] as const;

type Category = keyof typeof categories;
type Quota = Record<(typeof fields)[number][0], number>;
export type DefaultQuotas = Partial<Record<Category, Quota>>;
type Draft = Partial<Record<keyof Quota, string>>;

export default function DefaultRequestQuotas({
  initial,
}: {
  initial: DefaultQuotas;
}) {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#default-request-quotas')
      document
        .getElementById('default-request-quotas')
        ?.scrollIntoView({ block: 'start' });
  }, [hash]);
  const [saved, setSaved] = useState(initial);
  const [drafts, setDrafts] = useState<Partial<Record<Category, Draft>>>({});
  const available = (Object.keys(categories) as Category[]).filter(
    (key) => saved[key]
  );
  const [selection, setSelection] = useState<Category>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const category = selection ?? available[0];
  const quota = saved[category];
  const draft = drafts[category];
  const changed = fields.flatMap(([key]) => {
    const raw = draft?.[key];
    return raw !== undefined && (raw === '' || Number(raw) !== quota?.[key])
      ? [[key, raw] as const]
      : [];
  });
  const valid = changed.every(
    ([, value]) => /^\d+$/.test(value) && Number(value) <= 10_000
  );

  async function save() {
    if (!quota || !changed.length || !valid || pending.current) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<{ defaultQuotas?: DefaultQuotas }>(
        '/settings/main',
        {
          method: 'POST',
          body: JSON.stringify({
            defaultQuotas: {
              [category]: Object.fromEntries(
                changed.map(([key, value]) => [key, Number(value)])
              ),
            },
          }),
        }
      );
      if (generation !== sessionGeneration()) return;
      const confirmed = result.defaultQuotas?.[category];
      if (
        !confirmed ||
        changed.some(([key, value]) => confirmed[key] !== Number(value))
      ) {
        setFailure('Could not confirm the saved default quota.');
        return;
      }
      setSaved((current) => ({ ...current, [category]: confirmed }));
      setDrafts((current) => ({ ...current, [category]: undefined }));
      setNotice('Default request quota saved.');
    } catch (error) {
      if (generation === sessionGeneration()) {
        setFailure(friendlyError(error, 'Could not save the default quota.'));
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (!quota) return null;
  return (
    <Section
      title="Default Request Quotas"
      id="default-request-quotas"
      link={[
        'Default User Categories',
        '/admin/categories#default-user-categories',
      ]}
    >
      <p className="note">
        Default quotas apply to accounts without an override. A request limit of
        0 allows unlimited requests. With a positive limit, 0 quota days counts
        requests across all time.
      </p>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="sel">
          <span className="lbl">Quota Media Type</span>
          <select
            value={category}
            disabled={busy}
            onChange={(event) => {
              setSelection(event.target.value as Category);
              setFailure('');
              setNotice('');
            }}
          >
            {available.map((key) => (
              <option key={key} value={key}>
                {categories[key]}
              </option>
            ))}
          </select>
        </label>
        {fields.map(([key, label]) => (
          <label className="sel" key={key}>
            <span className="lbl">{label}</span>
            <input
              className="cfg-json"
              type="number"
              min={0}
              max={10000}
              required
              disabled={busy}
              value={draft?.[key] ?? quota[key]}
              onChange={(event) => {
                const value = event.target.value;
                setDrafts((current) => ({
                  ...current,
                  [category]: { ...current[category], [key]: value },
                }));
                setNotice('');
                setFailure('');
              }}
            />
          </label>
        ))}
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || !valid || !changed.length}
        >
          Save Default Quota
        </button>
      </form>
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
    </Section>
  );
}

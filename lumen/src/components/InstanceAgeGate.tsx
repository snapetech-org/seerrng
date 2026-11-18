import { useRef, useState } from 'react';
import { api } from '../api';
import { forget } from '../apiCache';
import { friendlyError } from '../errors';
import { movieCertifications, tvCertifications } from '../maturityRatings';
import { invalidatePublicSettings } from '../mediaServer';
import { sessionGeneration } from '../sessionState';
import { Section } from './cards';

export interface AgeGateSettings {
  defaultRestricted: boolean;
  maxMovieCertification: string;
  maxTvCertification: string;
  certificationCountry: string;
}

const limits = [
  ['maxMovieCertification', 'Highest Movie Rating', movieCertifications],
  ['maxTvCertification', 'Highest Series Rating', tvCertifications],
] as const;

export default function InstanceAgeGate({
  initial,
}: {
  initial: AgeGateSettings;
}) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const values = {
    ...draft,
    certificationCountry: draft.certificationCountry.trim().toUpperCase(),
  };
  const changed = (Object.keys(values) as (keyof AgeGateSettings)[]).filter(
    (key) => values[key] !== saved[key]
  );
  const validCountry = /^[A-Z]{2}$/.test(values.certificationCountry);

  function change<Key extends keyof AgeGateSettings>(
    key: Key,
    value: AgeGateSettings[Key]
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice('');
    setFailure('');
  }

  async function save() {
    if (pending.current || !changed.length || !validCountry) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<{ ageGate?: AgeGateSettings }>(
        '/settings/main',
        {
          method: 'POST',
          body: JSON.stringify({
            ageGate: Object.fromEntries(
              changed.map((key) => [key, values[key]])
            ),
          }),
        }
      );
      if (generation !== sessionGeneration()) return;
      invalidatePublicSettings();
      forget('/settings/public');
      if (
        !result.ageGate ||
        changed.some((key) => result.ageGate?.[key] !== values[key])
      ) {
        setFailure('Could not confirm the saved Age Gate settings.');
        return;
      }
      setSaved(result.ageGate);
      setDraft(result.ageGate);
      setNotice('Age Gate settings saved.');
    } catch (error) {
      if (generation === sessionGeneration()) {
        setFailure(friendlyError(error, 'Could not save Age Gate settings.'));
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title="Age Gate">
      <p className="note">
        Restricted accounts cannot access Adult content. SeerrNG also filters
        mature titles using available ratings and tags. Administrators are
        exempt.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="setlist">
          <label className="set cfg-row">
            <span>
              <b>Restrict Accounts by Default</b>
              <small>
                Applies to accounts without an explicit restriction setting.
              </small>
            </span>
            <input
              type="checkbox"
              aria-label="Restrict Accounts by Default"
              checked={draft.defaultRestricted}
              disabled={busy}
              onChange={(event) =>
                change('defaultRestricted', event.target.checked)
              }
            />
          </label>
          {limits.map(([key, label, options]) => (
            <label className="set cfg-row" key={key}>
              <b>{label}</b>
              <select
                className="cfg-input"
                aria-label={label}
                disabled={busy}
                value={draft[key]}
                onChange={(event) => change(key, event.target.value)}
              >
                {options.map((rating) => (
                  <option key={rating}>{rating}</option>
                ))}
              </select>
            </label>
          ))}
          <label className="set cfg-row">
            <span>
              <b>Rating Country</b>
              <small>Enter a two-letter country code such as US.</small>
            </span>
            <input
              className="cfg-input"
              aria-label="Rating Country"
              maxLength={2}
              disabled={busy}
              value={draft.certificationCountry}
              onChange={(event) =>
                change('certificationCountry', event.target.value)
              }
            />
          </label>
        </div>
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
        <div className="toolbar">
          <button
            className="btn btn-primary btn-sm"
            disabled={busy || !changed.length || !validCountry}
          >
            Save Age Gate
          </button>
        </div>
      </form>
    </Section>
  );
}

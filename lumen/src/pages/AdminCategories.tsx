import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { forget } from '../apiCache';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import InstanceAgeGate, {
  type AgeGateSettings,
} from '../components/InstanceAgeGate';
import MediaCategorySwitches from '../components/MediaCategorySwitches';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { invalidatePublicSettings } from '../mediaServer';
import { sessionGeneration } from '../sessionState';

const path = '/settings/main';

interface CategorySettings {
  enabledMediaCategories?: Record<string, boolean>;
  ageGate?: AgeGateSettings;
}

export default function AdminCategories() {
  const { data, error, reload } = useApi<CategorySettings>(path, {
    keepDuringRefresh: true,
  });
  const [confirmed, setConfirmed] = useState<CategorySettings>();
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const categories = data
    ? (confirmed ?? data).enabledMediaCategories
    : undefined;
  const changes = Object.entries(draft);

  async function save() {
    if (!categories || !changes.length || pending.current) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<CategorySettings>(path, {
        method: 'POST',
        body: JSON.stringify({ enabledMediaCategories: draft }),
      });
      if (generation !== sessionGeneration()) return;
      invalidatePublicSettings();
      forget('/settings/public');
      if (
        changes.some(
          ([key, value]) => result.enabledMediaCategories?.[key] !== value
        )
      ) {
        setFailure('Could not confirm the saved categories.');
        return;
      }
      setConfirmed(result);
      setDraft({});
      setNotice('Category settings saved.');
    } catch (error) {
      if (generation === sessionGeneration()) {
        setFailure(friendlyError(error, 'Could not save category settings.'));
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <header className="ph">
        <h1>Media Categories</h1>
        <div className="toolbar">
          <Link className="btn btn-quiet btn-sm" to="/me">
            Back to Account
          </Link>
        </div>
      </header>
      <Section title="Available Categories">
        <p className="note">
          Disabled categories are hidden from discovery and block new requests.
          Existing requests and download history remain available.
        </p>
        <ServiceNote error={error} what="media categories" retry={reload} />
        {!data && !error && (
          <p className="note" role="status">
            Loading media categories…
          </p>
        )}
        {data && !categories && (
          <p className="note">Category settings are unavailable.</p>
        )}
        {categories && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <MediaCategorySwitches
              values={{ ...categories, ...draft }}
              disabled={busy}
              disableUnavailable
              onChange={(key, enabled) => {
                setNotice('');
                setFailure('');
                setDraft((current) => {
                  const next = { ...current };
                  if (enabled === categories[key]) delete next[key];
                  else next[key] = enabled;
                  return next;
                });
              }}
            />
            {(draft.adult ?? categories.adult) && (
              <p className="note">
                Adult discovery requires a configured Whisparr v3 service and
                account permission. Restricted accounts cannot access it.
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
            <div className="toolbar">
              <button
                className="btn btn-primary btn-sm"
                disabled={busy || !changes.length}
              >
                Save Categories
              </button>
            </div>
          </form>
        )}
      </Section>
      {data?.ageGate && <InstanceAgeGate initial={data.ageGate} />}
    </>
  );
}

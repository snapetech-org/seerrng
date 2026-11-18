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
  defaultEnabledMediaCategories?: Record<string, boolean>;
  ageGate?: AgeGateSettings;
}

function CategoryForm({
  initial,
  field,
}: {
  initial: Record<string, boolean>;
  field: 'enabledMediaCategories' | 'defaultEnabledMediaCategories';
}) {
  const defaults = field === 'defaultEnabledMediaCategories';
  const [categories, setCategories] = useState(initial);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const changes = Object.entries(draft);

  async function save() {
    if (!changes.length || pending.current) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<CategorySettings>(path, {
        method: 'POST',
        body: JSON.stringify({ [field]: draft }),
      });
      if (generation !== sessionGeneration()) return;
      invalidatePublicSettings();
      forget('/settings/public');
      const saved = result[field];
      if (!saved || changes.some(([key, value]) => saved[key] !== value)) {
        setFailure('Could not confirm the saved categories.');
        return;
      }
      setCategories(saved);
      setDraft({});
      setNotice(
        defaults ? 'Default categories saved.' : 'Category settings saved.'
      );
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
      {!defaults && (draft.adult ?? categories.adult) && (
        <p className="note">
          Adult discovery requires a configured Whisparr v3 service and account
          permission. Restricted accounts cannot access it.
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
          {defaults ? 'Save Default Categories' : 'Save Categories'}
        </button>
      </div>
    </form>
  );
}

export default function AdminCategories() {
  const { data, error, reload } = useApi<CategorySettings>(path);

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
        {data?.enabledMediaCategories ? (
          <CategoryForm
            initial={data.enabledMediaCategories}
            field="enabledMediaCategories"
          />
        ) : (
          data && <p className="note">Category settings are unavailable.</p>
        )}
      </Section>
      {data?.defaultEnabledMediaCategories && (
        <Section title="Default User Categories">
          <p className="note">
            These choices apply to accounts that inherit the defaults.
            Instance-wide category restrictions still apply.
          </p>
          <CategoryForm
            initial={data.defaultEnabledMediaCategories}
            field="defaultEnabledMediaCategories"
          />
        </Section>
      )}
      {data?.ageGate && <InstanceAgeGate initial={data.ageGate} />}
    </>
  );
}

import { useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { forget } from '../apiCache';
import { useApi, type PublicSettings } from '../hooks';
import { invalidatePublicSettings } from '../mediaServer';
import { sessionGeneration } from '../sessionState';
import { Section } from './cards';
import { ServiceNote } from './extra';

const publicPath = '/settings/public';

const policies = [
  {
    key: 'personMovieBulkRequestsEnabled',
    label: 'Bulk Movie Requests From Person Pages',
    description:
      'Allow users with movie request permission to request eligible movies credited to a person.',
  },
  {
    key: 'enable4k',
    label: 'Enable 4K',
    description:
      'Allow 4K requests, issue reports, and separate availability tracking. Requests still need a configured 4K destination.',
  },
  {
    key: 'partialRequestsEnabled',
    label: 'Allow Partial Series Requests',
    description: 'Let users request individual seasons of a series.',
  },
  {
    key: 'enableSpecialEpisodes',
    label: 'Allow Special Episode Requests',
    description: 'Include specials when users select seasons to request.',
  },
  {
    key: 'tvSeasonWatchGateEnabled',
    label: 'Require the Previous Season to Be Watched',
    description:
      'Require the previous regular season to be watched before requesting later seasons. SeerrNG checks the requester’s linked media server.',
  },
] as const;
type Policies = Record<(typeof policies)[number]['key'], boolean>;

function RequestSettingsForm({ initial }: { initial: Policies }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const changed = policies.filter(({ key }) => draft[key] !== saved[key]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);

  async function save() {
    if (pending.current || !changed.length) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const body = Object.fromEntries(
        changed.map(({ key }) => [key, draft[key]])
      );
      const result = await api<Partial<Policies>>('/settings/main', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (generation !== sessionGeneration()) return;
      invalidatePublicSettings();
      forget(publicPath);
      if (changed.some(({ key }) => result[key] !== draft[key])) {
        setFailure('Could not confirm the saved request setting. Try again.');
        return;
      }
      setSaved(draft);
      setNotice('Instance request settings saved.');
    } catch (error) {
      if (generation === sessionGeneration())
        setFailure(
          error instanceof ApiError && error.status === 403
            ? 'Administrator permission is required to save these settings.'
            : 'Could not save the instance request setting. Try again.'
        );
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
      <div className="setlist">
        {policies.map(({ key, label, description }) => (
          <label className="set cfg-row" key={key}>
            <span>
              <b>{label}</b>
              <small>{description}</small>
            </span>
            <input
              type="checkbox"
              aria-label={label}
              checked={draft[key]}
              disabled={busy}
              onChange={(event) => {
                setDraft({ ...draft, [key]: event.target.checked });
                setNotice('');
                setFailure('');
              }}
            />
          </label>
        ))}
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
          disabled={busy || !changed.length}
        >
          Save Instance Request Settings
        </button>
      </div>
    </form>
  );
}

export function InstanceRequestSettings() {
  const settings = useApi<PublicSettings>(publicPath);
  return (
    <Section title="Instance Request Settings">
      <ServiceNote
        error={settings.error}
        what="instance request settings"
        retry={settings.reload}
      />
      {settings.data ? (
        <RequestSettingsForm
          initial={{
            personMovieBulkRequestsEnabled:
              settings.data.personMovieBulkRequestsEnabled === true,
            enable4k: settings.data.enable4k !== false,
            partialRequestsEnabled:
              settings.data.partialRequestsEnabled !== false,
            enableSpecialEpisodes: settings.data.enableSpecialEpisodes === true,
            tvSeasonWatchGateEnabled:
              settings.data.tvSeasonWatchGateEnabled === true,
          }}
        />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            Loading instance request settings…
          </p>
        )
      )}
    </Section>
  );
}

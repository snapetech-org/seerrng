import { useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { forget } from '../apiCache';
import { useApi, type PublicSettings } from '../hooks';
import { invalidatePublicSettings } from '../mediaServer';
import { sessionGeneration } from '../sessionState';
import { Section } from './cards';
import { ServiceNote } from './extra';

const publicPath = '/settings/public';

function RequestSettingsForm({ initial }: { initial: boolean }) {
  const [saved, setSaved] = useState(initial);
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);

  async function save() {
    if (pending.current || enabled === saved) return;
    const generation = sessionGeneration();
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<
        Pick<PublicSettings, 'personMovieBulkRequestsEnabled'>
      >('/settings/main', {
        method: 'POST',
        body: JSON.stringify({ personMovieBulkRequestsEnabled: enabled }),
      });
      if (generation !== sessionGeneration()) return;
      invalidatePublicSettings();
      forget(publicPath);
      if (result.personMovieBulkRequestsEnabled !== enabled) {
        setFailure('Could not confirm the saved request setting. Try again.');
        return;
      }
      setSaved(enabled);
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
        <label className="set cfg-row">
          <span>
            <b>Bulk Movie Requests From Person Pages</b>
            <small>
              Allow users with movie request permission to request eligible
              movies credited to a person.
            </small>
          </span>
          <input
            type="checkbox"
            aria-label="Bulk Movie Requests From Person Pages"
            checked={enabled}
            disabled={busy}
            onChange={(event) => {
              setEnabled(event.target.checked);
              setNotice('');
              setFailure('');
            }}
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
          disabled={busy || enabled === saved}
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
          initial={settings.data.personMovieBulkRequestsEnabled === true}
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

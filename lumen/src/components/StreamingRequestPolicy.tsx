import { useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
import { forget } from '../apiCache';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { Section } from './cards';
import { ServiceNote } from './extra';

type Policy = {
  enabled: boolean;
  condition: 'available' | 'unavailable';
  action: 'reject' | 'pending' | 'approve';
  rejectionMessage: string;
  allowUserOverride: boolean;
};

const endpoint = '/settings/main';
const defaults: Policy = {
  enabled: false,
  condition: 'available',
  action: 'reject',
  rejectionMessage: '',
  allowUserOverride: false,
};

function PolicyForm({ initial }: { initial: Policy }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const pending = useRef(false);
  const policy = { ...draft, rejectionMessage: draft.rejectionMessage.trim() };
  const changed = (Object.keys(defaults) as (keyof Policy)[]).some(
    (key) => saved[key] !== policy[key]
  );

  function change<K extends keyof Policy>(key: K, value: Policy[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice('');
    setFailure('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !changed) return;
    pending.current = true;
    setBusy(true);
    setNotice('');
    setFailure('');
    try {
      const result = await api<{ streamingRequestPolicy?: Policy }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ streamingRequestPolicy: policy }),
      });
      const updated = result.streamingRequestPolicy;
      if (
        !updated ||
        (Object.keys(defaults) as (keyof Policy)[]).some(
          (key) => updated[key] !== policy[key]
        )
      ) {
        throw new Error(
          'Could not confirm the saved streaming request policy.'
        );
      }
      setSaved(updated);
      setDraft(updated);
      forget(endpoint);
      setNotice('Streaming request policy saved.');
    } catch (error) {
      setFailure(
        friendlyError(error, 'Could not save streaming request policy.')
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)}>
      <div className="setlist">
        <label className="set cfg-row">
          <span>
            <b>Enable Streaming Request Policy</b>
            <small>
              Apply an action based on the requester’s streaming subscriptions.
            </small>
          </span>
          <input
            type="checkbox"
            aria-label="Enable Streaming Request Policy"
            checked={draft.enabled}
            disabled={busy}
            onChange={(event) => change('enabled', event.target.checked)}
          />
        </label>
        {draft.enabled && (
          <>
            <label className="set cfg-row">
              <b>When the title is</b>
              <select
                className="cfg-input"
                value={draft.condition}
                disabled={busy}
                onChange={(event) =>
                  change('condition', event.target.value as Policy['condition'])
                }
              >
                <option value="available">
                  Available on their subscriptions
                </option>
                <option value="unavailable">
                  Unavailable on their subscriptions
                </option>
              </select>
            </label>
            <label className="set cfg-row">
              <b>Request action</b>
              <select
                className="cfg-input"
                value={draft.action}
                disabled={busy}
                onChange={(event) =>
                  change('action', event.target.value as Policy['action'])
                }
              >
                <option value="reject">Reject</option>
                <option value="pending">Require approval</option>
                <option value="approve">Approve</option>
              </select>
            </label>
            {draft.action === 'reject' && (
              <label className="set cfg-row">
                <b>Rejection message</b>
                <textarea
                  className="cfg-json"
                  rows={3}
                  maxLength={1000}
                  value={draft.rejectionMessage}
                  disabled={busy}
                  onChange={(event) =>
                    change('rejectionMessage', event.target.value)
                  }
                />
              </label>
            )}
            <label className="set cfg-row">
              <b>Allow per-user overrides</b>
              <input
                type="checkbox"
                checked={draft.allowUserOverride}
                disabled={busy}
                onChange={(event) =>
                  change('allowUserOverride', event.target.checked)
                }
              />
            </label>
          </>
        )}
      </div>
      <div className="toolbar">
        <button className="btn btn-tonal btn-sm" disabled={busy || !changed}>
          Save Streaming Request Policy
        </button>
      </div>
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
    </form>
  );
}

export default function StreamingRequestPolicy() {
  const settings = useApi<{ streamingRequestPolicy?: Policy }>(endpoint);
  return (
    <Section title="Streaming Request Policy">
      <ServiceNote
        error={settings.error}
        what="streaming request policy"
        retry={settings.reload}
      />
      {settings.data ? (
        <PolicyForm
          initial={{ ...defaults, ...settings.data.streamingRequestPolicy }}
        />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            Loading streaming request policy…
          </p>
        )
      )}
    </Section>
  );
}

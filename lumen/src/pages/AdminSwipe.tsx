import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { forget } from '../apiCache';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { invalidatePublicSettings } from '../mediaServer';
import { sessionGeneration } from '../sessionState';

const path = '/settings/swipe';
interface Settings {
  enabled: boolean;
  aiProvider: 'none' | 'anthropic' | 'openai';
  aiModel: string;
  aiBaseUrl: string;
  aiEffort: 'low' | 'medium' | 'high';
  aiApiKeyConfigured: boolean;
}

function Editor({ initial }: { initial: Settings }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [key, setKey] = useState('');
  const [clear, setClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const pending = useRef(false);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(saved) || !!key || clear;

  function update(patch: Partial<Settings>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setFeedback(undefined);
  }

  async function submit(test: boolean) {
    if (pending.current || (test ? draft.aiProvider === 'none' : !dirty))
      return;
    pending.current = true;
    setBusy(true);
    setFeedback(undefined);
    const generation = sessionGeneration();
    const { enabled, aiProvider, aiModel, aiBaseUrl, aiEffort } = draft;
    const body = JSON.stringify({
      enabled,
      aiProvider,
      aiModel,
      aiBaseUrl,
      aiEffort,
      clearAiApiKey: clear,
      ...(key ? { aiApiKey: key } : {}),
    });
    try {
      if (test) {
        await api(path + '/test', { method: 'POST', body });
      } else {
        const result = await api<Settings>(path, { method: 'PUT', body });
        if (generation !== sessionGeneration()) return;
        setSaved(result);
        setDraft(result);
        setKey('');
        setClear(false);
        invalidatePublicSettings();
        forget('/settings/public');
        window.dispatchEvent(new Event('lumen-settings-updated'));
      }
      if (generation === sessionGeneration())
        setFeedback({
          text: test
            ? 'Ranking provider connection verified.'
            : 'Swipe settings saved.',
        });
    } catch (failure) {
      if (generation === sessionGeneration())
        setFeedback({
          text:
            failure instanceof ApiError
              ? failure.message
              : 'Could not update Swipe settings.',
          error: true,
        });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title="Swipe Ranking">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false);
        }}
      >
        <div className="setlist">
          <label className="set cfg-row">
            <span>Enable Swipe</span>
            <input
              type="checkbox"
              checked={draft.enabled}
              disabled={busy}
              onChange={(event) => update({ enabled: event.target.checked })}
            />
          </label>
          <label className="set cfg-row">
            <span>Ranking Provider</span>
            <select
              className="cfg-select"
              disabled={busy}
              value={draft.aiProvider}
              onChange={(event) =>
                update({
                  aiProvider: event.target.value as Settings['aiProvider'],
                })
              }
            >
              <option value="none">Built-In Recommendations</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI-Compatible Server</option>
            </select>
          </label>
          {draft.aiProvider !== 'none' && (
            <>
              <label className="set cfg-row">
                <span>Model ID</span>
                <input
                  className="cfg-input"
                  maxLength={100}
                  value={draft.aiModel}
                  disabled={busy}
                  onChange={(event) => update({ aiModel: event.target.value })}
                />
              </label>
              {draft.aiProvider === 'openai' && (
                <label className="set cfg-row">
                  <span>Base URL</span>
                  <input
                    className="cfg-input"
                    type="url"
                    maxLength={2048}
                    value={draft.aiBaseUrl}
                    disabled={busy}
                    onChange={(event) =>
                      update({ aiBaseUrl: event.target.value })
                    }
                  />
                </label>
              )}
              <label className="set cfg-row">
                <span>Ranking Effort</span>
                <select
                  className="cfg-select"
                  disabled={busy}
                  value={draft.aiEffort}
                  onChange={(event) =>
                    update({
                      aiEffort: event.target.value as Settings['aiEffort'],
                    })
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="set cfg-row">
                <span>API Key</span>
                <input
                  className="cfg-input"
                  type="password"
                  maxLength={512}
                  autoComplete="new-password"
                  value={key}
                  placeholder={
                    saved.aiApiKeyConfigured ? 'Saved key' : undefined
                  }
                  disabled={busy || clear}
                  onChange={(event) => {
                    setKey(event.target.value);
                    setFeedback(undefined);
                  }}
                />
              </label>
            </>
          )}
          {saved.aiApiKeyConfigured && (
            <label className="set cfg-row">
              <span>Remove Saved API Key</span>
              <input
                type="checkbox"
                checked={clear}
                disabled={busy}
                onChange={(event) => {
                  setClear(event.target.checked);
                  setFeedback(undefined);
                }}
              />
            </label>
          )}
        </div>
        {feedback && (
          <p className="note" role={feedback.error ? 'alert' : 'status'}>
            {feedback.text}
          </p>
        )}
        <div className="toolbar">
          <button
            className="btn btn-quiet btn-sm"
            type="button"
            disabled={busy || draft.aiProvider === 'none'}
            onClick={() => void submit(true)}
          >
            Test Ranking Provider
          </button>
          <button
            className="btn btn-primary btn-sm"
            type="submit"
            disabled={busy || !dirty}
          >
            Save Changes
          </button>
        </div>
      </form>
    </Section>
  );
}

export default function AdminSwipe() {
  const settings = useApi<Settings>(path);
  return (
    <>
      <h1>Swipe Settings</h1>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/me">
          Back to Account
        </Link>
      </div>
      <ServiceNote
        what="Swipe settings"
        error={settings.error}
        retry={settings.reload}
      />
      {settings.data ? (
        <Editor initial={settings.data} />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            Loading Swipe settings…
          </p>
        )
      )}
    </>
  );
}

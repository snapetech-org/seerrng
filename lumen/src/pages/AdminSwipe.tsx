import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { forget } from '../apiCache';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { invalidatePublicSettings } from '../mediaServer';
import { sessionGeneration } from '../sessionState';

const path = '/settings/swipe';
const defaultAnthropicModel = 'claude-opus-5-5';
interface Settings {
  enabled: boolean;
  aiProvider: 'none' | 'anthropic' | 'openai';
  aiModel: string;
  aiBaseUrl: string;
  aiEffort: 'low' | 'medium' | 'high';
  aiApiKeyConfigured: boolean;
}

function Editor({ initial }: { initial: Settings }) {
  const { t } = useLumenLocale();
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
    let writeAcknowledged = false;
    try {
      if (test) {
        await api(path + '/test', { method: 'POST', body });
      } else {
        const result = await api<Settings>(path, { method: 'PUT', body });
        writeAcknowledged = true;
        if (generation !== sessionGeneration()) return;
        const readback = await api<Settings>(path);
        if (generation !== sessionGeneration()) return;
        const expected = {
          enabled,
          aiProvider,
          aiModel:
            aiModel.trim() ||
            (aiProvider === 'anthropic' ? defaultAnthropicModel : ''),
          aiBaseUrl: aiBaseUrl.trim() || 'https://api.openai.com/v1',
          aiEffort,
          aiApiKeyConfigured: clear
            ? false
            : key
              ? true
              : saved.aiApiKeyConfigured,
        };
        const confirmed = Object.entries(expected).every(
          ([field, value]) =>
            result[field as keyof Settings] === value &&
            readback[field as keyof Settings] === value
        );
        if (!confirmed) {
          setFeedback({
            text: t(
              'components.Settings.SettingsSwipe.saveError',
              'Could not save Swipe settings.'
            ),
            error: true,
          });
          return;
        }
        setSaved(readback);
        setDraft(readback);
        setKey('');
        setClear(false);
        invalidatePublicSettings();
        forget('/settings/public');
        window.dispatchEvent(new Event('lumen-settings-updated'));
      }
      if (generation === sessionGeneration())
        setFeedback({
          text: test
            ? t(
                aiProvider === 'anthropic'
                  ? 'components.Settings.SettingsSwipe.testOk'
                  : 'components.Settings.SettingsSwipe.testOkGeneric'
              )
            : t('components.Settings.SettingsSwipe.saveSuccess'),
        });
    } catch (failure) {
      if (generation === sessionGeneration())
        setFeedback({
          text: writeAcknowledged
            ? t(
                'lumen.settings.confirmFailed',
                'The server accepted the change, but Lumen could not confirm the saved state. Keep this form open and retry.'
              )
            : test && failure instanceof ApiError
              ? failure.message
              : friendlyError(
                  failure,
                  t('components.Settings.SettingsSwipe.saveError'),
                  t
                ),
          error: true,
        });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section title={t('components.Settings.SettingsSwipe.title')}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false);
        }}
      >
        <div className="setlist">
          <label className="set cfg-row">
            <span>{t('components.Settings.SettingsSwipe.enabled')}</span>
            <input
              type="checkbox"
              checked={draft.enabled}
              disabled={busy}
              onChange={(event) => update({ enabled: event.target.checked })}
            />
          </label>
          <label className="set cfg-row">
            <span>{t('components.Settings.SettingsSwipe.aiProvider')}</span>
            <select
              className="cfg-select"
              aria-label={t('components.Settings.SettingsSwipe.aiProvider')}
              disabled={busy}
              value={draft.aiProvider}
              onChange={(event) => {
                const aiProvider = event.target.value as Settings['aiProvider'];
                update({
                  aiProvider,
                  aiModel:
                    aiProvider === 'anthropic'
                      ? defaultAnthropicModel
                      : aiProvider === 'openai' &&
                          draft.aiModel === defaultAnthropicModel
                        ? ''
                        : draft.aiModel,
                });
              }}
            >
              <option value="none">
                {t('components.Settings.SettingsSwipe.aiNone')}
              </option>
              <option value="anthropic">
                {t('components.Settings.SettingsSwipe.aiAnthropic')}
              </option>
              <option value="openai">
                {t('components.Settings.SettingsSwipe.aiOpenAi')}
              </option>
            </select>
          </label>
          <p className="note">
            {t('components.Settings.SettingsSwipe.aiNote')}
          </p>
          {draft.aiProvider !== 'none' && (
            <>
              <label className="set cfg-row">
                <span>
                  {t('components.Settings.SettingsSwipe.model')}
                  <small>
                    {t(
                      draft.aiProvider === 'anthropic'
                        ? 'components.Settings.SettingsSwipe.modelHelp'
                        : 'components.Settings.SettingsSwipe.openAiModelHelp',
                      draft.aiProvider === 'anthropic'
                        ? 'Claude model ID. Leave empty for the default ({model}).'
                        : 'The model name the server expects, for example a model you pulled into Ollama.',
                      { model: 'claude-opus-5-5' }
                    )}
                  </small>
                </span>
                <input
                  className="cfg-input"
                  maxLength={100}
                  aria-label={t('components.Settings.SettingsSwipe.model')}
                  value={draft.aiModel}
                  disabled={busy}
                  onChange={(event) => update({ aiModel: event.target.value })}
                />
              </label>
              {draft.aiProvider === 'openai' && (
                <label className="set cfg-row">
                  <span>
                    {t('components.Settings.SettingsSwipe.baseUrl')}
                    <small>
                      {t('components.Settings.SettingsSwipe.baseUrlHelp')}
                    </small>
                  </span>
                  <input
                    className="cfg-input"
                    type="url"
                    aria-label={t('components.Settings.SettingsSwipe.baseUrl')}
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
                <span>
                  {t('components.Settings.SettingsSwipe.effort')}
                  <small>
                    {t('components.Settings.SettingsSwipe.effortHelp')}
                  </small>
                </span>
                <select
                  className="cfg-select"
                  aria-label={t('components.Settings.SettingsSwipe.effort')}
                  disabled={busy}
                  value={draft.aiEffort}
                  onChange={(event) =>
                    update({
                      aiEffort: event.target.value as Settings['aiEffort'],
                    })
                  }
                >
                  <option value="low">
                    {t('components.Settings.SettingsSwipe.low')}
                  </option>
                  <option value="medium">
                    {t('components.Settings.SettingsSwipe.medium')}
                  </option>
                  <option value="high">
                    {t('components.Settings.SettingsSwipe.high')}
                  </option>
                </select>
              </label>
              <label className="set cfg-row">
                <span>
                  {t(
                    draft.aiProvider === 'anthropic'
                      ? 'components.Settings.SettingsSwipe.apiKey'
                      : 'components.Settings.SettingsSwipe.openAiKey'
                  )}
                  {draft.aiProvider === 'openai' && (
                    <small>
                      {t('components.Settings.SettingsSwipe.openAiKeyHelp')}
                    </small>
                  )}
                </span>
                <input
                  className="cfg-input"
                  type="password"
                  aria-label={t(
                    draft.aiProvider === 'anthropic'
                      ? 'components.Settings.SettingsSwipe.apiKey'
                      : 'components.Settings.SettingsSwipe.openAiKey'
                  )}
                  maxLength={512}
                  autoComplete="new-password"
                  value={key}
                  placeholder={
                    saved.aiApiKeyConfigured
                      ? t('components.Settings.SettingsSwipe.savedSecret')
                      : undefined
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
              <span>{t('components.Settings.SettingsSwipe.clearSecret')}</span>
              <input
                type="checkbox"
                aria-label={t('components.Settings.SettingsSwipe.clearSecret')}
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
            {busy
              ? t('components.Settings.SettingsSwipe.testing')
              : t('components.Settings.SettingsSwipe.test')}
          </button>
          <button
            className="btn btn-primary btn-sm"
            type="submit"
            disabled={busy || !dirty}
          >
            {busy
              ? t('components.Settings.SettingsSwipe.saving')
              : t('components.Settings.SettingsSwipe.save')}
          </button>
          {dirty && (
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(saved);
                setKey('');
                setClear(false);
                setFeedback(undefined);
              }}
            >
              {t('components.Settings.SettingsSwipe.cancel')}
            </button>
          )}
        </div>
      </form>
    </Section>
  );
}

export default function AdminSwipe() {
  const { t } = useLumenLocale();
  const settings = useApi<Settings>(path);
  return (
    <>
      <h1>{t('lumen.adminSwipe.pageTitle', 'Swipe Settings')}</h1>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin">
          {t('lumen.admin.title', 'Administration')}
        </Link>
      </div>
      <p className="note">
        {t('components.Settings.SettingsSwipe.description')}
      </p>
      <ServiceNote
        what={t('components.Settings.SettingsSwipe.title')}
        title={t('components.Settings.SettingsSwipe.loadError')}
        retryLabel={t('lumen.adminNetwork.retry', 'Retry')}
        error={settings.error}
        retry={settings.reload}
      />
      {settings.data ? (
        <Editor initial={settings.data} />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            {t('lumen.adminNetwork.loading', 'Loading…')}
          </p>
        )
      )}
    </>
  );
}

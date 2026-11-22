import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Section } from '../components/cards';
import { ServiceNote } from '../components/extra';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';
import { sessionGeneration } from '../sessionState';

const path = '/settings/recognition';
const mib = 1024 * 1024;

interface Settings {
  enabled: boolean;
  localOcr: boolean;
  visionProvider: 'none' | 'anthropic' | 'openai';
  visionModel: string;
  visionBaseUrl: string;
  externalConsent: boolean;
  maxImageBytes: number;
  visionApiKeyConfigured: boolean;
}

function Editor({
  initial,
  localOcr,
  onSaved,
}: {
  initial: Settings;
  localOcr?: boolean;
  onSaved: () => void;
}) {
  const { t } = useLumenLocale();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [key, setKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const pending = useRef(false);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(saved) || !!key || clearKey;

  function update(changes: Partial<Settings>) {
    setDraft((previous) => ({ ...previous, ...changes }));
    setFeedback(undefined);
  }

  async function save() {
    if (pending.current || !dirty) return;
    pending.current = true;
    setBusy(true);
    setFeedback(undefined);
    const generation = sessionGeneration();
    const {
      enabled,
      localOcr,
      visionProvider,
      visionModel,
      visionBaseUrl,
      externalConsent,
      maxImageBytes,
    } = draft;
    try {
      const result = await api<Settings>(path, {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          localOcr,
          visionProvider,
          visionModel,
          visionBaseUrl,
          externalConsent,
          maxImageBytes,
          ...(clearKey
            ? { clearVisionApiKey: true }
            : key
              ? { visionApiKey: key }
              : {}),
        }),
      });
      if (generation !== sessionGeneration()) return;
      setSaved(result);
      setDraft(result);
      setKey('');
      setClearKey(false);
      onSaved();
      setFeedback({
        text: t(
          'lumen.adminRecognition.settingsSaved',
          'Recognition settings saved.'
        ),
      });
    } catch (failure) {
      if (generation === sessionGeneration()) {
        setFeedback({
          text:
            failure instanceof ApiError
              ? failure.message
              : t(
                  'lumen.adminRecognition.saveFailure',
                  'Could not save recognition settings.'
                ),
          error: true,
        });
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <Section
      title={t('lumen.adminRecognition.sectionTitle', 'Share to Request')}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="setlist">
          <label className="set cfg-row">
            <span>
              {t('lumen.adminRecognition.enabled', 'Enable Share to Request')}
            </span>
            <input
              type="checkbox"
              checked={draft.enabled}
              disabled={busy}
              onChange={(event) => update({ enabled: event.target.checked })}
            />
          </label>
          <label className="set cfg-row">
            <span>
              {t(
                'lumen.adminRecognition.localOcr',
                'Read Images With Local Text Recognition'
              )}
              {saved.localOcr && localOcr !== undefined && (
                <small>
                  {localOcr
                    ? t(
                        'lumen.adminRecognition.ocrAvailable',
                        'Tesseract is available.'
                      )
                    : t(
                        'lumen.adminRecognition.ocrUnavailable',
                        'Tesseract is unavailable.'
                      )}
                </small>
              )}
            </span>
            <input
              type="checkbox"
              checked={draft.localOcr}
              disabled={busy}
              onChange={(event) => update({ localOcr: event.target.checked })}
            />
          </label>
          <label className="set cfg-row">
            <span>
              {t('lumen.adminRecognition.provider', 'Vision Provider')}
            </span>
            <select
              className="cfg-select"
              value={draft.visionProvider}
              disabled={busy}
              onChange={(event) =>
                update({
                  visionProvider: event.target
                    .value as Settings['visionProvider'],
                  externalConsent: false,
                })
              }
            >
              <option value="none">
                {t('lumen.adminRecognition.provider.off', 'Off (Local Only)')}
              </option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="openai">
                {t(
                  'lumen.adminRecognition.provider.openai',
                  'OpenAI-Compatible Server'
                )}
              </option>
            </select>
          </label>
          {draft.visionProvider !== 'none' && (
            <>
              {draft.visionProvider === 'openai' && (
                <label className="set cfg-row">
                  <span>{t('lumen.adminRecognition.baseUrl', 'Base URL')}</span>
                  <input
                    className="cfg-input"
                    inputMode="url"
                    maxLength={2048}
                    disabled={busy}
                    value={draft.visionBaseUrl}
                    onChange={(event) =>
                      update({
                        visionBaseUrl: event.target.value,
                        externalConsent: false,
                      })
                    }
                  />
                </label>
              )}
              <label className="set cfg-row">
                <span>{t('lumen.adminRecognition.modelId', 'Model ID')}</span>
                <input
                  className="cfg-input"
                  maxLength={100}
                  disabled={busy}
                  value={draft.visionModel}
                  onChange={(event) =>
                    update({ visionModel: event.target.value })
                  }
                />
              </label>
              <label className="set cfg-row">
                <span>{t('lumen.adminRecognition.apiKey', 'API Key')}</span>
                <input
                  className="cfg-input"
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    saved.visionApiKeyConfigured
                      ? t('lumen.adminRecognition.savedCredential', 'Saved')
                      : undefined
                  }
                  maxLength={512}
                  disabled={busy || clearKey}
                  value={key}
                  onChange={(event) => setKey(event.target.value)}
                />
              </label>
              {saved.visionApiKeyConfigured && (
                <label className="set cfg-row">
                  <span>
                    {t(
                      'lumen.adminRecognition.removeSavedKey',
                      'Remove Saved API Key'
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={clearKey}
                    disabled={busy}
                    onChange={(event) => setClearKey(event.target.checked)}
                  />
                </label>
              )}
              <label className="set cfg-row">
                <span>
                  {t(
                    'lumen.adminRecognition.externalConsent',
                    'Allow Uploaded Images to Be Sent to This Provider'
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={draft.externalConsent}
                  disabled={busy}
                  onChange={(event) =>
                    update({ externalConsent: event.target.checked })
                  }
                />
              </label>
            </>
          )}
          <label className="set cfg-row">
            <span>
              {t('lumen.adminRecognition.maxImage', 'Largest Image (MiB)')}
            </span>
            <input
              className="cfg-input"
              type="number"
              min={0.0625}
              max={20}
              step="any"
              required
              disabled={busy}
              value={
                Number.isFinite(draft.maxImageBytes)
                  ? draft.maxImageBytes / mib
                  : ''
              }
              onChange={(event) =>
                update({
                  maxImageBytes: Math.round(event.target.valueAsNumber * mib),
                })
              }
            />
          </label>
        </div>
        {feedback && (
          <p className="note" role={feedback.error ? 'alert' : 'status'}>
            {feedback.text}
          </p>
        )}
        <div className="toolbar">
          {dirty && (
            <button
              className="btn btn-quiet btn-sm"
              type="button"
              disabled={busy}
              onClick={() => {
                setDraft(saved);
                setKey('');
                setClearKey(false);
                setFeedback(undefined);
              }}
            >
              {t('lumen.adminRecognition.discardChanges', 'Discard Changes')}
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            type="submit"
            disabled={busy || !dirty}
          >
            {t('lumen.adminRecognition.saveChanges', 'Save Changes')}
          </button>
        </div>
      </form>
    </Section>
  );
}

export default function AdminRecognition() {
  const { t } = useLumenLocale();
  const settings = useApi<Settings>(path);
  const capabilities = useApi<{ localOcr: boolean }>('/resolve/capabilities');
  return (
    <>
      <header className="ph">
        <h1>
          {t('lumen.adminRecognition.pageTitle', 'Share and Image Recognition')}
        </h1>
      </header>
      <div className="toolbar">
        <Link className="btn btn-quiet btn-sm" to="/admin">
          {t('lumen.nav.administration', 'Administration')}
        </Link>
      </div>
      <ServiceNote
        what="recognition settings"
        title={t(
          'lumen.adminRecognition.loadFailureTitle',
          'Couldn’t load Recognition Settings'
        )}
        error={settings.error}
        retryLabel={t('lumen.common.retry', 'Retry')}
        retry={settings.reload}
      />
      {settings.data ? (
        <Editor
          initial={settings.data}
          localOcr={capabilities.data?.localOcr}
          onSaved={capabilities.reload}
        />
      ) : (
        !settings.error && (
          <p className="note" role="status">
            {t(
              'lumen.adminRecognition.loading',
              'Loading recognition settings…'
            )}
          </p>
        )
      )}
    </>
  );
}

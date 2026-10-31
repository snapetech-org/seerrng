import Alert from '@app/components/Common/Alert';
import ApiMessageText from '@app/components/Common/ApiMessageText';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import SettingsField from '@app/components/Settings/SettingsField';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import type { RecognitionSettings } from '@server/lib/settings';
import axios from 'axios';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const REDACTED = '[REDACTED]';

const messages = defineMessages('components.Settings.SettingsRecognition', {
  title: 'Share and Image Recognition',
  description:
    'Lets people paste links, ISBNs, and lists, or share a photo or screenshot, and get requestable matches. Links and lists need no setup.',
  loadError: 'Recognition settings could not be loaded.',
  enabled: 'Enable Share to Request',
  localOcr: 'Read Images With Local Text Recognition',
  localOcrAvailable: 'Tesseract was found on this server.',
  localOcrMissing:
    'Tesseract was not found on this server. Install it to read images locally.',
  providerNote:
    'Optional: an image recognition provider can read covers and screenshots that local text recognition cannot. Uploaded images are sent to the provider only when this is on and you confirm below. Images are never stored.',
  provider: 'Vision Provider',
  providerNone: 'Off (local only)',
  providerAnthropic: 'Anthropic Claude',
  providerOpenAi: 'OpenAI or compatible (Ollama, LM Studio)',
  baseUrl: 'Base URL',
  baseUrlHelp:
    'Local servers: their OpenAI-compatible URL, for example http://ollama:11434/v1. The model must accept images.',
  apiKey: 'API Key',
  apiKeyHelp: 'Optional for local servers that do not require a key.',
  savedSecret: 'Saved — leave empty to keep it',
  clearSecret: 'Remove the saved API key',
  model: 'Model',
  modelHelp: 'The model name the provider expects.',
  consent: 'I understand uploaded images will be sent to this provider.',
  maxImage: 'Largest Image (MB)',
  save: 'Save Changes',
  saving: 'Saving…',
  cancel: 'Discard Changes',
  unsaved: 'You have unsaved changes.',
  saveSuccess: 'Recognition settings saved.',
  saveError: 'Recognition settings could not be saved.',
});

type Draft = RecognitionSettings & { clearVisionApiKey: boolean };

const SettingsRecognition = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { data, error, mutate } = useSWR<RecognitionSettings>(
    '/api/v1/settings/recognition'
  );
  const { data: capabilities } = useSWR<{ localOcr: boolean }>(
    '/api/v1/resolve/capabilities'
  );
  const [draft, setDraft] = useState<Draft>();
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  useEffect(() => {
    if (data && !isDirty) setDraft({ ...data, clearVisionApiKey: false });
  }, [data, isDirty]);

  const update = (patch: Partial<Draft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setIsDirty(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setIsSaving(true);
    setSaveError(undefined);
    try {
      const response = await axios.put<RecognitionSettings>(
        '/api/v1/settings/recognition',
        draft
      );
      await mutate(response.data, { revalidate: false });
      setIsDirty(false);
      addToast(intl.formatMessage(messages.saveSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
    } catch (failure) {
      setSaveError(
        axios.isAxiosError(failure) &&
          typeof failure.response?.data?.error === 'string'
          ? failure.response.data.error
          : intl.formatMessage(messages.saveError)
      );
    } finally {
      setIsSaving(false);
    }
  };

  const usesProvider = draft?.visionProvider !== 'none';
  const usesOpenAi = draft?.visionProvider === 'openai';

  return (
    <section className="app-card-sub settings-group-card">
      <h3 className="settings-group-heading">
        {intl.formatMessage(messages.title)}
      </h3>
      <p className="settings-group-description">
        {intl.formatMessage(messages.description)}
      </p>
      <div className="settings-group-content">
        {!data && !error && <LoadingSpinner />}
        {error && (
          <Alert type="error" title={intl.formatMessage(messages.loadError)} />
        )}
        {data && draft && !error && (
          <form onSubmit={(event) => void submit(event)}>
            {saveError && (
              <Alert
                type="error"
                title={<ApiMessageText>{saveError}</ApiMessageText>}
              />
            )}
            <div className="form-row">
              <label htmlFor="recognition-enabled">
                {intl.formatMessage(messages.enabled)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <SettingsField
                    type="checkbox"
                    id="recognition-enabled"
                    name="recognition-enabled"
                    label={intl.formatMessage(messages.enabled)}
                    checked={draft.enabled}
                    disabled={isSaving}
                    onCheckedChange={(checked) => update({ enabled: checked })}
                  />
                </div>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="recognition-local">
                {intl.formatMessage(messages.localOcr)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <SettingsField
                    type="checkbox"
                    id="recognition-local"
                    name="recognition-local"
                    label={intl.formatMessage(messages.localOcr)}
                    checked={draft.localOcr}
                    disabled={isSaving}
                    onCheckedChange={(checked) => update({ localOcr: checked })}
                  />
                </div>
                <p className="settings-form-row-description">
                  {intl.formatMessage(
                    capabilities?.localOcr
                      ? messages.localOcrAvailable
                      : messages.localOcrMissing
                  )}
                </p>
              </div>
            </div>
            <Alert type="info">
              <p>{intl.formatMessage(messages.providerNote)}</p>
            </Alert>
            <div className="form-row">
              <label htmlFor="recognition-provider">
                {intl.formatMessage(messages.provider)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <select
                    id="recognition-provider"
                    value={draft.visionProvider}
                    disabled={isSaving}
                    onChange={(event) =>
                      update({
                        visionProvider: event.currentTarget
                          .value as RecognitionSettings['visionProvider'],
                      })
                    }
                  >
                    <option value="none">
                      {intl.formatMessage(messages.providerNone)}
                    </option>
                    <option value="anthropic">
                      {intl.formatMessage(messages.providerAnthropic)}
                    </option>
                    <option value="openai">
                      {intl.formatMessage(messages.providerOpenAi)}
                    </option>
                  </select>
                </div>
              </div>
            </div>
            {usesProvider && (
              <>
                {usesOpenAi && (
                  <div className="form-row">
                    <label htmlFor="recognition-base-url">
                      {intl.formatMessage(messages.baseUrl)}
                    </label>
                    <div className="form-input-area">
                      <div className="form-input-field">
                        <input
                          id="recognition-base-url"
                          type="text"
                          inputMode="url"
                          maxLength={2048}
                          disabled={isSaving}
                          value={draft.visionBaseUrl}
                          onChange={(event) =>
                            update({ visionBaseUrl: event.currentTarget.value })
                          }
                        />
                      </div>
                      <p className="settings-form-row-description">
                        {intl.formatMessage(messages.baseUrlHelp)}
                      </p>
                    </div>
                  </div>
                )}
                <div className="form-row">
                  <label htmlFor="recognition-key">
                    {intl.formatMessage(messages.apiKey)}
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <input
                        id="recognition-key"
                        type="password"
                        autoComplete="new-password"
                        maxLength={512}
                        disabled={isSaving || draft.clearVisionApiKey}
                        value={
                          draft.visionApiKey === REDACTED
                            ? ''
                            : draft.visionApiKey
                        }
                        placeholder={
                          draft.visionApiKey === REDACTED
                            ? intl.formatMessage(messages.savedSecret)
                            : ''
                        }
                        onChange={(event) =>
                          update({
                            visionApiKey:
                              event.currentTarget.value ||
                              (data.visionApiKey ? REDACTED : ''),
                          })
                        }
                      />
                    </div>
                    {usesOpenAi && (
                      <p className="settings-form-row-description">
                        {intl.formatMessage(messages.apiKeyHelp)}
                      </p>
                    )}
                    {data.visionApiKey && (
                      <div className="form-input-field">
                        <SettingsField
                          type="checkbox"
                          id="recognition-clear-key"
                          name="recognition-clear-key"
                          label={intl.formatMessage(messages.clearSecret)}
                          checked={draft.clearVisionApiKey}
                          disabled={isSaving}
                          onCheckedChange={(checked) =>
                            update({ clearVisionApiKey: checked })
                          }
                        />
                        <span>{intl.formatMessage(messages.clearSecret)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="recognition-model">
                    {intl.formatMessage(messages.model)}
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <input
                        id="recognition-model"
                        type="text"
                        maxLength={100}
                        disabled={isSaving}
                        value={draft.visionModel}
                        onChange={(event) =>
                          update({ visionModel: event.currentTarget.value })
                        }
                      />
                    </div>
                    <p className="settings-form-row-description">
                      {intl.formatMessage(messages.modelHelp)}
                    </p>
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="recognition-consent">
                    {intl.formatMessage(messages.consent)}
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <SettingsField
                        type="checkbox"
                        id="recognition-consent"
                        name="recognition-consent"
                        label={intl.formatMessage(messages.consent)}
                        checked={draft.externalConsent}
                        disabled={isSaving}
                        onCheckedChange={(checked) =>
                          update({ externalConsent: checked })
                        }
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
            <div className="form-row">
              <label htmlFor="recognition-max">
                {intl.formatMessage(messages.maxImage)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <input
                    id="recognition-max"
                    type="number"
                    min={1}
                    max={20}
                    disabled={isSaving}
                    value={Math.round(draft.maxImageBytes / (1024 * 1024))}
                    onChange={(event) =>
                      update({
                        maxImageBytes:
                          Math.max(
                            1,
                            Math.min(20, Number(event.currentTarget.value) || 6)
                          ) *
                          1024 *
                          1024,
                      })
                    }
                  />
                </div>
              </div>
            </div>
            {isDirty && (
              <p className="settings-form-row-description" role="status">
                {intl.formatMessage(messages.unsaved)}
              </p>
            )}
            <div className="actions">
              <div className="settings-card-actions settings-service-card-actions">
                {isDirty && (
                  <Button
                    type="button"
                    buttonSize="sm"
                    disabled={isSaving}
                    onClick={() => {
                      setDraft({ ...data, clearVisionApiKey: false });
                      setIsDirty(false);
                      setSaveError(undefined);
                    }}
                  >
                    {intl.formatMessage(messages.cancel)}
                  </Button>
                )}
                <Button
                  type="submit"
                  buttonType="primary"
                  buttonSize="sm"
                  disabled={!isDirty || isSaving}
                >
                  {intl.formatMessage(
                    isSaving ? messages.saving : messages.save
                  )}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </section>
  );
};

export default SettingsRecognition;

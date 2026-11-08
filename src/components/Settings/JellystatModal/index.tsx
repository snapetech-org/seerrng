import Modal from '@app/components/Common/Modal';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import Field from '@app/components/Settings/SettingsField';
import SettingsHelp from '@app/components/Settings/SettingsHelp';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isValidURL } from '@app/utils/urlValidationHelper';
import type { JellystatSettings } from '@server/lib/settings';
import axios from 'axios';
import { Form, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import * as Yup from 'yup';

const messages = defineMessages('components.Settings.JellystatModal', {
  addTitle: 'Connect Jellystat Server',
  editTitle: 'Edit Jellystat Server',
  intro:
    'SeerrNG shows lifetime play counts from Jellystat on titles linked to a Jellyfin item. Jellystat is read-only here, and nothing is written to it.',
  url: 'Server URL',
  urlHelp: 'For example, http://jellystat:3000.',
  apiKey: 'API Key',
  apiKeyHelp:
    'Create a key in Jellystat under its API keys settings. The key stays on the SeerrNG server.',
  test: 'Test Connection',
  testing: 'Connecting…',
  add: 'Connect',
  urlRequired: 'Enter a valid HTTP or HTTPS URL.',
  apiKeyRequired: 'Enter an API key.',
  testSuccess: 'Connected to Jellystat.',
  testFailure: 'Could not connect to Jellystat. Check the URL and API key.',
  saveFailure: 'Could not save the Jellystat connection.',
});

interface JellystatModalProps {
  settings: JellystatSettings | null;
  onClose: () => void;
  onSave: () => void;
}

const JellystatModal = ({ settings, onClose, onSave }: JellystatModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isTesting, setIsTesting] = useState(false);

  const JellystatSchema = Yup.object().shape({
    url: Yup.string()
      .required(intl.formatMessage(messages.urlRequired))
      .test('valid-url', intl.formatMessage(messages.urlRequired), isValidURL),
    apiKey: settings
      ? Yup.string()
      : Yup.string().required(intl.formatMessage(messages.apiKeyRequired)),
  });

  return (
    <Formik
      initialValues={{
        url: settings?.url ?? '',
        // The server returns a redacted placeholder; sending it keeps the saved key.
        apiKey: settings?.apiKey ?? '',
      }}
      validationSchema={JellystatSchema}
      onSubmit={async (values, { setSubmitting }) => {
        try {
          await axios.put('/api/v1/settings/jellystat', values);
          onSave();
        } catch {
          addToast(intl.formatMessage(messages.saveFailure), {
            appearance: 'error',
            autoDismiss: true,
          });
        } finally {
          setSubmitting(false);
        }
      }}
    >
      {({ values, errors, touched, isSubmitting, submitForm, isValid }) => {
        const testConnection = async () => {
          setIsTesting(true);
          try {
            await axios.post('/api/v1/settings/jellystat/test', values);
            addToast(intl.formatMessage(messages.testSuccess), {
              appearance: 'success',
              autoDismiss: true,
            });
          } catch {
            addToast(intl.formatMessage(messages.testFailure), {
              appearance: 'error',
              autoDismiss: true,
            });
          } finally {
            setIsTesting(false);
          }
        };

        return (
          <Modal
            title={intl.formatMessage(
              settings ? messages.editTitle : messages.addTitle
            )}
            onCancel={onClose}
            onOk={() => submitForm()}
            okText={
              isSubmitting
                ? intl.formatMessage(globalMessages.saving)
                : settings
                  ? intl.formatMessage(globalMessages.save)
                  : intl.formatMessage(messages.add)
            }
            okDisabled={isSubmitting || !isValid || isTesting}
            secondaryText={
              isTesting
                ? intl.formatMessage(messages.testing)
                : intl.formatMessage(messages.test)
            }
            onSecondary={() => testConnection()}
            secondaryDisabled={isSubmitting || !isValid || isTesting}
          >
            <Form>
              <SettingsHelp className="description">
                {intl.formatMessage(messages.intro)}
              </SettingsHelp>
              <div className="form-row">
                <label htmlFor="url" className="text-label">
                  {intl.formatMessage(messages.url)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field id="url" name="url" type="text" inputMode="url" />
                  </div>
                  <SettingsHelp className="settings-form-row-description">
                    {intl.formatMessage(messages.urlHelp)}
                  </SettingsHelp>
                  {errors.url &&
                    touched.url &&
                    typeof errors.url === 'string' && (
                      <div className="error">{errors.url}</div>
                    )}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="apiKey" className="text-label">
                  {intl.formatMessage(messages.apiKey)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <SensitiveInput as="field" id="apiKey" name="apiKey" />
                  </div>
                  <SettingsHelp className="settings-form-row-description">
                    {intl.formatMessage(messages.apiKeyHelp)}
                  </SettingsHelp>
                  {errors.apiKey &&
                    touched.apiKey &&
                    typeof errors.apiKey === 'string' && (
                      <div className="error">{errors.apiKey}</div>
                    )}
                </div>
              </div>
            </Form>
          </Modal>
        );
      }}
    </Formik>
  );
};

export default JellystatModal;

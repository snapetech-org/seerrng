import Modal from '@app/components/Common/Modal';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import Field from '@app/components/Settings/SettingsField';
import SettingsHelp from '@app/components/Settings/SettingsHelp';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isValidURL } from '@app/utils/urlValidationHelper';
import type { KavitaSettings } from '@server/lib/settings';
import axios from 'axios';
import { Form, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import * as Yup from 'yup';

const messages = defineMessages('components.Settings.KavitaModal', {
  addTitle: 'Connect Kavita Server',
  editTitle: 'Edit Kavita Server',
  intro:
    'Comics and manga that are in your library get a "Read in Kavita" button that opens the series in Kavita. SeerrNG finds each series by its folder (BackIssue and Kavita should see the same folders), then by name. SeerrNG does not change anything in Kavita.',
  hostname: 'Hostname or IP Address',
  port: 'Port',
  ssl: 'Use SSL',
  baseUrl: 'URL Base',
  apiKey: 'Auth Key',
  apiKeyHelp:
    "A Kavita auth key from the user's Account settings (Auth Keys). Use a user that can see the manga and comic libraries.",
  externalUrl: 'External URL',
  externalUrlHelp:
    'The address readers open, for example https://manga.example.com. Leave empty to use the address above.',
  test: 'Test Connection',
  testing: 'Connecting…',
  add: 'Connect',
  hostnameRequired: 'Enter a hostname or IP address.',
  portRequired: 'Enter a valid port.',
  apiKeyRequired: 'Enter an auth key.',
  urlInvalid: 'Enter a valid HTTP or HTTPS URL.',
  testSuccess:
    'Connected to Kavita: {count, plural, one {# manga or comic library} other {# manga and comic libraries}}.',
  testFailure:
    'Could not connect to Kavita. Check the address and the auth key.',
  saveFailure: 'Could not save the Kavita connection.',
});

interface KavitaModalProps {
  settings: KavitaSettings | null;
  onClose: () => void;
  onSave: () => void;
}

interface Values {
  hostname: string;
  port: number | string;
  useSsl: boolean;
  baseUrl: string;
  apiKey: string;
  externalUrl: string;
}

const KavitaModal = ({ settings, onClose, onSave }: KavitaModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isTesting, setIsTesting] = useState(false);

  const schema = Yup.object().shape({
    hostname: Yup.string().required(
      intl.formatMessage(messages.hostnameRequired)
    ),
    port: Yup.number()
      .typeError(intl.formatMessage(messages.portRequired))
      .integer(intl.formatMessage(messages.portRequired))
      .min(1, intl.formatMessage(messages.portRequired))
      .max(65535, intl.formatMessage(messages.portRequired))
      .required(intl.formatMessage(messages.portRequired)),
    apiKey: Yup.string().required(intl.formatMessage(messages.apiKeyRequired)),
    externalUrl: Yup.string().test(
      'valid-url',
      intl.formatMessage(messages.urlInvalid),
      (value) => !value || isValidURL(value)
    ),
  });

  const payload = (values: Values) => ({
    hostname: values.hostname.trim(),
    port: Number(values.port),
    useSsl: values.useSsl,
    baseUrl: values.baseUrl.trim(),
    // the server returns a redacted placeholder; sending it keeps the saved key
    apiKey: values.apiKey,
    externalUrl: values.externalUrl.trim(),
  });

  return (
    <Formik<Values>
      initialValues={{
        hostname: settings?.hostname ?? '',
        port: settings?.port ?? 5000,
        useSsl: settings?.useSsl ?? false,
        baseUrl: settings?.baseUrl ?? '',
        apiKey: settings?.apiKey ?? '',
        externalUrl: settings?.externalUrl ?? '',
      }}
      validationSchema={schema}
      onSubmit={async (values, { setSubmitting }) => {
        try {
          await axios.put('/api/v1/settings/kavita', payload(values));
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
            const response = await axios.post<{ libraries: unknown[] }>(
              '/api/v1/settings/kavita/test',
              payload(values)
            );
            addToast(
              intl.formatMessage(messages.testSuccess, {
                count: response.data.libraries.length,
              }),
              { appearance: 'success', autoDismiss: true }
            );
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
                <label htmlFor="hostname" className="text-label">
                  {intl.formatMessage(messages.hostname)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field id="hostname" name="hostname" type="text" />
                  </div>
                  {errors.hostname &&
                    touched.hostname &&
                    typeof errors.hostname === 'string' && (
                      <div className="error">{errors.hostname}</div>
                    )}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="port" className="text-label">
                  {intl.formatMessage(messages.port)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <Field
                    id="port"
                    name="port"
                    type="text"
                    inputMode="numeric"
                    className="short"
                  />
                  {errors.port &&
                    touched.port &&
                    typeof errors.port === 'string' && (
                      <div className="error">{errors.port}</div>
                    )}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="useSsl" className="checkbox-label">
                  {intl.formatMessage(messages.ssl)}
                </label>
                <div className="form-input-area">
                  <Field type="checkbox" id="useSsl" name="useSsl" />
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="baseUrl" className="text-label">
                  {intl.formatMessage(messages.baseUrl)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field id="baseUrl" name="baseUrl" type="text" />
                  </div>
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
              <div className="form-row">
                <label htmlFor="externalUrl" className="text-label">
                  {intl.formatMessage(messages.externalUrl)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      id="externalUrl"
                      name="externalUrl"
                      type="text"
                      inputMode="url"
                    />
                  </div>
                  <SettingsHelp className="settings-form-row-description">
                    {intl.formatMessage(messages.externalUrlHelp)}
                  </SettingsHelp>
                  {errors.externalUrl &&
                    touched.externalUrl &&
                    typeof errors.externalUrl === 'string' && (
                      <div className="error">{errors.externalUrl}</div>
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

export default KavitaModal;

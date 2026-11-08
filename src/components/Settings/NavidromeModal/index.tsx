import Modal from '@app/components/Common/Modal';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import Field from '@app/components/Settings/SettingsField';
import SettingsHelp from '@app/components/Settings/SettingsHelp';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isValidURL } from '@app/utils/urlValidationHelper';
import type { NavidromeSettings } from '@server/lib/settings';
import axios from 'axios';
import { Form, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import * as Yup from 'yup';

const messages = defineMessages('components.Settings.NavidromeModal', {
  addTitle: 'Connect Navidrome Server',
  editTitle: 'Edit Navidrome Server',
  intro:
    'SeerrNG reads your Navidrome music library during the scheduled scan and marks albums it finds as available. Albums are matched by MusicBrainz ID, so albums without one cannot be matched. SeerrNG does not change anything in Navidrome.',
  url: 'Server URL',
  urlHelp: 'For example, http://navidrome:4533.',
  username: 'Username',
  password: 'Password',
  passwordHelp:
    'Use an account that can browse the music library. The password stays on the SeerrNG server.',
  syncEnabled: 'Sync Availability During the Scheduled Scan',
  test: 'Test Connection',
  testing: 'Connecting…',
  add: 'Connect',
  urlRequired: 'Enter a valid HTTP or HTTPS URL.',
  usernameRequired: 'Enter a username.',
  passwordRequired: 'Enter a password.',
  testSuccess: 'Connected to Navidrome.',
  testFailure: 'Could not connect to Navidrome. Check the URL and credentials.',
  saveFailure: 'Could not save the Navidrome connection.',
});

interface NavidromeModalProps {
  settings: NavidromeSettings | null;
  onClose: () => void;
  onSave: () => void;
}

const NavidromeModal = ({ settings, onClose, onSave }: NavidromeModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isTesting, setIsTesting] = useState(false);

  const NavidromeSchema = Yup.object().shape({
    url: Yup.string()
      .required(intl.formatMessage(messages.urlRequired))
      .test('valid-url', intl.formatMessage(messages.urlRequired), isValidURL),
    username: Yup.string().required(
      intl.formatMessage(messages.usernameRequired)
    ),
    password: settings
      ? Yup.string()
      : Yup.string().required(intl.formatMessage(messages.passwordRequired)),
  });

  const payload = (values: {
    url: string;
    username: string;
    password: string;
    syncEnabled: boolean;
  }) => ({
    url: values.url,
    username: values.username,
    password: values.password,
    syncEnabled: values.syncEnabled,
  });

  return (
    <Formik
      initialValues={{
        url: settings?.url ?? '',
        username: settings?.username ?? '',
        // The server returns a redacted placeholder; sending it keeps the saved password.
        password: settings?.password ?? '',
        syncEnabled: settings?.syncEnabled ?? true,
      }}
      validationSchema={NavidromeSchema}
      onSubmit={async (values, { setSubmitting }) => {
        try {
          await axios.put('/api/v1/settings/navidrome', payload(values));
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
            await axios.post(
              '/api/v1/settings/navidrome/test',
              payload(values)
            );
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
                <label htmlFor="username" className="text-label">
                  {intl.formatMessage(messages.username)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field id="username" name="username" type="text" />
                  </div>
                  {errors.username &&
                    touched.username &&
                    typeof errors.username === 'string' && (
                      <div className="error">{errors.username}</div>
                    )}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="password" className="text-label">
                  {intl.formatMessage(messages.password)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <SensitiveInput as="field" id="password" name="password" />
                  </div>
                  <SettingsHelp className="settings-form-row-description">
                    {intl.formatMessage(messages.passwordHelp)}
                  </SettingsHelp>
                  {errors.password &&
                    touched.password &&
                    typeof errors.password === 'string' && (
                      <div className="error">{errors.password}</div>
                    )}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="syncEnabled" className="checkbox-label">
                  {intl.formatMessage(messages.syncEnabled)}
                </label>
                <div className="form-input-area">
                  <Field type="checkbox" id="syncEnabled" name="syncEnabled" />
                </div>
              </div>
            </Form>
          </Modal>
        );
      }}
    </Formik>
  );
};

export default NavidromeModal;

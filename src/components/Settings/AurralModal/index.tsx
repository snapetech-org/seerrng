import Modal from '@app/components/Common/Modal';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import Field, {
  default as SettingsField,
} from '@app/components/Settings/SettingsField';
import SettingsHelp from '@app/components/Settings/SettingsHelp';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isValidURL } from '@app/utils/urlValidationHelper';
import { Transition } from '@headlessui/react';
import type { AurralSettings } from '@server/lib/settings';
import axios from 'axios';
import { Formik } from 'formik';
import { useCallback, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import * as Yup from 'yup';

const messages = defineMessages('components.Settings.AurralModal', {
  create: 'Add Aurral Server',
  edit: 'Edit Aurral Server',
  nameRequired: 'Enter a name for this server.',
  hostnameRequired: 'Enter a valid hostname or IP address.',
  portRequired: 'Enter a valid port number.',
  accessRequired: 'Enter an Aurral API key.',
  externalUrlInvalid: 'Enter a valid HTTP or HTTPS URL.',
  baseUrlInvalid: 'URL Base must be a relative path.',
  toastTestSuccess: 'Connected to Aurral.',
  toastTestFailure:
    'Could not connect to Aurral. Check the address and API key.',
  toastSaveFailure: 'Could not save the Aurral server.',
  add: 'Add Server',
  name: 'Server Name',
  hostname: 'Hostname or IP Address',
  port: 'Port',
  ssl: 'Use HTTPS',
  accessLabel: 'Aurral API Key',
  accessHelp:
    'Use a per-user Aurral API key (Settings -> Profile -> API access) so requests are attributed properly; an admin key returns 403 on user-data actions.',
  baseUrl: 'URL Base',
  baseUrlHelp: 'Leave blank unless Aurral is served under a URL path.',
  externalUrl: 'External URL',
  externalUrlHelp: 'Optional address your users can open from their browser.',
  defaultServer: 'Use for music requests by default',
  sync: 'Keep SeerrNG availability in sync',
  syncHelp:
    'Scan your Aurral library daily and show active Aurral downloads in request status.',
  intro:
    'Aurral handles both full-album requests and single-track requests in one place, replacing Lidarr and slskdN when configured.',
});

interface AurralModalProps {
  aurral: AurralSettings | null;
  onClose: () => void;
  onSave: () => void;
}

interface TestResponse {
  version?: string;
  username?: string;
  role?: string;
}

const AurralModal = ({ aurral, onClose, onSave }: AurralModalProps) => {
  const intl = useIntl();
  const initialLoad = useRef(false);
  const { addToast } = useToasts();
  const [isValidated, setIsValidated] = useState(Boolean(aurral));
  const [isTesting, setIsTesting] = useState(false);

  const schema = Yup.object().shape({
    name: Yup.string().required(intl.formatMessage(messages.nameRequired)),
    hostname: Yup.string().required(
      intl.formatMessage(messages.hostnameRequired)
    ),
    port: Yup.number()
      .integer()
      .min(1)
      .max(65535)
      .required(intl.formatMessage(messages.portRequired)),
    apiKey: Yup.string().required(intl.formatMessage(messages.accessRequired)),
    externalUrl: Yup.string().test(
      'valid-url',
      intl.formatMessage(messages.externalUrlInvalid),
      (value) => !value || isValidURL(value)
    ),
    baseUrl: Yup.string().test(
      'relative-base',
      intl.formatMessage(messages.baseUrlInvalid),
      (value) => !value || (value.startsWith('/') && !value.endsWith('/'))
    ),
  });

  const testConnection = useCallback(
    async (values: {
      id?: number;
      hostname: string;
      port: number;
      apiKey: string;
      baseUrl: string;
      useSsl: boolean;
    }) => {
      setIsTesting(true);
      try {
        const response = await axios.post<TestResponse>(
          '/api/v1/settings/aurral/test',
          values
        );
        setIsValidated(true);
        if (initialLoad.current) {
          addToast(intl.formatMessage(messages.toastTestSuccess), {
            appearance: 'success',
            autoDismiss: true,
          });
        }
        return response.data;
      } catch (error) {
        setIsValidated(false);
        if (initialLoad.current) {
          const responseMessage = axios.isAxiosError<{ message?: unknown }>(
            error
          )
            ? error.response?.data?.message
            : undefined;
          addToast(
            typeof responseMessage === 'string' && responseMessage.length > 0
              ? responseMessage
              : intl.formatMessage(messages.toastTestFailure),
            {
              appearance: 'error',
              autoDismiss: true,
            }
          );
        }
        return null;
      } finally {
        setIsTesting(false);
        initialLoad.current = true;
      }
    },
    [addToast, intl]
  );

  return (
    <Transition as="div" appear show>
      <Formik
        initialValues={{
          name: aurral?.name ?? '',
          hostname: aurral?.hostname ?? '',
          port: aurral?.port ?? 3001,
          useSsl: aurral?.useSsl ?? false,
          apiKey: aurral?.apiKey ?? '',
          baseUrl: aurral?.baseUrl ?? '',
          externalUrl: aurral?.externalUrl ?? '',
          isDefault: aurral?.isDefault ?? false,
          syncEnabled: aurral?.syncEnabled ?? true,
        }}
        validationSchema={schema}
        onSubmit={async (values) => {
          const submission = {
            ...values,
            port: Number(values.port),
          };
          try {
            if (aurral) {
              await axios.put(
                `/api/v1/settings/aurral/${aurral.id}`,
                submission
              );
            } else {
              await axios.post('/api/v1/settings/aurral', submission);
            }
            onSave();
          } catch {
            addToast(intl.formatMessage(messages.toastSaveFailure), {
              appearance: 'error',
              autoDismiss: true,
            });
          }
        }}
      >
        {({
          errors,
          touched,
          values,
          setFieldValue,
          handleSubmit,
          isSubmitting,
          isValid,
        }) => (
          <Modal
            onCancel={onClose}
            okButtonType="primary"
            okText={
              isSubmitting
                ? intl.formatMessage(globalMessages.saving)
                : aurral
                  ? intl.formatMessage(globalMessages.save)
                  : intl.formatMessage(messages.add)
            }
            secondaryButtonType="warning"
            secondaryText={
              isTesting
                ? intl.formatMessage(globalMessages.testing)
                : intl.formatMessage(globalMessages.test)
            }
            onSecondary={() =>
              testConnection({
                hostname: values.hostname,
                id: aurral?.id,
                port: Number(values.port),
                apiKey: values.apiKey,
                baseUrl: values.baseUrl,
                useSsl: values.useSsl,
              })
            }
            secondaryDisabled={
              !values.apiKey ||
              !values.hostname ||
              !values.port ||
              isTesting ||
              isSubmitting
            }
            okDisabled={!isValidated || isSubmitting || isTesting || !isValid}
            onOk={() => handleSubmit()}
            title={
              !aurral
                ? intl.formatMessage(messages.create)
                : intl.formatMessage(messages.edit)
            }
          >
            <div className="mb-6">
              <p className="description">
                {intl.formatMessage(messages.intro)}
              </p>
              <div className="form-row">
                <label htmlFor="isDefault" className="checkbox-label">
                  {intl.formatMessage(messages.defaultServer)}
                </label>
                <div className="form-input-area">
                  <SettingsField
                    type="checkbox"
                    id="isDefault"
                    name="isDefault"
                  />
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="name" className="text-label">
                  {intl.formatMessage(messages.name)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      id="name"
                      name="name"
                      type="text"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setFieldValue('name', e.target.value);
                      }}
                    />
                  </div>
                  {errors.name &&
                    touched.name &&
                    typeof errors.name === 'string' && (
                      <div className="error">{errors.name}</div>
                    )}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="hostname" className="text-label">
                  {intl.formatMessage(messages.hostname)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <span className="protocol">
                      {values.useSsl ? 'https://' : 'http://'}
                    </span>
                    <Field
                      id="hostname"
                      name="hostname"
                      type="text"
                      inputMode="url"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setIsValidated(false);
                        setFieldValue('hostname', e.target.value);
                      }}
                      className="rounded-e-only"
                    />
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
                  <SettingsField
                    id="port"
                    name="port"
                    type="text"
                    inputMode="numeric"
                    className="short"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setIsValidated(false);
                      setFieldValue('port', e.target.value);
                    }}
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
                  <Field
                    type="checkbox"
                    id="useSsl"
                    name="useSsl"
                    onChange={() => {
                      setIsValidated(false);
                      setFieldValue('useSsl', !values.useSsl);
                    }}
                  />
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="apiKey" className="text-label">
                  {intl.formatMessage(messages.accessLabel)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <SensitiveInput
                      as="field"
                      id="apiKey"
                      name="apiKey"
                      autoComplete="one-time-code"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setIsValidated(false);
                        setFieldValue('apiKey', e.target.value);
                      }}
                    />
                  </div>
                  {errors.apiKey &&
                    touched.apiKey &&
                    typeof errors.apiKey === 'string' && (
                      <div className="error">{errors.apiKey}</div>
                    )}
                </div>
                <SettingsHelp
                  as="span"
                  className="settings-form-row-description"
                >
                  {intl.formatMessage(messages.accessHelp)}
                </SettingsHelp>
              </div>
              <div className="form-row">
                <label htmlFor="baseUrl" className="text-label">
                  {intl.formatMessage(messages.baseUrl)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      id="baseUrl"
                      name="baseUrl"
                      type="text"
                      inputMode="url"
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setIsValidated(false);
                        setFieldValue('baseUrl', e.target.value);
                      }}
                    />
                  </div>
                  {errors.baseUrl &&
                    touched.baseUrl &&
                    typeof errors.baseUrl === 'string' && (
                      <div className="error">{errors.baseUrl}</div>
                    )}
                </div>
                <SettingsHelp
                  as="span"
                  className="settings-form-row-description"
                >
                  {intl.formatMessage(messages.baseUrlHelp)}
                </SettingsHelp>
              </div>
              <div className="form-row">
                <label htmlFor="externalUrl" className="text-label">
                  {intl.formatMessage(messages.externalUrl)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field id="externalUrl" name="externalUrl" type="text" />
                  </div>
                  {errors.externalUrl &&
                    touched.externalUrl &&
                    typeof errors.externalUrl === 'string' && (
                      <div className="error">{errors.externalUrl}</div>
                    )}
                </div>
                <SettingsHelp
                  as="span"
                  className="settings-form-row-description"
                >
                  {intl.formatMessage(messages.externalUrlHelp)}
                </SettingsHelp>
              </div>
              <div className="form-row">
                <label htmlFor="syncEnabled" className="checkbox-label">
                  {intl.formatMessage(messages.sync)}
                </label>
                <div className="form-input-area">
                  <SettingsField
                    type="checkbox"
                    id="syncEnabled"
                    name="syncEnabled"
                  />
                </div>
                <SettingsHelp
                  as="span"
                  className="settings-form-row-description"
                >
                  {intl.formatMessage(messages.syncHelp)}
                </SettingsHelp>
              </div>
            </div>
          </Modal>
        )}
      </Formik>
    </Transition>
  );
};

export default AurralModal;

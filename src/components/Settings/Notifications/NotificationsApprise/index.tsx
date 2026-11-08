import Button from '@app/components/Common/Button';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import NotificationTypeSelector from '@app/components/NotificationTypeSelector';
import Field from '@app/components/Settings/SettingsField';
import SettingsHelp from '@app/components/Settings/SettingsHelp';
import SettingsLoadState from '@app/components/Settings/SettingsLoadState';
import { availableLanguages } from '@app/context/LanguageContext';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isValidURL } from '@app/utils/urlValidationHelper';
import { ArrowDownOnSquareIcon, BeakerIcon } from '@heroicons/react/24/outline';
import type { NotificationAgentApprise } from '@server/lib/settings';
import axios from 'axios';
import { Form, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import * as Yup from 'yup';

/** Matches the server-side check in `server/routes/settings/notifications.ts`. */
const CONFIG_KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const messages = defineMessages(
  'components.Settings.Notifications.NotificationsApprise',
  {
    agentenabled: 'Enable Agent',
    url: 'Apprise API Root URL',
    configKey: 'Configuration Key',
    configKeyTip:
      'The name of a saved configuration on the Apprise API server. Destination URLs stay on that server.',
    tag: 'Tag',
    tagTip:
      'Optional. Sends only to destinations on the Apprise server that carry this tag.',
    language: 'Language',
    usernamePasswordAuth: 'Username and Password Authentication',
    username: 'Username',
    password: 'Password',
    apprisesettingssaved: 'Apprise notification settings saved successfully.',
    apprisesettingsfailed: 'Apprise notification settings could not be saved.',
    toastAppriseTestSending: 'Sending Apprise test notification…',
    toastAppriseTestSuccess: 'Apprise test notification sent.',
    toastAppriseTestFailed: 'Apprise test notification could not be sent.',
    validationAppriseUrl: 'You must provide a valid URL.',
    validationConfigKey:
      'Use 1 to 64 letters, numbers, hyphens, or underscores.',
    validationTypes: 'You must select at least one notification type.',
  }
);

const NotificationsApprise = () => {
  const intl = useIntl();
  const { addToast, removeToast } = useToasts();
  const [isTesting, setIsTesting] = useState(false);
  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<NotificationAgentApprise>(
    '/api/v1/settings/notifications/apprise'
  );

  const NotificationsAppriseSchema = Yup.object().shape({
    url: Yup.string()
      .when('enabled', {
        is: true,
        then: (schema) =>
          schema
            .nullable()
            .required(intl.formatMessage(messages.validationAppriseUrl)),
        otherwise: (schema) => schema.nullable(),
      })
      .test(
        'valid-url',
        intl.formatMessage(messages.validationAppriseUrl),
        isValidURL
      ),
    configKey: Yup.string().when('enabled', {
      is: true,
      then: (schema) =>
        schema
          .nullable()
          .matches(
            CONFIG_KEY_PATTERN,
            intl.formatMessage(messages.validationConfigKey)
          )
          .required(intl.formatMessage(messages.validationConfigKey)),
      otherwise: (schema) => schema.nullable(),
    }),
  });

  if (!data) {
    return (
      <SettingsLoadState failed={Boolean(error)} onRetry={() => revalidate()} />
    );
  }

  return (
    <Formik
      initialValues={{
        enabled: data?.enabled,
        types: data?.types,
        url: data?.options.url ?? '',
        configKey: data?.options.configKey ?? '',
        tag: data?.options.tag ?? '',
        authMethodUsernamePassword: data?.options.authMethodUsernamePassword,
        username: data?.options.username ?? '',
        password: data?.options.password ?? '',
        locale: data?.options.locale ?? 'en',
      }}
      validationSchema={NotificationsAppriseSchema}
      onSubmit={async (values, { resetForm }) => {
        try {
          await axios.post('/api/v1/settings/notifications/apprise', {
            enabled: values.enabled,
            embedPoster: false,
            types: values.types,
            options: {
              url: values.url,
              configKey: values.configKey,
              tag: values.tag,
              authMethodUsernamePassword: values.authMethodUsernamePassword,
              username: values.username,
              password: values.password,
              locale: values.locale,
            },
          });

          resetForm({ values });
          void revalidate();
          addToast(intl.formatMessage(messages.apprisesettingssaved), {
            appearance: 'success',
            autoDismiss: true,
          });
        } catch {
          addToast(intl.formatMessage(messages.apprisesettingsfailed), {
            appearance: 'error',
            autoDismiss: true,
          });
        }
      }}
    >
      {({
        errors,
        touched,
        isSubmitting,
        dirty,
        values,
        isValid,
        setFieldValue,
        setFieldTouched,
      }) => {
        const testSettings = async () => {
          setIsTesting(true);
          let toastId: string | undefined;
          try {
            addToast(
              intl.formatMessage(messages.toastAppriseTestSending),
              {
                autoDismiss: false,
                appearance: 'info',
              },
              (id) => {
                toastId = id;
              }
            );
            await axios.post('/api/v1/settings/notifications/apprise/test', {
              enabled: true,
              embedPoster: false,
              types: values.types,
              options: {
                url: values.url,
                configKey: values.configKey,
                tag: values.tag,
                authMethodUsernamePassword: values.authMethodUsernamePassword,
                username: values.username,
                password: values.password,
                locale: values.locale,
              },
            });

            if (toastId) {
              removeToast(toastId);
            }
            addToast(intl.formatMessage(messages.toastAppriseTestSuccess), {
              autoDismiss: true,
              appearance: 'success',
            });
          } catch {
            if (toastId) {
              removeToast(toastId);
            }
            addToast(intl.formatMessage(messages.toastAppriseTestFailed), {
              autoDismiss: true,
              appearance: 'error',
            });
          } finally {
            setIsTesting(false);
          }
        };

        return (
          <Form
            data-settings-dirty={dirty}
            data-settings-submitting={isSubmitting}
            className="app-card-sub section"
          >
            <div className="form-row">
              <label htmlFor="enabled" className="checkbox-label">
                {intl.formatMessage(messages.agentenabled)}
                <span className="label-required">*</span>
              </label>
              <div className="form-input-area">
                <Field type="checkbox" id="enabled" name="enabled" />
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="url" className="text-label">
                {intl.formatMessage(messages.url)}
                <span className="label-required">*</span>
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <Field id="url" name="url" type="text" inputMode="url" />
                </div>
                {errors.url &&
                  touched.url &&
                  typeof errors.url === 'string' && (
                    <div className="error">{errors.url}</div>
                  )}
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="configKey" className="text-label">
                {intl.formatMessage(messages.configKey)}
                <span className="label-required">*</span>
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <Field id="configKey" name="configKey" type="text" />
                </div>
                <SettingsHelp className="settings-form-row-description">
                  {intl.formatMessage(messages.configKeyTip)}
                </SettingsHelp>
                {errors.configKey &&
                  touched.configKey &&
                  typeof errors.configKey === 'string' && (
                    <div className="error">{errors.configKey}</div>
                  )}
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="tag" className="text-label">
                {intl.formatMessage(messages.tag)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <Field id="tag" name="tag" type="text" />
                </div>
                <SettingsHelp className="settings-form-row-description">
                  {intl.formatMessage(messages.tagTip)}
                </SettingsHelp>
              </div>
            </div>
            <div className="form-row">
              <label
                htmlFor="authMethodUsernamePassword"
                className="checkbox-label"
              >
                {intl.formatMessage(messages.usernamePasswordAuth)}
              </label>
              <div className="form-input-area">
                <Field
                  type="checkbox"
                  id="authMethodUsernamePassword"
                  name="authMethodUsernamePassword"
                  onChange={() => {
                    setFieldValue(
                      'authMethodUsernamePassword',
                      !values.authMethodUsernamePassword
                    );
                  }}
                />
              </div>
            </div>
            {values.authMethodUsernamePassword && (
              <>
                <div className="form-row">
                  <label htmlFor="username" className="text-label">
                    {intl.formatMessage(messages.username)}
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <Field id="username" name="username" type="text" />
                    </div>
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="password" className="text-label">
                    {intl.formatMessage(messages.password)}
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <SensitiveInput
                        as="field"
                        id="password"
                        name="password"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
            <div className="form-row">
              <label htmlFor="locale" className="text-label">
                {intl.formatMessage(messages.language)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <Field as="select" id="locale" name="locale">
                    {(
                      Object.keys(
                        availableLanguages
                      ) as (keyof typeof availableLanguages)[]
                    ).map((key) => (
                      <option
                        key={key}
                        value={availableLanguages[key].code}
                        lang={availableLanguages[key].code}
                      >
                        {availableLanguages[key].display}
                      </option>
                    ))}
                  </Field>
                </div>
              </div>
            </div>
            <NotificationTypeSelector
              currentTypes={values.enabled ? values.types || 0 : 0}
              onUpdate={(newTypes) => {
                setFieldValue('types', newTypes);
                setFieldTouched('types');

                if (newTypes) {
                  setFieldValue('enabled', true);
                }
              }}
              error={
                values.enabled && !values.types && touched.types
                  ? intl.formatMessage(messages.validationTypes)
                  : undefined
              }
            />
            <div className="actions">
              <Button
                buttonType="warning"
                disabled={isSubmitting || !isValid || isTesting}
                onClick={(e) => {
                  e.preventDefault();
                  testSettings();
                }}
              >
                <BeakerIcon />
                <span>
                  {isTesting
                    ? intl.formatMessage(globalMessages.testing)
                    : intl.formatMessage(globalMessages.test)}
                </span>
              </Button>
              <Button
                buttonType="primary"
                type="submit"
                disabled={
                  isSubmitting ||
                  !isValid ||
                  isTesting ||
                  (values.enabled && !values.types)
                }
              >
                <ArrowDownOnSquareIcon />
                <span>
                  {isSubmitting
                    ? intl.formatMessage(globalMessages.saving)
                    : intl.formatMessage(globalMessages.save)}
                </span>
              </Button>
            </div>
          </Form>
        );
      }}
    </Formik>
  );
};

export default NotificationsApprise;

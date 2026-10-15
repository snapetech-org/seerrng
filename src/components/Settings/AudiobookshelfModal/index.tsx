import Modal from '@app/components/Common/Modal';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import Field, {
  default as SettingsField,
} from '@app/components/Settings/SettingsField';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isValidURL } from '@app/utils/urlValidationHelper';
import type { AudiobookshelfSettings } from '@server/lib/settings';
import axios from 'axios';
import { Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import * as Yup from 'yup';

const messages = defineMessages('components.Settings.AudiobookshelfModal', {
  addTitle: 'Add Audiobookshelf library',
  editTitle: 'Edit Audiobookshelf library',
  intro:
    'SeerrNG checks this read-only audiobook library during the Bookshelf scan. Books are matched by ISBN; items without an ISBN cannot be linked automatically. SeerrNG does not add, remove, or change items in Audiobookshelf.',
  name: 'Connection name',
  hostname: 'Hostname or IP address',
  port: 'Port',
  ssl: 'Use HTTPS',
  apiKey: 'Audiobookshelf user API token',
  apiKeyHelp:
    'Use a user token that can view the book library you select. The token stays on the SeerrNG server.',
  baseUrl: 'URL Base',
  externalUrl: 'External URL',
  externalUrlHelp:
    'Optional browser address for opening the matching audiobook. If you set a URL Base, SeerrNG adds it to this address automatically.',
  library: 'Audiobook library',
  chooseLibrary: 'Test the connection to load available book libraries',
  test: 'Test connection',
  testing: 'Connecting…',
  scanEnabled: 'Sync availability during the Bookshelf scan',
  nameRequired: 'Enter a name for this connection.',
  hostRequired: 'Enter a hostname or IP address.',
  portRequired: 'Enter a valid port number.',
  tokenRequired: 'Enter an Audiobookshelf user token.',
  libraryRequired: 'Choose a book library.',
  urlInvalid: 'Enter a valid HTTP or HTTPS URL.',
  testSuccess: 'Connected. Choose a book library to sync.',
  testFailure:
    'Could not connect to Audiobookshelf. Check the address and token.',
  saveFailure: 'Could not save the Audiobookshelf connection.',
  add: 'Add library',
});

interface AudiobookshelfModalProps {
  settings: AudiobookshelfSettings | null;
  onClose: () => void;
  onSave: () => void;
}

interface LibraryOption {
  id: string;
  name: string;
  numBooks?: number;
}

const AudiobookshelfModal = ({
  settings,
  onClose,
  onSave,
}: AudiobookshelfModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [libraries, setLibraries] = useState<LibraryOption[]>([]);
  const [isTesting, setIsTesting] = useState(false);
  const [isValidated, setIsValidated] = useState(Boolean(settings));

  const schema = Yup.object().shape({
    name: Yup.string().required(intl.formatMessage(messages.nameRequired)),
    hostname: Yup.string().required(intl.formatMessage(messages.hostRequired)),
    port: Yup.number()
      .integer()
      .min(1)
      .max(65535)
      .required(intl.formatMessage(messages.portRequired)),
    apiKey: Yup.string().required(intl.formatMessage(messages.tokenRequired)),
    libraryId: Yup.string().required(
      intl.formatMessage(messages.libraryRequired)
    ),
    externalUrl: Yup.string().test(
      'valid-url',
      intl.formatMessage(messages.urlInvalid),
      (value) => !value || isValidURL(value)
    ),
  });

  const testConnection = async (
    values: {
      hostname: string;
      port: number;
      apiKey: string;
      baseUrl: string;
      useSsl: boolean;
    },
    setFieldValue: (field: string, value: unknown) => void
  ) => {
    setIsTesting(true);
    try {
      const response = await axios.post<{ libraries: LibraryOption[] }>(
        '/api/v1/settings/audiobookshelf/test',
        { ...values, id: settings?.id }
      );
      setLibraries(response.data.libraries);
      setIsValidated(response.data.libraries.length > 0);
      if (response.data.libraries.length === 1) {
        setFieldValue('libraryId', response.data.libraries[0].id);
        setFieldValue('libraryName', response.data.libraries[0].name);
      }
      addToast(intl.formatMessage(messages.testSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
    } catch (error) {
      setIsValidated(false);
      const responseMessage = axios.isAxiosError<{ message?: unknown }>(error)
        ? error.response?.data?.message
        : undefined;
      addToast(
        typeof responseMessage === 'string' && responseMessage
          ? responseMessage
          : intl.formatMessage(messages.testFailure),
        { appearance: 'error', autoDismiss: true }
      );
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Formik
      initialValues={{
        name: settings?.name ?? 'Audiobookshelf',
        hostname: settings?.hostname ?? '',
        port: settings?.port ?? 13378,
        useSsl: settings?.useSsl ?? false,
        apiKey: settings?.apiKey ?? '',
        baseUrl: settings?.baseUrl ?? '',
        externalUrl: settings?.externalUrl ?? '',
        libraryId: settings?.libraryId ?? '',
        libraryName: settings?.libraryName ?? '',
        syncEnabled: settings?.syncEnabled ?? true,
      }}
      validationSchema={schema}
      onSubmit={async (values) => {
        const selectedLibrary = libraries.find(
          (library) => library.id === values.libraryId
        );
        try {
          await axios.put('/api/v1/settings/audiobookshelf', {
            ...values,
            port: Number(values.port),
            libraryName: selectedLibrary?.name ?? values.libraryName,
            id: settings?.id,
          });
          onSave();
        } catch {
          addToast(intl.formatMessage(messages.saveFailure), {
            appearance: 'error',
            autoDismiss: true,
          });
        }
      }}
    >
      {({
        values,
        errors,
        touched,
        setFieldValue,
        handleSubmit,
        isSubmitting,
        isValid,
      }) => (
        <Modal
          title={intl.formatMessage(
            settings ? messages.editTitle : messages.addTitle
          )}
          onCancel={onClose}
          onOk={() => handleSubmit()}
          okText={
            isSubmitting
              ? intl.formatMessage(globalMessages.saving)
              : settings
                ? intl.formatMessage(globalMessages.save)
                : intl.formatMessage(messages.add)
          }
          okDisabled={!isValidated || !isValid || isSubmitting || isTesting}
          secondaryText={
            isTesting
              ? intl.formatMessage(messages.testing)
              : intl.formatMessage(messages.test)
          }
          secondaryButtonType="warning"
          secondaryDisabled={!values.hostname || !values.apiKey || isTesting}
          onSecondary={() => testConnection(values, setFieldValue)}
        >
          <div className="mb-6">
            <p className="description">{intl.formatMessage(messages.intro)}</p>
            <div className="form-row">
              <label className="checkbox-label" htmlFor="syncEnabled">
                {intl.formatMessage(messages.scanEnabled)}
              </label>
              <div className="form-input-area">
                <SettingsField
                  type="checkbox"
                  id="syncEnabled"
                  name="syncEnabled"
                />
              </div>
            </div>
            <div className="form-row">
              <label className="text-label" htmlFor="name">
                {intl.formatMessage(messages.name)}
                <span className="label-required">*</span>
              </label>
              <div className="form-input-area">
                <Field id="name" name="name" type="text" />
                {touched.name && typeof errors.name === 'string' && (
                  <div className="error">{errors.name}</div>
                )}
              </div>
            </div>
            <div className="form-row">
              <label className="text-label" htmlFor="hostname">
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
                    className="rounded-e-only"
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      setIsValidated(false);
                      setFieldValue('hostname', event.target.value);
                    }}
                  />
                </div>
                {touched.hostname && typeof errors.hostname === 'string' && (
                  <div className="error">{errors.hostname}</div>
                )}
              </div>
            </div>
            <div className="form-row">
              <label className="text-label" htmlFor="port">
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
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    setIsValidated(false);
                    setFieldValue('port', event.target.value);
                  }}
                />
                {touched.port && typeof errors.port === 'string' && (
                  <div className="error">{errors.port}</div>
                )}
              </div>
            </div>
            <div className="form-row">
              <label className="checkbox-label" htmlFor="useSsl">
                {intl.formatMessage(messages.ssl)}
              </label>
              <div className="form-input-area">
                <SettingsField
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
              <label className="text-label" htmlFor="apiKey">
                {intl.formatMessage(messages.apiKey)}
                <span className="label-required">*</span>
              </label>
              <div className="form-input-area">
                <SensitiveInput
                  as="field"
                  id="apiKey"
                  name="apiKey"
                  autoComplete="one-time-code"
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    setIsValidated(false);
                    setFieldValue('apiKey', event.target.value);
                  }}
                />
              </div>
              <span className="settings-form-row-description">
                {intl.formatMessage(messages.apiKeyHelp)}
              </span>
            </div>
            <div className="form-row">
              <label className="text-label" htmlFor="baseUrl">
                {intl.formatMessage(messages.baseUrl)}
              </label>
              <div className="form-input-area">
                <Field
                  id="baseUrl"
                  name="baseUrl"
                  type="text"
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    setIsValidated(false);
                    setFieldValue('baseUrl', event.target.value);
                  }}
                />
              </div>
            </div>
            <div className="form-row">
              <label className="text-label" htmlFor="externalUrl">
                {intl.formatMessage(messages.externalUrl)}
              </label>
              <div className="form-input-area">
                <Field id="externalUrl" name="externalUrl" type="text" />
                {touched.externalUrl &&
                  typeof errors.externalUrl === 'string' && (
                    <div className="error">{errors.externalUrl}</div>
                  )}
              </div>
              <span className="settings-form-row-description">
                {intl.formatMessage(messages.externalUrlHelp)}
              </span>
            </div>
            <div className="form-row">
              <label className="text-label" htmlFor="libraryId">
                {intl.formatMessage(messages.library)}
                <span className="label-required">*</span>
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <Field
                    as="select"
                    id="libraryId"
                    name="libraryId"
                    onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                      const library = libraries.find(
                        (item) => item.id === event.target.value
                      );
                      setFieldValue('libraryId', event.target.value);
                      setFieldValue(
                        'libraryName',
                        library?.name ?? values.libraryName
                      );
                    }}
                  >
                    <option value="">
                      {intl.formatMessage(messages.chooseLibrary)}
                    </option>
                    {values.libraryId &&
                      !libraries.some(
                        (library) => library.id === values.libraryId
                      ) && (
                        <option value={values.libraryId}>
                          {values.libraryName}
                        </option>
                      )}
                    {libraries.map((library) => (
                      <option key={library.id} value={library.id}>
                        {library.name}
                        {typeof library.numBooks === 'number'
                          ? ` (${library.numBooks})`
                          : ''}
                      </option>
                    ))}
                  </Field>
                </div>
                {touched.libraryId && typeof errors.libraryId === 'string' && (
                  <div className="error">{errors.libraryId}</div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </Formik>
  );
};

export default AudiobookshelfModal;

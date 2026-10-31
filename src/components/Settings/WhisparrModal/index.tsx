import Modal from '@app/components/Common/Modal';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import ServarrDownloadQueueSizeField, {
  createServarrDownloadQueueSizeSchema,
  DEFAULT_SERVARR_DOWNLOAD_QUEUE_SIZE,
} from '@app/components/Settings/ServarrDownloadQueueSizeField';
import Field, {
  default as SettingsField,
} from '@app/components/Settings/SettingsField';
import type { DVRTestResponse } from '@app/components/Settings/SettingsServices';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import { getSafeApiErrorDetails } from '@app/utils/apiError';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import type { WhisparrSettings } from '@server/lib/settings';
import axios from 'axios';
import { Formik } from 'formik';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import * as Yup from 'yup';

const messages = defineMessages('components.Settings.WhisparrModal', {
  addTitle: 'Connect Whisparr',
  editTitle: 'Edit Whisparr',
  name: 'Server Name',
  hostname: 'Hostname or IP Address',
  port: 'Port',
  ssl: 'Use SSL',
  apiKey: 'API Key',
  baseUrl: 'URL Base',
  defaultServer: 'Default Adult Server',
  profile: 'Quality Profile',
  rootFolder: 'Root Folder',
  syncEnabled: 'Enable Library Scan',
  syncHelp: 'Scan Whisparr scenes to recognize existing adult media.',
  enableSearch: 'Search on Approval',
  searchHelp: 'Ask Whisparr to search when an adult request is approved.',
  externalUrl: 'External URL',
  add: 'Connect Server',
  loadingProfiles: 'Loading quality profiles…',
  testFirst: 'Test connection to load profiles and root folders',
  testSuccess: 'Whisparr scene API v3 connection established.',
  testFailure: 'Could not connect to Whisparr scene API v3.',
  saveFailureReason: 'Could not save the Whisparr connection: {message}',
  saveFailureStatus:
    'Could not save the Whisparr connection (HTTP {status}). Check the SeerrNG server logs.',
  saveFailureOffline:
    'Could not reach SeerrNG to save the Whisparr connection. Check the server and try again.',
  apiKeyHelp: 'Find this in Whisparr: Settings > General > Security > API Key',
  baseUrlHelp: 'Enter the URL Base from Whisparr, if you configured one.',
  versionHelp:
    'SeerrNG supports the scene-focused Whisparr v3 Eros branch. Whisparr v2 is not supported.',
  required: 'This field is required.',
  profileRequired: 'Select a quality profile.',
  folderRequired: 'Select a root folder.',
});

interface WhisparrModalProps {
  whisparr: WhisparrSettings | null;
  onClose: () => void;
  onSave: () => void;
}

const WhisparrModal = ({ whisparr, onClose, onSave }: WhisparrModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const initialLoad = useRef(false);
  const [validated, setValidated] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResponse, setTestResponse] = useState<DVRTestResponse>({
    profiles: [],
    rootFolders: [],
    tags: [],
  });

  const schema = Yup.object().shape({
    downloadQueueSize: createServarrDownloadQueueSizeSchema(intl),
    name: Yup.string().required(intl.formatMessage(messages.required)),
    hostname: Yup.string().required(intl.formatMessage(messages.required)),
    port: Yup.number().required(intl.formatMessage(messages.required)),
    apiKey: Yup.string().required(intl.formatMessage(messages.required)),
    activeProfileId: Yup.number().required(
      intl.formatMessage(messages.profileRequired)
    ),
    rootFolder: Yup.string().required(
      intl.formatMessage(messages.folderRequired)
    ),
  });

  const testConnection = useCallback(
    async (values: {
      id?: number;
      hostname: string;
      port: number;
      apiKey: string;
      baseUrl?: string;
      ssl: boolean;
    }) => {
      setTesting(true);
      try {
        const response = await axios.post<DVRTestResponse>(
          '/api/v1/settings/whisparr/test',
          {
            id: values.id,
            hostname: values.hostname,
            port: Number(values.port),
            apiKey: values.apiKey,
            baseUrl: values.baseUrl,
            useSsl: values.ssl,
          }
        );
        setTestResponse(response.data);
        setValidated(true);
        if (initialLoad.current) {
          addToast(intl.formatMessage(messages.testSuccess), {
            appearance: 'success',
            autoDismiss: true,
          });
        }
      } catch {
        setValidated(false);
        if (initialLoad.current) {
          addToast(intl.formatMessage(messages.testFailure), {
            appearance: 'error',
            autoDismiss: true,
          });
        }
      } finally {
        setTesting(false);
        initialLoad.current = true;
      }
    },
    [addToast, intl]
  );

  useEffect(() => {
    if (whisparr) {
      void testConnection({
        id: whisparr.id,
        hostname: whisparr.hostname,
        port: whisparr.port,
        apiKey: whisparr.apiKey,
        baseUrl: whisparr.baseUrl,
        ssl: whisparr.useSsl,
      });
    }
  }, [testConnection, whisparr]);

  return (
    <Transition as="div" appear show>
      <Formik
        initialValues={{
          name: whisparr?.name ?? '',
          hostname: whisparr?.hostname ?? '',
          port: whisparr?.port ?? 6969,
          ssl: whisparr?.useSsl ?? false,
          apiKey: whisparr?.apiKey ?? '',
          baseUrl: whisparr?.baseUrl ?? '',
          activeProfileId: whisparr?.activeProfileId ?? '',
          rootFolder: whisparr?.activeDirectory ?? '',
          isDefault: whisparr?.isDefault ?? !whisparr,
          externalUrl: whisparr?.externalUrl ?? '',
          downloadQueueSize:
            whisparr?.downloadQueueSize ?? DEFAULT_SERVARR_DOWNLOAD_QUEUE_SIZE,
          syncEnabled: whisparr?.syncEnabled ?? false,
          enableSearch: !whisparr?.preventSearch,
          tagRequests: whisparr?.tagRequests ?? false,
        }}
        validationSchema={schema}
        onSubmit={async (values) => {
          const submission = {
            name: values.name,
            hostname: values.hostname,
            port: Number(values.port),
            useSsl: values.ssl,
            apiKey: values.apiKey,
            baseUrl: values.baseUrl || undefined,
            activeProfileId: Number(values.activeProfileId),
            activeProfileName: testResponse.profiles.find(
              ({ id }) => id === Number(values.activeProfileId)
            )?.name,
            activeDirectory: values.rootFolder,
            tags: whisparr?.tags ?? [],
            is4k: false,
            isDefault: values.isDefault,
            externalUrl: values.externalUrl || undefined,
            downloadQueueSize: Number(values.downloadQueueSize),
            syncEnabled: values.syncEnabled,
            preventSearch: !values.enableSearch,
            tagRequests: values.tagRequests,
            overrideRule: whisparr?.overrideRule ?? [],
          };
          try {
            if (whisparr) {
              await axios.put(
                `/api/v1/settings/whisparr/${whisparr.id}`,
                submission
              );
            } else {
              await axios.post('/api/v1/settings/whisparr', submission);
            }
            onSave();
          } catch (error) {
            const details = getSafeApiErrorDetails(error);
            const failureMessage = details.message
              ? intl.formatMessage(messages.saveFailureReason, {
                  message: details.message,
                })
              : details.status
                ? intl.formatMessage(messages.saveFailureStatus, {
                    status: details.status,
                  })
                : intl.formatMessage(messages.saveFailureOffline);
            addToast(failureMessage, {
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
            onCancel={onClose}
            okText={
              isSubmitting
                ? intl.formatMessage(globalMessages.saving)
                : whisparr
                  ? intl.formatMessage(globalMessages.save)
                  : intl.formatMessage(messages.add)
            }
            onOk={() => handleSubmit()}
            okDisabled={!validated || testing || isSubmitting || !isValid}
            secondaryButtonType="warning"
            secondaryText={
              testing
                ? intl.formatMessage(globalMessages.testing)
                : intl.formatMessage(globalMessages.test)
            }
            secondaryDisabled={
              !values.hostname || !values.port || !values.apiKey || testing
            }
            onSecondary={() =>
              void testConnection({
                id: whisparr?.id,
                hostname: values.hostname,
                port: Number(values.port),
                apiKey: values.apiKey,
                baseUrl: values.baseUrl,
                ssl: values.ssl,
              })
            }
            title={intl.formatMessage(
              whisparr ? messages.editTitle : messages.addTitle
            )}
          >
            <p className="mb-4 text-sm text-gray-400">
              {intl.formatMessage(messages.versionHelp)}
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
            {(
              [
                ['name', messages.name],
                ['hostname', messages.hostname],
                ['port', messages.port],
              ] as const
            ).map(([fieldName, label]) => (
              <div className="form-row" key={fieldName}>
                <label htmlFor={fieldName} className="text-label">
                  {intl.formatMessage(label)}
                </label>
                <div className="form-input-area">
                  <Field
                    id={fieldName}
                    name={fieldName}
                    type="text"
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      setValidated(false);
                      setFieldValue(fieldName, event.target.value);
                    }}
                  />
                  {touched[fieldName] && errors[fieldName] && (
                    <div className="error">{String(errors[fieldName])}</div>
                  )}
                </div>
              </div>
            ))}
            <div className="form-row">
              <label htmlFor="ssl" className="checkbox-label">
                {intl.formatMessage(messages.ssl)}
              </label>
              <div className="form-input-area">
                <SettingsField
                  type="checkbox"
                  id="ssl"
                  name="ssl"
                  onChange={() => {
                    setValidated(false);
                    setFieldValue('ssl', !values.ssl);
                  }}
                />
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="apiKey" className="text-label">
                {intl.formatMessage(messages.apiKey)}
              </label>
              <div className="form-input-area">
                <SensitiveInput
                  as="field"
                  id="apiKey"
                  name="apiKey"
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    setValidated(false);
                    setFieldValue('apiKey', event.target.value);
                  }}
                />
                <p className="settings-form-row-description">
                  {intl.formatMessage(messages.apiKeyHelp)}
                </p>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="baseUrl" className="text-label">
                {intl.formatMessage(messages.baseUrl)}
              </label>
              <div className="form-input-area">
                <Field
                  id="baseUrl"
                  name="baseUrl"
                  type="text"
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    setValidated(false);
                    setFieldValue('baseUrl', event.target.value);
                  }}
                />
                <p className="settings-form-row-description">
                  {intl.formatMessage(messages.baseUrlHelp)}
                </p>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="activeProfileId" className="text-label">
                {intl.formatMessage(messages.profile)}
              </label>
              <div className="form-input-area">
                <Field
                  as="select"
                  id="activeProfileId"
                  name="activeProfileId"
                  disabled={!validated || testing}
                >
                  <option value="">
                    {validated
                      ? intl.formatMessage(messages.profile)
                      : intl.formatMessage(messages.testFirst)}
                  </option>
                  {testResponse.profiles.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </Field>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="rootFolder" className="text-label">
                {intl.formatMessage(messages.rootFolder)}
              </label>
              <div className="form-input-area">
                <Field
                  as="select"
                  id="rootFolder"
                  name="rootFolder"
                  disabled={!validated || testing}
                >
                  <option value="">
                    {validated
                      ? intl.formatMessage(messages.rootFolder)
                      : intl.formatMessage(messages.testFirst)}
                  </option>
                  {testResponse.rootFolders.map(({ id, path }) => (
                    <option key={id} value={path}>
                      {path}
                    </option>
                  ))}
                </Field>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="syncEnabled" className="checkbox-label">
                {intl.formatMessage(messages.syncEnabled)}
              </label>
              <div className="form-input-area">
                <SettingsField
                  type="checkbox"
                  id="syncEnabled"
                  name="syncEnabled"
                />
              </div>
              <span className="settings-form-row-description">
                {intl.formatMessage(messages.syncHelp)}
              </span>
            </div>
            <ServarrDownloadQueueSizeField />
            <div className="form-row">
              <label htmlFor="enableSearch" className="checkbox-label">
                {intl.formatMessage(messages.enableSearch)}
              </label>
              <div className="form-input-area">
                <SettingsField
                  type="checkbox"
                  id="enableSearch"
                  name="enableSearch"
                />
              </div>
              <span className="settings-form-row-description">
                {intl.formatMessage(messages.searchHelp)}
              </span>
            </div>
            <div className="form-row">
              <label htmlFor="externalUrl" className="text-label">
                {intl.formatMessage(messages.externalUrl)}
              </label>
              <div className="form-input-area">
                <Field id="externalUrl" name="externalUrl" type="text" />
              </div>
            </div>
          </Modal>
        )}
      </Formik>
    </Transition>
  );
};

export default WhisparrModal;

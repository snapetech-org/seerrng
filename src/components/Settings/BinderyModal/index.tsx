import Button from '@app/components/Common/Button';
import Modal from '@app/components/Common/Modal';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import SettingsField from '@app/components/Settings/SettingsField';
import SettingsHelp from '@app/components/Settings/SettingsHelp';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import { getSafeApiErrorDetails } from '@app/utils/apiError';
import defineMessages from '@app/utils/defineMessages';
import { REDACTED_SECRET } from '@app/utils/secret';
import { isValidURL } from '@app/utils/urlValidationHelper';
import { Transition } from '@headlessui/react';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/solid';
import type { ReadarrSettings } from '@server/lib/settings';
import { parseBinderyUserMappings } from '@server/utils/binderyUserMappings';
import axios from 'axios';
import { Formik } from 'formik';
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useIntl } from 'react-intl';
import * as Yup from 'yup';

const messages = defineMessages('components.Settings.BinderyModal', {
  bookorbitAddTitle: 'Add BookOrbit Server',
  bookorbitEditTitle: 'Edit BookOrbit Server',
  bookorbitIntro:
    'BookOrbit receives approved ebook and audiobook requests and reports what has reached its library. Use an account allowed to request books and view the library.',
  bookorbitOwner:
    'Requests are filed under this BookOrbit account. Configure its approval and download automation in BookOrbit; SeerrNG will follow its pending, downloading, and available states.',
  bookorbitTestSuccess: 'BookOrbit connection established.',
  bookorbitTestFailure:
    'Could not connect to BookOrbit. Check the address, username, and password.',
  bookorbitSaveFailure: 'Could not save the BookOrbit connection.',
  bookorbitAdd: 'Add BookOrbit',
  bookorbitUsername: 'BookOrbit Username',
  bookorbitPassword: 'BookOrbit Password',
  bookorbitUsernameRequired: 'Enter a BookOrbit username.',
  bookorbitPasswordRequired: 'Enter the BookOrbit password.',
  bookorbitVersion: 'BookOrbit Version',
  addTitle: 'Add Bindery server',
  editTitle: 'Edit Bindery server',
  intro:
    'Bindery manages book acquisition and downloads. SeerrNG sends approved requests and tracks format availability in its library.',
  ownerNote:
    'This Bindery version does not advertise per-user requests. SeerrNG will add approved books through the API key, so Bindery records the service account as owner.',
  ownerFeature:
    'Per-user requests are supported. SeerrNG found {accountCount} Bindery accounts. Configure requester account mappings below. Enable Auto-approve requests for each mapped account in Bindery if acquisition should start without a second approval. For private user libraries, also enable BINDERY_ENFORCE_TENANCY in Bindery.',
  testSuccess: 'Bindery connection established.',
  testFailure: 'Could not connect to Bindery. Check the address and API key.',
  saveFailure: 'Could not save the Bindery connection.',
  add: 'Add Bindery',
  name: 'Service name',
  hostname: 'Hostname or IP address',
  port: 'Port',
  ssl: 'Use SSL',
  apiKey: 'API key',
  baseUrl: 'URL base',
  externalUrl: 'External URL',
  format: 'Available formats',
  ebook: 'Book',
  audiobook: 'Audiobook',
  both: 'Books and audiobooks',
  default: 'Use as default for these formats',
  scan: 'Scan library availability',
  testing: 'Testing…',
  test: 'Test connection',
  version: 'Bindery version',
  hostnameRequired: 'Enter a hostname or IP address.',
  portRequired: 'Enter a valid port.',
  apiKeyRequired: 'Enter the Bindery API key.',
  nameRequired: 'Enter a service name.',
  invalidUrl: 'Enter a valid external URL.',
  keepExisting: 'Keep existing',
  requesterMappings: 'Requester Account Mappings',
  requesterMappingsHelp:
    'Map SeerrNG user IDs to Bindery user IDs as JSON. Required for requester-owned requests; display names and email addresses are never used to choose an account.',
  requesterMappingsInvalid:
    'Enter a JSON object mapping positive SeerrNG user IDs to positive Bindery user IDs.',
});

interface BinderyTestResponse {
  backend: 'bindery' | 'bookorbit';
  system: { version?: string; commit?: string; buildDate?: string };
  features: { requestsForUser: boolean };
  requesterAccounts?: number;
}

interface BinderyModalProps {
  settings: ReadarrSettings | null;
  backend?: 'bindery' | 'bookorbit';
  onClose: () => void;
  onSave: () => void;
}

const BinderyModal = ({
  settings,
  backend = 'bindery',
  onClose,
  onSave,
}: BinderyModalProps) => {
  const isBookOrbit = backend === 'bookorbit';
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isValidated, setIsValidated] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<BinderyTestResponse>();
  const testedInitialConnection = useRef(false);

  const schema = Yup.object().shape({
    name: Yup.string()
      .trim()
      .required(intl.formatMessage(messages.nameRequired)),
    hostname: Yup.string()
      .trim()
      .required(intl.formatMessage(messages.hostnameRequired)),
    port: Yup.number()
      .integer()
      .min(1)
      .max(65535)
      .required(intl.formatMessage(messages.portRequired)),
    apiKey: Yup.string().required(
      intl.formatMessage(
        isBookOrbit
          ? messages.bookorbitPasswordRequired
          : messages.apiKeyRequired
      )
    ),
    bookorbitUsername: Yup.string().test(
      'account',
      intl.formatMessage(messages.bookorbitUsernameRequired),
      (value) => !isBookOrbit || !!value?.trim()
    ),
    baseUrl: Yup.string()
      .test(
        'base-start',
        'URL base must start with /.',
        (value) => !value || value.startsWith('/')
      )
      .test(
        'base-end',
        'URL base must not end with /.',
        (value) => !value || !value.endsWith('/')
      ),
    externalUrl: Yup.string().test(
      'external-url',
      intl.formatMessage(messages.invalidUrl),
      isValidURL
    ),
    binderyUserMappings: Yup.string().test(
      'requester-mappings',
      intl.formatMessage(messages.requesterMappingsInvalid),
      (value) => {
        try {
          return (
            isBookOrbit ||
            !('error' in parseBinderyUserMappings(JSON.parse(value || '{}')))
          );
        } catch {
          return false;
        }
      }
    ),
    serviceType: Yup.mixed<'ebook' | 'audiobook' | 'both'>().oneOf([
      'ebook',
      'audiobook',
      'both',
    ]),
  });

  const testConnection = useCallback(
    async (values: {
      hostname: string;
      port: number | string;
      apiKey: string;
      bookorbitUsername: string;
      baseUrl: string;
      useSsl: boolean;
      serviceType: 'ebook' | 'audiobook' | 'both';
    }) => {
      setIsTesting(true);
      try {
        const response = await axios.post<BinderyTestResponse>(
          '/api/v1/settings/readarr/test',
          {
            id: settings?.id,
            backend,
            ...(isBookOrbit
              ? { bookorbitUsername: values.bookorbitUsername.trim() }
              : {}),
            hostname: values.hostname,
            port: Number(values.port),
            apiKey: values.apiKey,
            baseUrl: values.baseUrl,
            useSsl: values.useSsl,
            serviceType: values.serviceType,
          }
        );
        setTestResult(response.data);
        setIsValidated(true);
        addToast(
          intl.formatMessage(
            isBookOrbit ? messages.bookorbitTestSuccess : messages.testSuccess
          ),
          {
            appearance: 'success',
            autoDismiss: true,
          }
        );
        return response.data;
      } catch (error) {
        setIsValidated(false);
        setTestResult(undefined);
        addToast(
          (isBookOrbit ? getSafeApiErrorDetails(error).message : undefined) ??
            intl.formatMessage(
              isBookOrbit ? messages.bookorbitTestFailure : messages.testFailure
            ),
          {
            appearance: 'error',
            autoDismiss: true,
          }
        );
        return undefined;
      } finally {
        setIsTesting(false);
      }
    },
    [addToast, backend, intl, isBookOrbit, settings?.id]
  );

  useEffect(() => {
    if (!settings || testedInitialConnection.current) return;
    testedInitialConnection.current = true;
    void testConnection({
      hostname: settings.hostname,
      port: settings.port,
      apiKey: settings.apiKey,
      bookorbitUsername: settings.bookorbitUsername ?? '',
      baseUrl: settings.baseUrl ?? '',
      useSsl: settings.useSsl,
      serviceType: settings.serviceType ?? 'both',
    });
  }, [settings, testConnection]);

  return (
    <Transition as="div" appear show>
      <Formik
        initialValues={{
          binderyUserMappings: JSON.stringify(
            settings?.binderyUserMappings ?? {},
            null,
            2
          ),
          name: settings?.name ?? (isBookOrbit ? 'BookOrbit' : 'Bindery'),
          bookorbitUsername: settings?.bookorbitUsername ?? '',
          hostname: settings?.hostname ?? '',
          port: settings?.port ?? (isBookOrbit ? 3000 : 8787),
          useSsl: settings?.useSsl ?? false,
          apiKey: settings?.apiKey ?? '',
          baseUrl: settings?.baseUrl ?? '',
          externalUrl: settings?.externalUrl ?? '',
          serviceType: settings?.serviceType ?? 'both',
          isDefault: settings?.isDefault ?? false,
          syncEnabled: settings?.syncEnabled ?? true,
        }}
        validationSchema={schema}
        onSubmit={async (values) => {
          const mappings = parseBinderyUserMappings(
            JSON.parse(values.binderyUserMappings || '{}')
          );
          if (!isBookOrbit && 'error' in mappings) return;
          const submission: Omit<ReadarrSettings, 'id'> = {
            ...(!isBookOrbit && 'value' in mappings
              ? { binderyUserMappings: mappings.value }
              : {}),
            ...(isBookOrbit
              ? { bookorbitUsername: values.bookorbitUsername.trim() }
              : {}),
            backend,
            name: values.name.trim(),
            hostname: values.hostname.trim(),
            port: Number(values.port),
            apiKey: values.apiKey,
            useSsl: values.useSsl,
            baseUrl: values.baseUrl.trim(),
            externalUrl: values.externalUrl.trim() || undefined,
            serviceType: values.serviceType,
            activeProfileId: 0,
            activeProfileName: isBookOrbit
              ? 'BookOrbit managed'
              : 'Bindery managed',
            activeMetadataProfileId: 0,
            activeMetadataProfileName: isBookOrbit
              ? 'BookOrbit managed'
              : 'Bindery managed',
            activeDirectory: '/',
            tags: [],
            is4k: false,
            isDefault: values.isDefault,
            syncEnabled: values.syncEnabled,
            preventSearch: true,
            tagRequests: false,
            overrideRule: [],
          };
          try {
            if (settings) {
              await axios.put(
                `/api/v1/settings/readarr/${settings.id}`,
                submission
              );
            } else {
              await axios.post('/api/v1/settings/readarr', submission);
            }
            onSave();
          } catch {
            addToast(
              intl.formatMessage(
                isBookOrbit
                  ? messages.bookorbitSaveFailure
                  : messages.saveFailure
              ),
              {
                appearance: 'error',
                autoDismiss: true,
              }
            );
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
              isBookOrbit
                ? settings
                  ? messages.bookorbitEditTitle
                  : messages.bookorbitAddTitle
                : settings
                  ? messages.editTitle
                  : messages.addTitle
            )}
            onCancel={onClose}
            onOk={() => handleSubmit()}
            okText={
              isSubmitting
                ? intl.formatMessage(globalMessages.saving)
                : settings
                  ? intl.formatMessage(globalMessages.save)
                  : intl.formatMessage(
                      isBookOrbit ? messages.bookorbitAdd : messages.add
                    )
            }
            okDisabled={!isValidated || !isValid || isTesting || isSubmitting}
            secondaryText={
              isTesting
                ? intl.formatMessage(messages.testing)
                : intl.formatMessage(messages.test)
            }
            secondaryButtonType="warning"
            secondaryDisabled={
              !values.hostname ||
              !values.apiKey ||
              (isBookOrbit && !values.bookorbitUsername) ||
              isTesting
            }
            onSecondary={() => testConnection(values)}
          >
            <div className="mb-5 space-y-3">
              <SettingsHelp className="description">
                {intl.formatMessage(
                  isBookOrbit ? messages.bookorbitIntro : messages.intro
                )}
              </SettingsHelp>
              {testResult && (
                <div className="rounded border border-gray-700 bg-gray-900/50 p-3 text-sm text-gray-200">
                  <p className="flex items-center gap-2 font-semibold">
                    <CheckCircleIcon className="h-5 w-5 text-green-400" />
                    {intl.formatMessage(
                      isBookOrbit ? messages.bookorbitVersion : messages.version
                    )}
                    :{' '}
                    {testResult.system.version ??
                      intl.formatMessage(globalMessages.unknown)}
                  </p>
                  {isBookOrbit ? (
                    <SettingsHelp className="settings-form-row-description">
                      {intl.formatMessage(messages.bookorbitOwner)}
                    </SettingsHelp>
                  ) : (
                    <p className="mt-2 flex items-start gap-2">
                      {testResult.features.requestsForUser ? (
                        <CheckCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-400" />
                      ) : (
                        <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-400" />
                      )}
                      {intl.formatMessage(
                        testResult.features.requestsForUser
                          ? messages.ownerFeature
                          : messages.ownerNote,
                        { accountCount: testResult.requesterAccounts ?? 0 }
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="form-row">
              <label className="text-label" htmlFor="name">
                {intl.formatMessage(messages.name)}
              </label>
              <div className="form-input-area">
                <SettingsField id="name" name="name" type="text" />
                {touched.name && typeof errors.name === 'string' && (
                  <div className="error">{errors.name}</div>
                )}
              </div>
            </div>
            <div className="form-row">
              <label className="text-label" htmlFor="hostname">
                {intl.formatMessage(messages.hostname)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <span className="protocol">
                    {values.useSsl ? 'https://' : 'http://'}
                  </span>
                  <SettingsField
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
              </label>
              <div className="form-input-area">
                <SettingsField
                  id="port"
                  name="port"
                  type="number"
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
                  onCheckedChange={(checked) => {
                    setIsValidated(false);
                    setFieldValue('useSsl', checked);
                  }}
                />
              </div>
            </div>
            {isBookOrbit && (
              <div className="form-row">
                <label className="text-label" htmlFor="bookorbitUsername">
                  {intl.formatMessage(messages.bookorbitUsername)}
                </label>
                <div className="form-input-area">
                  <SettingsField
                    id="bookorbitUsername"
                    name="bookorbitUsername"
                    type="text"
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                      setIsValidated(false);
                      setFieldValue('bookorbitUsername', event.target.value);
                    }}
                  />
                  {touched.bookorbitUsername &&
                    typeof errors.bookorbitUsername === 'string' && (
                      <div className="error">{errors.bookorbitUsername}</div>
                    )}
                </div>
              </div>
            )}
            <div className="form-row">
              <label className="text-label" htmlFor="apiKey">
                {intl.formatMessage(
                  isBookOrbit ? messages.bookorbitPassword : messages.apiKey
                )}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <SensitiveInput
                    as="field"
                    id="apiKey"
                    name="apiKey"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setIsValidated(false);
                      void setFieldValue('apiKey', event.currentTarget.value);
                    }}
                  />
                  {settings && (
                    <Button
                      buttonType="default"
                      buttonSize="sm"
                      onClick={() => setFieldValue('apiKey', REDACTED_SECRET)}
                    >
                      {intl.formatMessage(messages.keepExisting)}
                    </Button>
                  )}
                </div>
                {touched.apiKey && typeof errors.apiKey === 'string' && (
                  <div className="error">{errors.apiKey}</div>
                )}
              </div>
            </div>
            <div className="form-row">
              <label className="text-label" htmlFor="baseUrl">
                {intl.formatMessage(messages.baseUrl)}
              </label>
              <div className="form-input-area">
                <SettingsField
                  id="baseUrl"
                  name="baseUrl"
                  type="text"
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                    setIsValidated(false);
                    setFieldValue('baseUrl', event.target.value);
                  }}
                />
                {touched.baseUrl && typeof errors.baseUrl === 'string' && (
                  <div className="error">{errors.baseUrl}</div>
                )}
              </div>
            </div>
            {!isBookOrbit && (
              <div className="form-row">
                <label className="text-label" htmlFor="binderyUserMappings">
                  {intl.formatMessage(messages.requesterMappings)}
                </label>
                <div className="form-input-area">
                  <SettingsField
                    as="textarea"
                    id="binderyUserMappings"
                    name="binderyUserMappings"
                    rows={3}
                    aria-describedby="bindery-requester-mappings-help"
                  />
                  {touched.binderyUserMappings &&
                    typeof errors.binderyUserMappings === 'string' && (
                      <div className="error">{errors.binderyUserMappings}</div>
                    )}
                </div>
                <SettingsHelp
                  id="bindery-requester-mappings-help"
                  className="settings-form-row-description"
                >
                  {intl.formatMessage(messages.requesterMappingsHelp)}{' '}
                  <code>{'{"2": 7}'}</code>
                </SettingsHelp>
              </div>
            )}
            <div className="form-row">
              <label className="text-label" htmlFor="externalUrl">
                {intl.formatMessage(messages.externalUrl)}
              </label>
              <div className="form-input-area">
                <SettingsField
                  id="externalUrl"
                  name="externalUrl"
                  type="text"
                />
                {touched.externalUrl &&
                  typeof errors.externalUrl === 'string' && (
                    <div className="error">{errors.externalUrl}</div>
                  )}
              </div>
            </div>
            <div className="form-row">
              <label className="text-label" htmlFor="serviceType">
                {intl.formatMessage(messages.format)}
              </label>
              <div className="form-input-area">
                <SettingsField as="select" id="serviceType" name="serviceType">
                  <option value="ebook">
                    {intl.formatMessage(messages.ebook)}
                  </option>
                  <option value="audiobook">
                    {intl.formatMessage(messages.audiobook)}
                  </option>
                  <option value="both">
                    {intl.formatMessage(messages.both)}
                  </option>
                </SettingsField>
              </div>
            </div>
            <div className="form-row">
              <label className="checkbox-label" htmlFor="isDefault">
                {intl.formatMessage(messages.default)}
              </label>
              <div className="form-input-area">
                <SettingsField
                  type="checkbox"
                  id="isDefault"
                  name="isDefault"
                  onCheckedChange={(checked) =>
                    setFieldValue('isDefault', checked)
                  }
                />
              </div>
            </div>
            <div className="form-row">
              <label className="checkbox-label" htmlFor="syncEnabled">
                {intl.formatMessage(messages.scan)}
              </label>
              <div className="form-input-area">
                <SettingsField
                  type="checkbox"
                  id="syncEnabled"
                  name="syncEnabled"
                  onCheckedChange={(checked) =>
                    setFieldValue('syncEnabled', checked)
                  }
                />
              </div>
            </div>
          </Modal>
        )}
      </Formik>
    </Transition>
  );
};

export default BinderyModal;

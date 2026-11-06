import Alert from '@app/components/Common/Alert';
import ApiMessageText from '@app/components/Common/ApiMessageText';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import SettingsField from '@app/components/Settings/SettingsField';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import { getSafeHref } from '@app/utils/safeUrl';
import type {
  ReaderDeliveryProvider,
  ReaderDeliverySettings as ReaderDeliverySettingsType,
} from '@server/lib/settings';
import axios from 'axios';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.ReaderDeliverySettings', {
  title: 'Reader Apps',
  description:
    'Connect Grimmory or BookOrbit to browse and deliver ebooks, audiobooks, comics, and magazine issues to compatible reader apps.',
  requestWorkflow:
    'SeerrNG sends approved book requests to the configured acquisition service. Reader Apps show files after that service imports them; BookOrbit’s own request queue is separate from this connection.',
  grimmoryDescription:
    'Recommended. Grimmory provides an OPDS catalog for ebooks and PDFs, a Komga API for streamed comic pages, and a built-in player for M4B, M4A, and MP3 audiobooks.',
  bookorbitDescription:
    'BookOrbit has built-in readers for ebooks, PDFs, CBZ/CBR/CB7 comics, and M4B/MP3/M4A/OPUS/OGG/FLAC audiobooks. OPDS apps can browse ebooks and PDFs and download CBZ/CBR archives; import magazine issues as PDFs.',
  address: 'Reader App Address',
  addressDescription:
    'Enter the address readers can open in a browser. Include a reverse-proxy base path if you use one. You can paste a full OPDS or Grimmory Komga address.',
  addressPlaceholder: 'https://reader.example.com',
  catalogAddress: 'OPDS Catalog Address',
  catalogAddressLabel: '{serviceName} OPDS catalog address',
  copyServiceCatalogAddress: 'Copy {serviceName} OPDS catalog address',
  comicCatalogAddress: 'Komga Comic Reader Address',
  comicCatalogAddressDescription:
    'Use this address in a Komga-compatible comic app for page-by-page streaming. Enable Grimmory’s Komga API and use the same OPDS reader credentials.',
  copyCatalogAddress: 'Copy Catalog Address',
  copyComicCatalogAddress: 'Copy Comic Reader Address',
  copied: 'Reader address copied.',
  copyUnavailable:
    'Clipboard access is unavailable here. Select and copy the reader address above.',
  preferredReader: 'Preferred Reader App',
  preferredReaderDescription:
    'SeerrNG opens the preferred app when it is configured. If it has no address, SeerrNG uses the other configured app. Grimmory stays preferred by default.',
  grimmoryRecommended: 'Grimmory (Recommended)',
  bookorbit: 'BookOrbit',
  librarySetup: 'Share the Bookshelf Library',
  librarySetupDescription:
    'Import or mount the same media folders into Grimmory or BookOrbit and let that service scan them. Use the path as it appears inside the reader service’s container. Scheduled scans are more reliable than filesystem watchers on some network shares.',
  opdsCredentials:
    'Connect an administrator account so SeerrNG can preview, create, and update reader shelves. Passwords are stored in protected app settings and never returned by the API. Reader-app and OPDS credentials remain separate.',
  deliveryHelp:
    'For a requested item, SeerrNG can also download available files directly to the device running this browser. Audiobooks, comics, and magazine issues use their own file type and compatible reader app.',
  save: 'Save Reader Settings',
  saving: 'Saving…',
  cancel: 'Discard Changes',
  saved: 'Reader settings saved.',
  loadError: 'Reader settings could not be loaded.',
  saveError: 'Reader settings could not be saved.',
  grimmorySetup: 'Grimmory OPDS Setup',
  grimmoryKomgaSetup: 'Grimmory Komga API Setup',
  bookorbitSetup: 'BookOrbit OPDS Setup',
  unsavedChanges:
    'Save these settings before using reader links on media detail pages.',
  komgaAddressLabel: 'Grimmory Komga comic reader address',
  username: 'Administrator account username',
  password: 'Administrator account password',
  savedPassword: 'Saved; leave blank to keep it',
  clearCredentials: 'Remove saved account credentials',
  connectionTest: 'Test grouping access',
  connectionTesting: 'Checking reader service…',
  connectionSuccess:
    'Connected. SeerrNG can manage groupings; {count} existing groupings were found.',
  connectionError: 'Reader service connection failed.',
  testSaveFirst: 'Save settings before testing the connection.',
  groupingsTitle: 'SeerrNG-managed reader shelves',
  noGroupings: 'No reader shelves have been created from SeerrNG yet.',
  groupingReady: 'Ready',
  groupingPending: 'Updating',
  groupingError: 'Needs attention',
  groupingCount: '{count, plural, one {# item} other {# items}}',
  groupingCountUnverified:
    'Preview found {count} items; final count not confirmed',
  groupingKoboSyncDisabled: 'Kobo Collection sync is off',
  groupingKoboSyncPending: 'Kobo Collection is updating',
  groupingKoboSyncReady: 'Kobo Collection is synced to BookOrbit',
  groupingKoboSyncError: 'Kobo Collection sync needs attention',
  groupingKoboSyncLast: 'Last Kobo sync: {time}',
  deleteGrouping: 'Remove managed shelf',
  confirmDeleteGrouping:
    'Remove this SeerrNG-managed grouping from the reader service? Books and library files are not deleted.',
  confirmDeleteBookOrbitGrouping:
    'Remove this SeerrNG-managed grouping and its companion Kobo Collection from the reader service? Books and library files are not deleted.',
  groupingDeleted: 'Managed reader shelf removed.',
  groupingDeleteError: 'The managed reader shelf could not be removed.',
  scopeVisibilityNote:
    'BookOrbit locks SmartScope visibility when the scope is created. If Kobo sync is on, SeerrNG also maintains a regular Collection and reconciles its membership every 15 minutes.',
  open: 'Open {serviceName}',
  sharedVisibility: 'Shared with reader-service users',
  privateVisibility: 'Private to the connected account',
  groupingsLoadError: 'Managed reader shelves could not be loaded.',
});

const getCatalogUrl = (serviceUrl: string) => {
  const normalizedUrl = serviceUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(?:api\/v1\/opds|komga\/api)$/i, '');
  if (!normalizedUrl) return '';
  return normalizedUrl + '/api/v1/opds';
};

const getKomgaUrl = (serviceUrl: string) => {
  const normalizedUrl = serviceUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(?:api\/v1\/opds|komga\/api)$/i, '');
  return normalizedUrl ? normalizedUrl + '/komga/api' : '';
};

interface ReaderDeliveryGroupingRecord {
  id: number;
  provider: ReaderDeliveryProvider;
  targetType: string;
  targetName: string;
  groupName: string;
  isPublic: boolean;
  syncToKobo: boolean;
  koboSyncStatus: 'disabled' | 'pending' | 'ready' | 'error';
  koboSyncError: string | null;
  lastKoboSyncedAt: string | null;
  status: 'pending' | 'ready' | 'error';
  lastMatchCount: number;
  countVerified: boolean;
  lastError: string | null;
  serviceUrl: string;
  lastSyncedAt?: string | null;
}

const ReaderDeliverySettings = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<ReaderDeliverySettingsType>('/api/v1/settings/reader-delivery');
  const [draft, setDraft] = useState<ReaderDeliverySettingsType>();
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [copyStatus, setCopyStatus] = useState<{
    provider: ReaderDeliveryProvider;
    copied: boolean;
  }>();
  const [clearCredentials, setClearCredentials] = useState({
    grimmory: false,
    bookorbit: false,
  });
  const [testingProvider, setTestingProvider] =
    useState<ReaderDeliveryProvider>();
  const [connectionStatus, setConnectionStatus] = useState<{
    provider: ReaderDeliveryProvider;
    connected: boolean;
    existingGroupingCount?: number;
    error?: string;
  }>();
  const {
    data: groupings,
    error: groupingsError,
    mutate: refreshGroupings,
  } = useSWR<ReaderDeliveryGroupingRecord[]>(
    '/api/v1/settings/reader-delivery/groupings'
  );
  const [groupingActionError, setGroupingActionError] = useState<string>();

  useEffect(() => {
    if (data && !isDirty) {
      setDraft(data);
    }
  }, [data, isDirty]);

  const updateUrl = (provider: ReaderDeliveryProvider, value: string) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            [provider === 'grimmory' ? 'grimmoryUrl' : 'bookorbitUrl']: value,
          }
        : current
    );
    setIsDirty(true);
    setSaveError(undefined);
    setCopyStatus(undefined);
  };

  const updatePreferredProvider = (provider: ReaderDeliveryProvider) => {
    setDraft((current) =>
      current ? { ...current, preferredProvider: provider } : current
    );
    setIsDirty(true);
    setSaveError(undefined);
  };

  const updateCredential = (
    provider: ReaderDeliveryProvider,
    field: 'Username' | 'Password',
    value: string
  ) => {
    const key =
      provider === 'grimmory'
        ? field === 'Username'
          ? 'grimmoryUsername'
          : 'grimmoryPassword'
        : field === 'Username'
          ? 'bookorbitUsername'
          : 'bookorbitPassword';
    setDraft((current) =>
      current
        ? {
            ...current,
            [key]: value,
          }
        : current
    );
    setClearCredentials((current) => ({ ...current, [provider]: false }));
    setIsDirty(true);
    setSaveError(undefined);
    setConnectionStatus(undefined);
  };

  const testConnection = async (provider: ReaderDeliveryProvider) => {
    setTestingProvider(provider);
    setConnectionStatus(undefined);
    try {
      const response = await axios.post<{
        connected: boolean;
        existingGroupingCount: number;
      }>('/api/v1/settings/reader-delivery/connection-test', { provider });
      setConnectionStatus({
        provider,
        connected: response.data.connected,
        existingGroupingCount: response.data.existingGroupingCount,
      });
    } catch (error) {
      const detail =
        axios.isAxiosError(error) &&
        typeof error.response?.data?.error === 'string'
          ? error.response.data.error
          : intl.formatMessage(messages.connectionError);
      setConnectionStatus({ provider, connected: false, error: detail });
    } finally {
      setTestingProvider(undefined);
    }
  };

  const removeGrouping = async (grouping: ReaderDeliveryGroupingRecord) => {
    const confirmation =
      grouping.provider === 'bookorbit'
        ? messages.confirmDeleteBookOrbitGrouping
        : messages.confirmDeleteGrouping;
    if (!window.confirm(intl.formatMessage(confirmation))) {
      return;
    }
    setGroupingActionError(undefined);
    try {
      await axios.delete(
        '/api/v1/settings/reader-delivery/groupings/' + grouping.id
      );
      addToast(intl.formatMessage(messages.groupingDeleted), {
        appearance: 'success',
        autoDismiss: true,
      });
      await refreshGroupings();
    } catch (error) {
      const detail =
        axios.isAxiosError(error) &&
        typeof error.response?.data?.error === 'string'
          ? error.response.data.error
          : intl.formatMessage(messages.groupingDeleteError);
      setGroupingActionError(detail);
    }
  };

  const copyCatalogUrl = async (
    provider: ReaderDeliveryProvider,
    catalogUrl: string
  ) => {
    setCopyStatus(undefined);
    if (!catalogUrl) return;

    try {
      if (!navigator.clipboard?.writeText) {
        setCopyStatus({ provider, copied: false });
        return;
      }
      await navigator.clipboard.writeText(catalogUrl);
      setCopyStatus({ provider, copied: true });
      addToast(intl.formatMessage(messages.copied), {
        appearance: 'success',
        autoDismiss: true,
      });
    } catch {
      setCopyStatus({ provider, copied: false });
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;

    setIsSaving(true);
    setSaveError(undefined);
    try {
      const response = await axios.put<ReaderDeliverySettingsType>(
        '/api/v1/settings/reader-delivery',
        {
          ...draft,
          clearGrimmoryCredentials: clearCredentials.grimmory,
          clearBookorbitCredentials: clearCredentials.bookorbit,
        }
      );
      setDraft(response.data);
      setClearCredentials({ grimmory: false, bookorbit: false });
      setIsDirty(false);
      await revalidate(response.data, false);
      addToast(intl.formatMessage(messages.saved), {
        appearance: 'success',
        autoDismiss: true,
      });
    } catch (error) {
      const detail =
        axios.isAxiosError(error) &&
        typeof error.response?.data?.error === 'string'
          ? error.response.data.error
          : intl.formatMessage(messages.saveError);
      setSaveError(detail);
    } finally {
      setIsSaving(false);
    }
  };

  const discardChanges = () => {
    if (data) setDraft(data);
    setIsDirty(false);
    setClearCredentials({ grimmory: false, bookorbit: false });
    setSaveError(undefined);
    setCopyStatus(undefined);
  };

  const renderProvider = (
    provider: ReaderDeliveryProvider,
    serviceUrl: string,
    username: string,
    password: string
  ) => {
    const isGrimmory = provider === 'grimmory';
    const serviceName = isGrimmory ? 'Grimmory' : 'BookOrbit';
    const catalogUrl = getCatalogUrl(serviceUrl);
    const comicCatalogUrl = isGrimmory ? getKomgaUrl(serviceUrl) : '';
    const copyResult =
      copyStatus?.provider === provider ? copyStatus : undefined;

    return (
      <li
        key={provider}
        className="settings-service-card app-card-inset refreshed-inset-surface"
      >
        <div className="settings-service-card-content">
          <div className="settings-service-card-body">
            <h4 className="settings-service-title">{serviceName}</h4>
            <p className="settings-group-description">
              {intl.formatMessage(
                isGrimmory
                  ? messages.grimmoryDescription
                  : messages.bookorbitDescription
              )}
            </p>
            <div className="form-row">
              <label htmlFor={provider + '-url'}>
                {intl.formatMessage(messages.address)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <input
                    id={provider + '-url'}
                    type="text"
                    inputMode="url"
                    autoComplete="url"
                    maxLength={2048}
                    disabled={isSaving}
                    aria-describedby={provider + '-url-description'}
                    value={serviceUrl}
                    onChange={(event) =>
                      updateUrl(provider, event.currentTarget.value)
                    }
                    placeholder={intl.formatMessage(
                      messages.addressPlaceholder
                    )}
                  />
                </div>
                <p
                  id={provider + '-url-description'}
                  className="settings-form-row-description"
                >
                  {intl.formatMessage(messages.addressDescription)}
                </p>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor={provider + '-username'}>
                {intl.formatMessage(messages.username)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <input
                    id={provider + '-username'}
                    type="text"
                    autoComplete="username"
                    maxLength={256}
                    disabled={isSaving}
                    value={username}
                    onChange={(event) =>
                      updateCredential(
                        provider,
                        'Username',
                        event.currentTarget.value
                      )
                    }
                  />
                </div>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor={provider + '-password'}>
                {intl.formatMessage(messages.password)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <input
                    id={provider + '-password'}
                    type="password"
                    autoComplete="new-password"
                    maxLength={2048}
                    disabled={isSaving}
                    value={password === '[REDACTED]' ? '' : password}
                    placeholder={
                      password === '[REDACTED]'
                        ? intl.formatMessage(messages.savedPassword)
                        : ''
                    }
                    onChange={(event) =>
                      updateCredential(
                        provider,
                        'Password',
                        event.currentTarget.value
                      )
                    }
                  />
                </div>
                <div className="form-input-field">
                  <SettingsField
                    type="checkbox"
                    id={provider + '-clear-credentials'}
                    name={provider + '-clear-credentials'}
                    label={intl.formatMessage(messages.clearCredentials)}
                    checked={clearCredentials[provider]}
                    disabled={isSaving}
                    onCheckedChange={(checked) => {
                      setClearCredentials((current) => ({
                        ...current,
                        [provider]: checked,
                      }));
                      if (checked) {
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                [provider === 'grimmory'
                                  ? 'grimmoryUsername'
                                  : 'bookorbitUsername']: '',
                                [provider === 'grimmory'
                                  ? 'grimmoryPassword'
                                  : 'bookorbitPassword']: '',
                              }
                            : current
                        );
                      }
                      setIsDirty(true);
                    }}
                  />
                  <span>{intl.formatMessage(messages.clearCredentials)}</span>
                </div>
              </div>
            </div>
            {connectionStatus?.provider === provider &&
              (connectionStatus.connected ? (
                <Alert type="info">
                  {intl.formatMessage(messages.connectionSuccess, {
                    count: connectionStatus.existingGroupingCount ?? 0,
                  })}
                </Alert>
              ) : (
                <Alert
                  type="error"
                  title={
                    connectionStatus.error ??
                    intl.formatMessage(messages.connectionError)
                  }
                />
              ))}
            <div className="settings-card-actions">
              <Button
                type="button"
                buttonSize="sm"
                disabled={isSaving || !!testingProvider || isDirty}
                disabledReason={
                  isDirty
                    ? intl.formatMessage(messages.testSaveFirst)
                    : undefined
                }
                onClick={() => void testConnection(provider)}
              >
                {intl.formatMessage(
                  testingProvider === provider
                    ? messages.connectionTesting
                    : messages.connectionTest
                )}
              </Button>
            </div>
            <div className="form-row">
              <label htmlFor={provider + '-opds'}>
                {intl.formatMessage(messages.catalogAddress)}
              </label>
              <div className="form-input-area">
                <div className="reader-generated-address-field">
                  <input
                    id={provider + '-opds'}
                    type="text"
                    value={catalogUrl}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                    aria-label={intl.formatMessage(
                      messages.catalogAddressLabel,
                      { serviceName }
                    )}
                  />
                  <Button
                    type="button"
                    buttonSize="sm"
                    disabled={!catalogUrl}
                    aria-label={intl.formatMessage(
                      messages.copyServiceCatalogAddress,
                      { serviceName }
                    )}
                    onClick={() => void copyCatalogUrl(provider, catalogUrl)}
                  >
                    {intl.formatMessage(messages.copyCatalogAddress)}
                  </Button>
                </div>
                {copyResult && !copyResult.copied && (
                  <p className="settings-form-row-description" role="status">
                    {intl.formatMessage(messages.copyUnavailable)}
                  </p>
                )}
              </div>
            </div>
            {isGrimmory && (
              <div className="form-row">
                <label htmlFor={provider + '-komga'}>
                  {intl.formatMessage(messages.comicCatalogAddress)}
                </label>
                <div className="form-input-area">
                  <div className="reader-generated-address-field">
                    <input
                      id={provider + '-komga'}
                      type="text"
                      value={comicCatalogUrl}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                      aria-label={intl.formatMessage(
                        messages.komgaAddressLabel
                      )}
                    />
                    <Button
                      type="button"
                      buttonSize="sm"
                      disabled={!comicCatalogUrl}
                      aria-label={intl.formatMessage(
                        messages.copyComicCatalogAddress
                      )}
                      onClick={() =>
                        void copyCatalogUrl(provider, comicCatalogUrl)
                      }
                    >
                      {intl.formatMessage(messages.copyComicCatalogAddress)}
                    </Button>
                  </div>
                  <p className="settings-form-row-description">
                    {intl.formatMessage(
                      messages.comicCatalogAddressDescription
                    )}
                  </p>
                </div>
              </div>
            )}
            <p className="settings-form-row-description">
              <a
                href={
                  isGrimmory
                    ? 'https://grimmory.org/docs/integration/opds/'
                    : 'https://bookorbit.app/opds'
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                {intl.formatMessage(
                  isGrimmory ? messages.grimmorySetup : messages.bookorbitSetup
                )}
              </a>
            </p>
            {isGrimmory && (
              <p className="settings-form-row-description">
                <a
                  href="https://grimmory.org/docs/integration/komga-api/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {intl.formatMessage(messages.grimmoryKomgaSetup)}
                </a>
              </p>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <section className="app-card-sub settings-group-card">
      <h3 className="settings-group-heading">
        {intl.formatMessage(messages.title)}
      </h3>
      <p className="settings-group-description">
        {intl.formatMessage(messages.description)}
      </p>
      <p className="settings-group-description">
        {intl.formatMessage(messages.requestWorkflow)}
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
            <ul className="reader-settings-grid">
              {renderProvider(
                'grimmory',
                draft.grimmoryUrl,
                draft.grimmoryUsername,
                draft.grimmoryPassword
              )}
              {renderProvider(
                'bookorbit',
                draft.bookorbitUrl,
                draft.bookorbitUsername,
                draft.bookorbitPassword
              )}
            </ul>
            <div className="form-row">
              <label htmlFor="reader-delivery-preferred">
                {intl.formatMessage(messages.preferredReader)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <select
                    id="reader-delivery-preferred"
                    disabled={isSaving}
                    value={draft.preferredProvider}
                    onChange={(event) =>
                      updatePreferredProvider(
                        event.currentTarget.value as ReaderDeliveryProvider
                      )
                    }
                  >
                    <option value="grimmory">
                      {intl.formatMessage(messages.grimmoryRecommended)}
                    </option>
                    <option value="bookorbit">
                      {intl.formatMessage(messages.bookorbit)}
                    </option>
                  </select>
                </div>
                <p className="settings-form-row-description">
                  {intl.formatMessage(messages.preferredReaderDescription)}
                </p>
              </div>
            </div>
            <Alert
              type="info"
              title={intl.formatMessage(messages.librarySetup)}
            >
              <p>{intl.formatMessage(messages.librarySetupDescription)}</p>
              <p>{intl.formatMessage(messages.opdsCredentials)}</p>
              <p>{intl.formatMessage(messages.deliveryHelp)}</p>
            </Alert>
            {isDirty && (
              <p className="settings-form-row-description" role="status">
                {intl.formatMessage(messages.unsavedChanges)}
              </p>
            )}
            <div className="actions">
              <div className="settings-card-actions settings-service-card-actions">
                {isDirty && (
                  <Button
                    type="button"
                    buttonSize="sm"
                    disabled={isSaving}
                    onClick={discardChanges}
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
        <section className="app-card-sub settings-group-card">
          <h4 className="settings-group-heading">
            {intl.formatMessage(messages.groupingsTitle)}
          </h4>
          <p className="settings-group-description">
            {intl.formatMessage(messages.scopeVisibilityNote)}
          </p>
          {groupingActionError && (
            <Alert
              type="error"
              title={<ApiMessageText>{groupingActionError}</ApiMessageText>}
            />
          )}
          {groupingsError && (
            <Alert
              type="error"
              title={intl.formatMessage(messages.groupingsLoadError)}
            />
          )}
          {!groupings && !groupingsError && <LoadingSpinner />}
          {groupings?.length === 0 && (
            <p className="settings-form-row-description">
              {intl.formatMessage(messages.noGroupings)}
            </p>
          )}
          {groupings && groupings.length > 0 && (
            <ul className="reader-settings-grid">
              {groupings.map((grouping) => {
                const providerName =
                  grouping.provider === 'grimmory' ? 'Grimmory' : 'BookOrbit';
                const safeServiceUrl = getSafeHref(grouping.serviceUrl);
                const statusMessage =
                  grouping.status === 'ready'
                    ? messages.groupingReady
                    : grouping.status === 'pending'
                      ? messages.groupingPending
                      : messages.groupingError;
                return (
                  <li
                    key={grouping.id}
                    className="settings-service-card app-card-inset refreshed-inset-surface"
                  >
                    <div className="settings-service-card-content">
                      <div className="settings-service-card-body">
                        <h5 className="settings-service-title">
                          {grouping.groupName}
                        </h5>
                        <p className="settings-group-description">
                          {providerName} · {grouping.targetName}
                        </p>
                        <p className="settings-form-row-description">
                          {intl.formatMessage(statusMessage)} ·{' '}
                          {grouping.countVerified
                            ? intl.formatMessage(messages.groupingCount, {
                                count: grouping.lastMatchCount,
                              })
                            : intl.formatMessage(
                                messages.groupingCountUnverified,
                                { count: grouping.lastMatchCount }
                              )}
                        </p>
                        {grouping.lastError && (
                          <p
                            className="settings-form-row-description"
                            role="status"
                          >
                            {
                              <ApiMessageText>
                                {grouping.lastError}
                              </ApiMessageText>
                            }
                          </p>
                        )}
                        {grouping.provider === 'bookorbit' && (
                          <>
                            <p className="settings-form-row-description">
                              {intl.formatMessage(
                                grouping.koboSyncStatus === 'ready'
                                  ? messages.groupingKoboSyncReady
                                  : grouping.koboSyncStatus === 'pending'
                                    ? messages.groupingKoboSyncPending
                                    : grouping.koboSyncStatus === 'error'
                                      ? messages.groupingKoboSyncError
                                      : messages.groupingKoboSyncDisabled
                              )}
                            </p>
                            {grouping.lastKoboSyncedAt && (
                              <p className="settings-form-row-description">
                                {intl.formatMessage(
                                  messages.groupingKoboSyncLast,
                                  {
                                    time: intl.formatDate(
                                      grouping.lastKoboSyncedAt,
                                      {
                                        dateStyle: 'short',
                                        timeStyle: 'short',
                                      }
                                    ),
                                  }
                                )}
                              </p>
                            )}
                            {grouping.koboSyncError && (
                              <p
                                className="settings-form-row-description"
                                role="status"
                              >
                                {
                                  <ApiMessageText>
                                    {grouping.koboSyncError}
                                  </ApiMessageText>
                                }
                              </p>
                            )}
                          </>
                        )}
                        <p className="settings-form-row-description">
                          {grouping.isPublic
                            ? intl.formatMessage(messages.sharedVisibility)
                            : intl.formatMessage(messages.privateVisibility)}
                        </p>
                        <div className="settings-card-actions">
                          {safeServiceUrl && (
                            <Button
                              as="a"
                              href={safeServiceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              buttonType="externalService"
                              buttonSize="sm"
                            >
                              {intl.formatMessage(messages.open, {
                                serviceName: providerName,
                              })}
                            </Button>
                          )}
                          <Button
                            type="button"
                            buttonType="danger"
                            buttonSize="sm"
                            onClick={() => void removeGrouping(grouping)}
                          >
                            {intl.formatMessage(messages.deleteGrouping)}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
};

export default ReaderDeliverySettings;

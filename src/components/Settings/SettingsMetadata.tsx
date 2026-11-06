import Alert from '@app/components/Common/Alert';
import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import MetadataSelector, {
  MetadataProviderType,
} from '@app/components/MetadataSelector';
import { notifySettingsUserChange } from '@app/components/Settings/settingsEvents';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownOnSquareIcon, BeakerIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import Link from 'next/link';
import { type ChangeEvent, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Settings', {
  metadataProviderSettings: 'Metadata Providers',
  general: 'General',
  settings: 'Settings',
  seriesMetadataProvider: 'Series metadata provider',
  animeMetadataProvider: 'Anime metadata provider',
  metadataSettings: 'Settings for metadata provider',
  clickTest:
    'Click on the "Test" button to check connectivity with metadata providers',
  notTested: 'Not Tested',
  failed: 'Does not work',
  operational: 'Operational',
  providerStatus: 'Metadata Provider Status',
  chooseProvider: 'Choose metadata providers for different content types',
  metadataProviderSelection: 'Metadata Provider Selection',
  tmdbProviderDoesnotWork:
    'TMDB provider does not work, please select another metadata provider',
  tvdbProviderDoesnotWork:
    'TVDB provider does not work, please select another metadata provider',
  allChosenProvidersAreOperational:
    'All chosen metadata providers are operational',
  connectionTestFailed: 'Connection test failed',
  failedToSaveMetadataSettings: 'Failed to save metadata provider settings',
  metadataSettingsSaved: 'Metadata provider settings saved',
  musicMetadataProviderSettings: 'Music Metadata Providers',
  musicMetadataProviderDescription:
    'Check MusicBrainz and Cover Art Archive connectivity, then set safe limits for Cover Art Archive requests.',
  musicMetadataProviderStatus: 'Music Provider Status',
  musicBrainz: 'MusicBrainz',
  coverArtArchive: 'Cover Art Archive',
  maxConcurrentRequests: 'Maximum concurrent requests',
  maxConcurrentRequestsDescription:
    'Limit the number of Cover Art Archive network requests SeerrNG can have in flight at once (1–5).',
  maxRequestsPerSecond: 'Maximum requests per second',
  maxRequestsPerSecondDescription:
    'Limit the total Cover Art Archive request rate, including validated redirect hops (1–50).',
  invalidConcurrentRequests:
    'Enter a whole number from 1 to 5 for concurrent requests.',
  invalidRequestsPerSecond:
    'Enter a whole number from 1 to 50 for requests per second.',
  musicMetadataSettingsSaved: 'Music metadata settings saved',
  failedToSaveMusicMetadataSettings: 'Failed to save music metadata settings',
  musicMetadataConnectionTestFailed:
    'Failed to test music metadata provider connections',
  musicMetadataProvidersOperational: 'Music metadata providers are operational',
  musicBrainzProviderDoesNotWork: 'MusicBrainz is not operational',
  coverArtArchiveProviderDoesNotWork: 'Cover Art Archive is not operational',
  musicMetadataSettingsUnavailable:
    'Music metadata provider settings are unavailable',
  bookshelfCatalogSettings: 'Book Catalog Metadata Sources',
  bookshelfCatalogSettingsDescription:
    'Seerr searches Open Library directly and merges results from connected BookshelfNG services. Configure book catalogs and provider credentials in each BookshelfNG instance under Settings > Metadata.',
  hardcoverTokenReminderTitle: 'Use your own Hardcover API token',
  hardcoverTokenReminder:
    'SeerrNG does not bundle a Hardcover token. A self-hosted BookshelfNG or rreading-glasses service uses its configured token for everyone connected to that service. A shared hosted endpoint such as hardcover.bookinfo.pro manages its own upstream access, which you cannot replace from BookshelfNG settings. To use your own token, configure native Hardcover in BookshelfNG Settings > Metadata or set the environment variable that overrides it (BOOKSHELF_HARDCOVER_AUTH for managed native mode, HARDCOVER_AUTH for compatibility mode).',
  hardcoverTokenLink: 'Create a Hardcover API token',
  bookshelfServicesLink: 'Manage connected Bookshelf services',
});

type ProviderStatus = 'ok' | 'not tested' | 'failed';

interface ProviderResponse {
  tvdb: ProviderStatus;
  tmdb: ProviderStatus;
  musicbrainz: ProviderStatus;
  coverartarchive: ProviderStatus;
}

interface MetadataValues {
  tv: MetadataProviderType;
  anime: MetadataProviderType;
}

interface MetadataSettings {
  metadata: MetadataValues;
}

interface CoverArtArchiveValues {
  maxConcurrentRequests: number | undefined;
  maxRequestsPerSecond: number | undefined;
}

const SettingsMetadata = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingMusic, setIsTestingMusic] = useState(false);
  const defaultStatus: ProviderResponse = {
    tmdb: 'not tested',
    tvdb: 'not tested',
    musicbrainz: 'not tested',
    coverartarchive: 'not tested',
  };

  const [providerStatus, setProviderStatus] =
    useState<ProviderResponse>(defaultStatus);

  const { data, error } = useSWR<MetadataSettings>(
    '/api/v1/settings/metadatas',
    async (url: string) => {
      const response = await axios.get<{
        tv: MetadataProviderType;
        anime: MetadataProviderType;
      }>(url);

      return {
        metadata: {
          tv: response.data.tv,
          anime: response.data.anime,
        },
      };
    }
  );

  const {
    data: coverArtArchiveSettings,
    error: musicSettingsError,
    mutate: mutateMusicSettings,
  } = useSWR<CoverArtArchiveValues>(
    '/api/v1/settings/metadatas/music',
    async (url: string) => {
      const response = await axios.get<CoverArtArchiveValues>(url);
      return response.data;
    }
  );

  const testConnection = async (
    values: MetadataValues
  ): Promise<ProviderResponse> => {
    const useTmdb =
      values.tv === MetadataProviderType.TMDB ||
      values.anime === MetadataProviderType.TMDB;
    const useTvdb =
      values.tv === MetadataProviderType.TVDB ||
      values.anime === MetadataProviderType.TVDB;

    const testData = {
      tmdb: useTmdb,
      tvdb: useTvdb,
    };

    try {
      const response = await axios.post<{
        success: boolean;
        tests: ProviderResponse;
      }>('/api/v1/settings/metadatas/test', testData);

      const newStatus = {
        tmdb: useTmdb ? response.data.tests.tmdb : 'not tested',
        tvdb: useTvdb ? response.data.tests.tvdb : 'not tested',
      };

      setProviderStatus((current) => ({ ...current, ...newStatus }));
      return { ...providerStatus, ...newStatus };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        // If we receive an error response with a valid format
        const errorData = error.response.data as {
          success: boolean;
          tests: ProviderResponse;
        };

        if (errorData.tests) {
          const newStatus = {
            tmdb: useTmdb ? errorData.tests.tmdb : 'not tested',
            tvdb: useTvdb ? errorData.tests.tvdb : 'not tested',
          };

          setProviderStatus((current) => ({ ...current, ...newStatus }));
          return { ...providerStatus, ...newStatus };
        }
      }

      // In case of error without usable data
      throw new Error('Failed to test connection', { cause: error });
    }
  };

  const testMusicConnections = async (): Promise<ProviderResponse> => {
    const testData = { musicbrainz: true, coverartarchive: true };

    try {
      const response = await axios.post<{
        success: boolean;
        tests: Pick<ProviderResponse, 'musicbrainz' | 'coverartarchive'>;
      }>('/api/v1/settings/metadatas/test', testData);
      const newStatus = {
        musicbrainz: response.data.tests.musicbrainz,
        coverartarchive: response.data.tests.coverartarchive,
      };

      setProviderStatus((current) => ({ ...current, ...newStatus }));
      return { ...providerStatus, ...newStatus };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const errorData = error.response.data as {
          tests?: Pick<ProviderResponse, 'musicbrainz' | 'coverartarchive'>;
        };
        if (errorData.tests) {
          const newStatus = {
            musicbrainz: errorData.tests.musicbrainz,
            coverartarchive: errorData.tests.coverartarchive,
          };
          setProviderStatus((current) => ({ ...current, ...newStatus }));
          return { ...providerStatus, ...newStatus };
        }
      }
      throw new Error('Failed to test music metadata providers', {
        cause: error,
      });
    }
  };

  const saveSettings = async (
    values: MetadataValues
  ): Promise<MetadataSettings> => {
    try {
      const response = await axios.put<{
        success: boolean;
        tv: MetadataProviderType;
        anime: MetadataProviderType;
        tests?: {
          tvdb: ProviderStatus;
          tmdb: ProviderStatus;
        };
      }>('/api/v1/settings/metadatas', {
        tv: values.tv,
        anime: values.anime,
      });

      // Update metadata provider status if available
      const tests = response.data.tests;
      if (tests) {
        const mapStatusValue = (status: string): ProviderStatus => {
          if (status === 'ok') return 'ok';
          if (status === 'failed') return 'failed';
          return 'not tested';
        };

        setProviderStatus((current) => ({
          ...current,
          tmdb: mapStatusValue(tests.tmdb),
          tvdb: mapStatusValue(tests.tvdb),
        }));
      }

      // Adapt the response to the format expected by the component
      return {
        metadata: {
          tv: response.data.tv,
          anime: response.data.anime,
        },
      };
    } catch (error) {
      // Retrieve test data in case of error
      if (axios.isAxiosError(error) && error.response?.data) {
        const errorData = error.response.data as {
          success: boolean;
          tests?: {
            tvdb: string;
            tmdb: string;
          };
        };

        // If test data is available in the error response
        const tests = errorData.tests;
        if (tests) {
          const mapStatusValue = (status: string): ProviderStatus => {
            if (status === 'ok') return 'ok';
            if (status === 'failed') return 'failed';
            return 'not tested';
          };

          // Update metadata provider status with error data
          setProviderStatus((current) => ({
            ...current,
            tmdb: mapStatusValue(tests.tmdb),
            tvdb: mapStatusValue(tests.tvdb),
          }));
        }
      }

      throw new Error('Failed to save Metadata settings', { cause: error });
    }
  };

  const saveMusicMetadataSettings = async (
    values: CoverArtArchiveValues
  ): Promise<void> => {
    const response = await axios.put<
      { success: boolean } & CoverArtArchiveValues
    >('/api/v1/settings/metadatas/music', values);
    await mutateMusicSettings(
      {
        maxConcurrentRequests: response.data.maxConcurrentRequests,
        maxRequestsPerSecond: response.data.maxRequestsPerSecond,
      },
      false
    );
  };

  const validateMusicMetadataSettings = (
    values: CoverArtArchiveValues
  ): Partial<Record<keyof CoverArtArchiveValues, string>> => {
    const errors: Partial<Record<keyof CoverArtArchiveValues, string>> = {};

    if (
      !Number.isSafeInteger(values.maxConcurrentRequests) ||
      values.maxConcurrentRequests! < 1 ||
      values.maxConcurrentRequests! > 5
    ) {
      errors.maxConcurrentRequests = intl.formatMessage(
        messages.invalidConcurrentRequests
      );
    }
    if (
      !Number.isSafeInteger(values.maxRequestsPerSecond) ||
      values.maxRequestsPerSecond! < 1 ||
      values.maxRequestsPerSecond! > 50
    ) {
      errors.maxRequestsPerSecond = intl.formatMessage(
        messages.invalidRequestsPerSecond
      );
    }

    return errors;
  };

  const getStatusClass = (status: ProviderStatus): string => {
    switch (status) {
      case 'ok':
        return 'text-green-500';
      case 'not tested':
        return 'text-yellow-500';
      case 'failed':
        return 'text-red-500';
    }
  };

  const getStatusMessage = (status: ProviderStatus): string => {
    switch (status) {
      case 'ok':
        return intl.formatMessage(messages.operational);
      case 'not tested':
        return intl.formatMessage(messages.notTested);
      case 'failed':
        return intl.formatMessage(messages.failed);
    }
  };

  const getBadgeType = (
    status: ProviderStatus
  ):
    | 'default'
    | 'primary'
    | 'danger'
    | 'warning'
    | 'success'
    | 'dark'
    | 'light'
    | undefined => {
    switch (status) {
      case 'ok':
        return 'success';
      case 'not tested':
        return 'warning';
      case 'failed':
        return 'danger';
    }
  };

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  const initialValues: MetadataValues = data?.metadata || {
    tv: MetadataProviderType.TMDB,
    anime: MetadataProviderType.TMDB,
  };

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.general),
          intl.formatMessage(globalMessages.settings),
        ]}
      />

      <section className="app-card-sub settings-group-card mb-6">
        <h3 className="heading">
          {intl.formatMessage(messages.bookshelfCatalogSettings)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.bookshelfCatalogSettingsDescription)}
        </p>
        <Alert
          type="warning"
          title={intl.formatMessage(messages.hardcoverTokenReminderTitle)}
          className="mt-4 mb-0"
        >
          <p>{intl.formatMessage(messages.hardcoverTokenReminder)}</p>
          <a
            href="https://hardcover.app/account/api"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex font-medium text-indigo-200 underline hover:text-white"
          >
            {intl.formatMessage(messages.hardcoverTokenLink)}
          </a>
        </Alert>
        <Link
          href="/settings/services"
          className="mt-3 inline-flex text-sm text-indigo-400 hover:text-indigo-300 hover:underline"
        >
          {intl.formatMessage(messages.bookshelfServicesLink)}
        </Link>
      </section>

      <section className="app-card-sub settings-group-card">
        <h3 className="heading">
          {intl.formatMessage(messages.metadataProviderSettings)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.metadataSettings)}
        </p>
        <div className="settings-group-content">
          <div className="app-card-inset refreshed-inset-surface card-spacing-before rounded-lg border border-gray-700 p-3">
            <h4 className="settings-group-heading">
              {intl.formatMessage(messages.providerStatus)}
            </h4>
            <div className="settings-provider-status-list">
              <div className="settings-provider-status-row">
                <span className="settings-provider-status-label">
                  TheMovieDB:
                </span>
                <span
                  className={getStatusClass(providerStatus.tmdb)}
                  data-testid="tmdb-status-container"
                >
                  <Badge badgeType={getBadgeType(providerStatus.tmdb)}>
                    {getStatusMessage(providerStatus.tmdb)}
                  </Badge>
                </span>
              </div>
              <div className="settings-provider-status-row">
                <span className="settings-provider-status-label">TheTVDB:</span>
                <span
                  className={getStatusClass(providerStatus.tvdb)}
                  data-testid="tvdb-status"
                >
                  <Badge badgeType={getBadgeType(providerStatus.tvdb)}>
                    {getStatusMessage(providerStatus.tvdb)}
                  </Badge>
                </span>
              </div>
            </div>
          </div>

          <div className="app-card-inset refreshed-inset-surface card-spacing-before rounded-lg border border-gray-700 p-3">
            <Formik
              initialValues={{ metadata: initialValues }}
              onSubmit={async (values) => {
                try {
                  const result = await saveSettings(values.metadata);

                  if (data) {
                    data.metadata = result.metadata;
                  }

                  addToast(intl.formatMessage(messages.metadataSettingsSaved), {
                    appearance: 'success',
                    autoDismiss: true,
                  });
                } catch {
                  addToast(
                    intl.formatMessage(messages.failedToSaveMetadataSettings),
                    {
                      appearance: 'error',
                      autoDismiss: true,
                    }
                  );
                }
              }}
            >
              {({ isSubmitting, isValid, values, setFieldValue }) => {
                return (
                  <Form data-testid="settings-main-form">
                    <h2 className="heading">
                      {intl.formatMessage(messages.metadataProviderSelection)}
                    </h2>
                    <p className="description">
                      {intl.formatMessage(messages.chooseProvider)}
                    </p>

                    <div className="form-row mt-[5px]">
                      <label
                        htmlFor="tv-metadata-provider"
                        className="checkbox-label"
                      >
                        <span className="me-2">
                          {intl.formatMessage(messages.seriesMetadataProvider)}
                        </span>
                      </label>
                      <div className="form-input-area">
                        <MetadataSelector
                          testId="tv-metadata-provider-selector"
                          inputId="tv-metadata-provider"
                          value={values.metadata.tv}
                          onChange={(value) => {
                            void setFieldValue('metadata.tv', value);
                            notifySettingsUserChange();
                          }}
                          isDisabled={isSubmitting}
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <label
                        htmlFor="anime-metadata-provider"
                        className="checkbox-label"
                      >
                        <span className="me-2">
                          {intl.formatMessage(messages.animeMetadataProvider)}
                        </span>
                      </label>
                      <div className="form-input-area">
                        <MetadataSelector
                          testId="anime-metadata-provider-selector"
                          inputId="anime-metadata-provider"
                          value={values.metadata.anime}
                          onChange={(value) => {
                            void setFieldValue('metadata.anime', value);
                            notifySettingsUserChange();
                          }}
                          isDisabled={isSubmitting}
                        />
                      </div>
                    </div>

                    <div className="actions settings-metadata-actions">
                      <div className="flex justify-end">
                        <span className="ms-3 inline-flex rounded-md shadow-sm">
                          <Button
                            data-testid="metadata-test-button"
                            buttonType="warning"
                            type="button"
                            disabled={isSubmitting || !isValid}
                            onClick={async () => {
                              setIsTesting(true);
                              try {
                                const resp = await testConnection(
                                  values.metadata
                                );

                                if (resp.tvdb === 'failed') {
                                  addToast(
                                    intl.formatMessage(
                                      messages.tvdbProviderDoesnotWork
                                    ),
                                    {
                                      appearance: 'error',
                                      autoDismiss: true,
                                    }
                                  );
                                } else if (resp.tmdb === 'failed') {
                                  addToast(
                                    intl.formatMessage(
                                      messages.tmdbProviderDoesnotWork
                                    ),
                                    {
                                      appearance: 'error',
                                      autoDismiss: true,
                                    }
                                  );
                                } else {
                                  addToast(
                                    intl.formatMessage(
                                      messages.allChosenProvidersAreOperational
                                    ),
                                    {
                                      appearance: 'success',
                                      autoDismiss: true,
                                    }
                                  );
                                }
                              } catch {
                                addToast(
                                  intl.formatMessage(
                                    messages.connectionTestFailed
                                  ),
                                  {
                                    appearance: 'error',
                                    autoDismiss: true,
                                  }
                                );
                              } finally {
                                setIsTesting(false);
                              }
                            }}
                          >
                            <BeakerIcon />
                            <span>
                              {isTesting
                                ? intl.formatMessage(globalMessages.testing)
                                : intl.formatMessage(globalMessages.test)}
                            </span>
                          </Button>
                        </span>

                        <span className="ms-3 inline-flex rounded-md shadow-sm">
                          <Button
                            data-testid="metadata-save-button"
                            buttonType="primary"
                            type="submit"
                            disabled={isSubmitting || !isValid || isTesting}
                          >
                            <ArrowDownOnSquareIcon />
                            <span>
                              {isSubmitting
                                ? intl.formatMessage(globalMessages.saving)
                                : intl.formatMessage(globalMessages.save)}
                            </span>
                          </Button>
                        </span>
                      </div>
                    </div>
                  </Form>
                );
              }}
            </Formik>
          </div>
        </div>
      </section>

      <section className="app-card-sub settings-group-card">
        <h3 className="heading">
          {intl.formatMessage(messages.musicMetadataProviderSettings)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.musicMetadataProviderDescription)}
        </p>
        <div className="settings-group-content">
          {musicSettingsError ? (
            <Alert
              type="warning"
              title={intl.formatMessage(
                messages.musicMetadataSettingsUnavailable
              )}
            />
          ) : !coverArtArchiveSettings ? (
            <LoadingSpinner />
          ) : (
            <>
              <div className="app-card-inset settings-group-card card-spacing-before">
                <h4 className="settings-group-heading">
                  {intl.formatMessage(messages.musicMetadataProviderStatus)}
                </h4>
                <div className="settings-provider-status-list">
                  <div className="settings-provider-status-row">
                    <span className="settings-provider-status-label">
                      {intl.formatMessage(messages.musicBrainz)}:
                    </span>
                    <span
                      className={getStatusClass(providerStatus.musicbrainz)}
                      data-testid="musicbrainz-status"
                    >
                      <Badge
                        badgeType={getBadgeType(providerStatus.musicbrainz)}
                      >
                        {getStatusMessage(providerStatus.musicbrainz)}
                      </Badge>
                    </span>
                  </div>
                  <div className="settings-provider-status-row">
                    <span className="settings-provider-status-label">
                      {intl.formatMessage(messages.coverArtArchive)}:
                    </span>
                    <span
                      className={getStatusClass(providerStatus.coverartarchive)}
                      data-testid="coverartarchive-status"
                    >
                      <Badge
                        badgeType={getBadgeType(providerStatus.coverartarchive)}
                      >
                        {getStatusMessage(providerStatus.coverartarchive)}
                      </Badge>
                    </span>
                  </div>
                </div>
              </div>

              <Formik<CoverArtArchiveValues>
                initialValues={coverArtArchiveSettings}
                enableReinitialize
                validate={validateMusicMetadataSettings}
                onSubmit={async (values) => {
                  try {
                    await saveMusicMetadataSettings(values);
                    addToast(
                      intl.formatMessage(messages.musicMetadataSettingsSaved),
                      { appearance: 'success', autoDismiss: true }
                    );
                  } catch {
                    addToast(
                      intl.formatMessage(
                        messages.failedToSaveMusicMetadataSettings
                      ),
                      { appearance: 'error', autoDismiss: true }
                    );
                  }
                }}
              >
                {({
                  errors,
                  isSubmitting,
                  isValid,
                  setFieldValue,
                  touched,
                  values,
                }) => (
                  <Form data-testid="music-metadata-settings-form">
                    <div className="form-row">
                      <label htmlFor="caa-max-concurrent-requests">
                        {intl.formatMessage(messages.maxConcurrentRequests)}
                      </label>
                      <div className="form-input-area">
                        <Field
                          type="number"
                          id="caa-max-concurrent-requests"
                          name="maxConcurrentRequests"
                          min={1}
                          max={5}
                          step={1}
                          value={values.maxConcurrentRequests ?? ''}
                          onChange={(event: ChangeEvent<HTMLInputElement>) => {
                            const value = event.currentTarget.value;
                            void setFieldValue(
                              'maxConcurrentRequests',
                              value === '' ? undefined : Number(value)
                            );
                            notifySettingsUserChange();
                          }}
                          disabled={isSubmitting || isTestingMusic}
                          aria-invalid={Boolean(
                            touched.maxConcurrentRequests &&
                            errors.maxConcurrentRequests
                          )}
                          aria-describedby="caa-max-concurrent-requests-description"
                        />
                        <p
                          id="caa-max-concurrent-requests-description"
                          className="settings-form-row-description"
                        >
                          {intl.formatMessage(
                            messages.maxConcurrentRequestsDescription
                          )}
                        </p>
                        {touched.maxConcurrentRequests &&
                          errors.maxConcurrentRequests && (
                            <p
                              className="settings-form-row-description"
                              role="alert"
                            >
                              {errors.maxConcurrentRequests}
                            </p>
                          )}
                      </div>
                    </div>

                    <div className="form-row">
                      <label htmlFor="caa-max-requests-per-second">
                        {intl.formatMessage(messages.maxRequestsPerSecond)}
                      </label>
                      <div className="form-input-area">
                        <Field
                          type="number"
                          id="caa-max-requests-per-second"
                          name="maxRequestsPerSecond"
                          min={1}
                          max={50}
                          step={1}
                          value={values.maxRequestsPerSecond ?? ''}
                          onChange={(event: ChangeEvent<HTMLInputElement>) => {
                            const value = event.currentTarget.value;
                            void setFieldValue(
                              'maxRequestsPerSecond',
                              value === '' ? undefined : Number(value)
                            );
                            notifySettingsUserChange();
                          }}
                          disabled={isSubmitting || isTestingMusic}
                          aria-invalid={Boolean(
                            touched.maxRequestsPerSecond &&
                            errors.maxRequestsPerSecond
                          )}
                          aria-describedby="caa-max-requests-per-second-description"
                        />
                        <p
                          id="caa-max-requests-per-second-description"
                          className="settings-form-row-description"
                        >
                          {intl.formatMessage(
                            messages.maxRequestsPerSecondDescription
                          )}
                        </p>
                        {touched.maxRequestsPerSecond &&
                          errors.maxRequestsPerSecond && (
                            <p
                              className="settings-form-row-description"
                              role="alert"
                            >
                              {errors.maxRequestsPerSecond}
                            </p>
                          )}
                      </div>
                    </div>

                    <div className="actions settings-metadata-actions">
                      <div className="settings-actions">
                        <Button
                          data-testid="music-metadata-test-button"
                          buttonType="warning"
                          type="button"
                          disabled={isSubmitting || isTestingMusic}
                          onClick={async () => {
                            setIsTestingMusic(true);
                            try {
                              const result = await testMusicConnections();
                              if (result.musicbrainz === 'failed') {
                                addToast(
                                  intl.formatMessage(
                                    messages.musicBrainzProviderDoesNotWork
                                  ),
                                  { appearance: 'error', autoDismiss: true }
                                );
                              } else if (result.coverartarchive === 'failed') {
                                addToast(
                                  intl.formatMessage(
                                    messages.coverArtArchiveProviderDoesNotWork
                                  ),
                                  { appearance: 'error', autoDismiss: true }
                                );
                              } else {
                                addToast(
                                  intl.formatMessage(
                                    messages.musicMetadataProvidersOperational
                                  ),
                                  { appearance: 'success', autoDismiss: true }
                                );
                              }
                            } catch {
                              addToast(
                                intl.formatMessage(
                                  messages.musicMetadataConnectionTestFailed
                                ),
                                { appearance: 'error', autoDismiss: true }
                              );
                            } finally {
                              setIsTestingMusic(false);
                            }
                          }}
                        >
                          <BeakerIcon />
                          <span>
                            {isTestingMusic
                              ? intl.formatMessage(globalMessages.testing)
                              : intl.formatMessage(globalMessages.test)}
                          </span>
                        </Button>
                        <Button
                          buttonType="primary"
                          type="submit"
                          disabled={isSubmitting || isTestingMusic || !isValid}
                        >
                          <ArrowDownOnSquareIcon />
                          <span>
                            {isSubmitting
                              ? intl.formatMessage(globalMessages.saving)
                              : intl.formatMessage(globalMessages.save)}
                          </span>
                        </Button>
                      </div>
                    </div>
                  </Form>
                )}
              </Formik>
            </>
          )}
        </div>
      </section>
    </>
  );
};

export default SettingsMetadata;

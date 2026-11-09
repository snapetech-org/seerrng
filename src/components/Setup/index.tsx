import EmbyLogo from '@app/assets/services/emby.svg';
import JellyfinLogo from '@app/assets/services/jellyfin.svg';
import PlexLogo from '@app/assets/services/plex.svg';
import AppDataWarning from '@app/components/AppDataWarning';
import ApiRateLimitNotice from '@app/components/Common/ApiRateLimitNotice';
import Button from '@app/components/Common/Button';
import ImageFader from '@app/components/Common/ImageFader';
import PageErrorMessage from '@app/components/Common/PageErrorMessage';
import PageTitle from '@app/components/Common/PageTitle';
import LanguagePicker from '@app/components/Layout/LanguagePicker';
import type { LoginBackdrop } from '@app/components/Login';
import SetupConnectionsGuide from '@app/components/Setup/SetupConnectionsGuide';
import SetupDefaults from '@app/components/Setup/SetupDefaults';
import SetupSteps from '@app/components/Setup/SetupSteps';
import type { SetupDownloadProfile } from '@app/components/Setup/setupDownloadClients';
import type { SetupServiceCategory } from '@app/components/Setup/setupServiceCategories';
import TransportSecurityNotice from '@app/components/TransportSecurityNotice';
import useApiRateLimit from '@app/hooks/useApiRateLimit';
import useLocale from '@app/hooks/useLocale';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import versionedAsset from '@app/utils/versionedAsset';
import {
  DEFAULT_ENABLED_MEDIA_CATEGORIES,
  MEDIA_CATEGORY_KEYS,
  type MediaCategoryKey,
} from '@server/constants/mediaCategories';
import { MediaServerType } from '@server/constants/server';
import type { Library } from '@server/lib/settings';
import axios from 'axios';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR, { mutate } from 'swr';
import { completeSetupRequests } from './setupCompletion';

const SettingsJellyfin = dynamic(
  () => import('@app/components/Settings/SettingsJellyfin')
);
const SettingsPlex = dynamic(
  () => import('@app/components/Settings/SettingsPlex')
);
const SettingsServices = dynamic(
  () => import('@app/components/Settings/SettingsServices')
);
const SettingsDownloadClients = dynamic(
  () => import('@app/components/Settings/SettingsDownloadClients')
);
const SetupLogin = dynamic(() => import('./SetupLogin'));

const messages = defineMessages('components.Setup', {
  welcome: 'Welcome to Seerr',
  subtitle: 'Get started by choosing your media server',
  configjellyfin: 'Configure Jellyfin',
  configplex: 'Configure Plex',
  configemby: 'Configure Emby',
  setup: 'Setup',
  finish: 'Finish Setup',
  finishGuide: 'Return to Services',
  finishing: 'Finishing…',
  continue: 'Continue',
  servertype: 'Choose Server Type',
  signin: 'Sign In',
  configuremediaserver: 'Configure Media Server',
  configuredefaults: 'Set Defaults',
  configureservices: 'Connect Services',
  backToMediaServerStep: 'Back to media server',
  backToDefaults: 'Back to defaults',
  skipGuidedSetup: 'Skip the guide (advanced)',
  useGuidedSetup: 'Use guided setup',
  advancedSetupDescription:
    'Skip the guided defaults and service choices. You’ll still connect your media server before setup can finish.',
  advancedSetupSelected:
    'Manual setup selected. After connecting your media server, you’ll get the full service settings.',
  backToChoices: 'Back to choices',
  skipForNow: 'Skip for now',
  saveDownloadChanges:
    'Save or discard your download client changes before finishing setup.',
  downloadProgressTitle: 'Live download progress',
  categoryTvMovies: 'Movies & TV',
  categoryBooks: 'Books, comics & magazines',
  categoryTools: 'System tools',
  librarieserror:
    'Validation failed. Please toggle the libraries again to continue.',
  libraryCheckFailed: 'Could Not Check Selected Libraries',
  librarieserrorDescription:
    'Your library selections have been kept. Retry the check to continue. If it still fails, check the connection to your media server.',
  finisherror: 'Something went wrong while finishing setup.',
  localesaveerror:
    'Setup completed, but the selected language could not be saved.',
  transportRecoveryTitle: 'Sign in again to continue setup',
  transportRecoveryDescription:
    'The media server details were saved, but the previous browser session was not established. Restart SeerrNG after changing transport settings, then sign in again from the login page.',
  openLogin: 'Open sign-in',
  transportRequired:
    'Choose an active HTTPS transport or explicitly enable authenticated HTTP sessions before signing in.',
  setupReview: 'Review SeerrNG setup',
  enabledRequestTypes: 'Enabled request types',
  noneEnabled: 'None enabled',
  enabledMediaLibraries: 'Enabled media libraries',
  libraryCount: '{count, plural, one {# library} other {# libraries}}',
  requiredSetupComplete:
    'Required setup is complete. Service connections are optional and can be tested in their forms below.',
  categoryMovie: 'Movies',
  categoryTv: 'TV',
  categoryMusic: 'Music',
  categoryEbook: 'Books',
  categoryAudiobook: 'Audiobooks',
  categoryComic: 'Comics',
  categoryMagazine: 'Magazines',
  categoryAdult: 'Adult',
  categorySports: 'Sports',
  categoryRetro: 'Retro games',
  categoryModern: 'Modern games',
  categoryGame: 'PC games',
  optionalServices:
    'Service connections are optional. Add only the providers you want SeerrNG to use. Prowlarr is optional manual search support; you can finish setup without an indexer or downloader.',
  serviceTestNote:
    'Connection test results are shown in each service form and are not saved as a setup status.',
});

const Setup = () => {
  const intl = useIntl();
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [isAdvancedSetup, setIsAdvancedSetup] = useState(false);
  const [setupConnectionsView, setSetupConnectionsView] = useState<
    'overview' | 'downloads' | 'category' | 'downloadClients'
  >('overview');
  const [setupServiceCategory, setSetupServiceCategory] =
    useState<SetupServiceCategory>('tv-movies');
  const [setupDownloadProfile, setSetupDownloadProfile] =
    useState<SetupDownloadProfile>('both');
  const [setupDownloadDirty, setSetupDownloadDirty] = useState(false);
  const [mediaServerSettingsComplete, setMediaServerSettingsComplete] =
    useState(false);
  const [enabledLibraryCount, setEnabledLibraryCount] = useState(0);
  const [enabledLibraryNames, setEnabledLibraryNames] = useState<string[]>([]);
  const [libraryValidationFailed, setLibraryValidationFailed] = useState(false);
  const [libraryValidationPending, setLibraryValidationPending] =
    useState(false);
  const rateLimitSeconds = useApiRateLimit();
  const [mediaServerType, setMediaServerType] = useState(
    MediaServerType.NOT_CONFIGURED
  );
  const router = useRouter();
  const isGuidedSetup = router.query.guide === '1';
  const { locale } = useLocale();
  const settings = useSettings();
  const enabledMediaCategories =
    settings.currentSettings.enabledMediaCategories ??
    DEFAULT_ENABLED_MEDIA_CATEGORIES;
  const categoryMessageKeys: Record<MediaCategoryKey, keyof typeof messages> = {
    movie: 'categoryMovie',
    tv: 'categoryTv',
    music: 'categoryMusic',
    ebook: 'categoryEbook',
    audiobook: 'categoryAudiobook',
    comic: 'categoryComic',
    magazine: 'categoryMagazine',
    adult: 'categoryAdult',
    sports: 'categorySports',
    retro: 'categoryRetro',
    modern: 'categoryModern',
    game: 'categoryGame',
  };
  const enabledCategoryLabels = MEDIA_CATEGORY_KEYS.filter(
    (category) => enabledMediaCategories[category]
  ).map((category) =>
    intl.formatMessage(messages[categoryMessageKeys[category]])
  );
  const { addToast } = useToasts();
  const {
    user,
    loading: userLoading,
    revalidate: revalidateUser,
    hasPermission: userHasPermission,
  } = useUser();
  const [transportReady, setTransportReady] = useState(false);
  const userCheckStarted = useRef(false);
  const libraryValidationController = useRef<AbortController | undefined>(
    undefined
  );
  const setupCompletionController = useRef<AbortController | undefined>(
    undefined
  );

  useEffect(() => {
    if (userCheckStarted.current) {
      return;
    }

    userCheckStarted.current = true;
    void revalidateUser().catch(() => undefined);
  }, [revalidateUser]);

  const finishSetup = async () => {
    if (rateLimitSeconds) return;
    if (settings.currentSettings.initialized && isGuidedSetup) {
      await router.push('/settings/services');
      return;
    }

    if (setupCompletionController.current) {
      return;
    }

    const controller = new AbortController();
    setupCompletionController.current = controller;
    setIsUpdating(true);
    try {
      const result = await completeSetupRequests({
        initialize: async () => {
          const response = await axios.post<{ initialized: boolean }>(
            '/api/v1/settings/initialize',
            undefined,
            { signal: controller.signal }
          );
          return response.data.initialized;
        },
        saveLocale: async () => {
          await axios.post(
            '/api/v1/settings/main',
            { locale },
            { signal: controller.signal }
          );
        },
        isCancellation: axios.isCancel,
      });

      if (!result.initialized) {
        throw new Error('Setup initialization was not persisted.');
      }
      if (!result.localeSaved) {
        addToast(intl.formatMessage(messages.localesaveerror), {
          autoDismiss: true,
          appearance: 'error',
        });
      }

      void mutate('/api/v1/settings/public').catch(() => undefined);
      await router.push('/');
    } catch (error) {
      if (!axios.isCancel(error)) {
        addToast(intl.formatMessage(messages.finisherror), {
          autoDismiss: true,
          appearance: 'error',
        });
      }
    } finally {
      if (setupCompletionController.current === controller) {
        setupCompletionController.current = undefined;
        setIsUpdating(false);
      }
    }
  };

  const validateLibraries = useCallback(async () => {
    libraryValidationController.current?.abort();
    const controller = new AbortController();
    libraryValidationController.current = controller;
    setLibraryValidationPending(true);
    setLibraryValidationFailed(false);
    try {
      const endpointMap: Record<MediaServerType, string> = {
        [MediaServerType.JELLYFIN]: '/api/v1/settings/jellyfin',
        [MediaServerType.EMBY]: '/api/v1/settings/jellyfin',
        [MediaServerType.PLEX]: '/api/v1/settings/plex',
        [MediaServerType.NOT_CONFIGURED]: '',
      };

      const endpoint = endpointMap[mediaServerType];
      if (!endpoint) return;

      const response = await axios.get(endpoint, { signal: controller.signal });

      const libraryCount =
        response.data?.libraries?.filter((library: Library) => library.enabled)
          .length ?? 0;
      const libraryNames =
        response.data?.libraries
          ?.filter((library: Library) => library.enabled)
          .map((library: Library) => library.name) ?? [];

      if (!controller.signal.aborted) {
        setEnabledLibraryCount(libraryCount);
        setEnabledLibraryNames(libraryNames);
        setMediaServerSettingsComplete(libraryCount > 0);
      }
    } catch (error) {
      if (axios.isCancel(error)) {
        return;
      }
      // A failed read does not undo persisted choices. Keep Continue blocked
      // until a fresh check succeeds, and offer a read-only retry.
      if (!controller.signal.aborted) {
        setLibraryValidationFailed(true);
        setMediaServerSettingsComplete(false);
      }
    } finally {
      if (libraryValidationController.current === controller) {
        libraryValidationController.current = undefined;
        setLibraryValidationPending(false);
      }
    }
  }, [mediaServerType]);

  const { data: backdrops } = useSWR<LoginBackdrop[]>('/api/v1/backdrops', {
    refreshInterval: 0,
    refreshWhenHidden: false,
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if (!router.isReady) return;

    if (settings.currentSettings.initialized) {
      if (isGuidedSetup) {
        if (currentStep < 4) {
          setCurrentStep(4);
        }
        return;
      }
      void router.replace('/');
      return;
    }

    if (
      settings.currentSettings.mediaServerType !==
      MediaServerType.NOT_CONFIGURED
    ) {
      setMediaServerType(settings.currentSettings.mediaServerType);
      if (user && currentStep < 3) {
        setCurrentStep(3);
      } else if (!user && currentStep !== 2) {
        setCurrentStep(2);
      }
    }
  }, [
    settings.currentSettings.mediaServerType,
    settings.currentSettings.initialized,
    router,
    router.isReady,
    isGuidedSetup,
    currentStep,
    user,
  ]);

  useEffect(() => {
    if (
      !router.isReady ||
      !settings.currentSettings.initialized ||
      !isGuidedSetup ||
      userLoading
    ) {
      return;
    }

    if (!user || !userHasPermission(Permission.ADMIN)) {
      void router.replace('/');
    }
  }, [
    isGuidedSetup,
    router,
    router.isReady,
    settings.currentSettings.initialized,
    user,
    userHasPermission,
    userLoading,
  ]);

  useEffect(() => {
    if (currentStep === 3) {
      void validateLibraries();
    }
  }, [currentStep, validateLibraries]);

  useEffect(
    () => () => {
      libraryValidationController.current?.abort();
      setupCompletionController.current?.abort();
    },
    []
  );

  const handleComplete = () => {
    void validateLibraries();
  };

  const handleSetupConfigured = () => {
    // The setup request can persist the media-server configuration even when
    // the browser rejects the newly-issued session cookie. Refresh public
    // settings immediately so the recovery UI replaces the setup form and
    // prevents a duplicate submission with the same hostname.
    void mutate('/api/v1/settings/public').catch(() => undefined);
  };

  const mediaServerAlreadyConfigured =
    settings.currentSettings.mediaServerType !== MediaServerType.NOT_CONFIGURED;
  const needsTransportRecovery = mediaServerAlreadyConfigured && !user;

  if (
    settings.currentSettings.initialized &&
    !(isGuidedSetup && user && userHasPermission(Permission.ADMIN))
  ) {
    return <></>;
  }

  return (
    <div className="relative flex min-h-screen flex-col justify-center bg-gray-900 py-12">
      <PageTitle title={intl.formatMessage(messages.setup)} />
      <ImageFader
        backgroundImages={
          backdrops?.map(
            (backdrop) => `https://image.tmdb.org/t/p/w1280${backdrop.path}`
          ) ?? []
        }
      />
      <div className="absolute end-4 top-4 z-50">
        <LanguagePicker />
      </div>
      <div className="relative z-40 px-4 sm:mx-auto sm:w-full sm:max-w-4xl">
        <div className="relative mb-10 h-48 max-w-full sm:mx-auto sm:h-64 sm:max-w-md">
          <Image
            src={versionedAsset('/logo_stacked.svg')}
            alt="Seerr"
            fill
            className="object-contain"
          />
        </div>
        <AppDataWarning />
        <nav className="relative z-50">
          <ul className="auth-frosted-surface divide-y divide-gray-600 rounded-md border border-gray-600 bg-gray-800/50 md:flex md:divide-y-0">
            {isGuidedSetup && settings.currentSettings.initialized ? (
              <>
                <SetupSteps
                  stepNumber={1}
                  description={intl.formatMessage(messages.configuredefaults)}
                  active={currentStep === 4}
                  completed={currentStep > 4}
                />
                <SetupSteps
                  stepNumber={2}
                  description={intl.formatMessage(messages.configureservices)}
                  active={currentStep === 5}
                  isLastStep
                />
              </>
            ) : isAdvancedSetup ? (
              <>
                <SetupSteps
                  stepNumber={1}
                  description={intl.formatMessage(messages.servertype)}
                  active={currentStep === 1}
                  completed={currentStep > 1}
                />
                <SetupSteps
                  stepNumber={2}
                  description={intl.formatMessage(messages.signin)}
                  active={currentStep === 2}
                  completed={currentStep > 2}
                />
                <SetupSteps
                  stepNumber={3}
                  description={intl.formatMessage(
                    messages.configuremediaserver
                  )}
                  active={currentStep === 3}
                  completed={currentStep > 3}
                />
                <SetupSteps
                  stepNumber={4}
                  description={intl.formatMessage(messages.configureservices)}
                  active={currentStep === 5}
                  isLastStep
                />
              </>
            ) : (
              <>
                <SetupSteps
                  stepNumber={1}
                  description={intl.formatMessage(messages.servertype)}
                  active={currentStep === 1}
                  completed={currentStep > 1}
                />
                <SetupSteps
                  stepNumber={2}
                  description={intl.formatMessage(messages.signin)}
                  active={currentStep === 2}
                  completed={currentStep > 2}
                />
                <SetupSteps
                  stepNumber={3}
                  description={intl.formatMessage(
                    messages.configuremediaserver
                  )}
                  active={currentStep === 3}
                  completed={currentStep > 3}
                />
                <SetupSteps
                  stepNumber={4}
                  description={intl.formatMessage(messages.configuredefaults)}
                  active={currentStep === 4}
                  completed={currentStep > 4}
                />
                <SetupSteps
                  stepNumber={5}
                  description={intl.formatMessage(messages.configureservices)}
                  active={currentStep === 5}
                  isLastStep
                />
              </>
            )}
          </ul>
        </nav>
        <TransportSecurityNotice onReadinessChange={setTransportReady} />
        <ApiRateLimitNotice />
        <div className="mt-10 w-full rounded-md border border-gray-600 bg-gray-800/50 p-4 text-white">
          {currentStep === 1 && (
            <div className="flex flex-col items-center pb-6">
              <div className="mb-2 flex justify-center text-xl font-bold">
                {intl.formatMessage(messages.welcome)}
              </div>
              <div className="mb-2 flex justify-center pb-6 text-sm">
                {intl.formatMessage(messages.subtitle)}
              </div>
              <div className="grid grid-cols-3">
                <div className="flex flex-col divide-y divide-gray-600 rounded-s border border-gray-600 py-2">
                  <div className="mb-2 flex flex-1 items-center justify-center px-2 py-2">
                    <JellyfinLogo className="h-10" />
                  </div>
                  <div className="px-2 pt-2">
                    <button
                      onClick={() => {
                        setMediaServerType(MediaServerType.JELLYFIN);
                        setCurrentStep(2);
                      }}
                      disabled={!transportReady}
                      className="button-md relative z-10 inline-flex h-full w-full items-center justify-center rounded-md border border-gray-600 bg-transparent px-4 py-2 text-sm leading-5 font-medium text-white transition duration-150 ease-in-out hover:z-20 hover:border-gray-200 focus:z-20 focus:border-gray-100 focus:outline-none active:border-gray-100"
                    >
                      {intl.formatMessage(messages.configjellyfin)}
                    </button>
                  </div>
                </div>
                <div className="flex flex-col divide-y divide-gray-600 border-y border-gray-600 py-2">
                  <div className="mb-2 flex flex-1 items-center justify-center px-2 py-2">
                    <PlexLogo className="h-8" />
                  </div>
                  <div className="px-2 pt-2">
                    <button
                      onClick={() => {
                        setMediaServerType(MediaServerType.PLEX);
                        setCurrentStep(2);
                      }}
                      disabled={!transportReady}
                      className="button-md relative z-10 inline-flex h-full w-full items-center justify-center rounded-md border border-gray-600 bg-transparent px-4 py-2 text-sm leading-5 font-medium text-white transition duration-150 ease-in-out hover:z-20 hover:border-gray-200 focus:z-20 focus:border-gray-100 focus:outline-none active:border-gray-100"
                    >
                      {intl.formatMessage(messages.configplex)}
                    </button>
                  </div>
                </div>
                <div className="flex flex-col divide-y divide-gray-600 rounded-e border border-gray-600 py-2">
                  <div className="mb-2 flex flex-1 items-center justify-center px-2 py-2">
                    <EmbyLogo className="h-9" />
                  </div>
                  <div className="px-2 pt-2">
                    <button
                      onClick={() => {
                        setMediaServerType(MediaServerType.EMBY);
                        setCurrentStep(2);
                      }}
                      disabled={!transportReady}
                      className="button-md relative z-10 inline-flex h-full w-full items-center justify-center rounded-md border border-gray-600 bg-transparent px-4 py-2 text-sm leading-5 font-medium text-white transition duration-150 ease-in-out hover:z-20 hover:border-gray-200 focus:z-20 focus:border-gray-100 focus:outline-none active:border-gray-100"
                    >
                      {intl.formatMessage(messages.configemby)}
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-6 w-full max-w-xl rounded-md border border-gray-600 bg-gray-900/40 p-4 text-center">
                <p className="text-sm leading-5 text-gray-300">
                  {intl.formatMessage(messages.advancedSetupDescription)}
                </p>
                {isAdvancedSetup && (
                  <p className="mt-2 text-sm text-indigo-200" role="status">
                    {intl.formatMessage(messages.advancedSetupSelected)}
                  </p>
                )}
                <Button
                  buttonType="default"
                  buttonSize="sm"
                  className="mt-3"
                  onClick={() => setIsAdvancedSetup((current) => !current)}
                >
                  {intl.formatMessage(
                    isAdvancedSetup
                      ? messages.useGuidedSetup
                      : messages.skipGuidedSetup
                  )}
                </Button>
              </div>
            </div>
          )}
          {currentStep === 2 &&
            (!transportReady ? (
              <div className="p-4 text-center text-sm text-gray-300">
                {intl.formatMessage(messages.transportRequired)}
              </div>
            ) : needsTransportRecovery ? (
              <div className="p-4 text-center">
                <div className="mb-2 text-xl font-bold">
                  {intl.formatMessage(messages.transportRecoveryTitle)}
                </div>
                <p className="mb-6 text-sm text-gray-300">
                  {intl.formatMessage(messages.transportRecoveryDescription)}
                </p>
                <Button
                  buttonType="primary"
                  onClick={() => void router.push('/login')}
                  disabled={!transportReady}
                >
                  {intl.formatMessage(messages.openLogin)}
                </Button>
              </div>
            ) : (
              <SetupLogin
                serverType={mediaServerType}
                onCancel={() => {
                  setMediaServerType(MediaServerType.NOT_CONFIGURED);
                  setCurrentStep(1);
                }}
                onComplete={() => setCurrentStep(3)}
                onSetupConfigured={handleSetupConfigured}
              />
            ))}
          {currentStep === 3 &&
            (needsTransportRecovery ? (
              <div className="p-4 text-center">
                <div className="mb-2 text-xl font-bold">
                  {intl.formatMessage(messages.transportRecoveryTitle)}
                </div>
                <p className="mb-6 text-sm text-gray-300">
                  {intl.formatMessage(messages.transportRecoveryDescription)}
                </p>
                <Button
                  buttonType="primary"
                  onClick={() => void router.push('/login')}
                  disabled={!transportReady}
                >
                  {intl.formatMessage(messages.openLogin)}
                </Button>
              </div>
            ) : !transportReady ? (
              <div className="p-4 text-center text-sm text-gray-300">
                {intl.formatMessage(messages.transportRequired)}
              </div>
            ) : (
              <div className="p-2">
                {mediaServerType === MediaServerType.PLEX ? (
                  <SettingsPlex isSetupSettings onComplete={handleComplete} />
                ) : (
                  <SettingsJellyfin
                    isSetupSettings
                    onComplete={handleComplete}
                  />
                )}
                {libraryValidationFailed && !rateLimitSeconds && (
                  <PageErrorMessage
                    title={intl.formatMessage(messages.libraryCheckFailed)}
                    description={intl.formatMessage(
                      messages.librarieserrorDescription
                    )}
                    retry={{
                      onClick: validateLibraries,
                      tooltip: intl.formatMessage(messages.libraryCheckFailed),
                      busy: libraryValidationPending,
                    }}
                  />
                )}
                <div className="actions">
                  <div className="flex justify-end">
                    <span className="ms-3 inline-flex rounded-md shadow-sm">
                      <Button
                        buttonType="primary"
                        disabled={
                          !mediaServerSettingsComplete ||
                          libraryValidationPending ||
                          rateLimitSeconds > 0
                        }
                        onClick={() => setCurrentStep(isAdvancedSetup ? 5 : 4)}
                      >
                        {intl.formatMessage(messages.continue)}
                      </Button>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          {currentStep === 4 &&
            !isAdvancedSetup &&
            (!isGuidedSetup && !transportReady ? (
              <div className="p-4 text-center text-sm text-gray-300">
                {intl.formatMessage(messages.transportRequired)}
              </div>
            ) : (
              <SetupDefaults
                onBack={isGuidedSetup ? undefined : () => setCurrentStep(3)}
                onContinue={() => setCurrentStep(5)}
                onSkip={() => setCurrentStep(5)}
              />
            ))}
          {currentStep === 5 &&
            (!isGuidedSetup && !transportReady ? (
              <div className="p-4 text-center text-sm text-gray-300">
                {intl.formatMessage(messages.transportRequired)}
              </div>
            ) : (
              <div>
                {!isGuidedSetup && (
                  <section className="app-card-sub mb-6 rounded-md border border-gray-600 p-4">
                    <h2 className="mb-3 text-lg font-semibold">
                      {intl.formatMessage(messages.setupReview)}
                    </h2>
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-gray-300">
                          {intl.formatMessage(messages.enabledRequestTypes)}
                        </dt>
                        <dd className="mt-1 font-medium">
                          {enabledCategoryLabels.join(', ') ||
                            intl.formatMessage(messages.noneEnabled)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-300">
                          {intl.formatMessage(messages.enabledMediaLibraries)}
                        </dt>
                        <dd className="mt-1 font-medium">
                          {enabledLibraryNames.join(', ') ||
                            intl.formatMessage(messages.noneEnabled)}{' '}
                          <span className="font-normal text-gray-300">
                            (
                            {intl.formatMessage(messages.libraryCount, {
                              count: enabledLibraryCount,
                            })}
                            )
                          </span>
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-sm text-gray-300">
                      {intl.formatMessage(messages.optionalServices)}
                    </p>
                    <p className="mt-2 text-sm font-medium text-white">
                      {intl.formatMessage(messages.requiredSetupComplete)}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {intl.formatMessage(messages.serviceTestNote)}
                    </p>
                  </section>
                )}

                {isAdvancedSetup && (
                  <SettingsServices showProwlarr hideGuidedSetupPrompt />
                )}
                {!isAdvancedSetup && setupConnectionsView === 'overview' && (
                  <SetupConnectionsGuide
                    view="overview"
                    enabledMediaCategories={enabledMediaCategories}
                    mediaServerType={mediaServerType}
                    showMediaServer={!isGuidedSetup}
                    onOpenMediaServer={() => setCurrentStep(3)}
                    onSelectCategory={(category) => {
                      setSetupServiceCategory(category);
                      setSetupConnectionsView('category');
                    }}
                    onOpenDownloads={() => setSetupConnectionsView('downloads')}
                    onSelectDownloadProfile={setSetupDownloadProfile}
                    onBack={() => setCurrentStep(4)}
                  />
                )}
                {setupConnectionsView === 'downloads' && (
                  <SetupConnectionsGuide
                    view="downloads"
                    enabledMediaCategories={enabledMediaCategories}
                    mediaServerType={mediaServerType}
                    showMediaServer={false}
                    onOpenMediaServer={() => setCurrentStep(3)}
                    onSelectCategory={setSetupServiceCategory}
                    onOpenDownloads={() => setSetupConnectionsView('downloads')}
                    onSelectDownloadProfile={(profile) => {
                      setSetupDownloadProfile(profile);
                      setSetupConnectionsView('downloadClients');
                    }}
                    onBack={() => setSetupConnectionsView('overview')}
                  />
                )}
                {setupConnectionsView === 'category' && (
                  <section>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-xl font-semibold text-white sm:text-2xl">
                        {intl.formatMessage(
                          messages[
                            setupServiceCategory === 'tv-movies'
                              ? 'categoryTvMovies'
                              : setupServiceCategory === 'audiobooks-books'
                                ? 'categoryBooks'
                                : setupServiceCategory === 'music'
                                  ? 'categoryMusic'
                                  : 'categoryTools'
                          ]
                        )}
                      </h2>
                      <Button
                        buttonType="default"
                        onClick={() => setSetupConnectionsView('overview')}
                      >
                        {intl.formatMessage(messages.backToChoices)}
                      </Button>
                    </div>
                    <SettingsServices
                      showProwlarr
                      setupEnabledMediaCategories={enabledMediaCategories}
                      setupActiveCategory={setupServiceCategory}
                      onSetupCategoryChange={setSetupServiceCategory}
                    />
                    <div className="mt-4">
                      <Button
                        buttonType="default"
                        onClick={() => setSetupConnectionsView('overview')}
                      >
                        {intl.formatMessage(messages.skipForNow)}
                      </Button>
                    </div>
                  </section>
                )}
                {setupConnectionsView === 'downloadClients' && (
                  <section>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold text-white sm:text-2xl">
                          {intl.formatMessage(messages.downloadProgressTitle)}
                        </h2>
                        <p className="mt-1 text-sm text-gray-300">
                          {intl.formatMessage(messages.optionalServices)}
                        </p>
                      </div>
                      <Button
                        buttonType="default"
                        onClick={() => setSetupConnectionsView('downloads')}
                        disabled={setupDownloadDirty}
                      >
                        {intl.formatMessage(messages.backToChoices)}
                      </Button>
                    </div>
                    <SettingsDownloadClients
                      setupProfile={setupDownloadProfile}
                      onSetupDirtyChange={setSetupDownloadDirty}
                    />
                    {setupDownloadDirty && (
                      <p className="mt-3 text-sm text-amber-200" role="status">
                        {intl.formatMessage(messages.saveDownloadChanges)}
                      </p>
                    )}
                    <div className="mt-4">
                      <Button
                        buttonType="default"
                        onClick={() => setSetupConnectionsView('overview')}
                        disabled={setupDownloadDirty}
                      >
                        {intl.formatMessage(messages.skipForNow)}
                      </Button>
                    </div>
                  </section>
                )}

                <div className="actions mt-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button
                      buttonType="default"
                      onClick={() => setCurrentStep(isAdvancedSetup ? 3 : 4)}
                      disabled={
                        setupConnectionsView === 'downloadClients' &&
                        setupDownloadDirty
                      }
                    >
                      {intl.formatMessage(
                        isAdvancedSetup
                          ? messages.backToMediaServerStep
                          : messages.backToDefaults
                      )}
                    </Button>
                    <Button
                      buttonType="primary"
                      onClick={() => void finishSetup()}
                      disabled={
                        isUpdating ||
                        (setupConnectionsView === 'downloadClients' &&
                          setupDownloadDirty)
                      }
                    >
                      {isUpdating
                        ? intl.formatMessage(messages.finishing)
                        : intl.formatMessage(
                            isGuidedSetup
                              ? messages.finishGuide
                              : messages.finish
                          )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default Setup;

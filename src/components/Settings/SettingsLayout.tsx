import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import Modal from '@app/components/Common/Modal';
import PageTitle from '@app/components/Common/PageTitle';
import type { SettingsRoute } from '@app/components/Common/SettingsTabs';
import SettingsTabs from '@app/components/Common/SettingsTabs';
import { SETTINGS_USER_CHANGE_EVENT } from '@app/components/Settings/settingsEvents';
import useSettings from '@app/hooks/useSettings';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/solid';
import { MediaServerType, ServerType } from '@server/constants/server';
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useIntl } from 'react-intl';
import settingsLayoutStyles from './SettingsLayout.module.css';

const messages = defineMessages('components.Settings', {
  menuGeneralSettings: 'General',
  menuUsers: 'Users',
  menuCategories: 'Media Categories',
  menuPlexSettings: 'Plex',
  menuJellyfinSettings: '{mediaServerName}',
  menuServices: 'Services',
  menuProwlarr: 'Prowlarr',
  menuLibraryMigration: 'Library Migration',
  menuNetwork: 'Network',
  menuNotifications: 'Notifications',
  menuLogs: 'Logs',
  menuJobs: 'Jobs & Cache',
  menuAbout: 'About',
  menuMetadataProviders: 'Metadata Providers',
  menuDiscoveryIntegrations: 'Discovery Integrations',
  searchSettings: 'Search Settings',
  save: 'Save',
  discard: 'Discard',
  unsavedChanges: 'Unsaved Changes',
  unsavedChangesMessage: 'Changes have not been saved.',
});

type SettingsLayoutProps = {
  children: React.ReactNode;
};

type SettingsPageAction = {
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
};

type SettingsSearchDestination = {
  route: string;
  query: string;
  targetId?: string;
};

const settingsSearchTargets = [
  {
    route: '/settings/main',
    targetId: 'enable4k',
    terms: ['4k', '4k requests', '4k settings', 'uhd'],
    adminOnly: true,
  },
  {
    route: '/settings/prowlarr',
    targetId: 'prowlarr-settings-title',
    terms: [
      'prowlarr',
      'indexer search',
      'indexer settings',
      'nzb hydra2',
      'nzbhydra2',
    ],
    adminOnly: true,
  },
  {
    route: '/settings/main',
    targetId: 'apiKey',
    terms: ['api', 'api key', 'apikey', 'application api key'],
    adminOnly: true,
  },
] as const;

const SettingsPageActionContext = createContext<
  (action: SettingsPageAction | null) => void
>(() => undefined);

export const useSettingsPageAction = (action: SettingsPageAction | null) => {
  const setPageAction = useContext(SettingsPageActionContext);

  useEffect(() => {
    setPageAction(action);
    return () => setPageAction(null);
  }, [action, setPageAction]);
};

const editableSettingsRoute = (path: string) =>
  !/^\/settings\/(?:services|prowlarr|library-migration|logs|jobs|about|discovery)(?:\/|$)/.test(
    path
  );

const SettingsLayout = ({ children }: SettingsLayoutProps) => {
  const intl = useIntl();
  const upstream = useUpstreamTheme();
  const router = useRouter();
  const settings = useSettings();
  const { hasPermission } = useUser();
  const canAdminister = hasPermission(Permission.ADMIN);
  const contentRef = useRef<HTMLDivElement>(null);
  const currentSettingsPathRef = useRef(router.asPath);
  const dirtyRef = useRef(false);
  const [keywordSearch, setKeywordSearch] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [managedFormsSaving, setManagedFormsSaving] = useState(false);
  const [showUnsavedChanges, setShowUnsavedChanges] = useState(false);
  const [pageAction, setPageAction] = useState<SettingsPageAction | null>(null);
  const [pendingSettingsSearch, setPendingSettingsSearch] =
    useState<SettingsSearchDestination | null>(null);
  const registerPageAction = useCallback(
    (action: SettingsPageAction | null) => setPageAction(action),
    []
  );
  const hasSaveActions = editableSettingsRoute(router.pathname);
  const settingsRoutes: SettingsRoute[] = [
    {
      text: intl.formatMessage(messages.menuGeneralSettings),
      route: '/settings/main',
      regex: /^\/settings(\/main)?$/,
    },
    {
      text: intl.formatMessage(messages.menuUsers),
      route: '/settings/users',
      regex: /^\/settings\/users/,
    },
    {
      text: intl.formatMessage(messages.menuCategories),
      route: '/settings/categories',
      regex: /^\/settings\/categories/,
    },
    settings.currentSettings.mediaServerType === MediaServerType.PLEX
      ? {
          text: intl.formatMessage(messages.menuPlexSettings),
          route: '/settings/plex',
          regex: /^\/settings\/plex/,
        }
      : {
          text: getAvailableMediaServerName(),
          route: '/settings/jellyfin',
          regex: /^\/settings\/jellyfin/,
        },
    {
      text: intl.formatMessage(messages.menuServices),
      route: '/settings/services',
      regex: /^\/settings\/services/,
    },
    ...(canAdminister
      ? [
          {
            text: intl.formatMessage(messages.menuLibraryMigration),
            route: '/settings/library-migration',
            regex: /^\/settings\/library-migration/,
          },
        ]
      : []),
    {
      text: intl.formatMessage(messages.menuDiscoveryIntegrations),
      route: '/settings/discovery',
      regex: /^\/settings\/discovery/,
    },
    {
      text: intl.formatMessage(messages.menuNetwork),
      route: '/settings/network',
      regex: /^\/settings\/network/,
    },
    {
      text: intl.formatMessage(messages.menuProwlarr),
      route: '/settings/prowlarr',
      regex: /^\/settings\/prowlarr/,
      requiredPermission: Permission.ADMIN,
    },
    {
      text: intl.formatMessage(messages.menuMetadataProviders),
      route: '/settings/metadata',
      regex: /^\/settings\/metadata/,
    },
    {
      text: intl.formatMessage(messages.menuNotifications),
      route: '/settings/notifications/email',
      regex: /^\/settings\/notifications/,
    },
    {
      text: intl.formatMessage(messages.menuLogs),
      route: '/settings/logs',
      regex: /^\/settings\/logs/,
    },
    {
      text: intl.formatMessage(messages.menuJobs),
      route: '/settings/jobs',
      regex: /^\/settings\/jobs/,
    },
    {
      text: intl.formatMessage(messages.menuAbout),
      route: '/settings/about',
      regex: /^\/settings\/about/,
    },
  ];

  const setDirty = (dirty: boolean) => {
    dirtyRef.current = dirty;
    setHasUnsavedChanges(dirty);
  };

  const submitSettingsForms = () => {
    const forms = Array.from(
      contentRef.current?.querySelectorAll<HTMLFormElement>('form') ?? []
    );
    const settingsForms = forms
      .map((form) => ({
        form,
        submitButton: form.querySelector<HTMLButtonElement>(
          'button[type="submit"]'
        ),
      }))
      .filter(
        (
          entry
        ): entry is {
          form: HTMLFormElement;
          submitButton: HTMLButtonElement;
        } => entry.submitButton !== null
      );

    if (
      settingsForms.length > 0 &&
      settingsForms.every(({ form }) =>
        form.hasAttribute('data-settings-dirty')
      )
    ) {
      // Each form owns validation and reports success by resetting its dirty
      // state. An untouched optional form must not be submitted or block saving.
      settingsForms
        .filter(
          ({ form }) =>
            form.dataset.settingsDirty === 'true' &&
            form.dataset.settingsSubmitting !== 'true'
        )
        .forEach(({ form }) => form.requestSubmit());
      return;
    }

    if (
      settingsForms.length === 0 ||
      settingsForms.some(({ submitButton }) => submitButton.disabled)
    ) {
      return;
    }

    settingsForms.forEach(({ form, submitButton }) =>
      form.requestSubmit(submitButton)
    );
    setDirty(false);
  };

  useEffect(() => {
    currentSettingsPathRef.current = router.asPath;
    setDirty(false);
  }, [router.asPath]);

  useEffect(() => {
    const content = contentRef.current;
    setManagedFormsSaving(false);
    if (!content || !hasSaveActions) return;
    const syncManagedForms = () => {
      const forms = [
        ...content.querySelectorAll<HTMLFormElement>('form'),
      ].filter((form) => form.querySelector('button[type="submit"]'));
      if (
        forms.length &&
        forms.every((form) => form.hasAttribute('data-settings-dirty'))
      ) {
        setDirty(forms.some((form) => form.dataset.settingsDirty === 'true'));
        setManagedFormsSaving(
          forms.some((form) => form.dataset.settingsSubmitting === 'true')
        );
      }
    };
    const observer = new MutationObserver(syncManagedForms);
    observer.observe(content, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-settings-dirty', 'data-settings-submitting'],
    });
    syncManagedForms();
    return () => observer.disconnect();
  }, [hasSaveActions, router.pathname]);

  useEffect(() => {
    router.beforePopState(() => {
      if (!dirtyRef.current) {
        return true;
      }

      window.history.pushState(null, '', currentSettingsPathRef.current);
      setShowUnsavedChanges(true);
      return false;
    });

    return () => router.beforePopState(() => true);
  }, [router]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) {
        return;
      }
      event.preventDefault();
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, []);

  useEffect(() => {
    if (!hasSaveActions) {
      return;
    }

    const markDirtyFromCustomControl = () => setDirty(true);
    window.addEventListener(
      SETTINGS_USER_CHANGE_EVENT,
      markDirtyFromCustomControl
    );

    return () =>
      window.removeEventListener(
        SETTINGS_USER_CHANGE_EVENT,
        markDirtyFromCustomControl
      );
  }, [hasSaveActions]);

  const discardAndLeave = () => {
    setDirty(false);
    setShowUnsavedChanges(false);
    const destination = pendingSettingsSearch;
    setPendingSettingsSearch(null);
    if (destination) {
      void router.push({
        pathname: destination.route,
        query: {
          settingsSearch: destination.query,
          ...(destination.targetId
            ? { settingsSearchTarget: destination.targetId }
            : {}),
        },
      });
      return;
    }

    void router.push('/discover');
  };

  const saveAndStay = () => {
    submitSettingsForms();
    setShowUnsavedChanges(false);
    setPendingSettingsSearch(null);
  };

  const focusSetting = (element: HTMLElement): boolean => {
    const row =
      element.closest<HTMLElement>(
        '.form-row, .settings-group-card, section'
      ) ?? element;
    const controls = 'input, select, textarea, button, [tabindex]';
    const available = (candidate: HTMLElement) =>
      candidate.getClientRects().length > 0 &&
      !candidate.matches(':disabled') &&
      !candidate.closest('[hidden], [inert], [aria-hidden="true"]') &&
      getComputedStyle(candidate).visibility !== 'hidden';
    const focusTarget = element.matches(controls)
      ? element
      : (Array.from(row.querySelectorAll<HTMLElement>(controls)).find(
          available
        ) ?? element);
    if (!available(focusTarget)) return false;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!focusTarget.matches(controls)) focusTarget.tabIndex = -1;
    focusTarget.focus({ preventScroll: true });
    // A DOM match is not success while its panel/control is still unavailable.
    return document.activeElement === focusTarget;
  };

  const focusSettingsSearchResult = (element: HTMLElement) => {
    const categoryPanel = element.closest<HTMLElement>(
      '[data-settings-category]'
    );
    const category = categoryPanel?.dataset.settingsCategory;

    if (categoryPanel?.hidden && category) {
      const query = { ...router.query };
      delete query.settingsSearchTarget;
      query.serviceCategory = category;
      void router
        .replace(
          {
            pathname: router.pathname,
            query,
          },
          undefined,
          { shallow: true, scroll: false }
        )
        .then(() => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              if (element.isConnected) focusSetting(element);
            });
          });
        });
      return;
    }

    focusSetting(element);
  };

  const navigateToSettingsSearchDestination = (
    destination: SettingsSearchDestination
  ) => {
    if (dirtyRef.current && destination.route !== router.pathname) {
      setPendingSettingsSearch(destination);
      setShowUnsavedChanges(true);
      return;
    }

    void router.push({
      pathname: destination.route,
      query: {
        settingsSearch: destination.query,
        ...(destination.targetId
          ? { settingsSearchTarget: destination.targetId }
          : {}),
      },
    });
  };

  const handleSettingsSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = keywordSearch.trim();
    if (!query) return;

    const normalizedQuery = query.toLocaleLowerCase();
    const indexedTarget = settingsSearchTargets.find(
      (target) =>
        (!target.adminOnly || canAdminister) &&
        target.terms.some(
          (term) =>
            term.includes(normalizedQuery) || normalizedQuery.includes(term)
        )
    );

    if (
      indexedTarget &&
      (indexedTarget.targetId === 'prowlarr-settings-title' ||
        indexedTarget.terms.some((term) => term === normalizedQuery)) &&
      indexedTarget.route !== router.pathname
    ) {
      navigateToSettingsSearchDestination({
        route: indexedTarget.route,
        query,
        targetId: indexedTarget.targetId,
      });
      return;
    }

    const matchingLabel = Array.from(
      contentRef.current?.querySelectorAll<HTMLElement>(
        '[data-settings-search], label, legend, h2, h3, h4'
      ) ?? []
    ).find((element) =>
      element.textContent?.toLocaleLowerCase().includes(normalizedQuery)
    );

    if (matchingLabel) {
      const control =
        matchingLabel instanceof HTMLLabelElement && matchingLabel.htmlFor
          ? document.getElementById(matchingLabel.htmlFor)
          : matchingLabel;
      if (control instanceof HTMLElement) {
        focusSettingsSearchResult(control);
        return;
      }
    }

    if (indexedTarget) {
      navigateToSettingsSearchDestination({
        route: indexedTarget.route,
        query,
        targetId: indexedTarget.targetId,
      });
      return;
    }

    const matchingRoute = settingsRoutes.find(
      (route) =>
        (!route.requiredPermission || canAdminister) &&
        route.text.toLocaleLowerCase().includes(normalizedQuery)
    );
    if (!matchingRoute) return;
    navigateToSettingsSearchDestination({
      route: matchingRoute.route,
      query,
    });
  };

  useEffect(() => {
    const targetId = router.query.settingsSearchTarget;
    if (!router.isReady || typeof targetId !== 'string') return;

    const tryFocusTarget = () => {
      const target = document.getElementById(targetId);
      if (
        !(target instanceof HTMLElement) ||
        !contentRef.current?.contains(target)
      ) {
        return false;
      }
      return focusSetting(target);
    };

    if (!contentRef.current) return;
    let frame: number | undefined;
    const scheduleFocus = () => {
      if (frame !== undefined) return;
      frame = window.requestAnimationFrame(() => {
        frame = undefined;
        if (tryFocusTarget()) observer.disconnect();
      });
    };
    const observer = new MutationObserver(scheduleFocus);
    observer.observe(contentRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'hidden',
        'inert',
        'aria-hidden',
        'class',
        'style',
        'disabled',
      ],
    });
    scheduleFocus();
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    }, 5000);

    return () => {
      observer.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [
    router.asPath,
    router.isReady,
    router.query.settingsSearchTarget,
    upstream,
  ]);

  return (
    <SettingsPageActionContext.Provider value={registerPageAction}>
      <PageTitle title={intl.formatMessage(globalMessages.settings)} />
      <Transition show={showUnsavedChanges}>
        <Modal
          title={intl.formatMessage(messages.unsavedChanges)}
          onCancel={discardAndLeave}
          cancelText={intl.formatMessage(messages.discard)}
          cancelButtonType="danger"
          onOk={saveAndStay}
          okText={intl.formatMessage(messages.save)}
          okButtonType="success"
          actionButtonSize="standard"
          backgroundClickable={false}
        >
          {intl.formatMessage(messages.unsavedChangesMessage)}
        </Modal>
      </Transition>

      {!upstream && (
        <Header>{intl.formatMessage(globalMessages.settings)}</Header>
      )}
      <div className="settings-page-navigation-row">
        <SettingsTabs
          tabType={upstream ? 'default' : 'filter'}
          settingsRoutes={settingsRoutes}
        />
        <form
          className="discover-filter-control settings-page-search"
          onSubmit={handleSettingsSearch}
        >
          <span className="discover-filter-control-label gap-1.5">
            <MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />
            {intl.formatMessage(messages.searchSettings)}
          </span>
          <input
            type="search"
            value={keywordSearch}
            onChange={(event) => setKeywordSearch(event.target.value)}
            aria-label={intl.formatMessage(messages.searchSettings)}
            className="settings-page-search-input"
          />
        </form>
      </div>

      <article className="app-card-main settings-main-card max-w-full min-w-0">
        <div
          ref={contentRef}
          className={`settings-page-content ${settingsLayoutStyles.settingsContent} ${
            hasSaveActions ? 'settings-page-has-actions' : ''
          }`}
          onChangeCapture={(event) => {
            if (hasSaveActions && event.nativeEvent.isTrusted) setDirty(true);
          }}
          onSubmitCapture={(event) => {
            if (
              !(event.target instanceof HTMLFormElement) ||
              !event.target.hasAttribute('data-settings-dirty')
            )
              setDirty(false);
          }}
        >
          {children}
        </div>
        <div className="settings-page-actions">
          <Button
            buttonType="danger"
            buttonSize="standard"
            onClick={discardAndLeave}
            buttonIcon="cancel"
          >
            {intl.formatMessage(globalMessages.cancel)}
          </Button>
          {pageAction && (
            <Button
              buttonType="success"
              buttonSize="standard"
              disabled={pageAction.disabled}
              onClick={pageAction.onClick}
            >
              {pageAction.icon}
              <span>{pageAction.label}</span>
            </Button>
          )}
          {hasSaveActions && (
            <Button
              data-testid="settings-save-button"
              buttonType="success"
              buttonSize="standard"
              disabled={!hasUnsavedChanges || managedFormsSaving}
              onClick={submitSettingsForms}
            >
              {intl.formatMessage(
                managedFormsSaving ? globalMessages.saving : messages.save
              )}
            </Button>
          )}
        </div>
      </article>
    </SettingsPageActionContext.Provider>
  );

  function getAvailableMediaServerName() {
    return intl.formatMessage(messages.menuJellyfinSettings, {
      mediaServerName:
        settings.currentSettings.mediaServerType === MediaServerType.JELLYFIN
          ? ServerType.JELLYFIN
          : settings.currentSettings.mediaServerType === MediaServerType.EMBY
            ? ServerType.EMBY
            : undefined,
    });
  }
};

export default SettingsLayout;

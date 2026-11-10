import Alert from '@app/components/Common/Alert';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import type { SettingsRoute } from '@app/components/Common/SettingsTabs';
import SettingsTabs from '@app/components/Common/SettingsTabs';
import ProfileHeader from '@app/components/UserProfile/ProfileHeader';
import useSettings from '@app/hooks/useSettings';
import { getPositiveQueryParamNumber } from '@app/hooks/useUpdateQueryParams';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { UserSettingsNotificationsResponse } from '@server/interfaces/api/userSettingsInterfaces';
import { hasPermission, Permission } from '@server/lib/permissions';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.UserProfile.UserSettings', {
  menuGeneralSettings: 'General',
  menuChangePass: 'Password',
  menuLinkedAccounts: 'Linked Accounts',
  menuNotifications: 'Notifications',
  menuPermissions: 'Permissions',
  menuMaturityControls: 'Maturity Controls',
  menuTvRequestAccess: 'TV Season Rule',
  menuEpisodeQueue: 'Episode Queue',
  menuAdvancedTheme: 'Advanced Theme',
  unauthorizedDescription:
    "You do not have permission to modify this user's settings.",
  menuClientTokens: 'Client Tokens',
});

type UserSettingsProps = {
  children: React.ReactNode;
};

const UserSettings = ({ children }: UserSettingsProps) => {
  const router = useRouter();
  const settings = useSettings();
  const { user: currentUser } = useUser();
  const userId = getPositiveQueryParamNumber(router.query.userId);
  const { user, error } = useUser({ id: userId });
  const intl = useIntl();
  const { data } = useSWR<UserSettingsNotificationsResponse>(
    user ? `/api/v1/user/${user?.id}/settings/notifications` : null
  );

  if (!user && !error) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <ErrorPage statusCode={500} />;
  }

  const settingsRoutes: SettingsRoute[] = [
    {
      text: intl.formatMessage(messages.menuGeneralSettings),
      route: '/settings/main',
      regex: /\/settings(\/main)?$/,
    },
    {
      text: intl.formatMessage(messages.menuChangePass),
      route: '/settings/password',
      regex: /\/settings\/password/,
      hidden:
        (!settings.currentSettings.localLogin &&
          !hasPermission(Permission.ADMIN, currentUser?.permissions ?? 0)) ||
        (currentUser?.id !== 1 &&
          currentUser?.id !== user?.id &&
          hasPermission(Permission.ADMIN, user?.permissions ?? 0)),
    },
    {
      text: intl.formatMessage(messages.menuLinkedAccounts),
      route: '/settings/linked-accounts',
      regex: /\/settings\/linked-accounts/,
    },
    {
      text: intl.formatMessage(messages.menuClientTokens),
      route: '/settings/client-tokens',
      regex: /\/settings\/client-tokens/,
      hidden: currentUser?.id !== user.id,
    },
    {
      text: intl.formatMessage(messages.menuNotifications),
      route: data?.emailEnabled
        ? '/settings/notifications/email'
        : data?.webPushEnabled
          ? '/settings/notifications/webpush'
          : data?.discordEnabled
            ? '/settings/notifications/discord'
            : '/settings/notifications/pushbullet',
      regex: /\/settings\/notifications/,
    },
    {
      text: intl.formatMessage(messages.menuPermissions),
      route: '/settings/permissions',
      regex: /\/settings\/permissions/,
      requiredPermission: Permission.MANAGE_USERS,
      hidden: currentUser?.id !== 1 && currentUser?.id === user.id,
    },
    {
      text: intl.formatMessage(messages.menuMaturityControls),
      route: '/settings/maturity',
      regex: /\/settings\/maturity/,
      requiredPermission: Permission.MANAGE_USERS,
    },
    {
      text: intl.formatMessage(messages.menuTvRequestAccess),
      route: '/settings/tv-request-access',
      regex: /\/settings\/tv-request-access/,
    },
    {
      text: intl.formatMessage(messages.menuEpisodeQueue),
      route: '/settings/episode-queue',
      regex: /\/settings\/episode-queue/,
      requiredPermission: Permission.MANAGE_USERS,
    },
    {
      text: intl.formatMessage(messages.menuAdvancedTheme),
      route: '/advanced-theme',
      regex: /\/profile\/advanced-theme$/,
      requiredPermission: Permission.ADMIN,
      hidden: currentUser?.id !== user.id,
    },
  ];

  if (currentUser?.id !== 1 && user.id === 1) {
    return (
      <>
        <PageTitle
          title={[
            intl.formatMessage(globalMessages.usersettings),
            user.displayName,
          ]}
        />
        <ProfileHeader user={user} isSettingsPage />
        <div className="mt-6">
          <Alert
            title={intl.formatMessage(messages.unauthorizedDescription)}
            type="error"
          />
        </div>
      </>
    );
  }

  settingsRoutes.forEach((settingsRoute) => {
    if (settingsRoute.route === '/settings/client-tokens') {
      settingsRoute.route = '/profile/settings/client-tokens';
      return;
    }
    if (settingsRoute.route === '/settings/maturity') {
      settingsRoute.route = `/users/${user.id}${settingsRoute.route}`;
      return;
    }

    if (settingsRoute.route === '/advanced-theme') {
      settingsRoute.route = '/profile/advanced-theme';
      return;
    }

    settingsRoute.route = router.asPath.includes('/profile')
      ? `/profile${settingsRoute.route}`
      : `/users/${user.id}${settingsRoute.route}`;
  });

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(globalMessages.usersettings),
          user.displayName,
        ]}
      />
      <ProfileHeader user={user} isSettingsPage />
      <div className="mt-6">
        <SettingsTabs settingsRoutes={settingsRoutes} />
      </div>
      <div className="mt-10 text-gray-100">{children}</div>
    </>
  );
};

export default UserSettings;

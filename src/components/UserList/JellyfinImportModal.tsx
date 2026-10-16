import Alert from '@app/components/Common/Alert';
import CachedImage from '@app/components/Common/CachedImage';
import Modal from '@app/components/Common/Modal';
import SelectionCircle from '@app/components/Common/SelectionCircle';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { MediaServerType, ServerType } from '@server/constants/server';
import axios from 'axios';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import userSelectionMessages from './userSelectionMessages';

interface JellyfinImportUser {
  id: string;
  username: string;
  thumb: string;
  isImported: boolean;
}

interface JellyfinImportResponse {
  createdUsers: unknown[];
  refreshedUsers: number;
}

interface JellyfinImportProps {
  onCancel?: () => void;
  onComplete?: () => void;
}

const messages = defineMessages('components.UserList', {
  importfromJellyfin: 'Import {mediaServerName} Users',
  importfromJellyfinerror:
    'Something went wrong while importing {mediaServerName} users.',
  importedfromJellyfin:
    '<strong>{userCount}</strong> {mediaServerName} {userCount, plural, one {user} other {users}} imported successfully!',
  importedAndRefreshed:
    '{createdCount, plural, =0 {No new users imported} zero {No new users imported} one {# new user imported} two {# new users imported} few {# new users imported} many {# new users imported} other {# new users imported}}. {refreshedCount, plural, =0 {No existing users refreshed} zero {No existing users refreshed} one {# existing user refreshed} two {# existing users refreshed} few {# existing users refreshed} many {# existing users refreshed} other {# existing users refreshed}}.',
  importedUsersNoPassword:
    'Imported users do not have a {applicationTitle} password set. If you disable {mediaServerName} sign-in, they will need to set a password from their profile or via a password reset link.',
  user: 'User',
  noJellyfinUsersToImport: 'There are no {mediaServerName} users to import.',
  noJellyfinUsersToSync:
    'There are no linked {mediaServerName} users to refresh.',
  allJellyfinUsersImported:
    'All {mediaServerName} users are already imported. Turn on Sync Existing Users to refresh linked accounts.',
  newJellyfinSignInEnabled:
    'The <strong>Enable New {mediaServerName} Sign-In</strong> setting is currently enabled. {mediaServerName} users with library access do not need to be imported in order to sign in.',
  syncExistingUsers: 'Sync Existing Users',
  syncExistingUsersHelp:
    'Refresh the provider display name and profile photo for linked users. SeerrNG email, passwords, and permissions stay unchanged.',
  alreadyImported: 'Already Imported',
  noUsersChanged: 'No selected users were imported or refreshed.',
  failedToLoadUsers: 'Unable to load {mediaServerName} users.',
});

const JellyfinImportModal: React.FC<JellyfinImportProps> = ({
  onCancel,
  onComplete,
}) => {
  const intl = useIntl();
  const settings = useSettings();
  const { addToast } = useToasts();
  const [isImporting, setImporting] = useState(false);
  const [syncExisting, setSyncExisting] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const mediaServerName =
    settings.currentSettings.mediaServerType === MediaServerType.EMBY
      ? ServerType.EMBY
      : ServerType.JELLYFIN;
  const { data, error } = useSWR<JellyfinImportUser[]>(
    '/api/v1/settings/jellyfin/users',
    { revalidateOnMount: true }
  );

  const availableUsers = useMemo(
    () => data?.filter((user) => syncExisting || !user.isImported) ?? [],
    [data, syncExisting]
  );
  const allAvailableUsersSelected =
    availableUsers.length > 0 &&
    availableUsers.every((user) => selectedUsers.includes(user.id));
  const someAvailableUsersSelected = availableUsers.some((user) =>
    selectedUsers.includes(user.id)
  );

  const importUsers = async () => {
    setImporting(true);

    try {
      const { data: response } = await axios.post<
        JellyfinImportResponse | unknown[]
      >('/api/v1/user/import-from-jellyfin', {
        jellyfinUserIds: selectedUsers,
        ...(syncExisting ? { syncExisting: true } : {}),
      });
      const createdUsers = Array.isArray(response)
        ? response
        : response.createdUsers;
      const refreshedUsers = Array.isArray(response)
        ? 0
        : response.refreshedUsers;

      if (!createdUsers.length && !refreshedUsers) {
        addToast(intl.formatMessage(messages.noUsersChanged), {
          autoDismiss: true,
          appearance: 'info',
        });
        return;
      }

      addToast(
        intl.formatMessage(
          syncExisting
            ? messages.importedAndRefreshed
            : messages.importedfromJellyfin,
          {
            createdCount: createdUsers.length,
            refreshedCount: refreshedUsers,
            userCount: createdUsers.length,
            mediaServerName,
            strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
          }
        ),
        { autoDismiss: true, appearance: 'success' }
      );

      if (createdUsers.length > 0) {
        addToast(
          intl.formatMessage(messages.importedUsersNoPassword, {
            applicationTitle: settings.currentSettings.applicationTitle,
            mediaServerName,
          }),
          { autoDismiss: false, appearance: 'warning' }
        );
      }

      onComplete?.();
    } catch {
      addToast(
        intl.formatMessage(messages.importfromJellyfinerror, {
          mediaServerName,
        }),
        { autoDismiss: true, appearance: 'error' }
      );
    } finally {
      setImporting(false);
    }
  };

  const toggleUser = (userId: string): void => {
    setSelectedUsers((users) =>
      users.includes(userId)
        ? users.filter((selectedUserId) => selectedUserId !== userId)
        : [...users, userId]
    );
  };

  const toggleAllUsers = (): void => {
    setSelectedUsers((users) => {
      if (allAvailableUsersSelected) {
        const availableIds = new Set(availableUsers.map((user) => user.id));
        return users.filter((userId) => !availableIds.has(userId));
      }

      return [...new Set([...users, ...availableUsers.map((user) => user.id)])];
    });
  };

  const toggleSyncExisting = (checked: boolean): void => {
    setSyncExisting(checked);
    if (!checked) {
      const newUserIds = new Set(
        data?.filter((user) => !user.isImported).map((user) => user.id) ?? []
      );
      setSelectedUsers((users) =>
        users.filter((userId) => newUserIds.has(userId))
      );
    }
  };

  return (
    <Modal
      loading={!data && !error}
      title={intl.formatMessage(messages.importfromJellyfin, {
        mediaServerName,
      })}
      onOk={importUsers}
      okDisabled={isImporting || selectedUsers.length === 0}
      okText={intl.formatMessage(
        isImporting ? globalMessages.importing : globalMessages.import
      )}
      onCancel={onCancel}
    >
      {settings.currentSettings.newPlexLogin && (
        <Alert
          title={intl.formatMessage(messages.newJellyfinSignInEnabled, {
            mediaServerName,
            strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
          })}
          type="info"
        />
      )}

      <div className="card-spacing-before">
        <label className="checkbox-label" htmlFor="sync-existing-users">
          <input
            id="sync-existing-users"
            data-testid="jellyfin-sync-existing"
            type="checkbox"
            checked={syncExisting}
            onChange={(event) => toggleSyncExisting(event.target.checked)}
          />{' '}
          {intl.formatMessage(messages.syncExistingUsers)}
        </label>
        <p className="label-tip">
          {intl.formatMessage(messages.syncExistingUsersHelp)}
        </p>
      </div>

      {error ? (
        <Alert
          title={intl.formatMessage(messages.failedToLoadUsers, {
            mediaServerName,
          })}
          type="error"
        />
      ) : availableUsers.length > 0 ? (
        <div className="card-spacing-before">
          <div className="app-action-row" data-action-placement="leading">
            <SelectionCircle
              data-testid="jellyfin-select-all-users"
              selected={allAvailableUsersSelected}
              partial={someAvailableUsersSelected && !allAvailableUsersSelected}
              label={intl.formatMessage(userSelectionMessages.selectAllUsers)}
              onClick={toggleAllUsers}
            />
            <span className="card-table-heading">
              {intl.formatMessage(messages.user)}
            </span>
          </div>
          <div
            className="scrollable-card"
            data-scroll-layout="portrait"
            data-testid="jellyfin-import-list"
          >
            <ul className="card-list" data-list-layout="stacked">
              {availableUsers.map((user) => (
                <li
                  key={`jellyfin-import-${user.id}`}
                  className="app-card-inset"
                  data-testid={`jellyfin-import-user-${user.id}`}
                >
                  <div className="card-title">
                    <SelectionCircle
                      data-testid={`jellyfin-select-user-${user.id}`}
                      selected={selectedUsers.includes(user.id)}
                      label={intl.formatMessage(
                        userSelectionMessages.selectUser,
                        { user: user.username }
                      )}
                      onClick={() => toggleUser(user.id)}
                    />
                    <CachedImage
                      type="avatar"
                      className="avatar-sm"
                      src={user.thumb}
                      alt=""
                      width={20}
                      height={20}
                    />
                    <span>{user.username}</span>
                  </div>
                  {syncExisting && user.isImported && (
                    <p
                      className="card-subheading"
                      data-testid={`jellyfin-user-import-status-${user.id}`}
                    >
                      {intl.formatMessage(messages.alreadyImported)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : syncExisting ? (
        <Alert
          title={intl.formatMessage(messages.noJellyfinUsersToSync, {
            mediaServerName,
          })}
          type="info"
        />
      ) : data?.some((user) => user.isImported) ? (
        <Alert
          title={intl.formatMessage(messages.allJellyfinUsersImported, {
            mediaServerName,
          })}
          type="info"
        />
      ) : (
        <Alert
          title={intl.formatMessage(messages.noJellyfinUsersToImport, {
            mediaServerName,
          })}
          type="info"
        />
      )}
    </Modal>
  );
};

export default JellyfinImportModal;

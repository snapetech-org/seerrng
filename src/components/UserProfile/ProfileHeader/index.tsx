import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import useToasts from '@app/hooks/useToasts';
import type { User } from '@app/hooks/useUser';
import { Permission, UserType, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowPathIcon,
  CogIcon,
  PencilSquareIcon,
  UserIcon,
} from '@heroicons/react/24/solid';
import axios from 'axios';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useSWRConfig } from 'swr';

const messages = defineMessages('components.UserProfile.ProfileHeader', {
  settings: 'Edit Settings',
  profile: 'View Profile',
  joindate: 'Joined {joindate}',
  userid: 'User ID: {userid}',
  editAvatar: 'Edit',
  editAvatarLabel: 'Edit profile picture',
  uploadingAvatar: 'Uploading',
  avatarUpdated: 'Profile picture updated successfully!',
  avatarUpdateFailed:
    'Something went wrong while updating the profile picture.',
  avatarFileTooLarge: 'Profile pictures must be 5 MB or smaller.',
  avatarFileUnsupported: 'Profile pictures must be JPEG, PNG, or WebP images.',
});

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface ProfileHeaderProps {
  user: User;
  isSettingsPage?: boolean;
}

const ProfileHeader = ({ user, isSettingsPage }: ProfileHeaderProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { mutate } = useSWRConfig();
  const { user: loggedInUser, hasPermission } = useUser();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const canEditAvatar =
    loggedInUser?.id === user.id && user.userType === UserType.LOCAL;

  const uploadAvatar = async (file?: File) => {
    if (!file) {
      return;
    }
    if (!AVATAR_CONTENT_TYPES.includes(file.type)) {
      addToast(intl.formatMessage(messages.avatarFileUnsupported), {
        autoDismiss: true,
        appearance: 'error',
      });
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      addToast(intl.formatMessage(messages.avatarFileTooLarge), {
        autoDismiss: true,
        appearance: 'error',
      });
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const response = await axios.put<User>(
        `/api/v1/user/${user.id}/avatar`,
        file,
        { headers: { 'Content-Type': file.type } }
      );

      await Promise.all([
        mutate(`/api/v1/user/${user.id}`, response.data, false),
        mutate('/api/v1/auth/me', response.data, false),
      ]);
      addToast(intl.formatMessage(messages.avatarUpdated), {
        autoDismiss: true,
        appearance: 'success',
      });
    } catch {
      addToast(intl.formatMessage(messages.avatarUpdateFailed), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  };

  const subtextItems: React.ReactNode[] = [
    intl.formatMessage(messages.joindate, {
      joindate: intl.formatDate(user.createdAt, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    }),
  ];

  if (hasPermission(Permission.MANAGE_REQUESTS)) {
    subtextItems.push(intl.formatMessage(messages.userid, { userid: user.id }));
  }

  return (
    <div className="relative z-40 mt-6 mb-12 lg:flex lg:items-end lg:justify-between lg:space-x-5">
      <div className="flex items-end justify-items-end space-x-5">
        <div className="flex-shrink-0">
          <div className="relative">
            <CachedImage
              type="avatar"
              className="h-24 w-24 rounded-full bg-gray-600 object-cover ring-1 ring-gray-700"
              src={user.avatar}
              alt={user.displayName}
              width={96}
              height={96}
            />
            <span
              className="absolute inset-0 rounded-full shadow-inner"
              aria-hidden="true"
            />
            {canEditAvatar && (
              <>
                <input
                  ref={avatarInputRef}
                  type="file"
                  className="sr-only"
                  accept={AVATAR_CONTENT_TYPES.join(',')}
                  onChange={(event) =>
                    void uploadAvatar(event.target.files?.[0])
                  }
                />
                <button
                  type="button"
                  className="app-button app-button-default button-standard absolute -bottom-2 left-1/2 -translate-x-1/2 gap-1 rounded-full px-2 py-0.5 text-xs shadow disabled:cursor-wait disabled:opacity-70"
                  aria-label={intl.formatMessage(messages.editAvatarLabel)}
                  disabled={isUploadingAvatar}
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {isUploadingAvatar ? (
                    <ArrowPathIcon className="animate-spin" />
                  ) : (
                    <PencilSquareIcon />
                  )}
                  <span>
                    {intl.formatMessage(
                      isUploadingAvatar
                        ? messages.uploadingAvatar
                        : messages.editAvatar
                    )}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
        <div className="pt-1.5">
          <h1 className="mb-1 flex flex-col sm:flex-row sm:items-center">
            <Link
              href={
                user.id === loggedInUser?.id ? '/profile' : `/users/${user.id}`
              }
              className="page-title"
            >
              {user.displayName}
            </Link>
            {user.email && user.displayName.toLowerCase() !== user.email && (
              <span className="text-sm text-gray-400 sm:ms-2 sm:text-lg">
                ({user.email})
              </span>
            )}
          </h1>
          <p className="text-sm font-medium text-gray-400">
            {subtextItems.reduce((prev, curr) => (
              <>
                {prev} | {curr}
              </>
            ))}
          </p>
        </div>
      </div>
      <div className="mt-6 flex flex-col-reverse justify-stretch space-y-4 space-y-reverse lg:flex-row lg:justify-end lg:space-y-0 lg:space-x-3 lg:space-x-reverse">
        {(loggedInUser?.id === user.id ||
          (user.id !== 1 && hasPermission(Permission.MANAGE_USERS))) &&
        !isSettingsPage ? (
          <Link
            href={
              loggedInUser?.id === user.id
                ? `/profile/settings`
                : `/users/${user.id}/settings`
            }
            passHref
            legacyBehavior
          >
            <Button as="a">
              <CogIcon />
              <span>{intl.formatMessage(messages.settings)}</span>
            </Button>
          </Link>
        ) : (
          isSettingsPage && (
            <Link
              href={
                loggedInUser?.id === user.id ? `/profile` : `/users/${user.id}`
              }
              passHref
              legacyBehavior
            >
              <Button as="a">
                <UserIcon />
                <span>{intl.formatMessage(messages.profile)}</span>
              </Button>
            </Link>
          )
        )}
      </div>
    </div>
  );
};

export default ProfileHeader;

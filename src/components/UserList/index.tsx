import Alert from '@app/components/Common/Alert';
import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import CachedImage from '@app/components/Common/CachedImage';
import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import Modal from '@app/components/Common/Modal';
import PageTitle from '@app/components/Common/PageTitle';
import SelectionCircle from '@app/components/Common/SelectionCircle';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import {
  CompactSelect,
  getFilterToggleButtonClass,
  type CompactSelectOption,
} from '@app/components/Discover/FilterPanel/CompactFilterSelect';
import BulkEditModal from '@app/components/UserList/BulkEditModal';
import PlexImportModal from '@app/components/UserList/PlexImportModal';
import TvSeasonWatchGateApprovalQueue from '@app/components/UserList/TvSeasonWatchGateApprovalQueue';
import useDebouncedState from '@app/hooks/useDebouncedState';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import type { User } from '@app/hooks/useUser';
import { Permission, UserType, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  isStoredOption,
  readLocalStoredRecord,
  writeLocalStoredRecord,
} from '@app/utils/localStorage';
import { Transition } from '@headlessui/react';
import {
  BarsArrowDownIcon,
  BarsArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InboxArrowDownIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  UserPlusIcon,
} from '@heroicons/react/24/solid';
import { MediaServerType, ServerType } from '@server/constants/server';
import type { PaginatedResponse } from '@server/interfaces/api/common';
import { hasPermission } from '@server/lib/permissions';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import validator from 'validator';
import * as Yup from 'yup';
import JellyfinImportModal from './JellyfinImportModal';
import userSelectionMessages from './userSelectionMessages';

const messages = defineMessages('components.UserList', {
  users: 'Users',
  userlist: 'User List',
  importfrommediaserver: 'Import {mediaServerName} Users',
  user: 'User',
  totalrequests: 'Requests',
  accounttype: 'Type',
  role: 'Role',
  created: 'Joined',
  filters: 'Filters',
  sortByHeading: 'Sort By',
  keywordSearch: 'Keyword Search',
  searchUsers: 'Search Users',
  any: 'Any',
  lastUpdated: 'Last Updated',
  sortByLastUpdated: 'Sort by last updated',
  allTypes: 'All Types',
  allRoles: 'All Roles',
  userName: 'User Name',
  noUsers: 'No users match the selected filters.',
  bulkedit: 'Bulk Edit',
  owner: 'Owner',
  admin: 'Admin',
  plexuser: 'Plex User',
  deleteuser: 'Delete User',
  userdeleted: 'User deleted successfully!',
  userdeleteerror: 'Something went wrong while deleting the user.',
  deleteconfirm:
    'Are you sure you want to delete this user? All of their request data will be permanently removed.',
  localuser: 'Local User',
  mediaServerUser: '{mediaServerName} User',
  createlocaluser: 'Create Local User',
  creating: 'Creating…',
  create: 'Create',
  validationpasswordminchars:
    'Password is too short; should be a minimum of 8 characters',
  usercreatedfailed: 'Something went wrong while creating the user.',
  usercreatedfailedexisting:
    'The provided email address is already in use by another user.',
  usercreatedsuccess: 'User created successfully!',
  username: 'Username',
  email: 'Email Address',
  password: 'Password',
  passwordsetupdescription:
    'Configure an application URL and enable email notifications to send password setup links.',
  sendpasswordsetuplink: 'Send Password Setup Link',
  sendpasswordsetuplinkTip:
    'Email a secure link that lets the user choose a password',
  validationUsername: 'You must provide an username',
  validationEmail: 'Email required',
  sortBy: 'Sort by {field}',
  sortByUser: 'Sort by username',
  sortByRequests: 'Sort by number of requests',
  sortByType: 'Sort by account type',
  sortByRole: 'Sort by user role',
  sortByJoined: 'Sort by join date',
  toggleSortDirection: 'Click again to sort {direction}',
  toggleSortDirectionAria: 'Toggle sort direction',
  ascending: 'ascending',
  descending: 'descending',
  localLoginDisabled:
    'The <strong>Enable Local Sign-In</strong> setting is currently disabled.',
  episodeQueueAdminHint:
    'Only user managers can set Episode Queue. Open a user profile, choose Episode Queue, and set the default for all of that user’s interactive TV requests.',
  moreUserFilters: 'More user filters',
  moreUserTools: 'More SeerrNG user tools',
});

type Sort =
  'created' | 'updated' | 'requests' | 'displayname' | 'usertype' | 'role';
type SortDirection = 'asc' | 'desc';
const USER_SORT_OPTIONS: readonly Sort[] = [
  'created',
  'updated',
  'requests',
  'displayname',
  'usertype',
  'role',
];
const SORT_DIRECTION_OPTIONS: readonly SortDirection[] = ['asc', 'desc'];

type ClientUserResultsResponse = PaginatedResponse & {
  results: User[];
};

const UserList = () => {
  const intl = useIntl();
  const router = useRouter();
  const upstream = useUpstreamTheme();
  const settings = useSettings();
  const { addToast } = useToasts();
  const { user: currentUser, hasPermission: currentHasPermission } = useUser();
  const [currentSort, setCurrentSort] = useState<Sort>('created');
  const [keywordSearch, debouncedKeywordSearch, setKeywordSearch] =
    useDebouncedState('', 300);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isSearchFocusedRef = useRef(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [filterSettingsHydrated, setFilterSettingsHydrated] = useState(false);

  const defaultSortDirection = (sortKey: Sort): SortDirection =>
    sortKey === 'requests' || sortKey === 'updated' ? 'desc' : 'asc';

  const [sortDirection, setSortDirection] = useState<SortDirection>(() =>
    defaultSortDirection('created')
  );

  useEffect(() => {
    const filterSettings = readLocalStoredRecord('ul-filter-settings');
    if (filterSettings) {
      if (isStoredOption(filterSettings.currentSort, USER_SORT_OPTIONS)) {
        setCurrentSort(filterSettings.currentSort);
      }
      if (
        isStoredOption(filterSettings.sortDirection, SORT_DIRECTION_OPTIONS)
      ) {
        setSortDirection(filterSettings.sortDirection);
      }
    }
    setFilterSettingsHydrated(true);
  }, []);

  useEffect(() => {
    if (filterSettingsHydrated) {
      writeLocalStoredRecord('ul-filter-settings', {
        currentSort,
        sortDirection,
      });
    }
  }, [currentSort, filterSettingsHydrated, sortDirection]);

  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<ClientUserResultsResponse>(
    `/api/v1/user?take=100&skip=0&sort=${currentSort}&sortDirection=${sortDirection}${
      debouncedKeywordSearch.trim()
        ? `&q=${encodeURIComponent(debouncedKeywordSearch.trim())}`
        : ''
    }`,
    upstream ? { keepPreviousData: true } : undefined
  );

  useEffect(() => {
    if (isSearchFocusedRef.current) {
      searchInputRef.current?.focus();
    }
  }, [data]);

  const handleSortChange = (sortKey: Sort) => {
    if (currentSort === sortKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setCurrentSort(sortKey);
      setSortDirection(defaultSortDirection(sortKey));
    }
  };

  const [isDeleting, setDeleting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    user?: User;
  }>({
    isOpen: false,
  });
  const [createModal, setCreateModal] = useState<{
    isOpen: boolean;
  }>({
    isOpen: false,
  });
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);

  const isUserPermsEditable = (userId: number) =>
    userId !== 1 && userId !== currentUser?.id;
  const getUserRole = (user: User) =>
    user.id === 1
      ? 'owner'
      : hasPermission(Permission.ADMIN, user.permissions)
        ? 'admin'
        : 'user';
  const visibleUsers = (data?.results ?? []).filter(
    (user) =>
      (typeFilter === 'all' || user.userType.toString() === typeFilter) &&
      (roleFilter === 'all' || getUserRole(user) === roleFilter)
  );
  const editableVisibleUsers = visibleUsers.filter((user) =>
    isUserPermsEditable(user.id)
  );
  const isAllUsersSelected = () => {
    return (
      editableVisibleUsers.length > 0 &&
      editableVisibleUsers.every((user) => selectedUsers.includes(user.id))
    );
  };
  const areSomeUsersSelected =
    editableVisibleUsers.some((user) => selectedUsers.includes(user.id)) &&
    !isAllUsersSelected();
  const isUserSelected = (userId: number) => selectedUsers.includes(userId);
  const toggleAllUsers = () => {
    if (isAllUsersSelected()) {
      const visibleIds = new Set(editableVisibleUsers.map((user) => user.id));
      setSelectedUsers((users) =>
        users.filter((userId) => !visibleIds.has(userId))
      );
    } else {
      setSelectedUsers((users) => [
        ...new Set([...users, ...editableVisibleUsers.map((user) => user.id)]),
      ]);
    }
  };
  const toggleUser = (userId: number) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers((users) => users.filter((u) => u !== userId));
    } else {
      setSelectedUsers((users) => [...users, userId]);
    }
  };

  const deleteUser = async () => {
    setDeleting(true);

    try {
      await axios.delete(`/api/v1/user/${deleteModal.user?.id}`);

      addToast(intl.formatMessage(messages.userdeleted), {
        autoDismiss: true,
        appearance: 'success',
      });
      setDeleteModal({ isOpen: false, user: deleteModal.user });
    } catch {
      addToast(intl.formatMessage(messages.userdeleteerror), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setDeleting(false);
      revalidate();
    }
  };

  const pendingHeading = (
    <>
      <PageTitle title={intl.formatMessage(messages.users)} />
      <div className="page-title-row">
        <h2 className="page-title">{intl.formatMessage(messages.userlist)}</h2>
      </div>
    </>
  );

  if (!data && !error) {
    return (
      <>
        {pendingHeading}
        <LoadingSpinner />
      </>
    );
  }

  const CreateUserSchema = Yup.object().shape({
    username: Yup.string().required(
      intl.formatMessage(messages.validationUsername)
    ),
    email: Yup.string()
      .required()
      .test(
        'email',
        intl.formatMessage(messages.validationEmail),
        (value) => !value || validator.isEmail(value, { require_tld: false })
      ),
    password: Yup.lazy((value) =>
      !value
        ? Yup.string()
        : Yup.string().min(
            8,
            intl.formatMessage(messages.validationpasswordminchars)
          )
    ),
  });

  if (!data) {
    return (
      <>
        {pendingHeading}
        <LoadingSpinner />
      </>
    );
  }

  const passwordGenerationEnabled =
    settings.currentSettings.applicationUrl &&
    settings.currentSettings.emailEnabled;
  const mediaServerName =
    settings.currentSettings.mediaServerType === MediaServerType.PLEX
      ? ServerType.PLEX
      : settings.currentSettings.mediaServerType === MediaServerType.EMBY
        ? ServerType.EMBY
        : ServerType.JELLYFIN;
  const typeOptions: CompactSelectOption[] = [
    { label: intl.formatMessage(messages.any), value: 'all' },
    { label: intl.formatMessage(messages.localuser), value: '2' },
    { label: intl.formatMessage(messages.plexuser), value: '1' },
    {
      label: intl.formatMessage(messages.mediaServerUser, {
        mediaServerName: ServerType.JELLYFIN,
      }),
      value: '3',
    },
    {
      label: intl.formatMessage(messages.mediaServerUser, {
        mediaServerName: ServerType.EMBY,
      }),
      value: '4',
    },
  ];
  const roleOptions: CompactSelectOption[] = [
    { label: intl.formatMessage(messages.any), value: 'all' },
    { label: intl.formatMessage(messages.owner), value: 'owner' },
    { label: intl.formatMessage(messages.admin), value: 'admin' },
    { label: intl.formatMessage(messages.user), value: 'user' },
  ];
  const sortOptions: { key: Sort; label: string }[] = [
    { key: 'created', label: intl.formatMessage(messages.created) },
    { key: 'displayname', label: intl.formatMessage(messages.userName) },
    { key: 'requests', label: intl.formatMessage(messages.totalrequests) },
    { key: 'usertype', label: intl.formatMessage(messages.accounttype) },
    { key: 'role', label: intl.formatMessage(messages.role) },
  ];
  const SortableColumnHeader = ({
    sortKey,
    children,
  }: {
    sortKey: Sort;
    children: React.ReactNode;
  }) => {
    const active = currentSort === sortKey;
    const getTooltip = () => {
      if (active) {
        return intl.formatMessage(messages.toggleSortDirection, {
          direction:
            sortDirection === 'asc'
              ? intl.formatMessage(messages.descending)
              : intl.formatMessage(messages.ascending),
        });
      }

      switch (sortKey) {
        case 'displayname':
          return intl.formatMessage(messages.sortByUser);
        case 'requests':
          return intl.formatMessage(messages.sortByRequests);
        case 'usertype':
          return intl.formatMessage(messages.sortByType);
        case 'role':
          return intl.formatMessage(messages.sortByRole);
        case 'created':
          return intl.formatMessage(messages.sortByJoined);
        default:
          return intl.formatMessage(messages.sortBy, {
            field: intl.formatMessage(messages.lastUpdated),
          });
      }
    };

    return (
      <th
        className="app-data-table-heading cursor-pointer"
        scope="col"
        tabIndex={0}
        onClick={() => handleSortChange(sortKey)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleSortChange(sortKey);
          }
        }}
        data-testid={`column-header-${sortKey}`}
        title={getTooltip()}
        aria-sort={
          active
            ? sortDirection === 'asc'
              ? 'ascending'
              : 'descending'
            : 'none'
        }
      >
        <div className="flex items-center">
          <span>{children}</span>
          {active && (
            <span className="ml-1">
              {sortDirection === 'asc' ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </span>
          )}
        </div>
      </th>
    );
  };

  return (
    <>
      <PageTitle title={intl.formatMessage(messages.users)} />
      <Transition
        as="div"

        show={deleteModal.isOpen}
      >
        <Modal
          onOk={() => deleteUser()}
          okText={
            isDeleting
              ? intl.formatMessage(globalMessages.deleting)
              : intl.formatMessage(globalMessages.delete)
          }
          okDisabled={isDeleting}
          okButtonType="danger"
          okButtonProps={{ buttonIcon: 'delete' }}
          onCancel={() =>
            setDeleteModal({ isOpen: false, user: deleteModal.user })
          }
          title={intl.formatMessage(messages.deleteuser)}
          subTitle={deleteModal.user?.username}
        >
          {intl.formatMessage(messages.deleteconfirm)}
        </Modal>
      </Transition>

      <Transition
        as="div"

        show={createModal.isOpen}
      >
        <Formik
          initialValues={{
            username: '',
            email: '',
            password: '',
            genpassword: false,
          }}
          validationSchema={CreateUserSchema}
          onSubmit={async (values) => {
            try {
              await axios.post('/api/v1/user', {
                username: values.username,
                email: values.email,
                password: values.genpassword ? null : values.password,
              });
              addToast(intl.formatMessage(messages.usercreatedsuccess), {
                appearance: 'success',
                autoDismiss: true,
              });
              setCreateModal({ isOpen: false });
            } catch (e) {
              addToast(
                intl.formatMessage(
                  e?.response?.data?.errors?.includes('USER_EXISTS')
                    ? messages.usercreatedfailedexisting
                    : messages.usercreatedfailed
                ),
                {
                  appearance: 'error',
                  autoDismiss: true,
                }
              );
            } finally {
              revalidate();
            }
          }}
        >
          {({
            errors,
            touched,
            isSubmitting,
            values,
            isValid,
            setFieldValue,
            handleSubmit,
          }) => {
            return (
              <Modal
                title={intl.formatMessage(messages.createlocaluser)}
                onOk={() => handleSubmit()}
                okText={
                  isSubmitting
                    ? intl.formatMessage(messages.creating)
                    : intl.formatMessage(messages.create)
                }
                okDisabled={isSubmitting || !isValid}
                okButtonType="primary"
                onCancel={() => setCreateModal({ isOpen: false })}
              >
                {!settings.currentSettings.localLogin && (
                  <Alert
                    title={intl.formatMessage(messages.localLoginDisabled, {
                      strong: (msg: React.ReactNode) => (
                        <strong className="font-semibold text-white">
                          {msg}
                        </strong>
                      ),
                    })}
                    type="warning"
                  />
                )}
                {currentHasPermission(Permission.ADMIN) &&
                  !passwordGenerationEnabled && (
                    <Alert
                      title={intl.formatMessage(
                        messages.passwordsetupdescription
                      )}
                      type="info"
                    />
                  )}
                <Form className="section">
                  <div className="form-row">
                    <label htmlFor="username" className="text-label">
                      {intl.formatMessage(messages.username)}
                      <span className="label-required">*</span>
                    </label>
                    <div className="form-input-area">
                      <div className="form-input-field">
                        <Field id="username" name="username" type="text" />
                      </div>
                      {errors.username &&
                        touched.username &&
                        typeof errors.username === 'string' && (
                          <div className="error">{errors.username}</div>
                        )}
                    </div>
                  </div>
                  <div className="form-row">
                    <label htmlFor="email" className="text-label">
                      {intl.formatMessage(messages.email)}
                      <span className="label-required">*</span>
                    </label>
                    <div className="form-input-area">
                      <div className="form-input-field">
                        <Field
                          id="email"
                          name="email"
                          type="text"
                          inputMode="email"
                          autoComplete="off"
                          data-form-type="other"
                          data-1pignore="true"
                          data-lpignore="true"
                          data-bwignore="true"
                        />
                      </div>
                      {errors.email &&
                        touched.email &&
                        typeof errors.email === 'string' && (
                          <div className="error">{errors.email}</div>
                        )}
                    </div>
                  </div>
                  <div
                    className={`form-row ${
                      passwordGenerationEnabled ? '' : 'opacity-50'
                    }`}
                  >
                    <label htmlFor="genpassword" className="checkbox-label">
                      {intl.formatMessage(messages.sendpasswordsetuplink)}
                      <span className="label-tip">
                        {intl.formatMessage(messages.sendpasswordsetuplinkTip)}
                      </span>
                    </label>
                    <div className="form-input-area">
                      <Field
                        type="checkbox"
                        id="genpassword"
                        name="genpassword"
                        disabled={!passwordGenerationEnabled}
                        onClick={() => setFieldValue('password', '')}
                      />
                    </div>
                  </div>
                  <div
                    className={`form-row ${
                      values.genpassword ? 'opacity-50' : ''
                    }`}
                  >
                    <label htmlFor="password" className="text-label">
                      {intl.formatMessage(messages.password)}
                      {!values.genpassword && (
                        <span className="label-required">*</span>
                      )}
                    </label>
                    <div className="form-input-area">
                      <div className="form-input-field">
                        <SensitiveInput
                          as="field"
                          id="password"
                          name="password"
                          type="password"
                          autoComplete="new-password"
                          disabled={values.genpassword}
                        />
                      </div>
                      {errors.password &&
                        touched.password &&
                        typeof errors.password === 'string' && (
                          <div className="error">{errors.password}</div>
                        )}
                    </div>
                  </div>
                </Form>
              </Modal>
            );
          }}
        </Formik>
      </Transition>

      <Transition
        as="div"

        show={showBulkEditModal}
      >
        <BulkEditModal
          onCancel={() => setShowBulkEditModal(false)}
          onComplete={() => {
            setShowBulkEditModal(false);
            revalidate();
          }}
          selectedUserIds={selectedUsers}
          users={data.results}
        />
      </Transition>

      <Transition
        as="div"

        show={showImportModal}
      >
        {settings.currentSettings.mediaServerType === MediaServerType.PLEX ? (
          <PlexImportModal
            onCancel={() => setShowImportModal(false)}
            onComplete={() => {
              setShowImportModal(false);
              revalidate();
            }}
          />
        ) : (
          <JellyfinImportModal
            onCancel={() => setShowImportModal(false)}
            onComplete={() => {
              setShowImportModal(false);
              revalidate();
            }}
          />
        )}
      </Transition>

      {upstream ? (
        <div className="flex flex-col justify-between lg:flex-row lg:items-end">
          <Header>{intl.formatMessage(messages.userlist)}</Header>
          <div className="mt-2 flex flex-grow flex-col lg:flex-grow-0 lg:flex-row">
            <div className="mb-2 flex flex-grow flex-col justify-between sm:flex-row lg:mb-0 lg:flex-grow-0">
              <Button
                className="mb-2 flex-grow sm:mr-2 sm:mb-0"
                buttonType="primary"
                onClick={() => setCreateModal({ isOpen: true })}
              >
                <UserPlusIcon />
                <span>{intl.formatMessage(messages.createlocaluser)}</span>
              </Button>
              <Button
                className="flex-grow lg:mr-2"
                buttonType="primary"
                onClick={() => setShowImportModal(true)}
              >
                <InboxArrowDownIcon />
                <span>
                  {intl.formatMessage(messages.importfrommediaserver, {
                    mediaServerName,
                  })}
                </span>
              </Button>
            </div>
            <div className="mb-2 flex flex-grow flex-col gap-2 sm:flex-row lg:mb-0 lg:flex-grow-0">
              <div className="flex flex-grow lg:flex-grow-0">
                <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-sm text-gray-100">
                  <MagnifyingGlassIcon className="h-6 w-6" />
                </span>
                <input
                  type="text"
                  className="rounded-r-only min-w-48"
                  ref={searchInputRef}
                  placeholder={intl.formatMessage(messages.searchUsers)}
                  value={keywordSearch}
                  onFocus={() => {
                    isSearchFocusedRef.current = true;
                  }}
                  onBlur={() => {
                    isSearchFocusedRef.current = false;
                  }}
                  onChange={(event) => setKeywordSearch(event.target.value)}
                  aria-label={intl.formatMessage(messages.searchUsers)}
                />
              </div>
              <div className="flex flex-grow lg:flex-grow-0">
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-sm text-gray-100"
                  onClick={() =>
                    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                  }
                  aria-label={intl.formatMessage(
                    messages.toggleSortDirectionAria
                  )}
                  title={
                    sortDirection === 'asc'
                      ? intl.formatMessage(messages.descending)
                      : intl.formatMessage(messages.ascending)
                  }
                >
                  {sortDirection === 'asc' ? (
                    <BarsArrowUpIcon className="h-6 w-6" />
                  ) : (
                    <BarsArrowDownIcon className="h-6 w-6" />
                  )}
                </button>
                <select
                  id="sort"
                  name="sort"
                  onChange={(event) =>
                    handleSortChange(event.target.value as Sort)
                  }
                  value={currentSort}
                  className="rounded-r-only"
                >
                  <option value="displayname">
                    {intl.formatMessage(messages.username)}
                  </option>
                  <option value="requests">
                    {intl.formatMessage(messages.totalrequests)}
                  </option>
                  <option value="usertype">
                    {intl.formatMessage(messages.accounttype)}
                  </option>
                  <option value="role">
                    {intl.formatMessage(messages.role)}
                  </option>
                  <option value="created">
                    {intl.formatMessage(messages.created)}
                  </option>
                  {currentSort === 'updated' && (
                    <option value="updated">
                      {intl.formatMessage(messages.lastUpdated)}
                    </option>
                  )}
                </select>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <Header>{intl.formatMessage(messages.userlist)}</Header>
      )}
      {upstream && (
        <details className="mt-4">
          <summary className="cursor-pointer py-3 text-sm font-semibold text-gray-300">
            {intl.formatMessage(messages.moreUserFilters)}
          </summary>
          <div className="app-filter-row">
            <CompactSelect
              label={intl.formatMessage(messages.accounttype)}
              value={typeFilter}
              options={typeOptions}
              onChange={setTypeFilter}
            />
            <CompactSelect
              label={intl.formatMessage(messages.role)}
              value={roleFilter}
              options={roleOptions}
              onChange={setRoleFilter}
            />
          </div>
          <button
            type="button"
            aria-pressed={currentSort === 'updated'}
            onClick={() => handleSortChange('updated')}
            className={getFilterToggleButtonClass(currentSort === 'updated')}
          >
            {intl.formatMessage(messages.sortByLastUpdated)}
            {currentSort === 'updated' && sortDirection === 'asc' ? (
              <BarsArrowUpIcon aria-hidden="true" />
            ) : (
              <BarsArrowDownIcon aria-hidden="true" />
            )}
          </button>
        </details>
      )}
      {!upstream && currentHasPermission(Permission.MANAGE_USERS) && (
        <>
          <div className="mt-5">
            <Alert
              type="info"
              title={intl.formatMessage(messages.episodeQueueAdminHint)}
            />
          </div>
          <TvSeasonWatchGateApprovalQueue />
        </>
      )}
      {upstream && currentHasPermission(Permission.MANAGE_USERS) && (
        <details className="mt-4">
          <summary className="cursor-pointer py-3 text-sm font-semibold text-gray-300">
            {intl.formatMessage(messages.moreUserTools)}
          </summary>
          <Alert
            type="info"
            title={intl.formatMessage(messages.episodeQueueAdminHint)}
          />
          <TvSeasonWatchGateApprovalQueue />
        </details>
      )}
      <article className="app-card-main refreshed-card-surface mt-5 rounded-xl border border-gray-700 p-3 shadow-lg shadow-gray-950/20">
        {!upstream && (
          <>
            <div className="text-sm text-gray-300">
              {intl.formatMessage(messages.filters)}
            </div>
            <div className="app-filter-row">
              <form
                className="discover-filter-control app-filter-search-control"
                onSubmit={(event) => event.preventDefault()}
              >
                <span className="discover-filter-control-label">
                  <MagnifyingGlassIcon aria-hidden="true" />
                  {intl.formatMessage(messages.keywordSearch)}
                </span>
                <input
                  type="search"
                  value={keywordSearch}
                  onChange={(event) => setKeywordSearch(event.target.value)}
                  placeholder={intl.formatMessage(messages.searchUsers)}
                  aria-label={intl.formatMessage(messages.searchUsers)}
                  className="app-filter-search-input"
                />
              </form>
              <CompactSelect
                label={intl.formatMessage(messages.accounttype)}
                value={typeFilter}
                options={typeOptions}
                onChange={setTypeFilter}
              />
              <CompactSelect
                label={intl.formatMessage(messages.role)}
                value={roleFilter}
                options={roleOptions}
                onChange={setRoleFilter}
              />
            </div>

            <div className="app-filter-section-heading">
              {intl.formatMessage(messages.sortByHeading)}
            </div>
            <div className="app-filter-row">
              {sortOptions.map((option) => {
                const active = currentSort === option.key;
                const Icon =
                  active && sortDirection === 'asc'
                    ? BarsArrowUpIcon
                    : BarsArrowDownIcon;
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleSortChange(option.key)}
                    className={getFilterToggleButtonClass(active)}
                  >
                    {option.label}
                    <Icon aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="app-data-table-container card-spacing-before">
          <div className="user-list-table-scroll scrollable-card overflow-auto">
            <div className="app-data-table-frame">
              <div className="overflow-hidden rounded-lg">
                <table className="app-data-table user-list-data-table">
                  <thead className="app-data-table-head">
                    <tr className="app-data-table-header-row">
                      <th
                        className={`app-data-table-heading${upstream ? '' : 'user-list-select-column'}`}
                        scope="col"
                      >
                        {editableVisibleUsers.length > 0 && (
                          <SelectionCircle
                            selected={isAllUsersSelected()}
                            partial={areSomeUsersSelected}
                            label={intl.formatMessage(
                              userSelectionMessages.selectAllUsers
                            )}
                            onClick={toggleAllUsers}
                          />
                        )}
                      </th>
                      {upstream ? (
                        <SortableColumnHeader sortKey="displayname">
                          {intl.formatMessage(messages.user)}
                        </SortableColumnHeader>
                      ) : (
                        <th
                          className="app-data-table-heading user-list-name-column"
                          scope="col"
                        >
                          {intl.formatMessage(messages.user)}
                        </th>
                      )}
                      {upstream ? (
                        <SortableColumnHeader sortKey="requests">
                          {intl.formatMessage(messages.totalrequests)}
                        </SortableColumnHeader>
                      ) : (
                        <th
                          className="app-data-table-heading user-list-requests-column text-center"
                          scope="col"
                        >
                          {intl.formatMessage(messages.totalrequests)}
                        </th>
                      )}
                      {upstream ? (
                        <SortableColumnHeader sortKey="usertype">
                          {intl.formatMessage(messages.accounttype)}
                        </SortableColumnHeader>
                      ) : (
                        <th
                          className="app-data-table-heading user-list-type-column"
                          scope="col"
                        >
                          {intl.formatMessage(messages.accounttype)}
                        </th>
                      )}
                      {upstream ? (
                        <SortableColumnHeader sortKey="role">
                          {intl.formatMessage(messages.role)}
                        </SortableColumnHeader>
                      ) : (
                        <th
                          className="app-data-table-heading user-list-role-column"
                          scope="col"
                        >
                          {intl.formatMessage(messages.role)}
                        </th>
                      )}
                      {upstream ? (
                        <SortableColumnHeader sortKey="created">
                          {intl.formatMessage(messages.created)}
                        </SortableColumnHeader>
                      ) : (
                        <th
                          className="app-data-table-heading user-list-joined-column"
                          scope="col"
                        >
                          {intl.formatMessage(messages.created)}
                        </th>
                      )}
                      <th
                        className="app-data-table-heading user-list-actions-column"
                        scope="col"
                      >
                        {upstream && visibleUsers.length > 1 && (
                          <div className="flex justify-end">
                            <Button
                              buttonType="warning"
                              onClick={() => setShowBulkEditModal(true)}
                              disabled={selectedUsers.length === 0}
                            >
                              <PencilIcon />
                              <span>
                                {intl.formatMessage(messages.bulkedit)}
                              </span>
                            </Button>
                          </div>
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="app-data-table-body">
                    {visibleUsers.map((user) => {
                      const displayName =
                        user.username ||
                        user.jellyfinUsername ||
                        user.plexUsername ||
                        user.email;
                      return (
                        <tr
                          key={`user-list-${user.id}`}
                          className="app-data-table-row"
                          data-testid="user-list-row"
                        >
                          <td
                            className={
                              upstream
                                ? 'app-data-table-cell'
                                : 'app-data-table-cell user-list-select-column'
                            }
                          >
                            {isUserPermsEditable(user.id) && (
                              <SelectionCircle
                                selected={isUserSelected(user.id)}
                                label={intl.formatMessage(
                                  userSelectionMessages.selectUser,
                                  { user: displayName }
                                )}
                                onClick={() => toggleUser(user.id)}
                              />
                            )}
                          </td>
                          <td className="app-data-table-cell">
                            <div
                              className={
                                upstream
                                  ? 'flex min-w-0 items-center'
                                  : 'flex min-w-0 items-center gap-2'
                              }
                            >
                              <Link
                                href={`/users/${user.id}`}
                                className={
                                  upstream
                                    ? 'h-10 w-10 flex-shrink-0'
                                    : 'h-8 w-8 flex-shrink-0'
                                }
                              >
                                <CachedImage
                                  type="avatar"
                                  className={`${upstream ? 'h-10 w-10' : 'h-8 w-8'} rounded-full object-cover`}
                                  src={user.avatar}
                                  alt=""
                                  width={upstream ? 40 : 32}
                                  height={upstream ? 40 : 32}
                                />
                              </Link>
                              <div
                                className={
                                  upstream ? 'ml-4 min-w-0' : 'min-w-0'
                                }
                              >
                                <Link
                                  href={`/users/${user.id}`}
                                  className={
                                    upstream
                                      ? 'block truncate text-base leading-5 font-bold transition duration-300 hover:underline'
                                      : 'block truncate text-xs leading-4 font-semibold transition duration-300 hover:underline'
                                  }
                                  data-testid="user-list-username-link"
                                >
                                  {displayName}
                                </Link>
                                {(
                                  user.username ||
                                  user.jellyfinUsername ||
                                  user.plexUsername
                                )?.toLowerCase() !== user.email && (
                                  <div
                                    className={
                                      upstream
                                        ? 'truncate text-sm leading-5 text-gray-300'
                                        : 'refreshed-detail-text-muted truncate text-xs leading-4'
                                    }
                                  >
                                    {user.email}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td
                            className={
                              upstream
                                ? 'app-data-table-cell'
                                : 'app-data-table-cell text-center'
                            }
                          >
                            {user.id === currentUser?.id ||
                            currentHasPermission(
                              [
                                Permission.MANAGE_REQUESTS,
                                Permission.REQUEST_VIEW,
                              ],
                              { type: 'or' }
                            ) ? (
                              <Link
                                href={`/users/${user.id}/requests`}
                                className="text-sm leading-5 transition duration-300 hover:underline"
                              >
                                {user.requestCount}
                              </Link>
                            ) : (
                              user.requestCount
                            )}
                          </td>
                          <td
                            className={
                              upstream
                                ? 'app-data-table-cell text-end'
                                : 'app-data-table-cell'
                            }
                          >
                            {user.userType === UserType.PLEX ? (
                              <Badge badgeType="warning">
                                {intl.formatMessage(messages.plexuser)}
                              </Badge>
                            ) : user.userType === UserType.LOCAL ? (
                              <Badge badgeType="default">
                                {intl.formatMessage(messages.localuser)}
                              </Badge>
                            ) : user.userType === UserType.EMBY ? (
                              <Badge badgeType="success">
                                {intl.formatMessage(messages.mediaServerUser, {
                                  mediaServerName: ServerType.EMBY,
                                })}
                              </Badge>
                            ) : user.userType === UserType.JELLYFIN ? (
                              <Badge badgeType="default">
                                {intl.formatMessage(messages.mediaServerUser, {
                                  mediaServerName: ServerType.JELLYFIN,
                                })}
                              </Badge>
                            ) : null}
                          </td>
                          <td className="app-data-table-cell">
                            {user.id === 1
                              ? intl.formatMessage(messages.owner)
                              : hasPermission(
                                    Permission.ADMIN,
                                    user.permissions
                                  )
                                ? intl.formatMessage(messages.admin)
                                : intl.formatMessage(messages.user)}
                          </td>
                          <td className="app-data-table-cell">
                            {intl.formatDate(user.createdAt, {
                              year: 'numeric',
                              month: upstream ? 'long' : 'short',
                              day: 'numeric',
                            })}
                          </td>
                          <td className="app-data-table-cell">
                            <div
                              className={
                                upstream
                                  ? 'grid grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-2'
                                  : 'flex justify-end gap-[5px]'
                              }
                            >
                              <Button
                                buttonType="warning"
                                buttonSize={upstream ? undefined : 'standard'}
                                disabled={
                                  user.id === 1 && currentUser?.id !== 1
                                }
                                onClick={() =>
                                  router.push(
                                    '/users/[userId]/settings',
                                    `/users/${user.id}/settings`
                                  )
                                }
                              >
                                {intl.formatMessage(globalMessages.edit)}
                              </Button>
                              <Button
                                buttonType="danger"
                                buttonSize={upstream ? undefined : 'standard'}
                                disabled={
                                  user.id === 1 ||
                                  (currentUser?.id !== 1 &&
                                    hasPermission(
                                      Permission.ADMIN,
                                      user.permissions
                                    ))
                                }
                                onClick={() =>
                                  setDeleteModal({ isOpen: true, user })
                                }
                              >
                                {intl.formatMessage(globalMessages.delete)}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {visibleUsers.length === 0 && (
                      <tr className="app-data-table-row">
                        <td
                          className="app-data-table-cell text-center"
                          colSpan={7}
                        >
                          {intl.formatMessage(messages.noUsers)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {!upstream && (
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button
              buttonType="primary"
              buttonSize="standard"
              onClick={() => setCreateModal({ isOpen: true })}
            >
              <UserPlusIcon />
              <span>{intl.formatMessage(messages.createlocaluser)}</span>
            </Button>
            <Button
              buttonType="primary"
              buttonSize="standard"
              onClick={() => setShowImportModal(true)}
            >
              <InboxArrowDownIcon />
              <span>
                {intl.formatMessage(messages.importfrommediaserver, {
                  mediaServerName,
                })}
              </span>
            </Button>
            <Button
              buttonType="warning"
              buttonSize="standard"
              onClick={() => setShowBulkEditModal(true)}
              disabled={selectedUsers.length === 0}
            >
              <PencilIcon />
              <span>{intl.formatMessage(messages.bulkedit)}</span>
            </Button>
          </div>
        )}
      </article>
    </>
  );
};

export default UserList;

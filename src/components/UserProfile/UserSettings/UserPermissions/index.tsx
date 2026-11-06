import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import PermissionEdit from '@app/components/PermissionEdit';
import useToasts from '@app/hooks/useToasts';
import { getPositiveQueryParamNumber } from '@app/hooks/useUpdateQueryParams';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownOnSquareIcon } from '@heroicons/react/24/outline';
import type { ServiceCommonServer } from '@server/interfaces/api/serviceInterfaces';
import axios from 'axios';
import { Form, Formik } from 'formik';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages(
  'components.UserProfile.UserSettings.UserPermissions',
  {
    toastSettingsSuccess: 'Permissions saved successfully!',
    toastSettingsFailure: 'Something went wrong while saving settings.',
    permissions: 'Permissions',
    unauthorizedDescription: 'You cannot modify your own permissions.',
    requestServices: 'Request destinations',
    requestServicesDescription:
      'Let this user choose additional Radarr or Sonarr instances when requesting media.',
    contentRestriction: 'Age gate',
    contentRestrictionDescription:
      'Restricted accounts cannot see or request Adult content, and mature movies, series, and tagged titles in other categories are hidden.',
    contentRestrictionDefault: 'Use instance default',
    contentRestrictionOn: 'Restricted (kid account)',
    contentRestrictionOff: 'Unrestricted',
    requestServiceGrantDescription: 'Available when requesting {mediaType}.',
  }
);

const UserPermissions = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const router = useRouter();
  const { user: currentUser } = useUser();
  const userId = getPositiveQueryParamNumber(router.query.userId);
  const { user, revalidate: revalidateUser } = useUser({
    id: userId,
  });
  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<{
    permissions?: number;
    requestServices?: string[];
    contentRestricted?: boolean | null;
  }>(user ? `/api/v1/user/${user?.id}/settings/permissions` : null);
  const { data: radarrServers } = useSWR<ServiceCommonServer[]>(
    user ? '/api/v1/service/radarr' : null
  );
  const { data: sonarrServers } = useSWR<ServiceCommonServer[]>(
    user ? '/api/v1/service/sonarr' : null
  );
  const requestServiceOptions = [
    ...(radarrServers ?? [])
      .filter((server) => server.requestButtonLabel && !server.isDefault)
      .map((server) => ({
        key: `radarr:${server.id}`,
        label: `${server.requestButtonLabel} (${server.name})`,
        mediaType: 'movies',
      })),
    ...(sonarrServers ?? [])
      .filter((server) => server.requestButtonLabel && !server.isDefault)
      .map((server) => ({
        key: `sonarr:${server.id}`,
        label: `${server.requestButtonLabel} (${server.name})`,
        mediaType: 'series',
      })),
  ];
  const configuredRequestServiceKeys = new Set([
    ...(radarrServers ?? []).map((server) => `radarr:${server.id}`),
    ...(sonarrServers ?? []).map((server) => `sonarr:${server.id}`),
  ]);

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={500} />;
  }

  if (currentUser?.id !== 1 && currentUser?.id === user?.id) {
    return (
      <>
        <div className="mb-6">
          <h3 className="heading">
            {intl.formatMessage(messages.permissions)}
          </h3>
        </div>
        <Alert
          title={intl.formatMessage(messages.unauthorizedDescription)}
          type="error"
        />
      </>
    );
  }

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.permissions),
          intl.formatMessage(globalMessages.usersettings),
          user?.displayName,
        ]}
      />
      <div className="mb-6">
        <h3 className="heading">{intl.formatMessage(messages.permissions)}</h3>
      </div>
      <Formik
        initialValues={{
          currentPermissions: data?.permissions,
          requestServices: data?.requestServices ?? [],
          contentRestricted:
            data?.contentRestricted === true
              ? 'on'
              : data?.contentRestricted === false
                ? 'off'
                : 'default',
        }}
        enableReinitialize
        onSubmit={async (values) => {
          try {
            await axios.post(`/api/v1/user/${user?.id}/settings/permissions`, {
              permissions: values.currentPermissions ?? 0,
              contentRestricted:
                values.contentRestricted === 'on'
                  ? true
                  : values.contentRestricted === 'off'
                    ? false
                    : null,
              ...(radarrServers && sonarrServers
                ? {
                    requestServices: values.requestServices.filter((service) =>
                      configuredRequestServiceKeys.has(service)
                    ),
                  }
                : {}),
            });

            addToast(intl.formatMessage(messages.toastSettingsSuccess), {
              autoDismiss: true,
              appearance: 'success',
            });
          } catch {
            addToast(intl.formatMessage(messages.toastSettingsFailure), {
              autoDismiss: true,
              appearance: 'error',
            });
          } finally {
            revalidate();
            revalidateUser();
          }
        }}
      >
        {({ isSubmitting, setFieldValue, values }) => {
          return (
            <Form className="section">
              <div className="max-w-3xl">
                <PermissionEdit
                  actingUser={currentUser}
                  currentUser={user}
                  currentPermission={values.currentPermissions ?? 0}
                  onUpdate={(newPermission) =>
                    setFieldValue('currentPermissions', newPermission)
                  }
                />
                <div className="form-row">
                  <label htmlFor="contentRestricted" className="text-label">
                    {intl.formatMessage(messages.contentRestriction)}
                    <span className="label-tip">
                      {intl.formatMessage(
                        messages.contentRestrictionDescription
                      )}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <select
                      id="contentRestricted"
                      name="contentRestricted"
                      value={values.contentRestricted}
                      onChange={(event) =>
                        setFieldValue('contentRestricted', event.target.value)
                      }
                    >
                      <option value="default">
                        {intl.formatMessage(messages.contentRestrictionDefault)}
                      </option>
                      <option value="on">
                        {intl.formatMessage(messages.contentRestrictionOn)}
                      </option>
                      <option value="off">
                        {intl.formatMessage(messages.contentRestrictionOff)}
                      </option>
                    </select>
                  </div>
                </div>
                {requestServiceOptions.length > 0 && (
                  <div>
                    <h4 className="heading">
                      {intl.formatMessage(messages.requestServices)}
                    </h4>
                    <p className="settings-form-row-description">
                      {intl.formatMessage(messages.requestServicesDescription)}
                    </p>
                    <div>
                      {requestServiceOptions.map((service) => (
                        <div className="form-row" key={service.key}>
                          <label
                            htmlFor={`request-service-${service.key}`}
                            className="checkbox-label"
                          >
                            {service.label}
                          </label>
                          <div className="form-input-area">
                            <input
                              type="checkbox"
                              id={`request-service-${service.key}`}
                              checked={values.requestServices.includes(
                                service.key
                              )}
                              onChange={(event) => {
                                const nextServices = new Set(
                                  values.requestServices
                                );
                                if (event.target.checked) {
                                  nextServices.add(service.key);
                                } else {
                                  nextServices.delete(service.key);
                                }
                                setFieldValue(
                                  'requestServices',
                                  [...nextServices].sort()
                                );
                              }}
                            />
                          </div>
                          <span className="settings-form-row-description">
                            {intl.formatMessage(
                              messages.requestServiceGrantDescription,
                              { mediaType: service.mediaType }
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="actions">
                <div className="flex justify-end">
                  <span className="ms-3 inline-flex rounded-md shadow-sm">
                    <Button
                      buttonType="primary"
                      type="submit"
                      disabled={isSubmitting}
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
    </>
  );
};

export default UserPermissions;

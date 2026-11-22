import { Link } from 'react-router-dom';
import DefaultRequestQuotas, {
  type DefaultQuotas,
} from '../components/DefaultRequestQuotas';
import DefaultUserPermissions from '../components/DefaultUserPermissions';
import { ServiceNote } from '../components/extra';
import { InstanceRequestSettings } from '../components/InstanceRequestSettings';
import { useApi } from '../hooks';
import { useLumenLocale } from '../i18n';

// Request rules, quotas and the permissions new accounts start with, in one place.
export default function AdminRequestDefaults() {
  const { t } = useLumenLocale();
  const settings = useApi<{
    defaultQuotas?: DefaultQuotas;
    defaultPermissions?: number;
  }>('/settings/main');
  const permissions = settings.data?.defaultPermissions;
  return (
    <>
      <header className="ph">
        <h1>
          {t('lumen.adminGeneral.requestDefaults.title', 'Request Defaults')}
        </h1>
        <div className="toolbar">
          <Link className="btn btn-quiet btn-sm" to="/admin">
            {t('lumen.admin.title', 'Administration')}
          </Link>
          <Link className="btn btn-quiet btn-sm" to="/admin/users">
            {t('lumen.adminUsers.title', 'Users')}
          </Link>
          <Link className="btn btn-quiet btn-sm" to="/admin/categories">
            {t('lumen.adminGeneral.mediaCategories', 'Media Categories')}
          </Link>
        </div>
      </header>
      <ServiceNote
        error={settings.error}
        what={t('lumen.adminGeneral.requestSettings.what', 'request settings')}
        retry={settings.reload}
      />
      <InstanceRequestSettings
        anchorReady={Boolean(settings.data || settings.error)}
      />
      {settings.data?.defaultQuotas && (
        <DefaultRequestQuotas
          initial={settings.data.defaultQuotas}
          showPermissionsLink={typeof permissions === 'number'}
        />
      )}
      {typeof permissions === 'number' &&
        Number.isSafeInteger(permissions) &&
        permissions >= 0 && <DefaultUserPermissions initial={permissions} />}
    </>
  );
}

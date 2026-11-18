import { useRef, useState } from 'react';
import { api } from '../api';
import { friendlyError } from '../errors';
import { useApi } from '../hooks';
import { permissionOptions } from '../permissionOptions';
import { ConfirmSheet } from './ConfirmSheet';
import { ServiceNote } from './extra';

interface RequestService {
  id: number;
  name: string;
  isDefault: boolean;
  requestButtonLabel?: string;
}

export default function ManagedPermissions({
  id,
  name,
  actorId,
  actorPermissions,
  onSaved,
}: {
  id: number;
  name: string;
  actorId: number;
  actorPermissions: number;
  onSaved: () => void;
}) {
  const path = `/user/${id}/settings/permissions`;
  const { data, error, reload } = useApi<{
    permissions: number;
    requestServices?: string[];
    contentRestricted?: boolean | null;
  }>(path);
  const radarr = useApi<RequestService[]>('/service/radarr');
  const sonarr = useApi<RequestService[]>('/service/sonarr');
  const [services, setServices] = useState<string[]>();
  const [restriction, setRestriction] = useState<
    'default' | 'restricted' | 'unrestricted'
  >();
  const [draft, setDraft] = useState<bigint>();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const working = useRef(false);
  const saved = BigInt(data?.permissions ?? 0);
  const current = draft ?? saved;
  const held = BigInt(actorPermissions);
  const admin = (held & 2n) !== 0n;
  const targetAdmin = (current & 2n) !== 0n;
  const editable = !!data && (admin || (saved & ~held) === 0n);

  const configured = { radarr: radarr.data, sonarr: sonarr.data };
  const serviceKeys = Object.entries(configured).flatMap(([type, entries]) =>
    (entries ?? []).map((service) => `${type}:${service.id}`)
  );
  const available = Object.entries(configured).flatMap(([type, entries]) =>
    (entries ?? [])
      .filter((service) => service.requestButtonLabel && !service.isDefault)
      .map((service) => ({
        key: `${type}:${service.id}`,
        label: `${service.requestButtonLabel} (${service.name})`,
      }))
  );
  const savedServices = data?.requestServices ?? [];
  const selectedServices = services ?? savedServices;
  const servicesChanged =
    !!radarr.data &&
    !!sonarr.data &&
    !!services &&
    (services.length !== savedServices.length ||
      services.some((service) => !savedServices.includes(service)));
  const savedRestriction =
    data?.contentRestricted == null
      ? 'default'
      : data.contentRestricted
        ? 'restricted'
        : 'unrestricted';
  const selectedRestriction = restriction ?? savedRestriction;
  const changed =
    current !== saved ||
    servicesChanged ||
    selectedRestriction !== savedRestriction;

  async function save() {
    if (!editable || !changed || working.current) return;
    working.current = true;
    setBusy(true);
    setFailure('');
    setNotice('');
    try {
      await api(path, {
        method: 'POST',
        body: JSON.stringify({
          permissions: Number(current),
          ...(servicesChanged && {
            requestServices: selectedServices
              .filter((service) => serviceKeys.includes(service))
              .sort(),
          }),
          ...(selectedRestriction !== savedRestriction && {
            contentRestricted:
              selectedRestriction === 'default'
                ? null
                : selectedRestriction === 'restricted',
          }),
        }),
      });
      setDraft(undefined);
      setServices(undefined);
      setRestriction(undefined);
      setNotice('Permissions saved.');
      reload();
      onSaved();
    } catch (error) {
      setFailure(friendlyError(error, 'Could not save permissions.'));
    } finally {
      setBusy(false);
      setConfirm(false);
      working.current = false;
    }
  }

  return (
    <div>
      <ServiceNote error={error} what="permissions" retry={reload} />
      {!data && !error && (
        <p className="note" role="status">
          Loading permissions…
        </p>
      )}
      {failure && (
        <p className="note" role="alert">
          {failure}
        </p>
      )}
      {notice && (
        <p className="note" role="status">
          {notice}
        </p>
      )}
      {data && (
        <details open>
          <summary>Explicit Permissions</summary>
          {!editable && (
            <p className="note">
              This account has permissions outside your delegated access.
            </p>
          )}
          {targetAdmin && (
            <p className="note">Administrators have all permissions.</p>
          )}
          <div
            className="setlist"
            role="group"
            aria-label="Explicit Permissions"
          >
            {permissionOptions.map(([bit, label]) => {
              const checked = (current & bit) !== 0n;
              const disabled =
                busy ||
                !editable ||
                (bit === 2n && actorId !== 1) ||
                (!admin && (held & bit) === 0n) ||
                (bit !== 2n && targetAdmin);
              return (
                <label className="set" key={label}>
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) => {
                      setNotice('');
                      setDraft(
                        event.target.checked ? current | bit : current & ~bit
                      );
                    }}
                  />
                </label>
              );
            })}
          </div>
          <div className="toolbar">
            <label className="sel">
              <span className="lbl">Age Gate</span>
              <select
                value={selectedRestriction}
                disabled={busy || !editable}
                onChange={(event) =>
                  setRestriction(
                    event.target.value as typeof selectedRestriction
                  )
                }
              >
                <option value="default">Use Server Default</option>
                <option value="restricted">Restricted</option>
                <option value="unrestricted">Unrestricted</option>
              </select>
            </label>
          </div>
          <ServiceNote
            error={radarr.error}
            what="Radarr destinations"
            retry={radarr.reload}
          />
          <ServiceNote
            error={sonarr.error}
            what="Sonarr destinations"
            retry={sonarr.reload}
          />
          {!!radarr.data && !!sonarr.data && !!available.length && (
            <div
              className="setlist"
              role="group"
              aria-label="Request Destinations"
            >
              {available.map(({ key, label }) => (
                <label className="set" key={key}>
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={selectedServices.includes(key)}
                    disabled={busy || !editable}
                    onChange={(event) => {
                      setServices(
                        event.target.checked
                          ? [...selectedServices, key]
                          : selectedServices.filter((entry) => entry !== key)
                      );
                    }}
                  />
                </label>
              ))}
            </div>
          )}
          <div className="toolbar">
            <button
              className="btn btn-tonal btn-sm"
              disabled={busy || !editable || !changed}
              onClick={() => setConfirm(true)}
            >
              Save Permissions
            </button>
          </div>
        </details>
      )}
      {confirm && (
        <ConfirmSheet
          title={`Save permissions for ${name}?`}
          body="The new permissions take effect immediately."
          confirm="Save Permissions"
          cancel="Go Back"
          busy={busy}
          onConfirm={() => void save()}
          onClose={() => {
            if (!working.current) setConfirm(false);
          }}
        />
      )}
    </div>
  );
}

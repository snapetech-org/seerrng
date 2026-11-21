import { useLumenLocale } from '../i18n';

const notificationEvents = [
  [
    2,
    'components.NotificationTypeSelector.mediarequested',
    'Request awaiting approval',
  ],
  [4, 'components.NotificationTypeSelector.mediaapproved', 'Request approved'],
  [8, 'components.NotificationTypeSelector.mediaavailable', 'Media available'],
  [16, 'components.NotificationTypeSelector.mediafailed', 'Request failed'],
  [64, 'components.NotificationTypeSelector.mediadeclined', 'Request declined'],
  [
    128,
    'components.NotificationTypeSelector.mediaAutoApproved',
    'Request automatically approved',
  ],
  [256, 'components.NotificationTypeSelector.issuecreated', 'Issue reported'],
  [
    512,
    'components.NotificationTypeSelector.issuecomment',
    'Issue comment added',
  ],
  [1024, 'components.NotificationTypeSelector.issueresolved', 'Issue resolved'],
  [2048, 'components.NotificationTypeSelector.issuereopened', 'Issue reopened'],
  [
    4096,
    'components.NotificationTypeSelector.mediaautorequested',
    'Media automatically requested',
  ],
  [
    8192,
    'components.NotificationTypeSelector.softwareavailable',
    'Software available',
  ],
  [
    16384,
    'components.NotificationTypeSelector.softwareStatus',
    'Software request status changed',
  ],
  [
    32768,
    'components.NotificationTypeSelector.mediaPendingUpdated',
    'Pending request updated',
  ],
] as const;

export const defaultMask = 65534; // Native default includes all current bits and the test bit.

export function EventChoices({
  mask,
  enabledMask = defaultMask,
  disabled,
  change,
}: {
  mask: number;
  enabledMask?: number;
  disabled: boolean;
  change: (mask: number) => void;
}) {
  const { t } = useLumenLocale();
  return (
    <div className="setlist">
      {notificationEvents
        .filter(([bit]) => (enabledMask & bit) !== 0)
        .map(([bit, key, fallback]) => (
          <label key={bit} className="set cfg-row">
            <b>{t(key, fallback)}</b>
            <input
              type="checkbox"
              disabled={disabled}
              checked={(BigInt(mask) & BigInt(bit)) !== 0n}
              onChange={() => change(Number(BigInt(mask) ^ BigInt(bit)))}
            />
          </label>
        ))}
    </div>
  );
}

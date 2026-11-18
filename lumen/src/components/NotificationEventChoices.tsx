const notificationEvents = [
  [2, 'Request awaiting approval'],
  [4, 'Request approved'],
  [8, 'Media available'],
  [16, 'Request failed'],
  [64, 'Request declined'],
  [128, 'Request automatically approved'],
  [256, 'Issue reported'],
  [512, 'Issue comment added'],
  [1024, 'Issue resolved'],
  [2048, 'Issue reopened'],
  [4096, 'Media automatically requested'],
  [8192, 'Software available'],
  [16384, 'Software request status changed'],
  [32768, 'Pending request updated'],
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
  return (
    <div className="setlist">
      {notificationEvents
        .filter(([bit]) => (enabledMask & bit) !== 0)
        .map(([bit, label]) => (
          <label key={bit} className="set cfg-row">
            <b>{label}</b>
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

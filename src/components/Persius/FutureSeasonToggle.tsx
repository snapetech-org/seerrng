import { useId } from 'react';
import { useIntl } from 'react-intl';
import messages from './messages';

export default function FutureSeasonToggle({
  checked,
  disabled = false,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const intl = useIntl();
  const descriptionId = useId();
  return (
    <label className="persius-future-seasons">
      <span>
        <strong>{intl.formatMessage(messages.futureSeasons)}</strong>
        <small id={descriptionId}>
          {intl.formatMessage(
            disabled
              ? messages.futureSeasonsManaged
              : messages.futureSeasonsHint
          )}
        </small>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={descriptionId}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

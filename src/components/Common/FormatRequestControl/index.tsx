import Tooltip from '@app/components/Common/Tooltip';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import UpstreamRequestControl from './UpstreamRequestControl';

const messages = defineMessages('components.Common.FormatRequestControl', {
  request: 'Request',
});

export interface FormatRequestOption {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  selected?: boolean;
  description?: string;
}

interface FormatRequestControlProps {
  options: FormatRequestOption[];
  className?: string;
  label?: string;
  icon?: ReactNode;
}

const FormatRequestControl = ({
  options,
  className,
  label,
  icon,
}: FormatRequestControlProps) => {
  const intl = useIntl();
  const upstream = useUpstreamTheme();

  if (options.length === 0) {
    return null;
  }

  if (upstream)
    return (
      <UpstreamRequestControl
        options={options}
        label={label ?? intl.formatMessage(messages.request)}
        icon={icon ?? <ArrowDownTrayIcon aria-hidden="true" />}
        className={className}
      />
    );

  if (options.length === 1) {
    const [option] = options;
    const button = (
      <button
        type="button"
        data-testid="format-request-control"
        disabled={option.disabled}
        title={option.disabled ? option.disabledReason : undefined}
        onClick={option.onClick}
        className={`format-request-control format-request-control-single ${className ?? ''}`}
      >
        <span className="format-request-single-label">
          {icon ?? <ArrowDownTrayIcon aria-hidden="true" />}
          {label ?? intl.formatMessage(messages.request)}
          <span
            data-format-request-part="option-label"
            data-testid={`format-request-option-${option.id}`}
          >
            {option.label}
          </span>
        </span>
      </button>
    );

    return option.disabled && option.disabledReason ? (
      <Tooltip content={option.disabledReason}>
        <span data-format-request-part="disabled-option-wrapper">{button}</span>
      </Tooltip>
    ) : (
      button
    );
  }

  return (
    <div
      className={`format-request-control ${className ?? ''}`}
      data-testid="format-request-control"
      role="group"
      aria-label={label ?? intl.formatMessage(messages.request)}
    >
      <span className="format-request-label">
        {icon ?? <ArrowDownTrayIcon aria-hidden="true" />}
        {label ?? intl.formatMessage(messages.request)}
      </span>
      {options.map((option) => {
        const button = (
          <button
            key={option.id}
            type="button"
            data-testid={`format-request-option-${option.id}`}
            disabled={option.disabled}
            aria-pressed={option.selected}
            data-button-help={option.description}
            data-disabled-reason={
              option.disabled ? option.disabledReason : undefined
            }
            onClick={option.onClick}
            className="format-request-option"
          >
            {option.label}
          </button>
        );

        return option.disabled && option.disabledReason ? (
          <Tooltip key={option.id} content={option.disabledReason}>
            <span data-format-request-part="disabled-option-wrapper">
              {button}
            </span>
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
};

export default FormatRequestControl;

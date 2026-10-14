import Dropdown from '@app/components/Common/Dropdown';
import globalMessages from '@app/i18n/globalMessages';
import { withProperties } from '@app/utils/typeHelpers';
import { Menu, MenuButton } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/24/solid';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import { useIntl } from 'react-intl';

type ButtonWithDropdownProps = {
  text: React.ReactNode;
  dropdownIcon?: React.ReactNode;
  buttonType?: 'primary' | 'ghost' | 'success' | 'detailRequest' | 'playback';
  buttonSize?: 'standard' | 'default' | 'sm';
  disabledReason?: string;
} & (
  | ({ as?: 'button' } & ButtonHTMLAttributes<HTMLButtonElement>)
  | ({ as: 'a' } & AnchorHTMLAttributes<HTMLAnchorElement>)
);

const ButtonWithDropdown = ({
  text,
  children,
  dropdownIcon,
  className,
  buttonType = 'primary',
  buttonSize = 'standard',
  disabledReason,
  ...props
}: ButtonWithDropdownProps) => {
  const intl = useIntl();
  const isSmall = buttonSize === 'sm';
  const buttonTypeClassNames = {
    primary: 'app-button-primary',
    ghost: 'app-button-ghost',
    success: 'app-button-success',
    detailRequest: 'app-button-detail-request',
    playback: 'app-button-playback',
  };
  const sharedClasses = `app-button ${buttonTypeClassNames[buttonType]} ${
    isSmall ? 'button-sm' : 'button-standard'
  }`;

  const TriggerElement = props.as ?? 'button';
  const disabled = props.as !== 'a' && props.disabled === true;
  const disabledTitle = disabled
    ? (disabledReason ?? 'This action is unavailable in the current state.')
    : props.title;

  return (
    <Menu
      as="div"
      className="app-dropdown"
      data-dropdown-segmented={!!children}
    >
      <TriggerElement
        type="button"
        className={`${sharedClasses} ${className ?? ''}`}
        data-dropdown-part="main"
        {...(props as Record<string, string>)}
        data-button-help={props.title}
        data-disabled-reason={disabled ? disabledTitle : undefined}
        title={undefined}
      >
        {text}
      </TriggerElement>
      {children && (
        <span data-dropdown-part="toggle-slot">
          <MenuButton
            type="button"
            disabled={disabled}
            className={sharedClasses}
            data-dropdown-part="toggle"
            aria-label={intl.formatMessage(globalMessages.expand)}
            data-disabled-reason={disabled ? disabledTitle : undefined}
          >
            {dropdownIcon ? dropdownIcon : <ChevronDownIcon />}
          </MenuButton>
          <Dropdown.Items>{children}</Dropdown.Items>
        </span>
      )}
    </Menu>
  );
};
export default withProperties(ButtonWithDropdown, { Item: Dropdown.Item });

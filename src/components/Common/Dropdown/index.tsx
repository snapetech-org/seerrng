import { withProperties } from '@app/utils/typeHelpers';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/24/solid';
import {
  useRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
} from 'react';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';

type DropdownButtonType =
  'primary' | 'ghost' | 'success' | 'detailRequest' | 'playback';

interface DropdownItemProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  buttonType?: DropdownButtonType;
}

const DropdownItem = ({
  children,
  buttonType = 'primary',
  ...props
}: DropdownItemProps) => {
  const upstream = useUpstreamTheme();
  const upstreamButtonType = buttonType === 'ghost' ? 'ghost' : 'primary';

  return (
    <MenuItem>
      <a
        className={`app-dropdown-item${upstream ? ' button-md' : ''}`}
        data-dropdown-presentation={upstream ? 'upstream' : undefined}
        data-dropdown-type={upstream ? upstreamButtonType : buttonType}
        {...props}
      >
        {children}
      </a>
    </MenuItem>
  );
};

type DropdownItemsProps = HTMLAttributes<HTMLDivElement> & {
  dropdownType?: 'primary' | 'ghost';
};

const DropdownItems = ({
  children,
  className,
  dropdownType = 'primary',
  ...props
}: DropdownItemsProps) => {
  const upstream = useUpstreamTheme();

  return (
    <MenuItems
      transition
      className={['app-dropdown-menu', className].join(' ')}
      data-dropdown-presentation={upstream ? 'upstream' : undefined}
      data-dropdown-type={dropdownType}
      {...props}
    >
      <div>{children}</div>
    </MenuItems>
  );
};

interface DropdownProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  text: React.ReactNode;
  dropdownIcon?: React.ReactNode;
  buttonType?: DropdownButtonType;
  buttonSize?: 'default' | 'md' | 'sm';
  disabledReason?: string;
}

const Dropdown = ({
  text,
  children,
  dropdownIcon,
  className,
  buttonType = 'primary',
  buttonSize = 'md',
  disabledReason,
  title,
  ...props
}: DropdownProps) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const upstream = useUpstreamTheme();
  const buttonTypeClassNames: Record<DropdownButtonType, string> = {
    primary: 'app-button-primary',
    ghost: 'app-button-ghost',
    success: 'app-button-success',
    detailRequest: 'app-button-detail-request',
    playback: 'app-button-playback playback-dropdown-trigger',
  };
  const upstreamButtonTypeClassNames: Record<DropdownButtonType, string> = {
    primary: 'app-button-primary',
    ghost: 'app-button-ghost',
    success: 'app-button-success',
    detailRequest: 'app-button-primary',
    playback: 'app-button-success',
  };
  const upstreamButtonType = buttonType === 'ghost' ? 'ghost' : 'primary';
  const buttonTypeClassName = upstream
    ? upstreamButtonTypeClassNames[buttonType]
    : buttonTypeClassNames[buttonType];
  const buttonSizeClass = buttonSize === 'sm' ? 'button-sm' : 'button-md';

  return (
    <Menu
      as="div"
      className="app-dropdown"
      data-dropdown-presentation={upstream ? 'upstream' : undefined}
    >
      <MenuButton
        type="button"
        className={[
          'app-button',
          buttonTypeClassName,
          buttonSizeClass,
          className,
        ].join(' ')}
        ref={buttonRef}
        disabled={!children}
        data-dropdown-part="trigger"
        data-button-help={title}
        data-disabled-reason={!children ? disabledReason : undefined}
        title={
          upstream
            ? !children || props.disabled
              ? disabledReason ?? title
              : title
            : undefined
        }
        {...props}
      >
        <span>{text}</span>
        {children && (dropdownIcon ? dropdownIcon : <ChevronDownIcon />)}
      </MenuButton>
      {children && (
        <DropdownItems dropdownType={upstreamButtonType}>
          {children}
        </DropdownItems>
      )}
    </Menu>
  );
};
export default withProperties(Dropdown, {
  Item: DropdownItem,
  Items: DropdownItems,
});

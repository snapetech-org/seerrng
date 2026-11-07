import Button from '@app/components/Common/Button';
import Tooltip from '@app/components/Common/Tooltip';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import type { ReactNode } from 'react';
import type { FormatRequestOption } from './index';

/** Original split-button flow, using the same already-authorized format actions. */
export default function UpstreamRequestControl({
  options,
  label,
  icon,
  className,
}: {
  options: FormatRequestOption[];
  label: string;
  icon: ReactNode;
  className?: string;
}) {
  const primary = options.find((option) => !option.disabled) ?? options[0];
  return (
    <Menu
      as="div"
      className={`upstream-request-control ${className ?? ''}`}
      data-testid="format-request-control"
    >
      <Button
        buttonType="primary"
        disabled={primary.disabled}
        disabledReason={primary.disabledReason}
        onClick={primary.onClick}
        data-testid={`format-request-option-${primary.id}`}
      >
        {icon}
        <span>
          {label}
          {primary.id !== 'hd' &&
          primary.id !== 'standard' &&
          primary.id !== '4k'
            ? ` · ${primary.label}`
            : ''}
        </span>
      </Button>
      {options.length > 1 && (
        <>
          <MenuButton
            className="app-button app-button-primary button-standard app-button-icon-only"
            aria-label={label}
          >
            <ChevronDownIcon aria-hidden="true" />
          </MenuButton>
          <MenuItems anchor="bottom end" className="upstream-request-options">
            {options.map((option) => (
              <MenuItem key={option.id} disabled={option.disabled}>
                <button
                  type="button"
                  onClick={option.onClick}
                  disabled={option.disabled}
                  data-testid={`format-request-menu-option-${option.id}`}
                >
                  <Tooltip
                    content={
                      option.disabled
                        ? option.disabledReason
                        : option.description
                    }
                  >
                    <span>
                      {label} · {option.label}
                    </span>
                  </Tooltip>
                </button>
              </MenuItem>
            ))}
          </MenuItems>
        </>
      )}
    </Menu>
  );
}

import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { ForwardedRef, JSX } from 'react';
import React from 'react';
import buttonStyles from './Button.module.css';

export type ButtonType =
  | 'default'
  | 'primary'
  | 'danger'
  | 'warning'
  | 'externalService'
  | 'success'
  | 'blocklist'
  | 'manage'
  | 'reportIssue'
  | 'association'
  | 'prowlarr'
  | 'bulkRequest'
  | 'detailRequest'
  | 'trailer'
  | 'playback'
  | 'ghost';

// Helper type to override types (overrides onClick)
type MergeElementProps<
  T extends React.ElementType,
  P extends Record<string, unknown>,
> = Omit<React.ComponentProps<T>, keyof P> & P;

type ElementTypes = 'button' | 'a';

type Element<P extends ElementTypes = 'button'> = P extends 'a'
  ? HTMLAnchorElement
  : HTMLButtonElement;

type BaseProps<P> = {
  buttonType?: ButtonType;
  buttonSize?: 'standard' | 'default' | 'lg' | 'md' | 'sm';
  /** Explains a state-based disabled action in the shared styled tooltip. */
  disabledReason?: string;
  buttonIcon?: 'cancel' | 'browse' | 'delete' | 'retry';
  /** Uses shared square geometry for an action with only an icon. */
  iconOnly?: boolean;
  // Had to do declare this manually as typescript would assume e was of type any otherwise
  onClick?: (
    e: React.MouseEvent<P extends 'a' ? HTMLAnchorElement : HTMLButtonElement>
  ) => void;
};

export type ButtonProps<P extends React.ElementType> = {
  as?: P;
} & MergeElementProps<P, BaseProps<P>>;

const buttonTypeStyles: Record<ButtonType, string> = {
  default: 'app-button-default',
  primary: 'app-button-primary',
  danger: 'app-button-danger',
  warning: 'app-button-warning',
  externalService: 'app-button-external-service',
  success: 'app-button-success',
  blocklist: 'app-button-blocklist',
  manage: 'app-button-manage',
  reportIssue: 'app-button-report-issue',
  association: 'app-button-association',
  prowlarr: 'app-button-prowlarr',
  bulkRequest: 'app-button-bulk-request',
  detailRequest: 'app-button-detail-request',
  trailer: 'app-button-trailer',
  playback: 'app-button-playback',
  ghost: 'app-button-ghost',
};

const buttonSizeStyles: Record<
  NonNullable<BaseProps<unknown>['buttonSize']>,
  string
> = {
  standard: 'button-standard',
  default: 'button-standard',
  md: 'button-md',
  sm: 'button-sm',
  lg: 'button-lg',
};

function Button<P extends ElementTypes = 'button'>(
  {
    buttonType = 'default',
    buttonSize = 'standard',
    as,
    children,
    className,
    disabledReason,
    buttonIcon,
    iconOnly = false,
    ...props
  }: ButtonProps<P>,
  ref?: React.Ref<Element<P>>
): JSX.Element {
  const upstream = useUpstreamTheme();
  const buttonStyle = [
    'app-button',
    buttonTypeStyles[buttonType],
    buttonSizeStyles[buttonSize],
    iconOnly && 'app-button-icon-only',
    className,
    buttonStyles.button,
  ]
    .filter(Boolean)
    .join(' ');

  if (as === 'a') {
    return (
      <a
        className={buttonStyle}
        {...(props as React.ComponentProps<'a'>)}
        data-button-icon={buttonIcon}
        data-button-help={props.title}
        title={
          upstream ? (props as React.ComponentProps<'a'>).title : undefined
        }
        ref={ref as ForwardedRef<HTMLAnchorElement>}
      >
        <span>
          {buttonIcon === 'cancel' && <XMarkIcon aria-hidden="true" />}
          {buttonIcon === 'delete' && <TrashIcon aria-hidden="true" />}
          {buttonIcon === 'retry' && <ArrowPathIcon aria-hidden="true" />}
          {buttonIcon === 'browse' && (
            <MagnifyingGlassIcon aria-hidden="true" />
          )}
          {children}
        </span>
      </a>
    );
  } else {
    const buttonProps = props as React.ComponentProps<'button'>;
    const disabledTitle = buttonProps.disabled
      ? (disabledReason ?? 'This action is unavailable in the current state.')
      : buttonProps.title;

    return (
      <button
        className={buttonStyle}
        {...buttonProps}
        data-button-icon={buttonIcon}
        data-button-help={buttonProps.title}
        data-disabled-reason={disabledTitle}
        title={upstream ? buttonProps.title : undefined}
        ref={ref as ForwardedRef<HTMLButtonElement>}
      >
        <span>
          {buttonIcon === 'cancel' && <XMarkIcon aria-hidden="true" />}
          {buttonIcon === 'delete' && <TrashIcon aria-hidden="true" />}
          {buttonIcon === 'retry' && <ArrowPathIcon aria-hidden="true" />}
          {buttonIcon === 'browse' && (
            <MagnifyingGlassIcon aria-hidden="true" />
          )}
          {children}
        </span>
      </button>
    );
  }
}

export default React.forwardRef(Button) as typeof Button;
